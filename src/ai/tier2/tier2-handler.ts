/**
 * Tier 2: Compact Neural Models handler.
 *
 * Uses the existing MiniLM embedding model (shared with search) for classification
 * via ONNX inference (primary path) or centroid comparison (fallback).
 *
 * Primary path (when ONNX classifier is ready):
 * 1. Send CLASSIFY_ONNX to embedding worker (embeds text + runs ONNX in one round-trip)
 * 2. ONNX returns per-class probabilities (Platt-calibrated, 0-1)
 * 3. Top-1 = suggested type; compute confidenceSpread for ambiguity detection
 *
 * Fallback path (when ONNX classifier is not yet loaded):
 * 1. Embed the input text via the shared embedding worker (CLASSIFY_TYPE)
 * 2. Compare against per-type centroids (cosine similarity)
 * 3. Highest similarity score = suggested type
 *
 * Always on-device, sub-second. Privacy: embeddings never leave the device.
 *
 * Phase 10: ONNX path added via CLASSIFY_ONNX worker message. Centroid path preserved
 *   for backward compatibility and warm-up before ONNX classifier loads.
 */

import type { TierHandler } from './handler';
import type { AITaskType, TieredRequest, TieredResult, GtdClassification, GtdClassifierName } from './types';
import { GTD_CONFIDENCE_THRESHOLDS } from './types';
import type { AtomType } from '../../types/atoms';
import type { CentroidSet } from './centroid-builder';

// --- Worker communication: centroid path ---

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

// --- Worker communication: ONNX path ---

type OnnxResultMsg = {
  type: 'ONNX_RESULT';
  id: string;
  scores: Record<string, number>;
  vector: number[];
};

type OnnxErrorMsg = {
  type: 'ONNX_ERROR';
  id: string;
  error: string;
};

// --- Worker communication: GTD path ---

type GtdResultMsg = {
  type: 'GTD_RESULT';
  id: string;
  vector: number[];
  routing: Record<string, number> | null;
  actionability: Record<string, number> | null;
  project: Record<string, number> | null;
  context: Record<string, number> | null;
};

type GtdErrorMsg = {
  type: 'GTD_ERROR';
  id: string;
  error: string;
};

/**
 * Send a GTD classification request to the embedding worker and wait for the result.
 * Worker embeds text once and runs all 4 GTD ONNX classifiers on the same vector.
 */
function classifyGtdViaWorker(worker: Worker, text: string): Promise<GtdResultMsg> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();

    const handler = (event: MessageEvent) => {
      const msg = event.data as GtdResultMsg | GtdErrorMsg;
      if (msg.id !== id) return;

      worker.removeEventListener('message', handler);
      if (msg.type === 'GTD_RESULT') resolve(msg);
      else if (msg.type === 'GTD_ERROR') reject(new Error(msg.error));
    };

    worker.addEventListener('message', handler);
    worker.postMessage({ type: 'CLASSIFY_GTD', id, text });
  });
}

/**
 * Send a centroid-based classification request to the embedding worker and wait for the result.
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

/**
 * Send an ONNX classification request to the embedding worker and wait for the result.
 * Worker embeds the text via MiniLM, then runs ONNX inference in one round-trip.
 */
function classifyViaONNX(
  worker: Worker,
  text: string,
): Promise<{ scores: Record<string, number>; vector: number[] }> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();

    const handler = (event: MessageEvent) => {
      const msg = event.data as OnnxResultMsg | OnnxErrorMsg;
      if (msg.id !== id) return;

      worker.removeEventListener('message', handler);
      if (msg.type === 'ONNX_RESULT') {
        resolve({ scores: msg.scores, vector: msg.vector });
      } else if (msg.type === 'ONNX_ERROR') {
        reject(new Error(msg.error));
      }
    };

    worker.addEventListener('message', handler);
    worker.postMessage({ type: 'CLASSIFY_ONNX', id, text });
  });
}

// --- Tier 2 Handler ---

/**
 * Create a Tier 2 handler for ONNX classification (primary) or centroid fallback.
 *
 * @param getWorker - Function that returns the shared embedding worker (or null if not ready)
 * @param getTypeCentroids - Function that returns current type centroids (or null if not built)
 * @param getSectionCentroids - Function that returns current section centroids (or null)
 * @param getClassifierReady - Function that returns true when ONNX session is loaded
 */
export function createTier2Handler(
  getWorker: () => Worker | null,
  getTypeCentroids: () => CentroidSet | null,
  getSectionCentroids: () => CentroidSet | null,
  getClassifierReady: () => boolean,
): TierHandler & { lastVector: () => number[] | null } {
  let _lastVector: number[] | null = null;

  return {
    tier: 2,
    name: 'Compact Neural Models',

    canHandle(task: AITaskType): boolean {
      if (task !== 'classify-type' && task !== 'route-section' && task !== 'classify-gtd') return false;

      const worker = getWorker();
      if (!worker) return false;

      // GTD models load lazily; worker just needs to exist
      if (task === 'classify-gtd') return true;

      if (task === 'classify-type') {
        // ONNX path: classifier ready means we can handle without centroids
        if (getClassifierReady()) return true;
        // Centroid fallback: need centroids built from history
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
        // --- ONNX path (primary when classifier is ready) ---
        if (getClassifierReady()) {
          const { scores, vector } = await classifyViaONNX(worker, text);
          _lastVector = vector;

          const validTypes: AtomType[] = ['task', 'fact', 'event', 'decision', 'insight'];

          // Find top-1 and top-2 types
          let bestType: AtomType = 'fact';
          let bestScore = 0;
          let secondType: AtomType = 'fact';
          let secondScore = 0;

          for (const [label, score] of Object.entries(scores)) {
            if (!validTypes.includes(label as AtomType)) continue;
            if (score > bestScore) {
              secondType = bestType;
              secondScore = bestScore;
              bestScore = score;
              bestType = label as AtomType;
            } else if (score > secondScore) {
              secondScore = score;
              secondType = label as AtomType;
            }
          }

          // ONNX probabilities are Platt-calibrated: use bestScore directly as confidence
          const confidenceSpread = bestScore - secondScore;
          // Ambiguous when spread < 0.15 (locked decision)
          const isAmbiguous = confidenceSpread < 0.15;

          const result: TieredResult = {
            tier: 2,
            confidence: bestScore,
            type: bestType,
            confidenceSpread,
            reasoning: `ONNX classifier: ${bestType} (p=${bestScore.toFixed(3)}, spread=${confidenceSpread.toFixed(3)})`,
          };

          if (isAmbiguous) {
            result.alternativeType = secondType;
          }

          return result;
        }

        // --- Centroid fallback path (when ONNX not yet loaded) ---
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

      if (task === 'classify-gtd') {
        const gtdResult = await classifyGtdViaWorker(worker, text);
        _lastVector = gtdResult.vector;

        // Build GtdClassification from raw scores + per-classifier thresholds
        const gtd: GtdClassification = {};
        const processScores = (
          scores: Record<string, number> | null,
          classifierName: GtdClassifierName,
        ) => {
          if (!scores) return undefined;
          const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
          const [topLabel, topScore] = entries[0] ?? ['unknown', 0];
          const threshold = GTD_CONFIDENCE_THRESHOLDS[classifierName];
          return { label: topLabel, confidence: topScore, isLowConfidence: topScore < threshold };
        };

        gtd.routing = processScores(gtdResult.routing, 'gtd-routing');
        gtd.actionability = processScores(gtdResult.actionability, 'actionability');
        gtd.project = processScores(gtdResult.project, 'project-detection');
        gtd.context = processScores(gtdResult.context, 'context-tagging');

        // Overall confidence = minimum confidence across all available classifiers
        const confidences = [gtd.routing, gtd.actionability, gtd.project, gtd.context]
          .filter(Boolean)
          .map(c => c!.confidence);
        const minConfidence = confidences.length > 0 ? Math.min(...confidences) : 0;

        return {
          tier: 2 as const,
          confidence: minConfidence,
          gtd,
          reasoning: `GTD classifiers: routing=${gtd.routing?.label}(${gtd.routing?.confidence.toFixed(2)}), ` +
            `actionability=${gtd.actionability?.label}, project=${gtd.project?.label}, context=${gtd.context?.label}`,
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
