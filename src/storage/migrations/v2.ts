/**
 * Database migration v2: Tags, context, savedFilters, and interactions.
 *
 * Extends the atoms index to include multi-entry tags and context fields
 * for efficient tag/context filtering queries without full table scans.
 * Adds savedFilters table for persisted filter configurations (NAV-07).
 * Adds interactions table for interaction event logging (search/filter/click).
 *
 * The upgrade() callback ensures all existing atoms gain the new fields
 * with safe defaults (empty tags array, null context) so no atom is left
 * in an invalid state after migration.
 */

import type { BinderDB } from '../db';

/**
 * Apply the v2 schema migration to the BinderDB instance.
 *
 * Must be called in the BinderDB constructor after the version(1) block.
 * Dexie processes versions sequentially; never skip version numbers.
 *
 * Index changes:
 * - atoms: adds `*tags` (multi-entry index for efficient tag queries)
 *           adds `context` (plain index for GTD context filtering)
 * - savedFilters: new table with unique id + name index
 * - interactions: new table with unique id, type, and ts indexes
 */
export function applyV2Migration(db: BinderDB): void {
  db.version(2)
    .stores({
      // Full atoms index string — must re-specify unchanged tables in same version call
      atoms:        '&id, type, status, sectionId, sectionItemId, updated_at, *links, *tags, context',
      inbox:        '&id, created_at',
      changelog:    '&id, atomId, timestamp, lamportClock',
      sections:     '&id, type',
      sectionItems: '&id, sectionId, name, archived',
      config:       '&key',
      // Phase 3 new tables
      savedFilters: '&id, name',
      interactions: '&id, type, ts',
    })
    .upgrade((tx) => {
      // Migrate existing atoms to include new fields with safe defaults
      return tx
        .table('atoms')
        .toCollection()
        .modify((atom) => {
          if (!atom.tags) atom.tags = [];
          if (atom.context === undefined) atom.context = null;
        });
    });
}
