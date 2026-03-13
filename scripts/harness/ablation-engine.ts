/**
 * Ablation testing framework.
 *
 * Disables one component at a time and re-scores to measure each component's
 * contribution to the overall entity graph accuracy.
 *
 * Key design: ablation reuses pre-generated corpora from the full run,
 * so no new API calls are made for corpus generation. Only the pipeline
 * execution is repeated with a component disabled.
 *
 * Phase 29: TVAL-02
 */

import Anthropic from '@anthropic-ai/sdk';
import { HarnessEntityStore } from './harness-entity-store.js';
import {
  resetHarnessCooccurrence,
  flushHarnessCooccurrence,
  cleanSuppressedRelations,
} from './harness-inference.js';
import { runAdversarialCycle } from './adversarial-cycle.js';
import type { PersonaConfig } from './adversarial-cycle.js';
import { scoreEntityGraph } from './score-graph.js';
import type { GraphScore } from './score-graph.js';
import type {
  PersonaAdversarialResult,
  AblationConfig,
  CycleState,
} from './harness-types.js';
import type { CorpusItem } from './generate-corpus.js';
import { computeConsensus } from '../../src/ai/consensus/consensus-voter.js';
import { computeEII } from '../../src/ai/eii/index.js';
import type { ConsensusResult } from '../../src/ai/consensus/types.js';
import { computeHarnessImpact } from './harness-consensus.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// SpecialistAblationResult — EII impact of each specialist
// ---------------------------------------------------------------------------

/**
 * Per-specialist leave-one-out ablation result.
 *
 * Computed entirely post-hoc from stored specialistContributions — zero
 * re-inference cost. The ablation filters contributions and re-calls
 * computeConsensus() to produce ablated ConsensusResult[].
 *
 * eiiDelta = ablatedEII - fullEII.
 *   Negative = removing this specialist hurt EII (specialist was contributing).
 *   Matches convention of computeAblationDelta: ablatedScore - fullScore.
 *
 * consensusLift = fullEII - singleSpecialistEII.
 *   Positive = ensemble beats running any single specialist alone.
 */
export interface SpecialistAblationResult {
  /** Name of the specialist removed in this pass */
  specialistRemoved: string;
  /** Full-ensemble EII before removal */
  fullConsensusEII: number;
  /** EII computed with this specialist excluded */
  ablatedConsensusEII: number;
  /** ablated - full (negative = specialist was helping) */
  eiiDelta: number;
  /** true positive rate delta between full and ablated runs */
  accuracyDelta: number;
  /** full ensemble EII minus single-specialist EII (positive = ensemble wins) */
  consensusLift: number;
}

// ---------------------------------------------------------------------------
// runSpecialistAblation — post-hoc leave-one-out ablation
// ---------------------------------------------------------------------------

/**
 * Run leave-one-out specialist ablation on stored ConsensusResult[].
 *
 * Post-hoc: zero re-inference. Filters specialistContributions and re-calls
 * computeConsensus() to produce ablated results. Returns specialists sorted
 * by |eiiDelta| descending (most impactful first).
 *
 * @param allConsensusResults - Accumulated ConsensusResult[] from the experiment
 * @param riskLabels          - Boolean risk labels aligned with consensusResults
 */
export function runSpecialistAblation(
  allConsensusResults: ConsensusResult[],
  riskLabels: boolean[],
): SpecialistAblationResult[] {
  if (allConsensusResults.length === 0) return [];

  // Discover specialist names from the first result with contributions
  const firstWithContribs = allConsensusResults.find(
    (r) => r.specialistContributions && r.specialistContributions.length > 0,
  );
  if (!firstWithContribs) return [];

  const specialistNames = firstWithContribs.specialistContributions.map((s) => s.name);

  // Compute full EII baseline
  const fullProbs = allConsensusResults.map((r) => r.weightedProbability);
  const fullImpact = computeHarnessImpact(riskLabels, fullProbs);
  const fullEIIResult = computeEII(allConsensusResults, fullImpact);
  const fullEII = fullEIIResult.eii;

  const ablationResults: SpecialistAblationResult[] = [];

  for (const removeSpecialist of specialistNames) {
    // Leave-one-out: filter contributions for each result
    const ablatedResults: ConsensusResult[] = [];
    for (const result of allConsensusResults) {
      const remaining = (result.specialistContributions ?? []).filter(
        (s) => s.name !== removeSpecialist,
      );
      if (remaining.length === 0) {
        // No specialists left — keep original result as fallback
        ablatedResults.push(result);
        continue;
      }
      ablatedResults.push(computeConsensus(remaining));
    }

    // Compute ablated EII
    const ablatedProbs = ablatedResults.map((r) => r.weightedProbability);
    const ablatedImpact = computeHarnessImpact(riskLabels, ablatedProbs);
    const ablatedEIIResult = computeEII(ablatedResults, ablatedImpact);
    const ablatedEII = ablatedEIIResult.eii;

    // Compute single-specialist EII (consensus_lift denominator)
    const singleResults: ConsensusResult[] = [];
    for (const result of allConsensusResults) {
      const onlyThis = (result.specialistContributions ?? []).filter(
        (s) => s.name === removeSpecialist,
      );
      if (onlyThis.length === 0) {
        singleResults.push(result);
        continue;
      }
      singleResults.push(computeConsensus(onlyThis));
    }
    const singleProbs = singleResults.map((r) => r.weightedProbability);
    const singleImpact = computeHarnessImpact(riskLabels, singleProbs);
    const singleEIIResult = computeEII(singleResults, singleImpact);
    const singleEII = singleEIIResult.eii;

    const eiiDelta = ablatedEII - fullEII;
    const consensusLift = fullEII - singleEII;

    // Accuracy delta: compare true positive rates (probs-based approximation)
    const fullTPR = computeHarnessImpact(riskLabels, fullProbs);
    const ablatedTPR = computeHarnessImpact(riskLabels, ablatedProbs);
    const accuracyDelta = ablatedTPR - fullTPR;

    ablationResults.push({
      specialistRemoved: removeSpecialist,
      fullConsensusEII: fullEII,
      ablatedConsensusEII: ablatedEII,
      eiiDelta,
      accuracyDelta,
      consensusLift,
    });
  }

  // Sort by absolute EII delta (most impactful specialist first)
  return ablationResults.sort((a, b) => Math.abs(b.eiiDelta) - Math.abs(a.eiiDelta));
}

/**
 * Result from sequence context ablation (Phase 33 / SEQ-04).
 * Records F1 comparison between 384-dim and 512-dim classifiers across window sizes.
 * Used to validate whether sequence context improves T2 classifier accuracy.
 */
export interface SequenceAblationResult {
  /** Window size tested (N prior atoms used as context) */
  windowSize: number;
  /** Baseline F1 per classifier (384-dim, no sequence context) */
  baselineF1: Record<string, number>;
  /** F1 per classifier with sequence context at this window size (512-dim) */
  sequenceF1: Record<string, number>;
  /** Delta per classifier: sequenceF1 - baselineF1 (positive = improvement) */
  deltaF1: Record<string, number>;
  /** Best window size by aggregate mean F1 delta */
  recommendedN: number;
  /** Whether to replace 384-dim classifiers with 512-dim */
  recommendation: 'replace' | 'keep_384';
}

export interface AblationDelta {
  entityF1Delta: number;
  relationshipF1Delta: number;
  privacyScoreDelta: number;
  /** Positive value = component contributed positively (removing it hurt) */
  overallImpact: number;
}

export interface AblationResult {
  /** Which component was disabled */
  componentDisabled: string;
  /** The ablation configuration used */
  config: AblationConfig;
  /** Final score after running with this component disabled */
  finalScore: GraphScore;
  /** Per-cycle scores across ablation run */
  perCycleScores: GraphScore[];
  /** Delta versus full run (negative values = this component was helping) */
  comparisonToFull: AblationDelta;
}

export interface ComponentRanking {
  componentName: string;
  impactScore: number; // absolute F1 delta — larger = more important
  relationshipF1Delta: number;
  entityF1Delta: number;
}

export interface AblationSuiteResult {
  /** Final scores from the unrestricted run (baseline for comparison) */
  fullRunScores: Record<string, GraphScore>;
  /** Per-component results: component name → ablation results per persona */
  perComponentResults: Map<string, AblationResult[]>;
  /** Components ranked by impact (largest delta first = most load-bearing) */
  componentRanking: ComponentRanking[];
}

// ---------------------------------------------------------------------------
// Ablation config factory
// ---------------------------------------------------------------------------

const ABLATION_COMPONENTS: Array<{
  name: string;
  config: AblationConfig;
}> = [
  {
    name: 'keyword-patterns',
    config: {
      disableKeywordPatterns: true,
      disableCooccurrence: false,
      disableEnrichmentMining: false,
      disableUserCorrections: false,
      disableRecencyDecay: false,
      label: 'No Keyword Patterns',
    },
  },
  {
    name: 'co-occurrence',
    config: {
      disableKeywordPatterns: false,
      disableCooccurrence: true,
      disableEnrichmentMining: false,
      disableUserCorrections: false,
      disableRecencyDecay: false,
      label: 'No Co-occurrence',
    },
  },
  {
    name: 'enrichment-mining',
    config: {
      disableKeywordPatterns: false,
      disableCooccurrence: false,
      disableEnrichmentMining: true,
      disableUserCorrections: false,
      disableRecencyDecay: false,
      label: 'No Enrichment Mining',
    },
  },
  {
    name: 'user-corrections',
    config: {
      disableKeywordPatterns: false,
      disableCooccurrence: false,
      disableEnrichmentMining: false,
      disableUserCorrections: true,
      disableRecencyDecay: false,
      label: 'No User Corrections',
    },
  },
  {
    name: 'recency-decay',
    config: {
      disableKeywordPatterns: false,
      disableCooccurrence: false,
      disableEnrichmentMining: false,
      disableUserCorrections: false,
      disableRecencyDecay: true,
      label: 'No Recency Decay',
    },
  },
];

// ---------------------------------------------------------------------------
// Persona complexity classification
// ---------------------------------------------------------------------------

/**
 * Classify persona complexity by counting ground truth relationships.
 * Low: < 12 relationships. High: > 18 relationships.
 */
function classifyComplexity(result: PersonaAdversarialResult): 'low' | 'high' {
  const relCount = result.cycles[result.cycles.length - 1]?.score.totalGroundTruthRelations ?? 0;
  return relCount <= 14 ? 'low' : 'high';
}

/**
 * Select 2 representative personas for ablation:
 * - 1 low-complexity (fewest GT relationships)
 * - 1 high-complexity (most GT relationships)
 * Falls back to all personas if fewer than 2 available.
 */
function selectRepresentativePersonas(
  personaResults: PersonaAdversarialResult[],
): PersonaAdversarialResult[] {
  if (personaResults.length <= 2) return personaResults;

  const sorted = [...personaResults].sort((a, b) => {
    const aRels = a.cycles[a.cycles.length - 1]?.score.totalGroundTruthRelations ?? 0;
    const bRels = b.cycles[b.cycles.length - 1]?.score.totalGroundTruthRelations ?? 0;
    return aRels - bRels;
  });

  return [sorted[0], sorted[sorted.length - 1]];
}

// ---------------------------------------------------------------------------
// Single ablation run
// ---------------------------------------------------------------------------

/**
 * Run ablation for one persona + one component disabled.
 * Uses pre-generated corpora from the full run — no new API calls for generation.
 * Only runs 3 cycles instead of 5 for cost control.
 */
export async function runAblation(
  persona: PersonaConfig,
  groundTruth: PersonaAdversarialResult['cycles'][0]['score'],
  existingCorpora: CorpusItem[][],
  config: AblationConfig,
  fullRunFinalScore: GraphScore,
  client: Anthropic,
): Promise<AblationResult> {
  // Fresh store for isolated ablation
  const store = new HarnessEntityStore();
  resetHarnessCooccurrence();

  const maxCycles = Math.min(3, existingCorpora.length);
  const perCycleScores: GraphScore[] = [];

  for (let cycleIdx = 0; cycleIdx < maxCycles; cycleIdx++) {
    const cycleNumber = cycleIdx + 1;
    const corpus = existingCorpora[cycleIdx];
    if (!corpus || corpus.length === 0) continue;

    try {
      // Re-run the cycle with pre-generated corpus and ablation config
      // We pass an empty previousGaps since we're using pre-built corpora
      const cycleState = await runAdversarialCycle(
        persona,
        cycleNumber,
        cycleIdx === 0 ? [] : [], // gaps don't matter — corpus is pre-generated
        cycleIdx === 0 ? null : perCycleScores.length > 0
          ? { // construct a minimal previous snapshot
            entities: [],
            relations: [],
            atomIntelligenceRecords: [],
            takenAt: new Date().toISOString(),
          }
          : null,
        perCycleScores.length > 0 ? perCycleScores[perCycleScores.length - 1] : null,
        store,
        client,
        config,
        0, // no delay for ablation — cheaper runs
      );
      perCycleScores.push(cycleState.score);
    } catch (err) {
      console.warn(`  [ablation:${config.label}] Cycle ${cycleNumber} failed: ${err}`);
    }
  }

  const finalScore = perCycleScores[perCycleScores.length - 1] ?? {
    checkpoint: 0, entityPrecision: 0, entityRecall: 0, entityF1: 0,
    relationshipPrecision: 0, relationshipRecall: 0, relationshipF1: 0,
    privacyScore: 0, totalDetectedEntities: 0, totalGroundTruthEntities: 0,
    correctEntities: 0, totalDetectedRelations: 0, totalGroundTruthRelations: 0,
    correctRelations: 0, foundEntities: [], missedEntities: [], foundRelations: [], missedRelations: [],
  } as GraphScore;

  const comparisonToFull = computeAblationDelta(fullRunFinalScore, finalScore);

  return {
    componentDisabled: config.label,
    config,
    finalScore,
    perCycleScores,
    comparisonToFull,
  };
}

// ---------------------------------------------------------------------------
// Full ablation suite
// ---------------------------------------------------------------------------

/**
 * Run full ablation suite across all 5 components using 2 representative personas.
 * Per research cost control: uses 3 cycles instead of 5, representative personas only.
 */
export async function runFullAblationSuite(
  personaResults: PersonaAdversarialResult[],
  personaConfigs: Map<string, PersonaConfig>,
  client: Anthropic,
): Promise<AblationSuiteResult> {
  const representatives = selectRepresentativePersonas(personaResults);
  console.log(`[ablation] Running suite on ${representatives.length} representative personas:`);
  for (const rep of representatives) {
    console.log(`  ${rep.personaName} (${classifyComplexity(rep)} complexity)`);
  }

  // Build full run score map
  const fullRunScores: Record<string, GraphScore> = {};
  for (const result of personaResults) {
    fullRunScores[result.personaName] = result.finalScore;
  }

  // Per-component results
  const perComponentResults = new Map<string, AblationResult[]>();

  for (const component of ABLATION_COMPONENTS) {
    console.log(`\n[ablation] Testing component: ${component.name}`);
    const componentResults: AblationResult[] = [];

    for (const rep of representatives) {
      const personaConfig = personaConfigs.get(rep.personaDirName);
      if (!personaConfig) {
        console.warn(`  No persona config found for ${rep.personaDirName}, skipping`);
        continue;
      }

      console.log(`  Persona: ${rep.personaName}`);

      // Extract pre-generated corpora from cycles
      const existingCorpora = rep.cycles.map((c) => c.corpus);
      const fullRunScore = fullRunScores[rep.personaName];

      try {
        const result = await runAblation(
          personaConfig,
          rep.finalScore,
          existingCorpora,
          component.config,
          fullRunScore,
          client,
        );
        componentResults.push(result);
        console.log(
          `  Result: RelF1=${(result.finalScore.relationshipF1 * 100).toFixed(1)}% ` +
          `(delta: ${(result.comparisonToFull.relationshipF1Delta * 100).toFixed(1)}%)`,
        );
      } catch (err) {
        console.error(`  Ablation failed for ${rep.personaName}: ${err}`);
      }
    }

    perComponentResults.set(component.name, componentResults);
  }

  const componentRanking = rankComponents({
    fullRunScores,
    perComponentResults,
  });

  return {
    fullRunScores,
    perComponentResults,
    componentRanking,
  };
}

// ---------------------------------------------------------------------------
// Scoring utilities
// ---------------------------------------------------------------------------

/**
 * Compute delta between full run score and ablated score.
 * Negative delta = ablating this component HURT the score (component was helping).
 * Positive delta = ablating this component HELPED or had no effect.
 */
export function computeAblationDelta(
  fullScore: GraphScore,
  ablatedScore: GraphScore,
): AblationDelta {
  const entityF1Delta = ablatedScore.entityF1 - fullScore.entityF1;
  const relationshipF1Delta = ablatedScore.relationshipF1 - fullScore.relationshipF1;
  const privacyScoreDelta = ablatedScore.privacyScore - fullScore.privacyScore;

  // Overall impact: weighted average of the three metrics (relationship F1 weighted highest)
  const overallImpact = entityF1Delta * 0.3 + relationshipF1Delta * 0.5 + privacyScoreDelta * 0.2;

  return {
    entityF1Delta,
    relationshipF1Delta,
    privacyScoreDelta,
    overallImpact,
  };
}

/**
 * Rank components by their contribution to the final score.
 * Most important component = largest absolute F1 delta when disabled.
 */
export function rankComponents(suiteResult: Pick<AblationSuiteResult, 'perComponentResults' | 'fullRunScores'>): ComponentRanking[] {
  const rankings: ComponentRanking[] = [];

  for (const [componentName, ablationResults] of suiteResult.perComponentResults.entries()) {
    if (ablationResults.length === 0) continue;

    // Average impact across personas
    const avgRelF1Delta =
      ablationResults.reduce((sum, r) => sum + r.comparisonToFull.relationshipF1Delta, 0) /
      ablationResults.length;

    const avgEntF1Delta =
      ablationResults.reduce((sum, r) => sum + r.comparisonToFull.entityF1Delta, 0) /
      ablationResults.length;

    const avgOverallImpact =
      ablationResults.reduce((sum, r) => sum + r.comparisonToFull.overallImpact, 0) /
      ablationResults.length;

    rankings.push({
      componentName,
      impactScore: Math.abs(avgOverallImpact),
      relationshipF1Delta: avgRelF1Delta,
      entityF1Delta: avgEntF1Delta,
    });
  }

  // Sort by absolute impact (most important first)
  return rankings.sort((a, b) => b.impactScore - a.impactScore);
}
