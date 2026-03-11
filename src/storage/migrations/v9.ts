/**
 * Database migration v9: intelligence sidecar, entity registry, smart links.
 *
 * Schema changes:
 * - Drop entityGraph table (replaced by entities + entityRelations)
 * - Create atomIntelligence table (sidecar for AI-generated knowledge)
 * - Create entities table (canonical entity registry)
 * - Create entityRelations table (typed entity edges)
 *
 * Data migration:
 * - Strip enrichment text (after first \n---\n) from all atoms and inbox items
 * - Reset inbox maturity fields (maturityScore, maturityFilled, enrichmentDepth)
 *
 * Phase 26: SIDE-01, SIDE-02, SIDE-04
 */

import type { BinderDB } from '../db';

/**
 * Apply the v9 schema migration to the BinderDB instance.
 *
 * Must be called in the BinderDB constructor after applyV8Migration(this).
 * Dexie processes versions sequentially; never skip version numbers.
 */
export function applyV9Migration(db: BinderDB): void {
  db.version(9).stores({
    // Drop old entity graph table
    entityGraph: null,
    // Intelligence sidecar: one row per atom
    atomIntelligence: '&atomId, lastUpdated',
    // Canonical entity registry
    entities: '&id, canonicalName, type, [type+canonicalName], updatedAt',
    // Entity relationship edges
    entityRelations: '&id, sourceEntityId, targetEntityId, [sourceEntityId+relationshipType], updatedAt',
  }).upgrade(async (tx) => {
    const SEPARATOR = '\n---\n';

    // Strip enrichment text from atoms
    let atomCount = 0;
    await tx.table('atoms').toCollection().modify((item: Record<string, unknown>) => {
      const content = item.content as string;
      if (typeof content === 'string') {
        const sepIndex = content.indexOf(SEPARATOR);
        if (sepIndex !== -1) {
          item.content = content.substring(0, sepIndex);
          atomCount++;
        }
      }
    });

    // Strip enrichment text from inbox items + reset maturity fields
    let inboxCount = 0;
    await tx.table('inbox').toCollection().modify((item: Record<string, unknown>) => {
      const content = item.content as string;
      if (typeof content === 'string') {
        const sepIndex = content.indexOf(SEPARATOR);
        if (sepIndex !== -1) {
          item.content = content.substring(0, sepIndex);
          inboxCount++;
        }
      }
      // Reset maturity fields -- enrichment now lives in sidecar
      item.maturityScore = 0;
      item.maturityFilled = [];
      item.enrichmentDepth = {};
    });

    console.log(`[v9 migration] Stripped enrichment from ${atomCount} atoms, ${inboxCount} inbox items`);
  });
}
