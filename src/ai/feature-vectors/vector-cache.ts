/**
 * Canonical vector cache helpers — dirty-check and write-through utilities.
 *
 * Provides:
 * - `shouldRecomputeVector()` — staleness check based on atom.updated_at vs cached lastComputed
 * - `dirtyCheckTaskFields()` — field-level dirty check for vector-feeding fields only
 * - `writeCanonicalVector()` — fire-and-forget sidecar write (same pattern as writePredictionMomentum)
 * - `recomputeAndCacheVector()` — compute + write for task and event atoms
 * - `recomputePersonVector()` — compute + write for person entities
 *
 * All writes are fire-and-forget: non-blocking, non-fatal, failures logged to console.warn.
 *
 * Phase 35: CFVEC-04
 */

import type { Atom, TaskAtom, EventAtom } from '../../types/atoms';
import type { AtomIntelligence, Entity, EntityRelation } from '../../types/intelligence';
import type { CanonicalVector } from './types';
import { getOrCreateIntelligence } from '../../storage/atom-intelligence';
import { db } from '../../storage/db';

// ---------------------------------------------------------------------------
// shouldRecomputeVector — staleness check
// ---------------------------------------------------------------------------

/**
 * Returns true if the vector needs recomputation.
 *
 * Triggers recompute when:
 * - No cached vector exists (undefined)
 * - atom.updated_at is newer than the cached lastComputed timestamp
 *
 * Returns false when the cached vector was computed after the last atom update
 * (cosmetic edit scenario: title/content changed but not vector-feeding fields).
 */
export function shouldRecomputeVector(atom: Atom, cached: CanonicalVector | undefined): boolean {
  if (cached === undefined) return true;
  return atom.updated_at > cached.lastComputed;
}

// ---------------------------------------------------------------------------
// dirtyCheckTaskFields — field-level dirty check for task vector feeding fields
// ---------------------------------------------------------------------------

/**
 * Returns true if any vector-feeding field changed between prev and next.
 *
 * Vector-feeding fields for tasks: dueDate, status, energy, context, links.length
 * Cosmetic fields (title, content) are intentionally excluded.
 *
 * Used by callers who have the previous atom state available to avoid
 * triggering recomputation on cosmetic edits (title rename, content text edit).
 */
export function dirtyCheckTaskFields(prev: Partial<TaskAtom>, next: TaskAtom): boolean {
  if (prev.dueDate !== next.dueDate) return true;
  if (prev.status !== next.status) return true;
  if (prev.energy !== next.energy) return true;
  if (prev.context !== next.context) return true;
  const prevLinksLen = prev.links?.length ?? 0;
  const nextLinksLen = next.links?.length ?? 0;
  if (prevLinksLen !== nextLinksLen) return true;
  return false;
}

// ---------------------------------------------------------------------------
// writeCanonicalVector — fire-and-forget sidecar write
// ---------------------------------------------------------------------------

/**
 * Persist a canonical vector snapshot to the atomIntelligence sidecar.
 *
 * Fire-and-forget: returns void immediately. Dexie write happens in background.
 * Converts Float32Array to plain number[] for JSON-safe serialization.
 * Failures are logged to console.warn and never propagated.
 */
export function writeCanonicalVector(
  atomId: string,
  vectorType: 'task' | 'person' | 'calendar',
  vector: Float32Array,
): void {
  (async () => {
    try {
      const intel = await getOrCreateIntelligence(atomId);
      const cv: CanonicalVector = {
        vectorType,
        data: Array.from(vector),
        lastComputed: Date.now(),
        schemaVersion: 1,
      };
      intel.canonicalVector = cv;
      intel.version++;
      intel.lastUpdated = Date.now();
      await db.atomIntelligence.put(intel);
    } catch (err) {
      console.warn('[vector-cache] writeCanonicalVector failed (non-fatal):', err);
    }
  })();
}

// ---------------------------------------------------------------------------
// recomputeAndCacheVector — compute + write for atom types
// ---------------------------------------------------------------------------

/**
 * Determine atom type, compute the appropriate vector, then fire-and-forget write.
 *
 * Handles: task atoms → computeTaskVector, event atoms → computeCalendarVector.
 * Other atom types are no-ops (person vectors derive from Entity, not Atom).
 *
 * Synchronous compute + async fire-and-forget write. Never blocks the caller.
 */
export function recomputeAndCacheVector(
  atom: Atom,
  sidecar: AtomIntelligence | undefined,
  entities: Entity[],
  relations: EntityRelation[],
): void {
  if (atom.type === 'task') {
    import('./task-vector').then(({ computeTaskVector }) => {
      const result = computeTaskVector(atom as TaskAtom, sidecar, entities, relations);
      writeCanonicalVector(atom.id, 'task', result);
    }).catch((err) => {
      console.warn('[vector-cache] recomputeAndCacheVector (task) import failed:', err);
    });
  } else if (atom.type === 'event') {
    import('./calendar-vector').then(({ computeCalendarVector }) => {
      const result = computeCalendarVector(atom as EventAtom, sidecar, entities, relations);
      writeCanonicalVector(atom.id, 'calendar', result);
    }).catch((err) => {
      console.warn('[vector-cache] recomputeAndCacheVector (event) import failed:', err);
    });
  }
  // Other atom types (note, fact, reference, etc.): no-op
  // Person vectors are computed from Entity rows, not Atom rows — see recomputePersonVector()
}

// ---------------------------------------------------------------------------
// recomputePersonVector — compute + write for person entities
// ---------------------------------------------------------------------------

/**
 * Compute and persist a person vector for the given entity.
 *
 * Person atoms may not have a 1:1 atomId mapping — uses `entity:${entity.id}`
 * as the sidecar key. This is a synthetic key that avoids polluting the atom
 * namespace while keeping entity vectors accessible in the same table.
 *
 * Fire-and-forget write. Never blocks the caller.
 */
export function recomputePersonVector(
  entity: Entity,
  relations: EntityRelation[],
): void {
  import('./person-vector').then(({ computePersonVector }) => {
    const result = computePersonVector(entity, relations);
    const syntheticId = `entity:${entity.id}`;
    writeCanonicalVector(syntheticId, 'person', result);
  }).catch((err) => {
    console.warn('[vector-cache] recomputePersonVector import failed:', err);
  });
}
