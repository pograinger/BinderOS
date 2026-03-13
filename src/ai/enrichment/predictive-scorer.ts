/**
 * Predictive enrichment scorer — pure function module.
 *
 * Replaces static computeSignalRelevance() with a momentum-based prediction
 * system. Uses exponentially-weighted signal frequency/strength history and
 * entity trajectory scores to predict what enrichment questions the user
 * needs next.
 *
 * Pure module — no store imports, no Dexie, no side effects.
 * All state is passed by caller.
 *
 * Phase 32: PRED-01
 */

import type { MissingInfoCategory } from '../clarification/types';
import type { PredictionConfig } from '../../config/binder-types/schema';

export type { PredictionConfig };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Momentum vector computed from the recent atom history window.
 * Captures exponentially-weighted signal frequency and strength,
 * plus entity trajectory scores for the current atom's entities.
 */
export interface MomentumVector {
  /** Decay-weighted sum of signal appearances per model ID */
  signalFrequency: Record<string, number>;
  /** Decay-weighted sum of signal confidence per model ID */
  signalStrength: Record<string, number>;
  /** Entity trajectory scores keyed by entity ID (pre-computed by momentum builder) */
  entityScores: Record<string, number>;
  /** True when fewer atoms than coldStartThreshold have cognitive signals */
  coldStart: boolean;
  /** Number of atoms included in the momentum window */
  atomCount: number;
}

/**
 * Ranked enrichment category with momentum-weighted score and explanation.
 */
export interface CategoryRanking {
  category: MissingInfoCategory;
  /** Fused relevance score: selfRelevance * (1 + momentumBoost) * (1 + entityBoost) */
  score: number;
  /** Human-readable explanation of the dominant scoring contributor */
  explanation: string;
}

/**
 * Entity-specific enrichment question candidate.
 * Generated for high-trajectory entities in the current atom.
 */
export interface EntityQuestionCandidate {
  entityId: string;
  category: MissingInfoCategory;
  score: number;
  explanation: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default ordering for cold-start and tie-breaking.
 * Matches GTD priority: outcome → action → timeframe → context → reference.
 */
export const ALL_CATEGORIES: MissingInfoCategory[] = [
  'missing-outcome',
  'missing-next-action',
  'missing-timeframe',
  'missing-context',
  'missing-reference',
];

// ---------------------------------------------------------------------------
// Config extension (scorer-side, not schema-side)
// ---------------------------------------------------------------------------

/**
 * Extended prediction config passed to predictEnrichmentOrder().
 * Includes the JSON map fields from binder type config plus optional scorer tuning.
 */
export interface ScorerConfig {
  /** Maps cognitive model IDs → MissingInfoCategory arrays */
  signalCategoryMap: Record<string, string[]>;
  /** Maps entity types (PER, LOC, ORG) → MissingInfoCategory arrays */
  entityCategoryMap: Record<string, string[]>;
  /** Weight multipliers per entity type for entity boost computation */
  entityTypePriorityWeights?: Record<string, number>;
  /** Maps entity IDs to their NER type (PER, LOC, ORG) */
  entityTypeMap?: Record<string, string>;
  /** Maximum enrichment depth per category (from maturityThresholds.maxEnrichmentDepth) */
  maxEnrichmentDepth?: number;
}

// ---------------------------------------------------------------------------
// Core scoring function
// ---------------------------------------------------------------------------

/**
 * Predict enrichment category order for the given atom using momentum signals.
 *
 * @param atomSignals - ONNX signal outputs for the current atom (may be null for cold atoms)
 * @param momentum - Pre-computed momentum vector from momentum builder
 * @param entityScores - Entity trajectory scores keyed by entity ID
 * @param depthMap - Current enrichment depth per category key
 * @param config - Scorer configuration (signal/entity maps, weights)
 * @returns CategoryRanking[] sorted by score descending
 */
export function predictEnrichmentOrder(
  atomSignals: { signals: Record<string, { label: string; confidence: number }> } | null,
  momentum: MomentumVector,
  entityScores: Record<string, number>,
  depthMap: Record<string, number>,
  config: ScorerConfig,
): CategoryRanking[] {
  // Cold-start: return static ordering with sentinel scores
  if (momentum.coldStart) {
    return ALL_CATEGORIES.map((category) => ({
      category,
      score: 0,
      explanation: 'cold-start: static ordering',
    }));
  }

  const maxDepth = config.maxEnrichmentDepth ?? Infinity;

  // Filter categories at max depth
  const eligibleCategories = ALL_CATEGORIES.filter((cat) => {
    const depth = depthMap[cat] ?? 0;
    return depth < maxDepth;
  });

  // Precompute max frequency and strength for normalization
  const allFreqValues = Object.values(momentum.signalFrequency);
  const maxFreq = allFreqValues.length > 0 ? Math.max(...allFreqValues) : 0;
  const allStrengthValues = Object.values(momentum.signalStrength);
  const maxStrength = allStrengthValues.length > 0 ? Math.max(...allStrengthValues) : 0;

  // Precompute entity boost per category for normalization
  const entityBoostByCategory: Record<string, number> = {};
  const entityTypeMap = config.entityTypeMap ?? {};
  const entityTypePriorityWeights = config.entityTypePriorityWeights ?? {};

  for (const category of eligibleCategories) {
    let entityBoostSum = 0;
    for (const [entityId, score] of Object.entries(entityScores)) {
      const entityType = entityTypeMap[entityId];
      if (!entityType) continue;
      const mappedCategories = config.entityCategoryMap[entityType] ?? [];
      if (mappedCategories.includes(category)) {
        const typeWeight = entityTypePriorityWeights[entityType] ?? 1.0;
        entityBoostSum += score * typeWeight;
      }
    }
    entityBoostByCategory[category] = entityBoostSum;
  }

  // Normalize entity boosts
  const allEntityBoosts = Object.values(entityBoostByCategory);
  const maxEntityBoost = allEntityBoosts.length > 0 ? Math.max(...allEntityBoosts) : 0;

  // Score each eligible category
  const rankings: CategoryRanking[] = eligibleCategories.map((category) => {
    // 1. Self-relevance from atom signals
    let selfRelevance: number;
    if (atomSignals === null) {
      selfRelevance = 1.0; // uniform base when no signals
    } else {
      const mappedModelIds = Object.entries(config.signalCategoryMap)
        .filter(([, cats]) => cats.includes(category))
        .map(([modelId]) => modelId);

      if (mappedModelIds.length === 0) {
        selfRelevance = 1.0;
      } else {
        let signalSum = 0;
        for (const modelId of mappedModelIds) {
          const sig = atomSignals.signals[modelId];
          if (sig) {
            // Higher confidence = signal is already present → lower need for this category
            // Lower confidence = signal gap → higher enrichment need
            signalSum += 1 - sig.confidence;
          } else {
            signalSum += 1.0; // missing signal → full need
          }
        }
        selfRelevance = signalSum / mappedModelIds.length;
        // Ensure at least a small positive value
        selfRelevance = Math.max(0.01, selfRelevance);
      }
    }

    // 2. Frequency boost: normalized decay-weighted signal frequency for this category
    let frequencyBoost = 0;
    if (maxFreq > 0) {
      const mappedModelIds = Object.entries(config.signalCategoryMap)
        .filter(([, cats]) => cats.includes(category))
        .map(([modelId]) => modelId);

      let freqSum = 0;
      for (const modelId of mappedModelIds) {
        freqSum += momentum.signalFrequency[modelId] ?? 0;
      }
      frequencyBoost = mappedModelIds.length > 0 ? freqSum / mappedModelIds.length / maxFreq : 0;
    }

    // 3. Strength boost: normalized decay-weighted signal strength for this category
    let strengthBoost = 0;
    if (maxStrength > 0) {
      const mappedModelIds = Object.entries(config.signalCategoryMap)
        .filter(([, cats]) => cats.includes(category))
        .map(([modelId]) => modelId);

      let strengthSum = 0;
      for (const modelId of mappedModelIds) {
        strengthSum += momentum.signalStrength[modelId] ?? 0;
      }
      strengthBoost = mappedModelIds.length > 0 ? strengthSum / mappedModelIds.length / maxStrength : 0;
    }

    // 4. Entity boost: normalized entity trajectory contribution
    const rawEntityBoost = entityBoostByCategory[category] ?? 0;
    const normalizedEntityBoost = maxEntityBoost > 0 ? rawEntityBoost / maxEntityBoost : 0;

    // 5. Fuse: score = selfRelevance * (1 + momentumBoost) * (1 + entityBoost)
    const momentumBoost = frequencyBoost * 0.5 + strengthBoost * 0.5;
    const score = selfRelevance * (1 + momentumBoost) * (1 + normalizedEntityBoost);

    // 6. Build explanation describing dominant contributor
    const explanation = buildExplanation(category, selfRelevance, momentumBoost, normalizedEntityBoost);

    return { category, score, explanation };
  });

  // Sort by score descending; stable tie-break by category index in ALL_CATEGORIES
  rankings.sort((a, b) => {
    const scoreDiff = b.score - a.score;
    if (Math.abs(scoreDiff) > 1e-9) return scoreDiff;
    return ALL_CATEGORIES.indexOf(a.category) - ALL_CATEGORIES.indexOf(b.category);
  });

  return rankings;
}

// ---------------------------------------------------------------------------
// Entity question generation
// ---------------------------------------------------------------------------

/**
 * Generate entity-specific enrichment question candidates for high-trajectory entities.
 *
 * @param entityScores - Entity trajectory scores keyed by entity ID
 * @param entityCategoryMap - Maps entity types to enrichment categories
 * @param entityTypePriorityWeights - Weight multipliers per entity type
 * @param entityTypeMap - Maps entity IDs to their NER type
 * @param cap - Maximum number of candidates to return (default 2)
 */
export function generateEntityQuestions(
  entityScores: Record<string, number>,
  entityCategoryMap: Record<string, string[]>,
  entityTypePriorityWeights: Record<string, number>,
  entityTypeMap: Record<string, string>,
  cap = 2,
): EntityQuestionCandidate[] {
  // Sort entities by score descending
  const sortedEntities = Object.entries(entityScores)
    .sort(([, a], [, b]) => b - a)
    .slice(0, cap);

  const candidates: EntityQuestionCandidate[] = [];

  for (const [entityId, score] of sortedEntities) {
    const entityType = entityTypeMap[entityId];
    if (!entityType) continue;

    const mappedCategories = entityCategoryMap[entityType] ?? [];
    if (mappedCategories.length === 0) continue;

    const primaryCategory = mappedCategories[0] as MissingInfoCategory;
    const typeWeight = entityTypePriorityWeights[entityType] ?? 1.0;
    const weightedScore = score * typeWeight;

    candidates.push({
      entityId,
      category: primaryCategory,
      score: weightedScore,
      explanation: `entity ${entityType} trajectory: score ${score.toFixed(2)}, weight ${typeWeight}`,
    });
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildExplanation(
  category: MissingInfoCategory,
  selfRelevance: number,
  momentumBoost: number,
  entityBoost: number,
): string {
  const parts: string[] = [];

  if (entityBoost > 0.5) {
    parts.push(`entity trajectory (boost: ${entityBoost.toFixed(2)})`);
  }

  if (momentumBoost > 0.3) {
    parts.push(`rising signal momentum (boost: ${momentumBoost.toFixed(2)})`);
  }

  if (selfRelevance < 0.3) {
    parts.push(`atom signals already present (relevance: ${selfRelevance.toFixed(2)})`);
  } else if (selfRelevance > 0.7) {
    parts.push(`atom signal gap (relevance: ${selfRelevance.toFixed(2)})`);
  }

  if (parts.length === 0) {
    return `${category}: baseline relevance`;
  }

  return `${category}: ${parts.join(', ')}`;
}
