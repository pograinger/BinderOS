/**
 * Persistent entity-to-pseudonym registry backed by Dexie.
 *
 * Pure module — functions operate on the Dexie table via the db singleton.
 * Provides consistent pseudonym mappings across sessions: once "John Smith"
 * is assigned <Person 1>, it stays <Person 1> forever.
 *
 * Phase 14: SNTZ-01 — entity registry for pseudonymization.
 * Phase 29: ENTC-04 — semantic sanitization tags ([SPOUSE], [DENTIST], etc.)
 */

import { db } from '../../storage/db';
import type { EntityCategory, DetectedEntity, EntityRegistryEntry } from './types';
import { findHighestConfidenceRelation } from '../../storage/entity-helpers';

/**
 * Capitalize the first letter of a category for display in pseudonym tags.
 * PERSON -> Person, LOCATION -> Location, etc.
 */
function formatCategory(category: EntityCategory): string {
  return category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
}

/**
 * Look up or create a pseudonym for the given entity text and category.
 *
 * If a matching entry exists (by normalizedText + category), updates lastSeenAt
 * and returns the existing pseudonymId. Otherwise, assigns the next available ID
 * for that category and creates a new entry.
 *
 * @returns The pseudonymId and formatted tag (e.g., "<Person 12>")
 */
export async function getOrCreatePseudonym(
  realText: string,
  category: EntityCategory,
): Promise<{ pseudonymId: number; tag: string }> {
  const normalizedText = realText.toLowerCase().trim();

  // Look up existing entry by compound index [normalizedText+category]
  const existing = await db.entityRegistry
    .where('[normalizedText+category]')
    .equals([normalizedText, category])
    .first();

  if (existing) {
    // Update lastSeenAt
    await db.entityRegistry.update(existing.id, { lastSeenAt: Date.now() });
    return {
      pseudonymId: existing.pseudonymId,
      tag: `<${formatCategory(category)} ${existing.pseudonymId}>`,
    };
  }

  // Find the max pseudonymId for this category to assign the next one
  const maxEntry = await db.entityRegistry
    .where('category')
    .equals(category)
    .reverse()
    .sortBy('pseudonymId');

  const nextId = maxEntry.length > 0 ? (maxEntry[0]!.pseudonymId + 1) : 1;

  const entry: EntityRegistryEntry = {
    id: crypto.randomUUID(),
    realText,
    normalizedText,
    category,
    pseudonymId: nextId,
    restorePreference: false,
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
  };

  await db.entityRegistry.add(entry);

  return {
    pseudonymId: nextId,
    tag: `<${formatCategory(category)} ${nextId}>`,
  };
}

/**
 * Build bidirectional pseudonym maps for a list of detected entities.
 *
 * For each entity, gets or creates a persistent pseudonym. Builds:
 * - entityMap: pseudonym tag -> real text (for de-pseudonymization)
 * - reverseMap: real text -> pseudonym tag (for replacement during sanitization)
 *
 * Entities with restorePreference=true are excluded from both maps
 * (they stay unredacted in the sanitized output).
 *
 * @param entities - Detected entities to build maps for
 * @returns Bidirectional maps for sanitization and de-sanitization
 */
export async function buildEntityMap(
  entities: DetectedEntity[],
): Promise<{ entityMap: Map<string, string>; reverseMap: Map<string, string> }> {
  const entityMap = new Map<string, string>();
  const reverseMap = new Map<string, string>();

  for (const entity of entities) {
    // Check restore preference — if true, skip this entity
    const shouldRestore = await getRestorePreference(entity.text, entity.category);
    if (shouldRestore) continue;

    const { tag } = await getOrCreatePseudonym(entity.text, entity.category);

    entityMap.set(tag, entity.text);
    reverseMap.set(entity.text, tag);
  }

  return { entityMap, reverseMap };
}

/**
 * Build bidirectional pseudonym maps with semantic relationship tags for PER entities.
 *
 * For PER entities with a known high-confidence relationship (user-correction or
 * inferred >= 0.6), uses [RELATIONSHIP_TYPE] tag (uppercase, square brackets)
 * instead of <Person N> pseudonym. This gives cloud AI semantic context while
 * protecting identity: "Pam" becomes [SPOUSE] rather than <Person 1>.
 *
 * For PER entities without a known relationship, falls back to existing pseudonym.
 * For non-PER entities (LOC, ORG, CONTACT, etc.), uses existing pseudonym logic.
 * User-corrected relationships (sourceAttribution='user-correction') always take
 * precedence over inferred relations.
 *
 * Tag format: [SPOUSE], [DENTIST], [BOSS], [FRIEND], [COLLEAGUE] — uppercase
 * relationship type in square brackets, distinct from angle-bracket pseudonyms.
 *
 * Phase 29: ENTC-04
 */
export async function buildEntityMapWithRelationships(
  entities: DetectedEntity[],
): Promise<{ entityMap: Map<string, string>; reverseMap: Map<string, string> }> {
  const entityMap = new Map<string, string>();
  const reverseMap = new Map<string, string>();

  for (const entity of entities) {
    // Check restore preference — if true, skip this entity
    const shouldRestore = await getRestorePreference(entity.text, entity.category);
    if (shouldRestore) continue;

    let tag: string;

    // For PERSON entities, try semantic relationship tag first
    if (entity.category === 'PERSON') {
      const relation = await findHighestConfidenceRelation(entity.text);
      if (relation) {
        // Use uppercase relationship type in square brackets
        tag = `[${relation.relationshipType.toUpperCase().replace(/-/g, '_')}]`;
      } else {
        // Fall back to pseudonym
        const result = await getOrCreatePseudonym(entity.text, entity.category);
        tag = result.tag;
      }
    } else {
      // Non-PER entities: use existing pseudonym logic
      const result = await getOrCreatePseudonym(entity.text, entity.category);
      tag = result.tag;
    }

    entityMap.set(tag, entity.text);
    reverseMap.set(entity.text, tag);
  }

  return { entityMap, reverseMap };
}

/**
 * Look up whether the user wants a specific entity restored (not redacted).
 *
 * @returns true if the entity should be left unredacted, false otherwise
 */
export async function getRestorePreference(
  realText: string,
  category: EntityCategory,
): Promise<boolean> {
  const normalizedText = realText.toLowerCase().trim();
  const entry = await db.entityRegistry
    .where('[normalizedText+category]')
    .equals([normalizedText, category])
    .first();

  return entry?.restorePreference ?? false;
}

/**
 * Set the restore preference for a specific entity.
 *
 * @param realText - Original entity text
 * @param category - Entity category
 * @param restore - true to leave unredacted, false to redact
 */
export async function setRestorePreference(
  realText: string,
  category: EntityCategory,
  restore: boolean,
): Promise<void> {
  const normalizedText = realText.toLowerCase().trim();
  const entry = await db.entityRegistry
    .where('[normalizedText+category]')
    .equals([normalizedText, category])
    .first();

  if (entry) {
    await db.entityRegistry.update(entry.id, { restorePreference: restore });
  }
}
