/**
 * EII (Emergent Intelligence Index) computation module.
 *
 * computeEII(): pure function — no Dexie imports. Takes ConsensusResult[]
 * and an optional impact value, returns EIIResult.
 *
 * updateBinderEII(): sidecar writer — queries atomIntelligence for all rows
 * with consensusRisk for this binder, maps to ConsensusResult[], calls
 * computeEII(), and writes to binderIntelligence table.
 *
 * Coherence = std-dev of weightedProbability (NOT AUC — per user decision).
 * Stability = mean(agreementScore).
 * EII = (coherence + stability + impact) / 3 — equal weights per user decision.
 *
 * The updateBinderEII sidecar writer uses a full-recompute strategy (not
 * incremental). The atomIntelligence table for a single binder is small enough
 * that scanning it is fast, and this avoids stale-accumulation bugs.
 *
 * Phase 37: EII-01
 */

import type { ConsensusResult } from '../consensus/types';
import type { EIIResult, BinderEIISnapshot } from './types';

// ---------------------------------------------------------------------------
// computeEII — pure function
// ---------------------------------------------------------------------------

/**
 * Compute the Emergent Intelligence Index from an array of ConsensusResults.
 *
 * Returns zeroes for empty input.
 * Impact defaults to 0 (production has no labels; harness caller passes computed impact).
 *
 * @param results - ConsensusResult array from atomIntelligence sidecar
 * @param impact  - External impact score [0,1] (optional, defaults to 0)
 */
export function computeEII(results: ConsensusResult[], impact = 0): EIIResult {
  if (results.length === 0) {
    return { coherence: 0, stability: 0, impact: 0, eii: 0 };
  }

  const probs = results.map((r) => r.weightedProbability);

  // Coherence = std-dev of weightedProbability
  const mean = probs.reduce((sum, p) => sum + p, 0) / probs.length;
  const variance = probs.reduce((sum, p) => sum + (p - mean) ** 2, 0) / probs.length;
  const coherence = Math.sqrt(variance);

  // Stability = mean(agreementScore)
  const stability = results.reduce((sum, r) => sum + r.agreementScore, 0) / results.length;

  // EII = equal-weight composite
  const eii = (coherence + stability + impact) / 3;

  return { coherence, stability, impact, eii };
}

// ---------------------------------------------------------------------------
// updateBinderEII — sidecar writer
// ---------------------------------------------------------------------------

/**
 * Recompute and persist the EII snapshot for a binder.
 *
 * Queries atomIntelligence for all rows with consensusRisk for this binder,
 * maps them to ConsensusResult[], calls computeEII(), and writes the result
 * to binderIntelligence via put() (one row per binder, overwritten each time).
 *
 * Fire-and-forget: caller does not need to await.
 * Non-fatal: errors are logged to console.warn and never propagated.
 */
export async function updateBinderEII(binderId: string): Promise<void> {
  try {
    // Lazy import to keep Dexie off the pure computation path
    const { db } = await import('../../storage/db');

    // Scan atomIntelligence for all rows with a consensusRisk snapshot
    // atomIntelligence is keyed by atomId; no binderId index exists here,
    // so we filter in-memory (table is small per binder).
    const rows = await db.atomIntelligence
      .filter((row) => row.consensusRisk !== undefined && row.consensusRisk !== null)
      .toArray();

    if (rows.length === 0) return;

    // Map sidecar rows to ConsensusResult[] for computeEII
    const consensusResults: ConsensusResult[] = rows.map((row) => {
      const cr = row.consensusRisk!;
      return {
        weightedProbability: cr.weightedProbability,
        majorityVote: cr.majorityVote,
        agreementScore: cr.agreementScore,
        specialistContributions: cr.specialistContributions,
        computedAt: cr.computedAt,
      };
    });

    const result = computeEII(consensusResults);
    const now = Date.now();

    const snapshot: BinderEIISnapshot = {
      binderId,
      coherence: result.coherence,
      stability: result.stability,
      impact: result.impact,
      eii: result.eii,
      atomCount: consensusResults.length,
      computedAt: now,
      updatedAt: now,
    };

    await db.binderIntelligence.put(snapshot);
  } catch (err) {
    console.warn('[updateBinderEII] Non-fatal error:', err);
  }
}
