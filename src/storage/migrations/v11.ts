/**
 * Database migration v11: binderIntelligence table.
 *
 * Schema changes (additive-only — no existing tables modified):
 * - binderIntelligence: stores latest EII snapshot per binder (one row per binder)
 *
 * Primary key: &binderId (unique binder identifier)
 * Secondary index: updatedAt (enables recency queries)
 *
 * No .upgrade() needed — this is a new empty table.
 * Full-recompute strategy: each EII update overwrites the existing row.
 *
 * Phase 37: EII-01
 */

import type { BinderDB } from '../db';

/**
 * Apply the v11 schema migration to the BinderDB instance.
 *
 * Must be called in the BinderDB constructor after applyV10Migration(this).
 * Dexie processes versions sequentially; never skip version numbers.
 */
export function applyV11Migration(db: BinderDB): void {
  db.version(11).stores({
    // EII snapshot: one row per binder, overwritten on each update
    // updatedAt index enables recency queries and CRDT-ready sync (v7.0)
    binderIntelligence: '&binderId, updatedAt',
  });
}
