/**
 * Specialist consensus layer type definitions and constants.
 *
 * SpecialistOutput: one risk specialist's probability + weight.
 * ConsensusResult: aggregated weighted vote from all specialists.
 * SPECIALIST_WEIGHTS: per-specialist weight from EII experiment results.
 * SPECIALIST_FEATURE_SLICES: maps each specialist to its slice of the
 *   canonical vector (task + person + calendar + cognitive + composite +
 *   enrichment + temporal + social + portfolio + content).
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
  COGNITIVE_DIMENSION_NAMES,
  COMPOSITE_DIMENSION_NAMES,
  ENRICHMENT_DIMENSION_NAMES,
  TEMPORAL_DIMENSION_NAMES,
  SOCIAL_DIMENSION_NAMES,
  PORTFOLIO_DIMENSION_NAMES,
  CONTENT_DIMENSION_NAMES,
  TASK_VECTOR_DIM,
  PERSON_VECTOR_DIM,
  CALENDAR_VECTOR_DIM,
  COGNITIVE_VECTOR_DIM,
  COMPOSITE_VECTOR_DIM,
  ENRICHMENT_VECTOR_DIM,
  TEMPORAL_VECTOR_DIM,
  SOCIAL_VECTOR_DIM,
  PORTFOLIO_VECTOR_DIM,
  CONTENT_VECTOR_DIM,
  FULL_VECTOR_DIM,
  TASK_BASE,
  PERSON_BASE,
  CALENDAR_BASE,
  COGNITIVE_BASE,
  COMPOSITE_BASE,
  ENRICHMENT_BASE,
  TEMPORAL_BASE,
  SOCIAL_BASE,
  PORTFOLIO_BASE,
  CONTENT_BASE,
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
  // --- Original learned specialists (Phase 36) ---
  'time-pressure': 1.5,
  'dependency': 1.5,
  'staleness': 1.0,
  'energy-context': 1.0,
  // --- Deterministic validators (Phase 37) ---
  'date-temporal': 1.5,
  'dependency-structural': 1.5,
  'math-consistency': 1.5,
  'structural-logic': 1.5,
  // --- Orthogonal agents (chat21 — semantic/affective/cognitive modalities) ---
  'ambiguity': 1.0,
  'cognitive-complexity': 1.0,
  'emotional-tone': 1.0,
  'temporal-drift': 1.0,
  'context-switch': 1.0,
  'social-blocking': 1.0,
  'motivation': 1.0,
  'portfolio-risk': 1.0,
} as const;

// ---------------------------------------------------------------------------
// Feature slice definition — per specialist, which canonical vector dims to use
// ---------------------------------------------------------------------------

/**
 * A specialist's view into the canonical flat vector.
 * featureIndices reference positions in the concatenated segment layout.
 * hiddenLayers mirrors the EII experiment MLP architecture (2 hidden layers).
 */
export interface SpecialistFeatureSlice {
  /** Specialist key (matches SPECIALIST_WEIGHTS key) */
  name: string;
  /** Indices into the canonical vector */
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

// Base offsets and FULL_VECTOR_DIM are imported from feature-vectors/types

// All person dims
const ALL_PERSON_INDICES = range(PERSON_BASE, PERSON_VECTOR_DIM);

// All calendar dims
const ALL_CALENDAR_INDICES = range(CALENDAR_BASE, CALENDAR_VECTOR_DIM);

// All cognitive dims
const ALL_COGNITIVE_INDICES = range(COGNITIVE_BASE, COGNITIVE_VECTOR_DIM);

// All composite dims
const ALL_COMPOSITE_INDICES = range(COMPOSITE_BASE, COMPOSITE_VECTOR_DIM);

// All enrichment dims
const ALL_ENRICHMENT_INDICES = range(ENRICHMENT_BASE, ENRICHMENT_VECTOR_DIM);

// All temporal dims
const ALL_TEMPORAL_INDICES = range(TEMPORAL_BASE, TEMPORAL_VECTOR_DIM);

// All social dims
const ALL_SOCIAL_INDICES = range(SOCIAL_BASE, SOCIAL_VECTOR_DIM);

// All portfolio dims
const ALL_PORTFOLIO_INDICES = range(PORTFOLIO_BASE, PORTFOLIO_VECTOR_DIM);

// All content dims
const ALL_CONTENT_INDICES = range(CONTENT_BASE, CONTENT_VECTOR_DIM);

/**
 * Per-specialist feature slices into the canonical vector.
 *
 * Original 4 learned (Phase 36):
 *   TimePressure: deadline + time_pressure from task, ALL calendar dims.
 *   Dependency: waiting/person-dep/entity-response from task, ALL person dims.
 *   Staleness: age/staleness/deadline/days/prev_staleness from task.
 *   EnergyContext: context flags + energy from task, energy + pressure + risk from calendar.
 *
 * 4 deterministic validators (Phase 37):
 *   DateTemporal, DependencyStructural, MathConsistency, StructuralLogic: full vector input.
 *
 * 8 orthogonal agents (chat21):
 *   Ambiguity: content clarity + enrichment completeness.
 *   CognitiveComplexity: cognitive load signals + structural metadata.
 *   EmotionalTone: emotional valence + stress composite.
 *   TemporalDrift: temporal behavioral patterns.
 *   ContextSwitch: domain signals + context-switch composite.
 *   SocialBlocking: social dims + person + dependency.
 *   Motivation: gtd-horizon + priority-matrix + content motivation.
 *   PortfolioRisk: portfolio-level cross-item signals.
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
      ...ALL_TEMPORAL_INDICES, // drift_velocity, times_postponed, capture_latency, urgency_trajectory, someday_bounce
    ],
    hiddenLayers: [12, 6],
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

  // --- Deterministic validators (legacy 84-dim input, 11-value output) ---
  // These ONNX models were built on the ORIGINAL 84-dim layout before task expansion.
  // They use internal Gather ops that reference indices 0-83.
  // featureIndices extracts the original 27 task + 23 person + 34 calendar = 84 dims.
  // TODO: Retrain with extended vector to see full signal.

  'date-temporal': {
    name: 'date-temporal',
    featureIndices: [
      ...range(TASK_BASE, 27),      // original 27 task dims (before extension)
      ...range(PERSON_BASE, PERSON_VECTOR_DIM),
      ...range(CALENDAR_BASE, CALENDAR_VECTOR_DIM),
    ],
    hiddenLayers: [],
  },

  'dependency-structural': {
    name: 'dependency-structural',
    featureIndices: [
      ...range(TASK_BASE, 27),
      ...range(PERSON_BASE, PERSON_VECTOR_DIM),
      ...range(CALENDAR_BASE, CALENDAR_VECTOR_DIM),
    ],
    hiddenLayers: [],
  },

  'math-consistency': {
    name: 'math-consistency',
    featureIndices: [
      ...range(TASK_BASE, 27),
      ...range(PERSON_BASE, PERSON_VECTOR_DIM),
      ...range(CALENDAR_BASE, CALENDAR_VECTOR_DIM),
    ],
    hiddenLayers: [],
  },

  'structural-logic': {
    name: 'structural-logic',
    featureIndices: [
      ...range(TASK_BASE, 27),
      ...range(PERSON_BASE, PERSON_VECTOR_DIM),
      ...range(CALENDAR_BASE, CALENDAR_VECTOR_DIM),
    ],
    hiddenLayers: [],
  },

  // --- Orthogonal agents (chat21 — semantic/affective/cognitive modalities) ---

  'ambiguity': {
    name: 'ambiguity',
    featureIndices: [
      ...ALL_CONTENT_INDICES,       // ambiguity_score, outcome_clarity, next_action_clarity, etc.
      ...ALL_ENRICHMENT_INDICES,    // enrichment completeness signals
      indexByName(TASK_DIMENSION_NAMES, 'enrichment_depth_norm', TASK_BASE),
    ],
    hiddenLayers: [32, 16],
  },

  'cognitive-complexity': {
    name: 'cognitive-complexity',
    featureIndices: [
      indexByName(COGNITIVE_DIMENSION_NAMES, 'cog_load_trivial', COGNITIVE_BASE),
      indexByName(COGNITIVE_DIMENSION_NAMES, 'cog_load_routine', COGNITIVE_BASE),
      indexByName(COGNITIVE_DIMENSION_NAMES, 'cog_load_complex', COGNITIVE_BASE),
      indexByName(COGNITIVE_DIMENSION_NAMES, 'cog_load_deep', COGNITIVE_BASE),
      indexByName(COGNITIVE_DIMENSION_NAMES, 'time_est_quick', COGNITIVE_BASE),
      indexByName(COGNITIVE_DIMENSION_NAMES, 'time_est_short', COGNITIVE_BASE),
      indexByName(COGNITIVE_DIMENSION_NAMES, 'time_est_medium', COGNITIVE_BASE),
      indexByName(COGNITIVE_DIMENSION_NAMES, 'time_est_long', COGNITIVE_BASE),
      indexByName(TASK_DIMENSION_NAMES, 'content_length_norm', TASK_BASE),
      indexByName(TASK_DIMENSION_NAMES, 'tag_count_norm', TASK_BASE),
      indexByName(TASK_DIMENSION_NAMES, 'backlink_count_norm', TASK_BASE),
      indexByName(SOCIAL_DIMENSION_NAMES, 'coordination_complexity_norm', SOCIAL_BASE),
    ],
    hiddenLayers: [32, 16],
  },

  'emotional-tone': {
    name: 'emotional-tone',
    featureIndices: [
      indexByName(COGNITIVE_DIMENSION_NAMES, 'emotion_positive', COGNITIVE_BASE),
      indexByName(COGNITIVE_DIMENSION_NAMES, 'emotion_neutral', COGNITIVE_BASE),
      indexByName(COGNITIVE_DIMENSION_NAMES, 'emotion_negative', COGNITIVE_BASE),
      indexByName(COGNITIVE_DIMENSION_NAMES, 'emotion_anxious', COGNITIVE_BASE),
      indexByName(COMPOSITE_DIMENSION_NAMES, 'stress_risk', COMPOSITE_BASE),
      indexByName(CONTENT_DIMENSION_NAMES, 'motivation_alignment', CONTENT_BASE),
    ],
    hiddenLayers: [32, 16],
  },

  'temporal-drift': {
    name: 'temporal-drift',
    featureIndices: [
      ...ALL_TEMPORAL_INDICES,      // drift_velocity, times_postponed, capture_latency, urgency_trajectory, someday_bounce
      indexByName(TASK_DIMENSION_NAMES, 'age_norm', TASK_BASE),
      indexByName(TASK_DIMENSION_NAMES, 'staleness_norm', TASK_BASE),
      indexByName(TASK_DIMENSION_NAMES, 'prev_staleness_score', TASK_BASE),
    ],
    hiddenLayers: [32, 16],
  },

  'context-switch': {
    name: 'context-switch',
    featureIndices: [
      indexByName(COMPOSITE_DIMENSION_NAMES, 'context_switch_cost', COMPOSITE_BASE),
      indexByName(COMPOSITE_DIMENSION_NAMES, 'deep_work_block', COMPOSITE_BASE),
      indexByName(COGNITIVE_DIMENSION_NAMES, 'domain_work', COGNITIVE_BASE),
      indexByName(COGNITIVE_DIMENSION_NAMES, 'domain_personal', COGNITIVE_BASE),
      indexByName(COGNITIVE_DIMENSION_NAMES, 'domain_health', COGNITIVE_BASE),
      indexByName(COGNITIVE_DIMENSION_NAMES, 'domain_finance', COGNITIVE_BASE),
      indexByName(COGNITIVE_DIMENSION_NAMES, 'domain_creative', COGNITIVE_BASE),
      indexByName(COGNITIVE_DIMENSION_NAMES, 'domain_tech', COGNITIVE_BASE),
      indexByName(COGNITIVE_DIMENSION_NAMES, 'domain_social', COGNITIVE_BASE),
      indexByName(COGNITIVE_DIMENSION_NAMES, 'domain_admin', COGNITIVE_BASE),
      indexByName(COGNITIVE_DIMENSION_NAMES, 'cog_load_complex', COGNITIVE_BASE),
      indexByName(COGNITIVE_DIMENSION_NAMES, 'cog_load_deep', COGNITIVE_BASE),
      indexByName(PORTFOLIO_DIMENSION_NAMES, 'context_saturation', PORTFOLIO_BASE),
    ],
    hiddenLayers: [32, 16],
  },

  'social-blocking': {
    name: 'social-blocking',
    featureIndices: [
      ...ALL_SOCIAL_INDICES,        // social_blocking_score, coordination_complexity, waiting_duration
      indexByName(COGNITIVE_DIMENSION_NAMES, 'collab_solo', COGNITIVE_BASE),
      indexByName(COGNITIVE_DIMENSION_NAMES, 'collab_delegation', COGNITIVE_BASE),
      indexByName(COGNITIVE_DIMENSION_NAMES, 'collab_collaboration', COGNITIVE_BASE),
      indexByName(COMPOSITE_DIMENSION_NAMES, 'delegate_candidate', COMPOSITE_BASE),
      indexByName(TASK_DIMENSION_NAMES, 'is_waiting_for', TASK_BASE),
      indexByName(TASK_DIMENSION_NAMES, 'has_person_dep', TASK_BASE),
      indexByName(TASK_DIMENSION_NAMES, 'entity_reliability', TASK_BASE),
    ],
    hiddenLayers: [32, 16],
  },

  'motivation': {
    name: 'motivation',
    featureIndices: [
      indexByName(CONTENT_DIMENSION_NAMES, 'motivation_alignment', CONTENT_BASE),
      indexByName(COGNITIVE_DIMENSION_NAMES, 'gtd_horizon_runway', COGNITIVE_BASE),
      indexByName(COGNITIVE_DIMENSION_NAMES, 'gtd_horizon_10k', COGNITIVE_BASE),
      indexByName(COGNITIVE_DIMENSION_NAMES, 'gtd_horizon_20k', COGNITIVE_BASE),
      indexByName(COGNITIVE_DIMENSION_NAMES, 'gtd_horizon_30k', COGNITIVE_BASE),
      indexByName(COGNITIVE_DIMENSION_NAMES, 'gtd_horizon_40k', COGNITIVE_BASE),
      indexByName(COGNITIVE_DIMENSION_NAMES, 'priority_urgent_important', COGNITIVE_BASE),
      indexByName(COGNITIVE_DIMENSION_NAMES, 'priority_urgent_not', COGNITIVE_BASE),
      indexByName(COGNITIVE_DIMENSION_NAMES, 'priority_not_urgent_important', COGNITIVE_BASE),
      indexByName(COGNITIVE_DIMENSION_NAMES, 'priority_not_urgent_not', COGNITIVE_BASE),
      indexByName(COMPOSITE_DIMENSION_NAMES, 'promote_to_project', COMPOSITE_BASE),
      indexByName(TASK_DIMENSION_NAMES, 'is_pinned_someday', TASK_BASE),
    ],
    hiddenLayers: [32, 16],
  },

  'portfolio-risk': {
    name: 'portfolio-risk',
    featureIndices: [
      ...ALL_PORTFOLIO_INDICES,     // context_saturation, deadline_cluster, project_momentum, dep_chain_depth
      indexByName(TASK_DIMENSION_NAMES, 'has_project', TASK_BASE),
      indexByName(TASK_DIMENSION_NAMES, 'has_deadline', TASK_BASE),
      indexByName(TASK_DIMENSION_NAMES, 'time_pressure_score', TASK_BASE),
      indexByName(COMPOSITE_DIMENSION_NAMES, 'stale_risk', COMPOSITE_BASE),
      indexByName(COMPOSITE_DIMENSION_NAMES, 'review_cadence_mismatch', COMPOSITE_BASE),
    ],
    hiddenLayers: [32, 16],
  },
} as const;
