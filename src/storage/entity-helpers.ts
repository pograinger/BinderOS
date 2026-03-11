/**
 * Entity and relation CRUD stubs for Phase 27.
 *
 * Minimal helpers that prove the entities and entityRelations tables work.
 * Full entity detection, dedup, and relation inference come in Phases 27-28.
 *
 * Pure module: imports db only.
 *
 * Phase 26: SIDE-02
 */

import { db } from './db';
import type { Entity, EntityRelation } from '../types/intelligence';

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
