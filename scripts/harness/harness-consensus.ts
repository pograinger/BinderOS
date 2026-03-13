/**
 * Production consensus wrapper for the harness Node.js context.
 *
 * runHarnessConsensus(): runs all 4 specialist ONNX models via onnxruntime-node
 * (no Worker) and returns a ConsensusResult for a single atom's canonical vector.
 *
 * deriveRiskLabels(): maps CorpusItem metadata to boolean risk labels for
 * computing the impact component of EII.
 *
 * computeHarnessImpact(): computes recall-based impact (recall@k minus baseline,
 * normalized) — matches the formula from eii-experiment.py lines 527-546.
 *
 * CRITICAL: Do NOT use specialist-runner.ts here — it uses `new Worker(...)` which
 * fails in Node.js. Call computeConsensus() from consensus-voter.ts directly.
 *
 * Phase 37: EII-02
 */

import { computeConsensus } from '../../src/ai/consensus/consensus-voter.js';
import {
  SPECIALIST_WEIGHTS,
  SPECIALIST_FEATURE_SLICES,
} from '../../src/ai/consensus/types.js';
import { computeEII } from '../../src/ai/eii/index.js';
import type { HarnessONNXSessions } from './harness-onnx.js';
import { runSpecialistInference } from './harness-onnx.js';
import type { ConsensusResult, SpecialistOutput } from '../../src/ai/consensus/types.js';
import type { EIIResult } from '../../src/ai/eii/types.js';
import type { CorpusItem } from './generate-corpus.js';

// Re-export so callers can use without importing eii/index directly
export type { EIIResult };
export { computeEII };

// ---------------------------------------------------------------------------
// runHarnessConsensus — run all specialists and aggregate
// ---------------------------------------------------------------------------

/**
 * Run all 4 specialist ONNX models for a single canonical vector and return
 * the aggregated ConsensusResult.
 *
 * Iterates SPECIALIST_FEATURE_SLICES (from consensus/types.ts), calls
 * runSpecialistInference() for each, then calls computeConsensus() directly.
 *
 * @param sessions    - Loaded HarnessONNXSessions (from loadSpecialistSessions)
 * @param fullVector  - Full 84-dim canonical vector [task | person | calendar]
 */
export async function runHarnessConsensus(
  sessions: HarnessONNXSessions,
  fullVector: number[],
): Promise<ConsensusResult> {
  const outputs: SpecialistOutput[] = [];

  for (const [key, slice] of Object.entries(SPECIALIST_FEATURE_SLICES)) {
    // Skip if this specialist's model isn't loaded (graceful degradation)
    if (!sessions.specialists[key]) {
      console.warn(`[harness-consensus] No ONNX session for specialist: ${key} — skipping`);
      continue;
    }

    const probability = await runSpecialistInference(
      sessions,
      fullVector,
      key,
      slice.featureIndices,
    );

    outputs.push({
      name: key,
      probability,
      weight: SPECIALIST_WEIGHTS[key] ?? 1.0,
    });
  }

  return computeConsensus(outputs);
}

// ---------------------------------------------------------------------------
// deriveRiskLabels — map corpus metadata to boolean risk labels
// ---------------------------------------------------------------------------

/**
 * Map each CorpusItem to a boolean risk label for impact computation.
 *
 * Risk threshold definition:
 *   An item is "risky" if ANY of the following are true:
 *   1. Has a deadline AND deadline is within 7 days (metadata.deadline or metadata.dueDate)
 *   2. Has metadata.waitingFor or metadata.status === 'waiting'
 *   3. Has metadata.priority === 'high' or metadata.priorityTier === 'critical'
 *
 * These criteria match real GTD risk signals — items that need immediate attention.
 * The 7-day deadline window is aligned with the staleness-risk specialist's training.
 *
 * @param corpus - Array of CorpusItems from the harness corpus
 * @returns Boolean array, same length as corpus, true = risky atom
 */
export function deriveRiskLabels(corpus: CorpusItem[]): boolean[] {
  const now = Date.now();
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  return corpus.map((item) => {
    const meta = (item as CorpusItem & { metadata?: Record<string, unknown> }).metadata;
    if (!meta) return false;

    // Check deadline proximity (within 7 days)
    const deadlineStr = (meta['deadline'] ?? meta['dueDate']) as string | undefined;
    if (deadlineStr) {
      const deadlineMs = new Date(deadlineStr).getTime();
      if (!isNaN(deadlineMs) && deadlineMs - now <= SEVEN_DAYS_MS) {
        return true;
      }
    }

    // Check waiting status
    if (meta['waitingFor'] || meta['status'] === 'waiting') {
      return true;
    }

    // Check priority
    if (meta['priority'] === 'high' || meta['priorityTier'] === 'critical') {
      return true;
    }

    return false;
  });
}

// ---------------------------------------------------------------------------
// computeHarnessImpact — recall-based impact matching eii-experiment.py
// ---------------------------------------------------------------------------

/**
 * Compute the impact component of EII from consensus predictions and ground-truth
 * risk labels.
 *
 * Algorithm (matches eii-experiment.py lines 527-546):
 *   1. Rank atoms by consensus probability (descending).
 *   2. Take top-k atoms (default k = 30% of total).
 *   3. modelRecall = fraction of truly risky atoms in top-k.
 *   4. baselineRecall = total risky / total atoms.
 *   5. impact = (modelRecall - baselineRecall) / (1 - baselineRecall), clamped to [0, 1].
 *
 * Returns 0 if there are no risky atoms (no ground truth signal available).
 *
 * @param riskLabels     - Boolean risk labels (from deriveRiskLabels)
 * @param consensusProbs - Weighted probability per atom (from ConsensusResult.weightedProbability)
 * @param topKPct        - Fraction of atoms to consider "top-k" (default 0.3)
 */
export function computeHarnessImpact(
  riskLabels: boolean[],
  consensusProbs: number[],
  topKPct = 0.3,
): number {
  const n = riskLabels.length;
  if (n === 0) return 0;

  const totalRisky = riskLabels.filter(Boolean).length;
  if (totalRisky === 0) return 0;

  // Sort indices by consensus probability descending
  const indices = Array.from({ length: n }, (_, i) => i);
  indices.sort((a, b) => (consensusProbs[b] ?? 0) - (consensusProbs[a] ?? 0));

  // Take top-k
  const k = Math.max(1, Math.round(n * topKPct));
  const topK = indices.slice(0, k);

  // Count risky atoms in top-k
  const riskyInTopK = topK.filter((i) => riskLabels[i]).length;

  const modelRecall = riskyInTopK / totalRisky;
  const baselineRecall = totalRisky / n;

  // Guard: if baseline is already 1.0 (all atoms are risky), impact is undefined
  if (baselineRecall >= 1.0) return 0;

  const impact = (modelRecall - baselineRecall) / (1 - baselineRecall);

  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, impact));
}
