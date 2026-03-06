/**
 * Database migration v5: entityRegistry table for sanitization pseudonyms.
 *
 * Adds the entityRegistry table used by the sanitization pipeline to persist
 * entity-to-pseudonym mappings across sessions. The compound index
 * [normalizedText+category] enables efficient lookups by text+category combo.
 *
 * Phase 14: SNTZ-01 — persistent entity registry for PII pseudonymization.
 */

import type { BinderDB } from '../db';

/**
 * Apply the v5 schema migration to the BinderDB instance.
 *
 * Must be called in the BinderDB constructor after applyV4Migration(this).
 * Dexie processes versions sequentially; never skip version numbers.
 */
export function applyV5Migration(db: BinderDB): void {
  db.version(5).stores({
    atoms:          '&id, type, status, sectionId, sectionItemId, updated_at, *links, *tags, context, aiSourced',
    inbox:          '&id, created_at',
    changelog:      '&id, atomId, timestamp, lamportClock',
    sections:       '&id, type',
    sectionItems:   '&id, sectionId, name, archived',
    config:         '&key',
    savedFilters:   '&id, name',
    interactions:   '&id, type, ts',
    entityRegistry: '&id, [normalizedText+category], category',
  });
}
