/**
 * Specialist consensus layer type definitions and constants.
 *
 * SpecialistOutput: one risk specialist's probability + weight.
 * ConsensusResult: aggregated weighted vote from all specialists.
 * SPECIALIST_WEIGHTS: per-specialist weight from EII experiment results.
 * SPECIALIST_FEATURE_SLICES: maps each specialist to its slice of the
 *   84-dim canonical vector (27 task + 23 person + 34 calendar).
 *
 * Feature indices are derived from TASK/PERSON/CALENDAR_DIMENSION_NAMES —
 * never hardcoded. indexByName() catches mismatches at module load time.
 *
 * Phase 36: CONS-02
 */

import {
  TASK_DIMENSION_NAMES,
  PERSON_DIMENSION_NAMES,
  CALENDAR_DIMENSION_NAMES,
  TASK_VECTOR_DIM,
  PERSON_VECTOR_DIM,
  CALENDAR_VECTOR_DIM,
} from '../feature-vectors/types';

// ---------------------------------------------------------------------------
// SpecialistOutput — one specialist's probability estimate
// ---------------------------------------------------------------------------

/**
 * Output from a single specialist risk model.
 */
export interface SpecialistOutput {
  /** Specialist identifier (e.g. 'time-pressure', 'dependency') */
  name: string;
  /** Probability in [0, 1] that this specialist signals risk */
  probability: number;
  /** Relative weight for this specialist in consensus aggregation */
  weight: number;
}

// ---------------------------------------------------------------------------
// ConsensusResult — aggregated output from all specialists
// ---------------------------------------------------------------------------

/**
 * Consensus result produced by computeConsensus().
 */
export interface ConsensusResult {
  /** Weighted average probability: sum(p * w) / sum(w) */
  weightedProbability: number;
  /** True if majority of specialists signal risk (probability >= 0.5) */
  majorityVote: boolean;
  /** Pairwise agreement ratio: agreeing pairs / total pairs (1.0 = unanimous) */
  agreementScore: number;
  /** Original specialist outputs preserved for explainability */
  specialistContributions: SpecialistOutput[];
  /** Unix ms timestamp when consensus was computed */
  computedAt: number;
}

// ---------------------------------------------------------------------------
// SPECIALIST_WEIGHTS — from EII experiment results
// ---------------------------------------------------------------------------

/**
 * Relative weights for each specialist in the consensus vote.
 * Source: EII experiment — time-pressure and dependency showed +0.030 AUC lift.
 */
export const SPECIALIST_WEIGHTS: Readonly<Record<string, number>> = {
  'time-pressure': 1.5,
  'dependency': 1.5,
  'staleness': 1.0,
  'energy-context': 1.0,
} as const;

// ---------------------------------------------------------------------------
// Feature slice definition — per specialist, which canonical vector dims to use
// ---------------------------------------------------------------------------

/**
 * A specialist's view into the 84-dim canonical flat vector.
 * featureIndices reference positions in the concatenated [task | person | calendar] layout.
 * hiddenLayers mirrors the EII experiment MLP architecture (2 hidden layers).
 */
export interface SpecialistFeatureSlice {
  /** Specialist key (matches SPECIALIST_WEIGHTS key) */
  name: string;
  /** Indices into the 84-dim canonical vector [task(0-26)|person(27-49)|calendar(50-83)] */
  featureIndices: number[];
  /** MLP hidden layer sizes (EII experiment architecture) */
  hiddenLayers: number[];
}

// ---------------------------------------------------------------------------
// Helper — look up dimension index by name, throws if not found
// ---------------------------------------------------------------------------

/**
 * Return the flat-vector index of a named dimension within the given array,
 * offset by baseIndex (i.e., where this segment starts in the 84-dim vector).
 *
 * Throws at module load time if the name is not found — catches mismatches early.
 */
function indexByName(dimNames: readonly string[], name: string, baseIndex: number): number {
  const local = dimNames.indexOf(name);
  if (local === -1) {
    throw new Error(
      `[consensus/types] Dimension "${name}" not found in vector schema. ` +
        `Available: ${dimNames.join(', ')}`,
    );
  }
  return baseIndex + local;
}

/**
 * Generate a range of indices [start, start+1, ..., start+count-1].
 */
function range(start: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => start + i);
}

// ---------------------------------------------------------------------------
// SPECIALIST_FEATURE_SLICES — derive indices from dimension name arrays
// ---------------------------------------------------------------------------

const TASK_BASE = 0;
const PERSON_BASE = TASK_VECTOR_DIM;             // 27
const CALENDAR_BASE = TASK_VECTOR_DIM + PERSON_VECTOR_DIM; // 50

// All person dims (indices 27-49)
const ALL_PERSON_INDICES = range(PERSON_BASE, PERSON_VECTOR_DIM);

// All calendar dims (indices 50-83)
const ALL_CALENDAR_INDICES = range(CALENDAR_BASE, CALENDAR_VECTOR_DIM);

/**
 * Per-specialist feature slices into the 84-dim canonical vector.
 *
 * TimePressure: deadline + time_pressure from task, ALL calendar dims.
 * Dependency: waiting/person-dep/entity-response from task, ALL person dims.
 * Staleness: age/staleness/deadline/days/prev_staleness from task.
 * EnergyContext: context flags + energy from task, energy + pressure + risk from calendar.
 */
export const SPECIALIST_FEATURE_SLICES: Readonly<Record<string, SpecialistFeatureSlice>> = {
  'time-pressure': {
    name: 'time-pressure',
    featureIndices: [
      indexByName(TASK_DIMENSION_NAMES, 'has_deadline', TASK_BASE),
      indexByName(TASK_DIMENSION_NAMES, 'days_to_deadline_norm', TASK_BASE),
      indexByName(TASK_DIMENSION_NAMES, 'time_pressure_score', TASK_BASE),
      ...ALL_CALENDAR_INDICES,
    ],
    hiddenLayers: [64, 32],
  },

  'dependency': {
    name: 'dependency',
    featureIndices: [
      indexByName(TASK_DIMENSION_NAMES, 'is_waiting_for', TASK_BASE),
      indexByName(TASK_DIMENSION_NAMES, 'has_person_dep', TASK_BASE),
      indexByName(TASK_DIMENSION_NAMES, 'entity_reliability', TASK_BASE),
      indexByName(TASK_DIMENSION_NAMES, 'entity_resp_fast', TASK_BASE),
      indexByName(TASK_DIMENSION_NAMES, 'entity_resp_slow', TASK_BASE),
      indexByName(TASK_DIMENSION_NAMES, 'entity_resp_unknown', TASK_BASE),
      ...ALL_PERSON_INDICES,
    ],
    hiddenLayers: [64, 32],
  },

  'staleness': {
    name: 'staleness',
    featureIndices: [
      indexByName(TASK_DIMENSION_NAMES, 'age_norm', TASK_BASE),
      indexByName(TASK_DIMENSION_NAMES, 'staleness_norm', TASK_BASE),
      indexByName(TASK_DIMENSION_NAMES, 'has_deadline', TASK_BASE),
      indexByName(TASK_DIMENSION_NAMES, 'days_to_deadline_norm', TASK_BASE),
      indexByName(TASK_DIMENSION_NAMES, 'prev_staleness_score', TASK_BASE),
    ],
    hiddenLayers: [32, 16],
  },

  'energy-context': {
    name: 'energy-context',
    featureIndices: [
      // Task context flags (ctx_home..ctx_anywhere = 6 dims)
      indexByName(TASK_DIMENSION_NAMES, 'ctx_home', TASK_BASE),
      indexByName(TASK_DIMENSION_NAMES, 'ctx_office', TASK_BASE),
      indexByName(TASK_DIMENSION_NAMES, 'ctx_phone', TASK_BASE),
      indexByName(TASK_DIMENSION_NAMES, 'ctx_computer', TASK_BASE),
      indexByName(TASK_DIMENSION_NAMES, 'ctx_errands', TASK_BASE),
      indexByName(TASK_DIMENSION_NAMES, 'ctx_anywhere', TASK_BASE),
      // Task energy dims (energy_low..energy_high = 3 dims)
      indexByName(TASK_DIMENSION_NAMES, 'energy_low', TASK_BASE),
      indexByName(TASK_DIMENSION_NAMES, 'energy_medium', TASK_BASE),
      indexByName(TASK_DIMENSION_NAMES, 'energy_high', TASK_BASE),
      // Task time pressure and energy fit
      indexByName(TASK_DIMENSION_NAMES, 'time_pressure_score', TASK_BASE),
      indexByName(TASK_DIMENSION_NAMES, 'prev_energy_fit', TASK_BASE),
      // Calendar energy dims
      indexByName(CALENDAR_DIMENSION_NAMES, 'energy_low', CALENDAR_BASE),
      indexByName(CALENDAR_DIMENSION_NAMES, 'energy_medium', CALENDAR_BASE),
      indexByName(CALENDAR_DIMENSION_NAMES, 'energy_high', CALENDAR_BASE),
      indexByName(CALENDAR_DIMENSION_NAMES, 'time_pressure_score', CALENDAR_BASE),
      indexByName(CALENDAR_DIMENSION_NAMES, 'overrun_risk', CALENDAR_BASE),
    ],
    hiddenLayers: [64, 32],
  },
} as const;
