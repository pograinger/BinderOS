/**
 * Database migration v4: analysis atom type support.
 *
 * No index changes required — the existing `type` index on atoms already
 * covers the new 'analysis' type value. No upgrade() callback needed since
 * new analysis atoms will be created with correct fields from the start and
 * existing atoms don't need migration.
 *
 * Phase 6: AIGN-01 — establishes the data foundation for review briefings.
 * The analysis atom type stores briefing results as first-class atoms so
 * they are persistent, queryable, and reversible (AI mutations are additive).
 */

import type { BinderDB } from '../db';

/**
 * Apply the v4 schema migration to the BinderDB instance.
 *
 * Must be called in the BinderDB constructor after applyV3Migration(this).
 * Dexie processes versions sequentially; never skip version numbers.
 *
 * No index changes — analysis atoms use the existing type index.
 */
export function applyV4Migration(db: BinderDB): void {
  db.version(4).stores({
    atoms:        '&id, type, status, sectionId, sectionItemId, updated_at, *links, *tags, context, aiSourced',
    inbox:        '&id, created_at',
    changelog:    '&id, atomId, timestamp, lamportClock',
    sections:     '&id, type',
    sectionItems: '&id, sectionId, name, archived',
    config:       '&key',
    savedFilters: '&id, name',
    interactions: '&id, type, ts',
  });
}
