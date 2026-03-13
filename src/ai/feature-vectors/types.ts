/**
 * Canonical feature vector types and dimension name constants.
 *
 * CanonicalVector is the structured representation of an atom's feature space,
 * derived from atom metadata + intelligence sidecar + entity registry data.
 *
 * Dimension name arrays are loaded from the GTD vectors.json config — they are
 * the authoritative source and are NEVER hardcoded here. Dimensions constants
 * (TASK_VECTOR_DIM, etc.) are derived from the name arrays.
 *
 * Phase 35: CFVEC-01
 */

import vectorsConfig from '../../config/binder-types/gtd-personal/vectors.json';

// ---------------------------------------------------------------------------
// CanonicalVector — serializable snapshot of a computed feature vector
// ---------------------------------------------------------------------------

/**
 * A serializable canonical vector snapshot.
 * Stored in atomIntelligence.canonicalVector (no Dexie migration needed —
 * non-indexed optional field on existing table).
 */
export interface CanonicalVector {
  /** Which atom type this vector represents */
  vectorType: 'task' | 'person' | 'calendar';
  /** Feature values in canonical dimension order */
  data: number[];
  /** When this vector was computed (Unix ms) */
  lastComputed: number;
  /** Schema version — bump when dimension layout changes */
  schemaVersion: number;
}

// ---------------------------------------------------------------------------
// Dimension name arrays — derived from GTD vectors.json (authoritative source)
// ---------------------------------------------------------------------------

/** Named dimensions for task vectors (27 total) */
export const TASK_DIMENSION_NAMES: readonly string[] = vectorsConfig.vectorSchema.task;

/** Named dimensions for person vectors (23 total) */
export const PERSON_DIMENSION_NAMES: readonly string[] = vectorsConfig.vectorSchema.person;

/** Named dimensions for calendar vectors (34 total) */
export const CALENDAR_DIMENSION_NAMES: readonly string[] = vectorsConfig.vectorSchema.calendar;

// ---------------------------------------------------------------------------
// Dimension count constants — derived from arrays (never hardcoded)
// ---------------------------------------------------------------------------

/** Number of task vector dimensions */
export const TASK_VECTOR_DIM: number = TASK_DIMENSION_NAMES.length;

/** Number of person vector dimensions */
export const PERSON_VECTOR_DIM: number = PERSON_DIMENSION_NAMES.length;

/** Number of calendar vector dimensions */
export const CALENDAR_VECTOR_DIM: number = CALENDAR_DIMENSION_NAMES.length;

// ---------------------------------------------------------------------------
// VectorSchema type — mirrors the BinderTypeConfig.vectorSchema shape
// ---------------------------------------------------------------------------

/**
 * Per-binder-type vector schema declaration.
 * Maps vector types to their named dimension arrays.
 */
export interface VectorSchema {
  task?: string[];
  person?: string[];
  calendar?: string[];
}

// ---------------------------------------------------------------------------
// Shared helper — pick the primary entity from a list of entity mentions
// ---------------------------------------------------------------------------

import type { Entity, EntityRelation } from '../../types/intelligence';

/**
 * Pick the entity with the highest-confidence relation from the given entity
 * mentions and relation list. Returns undefined if no relations exist.
 *
 * Used by task-vector.ts and calendar-vector.ts to derive entity_reliability.
 */
export function pickPrimaryEntity(
  entityIds: string[],
  relations: EntityRelation[],
): EntityRelation | undefined {
  if (entityIds.length === 0 || relations.length === 0) return undefined;

  const entityIdSet = new Set(entityIds);
  const relevant = relations.filter(
    (r) => entityIdSet.has(r.sourceEntityId) || entityIdSet.has(r.targetEntityId),
  );
  if (relevant.length === 0) return undefined;

  return relevant.reduce((best, r) => (r.confidence > best.confidence ? r : best), relevant[0]!);
}
