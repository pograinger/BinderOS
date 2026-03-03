/**
 * Centroid builder for Tier 2 ONNX classification.
 *
 * Builds per-type classification centroids from user classification history.
 * A centroid is the average embedding vector for all items classified as a given type.
 *
 * Process:
 * 1. Collect all ClassificationEvents that have cached embeddings
 * 2. Group by chosenType
 * 3. Compute average vector (centroid) per type
 * 4. Persist to Dexie config table for reload across sessions
 *
 * Also supports section routing centroids: group atom embeddings by sectionItemId.
 */

import type { AtomType } from '../../types/atoms';
import type { ClassificationEvent } from '../../storage/classification-log';
import { db } from '../../storage/db';
import { MIN_SAMPLES_PER_TYPE } from './types';

// --- Dexie config keys ---

const TYPE_CENTROIDS_KEY = 'type-centroids';
const SECTION_CENTROIDS_KEY = 'section-centroids';

// --- Centroid types ---

export interface CentroidSet {
  /** Map of label → centroid vector */
  centroids: Record<string, number[]>;
  /** Number of samples per label */
  counts: Record<string, number>;
  /** Timestamp of last rebuild */
  builtAt: number;
}

// --- Vector math ---

function addVectors(a: number[], b: number[]): number[] {
  const result = new Array<number>(a.length);
  for (let i = 0; i < a.length; i++) {
    result[i] = (a[i] ?? 0) + (b[i] ?? 0);
  }
  return result;
}

function scaleVector(v: number[], scalar: number): number[] {
  const result = new Array<number>(v.length);
  for (let i = 0; i < v.length; i++) {
    result[i] = (v[i] ?? 0) * scalar;
  }
  return result;
}

function normalizeVector(v: number[]): number[] {
  let norm = 0;
  for (let i = 0; i < v.length; i++) {
    const val = v[i] ?? 0;
    norm += val * val;
  }
  norm = Math.sqrt(norm);
  if (norm === 0) return v;
  return scaleVector(v, 1 / norm);
}

// --- Build centroids ---

/**
 * Build type classification centroids from classification history.
 *
 * Only includes types with >= MIN_SAMPLES_PER_TYPE entries that have embeddings.
 * Returns null if no types meet the minimum threshold.
 */
export function buildTypeCentroids(history: ClassificationEvent[]): CentroidSet | null {
  // Filter to events with embeddings
  const withEmbeddings = history.filter((e) => e.embedding && e.embedding.length > 0);
  if (withEmbeddings.length === 0) return null;

  // Group by chosenType
  const groups = new Map<AtomType, number[][]>();
  for (const event of withEmbeddings) {
    const existing = groups.get(event.chosenType) ?? [];
    existing.push(event.embedding!);
    groups.set(event.chosenType, existing);
  }

  const centroids: Record<string, number[]> = {};
  const counts: Record<string, number> = {};
  let hasAnyCentroid = false;

  for (const [type, vectors] of groups) {
    if (vectors.length < MIN_SAMPLES_PER_TYPE) continue;

    // Compute average vector
    const first = vectors[0]!;
    const dim = first.length;
    let sum = new Array<number>(dim).fill(0);
    for (const v of vectors) {
      sum = addVectors(sum, v);
    }
    const avg = scaleVector(sum, 1 / vectors.length);
    centroids[type] = normalizeVector(avg);
    counts[type] = vectors.length;
    hasAnyCentroid = true;
  }

  if (!hasAnyCentroid) return null;

  return { centroids, counts, builtAt: Date.now() };
}

/**
 * Build section routing centroids from atom embeddings grouped by sectionItemId.
 *
 * @param atomEmbeddings - Map of atomId → embedding vector
 * @param atomSections - Map of atomId → sectionItemId
 */
export function buildSectionCentroids(
  atomEmbeddings: Map<string, number[]>,
  atomSections: Map<string, string>,
): CentroidSet | null {
  // Group embeddings by sectionItemId
  const groups = new Map<string, number[][]>();
  for (const [atomId, embedding] of atomEmbeddings) {
    const sectionItemId = atomSections.get(atomId);
    if (!sectionItemId) continue;
    const existing = groups.get(sectionItemId) ?? [];
    existing.push(embedding);
    groups.set(sectionItemId, existing);
  }

  const centroids: Record<string, number[]> = {};
  const counts: Record<string, number> = {};
  let hasAnyCentroid = false;

  for (const [sectionItemId, vectors] of groups) {
    if (vectors.length < MIN_SAMPLES_PER_TYPE) continue;

    const first = vectors[0]!;
    const dim = first.length;
    let sum = new Array<number>(dim).fill(0);
    for (const v of vectors) {
      sum = addVectors(sum, v);
    }
    const avg = scaleVector(sum, 1 / vectors.length);
    centroids[sectionItemId] = normalizeVector(avg);
    counts[sectionItemId] = vectors.length;
    hasAnyCentroid = true;
  }

  if (!hasAnyCentroid) return null;

  return { centroids, counts, builtAt: Date.now() };
}

// --- Persistence ---

/**
 * Save type centroids to Dexie config table.
 */
export async function saveTypeCentroids(centroidSet: CentroidSet): Promise<void> {
  await db.config.put({ key: TYPE_CENTROIDS_KEY, value: centroidSet });
}

/**
 * Load type centroids from Dexie config table.
 */
export async function loadTypeCentroids(): Promise<CentroidSet | null> {
  const entry = await db.config.get(TYPE_CENTROIDS_KEY);
  if (!entry) return null;
  return entry.value as CentroidSet;
}

/**
 * Save section centroids to Dexie config table.
 */
export async function saveSectionCentroids(centroidSet: CentroidSet): Promise<void> {
  await db.config.put({ key: SECTION_CENTROIDS_KEY, value: centroidSet });
}

/**
 * Load section centroids from Dexie config table.
 */
export async function loadSectionCentroids(): Promise<CentroidSet | null> {
  const entry = await db.config.get(SECTION_CENTROIDS_KEY);
  if (!entry) return null;
  return entry.value as CentroidSet;
}
