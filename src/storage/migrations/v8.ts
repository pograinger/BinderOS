/**
 * Database migration v8: enrichmentDepth for iterative enrichment deepening.
 *
 * Adds non-indexed field to inbox items:
 * - enrichmentDepth (Record<string, number>, default {}): per-category depth tracking
 *
 * Backfill: for items with non-empty maturityFilled, set enrichmentDepth[cat] = 1
 * for each category already answered (depth 1 = first pass completed).
 *
 * Phase 25: ITER-01
 */

import type { BinderDB } from '../db';

/**
 * Apply the v8 schema migration to the BinderDB instance.
 *
 * Must be called in the BinderDB constructor after applyV7Migration(this).
 * Dexie processes versions sequentially; never skip version numbers.
 */
export function applyV8Migration(db: BinderDB): void {
  db.version(8).stores({}).upgrade((tx) => {
    return tx.table('inbox').toCollection().modify((item: Record<string, unknown>) => {
      if (!item.enrichmentDepth) {
        const depth: Record<string, number> = {};
        const filled = item.maturityFilled as string[] | undefined;
        if (filled && Array.isArray(filled)) {
          for (const cat of filled) {
            depth[cat] = 1;
          }
        }
        item.enrichmentDepth = depth;
      }
    });
  });
}
