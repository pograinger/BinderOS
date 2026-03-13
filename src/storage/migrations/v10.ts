/**
 * Database migration v10: context gate log, sequence context, binder type config.
 *
 * Schema changes (additive-only — no existing tables modified):
 * - gateActivationLog: captures why each gate predicate fired/blocked
 * - sequenceContext: per-binder HTM-inspired sequence embeddings (Phase 33 fills)
 * - binderTypeConfig: runtime-injectable binder type config overrides
 *
 * All three tables include CRDT-ready fields (version, deviceId, updatedAt)
 * consistent with Phase 26 intelligence sidecar pattern.
 *
 * No .upgrade() needed — these are new empty tables.
 *
 * Phase 30: SCHM-01
 */

import type { BinderDB } from '../db';

/**
 * Apply the v10 schema migration to the BinderDB instance.
 *
 * Must be called in the BinderDB constructor after applyV9Migration(this).
 * Dexie processes versions sequentially; never skip version numbers.
 */
export function applyV10Migration(db: BinderDB): void {
  db.version(10).stores({
    // Gate activation log: rich context snapshots for harness replay and threshold tuning
    // Compound indexes enable per-predicate rate queries and per-atom gate history
    gateActivationLog: '&id, [predicateName+timestamp], [atomId+timestamp], timestamp',

    // Sequence context: per-binder HTM-inspired embedding window
    // Phase 33 populates this; schema defined here to avoid another migration
    sequenceContext: '&binderId, lastUpdated',

    // Binder type config: enables harness config injection without a rebuild
    // Full config stored as JSON blob in configJson field
    binderTypeConfig: '&slug, updatedAt',
  });
}
