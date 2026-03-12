/**
 * Recency decay utility for entity relevance scoring.
 *
 * Applies exponential decay to entity relevance based on how long ago
 * the entity was last seen. The half-life is 30 days — an entity with
 * mentionCount=10 seen 30 days ago has the same relevance as an entity
 * with mentionCount=5 seen today.
 *
 * Formula: relevance = mentionCount * exp(-(ln2 / HALF_LIFE_DAYS) * daysSince)
 *
 * Pure utility — no imports, no side effects.
 *
 * Phase 29: ENTC-02
 */

/** Half-life for entity relevance decay, in days. */
export const HALF_LIFE_DAYS = 30;

/**
 * Compute the recency-weighted relevance of an entity.
 *
 * @param mentionCount - Raw mention count for the entity
 * @param lastSeenMs - Timestamp (ms) when entity was last seen
 * @param nowMs - Current timestamp (ms). Defaults to Date.now() if omitted.
 * @returns Decayed relevance score (non-negative float)
 */
export function computeEntityRelevance(
  mentionCount: number,
  lastSeenMs: number,
  nowMs?: number,
): number {
  const now = nowMs ?? Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const daysSince = Math.max(0, (now - lastSeenMs) / DAY_MS);
  const decayRate = Math.LN2 / HALF_LIFE_DAYS;
  return mentionCount * Math.exp(-decayRate * daysSince);
}
