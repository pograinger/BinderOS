# Phase 10: Browser Inference Integration - Research

**Researched:** 2026-03-04
**Domain:** ONNX Runtime Web, Cache API, Web Worker messaging, SolidJS reactive state
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Model download experience:**
- Progress indicator appears in the existing status bar at bottom — non-intrusive, consistent with current AI status display
- If user triggers triage while model is still downloading, proceed with Tier 1 keyword heuristics immediately — user is never blocked
- Silent completion — status bar indicator disappears when download finishes, no toast or confirmation
- If download fails (network error, CORS), silent fallback to Tier 1 — no error shown to user, retry automatically next session

**Ambiguous classification display:**
- When top-2 type probabilities are within 0.15 of each other, show two side-by-side buttons (e.g., [Decision] [Insight]) — no pre-selection, user picks
- Subtle "could be either" label above the two buttons — explains why there are two options without being technical
- Record both top-1 and top-2 type + confidence in ClassificationEvent — contested examples are the most valuable retraining data
- When model IS confident (clear winner), pre-fill type as current behavior — different UX naturally signals confidence level

**Model loading timing:**
- Eager loading at app boot, alongside MiniLM embedding model — ~200-400KB, <100ms parse, ready before user ever opens inbox
- Load ONNX model in the existing embedding worker (same thread as MiniLM) — embeddings and classification in one worker, zero data transfer overhead
- ONNX classifier file committed to `public/models/classifiers/` — served as static asset by Vite, same pattern as MiniLM model
- Cache API cache key includes model version hash (e.g., "onnx-classifier-v1-abc123") — new model version = automatic re-download, old versions cleaned up

**Fallback and escalation behavior:**
- When ONNX model fails, degradation is completely invisible to the user — same triage card regardless of which tier answered
- Keep current tier and confidence display in triage suggestion card as-is — transparency for power users and debugging
- No model status info visible until Phase 11 settings panel — Phase 10 is pure plumbing, model just works silently
- Escalation from Tier 2 to Tier 3 (cloud LLM) is automatic when confidence below 0.78 — the existing pre-send approval modal IS the gate, no extra friction

### Claude's Discretion
- Exact Cache API implementation details (cache name, cleanup strategy for old versions)
- Status bar progress indicator visual design (spinner, bar, text)
- ONNX Runtime Web initialization config (threading, WASM backend settings)
- How to coordinate model readiness signal between embedding worker and store

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFER-01 | User's inbox triage type classification works fully offline using the fine-tuned ONNX model in Tier 2 | ONNX Runtime Web `InferenceSession.create(Uint8Array)` runs in embedding worker; `CLASSIFY_ONNX` message type replaces centroid path in tier2-handler |
| INFER-02 | User sees a progress indicator during first-time model download with clear messaging ("one-time download") | Fetch ReadableStream + `content-length` header pattern; postMessage `CLASSIFIER_PROGRESS` event to store; StatusBar gets new signal |
| INFER-03 | User's triage continues working via Tier 1 keyword heuristics if the ONNX model fails to load or errors | Embedding worker already has full error isolation; `tier2-handler.canHandle()` returns false when model not ready — Tier 1 takes over automatically |
| INFER-04 | User experiences no UI blocking during model loading — all ONNX inference runs in the embedding worker off main thread | Confirmed: `InferenceSession.create()` called inside embedding worker, never on main thread; WASM SIMD runs off main thread |
| INFER-05 | ONNX model files are cached in browser Cache API across sessions — no re-download on subsequent visits | Cache API available from workers: `caches.open()`, `cache.match()`, `cache.put()` pattern with versioned cache key |
| CONF-02 | When top-2 class probabilities are within 0.15 of each other, user sees both options rather than a single pre-filled suggestion | Softmax probability output from ONNX session exposes all 5 class scores; ambiguity computed in worker before postMessage; new `ambiguousTypes` field on TriageSuggestion |
| CONF-03 | Classification log captures `modelSuggestion` separately from `userChoice` to prevent model-collapse feedback loops | `modelSuggestion?: AtomType` field already exists on ClassificationEvent (added Phase 9 Plan 01); populate it from ONNX top-1 before any user interaction |
</phase_requirements>

---

## Summary

Phase 10 wires the validated `triage-type.onnx` (a 200-400KB calibrated MLP from Phase 9) into the browser's embedding worker so that every inbox triage call that reaches Tier 2 runs real ONNX inference rather than centroid cosine similarity. The work touches three surfaces: (1) the embedding worker gains a `CLASSIFY_ONNX` message handler and Cache API model loading with progress reporting, (2) the Tier 2 handler switches from centroid-based to ONNX-based classification when the model is ready, and (3) the InboxAISuggestion component gains a two-button ambiguous-type UX.

The critical architectural insight is that all three surfaces already exist and just need to be upgraded rather than created from scratch. `embedding-worker.ts` already loads models, handles errors gracefully, and sends typed postMessages. `tier2-handler.ts` already sends worker messages and reads scores. `InboxAISuggestion.tsx` already renders pending/complete/error states. The phase adds new message types and extends existing types — it does not restructure.

The biggest technical risk is WASM binary path configuration: `onnxruntime-web` ships its own `.wasm` binaries that must be co-located or pointed to via `ort.env.wasm.wasmPaths`. The Vite config already excludes `ort-wasm-*` from service worker precache, but `wasmPaths` must be explicitly set in the worker so ORT finds its binaries at the correct `base` path (GitHub Pages adds `/BinderOS/` prefix). This is the one area that must be verified against the actual hosting environment.

**Primary recommendation:** Add `CLASSIFY_ONNX` message handler to `embedding-worker.ts` with Cache API loading and progress events, update `tier2-handler.ts` to send `CLASSIFY_ONNX` instead of `CLASSIFY_TYPE`, update `CONFIDENCE_THRESHOLDS['classify-type']` from 0.65 to 0.78, and extend `TriageSuggestion` + `InboxAISuggestion` for the ambiguous two-button UX.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `onnxruntime-web` | 1.24.2 (already installed) | ONNX model inference in browser WASM | Already validated in Phase 9 Node.js harness; same API in workers |
| Cache API (`caches` global) | Browser built-in | Model persistence across sessions | Available from workers, no extra library, ORT docs recommend it |
| Fetch ReadableStream | Browser built-in | Download with progress tracking | Only way to track download progress; `content-length` header required |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@huggingface/transformers` | 3.8.1 (already installed) | MiniLM embedding (existing, unchanged) | Already handles embeddings; ONNX classifier adds to same worker |
| SolidJS signals | 1.9.11 (already installed) | Reactive download progress in StatusBar | New `classifierLoadProgress` signal follows existing `tier2Status` pattern |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Cache API | IndexedDB (via Dexie) | Dexie adds a library dependency and is better for structured records; Cache API is idiomatic for binary assets |
| Cache API | Origin Private File System | OPFS requires different async API; Cache API is simpler and sufficient for a single ~300KB model |
| Fetch+ReadableStream progress | XHR with onprogress | XHR works but fetch+stream is modern; this is a worker context where both are available |

**Installation:** No new packages needed. `onnxruntime-web` 1.24.2 already installed.

---

## Architecture Patterns

### Recommended Project Structure

The following files are created or modified (no new directories):

```
src/
├── search/
│   └── embedding-worker.ts        # MODIFIED: add CLASSIFY_ONNX handler + Cache API loading
├── ai/
│   └── tier2/
│       ├── types.ts               # MODIFIED: CONFIDENCE_THRESHOLDS['classify-type'] 0.65→0.78
│       └── tier2-handler.ts       # MODIFIED: send CLASSIFY_ONNX instead of CLASSIFY_TYPE
├── ui/
│   ├── signals/
│   │   └── store.ts               # MODIFIED: classifierLoadProgress signal, initTieredAI wiring
│   ├── layout/
│   │   └── StatusBar.tsx          # MODIFIED: show classifier download progress
│   └── components/
│       └── InboxAISuggestion.tsx  # MODIFIED: ambiguous two-button UX
└── ai/
    └── triage.ts                  # MODIFIED: populate modelSuggestion in logClassification call
```

### Pattern 1: ONNX Inference in an Existing Web Worker

**What:** `InferenceSession.create(Uint8Array)` accepts a model loaded from Cache API or fetch. This runs entirely inside the worker — no main thread involvement.

**When to use:** Any time you want off-main-thread inference. The embedding worker is already isolated; just add the ORT session alongside the Transformers.js pipeline.

**Example:**
```typescript
// Inside embedding-worker.ts (worker scope)
import * as ort from 'onnxruntime-web';

// Configure WASM paths BEFORE creating any session
// Must match Vite base path. In prod (/BinderOS/), set explicitly.
ort.env.wasm.wasmPaths = '/onnxruntime-web/dist/';  // or use import.meta.url trick

let classifierSession: ort.InferenceSession | null = null;

async function loadClassifier(modelUrl: string): Promise<void> {
  // 1. Check Cache API first
  const cache = await caches.open('onnx-classifier-v1');
  let response = await cache.match(modelUrl);

  if (!response) {
    // 2. Fetch with progress tracking
    const fetchResponse = await fetch(modelUrl);
    const contentLength = +(fetchResponse.headers.get('content-length') ?? 0);
    const reader = fetchResponse.body!.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      // Report progress back to main thread
      const pct = contentLength > 0 ? Math.round((received / contentLength) * 100) : -1;
      self.postMessage({ type: 'CLASSIFIER_PROGRESS', percent: pct });
    }

    // Reconstruct full buffer
    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    const buffer = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }

    // 3. Store in Cache API for next session
    const cacheResponse = new Response(buffer, {
      headers: { 'content-type': 'application/octet-stream' }
    });
    await cache.put(modelUrl, cacheResponse);
    response = cacheResponse;
  }

  const modelBuffer = await response!.arrayBuffer();
  classifierSession = await ort.InferenceSession.create(
    new Uint8Array(modelBuffer),
    { executionProviders: ['wasm'] }
  );
  self.postMessage({ type: 'CLASSIFIER_READY' });
}
```

### Pattern 2: New Worker Message Types

**What:** Extend the existing typed message union in `embedding-worker.ts` with `CLASSIFY_ONNX` request and `CLASSIFIER_READY`/`CLASSIFIER_PROGRESS`/`CLASSIFIER_ERROR` response types. Extend `tier2-handler.ts` to send `CLASSIFY_ONNX`.

**Example:**
```typescript
// New worker incoming message
| { type: 'CLASSIFY_ONNX'; id: string; embedding: number[] }

// New worker outgoing messages
| { type: 'ONNX_RESULT'; id: string; scores: Record<string, number> }
| { type: 'ONNX_ERROR'; id: string; error: string }
| { type: 'CLASSIFIER_READY' }
| { type: 'CLASSIFIER_PROGRESS'; percent: number }
| { type: 'CLASSIFIER_ERROR'; error: string }

// ONNX inference inside worker
async function runClassifierInference(
  embedding: number[],
  classMap: Record<string, string>,  // loaded from triage-type-classes.json
): Promise<Record<string, number>> {
  if (!classifierSession) throw new Error('Classifier not ready');

  const input = new ort.Tensor('float32', Float32Array.from(embedding), [1, 384]);
  const results = await classifierSession.run({ [classifierSession.inputNames[0]]: input });

  // Find probability output (index 1 for skl2onnx CalibratedClassifierCV)
  const outputNames = classifierSession.outputNames;
  const probaName = outputNames.find(n => n.toLowerCase().includes('prob')) ?? outputNames[1] ?? outputNames[0];
  const probData = Array.from(results[probaName!].data as Float32Array);

  // Map probability array back to class names using classMap
  const scores: Record<string, number> = {};
  for (let i = 0; i < probData.length; i++) {
    const label = classMap[String(i)];
    if (label) scores[label] = probData[i] ?? 0;
  }
  return scores;
}
```

### Pattern 3: Ambiguous Type Detection

**What:** Compare top-2 probabilities. If spread < 0.15, signal ambiguity to `TriageSuggestion`.

**When to use:** After ONNX inference returns all 5 class probabilities.

**Example:**
```typescript
// In tier2-handler.ts handle() for 'classify-type':
const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
const [top1, top2] = sorted;
const spread = (top1[1] ?? 0) - (top2[1] ?? 0);
const isAmbiguous = spread < 0.15;

// TriageSuggestion extension:
export interface TriageSuggestion {
  // ...existing fields...
  /** Second-best type when model is uncertain (spread < 0.15) */
  alternativeType?: AtomType;
  /** Confidence spread between top-1 and top-2 (for logging) */
  confidenceSpread?: number;
}
```

### Pattern 4: Cache API Versioned Cache Key

**What:** Include a version identifier in the cache name so model updates trigger automatic re-download. Clean up old cache versions on startup.

**Example:**
```typescript
// Cache name embeds version — change to force re-download
// The "version" can be a short hash baked in as a constant
const CLASSIFIER_CACHE_NAME = 'onnx-classifier-v1';
const CLASSIFIER_MODEL_URL = '/models/classifiers/triage-type.onnx';
const CLASSIFIER_CLASSES_URL = '/models/classifiers/triage-type-classes.json';

// Cleanup: on init, delete any cache names matching old pattern
async function cleanOldCaches(): Promise<void> {
  const keys = await caches.keys();
  for (const key of keys) {
    if (key.startsWith('onnx-classifier-') && key !== CLASSIFIER_CACHE_NAME) {
      await caches.delete(key);
    }
  }
}
```

### Pattern 5: Store Signal for Download Progress

**What:** Add a `classifierLoadProgress` signal to `store.ts` that the StatusBar can consume reactively. The embedding worker sends `CLASSIFIER_PROGRESS` messages; the worker bridge delivers them to the store signal.

**Example:**
```typescript
// store.ts — new signals (follows tier2Status pattern)
const [classifierLoadProgress, setClassifierLoadProgress] = createSignal<number | null>(null);
// null = not loading, 0-100 = downloading, -1 = indeterminate progress
export { classifierLoadProgress };

// Wire in the embedding worker's message listener (already bridges via onmessage):
// When worker sends { type: 'CLASSIFIER_PROGRESS', percent }, set the signal.
// When worker sends { type: 'CLASSIFIER_READY' }, set null to hide the indicator.
// When worker sends { type: 'CLASSIFIER_ERROR' }, set null (silent fallback).

// StatusBar.tsx — new segment (only shows while loading):
<Show when={classifierLoadProgress() !== null}>
  <div class="status-bar-item classifier-loading">
    <span class="status-bar-dot dev" />
    <span>
      {classifierLoadProgress() === -1
        ? 'AI model (one-time download)...'
        : `AI model ${classifierLoadProgress()}% (one-time download)`}
    </span>
  </div>
</Show>
```

### Anti-Patterns to Avoid

- **Loading ONNX model on the main thread:** Blocks UI during the 100ms parse. Always load inside the embedding worker.
- **Using `ort.env.wasm.proxy`:** The proxy worker feature adds indirection; we already run inside a worker, so proxy is unnecessary and can cause issues with COEP.
- **Storing model in IndexedDB (Dexie):** Binary blob storage in Dexie is possible but awkward; Cache API is designed for this use case and is available from workers.
- **Bundling the ONNX file as a JS import:** Vite will try to inline or hash it into chunks; serving from `public/` avoids this.
- **Using `ort.env.wasm.numThreads > 1` without verifying SharedArrayBuffer:** Multi-threading requires `crossOriginIsolated = true`. The Vite config already sets COOP/COEP headers for dev/preview, but production headers must be verified. Setting `numThreads: 1` is a safe default for the classifier (it's tiny — 200-400KB, 5 classes).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Binary model storage across sessions | Custom IndexedDB blob store | Cache API (`caches.open`, `cache.put`, `cache.match`) | Designed for binary assets, available from workers, zero library cost |
| Download progress without streaming | Fake progress bar with setTimeout | Fetch `ReadableStream` + `content-length` header | Real chunk-by-chunk progress; gracefully degrades to indeterminate if no content-length |
| Model version invalidation | Manual cache key table | Versioned cache name prefix (`onnx-classifier-v1`) + `caches.keys()` cleanup | Old caches auto-cleaned when version string changes |
| ONNX inference | Custom MLP forward pass in TypeScript | `ort.InferenceSession.create()` + `session.run()` | ORT handles WASM SIMD, float32 precision, output naming — all already validated in Phase 9 harness |

**Key insight:** The entire model loading + caching pipeline is ~60 lines of worker code. All the complexity (stream reassembly, cache API, ORT session creation) has clean browser APIs. The only custom logic is the probability-to-score mapping (already present in the validation harness).

---

## Common Pitfalls

### Pitfall 1: ORT WASM Binary Not Found

**What goes wrong:** `InferenceSession.create()` silently fails or throws "no available backend found" because the `.wasm` files aren't at the URL ORT expects.

**Why it happens:** ORT derives the WASM path from `import.meta.url` (relative to the JS bundle), but in a Vite build the bundle is in `assets/` while WASM files are in the root. The GitHub Pages base path `/BinderOS/` further displaces the default expectation.

**How to avoid:** Explicitly set `ort.env.wasm.wasmPaths` before any `InferenceSession.create()` call. The existing Vite config already excludes `ort-wasm-*` from service worker precache, confirming the WASM files are served from the root.

**Warning signs:** "no available backend found" or "failed to load WASM" in the worker console. Test in both dev (`/`) and production (`/BinderOS/`) base paths.

```typescript
// Set this ONCE at the top of embedding-worker.ts, before any ORT usage:
// The wasmPaths string must end with '/'. Use base path from env if available.
ort.env.wasm.wasmPaths = (self as unknown as { location: Location }).location.origin + '/';
// Or more specifically target the dist subfolder of onnxruntime-web:
// ort.env.wasm.wasmPaths = '/';  // For simple cases where wasm files are at root
```

**Note (MEDIUM confidence):** The exact wasmPaths value may need to be `'/'` or include the version prefix depending on how Vite copies ORT WASM files. The existing vite-plugin-wasm and `vite-plugin-top-level-await` plugins already handle top-level await; verify actual file locations in `dist/` after build.

### Pitfall 2: `content-length` Header Missing → No Progress

**What goes wrong:** The progress bar shows 0% or never updates because GitHub Pages / CDN does not set `content-length` header on the ONNX binary.

**Why it happens:** Some static hosts omit `content-length` for large binary responses.

**How to avoid:** Check for absent content-length and fall back to indeterminate progress (`percent = -1`). StatusBar text changes from "X% (one-time download)" to "(one-time download)..." — still communicates the download without showing a stuck 0%.

**Warning signs:** `contentLength` is `0` or `NaN` after `+response.headers.get('content-length')`.

### Pitfall 3: Classifier Not Ready When Triage Runs

**What goes wrong:** User opens inbox immediately after app boot. Classifier is still loading (Cache API lookup + optional fetch). `tier2-handler.canHandle()` must return `false` and fall through to Tier 1.

**Why it happens:** Eager loading is asynchronous. The store's `CLASSIFIER_READY` signal takes ~50-200ms even from Cache API hit.

**How to avoid:** The `tier2-handler.canHandle()` guard already checks `getWorker()`. Add a second guard: `classifierSession !== null` in the worker. When session is null, the `ONNX_ERROR` response triggers Tier 2 returning `confidence: 0`, which causes the pipeline to fall to Tier 1. This is already how the centroid path works.

**Warning signs:** ONNX_ERROR messages appearing in console during the brief boot window. These are expected and harmless — Tier 1 handles them.

### Pitfall 4: Ambiguous UX in the Triage Card

**What goes wrong:** Showing two buttons mid-card breaks the existing `InboxAISuggestion` layout. The `selectedType` signal in InboxView is pre-filled by `suggestion.suggestedType` — it needs to be cleared when `alternativeType` is present.

**Why it happens:** The current `InboxAISuggestion` assumes a single `suggestedType`. The triage card pre-fills `selectedType` on mount.

**How to avoid:** When `suggestion.alternativeType` is defined, do NOT pre-fill `selectedType`. Instead render two buttons side by side. User's tap sets `selectedType` to their pick. Subsequent accept flow is identical.

### Pitfall 5: `modelSuggestion` Recorded After User Interaction

**What goes wrong:** If `modelSuggestion` is populated from `suggestion.suggestedType` at the point the user accepts (after they may have changed it), it captures user choice not model choice — defeating CONF-03.

**Why it happens:** The triage pipeline result and the user's final selection are both `AtomType` values. It's easy to capture the wrong one.

**How to avoid:** `modelSuggestion` must be set from `result.type` inside `triage.ts` at the moment the ONNX result arrives — before `onSuggestion` is called. It must not be updated by `acceptAISuggestion`. The `logClassification` call in InboxView should receive `modelSuggestion` as a separate field from `chosenType`.

### Pitfall 6: Multi-threading Deadlock with External Data

**What goes wrong:** `InferenceSession.create()` hangs indefinitely when ONNX multi-threading is enabled and the model has external data files.

**Why it happens:** Known ORT issue (GitHub #26858, December 2025) — hanging with `numThreads > 1` + external data files.

**How to avoid:** The Phase 9 classifier is a single `.onnx` file (no external data). Set `numThreads: 1` explicitly as a safe default — the model is tiny and single-threaded inference is <5ms.

---

## Code Examples

Verified patterns from official sources and Phase 9 validation harness:

### Creating an ORT Session from Uint8Array (in worker)

```typescript
// Source: Phase 9 scripts/train/04_validate_model.mjs (verified working)
// and https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html

import * as ort from 'onnxruntime-web';

// Disable multi-threading (safe for small models; avoids SharedArrayBuffer requirement)
ort.env.wasm.numThreads = 1;

// Create session from Uint8Array buffer
const modelBytes = new Uint8Array(await response.arrayBuffer());
const session = await ort.InferenceSession.create(modelBytes, {
  executionProviders: ['wasm'],
});
```

### Running 5-class Classification Inference

```typescript
// Source: adapted from scripts/train/04_validate_model.mjs

async function runONNXClassifier(
  session: ort.InferenceSession,
  embedding: number[],   // 384-dim float32 from MiniLM
): Promise<Record<string, number>> {
  const inputTensor = new ort.Tensor('float32', Float32Array.from(embedding), [1, 384]);
  const results = await session.run({ [session.inputNames[0]!]: inputTensor });

  // Probability output is at index 1 for skl2onnx CalibratedClassifierCV
  const outputNames = session.outputNames;
  const probaName = outputNames.find(n => n.toLowerCase().includes('prob'))
    ?? (outputNames.length > 1 ? outputNames[1] : outputNames[0]);

  const probData = Array.from(results[probaName!]!.data as Float32Array);

  // classMap: {"0":"decision","1":"event","2":"fact","3":"insight","4":"task"}
  // (loaded from triage-type-classes.json)
  const scores: Record<string, number> = {};
  for (let i = 0; i < probData.length; i++) {
    const label = classMap[String(i)];
    if (label) scores[label] = probData[i] ?? 0;
  }
  return scores;
}
```

### Cache API: Check, Fetch, Store

```typescript
// Source: https://web.dev/cache-api-quick-guide/ (MDN verified)
// Available from worker scope — `caches` is a global in workers

const CACHE_NAME = 'onnx-classifier-v1';

async function fetchWithCache(url: string, onProgress?: (pct: number) => void): Promise<ArrayBuffer> {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(url);

  if (cached) {
    return cached.arrayBuffer();
  }

  const fetchResponse = await fetch(url);
  const contentLength = +(fetchResponse.headers.get('content-length') ?? 0);
  const reader = fetchResponse.body!.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (onProgress) {
      onProgress(contentLength > 0 ? Math.round((received / contentLength) * 100) : -1);
    }
  }

  const total = chunks.reduce((s, c) => s + c.length, 0);
  const buffer = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) { buffer.set(c, pos); pos += c.length; }

  // Cache the response for next session
  await cache.put(url, new Response(buffer, {
    headers: { 'content-type': 'application/octet-stream' }
  }));

  return buffer.buffer;
}
```

### Embedding Worker Message Extension

```typescript
// Extension to src/search/embedding-worker.ts message protocol

// New incoming types (add to WorkerIncoming union):
| { type: 'CLASSIFY_ONNX'; id: string; embedding: number[] }
| { type: 'LOAD_CLASSIFIER' }  // triggers boot-time load

// New outgoing types:
| { type: 'ONNX_RESULT'; id: string; scores: Record<string, number> }
| { type: 'ONNX_ERROR'; id: string; error: string }
| { type: 'CLASSIFIER_READY' }
| { type: 'CLASSIFIER_PROGRESS'; percent: number }
| { type: 'CLASSIFIER_ERROR'; error: string }
```

### Tier 2 Handler: Switch to ONNX path

```typescript
// In tier2-handler.ts, the new CLASSIFY_ONNX path replaces CLASSIFY_TYPE for classify-type:
// (CLASSIFY_TYPE remains for any legacy centroid path that may still be useful for ROUTE_SECTION)

function classifyViaONNX(
  worker: Worker,
  embedding: number[],  // Pre-computed 384-dim embedding from the MiniLM step
): Promise<{ scores: Record<string, number> }> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const handler = (event: MessageEvent) => {
      const msg = event.data as { type: string; id: string; scores?: Record<string, number>; error?: string };
      if (msg.id !== id) return;
      worker.removeEventListener('message', handler);
      if (msg.type === 'ONNX_RESULT') resolve({ scores: msg.scores! });
      else reject(new Error(msg.error ?? 'ONNX inference failed'));
    };
    worker.addEventListener('message', handler);
    worker.postMessage({ type: 'CLASSIFY_ONNX', id, embedding });
  });
}
```

**Note:** The tier2-handler currently sends the full text to the worker for embedding + classification in one step. The new pattern requires the embedding to be computed first (already done by the worker's MiniLM pipeline), then the 384-dim vector is sent back to the ONNX classifier. This can be done as a single `CLASSIFY_ONNX` message that receives the text, embeds it, then classifies — keeping the same external API and avoiding a round-trip per classification.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Centroid cosine similarity (Phase 8) | ONNX MLP with Platt-calibrated probabilities | Phase 10 | Much stronger separation between confusable types (decision/insight); true probabilities enable CONF-02 ambiguity detection |
| CLASSIFY_TYPE worker message | CLASSIFY_ONNX worker message | Phase 10 | New message type preserves backward compat; CLASSIFY_TYPE still works for section routing |
| `classify-type` threshold 0.65 | `classify-type` threshold 0.78 | Phase 10 | Calibrated model produces accurate probabilities; higher threshold correct for Platt-calibrated output |
| `modelSuggestion` field defined but unused | `modelSuggestion` populated from ONNX top-1 | Phase 10 | Enables CONF-03 model-collapse prevention; Phase 11 export uses this field |

**Deprecated/outdated:**
- Centroid-based `CLASSIFY_TYPE` for the `classify-type` task: superseded by `CLASSIFY_ONNX`. The centroid path may remain for `ROUTE_SECTION` until Phase 12 replaces it.

---

## Open Questions

1. **WASM binary path for GitHub Pages production**
   - What we know: Vite config sets `base: '/BinderOS/'` on GitHub Actions. ORT WASM binaries need `wasmPaths` set before session creation.
   - What's unclear: Exact path where Vite copies `ort-wasm-simd-threaded.wasm` in the output `dist/` folder. The existing Vite config has `globIgnores: ['**/ort-wasm-*']` in the workbox config, suggesting the files exist in `dist/` — need to verify actual path.
   - Recommendation: Run `pnpm build` and inspect `dist/` structure. Set `ort.env.wasm.wasmPaths` to match. As a safe fallback, point to the CDN with version pinned: `'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.2/dist/'`. STATE.md flags production COOP/COEP header config as a known concern for the hosting environment.

2. **Embedding vector re-use vs. re-computation**
   - What we know: The current `CLASSIFY_TYPE` flow sends text to the worker, the worker embeds it and compares cosine similarity. For ONNX, we need the 384-dim embedding to feed into the classifier.
   - What's unclear: Whether to (a) add a single `CLASSIFY_ONNX` message that does embed+classify in one worker step (simplest, no change to tier2-handler call signature), or (b) split into EMBED then CLASSIFY_ONNX (reuses embedding across calls but adds complexity).
   - Recommendation: Option (a) — single `CLASSIFY_ONNX` message that embeds then classifies. Same interface as current `CLASSIFY_TYPE`. If embedding results need to be cached for the `embedding` field in ClassificationEvent, the worker can return the vector alongside the scores (already precedented by the existing `CLASSIFY_RESULT` response which includes `vector`).

3. **Placeholder ONNX for worker wiring validation**
   - What we know: `public/models/classifiers/` currently only has `.gitkeep`. Phase 10 can start with a placeholder ONNX (random-weight export from Phase 9 training script) to validate worker wiring.
   - What's unclear: Whether Phase 9 training is complete and `triage-type.onnx` is available, or whether we need to generate a placeholder.
   - Recommendation: The first implementation task should generate a minimal placeholder ONNX (5-class linear model, random weights) and commit it to `public/models/classifiers/`. This unblocks all worker wiring validation independent of Phase 9 training timeline.

---

## Sources

### Primary (HIGH confidence)
- `scripts/train/04_validate_model.mjs` — verified working ORT session creation from Uint8Array, probability output extraction, argmax pattern (Phase 9)
- `src/search/embedding-worker.ts` — existing worker message protocol and error handling patterns
- `src/ai/tier2/tier2-handler.ts` — existing worker bridge pattern with UUID correlation
- `src/storage/classification-log.ts` — `modelSuggestion?: AtomType` field confirmed present
- https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html — `env.wasm.numThreads`, `env.wasm.wasmPaths`, `env.wasm.proxy`
- https://web.dev/cache-api-quick-guide/ — Cache API availability from workers, `caches.open/match/put/keys` methods
- https://javascript.info/fetch-progress — ReadableStream chunk-by-chunk progress with content-length

### Secondary (MEDIUM confidence)
- https://onnxruntime.ai/docs/tutorials/web/large-models.html — ORT recommends Cache API or OPFS for model persistence
- https://onnxruntime.ai/docs/tutorials/web/deploy.html — wasmPaths CDN configuration
- GitHub #26858 (December 2025) — multi-threading + external data hanging; workaround: `numThreads: 1`

### Tertiary (LOW confidence)
- `ort.env.wasm.wasmPaths` exact value for Vite production build — needs build output inspection to confirm

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `onnxruntime-web` already installed and validated; Cache API is W3C standard; Fetch ReadableStream is W3C standard
- Architecture: HIGH — all patterns derived from existing codebase code and Phase 9 validation harness
- Pitfalls: HIGH (WASM paths, content-length, modelSuggestion timing), MEDIUM (ORT multi-thread issue confirmed in GitHub issue)

**Research date:** 2026-03-04
**Valid until:** 2026-06-04 (ORT 1.24.x is stable; Cache API is stable; patterns unlikely to change)
