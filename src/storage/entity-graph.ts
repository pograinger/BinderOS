/**
 * Entity graph seeding and query helpers.
 *
 * Provides functions to seed entity relationships into the Dexie entityGraph
 * table and query them. Uses single-direction storage with bidirectional
 * query helpers (fewer records, simpler CRDT conflict resolution).
 *
 * Supports 4 relationship sources (only clarification wired in Phase 19):
 * - Clarification: has-outcome, has-deadline, has-context, has-reference, has-next-action
 * - Decomposition: parent-of (deferred)
 * - Triage similarity: related-to (deferred)
 * - GTD context: tagged-with (deferred)
 *
 * Pure module pattern — imports db only.
 *
 * Phase 19: CLAR-08
 */

import { db } from './db';
import { writeQueue } from './write-queue';

/**
 * A single entity-relationship record in the graph.
 */
export interface EntityGraphEntry {
  id: string;
  sourceAtomId: string;
  /** Entity type: outcome, deadline, context, reference, person, parent, related, context-tag, next-action */
  entityType: string;
  entityValue: string;
  /** Relationship type: has-outcome, has-deadline, has-context, has-reference, involves-person, parent-of, child-of, related-to, tagged-with, has-next-action */
  relationship: string;
  /** Optional target (e.g., child atom ID for parent-of, empty string if not applicable) */
  targetValue: string;
  createdAt: number;
}

/**
 * Seed a single entity relationship into the graph.
 *
 * Generates a UUID id and timestamp automatically.
 * Uses the write queue for batched persistence.
 */
export function seedEntityRelationship(
  entry: Omit<EntityGraphEntry, 'id' | 'createdAt'>,
): Promise<void> {
  return new Promise<void>((resolve) => {
    writeQueue.enqueue(async () => {
      const record: EntityGraphEntry = {
        ...entry,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
      };
      await db.entityGraph.put(record);
      resolve();
    });
  });
}

/**
 * Get all relationships for an atom (bidirectional).
 *
 * Queries both sourceAtomId = atomId (outgoing relationships)
 * and targetValue = atomId (incoming relationships from other atoms).
 * This provides bidirectional lookup with single-direction storage.
 */
export async function getRelationships(atomId: string): Promise<EntityGraphEntry[]> {
  const [outgoing, incoming] = await Promise.all([
    db.entityGraph.where('sourceAtomId').equals(atomId).toArray(),
    db.entityGraph.where('targetValue').equals(atomId).toArray(),
  ]);

  // Deduplicate by id in case of overlapping results
  const seen = new Set<string>();
  const results: EntityGraphEntry[] = [];

  for (const entry of [...outgoing, ...incoming]) {
    if (!seen.has(entry.id)) {
      seen.add(entry.id);
      results.push(entry);
    }
  }

  return results;
}

/**
 * Get relationships for an atom filtered by entity type.
 *
 * Uses the compound index [sourceAtomId+entityType] for efficient lookup.
 */
export async function getRelationshipsByType(
  atomId: string,
  entityType: string,
): Promise<EntityGraphEntry[]> {
  return db.entityGraph
    .where('[sourceAtomId+entityType]')
    .equals([atomId, entityType])
    .toArray();
}
