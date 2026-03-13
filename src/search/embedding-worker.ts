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
 *   { type: 'CLASSIFY_ONNX'; id: string; text: string; binderId?: string }
 *   { type: 'CLASSIFY_GTD'; id: string; text: string }
 *   { type: 'CLASSIFY_DECOMPOSE'; id: string; text: string }
 *   { type: 'LOAD_CLASSIFIER' }
 *   { type: 'LOAD_RING_BUFFER'; binderId: string; embeddings: number[][] }
 *   { type: 'UPDATE_RING_BUFFER'; binderId: string; embedding: number[]; windowSize: number }
 *   { type: 'GET_SEQUENCE_CONTEXT'; id: string; binderId: string; windowSize: number }
 * Outgoing:
 *   { type: 'EMBED_RESULT'; id: string; vectors: number[][]; atomIds?: string[] }
 *   { type: 'EMBED_ERROR'; id: string; error: string }
 *   { type: 'CLASSIFY_RESULT'; id: string; scores: Record<string, number>; vector: number[] }
 *   { type: 'CLASSIFY_ERROR'; id: string; error: string }
 *   { type: 'ONNX_RESULT'; id: string; scores: Record<string, number>; vector: number[] }
 *   { type: 'ONNX_ERROR'; id: string; error: string }
 *   { type: 'MODEL_READY' }
 *   { type: 'MODEL_LOADING' }
 *   { type: 'CLASSIFIER_READY' }
 *   { type: 'CLASSIFIER_PROGRESS'; percent: number }
 *   { type: 'CLASSIFIER_ERROR'; error: string }
 *   { type: 'GTD_RESULT'; id: string; vector: number[]; routing: Record<string, number> | null; actionability: Record<string, number> | null; project: Record<string, number> | null; context: Record<string, number> | null }
 *   { type: 'GTD_ERROR'; id: string; error: string }
 *   { type: 'GTD_CLASSIFIERS_READY' }
 *   { type: 'DECOMPOSE_RESULT'; id: string; scores: Record<string, number>; vector: number[] }
 *   { type: 'DECOMPOSE_ERROR'; id: string; error: string }
 *   { type: 'DECOMPOSITION_CLASSIFIER_READY' }
 *   { type: 'RING_BUFFER_UPDATED'; binderId: string; embeddings: number[][] }
 *   { type: 'SEQUENCE_CONTEXT_RESULT'; id: string; context: number[] }
 *   { type: 'SEQUENCE_CONTEXT_ERROR'; id: string; error: string }
 *
 * Graceful degradation: all errors are caught and returned as EMBED_ERROR,
 * never thrown — the main thread never blocks waiting for embeddings.
 */

import { pipeline, env } from '@huggingface/transformers';
import * as ort from 'onnxruntime-web';
import { updateRingBuffer, getRingBuffer, setRingBuffer } from './ring-buffer';

// --- Configure for local-only model loading ---

// CRITICAL: Never fetch from HuggingFace CDN at runtime
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = '/models/';

// --- Configure ONNX Runtime Web ---

// Disable proxy mode (we're already inside a worker) and multi-threading.
// numThreads: 1 avoids SharedArrayBuffer requirement (RESEARCH.md Pitfall 6).
// Also avoids known ORT issue #26858 (hanging with external data + numThreads > 1).
ort.env.wasm.proxy = false;
ort.env.wasm.numThreads = 1;
// Point ONNX Runtime to the WASM binary in public/.
// MUST use object form { wasm } — string form bypasses ORT's inline bundled
// WASM glue module and triggers a dynamic import() of the .mjs file, which
// fails in Vite workers. Object form lets ORT use the inline module while
// only overriding the .wasm binary location.
const _wasmBase = (() => {
  try {
    const loc = (self as unknown as { location: Location }).location;
    return loc.pathname.startsWith('/BinderOS/') ? '/BinderOS/' : '/';
  } catch { return '/'; }
})();
ort.env.wasm.wasmPaths = { wasm: `${_wasmBase}ort-wasm-simd-threaded.jsep.wasm` };

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

// --- ONNX Classifier registry ---

const CLASSIFIER_CACHE_NAME = 'onnx-classifier-v2';

interface ClassifierConfig {
  name: string;
  modelPath: string;
  classesPath: string;
  session: ort.InferenceSession | null;
  classMap: Record<string, string> | null;
  loading: boolean;
}

// Type classifier loads eagerly (existing behavior)
const TYPE_CLASSIFIER: ClassifierConfig = {
  name: 'triage-type',
  modelPath: 'models/classifiers/triage-type.onnx',
  classesPath: 'models/classifiers/triage-type-classes.json',
  session: null, classMap: null, loading: false,
};

// Decomposition classifier loads lazily on first CLASSIFY_DECOMPOSE message
const DECOMPOSITION_CLASSIFIER: ClassifierConfig = {
  name: 'decomposition',
  modelPath: 'models/classifiers/decomposition.onnx',
  classesPath: 'models/classifiers/decomposition-classes.json',
  session: null, classMap: null, loading: false,
};

// Completeness gate classifier loads lazily on first CHECK_COMPLETENESS message
const COMPLETENESS_GATE: ClassifierConfig = {
  name: 'completeness-gate',
  modelPath: 'models/classifiers/completeness-gate.onnx',
  classesPath: 'models/classifiers/completeness-gate-classes.json',
  session: null, classMap: null, loading: false,
};

// Sequence context LSTM model loads lazily on first GET_SEQUENCE_CONTEXT request
// (Phase 33: runs in the same worker to avoid a 4th concurrent ORT instance — RESEARCH decision)
const SEQUENCE_MODEL: ClassifierConfig = {
  name: 'sequence-context',
  modelPath: 'models/sequence-context.onnx',
  classesPath: '',
  session: null, classMap: null, loading: false,
};

// Missing info classifiers load lazily on first CLASSIFY_MISSING_INFO message
const MISSING_INFO_CLASSIFIERS: ClassifierConfig[] = [
  { name: 'missing-outcome', modelPath: 'models/classifiers/missing-outcome.onnx',
    classesPath: 'models/classifiers/missing-outcome-classes.json', session: null, classMap: null, loading: false },
  { name: 'missing-next-action', modelPath: 'models/classifiers/missing-next-action.onnx',
    classesPath: 'models/classifiers/missing-next-action-classes.json', session: null, classMap: null, loading: false },
  { name: 'missing-timeframe', modelPath: 'models/classifiers/missing-timeframe.onnx',
    classesPath: 'models/classifiers/missing-timeframe-classes.json', session: null, classMap: null, loading: false },
  { name: 'missing-context', modelPath: 'models/classifiers/missing-context.onnx',
    classesPath: 'models/classifiers/missing-context-classes.json', session: null, classMap: null, loading: false },
  { name: 'missing-reference', modelPath: 'models/classifiers/missing-reference.onnx',
    classesPath: 'models/classifiers/missing-reference-classes.json', session: null, classMap: null, loading: false },
];

// GTD classifiers load lazily on first CLASSIFY_GTD message
const GTD_CLASSIFIERS: ClassifierConfig[] = [
  { name: 'gtd-routing', modelPath: 'models/classifiers/gtd-routing.onnx',
    classesPath: 'models/classifiers/gtd-routing-classes.json', session: null, classMap: null, loading: false },
  { name: 'actionability', modelPath: 'models/classifiers/actionability.onnx',
    classesPath: 'models/classifiers/actionability-classes.json', session: null, classMap: null, loading: false },
  { name: 'project-detection', modelPath: 'models/classifiers/project-detection.onnx',
    classesPath: 'models/classifiers/project-detection-classes.json', session: null, classMap: null, loading: false },
  { name: 'context-tagging', modelPath: 'models/classifiers/context-tagging.onnx',
    classesPath: 'models/classifiers/context-tagging-classes.json', session: null, classMap: null, loading: false },
];

// Legacy aliases for backward compatibility with existing loadClassifier/runClassifierInference
let classifierSession: ort.InferenceSession | null = null;
let classMap: Record<string, string> | null = null;
let classifierLoading = false;

/**
 * Fetch a URL with Cache API persistence and progress reporting.
 * - Cache hit: returns ArrayBuffer directly (no progress events)
 * - Cache miss: fetches with ReadableStream, reports CLASSIFIER_PROGRESS, stores in cache
 */
async function fetchWithCache(url: string): Promise<ArrayBuffer> {
  const cache = await caches.open(CLASSIFIER_CACHE_NAME);
  const cached = await cache.match(url);

  if (cached) {
    return cached.arrayBuffer();
  }

  const fetchResponse = await fetch(url);
  if (!fetchResponse.ok) {
    throw new Error(`Failed to fetch ${url}: ${fetchResponse.status} ${fetchResponse.statusText}`);
  }

  const contentLength = +(fetchResponse.headers.get('content-length') ?? 0);
  const reader = fetchResponse.body!.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  // Stream chunks and report progress
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    const percent = contentLength > 0 ? Math.round((received / contentLength) * 100) : -1;
    self.postMessage({ type: 'CLASSIFIER_PROGRESS', percent });
  }

  // Reassemble buffer
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }

  // Store in Cache API for subsequent sessions
  await cache.put(url, new Response(buffer, {
    headers: { 'content-type': 'application/octet-stream' },
  }));

  return buffer.buffer;
}

/**
 * Clean up old cache versions (any 'onnx-classifier-*' key != CLASSIFIER_CACHE_NAME).
 * Called at classifier startup to auto-migrate when model version changes.
 */
async function cleanOldCaches(): Promise<void> {
  const keys = await caches.keys();
  for (const key of keys) {
    if (key.startsWith('onnx-classifier-') && key !== CLASSIFIER_CACHE_NAME) {
      await caches.delete(key);
    }
  }
}

/**
 * Resolve model base URL from worker's location.
 * Handles both dev (/) and GitHub Pages (/BinderOS/) base paths.
 */
function resolveBase(): string {
  const loc = (self as unknown as { location: Location }).location;
  // GitHub Pages deploys with /BinderOS/ prefix
  if (loc.pathname.startsWith('/BinderOS/')) {
    return `${loc.origin}/BinderOS/`;
  }
  return `${loc.origin}/`;
}

/**
 * Load an ONNX classifier model and class map into a ClassifierConfig.
 * Generic loader used by both eager (type classifier) and lazy (GTD) paths.
 */
async function loadClassifierConfig(config: ClassifierConfig): Promise<void> {
  if (config.loading || config.session) return;
  config.loading = true;

  const base = resolveBase();
  const modelUrl = `${base}${config.modelPath}`;
  const classesUrl = `${base}${config.classesPath}`;

  // Load class map (small JSON, can use simple cache-aware fetch)
  const classesCache = await caches.open(CLASSIFIER_CACHE_NAME);
  let classesResponse = await classesCache.match(classesUrl);
  if (!classesResponse) {
    const fetched = await fetch(classesUrl);
    if (!fetched.ok) {
      config.loading = false;
      throw new Error(`Failed to fetch class map for ${config.name}: ${fetched.status}`);
    }
    const cloned = fetched.clone();
    await classesCache.put(classesUrl, cloned);
    classesResponse = await classesCache.match(classesUrl);
  }
  config.classMap = await classesResponse!.json() as Record<string, string>;

  // Load ONNX model with progress reporting and Cache API persistence
  const modelBuffer = await fetchWithCache(modelUrl);

  // Create ONNX inference session (WASM backend, single-threaded)
  config.session = await ort.InferenceSession.create(
    new Uint8Array(modelBuffer),
    { executionProviders: ['wasm'] },
  );

  config.loading = false;
}

/**
 * Load the type classifier eagerly at worker init.
 * Errors degrade gracefully to Tier 1 — never throws.
 */
async function loadClassifier(): Promise<void> {
  if (classifierLoading || classifierSession) return;
  classifierLoading = true;

  try {
    await cleanOldCaches();
    await loadClassifierConfig(TYPE_CLASSIFIER);

    // Sync legacy aliases for backward compatibility
    classifierSession = TYPE_CLASSIFIER.session;
    classMap = TYPE_CLASSIFIER.classMap;

    classifierLoading = false;
    self.postMessage({ type: 'CLASSIFIER_READY' });
  } catch (err) {
    classifierLoading = false;
    const message = err instanceof Error ? err.message : String(err);
    console.error('[embedding-worker] Classifier load error:', message);
    self.postMessage({ type: 'CLASSIFIER_ERROR', error: message });
  }
}

// --- GTD classifier lazy loading ---

let gtdClassifiersLoaded = false;
let gtdClassifiersLoading = false;

/**
 * Load all 4 GTD classifiers lazily on first CLASSIFY_GTD request.
 * Individual load errors are caught — partially loaded classifiers still work.
 */
async function loadGtdClassifiers(): Promise<void> {
  if (gtdClassifiersLoaded || gtdClassifiersLoading) return;
  gtdClassifiersLoading = true;
  try {
    await Promise.all(GTD_CLASSIFIERS.map(c => loadClassifierConfig(c)));
    gtdClassifiersLoaded = true;
    self.postMessage({ type: 'GTD_CLASSIFIERS_READY' });
  } catch (err) {
    // Some classifiers may have loaded — mark loaded if any succeeded
    const anyLoaded = GTD_CLASSIFIERS.some(c => c.session !== null);
    if (anyLoaded) {
      gtdClassifiersLoaded = true;
      self.postMessage({ type: 'GTD_CLASSIFIERS_READY' });
    }
    gtdClassifiersLoading = false;
    console.error('[embedding-worker] GTD classifiers partial load error:', err);
  }
}

/**
 * Run ONNX inference on a 384-dim embedding vector using a specific classifier config.
 * Returns per-class probability scores mapped to class label names.
 */
async function runClassifierOnEmbedding(
  config: ClassifierConfig,
  embedding: number[],
): Promise<Record<string, number>> {
  if (!config.session || !config.classMap) {
    throw new Error(`Classifier ${config.name} not ready`);
  }

  // Use embedding.length for tensor shape (not hardcoded 384) — supports 512-dim
  // concatenated vectors when sequence context is prepended (Phase 33).
  const inputTensor = new ort.Tensor('float32', Float32Array.from(embedding), [1, embedding.length]);
  const results = await config.session.run({ [config.session.inputNames[0]!]: inputTensor });

  const outputNames = config.session.outputNames;
  const probaName = outputNames.find((n) => n.toLowerCase().includes('prob'))
    ?? (outputNames.length > 1 ? outputNames[1] : outputNames[0]);

  const probData = Array.from(results[probaName!]!.data as Float32Array);

  const scores: Record<string, number> = {};
  for (let i = 0; i < probData.length; i++) {
    const label = config.classMap[String(i)];
    if (label) scores[label] = probData[i] ?? 0;
  }
  return scores;
}

/**
 * Run ONNX inference on a 384-dim embedding vector using the type classifier.
 * Delegates to runClassifierOnEmbedding with the TYPE_CLASSIFIER config.
 * Throws if classifier or class map is not loaded.
 */
async function runClassifierInference(embedding: number[]): Promise<Record<string, number>> {
  return runClassifierOnEmbedding(TYPE_CLASSIFIER, embedding);
}

// --- Completeness gate lazy loading ---

let completenessGateLoaded = false;

/**
 * Load the completeness gate classifier lazily on first CHECK_COMPLETENESS request.
 */
async function loadCompletenessGate(): Promise<void> {
  if (completenessGateLoaded || COMPLETENESS_GATE.loading) return;
  try {
    await loadClassifierConfig(COMPLETENESS_GATE);
    completenessGateLoaded = true;
    self.postMessage({ type: 'COMPLETENESS_GATE_READY' });
  } catch (err) {
    console.error('[embedding-worker] Completeness gate load error:', err);
  }
}

// --- Sequence context LSTM lazy loading ---

/**
 * Load the sequence context LSTM model lazily on first GET_SEQUENCE_CONTEXT request.
 * Fails silently when the model file does not exist yet (pre-training).
 */
async function loadSequenceModel(): Promise<void> {
  if (SEQUENCE_MODEL.loading || SEQUENCE_MODEL.session) return;
  SEQUENCE_MODEL.loading = true;
  try {
    const base = resolveBase();
    const modelUrl = `${base}${SEQUENCE_MODEL.modelPath}`;
    const modelBuffer = await fetchWithCache(modelUrl);
    SEQUENCE_MODEL.session = await ort.InferenceSession.create(
      new Uint8Array(modelBuffer),
      { executionProviders: ['wasm'] },
    );
  } catch (err) {
    // Model may not exist yet — degrade gracefully to zero-pad fallback
    console.warn('[embedding-worker] Sequence context model not found — using zero-pad fallback:', err);
  }
  SEQUENCE_MODEL.loading = false;
}

/**
 * Run LSTM inference over a sequence of 384-dim embeddings.
 * Returns a 128-dim context vector, or all-zeros when model is not loaded.
 *
 * @param embeddings Array of 384-dim embedding vectors (ring buffer contents)
 */
async function runSequenceInference(embeddings: number[][]): Promise<number[]> {
  if (!SEQUENCE_MODEL.session || embeddings.length === 0) {
    return new Array(128).fill(0);
  }
  try {
    const seqLen = embeddings.length;
    const inputDim = 384;
    // Flatten [seq_len, 384] → Float32Array, LSTM expects [seq_len, 1, inputDim]
    const flat = new Float32Array(seqLen * inputDim);
    for (let i = 0; i < seqLen; i++) {
      const emb = embeddings[i]!;
      for (let j = 0; j < inputDim; j++) {
        flat[i * inputDim + j] = emb[j] ?? 0;
      }
    }
    const inputTensor = new ort.Tensor('float32', flat, [seqLen, 1, inputDim]);
    const results = await SEQUENCE_MODEL.session.run(
      { [SEQUENCE_MODEL.session.inputNames[0]!]: inputTensor },
    );
    const outputName = SEQUENCE_MODEL.session.outputNames[0]!;
    const contextData = results[outputName]!.data as Float32Array;
    return Array.from(contextData).slice(0, 128);
  } catch (err) {
    console.warn('[embedding-worker] Sequence inference error — returning zero-pad:', err);
    return new Array(128).fill(0);
  }
}

// --- Missing info classifiers lazy loading ---

let missingInfoClassifiersLoaded = false;
let missingInfoClassifiersLoading = false;

/**
 * Load all 5 missing-info binary classifiers lazily on first CLASSIFY_MISSING_INFO request.
 * Individual load errors are caught — partially loaded classifiers still work.
 */
async function loadMissingInfoClassifiers(): Promise<void> {
  if (missingInfoClassifiersLoaded || missingInfoClassifiersLoading) return;
  missingInfoClassifiersLoading = true;
  try {
    // Load sequentially — single-threaded WASM backend
    for (const config of MISSING_INFO_CLASSIFIERS) {
      await loadClassifierConfig(config);
    }
    missingInfoClassifiersLoaded = true;
    self.postMessage({ type: 'MISSING_INFO_CLASSIFIERS_READY' });
  } catch (err) {
    // Some classifiers may have loaded — mark loaded if any succeeded
    const anyLoaded = MISSING_INFO_CLASSIFIERS.some(c => c.session !== null);
    if (anyLoaded) {
      missingInfoClassifiersLoaded = true;
      self.postMessage({ type: 'MISSING_INFO_CLASSIFIERS_READY' });
    }
    missingInfoClassifiersLoading = false;
    console.error('[embedding-worker] Missing info classifiers partial load error:', err);
  }
}

// --- Message handler ---

type WorkerIncoming =
  | { type: 'EMBED'; id: string; texts: string[] }
  | { type: 'EMBED_ATOMS'; atoms: { id: string; text: string }[] }
  | { type: 'CLASSIFY_TYPE'; id: string; text: string; centroids: Record<string, number[]> }
  | { type: 'ROUTE_SECTION'; id: string; text: string; centroids: Record<string, number[]> }
  | { type: 'CLASSIFY_ONNX'; id: string; text: string; binderId?: string }
  | { type: 'CLASSIFY_GTD'; id: string; text: string }
  | { type: 'CLASSIFY_DECOMPOSE'; id: string; text: string }
  | { type: 'CHECK_COMPLETENESS'; id: string; text: string }
  | { type: 'CLASSIFY_MISSING_INFO'; id: string; text: string }
  | { type: 'LOAD_CLASSIFIER' }
  | { type: 'LOAD_RING_BUFFER'; binderId: string; embeddings: number[][] }
  | { type: 'UPDATE_RING_BUFFER'; binderId: string; embedding: number[]; windowSize: number }
  | { type: 'GET_SEQUENCE_CONTEXT'; id: string; binderId: string; windowSize: number };

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
    return;
  }

  if (msg.type === 'LOAD_CLASSIFIER') {
    // Fire-and-forget — errors handled internally by loadClassifier()
    void loadClassifier();
    return;
  }

  if (msg.type === 'CLASSIFY_ONNX') {
    try {
      // Embed the text using the existing MiniLM pipeline
      const vectors = await embedTexts([msg.text]);
      const miniLMVector = vectors[0] ?? [];

      // Phase 33: When binderId provided, concatenate 128-dim sequence context
      // before classifier inference (SIMPLER path — concatenation happens in worker).
      let inferenceVector = miniLMVector;
      if (msg.binderId) {
        const ringBuffer = getRingBuffer(msg.binderId);
        if (ringBuffer.length > 0 && SEQUENCE_MODEL.session) {
          const seqContext = await runSequenceInference(ringBuffer);
          // Concatenate: [384-dim MiniLM] + [128-dim sequence context] = 512-dim
          inferenceVector = [...miniLMVector, ...seqContext];
        }
      }

      // Run ONNX inference on the (potentially 512-dim) embedding
      const scores = await runClassifierInference(inferenceVector);

      // Always return the original 384-dim MiniLM vector for centroid building / ring buffer
      self.postMessage({ type: 'ONNX_RESULT', id: msg.id, scores, vector: miniLMVector });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      self.postMessage({ type: 'ONNX_ERROR', id: msg.id, error });
    }
    return;
  }

  if (msg.type === 'CLASSIFY_GTD') {
    try {
      // Lazy-load GTD classifiers on first request
      if (!gtdClassifiersLoaded) {
        await loadGtdClassifiers();
      }

      // Embed text once — reuse for all 4 classifiers
      const vectors = await embedTexts([msg.text]);
      const vector = vectors[0] ?? [];

      // Run each loaded GTD classifier on the same embedding
      // Run classifiers sequentially — ONNX Runtime single-threaded WASM
      // backend errors with "Session already started" on concurrent runs.
      const runIfReady = async (config: ClassifierConfig): Promise<Record<string, number> | null> => {
        if (!config.session || !config.classMap) return null;
        try {
          return await runClassifierOnEmbedding(config, vector);
        } catch (err) {
          console.error(`[embedding-worker] GTD classifier ${config.name} inference error:`, err);
          return null;
        }
      };

      const routing = await runIfReady(GTD_CLASSIFIERS[0]!);
      const actionability = await runIfReady(GTD_CLASSIFIERS[1]!);
      const project = await runIfReady(GTD_CLASSIFIERS[2]!);
      const context = await runIfReady(GTD_CLASSIFIERS[3]!);

      self.postMessage({
        type: 'GTD_RESULT',
        id: msg.id,
        vector,
        routing,
        actionability,
        project,
        context,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      self.postMessage({ type: 'GTD_ERROR', id: msg.id, error });
    }
    return;
  }

  if (msg.type === 'CHECK_COMPLETENESS') {
    try {
      // Lazy-load completeness gate on first request
      if (!completenessGateLoaded) {
        await loadCompletenessGate();
      }

      if (!COMPLETENESS_GATE.session || !COMPLETENESS_GATE.classMap) {
        self.postMessage({ type: 'COMPLETENESS_ERROR', id: msg.id, error: 'Completeness gate not loaded' });
        return;
      }

      // Embed text once
      const vectors = await embedTexts([msg.text]);
      const vector = vectors[0] ?? [];

      // Run ONNX inference — single binary classifier
      const scores = await runClassifierOnEmbedding(COMPLETENESS_GATE, vector);

      // Binary output: 'incomplete' class score determines isIncomplete
      const incompleteScore = scores['incomplete'] ?? 0;
      const completeScore = scores['complete'] ?? 0;
      const isIncomplete = incompleteScore > completeScore;
      const confidence = isIncomplete ? incompleteScore : completeScore;

      self.postMessage({
        type: 'COMPLETENESS_RESULT',
        id: msg.id,
        isIncomplete,
        confidence,
        vector,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      self.postMessage({ type: 'COMPLETENESS_ERROR', id: msg.id, error });
    }
    return;
  }

  if (msg.type === 'CLASSIFY_MISSING_INFO') {
    try {
      // Lazy-load all 5 missing-info classifiers on first request
      if (!missingInfoClassifiersLoaded) {
        await loadMissingInfoClassifiers();
      }

      // Embed text once — reuse for all 5 classifiers
      const vectors = await embedTexts([msg.text]);
      const vector = vectors[0] ?? [];

      // Run 5 binary classifiers SEQUENTIALLY (single-threaded WASM — Research Pitfall 1)
      const categories = ['missing-outcome', 'missing-next-action', 'missing-timeframe', 'missing-context', 'missing-reference'] as const;
      const results: Array<{ category: string; isMissing: boolean; confidence: number }> = [];

      for (let i = 0; i < MISSING_INFO_CLASSIFIERS.length; i++) {
        const config = MISSING_INFO_CLASSIFIERS[i]!;
        const category = categories[i]!;

        if (!config.session || !config.classMap) {
          // Classifier failed to load — skip with zero confidence
          results.push({ category, isMissing: false, confidence: 0 });
          continue;
        }

        try {
          const scores = await runClassifierOnEmbedding(config, vector);
          const missingScore = scores['missing'] ?? 0;
          const presentScore = scores['present'] ?? 0;
          const isMissing = missingScore > presentScore;
          const confidence = isMissing ? missingScore : presentScore;
          results.push({ category, isMissing, confidence });
        } catch (err) {
          console.error(`[embedding-worker] Missing info classifier ${config.name} error:`, err);
          results.push({ category, isMissing: false, confidence: 0 });
        }
      }

      self.postMessage({
        type: 'MISSING_INFO_RESULT',
        id: msg.id,
        results,
        vector,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      self.postMessage({ type: 'MISSING_INFO_ERROR', id: msg.id, error });
    }
    return;
  }

  if (msg.type === 'CLASSIFY_DECOMPOSE') {
    try {
      // Lazy-load decomposition classifier on first request
      if (!DECOMPOSITION_CLASSIFIER.session) {
        await loadClassifierConfig(DECOMPOSITION_CLASSIFIER);
        self.postMessage({ type: 'DECOMPOSITION_CLASSIFIER_READY' });
      }

      // Embed text once
      const vectors = await embedTexts([msg.text]);
      const vector = vectors[0] ?? [];

      // Run ONNX inference on the embedding — sequential (single-threaded WASM)
      const scores = await runClassifierOnEmbedding(DECOMPOSITION_CLASSIFIER, vector);

      self.postMessage({
        type: 'DECOMPOSE_RESULT',
        id: msg.id,
        scores,
        vector,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      self.postMessage({ type: 'DECOMPOSE_ERROR', id: msg.id, error });
    }
    return;
  }

  // --- Phase 33: Ring buffer message handlers ---

  if (msg.type === 'LOAD_RING_BUFFER') {
    // Hydrate in-memory buffer from main thread data (Dexie restore on startup).
    // No response needed — worker silently sets buffer state.
    setRingBuffer(msg.binderId, msg.embeddings);
    return;
  }

  if (msg.type === 'UPDATE_RING_BUFFER') {
    // Append new embedding to the ring buffer and notify main thread to persist.
    updateRingBuffer(msg.binderId, msg.embedding, msg.windowSize);
    const embeddings = getRingBuffer(msg.binderId);
    self.postMessage({ type: 'RING_BUFFER_UPDATED', binderId: msg.binderId, embeddings });
    return;
  }

  if (msg.type === 'GET_SEQUENCE_CONTEXT') {
    // Run LSTM inference over ring buffer and return 128-dim context vector.
    // Falls back to zero-pad when buffer is empty or model is not loaded.
    try {
      if (!SEQUENCE_MODEL.session) {
        await loadSequenceModel();
      }
      const ringBuffer = getRingBuffer(msg.binderId);
      const context = await runSequenceInference(ringBuffer);
      self.postMessage({ type: 'SEQUENCE_CONTEXT_RESULT', id: msg.id, context });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      self.postMessage({ type: 'SEQUENCE_CONTEXT_ERROR', id: msg.id, error });
    }
    return;
  }
};

// --- Eager loading at worker init ---
// Load classifier alongside MiniLM pipeline startup.
// If model not available (placeholder or network error), degrades gracefully to Tier 1.
void loadClassifier();
