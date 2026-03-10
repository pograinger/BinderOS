/**
 * Database migration v7: provenance bitmask + maturity fields on atoms/inbox.
 *
 * Adds non-indexed fields to atoms and inbox items:
 * - provenance (number, default 0): 32-bit bitmask tracking which AI models contributed
 * - maturityScore (number, default 0, InboxItem only): 0-1 enrichment completeness ratio
 * - maturityFilled (string[], default [], InboxItem only): list of filled enrichment categories
 *
 * These are schemaless fields (no index changes needed) -- Dexie stores them
 * automatically alongside indexed fields. Existing records without these fields
 * will return undefined, handled by Zod .default() on the schema side.
 *
 * Phase 24: ENRICH-03, ENRICH-04
 */

import type { BinderDB } from '../db';

/**
 * Apply the v7 schema migration to the BinderDB instance.
 *
 * Must be called in the BinderDB constructor after applyV6Migration(this).
 * Dexie processes versions sequentially; never skip version numbers.
 */
export function applyV7Migration(db: BinderDB): void {
  // No new indexes needed -- provenance, maturityScore, maturityFilled are
  // non-indexed fields stored schemalessly by Dexie. The version bump is
  // required so Dexie knows the schema has evolved.
  db.version(7).stores({});
}
