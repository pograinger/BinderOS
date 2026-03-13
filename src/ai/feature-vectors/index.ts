/**
 * Canonical feature vector module — public API barrel.
 *
 * Exports types, dimension constants, and the three pure compute functions
 * for task, person, and calendar canonical vectors.
 *
 * Phase 35: CFVEC-01, CFVEC-02, CFVEC-03, CFVEC-04
 */

// Types and dimension constants
export type { CanonicalVector, VectorSchema } from './types';
export {
  TASK_DIMENSION_NAMES,
  PERSON_DIMENSION_NAMES,
  CALENDAR_DIMENSION_NAMES,
  TASK_VECTOR_DIM,
  PERSON_VECTOR_DIM,
  CALENDAR_VECTOR_DIM,
  pickPrimaryEntity,
} from './types';

// Compute functions (added in Task 2)
export { computeTaskVector } from './task-vector';
export { computePersonVector } from './person-vector';
export { computeCalendarVector } from './calendar-vector';

// Vector cache helpers (added in Plan 02 — Phase 35: CFVEC-04)
export {
  writeCanonicalVector,
  shouldRecomputeVector,
  dirtyCheckTaskFields,
  recomputeAndCacheVector,
  recomputePersonVector,
} from './vector-cache';
