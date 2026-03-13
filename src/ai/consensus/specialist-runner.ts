/**
 * Specialist runner — main-thread bridge to the consensus worker.
 *
 * runConsensusForAtom():
 * - Enforces cold-start guard: skips if binder has fewer than 15 task canonical vectors.
 * - Loads the atom's canonical vector from the intelligence sidecar.
 * - Builds the 84-dim flat vector [task(27) | person(23) | calendar(34)],
 *   zero-padding missing person/calendar segments.
 * - Posts RUN_SPECIALISTS to the consensus worker (lazy-instantiated).
 * - On response, maps results to SpecialistOutput[], runs computeConsensus(),
 *   and writes the result via writeConsensusRisk() (fire-and-forget).
 *
 * incrementVectorCount():
 * - Called by vector-cache.writeCanonicalVector() after each task vector write.
 * - Increments the in-memory counter for the binder's cold-start tracking.
 * - Avoids an O(n) Dexie count query on every invocation after the first.
 *
 * All execution is non-blocking: runConsensusForAtom returns void and runs
 * asynchronously. Errors are logged to console.warn and never propagated.
 *
 * Phase 36: CONS-04
 */

import { db } from '../../storage/db';
import { writeConsensusRisk } from '../../storage/atom-intelligence';
import { computeConsensus } from './consensus-voter';
import {
  SPECIALIST_WEIGHTS,
  SPECIALIST_FEATURE_SLICES,
} from './types';
import type { SpecialistOutput } from './types';
import { TASK_VECTOR_DIM, PERSON_VECTOR_DIM, CALENDAR_VECTOR_DIM } from '../feature-vectors/types';

// ---------------------------------------------------------------------------
// Cold-start guard — in-memory counter per binder
// ---------------------------------------------------------------------------

/**
 * In-memory task-vector count per binderId.
 *
 * Initialized lazily from Dexie on first call per binder, then incremented
 * on each vector write via incrementVectorCount(). Avoids O(n) query on
 * every runConsensusForAtom() invocation.
 */
const vectorCountCache = new Map<string, number>();

/**
 * Minimum number of task canonical vectors required before running consensus.
 * Prevents meaningless consensus on sparse data.
 */
const COLD_START_THRESHOLD = 15;

/**
 * Increment the in-memory vector count for the given binder.
 * Called by vector-cache.writeCanonicalVector() after writing a task vector.
 */
export function incrementVectorCount(binderId: string): void {
  const current = vectorCountCache.get(binderId) ?? 0;
  vectorCountCache.set(binderId, current + 1);
}

/**
 * Get the task-vector count for a binder, initializing from Dexie on first call.
 *
 * After the first call, the count is served from the in-memory cache.
 * The Dexie query counts all atomIntelligence rows where canonicalVector
 * exists and vectorType === 'task' — using a scan since there's no index on
 * the optional canonicalVector field.
 */
async function getVectorCount(binderId: string): Promise<number> {
  if (vectorCountCache.has(binderId)) {
    return vectorCountCache.get(binderId)!;
  }

  // Initialize from Dexie: scan atomIntelligence for task vectors
  // (canonicalVector is non-indexed, so this is an in-memory filter)
  try {
    const count = await db.atomIntelligence
      .filter((row) => row.canonicalVector?.vectorType === 'task')
      .count();
    vectorCountCache.set(binderId, count);
    return count;
  } catch {
    // On error, be conservative: assume cold-start threshold not met
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Consensus worker — lazy-instantiated
// ---------------------------------------------------------------------------

let worker: Worker | null = null;
const requestMap = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

/**
 * Get or create the consensus worker (lazy singleton).
 */
function getWorker(): Worker {
  if (worker) return worker;

  worker = new Worker(new URL('../../workers/consensus-worker.ts', import.meta.url), {
    type: 'module',
  });

  worker.onmessage = (event: MessageEvent) => {
    const msg = event.data as { type: string; id: string; results?: unknown; error?: string };
    const pending = requestMap.get(msg.id);
    if (!pending) return;

    requestMap.delete(msg.id);

    if (msg.type === 'SPECIALIST_RESULTS') {
      pending.resolve(msg.results);
    } else if (msg.type === 'SPECIALIST_ERROR') {
      pending.reject(new Error(msg.error ?? 'Unknown specialist error'));
    }
  };

  worker.onerror = (event: ErrorEvent) => {
    // Reject all pending requests on worker crash
    for (const [id, pending] of requestMap) {
      pending.reject(new Error(`[consensus-worker] Worker error: ${event.message}`));
      requestMap.delete(id);
    }
    // Reset worker so next call re-instantiates
    worker = null;
  };

  return worker;
}

// ---------------------------------------------------------------------------
// runConsensusForAtom — main entry point
// ---------------------------------------------------------------------------

/**
 * Run consensus inference for the given task atom.
 *
 * Returns void immediately — all work is fire-and-forget.
 * Safe to call from writeCanonicalVector (non-blocking).
 *
 * Steps:
 * 1. Check cold-start guard (15 task vectors per binder).
 * 2. Load atom's canonical vector from sidecar.
 * 3. Build 84-dim vector (zero-padding person/calendar segments).
 * 4. Send RUN_SPECIALISTS to consensus worker.
 * 5. Map results → SpecialistOutput[].
 * 6. Compute consensus via computeConsensus().
 * 7. Persist via writeConsensusRisk() (fire-and-forget).
 */
export function runConsensusForAtom(atomId: string, binderId: string): void {
  (async () => {
    try {
      // --- Cold-start guard ---
      const count = await getVectorCount(binderId);
      if (count < COLD_START_THRESHOLD) {
        return; // Not enough data yet
      }

      // --- Load canonical vector from sidecar ---
      const intel = await db.atomIntelligence.get(atomId);
      if (!intel) return;

      const cv = intel.canonicalVector;
      if (!cv || cv.vectorType !== 'task') {
        // Only task atoms trigger consensus
        return;
      }

      // --- Build 84-dim flat vector [task | person | calendar] ---
      // Task vector is stored; person/calendar are zero-padded (not yet linked)
      const fullVector: number[] = [
        ...cv.data,
        ...new Array<number>(PERSON_VECTOR_DIM).fill(0),
        ...new Array<number>(CALENDAR_VECTOR_DIM).fill(0),
      ];

      if (fullVector.length !== TASK_VECTOR_DIM + PERSON_VECTOR_DIM + CALENDAR_VECTOR_DIM) {
        console.warn(
          `[specialist-runner] Unexpected vector length: ${fullVector.length}`,
        );
        return;
      }

      // --- Build slices from SPECIALIST_FEATURE_SLICES ---
      const slices = Object.values(SPECIALIST_FEATURE_SLICES).map((spec) => ({
        name: spec.name,
        indices: spec.featureIndices,
      }));

      // --- Post to worker and await response ---
      const requestId = `${atomId}-${Date.now()}`;
      const w = getWorker();

      const results = await new Promise<Array<{ name: string; probability: number }>>(
        (resolve, reject) => {
          requestMap.set(requestId, { resolve: resolve as (v: unknown) => void, reject });
          w.postMessage({ type: 'RUN_SPECIALISTS', id: requestId, fullVector, slices });
        },
      );

      // --- Map results to SpecialistOutput[] ---
      const outputs: SpecialistOutput[] = results.map((r) => ({
        name: r.name,
        probability: r.probability,
        weight: SPECIALIST_WEIGHTS[r.name] ?? 1.0,
      }));

      if (outputs.length === 0) return;

      // --- Compute consensus ---
      const consensus = computeConsensus(outputs);

      // --- Persist to sidecar (fire-and-forget) ---
      writeConsensusRisk(atomId, consensus);

      // --- Fire-and-forget EII update after consensus completes ---
      // Dynamic import keeps EII off the critical consensus path
      import('../../ai/eii/index').then(({ updateBinderEII }) => {
        updateBinderEII(binderId);
      }).catch(() => { /* non-fatal */ });
    } catch (err) {
      console.warn('[specialist-runner] runConsensusForAtom failed (non-fatal):', err);
    }
  })();
}
