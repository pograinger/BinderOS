/**
 * Quality gate for enriched atoms.
 *
 * Computes a composite quality score from three dimensions:
 * 1. Tier source (which AI tier contributed) -- weight 0.4
 * 2. Maturity completeness (how many categories filled) -- weight 0.4
 * 3. User content (did the user provide freeform text) -- weight 0.2
 *
 * Pure module -- no store imports, no side effects.
 *
 * Phase 24: ENRICH-10
 */

import type { QualityLevel } from './types';
import { MODEL_IDS, getTiersUsed } from './provenance';

export type { QualityLevel };

/** Minimum quality score required for graduation from inbox. */
export const MIN_QUALITY_THRESHOLD = 0.4;

/** Quality result with numeric score and categorical level. */
export interface QualityResult {
  score: number;
  level: QualityLevel;
}

/**
 * Compute the composite quality score for an enriched atom.
 *
 * Scoring breakdown:
 * - Tier source (0-0.4): cloud=0.4, wasm_llm=0.3, onnx=0.2, none=0.0
 * - Maturity (0-0.4): maturityScore * 0.4
 * - User content (0-0.2): hasUserContent ? 0.2 : 0.0
 *
 * Level thresholds:
 * - >= 0.7: high
 * - >= 0.5: moderate
 * - >= 0.3: low
 * - < 0.3: insufficient
 */
export function computeQuality(params: {
  provenance: number;
  maturityScore: number;
  hasUserContent: boolean;
}): QualityResult {
  const { provenance, maturityScore, hasUserContent } = params;

  // Tier source weight: pick the highest tier that contributed
  const tiers = getTiersUsed(provenance);
  let tierScore: number;
  if (tiers.t3) {
    tierScore = 0.4;
  } else if (tiers.t2b) {
    tierScore = 0.3;
  } else if (tiers.t2a || tiers.t1) {
    tierScore = 0.2;
  } else {
    tierScore = 0.0;
  }

  // Maturity weight
  const maturityWeight = maturityScore * 0.4;

  // User content weight
  const userWeight = hasUserContent ? 0.2 : 0.0;

  const score = tierScore + maturityWeight + userWeight;

  // Determine level
  let level: QualityLevel;
  if (score >= 0.7) {
    level = 'high';
  } else if (score >= 0.5) {
    level = 'moderate';
  } else if (score >= 0.3) {
    level = 'low';
  } else {
    level = 'insufficient';
  }

  return { score, level };
}

/**
 * Check if a quality score meets the minimum threshold for graduation.
 */
export function isAboveMinimum(score: number): boolean {
  return score >= MIN_QUALITY_THRESHOLD;
}
