/**
 * Shared type definitions for the adversarial training loop.
 *
 * CycleState, GraphSnapshot, GraphDiff, AblationConfig, UserCorrection
 * and related interfaces used across the multi-cycle adversarial harness.
 *
 * Phase 29: TVAL-01
 */

import type { Entity, EntityRelation, AtomIntelligence, EntityMention } from '../../src/types/intelligence.js';
import type { GraphScore } from './score-graph.js';
import type { CorpusItem } from './generate-corpus.js';

// ---------------------------------------------------------------------------
// Graph persistence types
// ---------------------------------------------------------------------------

export interface GraphSnapshot {
  /** Serialized entities at this point in time */
  entities: Entity[];
  /** Serialized entity relations at this point in time */
  relations: EntityRelation[];
  /** Partial atomIntelligence records (entity mentions + enrichment only) */
  atomIntelligenceRecords: Array<{
    atomId: string;
    entityMentions: EntityMention[];
    enrichmentCount: number;
  }>;
  /** Synthetic ISO timestamp this snapshot was taken at */
  takenAt: string;
}

export interface GraphDiff {
  /** Entity canonical names that are new since last cycle */
  newEntities: string[];
  /** Relations created since last cycle */
  newRelations: Array<{ entity: string; type: string }>;
  /** Relations where confidence changed significantly */
  confidenceChanges: Array<{ entity: string; type: string; delta: number }>;
}

// ---------------------------------------------------------------------------
// Gap analysis
// ---------------------------------------------------------------------------

export interface RelationshipGap {
  /** The ground truth relationship that is missing */
  groundTruthRelationship: { entity: string; type: string };
  /** Current wrong or absent relationship type (null if completely missing) */
  bestAttempt: string | null;
  /** Human-readable reason for the gap */
  gapReason: string;
}

// ---------------------------------------------------------------------------
// Enrichment emulation
// ---------------------------------------------------------------------------

export interface SimulatedQA {
  question: string;
  answer: string;
  category: string;
}

export interface EnrichmentEmulation {
  atomId: string;
  simulatedQA: SimulatedQA[];
  /** New entity mentions mined from the enrichment answers */
  newEntityMentions: EntityMention[];
}

// ---------------------------------------------------------------------------
// User corrections
// ---------------------------------------------------------------------------

export interface UserCorrection {
  entityName: string;
  wrongRelationshipType: string | null;
  correctRelationshipType: string;
  atomId: string;
  appliedAt: string; // ISO timestamp
}

// ---------------------------------------------------------------------------
// Component attribution
// ---------------------------------------------------------------------------

export type RelationshipSource =
  | 'keyword-pattern'
  | 'co-occurrence'
  | 'enrichment-mining'
  | 'user-correction';

export interface ComponentAttribution {
  /** entity name → type → source that created/confirmed it */
  byRelation: Map<string, RelationshipSource>;
  /** Count per source type */
  counts: Record<RelationshipSource, number>;
}

// ---------------------------------------------------------------------------
// Cycle state
// ---------------------------------------------------------------------------

export interface CycleState {
  personaName: string;
  cycleNumber: number; // 1-5
  corpus: CorpusItem[];
  graphSnapshot: GraphSnapshot;
  graphDiff: GraphDiff;
  score: GraphScore;
  gaps: RelationshipGap[];
  enrichmentEmulations: EnrichmentEmulation[];
  corrections: UserCorrection[];
  attribution: ComponentAttribution;
  durationMs: number;
  syntheticStartTimestamp: string; // ISO — start of corpus items in this cycle
  /** Average quality improvement score (1-5) from entity context injection vs baseline (ENTC-01 validation) */
  enrichmentQualityScore?: number;
}

// ---------------------------------------------------------------------------
// Ablation configuration
// ---------------------------------------------------------------------------

export interface AblationConfig {
  disableKeywordPatterns: boolean;
  disableCooccurrence: boolean;
  disableEnrichmentMining: boolean;
  disableUserCorrections: boolean;
  disableRecencyDecay: boolean;
  /** Human-readable label for reports */
  label: string;
}

// ---------------------------------------------------------------------------
// Experiment result
// ---------------------------------------------------------------------------

export interface PersonaAdversarialResult {
  personaName: string;
  personaDirName: string;
  cycles: CycleState[];
  totalDurationMs: number;
  finalScore: GraphScore;
}

export interface AggregateScore {
  /** Across all personas */
  entityF1: { mean: number; median: number; min: number; max: number; stdDev: number };
  relationshipF1: { mean: number; median: number; min: number; max: number; stdDev: number };
  privacyScore: { mean: number; median: number; min: number; max: number; stdDev: number };
  /** Per-persona breakdown */
  perPersona: Array<{ personaName: string; entityF1: number; relationshipF1: number; privacyScore: number }>;
}

export interface LearningCurvePoint {
  cycle: number;
  entityF1: number;
  relationshipF1: number;
  privacyScore: number;
}

export interface ExperimentResult {
  experimentName: string;
  startedAt: string;
  completedAt: string;
  personas: PersonaAdversarialResult[];
  aggregateScore: AggregateScore;
  learningCurves: Record<string, LearningCurvePoint[]>; // personaName → curve
}

// ---------------------------------------------------------------------------
// Checkpoint serialization helpers
// ---------------------------------------------------------------------------

/** Serializable form of ComponentAttribution (Map → entries) */
export interface ComponentAttributionSerialized {
  byRelation: Array<[string, RelationshipSource]>;
  counts: Record<RelationshipSource, number>;
}

export function serializeAttribution(attr: ComponentAttribution): ComponentAttributionSerialized {
  return {
    byRelation: Array.from(attr.byRelation.entries()),
    counts: attr.counts,
  };
}

export function deserializeAttribution(
  serialized: ComponentAttributionSerialized,
): ComponentAttribution {
  return {
    byRelation: new Map(serialized.byRelation),
    counts: serialized.counts,
  };
}

export function emptyAttribution(): ComponentAttribution {
  return {
    byRelation: new Map(),
    counts: {
      'keyword-pattern': 0,
      'co-occurrence': 0,
      'enrichment-mining': 0,
      'user-correction': 0,
    },
  };
}
