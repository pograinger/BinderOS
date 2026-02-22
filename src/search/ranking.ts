/**
 * Blended relevance scoring for BinderOS search results.
 *
 * Combines four signals into a single relevance score:
 * - textScore: MiniSearch BM25 score, normalized 0-1
 * - semanticScore: cosine similarity from ONNX embeddings, 0-1 (0 if not ready)
 * - graphProximity: 1.0 if linked to recently-updated atoms, 0.0 otherwise
 * - priorityScore: from state.scores[id].priorityScore, 0-1
 *
 * Weights adapt when embeddings are not yet loaded:
 * - With embeddings:    0.40 text + 0.25 semantic + 0.20 graph + 0.15 priority
 * - Without embeddings: 0.55 text + 0.00 semantic + 0.25 graph + 0.20 priority
 *
 * This avoids penalizing results before the ONNX worker is ready.
 */

import type { Atom } from '../types/atoms';
import type { SearchResult } from './search-index';

// --- Types ---

export interface RankingInput {
  /** MiniSearch score, normalized 0-1 */
  textScore: number;
  /** Cosine similarity from ONNX embeddings, 0-1 (pass 0 if not ready) */
  semanticScore: number;
  /** 1.0 if linked to any recently-updated atom, 0.0 otherwise */
  graphProximity: number;
  /** From state.scores[id].priorityScore, 0-1 */
  priorityScore: number;
}

// --- Blended score ---

/**
 * Compute blended relevance score from four ranked signals.
 * Weights shift when semantic embeddings are not ready (semanticScore === 0).
 */
export function blendedScore(input: RankingInput): number {
  if (input.semanticScore > 0) {
    // Full blended score with semantic component
    return (
      0.40 * input.textScore +
      0.25 * input.semanticScore +
      0.20 * input.graphProximity +
      0.15 * input.priorityScore
    );
  } else {
    // Fallback: redistribute semantic weight to text and graph
    return (
      0.55 * input.textScore +
      0.25 * input.graphProximity +
      0.20 * input.priorityScore
    );
  }
}

// --- Score normalization ---

/**
 * Normalize MiniSearch scores (BM25, unbounded) to 0-1 range.
 * Divides all scores by the maximum score in the result set.
 * Returns results unchanged if empty or all scores are 0.
 */
export function normalizeTextScore(results: SearchResult[]): SearchResult[] {
  if (results.length === 0) return results;

  const maxScore = Math.max(...results.map((r) => r.score));
  if (maxScore === 0) return results;

  return results.map((r) => ({
    ...r,
    score: r.score / maxScore,
  }));
}

// --- Graph proximity ---

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Compute graph proximity score for an atom.
 * Returns 1.0 if the atom has links to any atom updated within the threshold,
 * 0.0 otherwise.
 *
 * @param atomId - The atom to check proximity for
 * @param atoms - All atoms in state (for link target lookup)
 * @param recentThresholdMs - Recency window in ms (default: 7 days)
 */
export function computeGraphProximity(
  atomId: string,
  atoms: Atom[],
  recentThresholdMs: number = SEVEN_DAYS_MS,
): number {
  const atom = atoms.find((a) => a.id === atomId);
  if (!atom || atom.links.length === 0) return 0.0;

  const now = Date.now();
  const cutoff = now - recentThresholdMs;

  // Build a quick lookup map for updated_at by id
  const updatedAtMap = new Map<string, number>();
  for (const a of atoms) {
    updatedAtMap.set(a.id, a.updated_at);
  }

  // Check if any linked atom was recently updated
  for (const link of atom.links) {
    const linkedUpdatedAt = updatedAtMap.get(link.targetId);
    if (linkedUpdatedAt !== undefined && linkedUpdatedAt >= cutoff) {
      return 1.0;
    }
  }

  return 0.0;
}

// --- Cosine similarity ---

/**
 * Compute cosine similarity between two embedding vectors.
 * Returns a value in [0, 1] where 1 = identical direction.
 * Returns 0 if either vector has zero magnitude.
 */
export function cosineSimilarity(
  a: Float32Array | number[],
  b: Float32Array | number[],
): number {
  if (a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;

  // Clamp to [0, 1] since vectors are normalized (cosine is in [-1, 1])
  return Math.max(0, dot / magnitude);
}
