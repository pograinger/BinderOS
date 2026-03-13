/**
 * Momentum builder — async Dexie query + prediction cache.
 *
 * Computes MomentumVector from the recent atom history window using
 * exponential decay weighting. Provides entity trajectory scores
 * with recency decay and user-correction boost.
 *
 * Exposes cache management and harness hooks for ablation testing.
 *
 * Phase 32: PRED-02
 */

import { db } from '../../storage/db';
import type { PredictionConfig } from '../../config/binder-types/schema';
import type { MomentumVector } from './predictive-scorer';

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  result: MomentumVector;
  entityScores: Record<string, number>;
  timestamp: number;
}

/** In-memory prediction cache keyed by binderId. */
const _predictionCache = new Map<string, CacheEntry>();

/** Invalidation log for harness analysis. */
const _invalidationLog: Array<{ binderId: string; reason: string; timestamp: number }> = [];

// ---------------------------------------------------------------------------
// computeMomentumVector
// ---------------------------------------------------------------------------

/**
 * Compute a momentum vector from the recent atom history for a binder.
 *
 * Uses a hybrid window: atoms must be within both `windowSize` count AND
 * `maxWindowHours` time. Applies exponential decay by position (index 0 = newest).
 *
 * Results are cached for `config.cacheTtlMs` milliseconds.
 *
 * @param binderId - The binder to compute momentum for
 * @param config - Prediction config (window size, half-life, cold-start threshold, TTL)
 * @returns { momentum, entityScores }
 */
export async function computeMomentumVector(
  binderId: string,
  config: PredictionConfig,
): Promise<{ momentum: MomentumVector; entityScores: Record<string, number> }> {
  // Cache hit check
  const cached = _predictionCache.get(binderId);
  if (cached && Date.now() - cached.timestamp < config.cacheTtlMs) {
    return { momentum: cached.result, entityScores: cached.entityScores };
  }

  // Fetch all atom IDs for this binder
  const atomIds = await db.atoms.where('binderId').equals(binderId).primaryKeys() as string[];

  // Batch-fetch atomIntelligence rows
  const allRows = await db.atomIntelligence.where('atomId').anyOf(atomIds).toArray();

  // Filter: only rows with at least one cognitive signal
  const rowsWithSignals = allRows.filter((row) => row.cognitiveSignals && row.cognitiveSignals.length > 0);

  // Apply hybrid window:
  // 1. Filter by maxWindowHours (time cutoff)
  const cutoffMs = Date.now() - config.maxWindowHours * 3600000;
  const timeFiltered = rowsWithSignals.filter((row) => row.lastUpdated >= cutoffMs);

  // 2. Sort by lastUpdated descending (newest first) and take windowSize
  timeFiltered.sort((a, b) => b.lastUpdated - a.lastUpdated);
  const windowedRows = timeFiltered.slice(0, config.windowSize);

  // Cold-start check
  const coldStart = windowedRows.length < config.coldStartThreshold;

  // Build momentum with exponential decay
  const signalFrequency: Record<string, number> = {};
  const signalStrength: Record<string, number> = {};

  for (let i = 0; i < windowedRows.length; i++) {
    const row = windowedRows[i];
    if (!row) continue;
    // Weight: newest (i=0) gets weight=1.0, each subsequent atom decays by half-life
    const weight = Math.exp(-(Math.LN2 / config.momentumHalfLife) * i);

    for (const signal of row.cognitiveSignals) {
      const key = signal.modelId;
      signalFrequency[key] = (signalFrequency[key] ?? 0) + weight;
      signalStrength[key] = (signalStrength[key] ?? 0) + weight * signal.confidence;
    }
  }

  const momentum: MomentumVector = {
    signalFrequency,
    signalStrength,
    entityScores: {}, // entity scores computed separately via computeEntityTrajectory
    coldStart,
    atomCount: windowedRows.length,
  };

  const result = { momentum, entityScores: {} };

  // Cache the result
  _predictionCache.set(binderId, {
    result: momentum,
    entityScores: {},
    timestamp: Date.now(),
  });

  return result;
}

// ---------------------------------------------------------------------------
// computeEntityTrajectory
// ---------------------------------------------------------------------------

/**
 * Compute entity trajectory scores for the entities detected in the current atom.
 *
 * Uses recency-decayed mentionCount from the Entity table, with a 2x boost
 * for entities that have user-correction relations.
 *
 * Returns empty record if:
 * - atomEntityIds is empty
 * - Entity count with mentions is below entityColdStartThreshold
 *
 * @param binderId - Binder context (used for entity cold-start check)
 * @param atomEntityIds - Entity IDs detected in the current atom
 * @param config - Prediction config
 */
export async function computeEntityTrajectory(
  binderId: string,
  atomEntityIds: string[],
  config: PredictionConfig,
): Promise<Record<string, number>> {
  if (atomEntityIds.length === 0) return {};

  // Entity cold-start check: count entities in registry
  const entityCount = await (db.entities as any).where('id').anyOf(atomEntityIds).count();
  if (entityCount < config.entityColdStartThreshold) {
    return {};
  }

  // Fetch entity relations to check for user-corrections
  const relations = await (db.entityRelations as any).where('sourceEntityId').anyOf(atomEntityIds).toArray();
  const correctedEntityIds = new Set<string>(
    relations
      .filter((r: any) => r.sourceAttribution === 'user-correction')
      .map((r: any) => r.sourceEntityId)
  );

  // Compute trajectory score for each entity
  const scores: Record<string, number> = {};

  for (const entityId of atomEntityIds) {
    const entity = await (db.entities as any).get(entityId);
    if (!entity) continue;

    const DAY_MS = 24 * 60 * 60 * 1000;
    const daysSince = Math.max(0, (Date.now() - entity.lastSeen) / DAY_MS);
    const decayRate = Math.LN2 / config.momentumHalfLife;
    let score = entity.mentionCount * Math.exp(-decayRate * daysSince);

    // User-correction boost: 2x multiplier
    if (correctedEntityIds.has(entityId)) {
      score *= 2.0;
    }

    scores[entityId] = score;
  }

  return scores;
}

// ---------------------------------------------------------------------------
// Cache management exports (harness hooks)
// ---------------------------------------------------------------------------

/**
 * Invalidate the prediction cache entry for a binder.
 * Records the invalidation in the log for harness analysis.
 */
export function invalidateCache(binderId: string, reason = 'manual'): void {
  _predictionCache.delete(binderId);
  _invalidationLog.push({ binderId, reason, timestamp: Date.now() });
}

/**
 * Get the current cache entry for a binder (or undefined if not cached).
 * Used by harness to inspect cache state without triggering computation.
 */
export function getCacheState(
  binderId: string,
): { result: MomentumVector; entityScores: Record<string, number>; timestamp: number } | undefined {
  return _predictionCache.get(binderId);
}

/**
 * Get the full invalidation log (for harness analysis).
 */
export function getInvalidationLog(): Array<{ binderId: string; reason: string; timestamp: number }> {
  return [..._invalidationLog];
}

/**
 * Clear the invalidation log (for harness test isolation).
 */
export function clearInvalidationLog(): void {
  _invalidationLog.length = 0;
}
