/**
 * Entity registry CRUD with dedup and alias resolution.
 *
 * findOrCreateEntity is the main entry point: it normalizes entity names,
 * matches against existing entities of the same type, and either links to
 * an existing entity or creates a new one.
 *
 * Pure module: imports db and matcher only.
 *
 * Phase 26: SIDE-02 (stubs)
 * Phase 27: ENTR-04 (full dedup)
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
