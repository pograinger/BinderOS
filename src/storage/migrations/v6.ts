/**
 * Database migration v6: entityGraph table for entity-relationship storage.
 *
 * Adds the entityGraph table used by the clarification system (and future
 * decomposition, similarity, GTD context sources) to store entity relationships.
 * The compound index [sourceAtomId+entityType] enables efficient queries for
 * "all outcomes for atom X" or "all deadlines for atom X".
 *
 * Phase 19: CLAR-08 — entity graph Dexie table.
 */

import type { BinderDB } from '../db';

/**
 * Apply the v6 schema migration to the BinderDB instance.
 *
 * Must be called in the BinderDB constructor after applyV5Migration(this).
 * Dexie processes versions sequentially; never skip version numbers.
 */
export function applyV6Migration(db: BinderDB): void {
  db.version(6).stores({
    atoms:          '&id, type, status, sectionId, sectionItemId, updated_at, *links, *tags, context, aiSourced',
    inbox:          '&id, created_at',
    changelog:      '&id, atomId, timestamp, lamportClock',
    sections:       '&id, type',
    sectionItems:   '&id, sectionId, name, archived',
    config:         '&key',
    savedFilters:   '&id, name',
    interactions:   '&id, type, ts',
    entityRegistry: '&id, [normalizedText+category], category',
    entityGraph:    '&id, sourceAtomId, [sourceAtomId+entityType], entityType, relationship',
  });
}
