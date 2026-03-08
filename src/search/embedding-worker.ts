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
 *   { type: 'CLASSIFY_ONNX'; id: string; text: string }
 *   { type: 'CLASSIFY_GTD'; id: string; text: string }
 *   { type: 'CLASSIFY_DECOMPOSE'; id: string; text: string }
 *   { type: 'LOAD_CLASSIFIER' }
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
 *
 * Graceful degradation: all errors are caught and returned as EMBED_ERROR,
 * never thrown — the main thread never blocks waiting for embeddings.
 */

import { pipeline, env } from '@huggingface/transformers';
import * as ort from 'onnxruntime-web';

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

  const inputTensor = new ort.Tensor('float32', Float32Array.from(embedding), [1, 384]);
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

// --- Message handler ---

type WorkerIncoming =
  | { type: 'EMBED'; id: string; texts: string[] }
  | { type: 'EMBED_ATOMS'; atoms: { id: string; text: string }[] }
  | { type: 'CLASSIFY_TYPE'; id: string; text: string; centroids: Record<string, number[]> }
  | { type: 'ROUTE_SECTION'; id: string; text: string; centroids: Record<string, number[]> }
  | { type: 'CLASSIFY_ONNX'; id: string; text: string }
  | { type: 'CLASSIFY_GTD'; id: string; text: string }
  | { type: 'CLASSIFY_DECOMPOSE'; id: string; text: string }
  | { type: 'LOAD_CLASSIFIER' };

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
      const vector = vectors[0] ?? [];

      // Run ONNX inference on the 384-dim embedding
      const scores = await runClassifierInference(vector);

      self.postMessage({ type: 'ONNX_RESULT', id: msg.id, scores, vector });
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
};

// --- Eager loading at worker init ---
// Load classifier alongside MiniLM pipeline startup.
// If model not available (placeholder or network error), degrades gracefully to Tier 1.
void loadClassifier();
