/**
 * EII (Emergent Intelligence Index) type definitions.
 *
 * EIIResult: per-computation result from computeEII().
 * BinderEIISnapshot: latest EII snapshot per binder, stored in binderIntelligence table.
 *
 * Coherence = std-dev of weightedProbability across atoms (specialist agreement variance).
 * Stability = mean agreementScore across atoms (pairwise specialist agreement).
 * Impact = external label passed by caller (production defaults to 0; harness computes from ground truth).
 * EII = (coherence + stability + impact) / 3 — equal weights per user decision.
 *
 * Phase 37: EII-01
 */

// ---------------------------------------------------------------------------
// EIIResult — output of computeEII()
// ---------------------------------------------------------------------------

/**
 * Emergent Intelligence Index result from a set of ConsensusResult records.
 *
 * All values are in [0, 1] range.
 */
export interface EIIResult {
  /** Std-dev of weightedProbability across atoms — captures specialist divergence */
  coherence: number;
  /** Mean agreementScore across atoms — captures specialist alignment per atom */
  stability: number;
  /** External measure of how meaningful consensus results are (harness-computed, production=0) */
  impact: number;
  /** Composite index: (coherence + stability + impact) / 3 */
  eii: number;
}

// ---------------------------------------------------------------------------
// BinderEIISnapshot — stored in binderIntelligence Dexie table
// ---------------------------------------------------------------------------

/**
 * Latest EII snapshot for a binder.
 *
 * One row per binder — overwritten on each update.
 * The binderIntelligence table is keyed by binderId with updatedAt as secondary index.
 */
export interface BinderEIISnapshot {
  /** Binder identifier — primary key */
  binderId: string;
  /** Std-dev of weightedProbability across all atoms in this binder */
  coherence: number;
  /** Mean agreementScore across all atoms in this binder */
  stability: number;
  /** External impact score (0 in production; harness-computed) */
  impact: number;
  /** Composite EII for this binder */
  eii: number;
  /** Number of atoms with consensus results included in this snapshot */
  atomCount: number;
  /** Unix ms when this snapshot was first computed */
  computedAt: number;
  /** Unix ms when this snapshot was last updated (indexed for recency queries) */
  updatedAt: number;
}
