/**
 * Database migration v3: AI-sourced atom tagging.
 *
 * Extends the atoms index to include aiSourced field for efficient
 * querying of AI-classified atoms without full table scans.
 *
 * Phase 5: AI triage pipeline requires atoms to be tagged as AI-sourced
 * (AIUX-05). The upgrade() callback sets aiSourced: false on all existing
 * atoms so they are cleanly queryable from the start.
 *
 * Index changes:
 * - atoms: adds `aiSourced` (plain index for AI-sourced atom queries)
 *
 * The upgrade() callback ensures all existing atoms gain the aiSourced
 * field with a safe default (false) so no atom is left in an invalid state.
 */

import type { BinderDB } from '../db';

/**
 * Apply the v3 schema migration to the BinderDB instance.
 *
 * Must be called in the BinderDB constructor after the version(2) block.
 * Dexie processes versions sequentially; never skip version numbers.
 *
 * Index changes:
 * - atoms: adds `aiSourced` (plain index for AI-sourced atom filtering)
 */
export function applyV3Migration(db: BinderDB): void {
  db.version(3)
    .stores({
      // Full atoms index string — must re-specify unchanged tables in same version call
      atoms:        '&id, type, status, sectionId, sectionItemId, updated_at, *links, *tags, context, aiSourced',
      inbox:        '&id, created_at',
      changelog:    '&id, atomId, timestamp, lamportClock',
      sections:     '&id, type',
      sectionItems: '&id, sectionId, name, archived',
      config:       '&key',
      // Phase 3 tables (unchanged)
      savedFilters: '&id, name',
      interactions: '&id, type, ts',
    })
    .upgrade((tx) => {
      // Migrate existing atoms to include aiSourced: false as a safe default
      // so existing atoms are cleanly queryable (no undefined in the index)
      return tx
        .table('atoms')
        .toCollection()
        .modify((atom) => {
          if (atom.aiSourced === undefined) atom.aiSourced = false;
        });
    });
}
