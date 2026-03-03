/**
 * Tier 2: Compact Neural Models handler.
 *
 * Uses the existing MiniLM embedding model (shared with search) for classification
 * via centroid comparison — zero new model downloads needed.
 *
 * Process:
 * 1. Embed the input text via the shared embedding worker
 * 2. Compare against per-type centroids (cosine similarity)
 * 3. Highest similarity score = suggested type
 *
 * Always on-device, sub-second. Privacy: embeddings never leave the device.
 *
 * The handler communicates with the embedding worker via postMessage,
 * using CLASSIFY_TYPE and ROUTE_SECTION message types added in Phase 8B.
 */

import type { TierHandler } from './handler';
import type { AITaskType, TieredRequest, TieredResult } from './types';
import type { AtomType } from '../../types/atoms';
import type { CentroidSet } from './centroid-builder';

// --- Worker communication ---

type ClassifyResultMsg = {
  type: 'CLASSIFY_RESULT';
  id: string;
  scores: Record<string, number>;
  vector: number[];
};

type ClassifyErrorMsg = {
  type: 'CLASSIFY_ERROR';
  id: string;
  error: string;
};

/**
 * Send a classification request to the embedding worker and wait for the result.
 */
function classifyViaWorker(
  worker: Worker,
  msgType: 'CLASSIFY_TYPE' | 'ROUTE_SECTION',
  text: string,
  centroids: Record<string, number[]>,
): Promise<{ scores: Record<string, number>; vector: number[] }> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();

    const handler = (event: MessageEvent) => {
      const msg = event.data as ClassifyResultMsg | ClassifyErrorMsg;
      if (msg.id !== id) return;

      worker.removeEventListener('message', handler);
      if (msg.type === 'CLASSIFY_RESULT') {
        resolve({ scores: msg.scores, vector: msg.vector });
      } else if (msg.type === 'CLASSIFY_ERROR') {
        reject(new Error(msg.error));
      }
    };

    worker.addEventListener('message', handler);
    worker.postMessage({ type: msgType, id, text, centroids });
  });
}

// --- Tier 2 Handler ---

/**
 * Create a Tier 2 handler for ONNX embedding centroid classification.
 *
 * @param getWorker - Function that returns the shared embedding worker (or null if not ready)
 * @param getTypeCentroids - Function that returns current type centroids (or null if not built)
 * @param getSectionCentroids - Function that returns current section centroids (or null)
 */
export function createTier2Handler(
  getWorker: () => Worker | null,
  getTypeCentroids: () => CentroidSet | null,
  getSectionCentroids: () => CentroidSet | null,
): TierHandler & { lastVector: () => number[] | null } {
  let _lastVector: number[] | null = null;

  return {
    tier: 2,
    name: 'Compact Neural Models',

    canHandle(task: AITaskType): boolean {
      if (task !== 'classify-type' && task !== 'route-section') return false;

      const worker = getWorker();
      if (!worker) return false;

      if (task === 'classify-type') {
        const centroids = getTypeCentroids();
        return centroids !== null && Object.keys(centroids.centroids).length > 0;
      }

      if (task === 'route-section') {
        const centroids = getSectionCentroids();
        return centroids !== null && Object.keys(centroids.centroids).length > 0;
      }

      return false;
    },

    async handle(request: TieredRequest): Promise<TieredResult> {
      const { task, features } = request;
      const worker = getWorker();
      if (!worker) {
        return { tier: 2, confidence: 0, reasoning: 'Embedding worker not available' };
      }

      const text = (features.title ?? '') + ' ' + features.content;

      if (task === 'classify-type') {
        const centroidSet = getTypeCentroids();
        if (!centroidSet || Object.keys(centroidSet.centroids).length === 0) {
          return { tier: 2, confidence: 0, reasoning: 'No type centroids available' };
        }

        const { scores, vector } = await classifyViaWorker(
          worker, 'CLASSIFY_TYPE', text, centroidSet.centroids,
        );
        _lastVector = vector;

        // Find highest scoring type
        let bestType: AtomType = 'fact';
        let bestScore = 0;
        const validTypes: AtomType[] = ['task', 'fact', 'event', 'decision', 'insight'];

        for (const [label, score] of Object.entries(scores)) {
          if (score > bestScore && validTypes.includes(label as AtomType)) {
            bestScore = score;
            bestType = label as AtomType;
          }
        }

        // Compute confidence: use the score directly (cosine similarity 0-1)
        // Boost confidence if there's clear separation from second-best
        const sortedScores = Object.values(scores).sort((a, b) => b - a);
        const separation = sortedScores.length >= 2 ? (sortedScores[0] ?? 0) - (sortedScores[1] ?? 0) : 0;
        const confidence = Math.min(0.95, bestScore * 0.7 + separation * 0.3);

        return {
          tier: 2,
          confidence,
          type: bestType,
          reasoning: `Embedding centroid: ${bestType} (similarity ${bestScore.toFixed(3)}, separation ${separation.toFixed(3)})`,
        };
      }

      if (task === 'route-section') {
        const centroidSet = getSectionCentroids();
        if (!centroidSet || Object.keys(centroidSet.centroids).length === 0) {
          return { tier: 2, confidence: 0, sectionItemId: null, reasoning: 'No section centroids available' };
        }

        const { scores, vector } = await classifyViaWorker(
          worker, 'ROUTE_SECTION', text, centroidSet.centroids,
        );
        _lastVector = vector;

        // Find highest scoring section
        let bestSectionId: string | null = null;
        let bestScore = 0;
        for (const [sectionItemId, score] of Object.entries(scores)) {
          if (score > bestScore) {
            bestScore = score;
            bestSectionId = sectionItemId;
          }
        }

        const sortedScores = Object.values(scores).sort((a, b) => b - a);
        const separation = sortedScores.length >= 2 ? (sortedScores[0] ?? 0) - (sortedScores[1] ?? 0) : 0;
        const confidence = Math.min(0.9, bestScore * 0.6 + separation * 0.4);

        return {
          tier: 2,
          confidence,
          sectionItemId: bestSectionId,
          reasoning: `Section centroid: similarity ${bestScore.toFixed(3)}, separation ${separation.toFixed(3)}`,
        };
      }

      return { tier: 2, confidence: 0, reasoning: `Task ${task} not supported by Tier 2` };
    },

    /**
     * Get the last embedding vector produced by classification.
     * Used to cache in ClassificationEvent for centroid rebuilds.
     */
    lastVector(): number[] | null {
      return _lastVector;
    },
  };
}
