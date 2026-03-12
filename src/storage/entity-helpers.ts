/**
 * Entity registry CRUD with dedup and alias resolution.
 *
 * findOrCreateEntity is the main entry point: it normalizes entity names,
 * matches against existing entities of the same type, and either links to
 * an existing entity or creates a new one.
 *
 * Phase 29 additions:
 * - correctRelationship(): user-correction with confidence 1.0 ground truth
 * - getEntityTimeline(): atomIds mentioning entity, ordered by recency
 * - findHighestConfidenceRelation(): prefers user-corrections over inferred
 *
 * Pure module: imports db and matcher only.
 *
 * Phase 26: SIDE-02 (stubs)
 * Phase 27: ENTR-04 (full dedup)
 * Phase 29: ENTC-02, ENTC-05
 */

import { db } from './db';
import type { Entity, EntityRelation } from '../types/intelligence';
import { getMatcherForType } from '../entity/entity-matcher';
import { AUTO_MERGE_THRESHOLD, MERGE_CANDIDATE_THRESHOLD } from '../entity/types';
import { getIntelligence } from './atom-intelligence';

/**
 * Create a new entity in the registry.
 * Generates a UUID and persists to Dexie.
 * Returns the generated entity ID.
 */
export async function createEntity(entity: Omit<Entity, 'id'>): Promise<string> {
  const id = crypto.randomUUID();
  const record: Entity = { ...entity, id };
  await db.entities.put(record);
  return id;
}

/**
 * Find an entity by its canonical name.
 * Returns undefined if no entity with that name exists.
 */
export async function findEntityByName(name: string): Promise<Entity | undefined> {
  return db.entities.where('canonicalName').equals(name).first();
}

/**
 * Create a new entity relation.
 * Generates a UUID and persists to Dexie.
 * Returns the generated relation ID.
 */
export async function createRelation(relation: Omit<EntityRelation, 'id'>): Promise<string> {
  const id = crypto.randomUUID();
  const record: EntityRelation = { ...relation, id };
  await db.entityRelations.put(record);
  return id;
}

/**
 * Find or create an entity in the registry with dedup.
 *
 * Uses the type-specific matcher to normalize names and compute match scores.
 * - Score >= AUTO_MERGE_THRESHOLD (0.9): link to existing, add alias if new
 * - Score >= MERGE_CANDIDATE_THRESHOLD (0.7): link to existing (conservative auto-merge)
 * - Score < 0.7: create new entity
 *
 * Returns the entity ID (existing or new).
 *
 * Phase 27: ENTR-04
 */
export async function findOrCreateEntity(
  text: string,
  type: 'PER' | 'LOC' | 'ORG',
): Promise<string> {
  const matcher = getMatcherForType(type);
  const allOfType = await db.entities.where('type').equals(type).toArray();

  let bestScore = 0;
  let bestEntity: Entity | null = null;

  for (const entity of allOfType) {
    const score = matcher.matchScore(text, entity);
    if (score > bestScore) {
      bestScore = score;
      bestEntity = entity;
    }
  }

  // High or medium confidence match: link to existing entity
  if (bestScore >= MERGE_CANDIDATE_THRESHOLD && bestEntity) {
    const now = Date.now();
    const normalizedText = matcher.normalize(text);
    const existingAliases = bestEntity.aliases.map((a) => matcher.normalize(a));
    const canonicalNorm = matcher.normalize(bestEntity.canonicalName);

    // Add text as alias if it's a new form
    const isNewAlias = normalizedText !== canonicalNorm &&
      !existingAliases.includes(normalizedText);

    await db.entities.update(bestEntity.id, {
      mentionCount: bestEntity.mentionCount + 1,
      lastSeen: now,
      updatedAt: now,
      version: bestEntity.version + 1,
      ...(isNewAlias ? { aliases: [...bestEntity.aliases, text] } : {}),
    });

    return bestEntity.id;
  }

  // No match: create new entity
  const now = Date.now();
  return createEntity({
    canonicalName: text,
    type,
    aliases: [],
    mentionCount: 1,
    firstSeen: now,
    lastSeen: now,
    version: 1,
    deviceId: '',
    updatedAt: now,
  });
}

/**
 * Decrement the mention count for an entity, keeping minimum 0.
 */
export async function decrementEntityMentionCount(entityId: string): Promise<void> {
  const entity = await db.entities.get(entityId);
  if (!entity) return;

  await db.entities.update(entityId, {
    mentionCount: Math.max(0, entity.mentionCount - 1),
    updatedAt: Date.now(),
    version: entity.version + 1,
  });
}

/**
 * Save a user correction for an entity relationship.
 *
 * Creates a new EntityRelation with confidence 1.0 and sourceAttribution
 * 'user-correction'. Removes any existing inferred relations for the same
 * entity+type pair (to prevent contradictory relations).
 *
 * Uses '[SELF]' as sourceEntityId per Phase 28 convention for implicit
 * self-relationships (user is always the anchor).
 *
 * Phase 29: ENTC-02
 */
export async function correctRelationship(
  entityId: string,
  correctType: string,
  atomId: string,
): Promise<void> {
  const now = Date.now();

  // Remove existing inferred relations for this entity+type pair
  const existing = await db.entityRelations
    .where('targetEntityId')
    .equals(entityId)
    .filter((r) => r.relationshipType === correctType && r.sourceAttribution !== 'user-correction')
    .toArray();

  for (const rel of existing) {
    await db.entityRelations.delete(rel.id);
  }

  // Also check source direction
  const existingSource = await db.entityRelations
    .where('sourceEntityId')
    .equals(entityId)
    .filter((r) => r.relationshipType === correctType && r.sourceAttribution !== 'user-correction')
    .toArray();

  for (const rel of existingSource) {
    await db.entityRelations.delete(rel.id);
  }

  // Create user-correction relation
  const correctionId = crypto.randomUUID();
  const correction: EntityRelation = {
    id: correctionId,
    sourceEntityId: '[SELF]',
    targetEntityId: entityId,
    relationshipType: correctType,
    confidence: 1.0,
    sourceAttribution: 'user-correction',
    evidence: [{ atomId, snippet: 'user-correction from atom ' + atomId, timestamp: now }],
    version: 1,
    deviceId: '',
    updatedAt: now,
  };

  await db.entityRelations.put(correction);
}

/**
 * Get all atom IDs that mention a specific entity, ordered by recency descending.
 *
 * Queries atomIntelligence sidecars where entityMentions includes the given
 * entityId. Falls back to Dexie .filter() since there's no direct index on
 * nested entity IDs.
 *
 * Phase 29: ENTC-05
 */
export async function getEntityTimeline(entityId: string): Promise<string[]> {
  const allIntel = await db.atomIntelligence
    .filter((intel) => intel.entityMentions.some((m) => m.entityId === entityId))
    .toArray();

  if (allIntel.length === 0) return [];

  // Fetch atom timestamps for sorting
  const atomIds = allIntel.map((i) => i.atomId);
  const atoms = await db.atoms.where('id').anyOf(atomIds).toArray();
  const tsMap = new Map<string, number>();
  for (const atom of atoms) {
    tsMap.set(atom.id, atom.created_at ?? 0);
  }

  // Sort by createdAt descending (most recent first)
  return atomIds.sort((a, b) => (tsMap.get(b) ?? 0) - (tsMap.get(a) ?? 0));
}

/**
 * Find the highest-confidence relation for an entity, given entity text.
 *
 * Looks up entity by canonicalName or alias, then finds all relations
 * where it is source or target. Prefers user-corrections (confidence 1.0)
 * over inferred relations. Returns null if no qualifying relation >= 0.6
 * confidence exists.
 *
 * Phase 29: ENTC-04 (semantic sanitization support)
 */
export async function findHighestConfidenceRelation(
  entityText: string,
): Promise<EntityRelation | null> {
  const normalized = entityText.toLowerCase().trim();

  // Find entity by canonicalName or alias
  const allEntities = await db.entities.toArray();
  const entity = allEntities.find((e) => {
    if (e.canonicalName.toLowerCase() === normalized) return true;
    return e.aliases.some((a) => a.toLowerCase() === normalized);
  });

  if (!entity) return null;

  // Find all relations involving this entity
  const [asTarget, asSource] = await Promise.all([
    db.entityRelations.where('targetEntityId').equals(entity.id).toArray(),
    db.entityRelations.where('sourceEntityId').equals(entity.id).toArray(),
  ]);

  const all = [...asTarget, ...asSource];
  if (all.length === 0) return null;

  // Sort: user-corrections first, then by confidence descending
  const sorted = all.sort((a, b) => {
    const aIsCorrection = a.sourceAttribution === 'user-correction' ? 1 : 0;
    const bIsCorrection = b.sourceAttribution === 'user-correction' ? 1 : 0;
    if (aIsCorrection !== bIsCorrection) return bIsCorrection - aIsCorrection;
    return b.confidence - a.confidence;
  });

  const best = sorted[0];
  if (!best) return null;

  // Return if confidence qualifies (user-corrections always qualify)
  if (best.sourceAttribution === 'user-correction' || best.confidence >= 0.6) {
    return best;
  }

  return null;
}

/**
 * Clean up entity mentions for a deleted atom.
 *
 * Reads the atomIntelligence sidecar, decrements mentionCount for each
 * linked entity, then deletes the sidecar row.
 *
 * Phase 27: ENTD-02
 */
export async function cleanupEntityMentionsForAtom(atomId: string): Promise<void> {
  const intel = await getIntelligence(atomId);
  if (!intel) return;

  // Decrement mention counts for all linked entities
  for (const mention of intel.entityMentions) {
    if (mention.entityId) {
      await decrementEntityMentionCount(mention.entityId);
    }
  }

  // Delete the sidecar row
  await db.atomIntelligence.delete(atomId);
}
