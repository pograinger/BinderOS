/**
 * Co-occurrence tracker for relationship inference.
 *
 * Tracks entity pair co-occurrence frequency across atoms using an in-memory
 * Map. When pairs exceed the threshold (CO_OCCURRENCE_THRESHOLD = 3), an
 * 'associated' EntityRelation is written to Dexie on flush.
 *
 * Design decisions:
 * - In-memory Map avoids O(n^2) Dexie write pressure
 * - Sorted UUID pair keys ensure symmetric counting
 *   ("a:b" and "b:a" are the same key)
 * - Sentence-level granularity: only entities in the same sentence
 *   contribute to a co-occurrence (prevents false positives from
 *   long atoms mentioning many unrelated people)
 * - Device-adaptive flush: lower threshold + pagehide on mobile;
 *   higher threshold + interval timer on desktop
 * - MISC and DATE entities are excluded from co-occurrence tracking
 *   (only PER/LOC/ORG carry meaningful relationship signal)
 *
 * PWA flush strategy (maximally resilient):
 * 1. visibilitychange (hidden) — PRIMARY: async-safe, fires before tab close
 * 2. pagehide — iOS Safari reliability (fires when page enters BFCache)
 * 3. beforeunload — belt-and-suspenders (sync best-effort on desktop)
 * 4. Count threshold — most data already written before lifecycle events
 * 5. Interval timer (desktop only) — periodic safety net
 *
 * Pure module: no store imports.
 *
 * Phase 28: RELI-02, RELI-03
 */

import { db } from '../storage/db';
import { createRelation } from '../storage/entity-helpers';
import type { EntityMention } from '../types/intelligence';
import { splitIntoSentences } from './keyword-patterns';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum co-occurrences before creating 'associated' relationship */
export const CO_OCCURRENCE_THRESHOLD = 3;

/** Entity types excluded from co-occurrence tracking */
const EXCLUDED_TYPES = new Set(['MISC', 'DATE']);

// ---------------------------------------------------------------------------
// In-memory state (module-level — survives across atom processing calls)
// ---------------------------------------------------------------------------

interface CooccurrenceEntry {
  count: number;
  evidence: Array<{ atomId: string; snippet: string; timestamp: number }>;
}

const cooccurrenceMap = new Map<string, CooccurrenceEntry>();
let pendingWrites = 0;
let lastFlushTime = Date.now();
let cleanupFn: (() => void) | null = null;

// ---------------------------------------------------------------------------
// Core pair key
// ---------------------------------------------------------------------------

/**
 * Sorted lexicographic pair key prevents duplicates.
 * "uuid-a:uuid-b" with a < b lexicographically.
 */
export function pairKey(entityId1: string, entityId2: string): string {
  return entityId1 < entityId2
    ? `${entityId1}:${entityId2}`
    : `${entityId2}:${entityId1}`;
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

/**
 * Record a single co-occurrence between two entities.
 * Increments the in-memory map count and appends evidence.
 */
export function recordCooccurrence(
  entityId1: string,
  entityId2: string,
  atomId: string,
  snippet: string,
): void {
  const key = pairKey(entityId1, entityId2);
  const existing = cooccurrenceMap.get(key);

  const entry: CooccurrenceEntry = existing ?? { count: 0, evidence: [] };
  entry.count += 1;
  entry.evidence.push({ atomId, snippet, timestamp: Date.now() });

  cooccurrenceMap.set(key, entry);
  pendingWrites += 1;
}

/**
 * Scan atom content for entity co-occurrences at sentence level.
 *
 * For each sentence, finds all PER/LOC/ORG entity mentions with entityId
 * that fall within the sentence span. For each unique pair in that sentence,
 * calls recordCooccurrence.
 */
export function updateCooccurrence(
  content: string,
  entityMentions: EntityMention[],
): void {
  if (entityMentions.length < 2) return;

  // Only track PER/LOC/ORG (skip MISC and DATE)
  const trackable = entityMentions.filter(
    (m) => m.entityId && !EXCLUDED_TYPES.has(m.entityType),
  );

  if (trackable.length < 2) return;

  const sentences = splitIntoSentences(content);

  for (const sentence of sentences) {
    const sentenceEnd = sentence.start + sentence.text.length;

    // Find mentions in this sentence
    const inSentence = trackable.filter(
      (m) => m.spanStart >= sentence.start && m.spanStart < sentenceEnd,
    );

    if (inSentence.length < 2) continue;

    // Record all unique pairs
    for (let i = 0; i < inSentence.length; i++) {
      for (let j = i + 1; j < inSentence.length; j++) {
        const a = inSentence[i];
        const b = inSentence[j];
        recordCooccurrence(a.entityId!, b.entityId!, '', sentence.text);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Flush
// ---------------------------------------------------------------------------

/**
 * Flush accumulated co-occurrences to Dexie.
 *
 * For each pair with count >= CO_OCCURRENCE_THRESHOLD:
 * - If an EntityRelation already exists for this pair with
 *   sourceAttribution='co-occurrence', update its confidence and append evidence.
 * - Otherwise, create a new 'associated' relation at confidence 0.25.
 *
 * After processing, clears the Map and resets pendingWrites.
 */
export async function flushCooccurrenceToDexie(): Promise<void> {
  if (cooccurrenceMap.size === 0) return;

  const entriesToProcess = new Map(cooccurrenceMap);

  // Clear state immediately to avoid double-processing if flush is called again
  cooccurrenceMap.clear();
  pendingWrites = 0;
  lastFlushTime = Date.now();

  for (const [key, entry] of entriesToProcess) {
    if (entry.count < CO_OCCURRENCE_THRESHOLD) continue;

    const [entityId1, entityId2] = key.split(':');

    // Check if relation already exists for this pair with co-occurrence attribution
    const existing = await db.entityRelations
      .where('[sourceEntityId+targetEntityId]')
      .equals([entityId1, entityId2])
      .filter((r) => r.sourceAttribution === 'co-occurrence' && r.relationshipType === 'associated')
      .first()
      .catch(() => undefined);

    // Also check reversed pair (since [SELF] relations use specific ordering)
    const existingReversed = !existing
      ? await db.entityRelations
          .where('[sourceEntityId+targetEntityId]')
          .equals([entityId2, entityId1])
          .filter(
            (r) => r.sourceAttribution === 'co-occurrence' && r.relationshipType === 'associated',
          )
          .first()
          .catch(() => undefined)
      : undefined;

    const existingRelation = existing ?? existingReversed;

    if (existingRelation) {
      // Update: boost confidence and append evidence
      const newCount = entry.count;
      const updatedConfidence = Math.min(
        0.95,
        existingRelation.confidence + 0.05 * newCount,
      );
      await db.entityRelations.update(existingRelation.id, {
        confidence: updatedConfidence,
        evidence: [...existingRelation.evidence, ...entry.evidence],
        updatedAt: Date.now(),
        version: existingRelation.version + 1,
      });
    } else {
      // Create new 'associated' relation
      const now = Date.now();
      await createRelation({
        sourceEntityId: entityId1,
        targetEntityId: entityId2,
        relationshipType: 'associated',
        confidence: 0.25,
        sourceAttribution: 'co-occurrence',
        evidence: entry.evidence,
        version: 1,
        deviceId: '',
        updatedAt: now,
      });
    }
  }
}

/**
 * Flush if pending writes have reached the threshold.
 * Called after each recordCooccurrence in the orchestrator.
 */
export async function maybeFlushCooccurrence(threshold = 50): Promise<void> {
  if (pendingWrites >= threshold) {
    await flushCooccurrenceToDexie();
  }
}

// ---------------------------------------------------------------------------
// PWA lifecycle registration (device-adaptive)
// ---------------------------------------------------------------------------

let flushRegistered = false;

/**
 * Register PWA lifecycle flush handlers.
 *
 * Call once on app startup (or first inference call). Safe to call multiple
 * times — registers only once.
 *
 * Device-adaptive strategy:
 * - Mobile: count threshold = 20, no interval timer (battery/performance)
 * - Desktop: count threshold = 50, interval every 60s
 *
 * Flush event priority:
 * 1. visibilitychange (hidden) — PRIMARY: async-safe in modern browsers
 * 2. pagehide — iOS Safari reliability
 * 3. beforeunload — belt-and-suspenders (best-effort sync)
 */
export function registerCooccurrenceFlushHandlers(deviceClass: 'mobile' | 'desktop'): void {
  if (flushRegistered) return;
  flushRegistered = true;

  // Check if we're in a browser environment
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return; // Node.js / test environment — skip registration
  }

  const handleHide = (): void => {
    void flushCooccurrenceToDexie();
  };

  const handleVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') {
      void flushCooccurrenceToDexie();
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('pagehide', handleHide);
  window.addEventListener('beforeunload', handleHide);

  let intervalId: ReturnType<typeof setInterval> | null = null;

  if (deviceClass === 'desktop') {
    intervalId = setInterval(() => void flushCooccurrenceToDexie(), 60_000);
  }

  // Store cleanup function (for testing)
  cleanupFn = () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('pagehide', handleHide);
    window.removeEventListener('beforeunload', handleHide);
    if (intervalId !== null) {
      clearInterval(intervalId);
    }
    flushRegistered = false;
  };
}

/**
 * Clean up flush handlers (primarily for testing).
 */
export function cleanupCooccurrenceFlushHandlers(): void {
  if (cleanupFn) {
    cleanupFn();
    cleanupFn = null;
  }
}

// ---------------------------------------------------------------------------
// Debug / testing utilities
// ---------------------------------------------------------------------------

/**
 * Return a shallow copy of the co-occurrence map for testing/debugging.
 */
export function getCooccurrenceSnapshot(): Map<string, CooccurrenceEntry> {
  return new Map(cooccurrenceMap);
}

/**
 * Reset all in-memory state. For tests only.
 */
export function resetCooccurrenceState(): void {
  cooccurrenceMap.clear();
  pendingWrites = 0;
  lastFlushTime = Date.now();
}
