/**
 * Pure consensus voter function.
 *
 * computeConsensus() aggregates specialist risk estimates into a single
 * consensus result using weighted average, majority vote, and pairwise
 * agreement scoring.
 *
 * This module is pure — no side effects, no Dexie, no store imports.
 *
 * Phase 36: CONS-02
 */

import type { SpecialistOutput, ConsensusResult } from './types';

/**
 * Aggregate specialist outputs into a consensus result.
 *
 * Algorithm:
 * - weightedProbability = sum(p_i * w_i) / sum(w_i)
 * - majorityVote = count(p >= 0.5) >= ceil(n / 2)
 * - agreementScore = agreeing pairs / total pairs
 *   where a pair agrees if both p >= 0.5 or both p < 0.5
 *   (single specialist → agreementScore = 1.0, no pairs to disagree)
 *
 * @throws {Error} if outputs array is empty
 */
export function computeConsensus(outputs: SpecialistOutput[]): ConsensusResult {
  if (outputs.length === 0) {
    throw new Error('No specialist outputs');
  }

  // ---------------------------------------------------------------------------
  // Weighted average probability
  // ---------------------------------------------------------------------------
  let weightedSum = 0;
  let totalWeight = 0;
  for (const s of outputs) {
    weightedSum += s.probability * s.weight;
    totalWeight += s.weight;
  }
  const weightedProbability = weightedSum / totalWeight;

  // ---------------------------------------------------------------------------
  // Majority vote: count specialists signalling risk (p >= 0.5)
  // ---------------------------------------------------------------------------
  const riskCount = outputs.filter((s) => s.probability >= 0.5).length;
  const majorityThreshold = Math.ceil(outputs.length / 2);
  const majorityVote = riskCount >= majorityThreshold;

  // ---------------------------------------------------------------------------
  // Pairwise agreement score
  // ---------------------------------------------------------------------------
  let agreementScore: number;

  if (outputs.length === 1) {
    // No pairs — single specialist is trivially unanimous
    agreementScore = 1.0;
  } else {
    let agreedPairs = 0;
    let totalPairs = 0;

    for (let i = 0; i < outputs.length; i++) {
      for (let j = i + 1; j < outputs.length; j++) {
        totalPairs++;
        const iRisk = outputs[i]!.probability >= 0.5;
        const jRisk = outputs[j]!.probability >= 0.5;
        if (iRisk === jRisk) {
          agreedPairs++;
        }
      }
    }

    agreementScore = agreedPairs / totalPairs;
  }

  // ---------------------------------------------------------------------------
  // Build result
  // ---------------------------------------------------------------------------
  return {
    weightedProbability,
    majorityVote,
    agreementScore,
    specialistContributions: outputs,
    computedAt: Date.now(),
  };
}
