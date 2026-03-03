/**
 * Web Worker for ONNX model inference via Transformers.js.
 *
 * LOCKED DECISION (zero network calls):
 * - env.allowRemoteModels = false — NEVER fetches from HuggingFace CDN at runtime
 * - env.allowLocalModels = true — loads only from bundled local files
 * - env.localModelPath = '/models/' — served by Vite from public/models/
 *
 * The quantized ONNX model files for Xenova/all-MiniLM-L6-v2 must be
 * pre-downloaded to public/models/Xenova/all-MiniLM-L6-v2/ via:
 *   node scripts/download-model.cjs
 *
 * Message protocol:
 * Incoming:
 *   { type: 'EMBED'; id: string; texts: string[] }
 *   { type: 'EMBED_ATOMS'; atoms: { id: string; text: string }[] }
 *   { type: 'CLASSIFY_TYPE'; id: string; text: string; centroids: Record<string, number[]> }
 *   { type: 'ROUTE_SECTION'; id: string; text: string; centroids: Record<string, number[]> }
 * Outgoing:
 *   { type: 'EMBED_RESULT'; id: string; vectors: number[][]; atomIds?: string[] }
 *   { type: 'EMBED_ERROR'; id: string; error: string }
 *   { type: 'CLASSIFY_RESULT'; id: string; scores: Record<string, number>; vector: number[] }
 *   { type: 'CLASSIFY_ERROR'; id: string; error: string }
 *   { type: 'MODEL_READY' }
 *   { type: 'MODEL_LOADING' }
 *
 * Graceful degradation: all errors are caught and returned as EMBED_ERROR,
 * never thrown — the main thread never blocks waiting for embeddings.
 */

import { pipeline, env } from '@huggingface/transformers';

// --- Configure for local-only model loading ---

// CRITICAL: Never fetch from HuggingFace CDN at runtime
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = '/models/';

// --- Pipeline singleton ---

// Use unknown to avoid TypeScript union complexity with Transformers.js overloaded pipeline type
type EmbedPipeline = (texts: string[], options: Record<string, unknown>) => Promise<unknown>;

let featurePipeline: EmbedPipeline | null = null;
let pipelineLoading = false;
let pipelineError: string | null = null;

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

async function loadPipeline(): Promise<EmbedPipeline> {
  if (featurePipeline) return featurePipeline;
  if (pipelineError) throw new Error(pipelineError);

  if (pipelineLoading) {
    // Wait for ongoing load
    while (pipelineLoading) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (featurePipeline) return featurePipeline;
    throw new Error(pipelineError ?? 'Pipeline failed to load');
  }

  pipelineLoading = true;
  self.postMessage({ type: 'MODEL_LOADING' });

  try {
    const pipe = await pipeline('feature-extraction', MODEL_ID, {
      dtype: 'q8' as Parameters<typeof pipeline>[2] extends infer T ? T extends { dtype?: infer D } ? D : never : never,
    });
    // Cast to our simplified EmbedPipeline interface
    featurePipeline = pipe as unknown as EmbedPipeline;
    pipelineLoading = false;
    self.postMessage({ type: 'MODEL_READY' });
    return featurePipeline;
  } catch (err) {
    pipelineLoading = false;
    const msg = err instanceof Error ? err.message : String(err);
    pipelineError = msg.includes('404') || msg.includes('not found') || msg.includes('fetch')
      ? 'ONNX model not found. Run: node scripts/download-model.cjs'
      : msg;
    throw new Error(pipelineError);
  }
}

// --- Helper: run inference on a batch of texts ---

async function embedTexts(texts: string[]): Promise<number[][]> {
  const pipe = await loadPipeline();
  const output = await pipe(texts, { pooling: 'mean', normalize: true });
  // Output is a Tensor — convert to nested number[][] via tolist()
  const tensor = output as { tolist: () => number[][] };
  return tensor.tolist();
}

// --- Cosine similarity for centroid comparison ---

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  const mag = Math.sqrt(normA) * Math.sqrt(normB);
  return mag === 0 ? 0 : Math.max(0, dot / mag);
}

/**
 * Classify text against centroids by computing cosine similarity of its
 * embedding vector against each centroid vector.
 */
async function classifyAgainstCentroids(
  text: string,
  centroids: Record<string, number[]>,
): Promise<{ scores: Record<string, number>; vector: number[] }> {
  const vectors = await embedTexts([text]);
  const vector = vectors[0] ?? [];
  const scores: Record<string, number> = {};
  for (const [label, centroid] of Object.entries(centroids)) {
    scores[label] = cosineSimilarity(vector, centroid);
  }
  return { scores, vector };
}

// --- Message handler ---

type WorkerIncoming =
  | { type: 'EMBED'; id: string; texts: string[] }
  | { type: 'EMBED_ATOMS'; atoms: { id: string; text: string }[] }
  | { type: 'CLASSIFY_TYPE'; id: string; text: string; centroids: Record<string, number[]> }
  | { type: 'ROUTE_SECTION'; id: string; text: string; centroids: Record<string, number[]> };

self.onmessage = async (event: MessageEvent) => {
  const msg = event.data as WorkerIncoming;

  if (msg.type === 'EMBED') {
    try {
      const vectors = await embedTexts(msg.texts);
      self.postMessage({ type: 'EMBED_RESULT', id: msg.id, vectors });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      self.postMessage({ type: 'EMBED_ERROR', id: msg.id, error });
    }
    return;
  }

  if (msg.type === 'EMBED_ATOMS') {
    try {
      const texts = msg.atoms.map((a) => a.text);
      const ids = msg.atoms.map((a) => a.id);
      const vectors = await embedTexts(texts);
      self.postMessage({
        type: 'EMBED_RESULT',
        id: '__atoms__',
        vectors,
        atomIds: ids,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      self.postMessage({ type: 'EMBED_ERROR', id: '__atoms__', error });
    }
    return;
  }

  if (msg.type === 'CLASSIFY_TYPE' || msg.type === 'ROUTE_SECTION') {
    try {
      const { scores, vector } = await classifyAgainstCentroids(msg.text, msg.centroids);
      self.postMessage({ type: 'CLASSIFY_RESULT', id: msg.id, scores, vector });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      self.postMessage({ type: 'CLASSIFY_ERROR', id: msg.id, error });
    }
  }
};
