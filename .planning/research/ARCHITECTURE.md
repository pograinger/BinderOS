# Architecture Research

**Domain:** Fine-tuned ONNX classification integration into BinderOS tiered AI pipeline
**Researched:** 2026-03-03
**Confidence:** HIGH (existing codebase read directly; ONNX/Transformers.js patterns verified via official docs and working examples)

---

## The Core Integration Model

The existing Tier 2 handler uses MiniLM embeddings compared against centroid vectors. Fine-tuned ONNX classifiers replace the centroid comparison step — the embedding step stays the same. This is a surgical replacement inside one component, not an architectural overhaul.

**What stays:**
- Embedding worker (`src/search/embedding-worker.ts`) — MiniLM continues generating 384-dim vectors
- `TierHandler` interface — new Tier 2 still implements `canHandle()` / `handle()`
- `dispatchTiered()` pipeline — escalation logic unchanged
- Confidence thresholds in `types.ts` — may need tuning but structure unchanged
- `ClassificationEvent` schema — already has `embedding`, `tier`, `confidence` fields
- Model delivery pattern — `public/models/` served by Vite, `env.allowRemoteModels = false`

**What changes:**
- Tier 2 handler internals — centroid cosine similarity replaced by ONNX inference session
- New ONNX model files in `public/models/` (the classifier heads, ~2-5 MB each)
- New message types on the embedding worker — `CLASSIFY_ONNX` alongside existing `CLASSIFY_TYPE`
- New Python training pipeline (external to the app build, ships artifacts)

---

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Main Thread (SolidJS)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ InboxView│  │  AIOrb   │  │ Reviews  │  │ Compression Coach│   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘   │
│       └─────────────┴─────────────┴──────────────────┘             │
│                              │                                     │
│                    dispatchTiered(request)                          │
│                     src/ai/tier2/pipeline.ts                       │
│                              │                                     │
│              ┌───────────────┼───────────────┐                     │
│              ▼               ▼               ▼                     │
│          Tier 1          Tier 2          Tier 3                    │
│       deterministic    ONNX ML       LLM/Cloud                    │
│       heuristics     classifiers      Anthropic                   │
│              │               │                                     │
└──────────────│───────────────│─────────────────────────────────────┘
               │               │ postMessage (EMBED + CLASSIFY_ONNX)
               │               ▼
               │  ┌────────────────────────────────────────────────┐
               │  │          Embedding Worker                      │
               │  │  src/search/embedding-worker.ts                │
               │  │                                                │
               │  │  1. embed(text) → 384-dim vector (MiniLM)      │
               │  │  2. run(onnxSession, vector) → logits          │
               │  │     ↑                                          │
               │  │     ONNX InferenceSession (per task type)      │
               │  │     loaded from /models/classifiers/           │
               │  └────────────────────────────────────────────────┘
               │
               │          ┌─────────────────────────────────────────┐
               └─────────►│        Vite public/models/              │
                           │  Xenova/all-MiniLM-L6-v2/ (existing)   │
                           │  classifiers/              (NEW)        │
                           │    triage-type.onnx   (~2-3 MB)         │
                           │    route-section.onnx (~2-3 MB)         │
                           └─────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Status | Responsibility |
|-----------|--------|---------------|
| `embedding-worker.ts` | MODIFIED | Adds ONNX InferenceSession loading + `CLASSIFY_ONNX` message type; MiniLM embed path unchanged |
| `tier2/tier2-handler.ts` | MODIFIED | Replaces centroid cosine similarity with ONNX inference call to worker |
| `tier2/types.ts` | MODIFIED | Add new task types if needed; tune confidence thresholds based on measured model accuracy |
| `tier2/centroid-builder.ts` | UNCHANGED | Centroid build still runs for fallback; can be deprecated after ONNX proves stable |
| `tier2/pipeline.ts` | UNCHANGED | Escalation logic unchanged |
| `tier2/tier1-handler.ts` | UNCHANGED | Deterministic heuristics unchanged |
| `tier2/tier3-handler.ts` | UNCHANGED | LLM escalation unchanged |
| `public/models/classifiers/` | NEW | Trained `.onnx` classifier files shipped with app |
| `scripts/train/` | NEW | Python training pipeline (outside app source, runs on developer machine) |

---

## Recommended Project Structure

```
BinderOS/
├── src/
│   ├── ai/
│   │   └── tier2/
│   │       ├── types.ts              # MODIFIED: threshold tuning, optional new task types
│   │       ├── handler.ts            # UNCHANGED: TierHandler interface
│   │       ├── pipeline.ts           # UNCHANGED: dispatchTiered()
│   │       ├── tier1-handler.ts      # UNCHANGED: keyword heuristics
│   │       ├── tier2-handler.ts      # MODIFIED: ONNX inference replaces centroid path
│   │       ├── tier3-handler.ts      # UNCHANGED: LLM fallback
│   │       ├── centroid-builder.ts   # UNCHANGED (kept as fallback)
│   │       └── index.ts              # MINOR: expose ONNX readiness signal
│   └── search/
│       └── embedding-worker.ts       # MODIFIED: add ONNX session + CLASSIFY_ONNX handler
│
├── public/
│   └── models/
│       ├── Xenova/all-MiniLM-L6-v2/ # EXISTING: embedding model files
│       └── classifiers/              # NEW: trained classifier heads
│           ├── triage-type.onnx      # classify-type task
│           └── route-section.onnx    # route-section task
│
└── scripts/
    ├── download-model.cjs            # EXISTING: downloads MiniLM
    └── train/                        # NEW: Python training pipeline
        ├── generate_data.py          # LLM synthetic data generation
        ├── train_classifier.py       # sklearn/PyTorch training + ONNX export
        ├── validate_model.py         # accuracy validation before shipping
        └── requirements.txt          # Python deps: sentence-transformers, onnx, skl2onnx
```

### Structure Rationale

- **`public/models/classifiers/`:** Follows the exact same pattern as `public/models/Xenova/all-MiniLM-L6-v2/`. Vite serves all `public/` files as static assets without transformation. The worker loads models via absolute URL `/models/classifiers/triage-type.onnx`. No Vite config changes needed.
- **`scripts/train/`:** Python-only, runs offline on developer machines. Not part of the app build or `pnpm install`. Outputs `.onnx` files that are committed to git alongside the app source (small files, ~2-5 MB each — unlike the 22 MB MiniLM model which is gitignored).
- **Classifier files committed to git:** Because they are small (~2-5 MB each) and deterministically produced, committing them eliminates any download step for app users. New users get working ONNX classifiers immediately after `git clone`.

---

## Architectural Patterns

### Pattern 1: Two-Model Pipeline (Embed then Classify)

**What:** Keep MiniLM for embedding (existing, proven), add a lightweight ONNX classification head that takes the 384-dim vector as input and outputs class logits. The classifier head is tiny (~2-5 MB) because it only does linear/MLP classification over pre-computed embeddings — not full transformer inference.

**When to use:** Always — this is the confirmed production pattern for this domain. Validated by the bandarra.me reference architecture and confirmed by the existing MiniLM usage in BinderOS.

**Trade-offs:**
- Pro: Classifier head is tiny; training is fast (~minutes); MiniLM reuse eliminates re-download
- Pro: Same embedding model used in both Python training and browser inference — no distribution shift
- Con: Two inference steps per classification (embed + classify); both run in the worker so no UI impact
- Con: Must pin Python training to the exact same MiniLM model and quantization level

**Example — embedding-worker.ts extension:**
```typescript
import * as ort from 'onnxruntime-web';

const classifierSessions = new Map<string, ort.InferenceSession>();

async function getClassifierSession(task: string): Promise<ort.InferenceSession> {
  if (classifierSessions.has(task)) return classifierSessions.get(task)!;
  const session = await ort.InferenceSession.create(
    `/models/classifiers/${task}.onnx`,
    { executionProviders: ['wasm'] }
  );
  classifierSessions.set(task, session);
  return session;
}

async function classifyWithONNX(
  text: string,
  task: string,
): Promise<{ label: string; confidence: number; probabilities: Record<string, number> }> {
  const [vector] = await embedTexts([text]);
  const session = await getClassifierSession(task);
  const inputTensor = new ort.Tensor('float32', Float32Array.from(vector!), [1, 384]);
  const results = await session.run({ input: inputTensor });
  const logits = Array.from(results['output']!.data as Float32Array);
  return selectTopLabel(logits, task); // softmax + argmax
}
```

### Pattern 2: Worker-Owned ONNX Sessions

**What:** The embedding worker owns and manages all ONNX InferenceSession instances. Sessions are lazy-loaded on first use, then cached for the worker's lifetime. The main thread sends `CLASSIFY_ONNX` messages; the worker runs inference and returns results.

**When to use:** Required — ONNX Runtime Web runs in a worker context. Running it on the main thread blocks UI updates. The existing embedding worker already follows this pattern for MiniLM inference.

**Trade-offs:**
- Pro: Zero main thread blocking; model load amortized across first use (~200ms, one time)
- Pro: Cached sessions mean subsequent requests are fast (~20-50ms)
- Con: Worker message protocol must be extended with two new types
- Con: Worker memory grows by ~5-15 MB per loaded session (acceptable for 2-3 task types)

**Example — new message types:**
```typescript
// New incoming
| { type: 'CLASSIFY_ONNX'; id: string; text: string; task: 'triage-type' | 'route-section' }

// New outgoing
| { type: 'ONNX_CLASSIFY_RESULT'; id: string; label: string; confidence: number; probabilities: Record<string, number> }
| { type: 'ONNX_CLASSIFY_ERROR'; id: string; error: string }
```

### Pattern 3: Centroid Fallback During Bootstrap

**What:** Keep the existing centroid system active. The updated `createTier2Handler()` checks a `getOnnxReady()` flag. If the ONNX session is not yet loaded, it falls back to centroid comparison (which uses the same MiniLM pipeline and already works). Once the session loads, ONNX inference takes over.

**When to use:** During app startup (session loading), if `public/models/classifiers/` files are missing (pre-training state), or for any task type not yet covered by a trained classifier.

**Trade-offs:**
- Pro: Zero regression — existing behavior is preserved as fallback
- Pro: Allows Phase B (browser integration) to proceed before Phase A (training) completes
- Con: Slightly more logic in the Tier 2 handler; `centroid-builder.ts` stays in codebase

**Implementation:** One-line flag check in `canHandle()`:
```typescript
canHandle(task: AITaskType): boolean {
  if (task !== 'classify-type' && task !== 'route-section') return false;
  const worker = getWorker();
  if (!worker) return false;
  // Use ONNX if session is ready, centroid if not
  return getOnnxReady(task) || getCentroidReady(task);
}
```

---

## Python Training Pipeline Architecture

The training pipeline is entirely external to the app build. It runs on developer machines and produces `.onnx` files placed in `public/models/classifiers/`.

```
Python Training Pipeline (scripts/train/)
─────────────────────────────────────────
Step 1: Synthetic Data Generation
  generate_data.py
  - Prompt Anthropic Claude with structured GTD classification examples
  - Target: ~500-2000 labeled examples per class
  - Output: labeled_data.jsonl  { "text": "...", "label": "task|fact|event|decision|insight" }
  - Quality gate: human review of 50-100 examples per class before training

Step 2: Embedding Generation (Python side)
  - Use sentence-transformers/all-MiniLM-L6-v2 (same model as browser)
  - Embed all labeled_data.jsonl texts → 384-dim float32 vectors
  - CRITICAL: Must use identical model as browser to prevent distribution shift

Step 3: Classifier Training
  train_classifier.py
  - Input: (embedding_vectors, labels)
  - Model: sklearn MLPClassifier or LogisticRegression (fast, small, ONNX-exportable)
  - Train/val split: 80/20; target accuracy >= 85% on held-out real examples
  - Export to ONNX via skl2onnx (sklearn) or torch.onnx.export (PyTorch MLP)
  - Output: triage-type.onnx, route-section.onnx

Step 4: Validation
  validate_model.py
  - Load exported ONNX via Python onnxruntime
  - Compare predictions against sklearn model predictions
  - Verify numerical parity within tolerance (must match to >99%)
  - Output: accuracy metrics + confusion matrix per class

Step 5: Deployment
  - Copy .onnx files to public/models/classifiers/
  - Commit to git (small files, committed unlike the large MiniLM model)
  - App picks them up automatically via Vite's public/ serving
```

---

## Data Flow

### Classification Request Flow (New Tier 2)

```
InboxItem arrives in inbox
        │
        ▼
dispatchTiered({ task: 'classify-type', features: { content, title } })
        │
        ▼
Tier 1 (keyword heuristics) → confidence 0.1–0.6
        │
        ├── confidence >= 0.65? → return result (Tier 2 skipped)
        │
        ▼ (escalate to Tier 2)
Tier 2 Handler: canHandle('classify-type')
        │
        ├── ONNX ready? NO → fall back to centroid comparison (existing path)
        │
        └── ONNX ready? YES ───────────────────────────────────────┐
                                                                   ▼
                                          postMessage({ type: 'CLASSIFY_ONNX', text, task: 'triage-type' })
                                                                   │
                                                  Embedding Worker:
                                                  1. embedTexts([text]) → vector[384]
                                                  2. session.run({ input: tensor })
                                                  3. softmax(logits) → probabilities
                                                  4. postMessage({ type: 'ONNX_CLASSIFY_RESULT', label, confidence })
                                                                   │
        ◄──────────────────────────────────────────────────────────┘
        │
        ├── confidence >= 0.65? → return result (Tier 3 skipped)
        │
        └── confidence < 0.65? → escalate to Tier 3 (LLM)
```

### Training Data Flow

```
User classifies inbox item in browser
        │
        ▼
logClassification({ content, chosenType, embedding, tier, confidence })
        │                          ↑
        │               embedding cached by tier2-handler.lastVector()
        ▼
Dexie config table: 'classification-events'
        │
        │ (offline, developer machine — separate process)
        ▼
scripts/train/generate_data.py → LLM API → synthetic labeled examples
        │
        ▼
scripts/train/train_classifier.py → embed (Python MiniLM) + train + ONNX export
        │
        ▼
public/models/classifiers/triage-type.onnx
        │
        ▼
git commit → app deployment → users get updated classifiers
```

### Model Readiness State Flow

```
App Init
  │
  ├── initTieredPipeline() → Tier 1 + Tier 3 registered immediately
  │
  └── Embedding Worker loads MiniLM: MODEL_LOADING → MODEL_READY
                                                          │
                                              Check /models/classifiers/ files
                                                          │
                                 Files present ──────────►│◄──── Files absent
                                       │                  │            │
                                       ▼                  │            ▼
                              ONNX sessions lazy-load     │   Centroid mode only
                              on first CLASSIFY_ONNX      │   (pre-training state)
                              request                     │
                                       │                  │
                                       └─────────────────►│
                                                          │
                               registerTier2Handler(ONNX + centroid fallback)
```

---

## New vs Modified Components

### New Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `scripts/train/generate_data.py` | `scripts/train/` | LLM-powered synthetic GTD data generation |
| `scripts/train/train_classifier.py` | `scripts/train/` | sklearn/PyTorch training + ONNX export |
| `scripts/train/validate_model.py` | `scripts/train/` | Prediction parity validation before shipping |
| `scripts/train/requirements.txt` | `scripts/train/` | Python deps: sentence-transformers, skl2onnx, onnx, onnxruntime |
| `public/models/classifiers/triage-type.onnx` | `public/models/classifiers/` | Trained type classifier (5-class: task/fact/event/decision/insight) |
| `public/models/classifiers/route-section.onnx` | `public/models/classifiers/` | Trained section router |

### Modified Components

| Component | What Changes | What Stays the Same |
|-----------|-------------|---------------------|
| `src/search/embedding-worker.ts` | Add `CLASSIFY_ONNX` message handler; add ONNX InferenceSession management; import `onnxruntime-web` | MiniLM pipeline unchanged; all existing message types unchanged |
| `src/ai/tier2/tier2-handler.ts` | Replace centroid cosine comparison with ONNX inference call; add `getOnnxReady()` flag for fallback | `TierHandler` interface unchanged; `lastVector()` still exported; handle() structure unchanged |
| `src/ai/tier2/types.ts` | Tune confidence thresholds after measuring ONNX model accuracy | All existing task types unchanged; `TieredRequest` / `TieredResponse` shapes unchanged |
| `src/ai/tier2/index.ts` | Expose ONNX readiness signal; expose `registerTier2OnnxHandler()` for when worker reports sessions loaded | `initTieredPipeline()` signature unchanged |

### Unchanged Components

All of the following are completely unmodified:

- `src/ai/tier2/pipeline.ts` — escalation logic
- `src/ai/tier2/handler.ts` — TierHandler interface
- `src/ai/tier2/tier1-handler.ts` — keyword heuristics
- `src/ai/tier2/tier3-handler.ts` — LLM escalation
- `src/ai/tier2/centroid-builder.ts` — kept as fallback
- `src/storage/classification-log.ts` — ClassificationEvent schema already has all needed fields
- `src/ai/router.ts` — dispatchAI unchanged
- `src/ai/triage.ts` — calls dispatchTiered unchanged
- `src/ai/compression.ts` — compression pipeline unchanged
- All SolidJS store signals — no store changes needed for inference path

---

## Suggested Build Order

Dependencies flow: Python training must complete before ONNX models exist; ONNX models must exist before ONNX mode activates; but the app runs correctly without ONNX models by falling back to centroids / Tier 3.

```
Phase A: Python Training Infrastructure
  1. scripts/train/requirements.txt + Python environment setup
  2. scripts/train/generate_data.py — synthetic data from LLM
  3. Human review of generated data quality (gate before training)
  4. scripts/train/train_classifier.py — embed + train + ONNX export
  5. scripts/train/validate_model.py — accuracy gate (>= 85% on real examples)
  → Output: triage-type.onnx, route-section.onnx

Phase B: Browser Inference Integration (can start before Phase A completes)
  6. Extend embedding-worker.ts: ONNX InferenceSession management + CLASSIFY_ONNX handler
     (can be tested with a placeholder ONNX from any sklearn export before real model)
  7. Update tier2-handler.ts: ONNX inference path + centroid fallback flag
  8. Update tier2/index.ts: expose ONNX readiness

Phase C: Ship Trained Models
  9. Place trained .onnx files in public/models/classifiers/
  10. Test end-to-end: inbox item → Tier 2 ONNX → result without escalation to Tier 3
  11. Tune CONFIDENCE_THRESHOLDS in types.ts based on measured model accuracy

Phase D: Expand Coverage (subsequent iterations)
  12. Train additional classifiers: assess-priority, assess-staleness-ml
  13. Add task types to AITaskType; update canHandle() in tier2-handler
  14. Retrain with curated real-user examples from classification log exports
```

**Rationale for this order:** Phase A can proceed entirely offline in Python without touching TypeScript. Phase B can use a toy ONNX file (a single sklearn LogisticRegression with random weights) to prove the worker integration is wired correctly. This prevents Phase A completion from blocking Phase B development. Phase C is the integration step where both converge.

---

## Integration Points

### Existing Boundaries (Unchanged)

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Main thread ↔ Embedding Worker | `postMessage` / `onmessage` | New `CLASSIFY_ONNX` message type added; all existing types preserved |
| `dispatchTiered()` ↔ Tier 2 handler | `TierHandler.handle()` interface | Unchanged — Tier 2 handler internals change but interface is the same |
| Tier 2 handler ↔ `classifyViaWorker()` | Internal promise-based wrapper | Analogous wrapper added for ONNX path |
| `triage.ts` ↔ `dispatchTiered()` | Direct import | Zero changes in triage.ts |
| `store.ts` ↔ AI pipeline | All state passed as arguments | Pure module constraint maintained; no store imports added |

### New External Integration

| Integration | Pattern | Notes |
|-------------|---------|-------|
| Python training ↔ App build | Filesystem artifact | `.onnx` files written to `public/models/classifiers/`; Vite serves them transparently |
| ONNX Runtime Web ↔ Worker | `onnxruntime-web` npm package | Already a transitive dependency via Transformers.js; may need explicit import in worker |
| `skl2onnx` / `torch.onnx.export` ↔ ONNX RT Web | ONNX opset | Must export with opset <= 17-18 for ONNX Runtime Web WASM backend; verify with browser smoke test |

---

## Anti-Patterns

### Anti-Pattern 1: Training with Different Embedding Model Version

**What people do:** Train the Python classifier using `sentence-transformers` version N, but the browser uses a pinned ONNX file of a different version or quantization level.

**Why it's wrong:** Embedding distribution shift — the classifier learns on one vector space, but inference receives vectors from a slightly different space. Confidence will be artificially low and accuracy degrades silently.

**Do this instead:** Pin the Python training script to `Xenova/all-MiniLM-L6-v2` with `dtype: q8` — the exact same model and quantization as the browser embedding worker. Verify parity by computing a known test vector in both environments and comparing the output.

### Anti-Pattern 2: Loading ONNX Sessions on Main Thread

**What people do:** Import `onnxruntime-web` directly in a SolidJS component or store signal to keep it simple.

**Why it's wrong:** ONNX Runtime Web WASM initialization blocks the main thread for 100-500ms. In a SolidJS app with fine-grained reactivity, this freezes all reactive updates during that window.

**Do this instead:** All ONNX inference stays in the embedding worker. The existing `classifyViaWorker()` pattern is the correct template — extend it with a `CLASSIFY_ONNX` message type.

### Anti-Pattern 3: Creating a New ONNX Session Per Classification Request

**What people do:** Call `ort.InferenceSession.create()` inside the `CLASSIFY_ONNX` message handler each time.

**Why it's wrong:** Session creation involves WASM module initialization (~200ms) and model parsing. Creating it per-request makes Tier 2 slower than Tier 3 in many cases.

**Do this instead:** Maintain a `Map<task, InferenceSession>` singleton inside the worker. Sessions are created once on first use and cached for the worker's lifetime. This matches the existing `featurePipeline` singleton pattern already in `embedding-worker.ts`.

### Anti-Pattern 4: Skipping ONNX Export Validation

**What people do:** Export from sklearn/PyTorch, copy to `public/models/`, and assume it works in the browser.

**Why it's wrong:** ONNX Runtime Web's WASM backend supports a subset of ONNX operators. Operators used by sklearn's `MLPClassifier` may include unsupported ops. Silent wrong outputs or runtime errors are possible.

**Do this instead:** Run `validate_model.py` which loads the ONNX file via Python `onnxruntime` and compares outputs against the original sklearn model predictions. Also do a browser-side smoke test: load the session in the worker, run a known test vector, and compare output to Python.

### Anti-Pattern 5: Treating Synthetic Accuracy as Real-World Accuracy

**What people do:** Generate 2000 synthetic examples from Claude, train, report 92% validation accuracy against the same synthetic distribution, ship.

**Why it's wrong:** Synthetic data accuracy does not reflect real-world performance. The model may overfit to LLM-generated phrasing and fail on actual user inbox items, which are messier and more ambiguous.

**Do this instead:** After synthetic data generation, export 100-200 real classification events from the app's `ClassificationEvent` history and use them as a held-out test set. The model must achieve acceptable accuracy on real examples, not just synthetic ones.

---

## Scaling Considerations

This is a local-first PWA. "Scaling" means performance as the user's data grows, not server load.

| Concern | At Launch | At 6 Months | At 2 Years |
|---------|-----------|-------------|------------|
| ONNX session load time | ~200ms first load, cached | Same — cached in worker | Same |
| Classification latency | ~20-50ms (embed + ONNX) | Same | Same |
| Model file size | ~2-5 MB per classifier | Same (static files) | Grows only if model retrained |
| Classification log size | Small (<100 events) | Medium (~1k events) | Large (10k+); consider pruning |
| Centroid rebuild cost | Negligible | Negligible | Consider sliding window |

**First bottleneck:** Classification log grows unbounded. After 10k events, `getClassificationHistory()` loaded into memory becomes noticeable. Add a sliding window (keep last 500-1000 events) in `classification-log.ts` before this becomes a problem.

**Second bottleneck:** Multiple ONNX sessions simultaneously. With 5+ task types each with their own session, total worker memory could reach 50+ MB. Lazy-load sessions and consider evicting least-recently-used sessions if additional task types are added.

---

## Sources

- [From PyTorch to Browser: full client-side ONNX + Transformers.js](https://bandarra.me/posts/from-pytorch-to-browser-a-full-client-side-solution-with-onnx-and-transformers-js) — PRIMARY: exact two-model architecture used here (MiniLM embed then custom ONNX classification head)
- [ONNX Runtime Web official docs](https://onnxruntime.ai/docs/tutorials/web/) — MEDIUM confidence: InferenceSession API, execution providers, WASM backend
- [Hugging Face Optimum ONNX export docs](https://huggingface.co/docs/optimum/en/exporters/onnx/usage_guides/export_a_model) — HIGH confidence: exporting fine-tuned transformers to ONNX
- [skl2onnx documentation](https://onnx.ai/sklearn-onnx/) — HIGH confidence: sklearn model ONNX export, opset compatibility
- [Vite Static Asset Handling](https://vite.dev/guide/assets) — HIGH confidence: `public/` folder pattern, worker bundling with `?worker` suffix
- [Transformers.js GitHub](https://github.com/huggingface/transformers.js) — HIGH confidence: existing usage validated in BinderOS embedding-worker.ts

---

*Architecture research for: Fine-tuned ONNX classifier integration into BinderOS 3-Ring Binder tiered pipeline*
*Researched: 2026-03-03*
