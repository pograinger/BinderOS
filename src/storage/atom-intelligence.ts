/**
 * Intelligence sidecar CRUD helpers.
 *
 * Direct Dexie access (not through WriteQueue) per research recommendation --
 * sidecar writes are independent of atom content and don't need batching.
 *
 * Pure module: imports db only.
 *
 * Phase 26: SIDE-01, ENTR-01, ENTR-02
 * Phase 32: writePredictionMomentum, writeEntityMomentum fire-and-forget helpers
 */

import { db } from './db';
import type { AtomIntelligence, EnrichmentRecord, CachedCognitiveSignal, EntityMention } from '../types/intelligence';

/**
 * Create an empty intelligence sidecar row for an atom.
 */
function createEmptyIntelligence(atomId: string): AtomIntelligence {
  return {
    atomId,
    enrichment: [],
    entityMentions: [],
    cognitiveSignals: [],
    records: [],
    version: 1,
    deviceId: '',
    lastUpdated: Date.now(),
    schemaVersion: 1,
  };
}

/**
 * Get the intelligence sidecar for an atom (may be undefined).
 */
export async function getIntelligence(atomId: string): Promise<AtomIntelligence | undefined> {
  return db.atomIntelligence.get(atomId);
}

/**
 * Get or create the intelligence sidecar for an atom.
 * If no row exists, creates an empty one and persists it.
 */
export async function getOrCreateIntelligence(atomId: string): Promise<AtomIntelligence> {
  const existing = await db.atomIntelligence.get(atomId);
  if (existing) return existing;

  const fresh = createEmptyIntelligence(atomId);
  await db.atomIntelligence.put(fresh);
  return fresh;
}

/**
 * Append or replace an enrichment record for an atom.
 *
 * If a record with the same category + depth already exists, it is replaced.
 * Otherwise the new record is appended. Bumps version and lastUpdated.
 */
export async function writeEnrichmentRecord(
  atomId: string,
  record: EnrichmentRecord,
): Promise<void> {
  const intel = await getOrCreateIntelligence(atomId);

  // Replace existing record at same category+depth, or append
  const idx = intel.enrichment.findIndex(
    (r) => r.category === record.category && r.depth === record.depth,
  );
  if (idx >= 0) {
    intel.enrichment[idx] = record;
  } else {
    intel.enrichment.push(record);
  }

  intel.version++;
  intel.lastUpdated = Date.now();
  await db.atomIntelligence.put(intel);
}

/**
 * Replace all cached cognitive signals for an atom.
 * Bumps version and lastUpdated.
 */
export async function writeCognitiveSignals(
  atomId: string,
  signals: CachedCognitiveSignal[],
): Promise<void> {
  const intel = await getOrCreateIntelligence(atomId);
  intel.cognitiveSignals = signals;
  intel.version++;
  intel.lastUpdated = Date.now();
  await db.atomIntelligence.put(intel);
}

/**
 * Replace all entity mentions for an atom (full-replace strategy).
 *
 * On re-scan, old mentions are replaced entirely with new detection results.
 * Bumps version and lastUpdated.
 *
 * Phase 27: ENTD-03
 */
export async function writeEntityMentions(
  atomId: string,
  mentions: EntityMention[],
): Promise<void> {
  const intel = await getOrCreateIntelligence(atomId);
  intel.entityMentions = mentions;
  intel.version++;
  intel.lastUpdated = Date.now();
  await db.atomIntelligence.put(intel);
}

// ---------------------------------------------------------------------------
// Phase 32: Prediction momentum snapshot helpers (fire-and-forget)
// ---------------------------------------------------------------------------

/**
 * Snapshot-write prediction momentum to the intelligence sidecar.
 *
 * Fire-and-forget: non-blocking, non-fatal. Failures are logged to console.warn.
 * Used by the store caller after computing momentum to preserve state for harness analysis.
 *
 * Phase 32: PRED-02
 */
export function writePredictionMomentum(
  atomId: string,
  snapshot: {
    signalFrequency: Record<string, number>;
    signalStrength: Record<string, number>;
    categoryOrdering: Array<{ category: string; score: number; explanation: string }>;
    coldStart: boolean;
    computedAt: number;
  },
): void {
  (async () => {
    try {
      const intel = await getOrCreateIntelligence(atomId);
      intel.predictionMomentum = snapshot;
      intel.version++;
      intel.lastUpdated = Date.now();
      await db.atomIntelligence.put(intel);
    } catch (err) {
      console.warn('[atom-intelligence] writePredictionMomentum failed (non-fatal):', err);
    }
  })();
}

/**
 * Snapshot-write entity momentum scores to the intelligence sidecar.
 *
 * Fire-and-forget: non-blocking, non-fatal. Failures are logged to console.warn.
 * Used by the store caller after computing entity trajectory to preserve state for harness analysis.
 *
 * Phase 32: PRED-02
 */
export function writeEntityMomentum(
  atomId: string,
  snapshot: {
    scores: Record<string, number>;
    computedAt: number;
  },
): void {
  (async () => {
    try {
      const intel = await getOrCreateIntelligence(atomId);
      intel.entityMomentum = snapshot;
      intel.version++;
      intel.lastUpdated = Date.now();
      await db.atomIntelligence.put(intel);
    } catch (err) {
      console.warn('[atom-intelligence] writeEntityMomentum failed (non-fatal):', err);
    }
  })();
}
