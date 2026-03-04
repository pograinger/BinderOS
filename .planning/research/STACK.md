# Stack Research

**Domain:** Local-first, browser-only personal information management system with WASM compute and AI integration
**Researched:** 2026-02-22 (v1.0 initial) / 2026-02-22 (v2.0 AI milestone update) / 2026-03-03 (v3.0 fine-tuned ONNX milestone)
**Confidence:** MEDIUM-HIGH (core stack HIGH; AI layer MEDIUM; IronCalc LOW — early-stage project)

---

## Existing Stack (v1.0 — Do Not Re-research)

SolidJS 1.9 + TypeScript 5.9 + Vite 7.3 + Rust/WASM (wasm-bindgen 0.2.109) + Dexie.js 4.0 + MiniSearch + ONNX embeddings (@huggingface/transformers) + PWA service worker.

This section is confirmed and validated through v1.0. See v1.0 entry below for full details.

---

## v2.0 AI Milestone — New Stack Additions

This section covers only the NEW dependencies required for AI orchestration features. The question: what's the minimum, highest-confidence stack to add for browser LLM inference, cloud API integration, conversational AI UX, and the floating orb?

---

## Decision 1: Browser LLM Runtime

**Recommendation: `@huggingface/transformers` v3.8.1 (stable) — already in the project**

### Runtime comparison

| Runtime | Mechanism | WebGPU required | Bundle | Best for |
|---------|-----------|----------------|--------|---------|
| **@huggingface/transformers** | ONNX Runtime Web | Optional (falls back to WASM) | ~2MB (gzipped) | Classification, embeddings, small generative tasks |
| @mlc-ai/web-llm | MLC-compiled WebGPU kernels | YES (hard requirement) | ~5MB JS + model weights | Chat-first LLM UX with large models |
| @wllama/wllama | llama.cpp→WASM (CPU only) | No | ~2MB | GGUF models on CPU-only; Safari/no-GPU environments |
| MediaPipe (Google) | TFLite → WASM | No | Varies per task | Vision, audio, specific NLP tasks — NOT general text generation |

**Why Transformers.js wins for BinderOS v2.0:**

1. **Already in the project.** v1.0 uses `@huggingface/transformers` for ONNX semantic embeddings in the search pipeline. Adding classification and small text-gen tasks requires zero new runtime dependencies — same pipeline, different models.

2. **No WebGPU hard dependency.** WebGPU is unavailable in Firefox (behind flag), has bugs in some GPU drivers, and is absent from Safari on iOS. WebLLM's hard WebGPU requirement would break for a meaningful fraction of users. Transformers.js falls back to WASM automatically.

3. **SmolLM2-135M-Instruct fits the classification use case.** The fast-path task for BinderOS is classifying inbox items (atom type, section, priority tags) — not long-form conversation. A 135M model running ONNX-quantized on CPU is fast enough (~100–300ms on modern hardware) and requires only ~100MB download.

4. **Pipeline API matches the use case.** `pipeline('text-generation', model)` is the same API used for embeddings in v1.0. The AI provider abstraction can route to the same infrastructure.

**When to use WebLLM instead:** If the conversation UX requires a model larger than 1.7B parameters for acceptable quality, and the user has WebGPU hardware, WebLLM is the right escalation. Recommend keeping WebLLM as an optional "high-quality browser inference" provider behind an explicit settings flag — not the default.

**Why NOT wllama:** CPU-only WASM inference via llama.cpp is 5–10x slower than ONNX on the same CPU for the same task. wllama's strength is broad compatibility (including Safari CPU-only) but BinderOS users are expected to have decent hardware. Start with ONNX (Transformers.js), consider wllama only if Safari compatibility becomes a hard requirement.

**Why NOT MediaPipe:** Designed for vision, audio, and specific NLP pipelines (sentiment, NER). Doesn't support generative text tasks needed for triage suggestions. Wrong tool.

---

## Decision 2: Small Browser Models

**Recommendation: SmolLM2-135M-Instruct (fast classification) + SmolLM2-360M-Instruct (higher quality)**

| Model | Params | Download size (int8 ONNX) | Speed (CPU) | Best for |
|-------|--------|--------------------------|-------------|---------|
| **SmolLM2-135M-Instruct** | 135M | ~150MB | Fast (~100ms/token) | Quick triage classification, atom type suggestion |
| **SmolLM2-360M-Instruct** | 360M | ~250–300MB (q4 GGUF) / ~300MB (int8 ONNX) | Medium (~300ms/token) | Better instruction following, multi-step classification |
| SmolLM2-1.7B-Instruct | 1.7B | ~925MB | Slow on CPU | Better conversation; only viable with WebGPU |
| Phi-3-mini-4k | 3.8B | Large (~2GB+) | Too slow for CPU | Browser use requires WebGPU; use only for WebLLM route |
| TinyLlama-1.1B | 1.1B | ~600MB | Slow on CPU | Worse instruction-following than SmolLM2 at same size |
| Gemma-2B | 2B | ~1.5GB+ | Very slow on CPU | Overkill for browser; WebGPU only viable |

**Why SmolLM2:**

- Official Hugging Face ONNX + Transformers.js support — pre-converted models available in the HuggingFaceTB organization with no manual conversion.
- Available in browser-ready Transformers.js format: `HuggingFaceTB/SmolLM2-135M-Instruct` and `HuggingFaceTB/SmolLM2-360M-Instruct`.
- 360M was demonstrated running in-browser via WebGPU with structured generation (Simon Willison, Nov 2024) — ecosystem validation.
- SmolLM2 outperforms TinyLlama at both 135M and 360M sizes on instruction-following benchmarks.
- Trained specifically for on-device/edge inference. Designed for this exact use case.

**Model selection strategy for BinderOS:**

```
Fast path (classification/tagging): SmolLM2-135M-Instruct via Transformers.js ONNX
Better path (multi-step triage): SmolLM2-360M-Instruct via Transformers.js ONNX (user opt-in)
Fallback (no browser LLM): NullProvider → user is shown cloud API option
Cloud escalation (conversation/review): OpenAI GPT-4o-mini or Anthropic Claude Haiku via fetch
```

**Why NOT Phi-3-mini for the default path:** At 3.8B parameters, Phi-3-mini is too large for CPU ONNX inference in-browser. It requires WebGPU to be usable. It's a good choice if the user opts into WebLLM (high-quality browser route), but it cannot be the default. SmolLM2-135M is 28x smaller and runs on CPU.

**Why NOT TinyLlama:** SmolLM2 at the same size (1B range) consistently outperforms TinyLlama. No reason to use TinyLlama in 2026.

---

## Decision 3: Cloud API Client

**Recommendation: Raw `fetch` + `fetch-event-stream` (741 bytes)**

Do NOT add the OpenAI or Anthropic SDKs as browser dependencies.

| Option | Bundle added | Supports streaming | Browser-safe | Verdict |
|--------|-------------|-------------------|--------------|---------|
| **Raw fetch + fetch-event-stream** | 741 bytes | YES (SSE async iterator) | YES | Use this |
| openai SDK | ~17KB gzip | YES (built-in) | Partial (designed for Node) | Avoid |
| @anthropic-ai/sdk | ~15KB gzip | YES | Partial | Avoid |
| Vercel AI SDK (@ai-sdk/core) | ~30–50KB+ | YES (multi-provider) | YES but overkill | Avoid |
| EventSource (native) | 0 bytes | NO | YES | Cannot use — only GET, no custom headers |

**Why raw fetch wins:**

The OpenAI and Anthropic APIs are both simple HTTP POST endpoints returning SSE streams. There's no reason to add an SDK that was designed for server-side Node.js use. The entire pattern is:

```typescript
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model, messages, stream: true }),
  signal: abortController.signal,
});

import { events } from 'fetch-event-stream';
for await (const event of events(response)) {
  if (event.data === '[DONE]') break;
  const chunk = JSON.parse(event.data);
  onChunk(chunk.choices[0].delta.content ?? '');
}
```

`fetch-event-stream` by Luke Edwards (v0.1.6, Oct 2025) is 741 bytes, zero dependencies, works in browsers, workers, and service workers. It converts the SSE response body into an async iterator — the exact pattern needed for conversational streaming.

**Why NOT the official SDKs:** The OpenAI SDK at ~17KB gzip and Anthropic SDK at ~15KB add weight to a bundle that is already carrying WASM, ONNX, and IndexedDB abstractions. They pull in Node.js-ism polyfills. They provide no benefit over raw fetch for the simple completions + streaming use case BinderOS needs.

**Why NOT Vercel AI SDK:** Vercel AI SDK is designed for server-side streaming with a Next.js/SvelteKit backend. BinderOS is browser-only with no server. The UI streaming helpers (`useChat`) are React/Next-specific. The full SDK adds 30–50KB for features that cannot be used.

---

## Decision 4: Streaming Pattern for Conversational AI UX

**Recommendation: SolidJS signal accumulation + fetch-event-stream async iterator**

```typescript
// In AIProviderService (browser-side, main thread or dedicated worker)
export async function streamCompletion(
  messages: ChatMessage[],
  onChunk: (text: string) => void,
  onDone: () => void,
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: buildHeaders(apiKey),
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  });

  if (!response.ok) throw new ApiError(response.status, await response.text());

  for await (const event of events(response, signal)) {
    if (!event.data || event.data === '[DONE]') continue;
    const delta = parseChunk(event.data); // provider-specific
    if (delta) onChunk(delta);
  }
  onDone();
}
```

**SolidJS side:**

```typescript
const [streamedText, setStreamedText] = createSignal('');
const [isStreaming, setIsStreaming] = createSignal(false);

async function handleUserMessage(input: string) {
  setIsStreaming(true);
  setStreamedText('');
  await aiProvider.streamCompletion(
    buildMessages(input),
    (chunk) => setStreamedText(prev => prev + chunk),
    () => setIsStreaming(false),
    abortController.signal,
  );
}
```

SolidJS signals are ideal here: each chunk triggers a targeted update to the streaming text display only, with zero reconciliation overhead. No additional library needed.

**AbortController for cancellation:** When the user closes the floating orb or navigates away, call `abortController.abort()`. The `fetch` and `fetch-event-stream` iterator both respect the signal.

---

## Decision 5: Floating Orb UI

**Recommendation: Pure CSS + SolidJS signals — no animation library needed**

The floating orb is a `position: fixed; z-index: 9999` circle with:
- Idle state: subtle pulsing animation (CSS `@keyframes`)
- Active/thinking state: rotating gradient or spinner (CSS only)
- Expanded state: slide-up panel with GTD menu (CSS `transform` + SolidJS `<Show>`)

**Why no animation library:**

- The orb is a single element with 3 states. CSS keyframes handle idle pulse, transform handles expand/collapse. This is 20 lines of CSS.
- `solid-motionone` (v1.0.4, last updated 10 months ago) adds 5.8KB for what CSS already does. Not worth it.
- `@motionone/solid` (v10.16.4, 2 years stale) — skip.
- Motion One JS is for complex orchestrated animations with JS control. The orb doesn't need that.

**If animation library becomes needed later:** The `motion` package (formerly Motion One, now part of Framer) supports SolidJS. Add it only if the UX requires physics-based spring animations or gesture-driven interactions that CSS cannot handle.

---

## Decision 6: WASM Worker Conflict Analysis

**Finding: No conflict. Run WebLLM inference in its own dedicated Web Worker, separate from the existing Rust/WASM compute worker.**

The existing architecture:
```
Main Thread → Rust/WASM Worker (compute engine) → ONNX Embeddings Worker (existing Transformers.js)
```

v2.0 addition:
```
Main Thread → Rust/WASM Worker (compute engine) [unchanged]
           → ONNX AI Worker (Transformers.js classification — reuse existing worker or new)
           → WebLLM Worker (optional, if user enables high-quality browser LLM)
```

**Key conflict points and resolutions:**

| Concern | Reality | Resolution |
|---------|---------|-----------|
| ONNX Runtime Web + Transformers.js WASM conflict | No conflict — ONNX Runtime Web runs in its own WebWorker, isolated from Rust/WASM | Use existing Transformers.js worker, add classification tasks alongside embeddings |
| WebLLM WebGPU worker + ONNX worker | No conflict — WebLLM creates its own worker; WebGPU and ONNX WASM use separate GPU/CPU paths | Keep WebLLM in its own ServiceWorker or WebWorker via `MLCEngine` |
| IndexedDB contention (model caching) | WebLLM caches to CacheAPI (not IndexedDB). Transformers.js caches to browser Cache. Neither conflicts with Dexie/atom data | No action needed |
| GPU memory pressure | WebLLM + ONNX WebGPU running simultaneously could starve GPU memory | Use ONNX CPU backend for classification (default), WebGPU only for WebLLM if user enables it |
| Main thread blocking | Both ONNX and WebLLM computations must be off-thread | Enforce: all inference in workers, only signal updates cross thread boundary |

**Practical rule:** The Transformers.js classification tasks go into the existing ONNX worker (or a new `ai-worker.ts` alongside it). WebLLM, if enabled, runs in a separate `ServiceWorkerMLCEngine` so model lifecycle survives page navigation.

---

## New Dependencies to Add

```bash
# New AI dependencies (v2.0)
pnpm add fetch-event-stream          # 741 bytes — SSE streaming for cloud API

# Models loaded at runtime (not npm deps, fetched from HuggingFace CDN or OPFS cache)
# SmolLM2-135M-Instruct: loaded via @huggingface/transformers pipeline() — already installed
# SmolLM2-360M-Instruct: same

# Optional: high-quality in-browser LLM (user opt-in, behind settings flag)
pnpm add @mlc-ai/web-llm            # 0.2.81 — WebGPU-accelerated; NOT loaded by default
```

**What NOT to add:**

```bash
# DO NOT add these:
pnpm add openai                     # ~17KB — server SDK, not browser-first
pnpm add @anthropic-ai/sdk          # ~15KB — server SDK, polyfill bloat
pnpm add ai                         # Vercel AI SDK — server-centric, 30-50KB, React-focused
pnpm add solid-motionone            # Animation overkill for a CSS-solvable orb UI
pnpm add @wllama/wllama             # Redundant — Transformers.js ONNX is already better on same hardware
```

---

## AI Provider Interface (Architecture Note)

Define this TypeScript interface to keep the AI layer pluggable regardless of provider:

```typescript
export type AIProvider =
  | 'browser-smollm2-135m'    // Transformers.js ONNX, fast, CPU
  | 'browser-smollm2-360m'    // Transformers.js ONNX, better quality, CPU
  | 'browser-webllm'          // WebLLM WebGPU (user opt-in)
  | 'cloud-openai'            // fetch + fetch-event-stream
  | 'cloud-anthropic'         // fetch + fetch-event-stream
  | 'disabled';               // NullProvider — no AI features

export interface AIService {
  classify(text: string, options: ClassifyOptions): Promise<ClassifyResult>;
  streamChat(messages: ChatMessage[], onChunk: (t: string) => void, signal: AbortSignal): Promise<void>;
  isAvailable(): boolean;
}
```

The Rust/WASM compute worker and the AI provider are independent. The compute worker handles deterministic scoring (staleness, entropy, priority). The AI provider handles natural language (classification, conversation). They communicate via the TS layer, never directly.

---

## v3.0 Fine-Tuned ONNX Milestone — New Stack Additions

This section covers ONLY the new tooling for the v3.0 milestone: fine-tuning small transformer classifiers, exporting them to ONNX, generating synthetic training data, and running the resulting classifiers in-browser. The existing stack (SolidJS, Vite, Dexie, ONNX Runtime Web via Transformers.js, Embedding Worker) is unchanged.

The question v3.0 answers: what Python tooling and which JS integration points are needed to go from raw classification log data to a browser-deployed fine-tuned GTD classifier?

---

## Decision 7: Browser-Side Classifier Architecture

**Recommendation: Embedding (MiniLM, already running) + Lightweight Classifier Head (custom ONNX)**

The existing Tier 2 handler already embeds text via all-MiniLM-L6-v2 and does cosine similarity against centroids. The upgrade is to replace the centroid math with a real trained classifier. The architecture stays the same; only the classification ONNX artifact changes.

**Pattern (confirmed by bandarra.me full client-side walkthrough, MEDIUM confidence):**

```
User text
  → embedding-worker (Transformers.js, MiniLM, q8, already running)
  → 384-dim float vector
  → classifier-worker (new ort.InferenceSession on custom .onnx)
  → logits → softmax → label + confidence
```

The classifier is a **separate ONNX file from the embedding model**. This keeps the classifier tiny (<1MB) because it does not contain its own embedding weights — it accepts the 384-dim vector directly. The embedding model (22–25MB quantized) is already loaded and cached in the existing embedding worker.

**Why NOT fine-tune a full sequence classifier (DistilBERT/TinyBERT):**

A full fine-tuned DistilBERT (66M params, 60–80MB quantized) would replace the embedding worker with a task-specific model. This has two problems: (1) a separate 60–80MB download per GTD task type, and (2) you can no longer share the embeddings for both search and classification. The embedding-head separation achieves comparable accuracy with a fraction of the size and reuses an already-loaded model.

**Why NOT sklearn logistic regression on the embedding output:**

Logistic regression on 384-dim embeddings is a valid approach (proven by Bank of England 2025 research to work well with small labeled sets) and the skl2onnx export path is mature. However, a 2-layer neural network classifier head in PyTorch exported to ONNX gives better nonlinear separation on GTD tasks without losing the size advantage. Use logistic regression only as a baseline in the training script to validate that the neural head is adding value.

**Classifier head architecture for GTD tasks:**

```python
# Input: 384-dim embedding vector from all-MiniLM-L6-v2
# Output: N-class logits (N=5 for atom types, N=6 for sections, etc.)

class GTDClassifierHead(nn.Module):
    def __init__(self, input_dim=384, hidden_dim=128, num_classes=5):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(hidden_dim, num_classes)
        )

    def forward(self, x):
        return self.net(x)
```

This model exports to ONNX at approximately 200–400KB (float32) or 100–200KB (int8 quantized). Multiple classifiers (atom type, priority, staleness, section routing) remain well under 2MB combined. Trivial download delta over v2.0.

---

## Decision 8: Python Training Stack

**Recommendation: Python 3.11+ + PyTorch + transformers (stable v4.x) + optimum[onnx] 2.1.0**

This is the developer-machine-only Python stack. It never touches the browser. It produces `.onnx` files that are committed to `public/models/` and served as static assets.

| Tool | Version | Purpose | Why |
|------|---------|---------|-----|
| **Python** | 3.11+ | Runtime | 3.11 is the stable sweet spot — 3.12/3.13 have minor ecosystem gaps with some ML libraries |
| **PyTorch** | 2.4+ (with CPU or CUDA) | Neural network training | De-facto standard for defining and training classifier heads. GPU training optional — 5-class classifier on 384-dim input trains in seconds on CPU. |
| **transformers** | 4.57.3 (stable) | Load pre-trained MiniLM tokenizer + model for embedding generation during training | Use stable v4.x, not v5 pre-release. The `AutoModel` and `Trainer` APIs are stable here. |
| **sentence-transformers** | 3.x | Generate training embeddings using all-MiniLM-L6-v2 | Wraps Transformers.js-compatible models; ensures training embeddings match browser inference embeddings exactly. Critical for correctness. |
| **optimum[onnx]** | 2.1.0 | ONNX export of the classifier head + quantization | `ORTQuantizer` and `optimum-cli` handle both export and int8 quantization in one step. ONNX integration recently moved to `optimum-onnx` package — install as `optimum[onnx]`. |
| **onnx** | 1.21.0 | ONNX graph manipulation, validation | Required by optimum and skl2onnx. Install explicitly to pin version. |
| **onnxruntime** | 1.24.x | CPU inference validation in Python before browser deployment | Run the exported model against test data to validate correctness before shipping to browser. |
| **scikit-learn** | 1.8.x | Baseline logistic regression classifier + train/test split utilities | Baseline validation only; compare LR accuracy vs neural head. Not deployed to browser. |
| **skl2onnx** | 1.20.0 | If using logistic regression baseline: export sklearn pipeline to ONNX | Supports 133/194 sklearn models including LogisticRegression. Not needed if going pure PyTorch. |
| **numpy** | 2.4.x | Array manipulation throughout the pipeline | Pinned to 2.4 per skl2onnx compatibility matrix. |

**Why transformers stable v4, not v5 pre-release:**

transformers v5 was released as a pre-release candidate (RC) in early 2026. It is a major API refactor removing long-due deprecations. The v4.57.3 stable is installed 3M times/day and is what the entire HuggingFace ecosystem is calibrated against. Use v5 when it reaches stable GA release, not before.

**Why sentence-transformers for embedding generation:**

The key invariant for the training pipeline is that the embeddings generated during training MUST be byte-for-byte identical to the embeddings generated by the browser's embedding worker at inference time. Both use `Xenova/all-MiniLM-L6-v2` with `pooling='mean', normalize=True`. The `sentence-transformers` library wraps this correctly with `SentenceTransformer('all-MiniLM-L6-v2')`. Do not use raw Transformers for embedding generation — the pooling implementation differs.

**ONNX export command for the classifier head:**

```python
import torch
import torch.onnx

model = GTDClassifierHead(input_dim=384, hidden_dim=128, num_classes=5)
model.load_state_dict(torch.load('gtd_type_classifier.pt'))
model.eval()

dummy_input = torch.randn(1, 384)
torch.onnx.export(
    model,
    dummy_input,
    'gtd_type_classifier.onnx',
    input_names=['embedding'],
    output_names=['logits'],
    dynamic_axes={'embedding': {0: 'batch_size'}, 'logits': {0: 'batch_size'}},
    opset_version=17,
)
```

**Quantization with optimum (optional, reduces size ~50%):**

```python
from optimum.onnxruntime import ORTQuantizer
from optimum.onnxruntime.configuration import AutoQuantizationConfig

quantizer = ORTQuantizer.from_pretrained('.', file_name='gtd_type_classifier.onnx')
qconfig = AutoQuantizationConfig.arm64(is_static=False, per_channel=False)
quantizer.quantize(save_dir='.', quantization_config=qconfig)
```

For the classifier head at ~300KB float32, quantization is optional (the size saving is marginal). For larger models (if a fine-tuned full DistilBERT variant is explored), quantization becomes essential.

---

## Decision 9: Synthetic Training Data Pipeline

**Recommendation: Anthropic Claude API (already integrated) + custom Python generation script**

The existing Anthropic integration in BinderOS's `CloudProvider` generates high-quality completions. The same Anthropic API key can drive a local Python script that generates labeled GTD training examples without any new LLM account setup.

**Why not distilabel:**

distilabel (argilla-io, v1.5.3, Jan 2025) is a mature pipeline framework for synthetic data generation. It supports Anthropic via LiteLLM integration. However, for this use case — generating labeled `{text, label}` pairs for 5 GTD task types with controlled diversity — a custom script of ~150 lines is simpler, more auditable, and requires no additional Python dependency. distilabel adds value at scale (thousands of examples with complex quality pipelines); BinderOS needs 200–500 labeled examples to bootstrap, not 50,000.

Use distilabel if and when the training set needs to exceed 2,000 examples with automated quality filtering. For the initial synthetic bootstrap, a custom script is the right call.

**Data generation strategy:**

```
1. Define 5 GTD task types (atom types: task, fact, event, decision, insight)
2. For each type, define 10 seed examples covering GTD use cases
3. Prompt Anthropic claude-3-5-haiku-20241022 (fast + cheap) to generate N variations
4. Save as JSON: [{ "text": "...", "label": "task" }, ...]
5. Manual review pass: remove mislabeled or ambiguous examples
6. Export to HuggingFace datasets format for training
```

**Prompt template for synthetic generation (HIGH confidence — standard few-shot generation pattern):**

```python
GENERATION_PROMPT = """
You are generating training examples for a GTD (Getting Things Done) classifier.

Generate {n} diverse examples of GTD "{label}" items. Each should be realistic,
varied in phrasing, and unambiguous. Output as JSON array: [{"text": "...", "label": "{label}"}]

GTD definitions:
- task: a concrete next action to do ("Call dentist to reschedule appointment")
- fact: a piece of information to remember ("The AWS region for prod is us-east-1")
- event: a time-bound occurrence ("Team standup every Tuesday at 10am")
- decision: a resolved choice with rationale ("Chose PostgreSQL over MongoDB for ACID compliance")
- insight: a realized understanding or pattern ("When I skip breakfast, afternoon focus drops sharply")

Seed examples for "{label}":
{seeds}

Generate {n} new examples. Vary phrasing, length, domain, and specificity.
"""
```

**Cost estimate:** claude-3-5-haiku-20241022 at ~$0.25/M input tokens, generating 100 examples per label (500 total) costs approximately $0.01–$0.05. Negligible.

**Augmenting with real data from the classification log:**

The Dexie `classificationLog` table already captures every user classification decision with the atom content, suggested type, and user-confirmed type. Export this table via the existing Dexie export mechanism and add confirmed classifications to the training set. Even 20–50 real examples per class significantly improves calibration over purely synthetic data.

---

## Decision 10: Browser-Side Classifier Worker Integration

**Recommendation: Extend the existing embedding worker OR add a dedicated classifier worker**

The existing `embedding-worker.ts` already imports `@huggingface/transformers` and handles ONNX inference via Transformers.js pipeline. For the fine-tuned classifier head, two integration options exist:

**Option A: Extend embedding-worker.ts (simpler, recommended for initial implementation)**

Add new message types to the existing worker:

```typescript
// New message types for Tier 2 fine-tuned classifiers
| { type: 'CLASSIFY_FINE_TUNED'; id: string; text: string; task: GTDTask }
// Returns:
| { type: 'FINE_TUNED_RESULT'; id: string; label: string; confidence: number; logits: number[] }
```

The worker loads the embedding pipeline (already loaded) plus an `ort.InferenceSession` for each classifier ONNX file. MiniLM embeddings feed directly into the classifier session.

```typescript
import * as ort from 'onnxruntime-web';

// Load once, reuse
const classifierSessions: Record<GTDTask, ort.InferenceSession> = {};

async function loadClassifier(task: GTDTask): Promise<ort.InferenceSession> {
  if (classifierSessions[task]) return classifierSessions[task];
  const session = await ort.InferenceSession.create(
    `/models/classifiers/${task}.onnx`,
    { executionProviders: ['wasm'] }
  );
  classifierSessions[task] = session;
  return session;
}

async function classifyFineTuned(text: string, task: GTDTask): Promise<ClassifyResult> {
  const embedding = await embedTexts([text]); // existing function
  const vector = embedding[0];

  const session = await loadClassifier(task);
  const inputTensor = new ort.Tensor('float32', new Float32Array(vector), [1, 384]);
  const results = await session.run({ embedding: inputTensor });
  const logits = Array.from(results['logits'].data as Float32Array);
  // softmax + argmax
  return computeLabel(logits, task);
}
```

**Option B: Dedicated classifier worker (better isolation, more complex)**

A separate `classifier-worker.ts` that also imports `onnxruntime-web` and holds its own embedding pipeline. This duplicates the MiniLM model load (~22MB) in a second worker, which wastes memory. Not recommended unless Option A creates concurrency problems.

**Recommendation: Option A.** The embedding-worker already handles multiple message types (EMBED, EMBED_ATOMS, CLASSIFY_TYPE, ROUTE_SECTION). Adding CLASSIFY_FINE_TUNED follows the exact same pattern. No second model download.

**onnxruntime-web version note:**

The existing `@huggingface/transformers` v3.8.1 bundles its own `onnxruntime-web` internally. If the classifier worker imports `onnxruntime-web` directly (for the classifier sessions), import from the Transformers.js re-export or pin to the same version that Transformers.js uses to avoid two different ORT instances in the same worker. Check the bundled version via `node_modules/@huggingface/transformers/package.json` at integration time.

**MEDIUM confidence** — this import deduplication detail requires confirmation at integration time by inspecting the Transformers.js v3.8.1 bundle.

---

## Decision 11: Model Artifact Storage and Serving

**Recommendation: `public/models/classifiers/` — static assets served by Vite, same pattern as embedding model**

The existing `download-model.cjs` script downloads `Xenova/all-MiniLM-L6-v2` to `public/models/`. The fine-tuned classifier OnnX files follow the same pattern:

```
public/
  models/
    Xenova/
      all-MiniLM-L6-v2/     (existing, ~22MB)
    classifiers/             (new, <2MB total)
      gtd-type.onnx          (~200-400KB per model)
      gtd-priority.onnx
      gtd-staleness.onnx
      gtd-section.onnx
```

The classifier ONNX files are committed to git (they are small, ~200–400KB each, binary but not prohibitively large). The MiniLM model is gitignored (22MB). This means:
- No download script needed for classifiers — they're in the repo
- Users get classifiers immediately on first load
- MiniLM still downloads once via `scripts/download-model.cjs`

**File size budget:** 5 GTD classifiers at 400KB each = 2MB total. Under the 25MB PWA budget for cold-start resources.

**Caching:** Vite's service worker (vite-plugin-pwa) serves all `public/models/` files from cache after first visit. No special handling needed for classifier OnnX files.

---

## v3.0 New Dependencies Summary

### Python (developer machine only — not deployed to browser)

```bash
# Create a training virtual environment
python -m venv .venv/training
source .venv/training/bin/activate   # or .venv\training\Scripts\activate on Windows

# Core training stack
pip install torch>=2.4.0                        # CPU build is sufficient for classifier head training
pip install transformers==4.57.3                # Stable v4; not v5 pre-release
pip install sentence-transformers>=3.0.0        # For generating training embeddings via MiniLM
pip install optimum[onnx]==2.1.0                # ONNX export + quantization (includes optimum-onnx)
pip install onnx==1.21.0                        # ONNX graph tools
pip install onnxruntime==1.24.0                 # Python CPU inference for validation
pip install scikit-learn>=1.8.0                 # Baseline LR classifier + train/test split
pip install numpy>=2.4.0                        # Array ops
pip install datasets>=2.0.0                     # HuggingFace datasets format for training data

# Optional: if synthetic data pipeline uses distilabel at scale
# pip install "distilabel[anthropic]"==1.5.3
```

### JavaScript / Browser (npm additions)

No new npm packages required. The browser stack is unchanged from v2.0:

- `@huggingface/transformers` v3.8.1 — already installed, handles embedding inference
- `onnxruntime-web` — already bundled inside Transformers.js, used for classifier session

If the classifier worker needs a direct `ort` import (for `ort.Tensor` and `ort.InferenceSession`), check whether `onnxruntime-web` needs to be added as a direct dependency or can be imported from Transformers.js's internal re-export. This is an integration-time verification, not a new package.

### New Scripts

```bash
# Add to package.json scripts:
"train:models": "python training/train_classifiers.py"
"validate:models": "python training/validate_onnx.py"
"generate:data": "python training/generate_synthetic.py"
```

---

## What NOT to Add (v3.0)

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| distilabel (for initial bootstrap) | Adds a complex pipeline framework for 500 examples; overkill until dataset exceeds 2,000 | Custom Python generation script (~150 lines) |
| Full fine-tuned DistilBERT in browser | 60–80MB per GTD task; redundant with existing MiniLM + wasted embedding duplication | Separate classifier head ONNX (<400KB per task) |
| TinyBERT / MobileBERT as browser classifier | These are full transformer models with built-in tokenization; adding them duplicates MiniLM and costs 15–60MB per model | Shared MiniLM embeddings + lightweight classifier head |
| Additional browser ONNX runtime (direct onnxruntime-web install) | May create two ORT instances in the same worker if Transformers.js also bundles ORT | Import from Transformers.js re-export or verify deduplication before adding |
| transformers v5 pre-release for training | v5 is an RC as of early 2026, API changes before stable | transformers 4.57.3 stable |
| GPU-only training pipeline | The classifier head (384→128→N) trains in seconds on CPU; GPU complicates developer setup for no benefit | PyTorch CPU build; GPU optional for user experiments |
| Automated distilabel quality pipeline | Necessary at 10,000+ examples with multiple LLM judges; premature at 500 | Manual review pass on synthetic examples |
| Separate Python web server for training data | BinderOS is browser-only; no server infrastructure | Export Dexie data to JSON via existing export tool, import in Python |

---

## Recommended Stack (Core — v1.0, unchanged)

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| SolidJS | 1.9.x (stable) | UI framework | Fine-grained reactivity at the signal level avoids VDOM overhead, which matters critically when bridging WASM↔UI — every WASM state change triggers exactly the components that depend on it, not a subtree diff. 7KB runtime. TypeScript-first. v2.0 is in development but 1.9.x is production-stable. |
| TypeScript | 5.9.x | Type layer for all JS/TS | Current stable. v5.9.3 is latest. TS 6.0 (bridge to Go-based TS 7) is coming in early 2026 but is not yet released — 5.9.x is safe for project start. |
| Vite | 7.3.x | Build tool and dev server | Current major. Dropped Node.js 18 (EOL). Targets `baseline-widely-available` by default (Chrome 107+, Firefox 104+, Safari 16+). Rolldown bundler coming in v8 beta but v7.x is stable. Best DX for WASM + SolidJS combo. |
| Rust (wasm32-unknown-unknown target) | stable toolchain (1.84+) | Core logic compiled to WASM | Priority scoring, entropy metrics, schema enforcement — these are CPU-bound, stateful computations that benefit from Rust's memory safety and near-native performance without GC pauses. |
| wasm-bindgen | 0.2.109 | Rust↔JS bridge | The core tool for Rust-to-WASM JS interop. The rustwasm org was archived July 2025, but wasm-bindgen itself was transferred to a new wasm-bindgen org with active maintainers. Not deprecated — just re-homed. |
| wasm-bindgen-cli | 0.2.109 (must match lib) | Post-compilation WASM processing | Replaces wasm-pack's packaging step. Run after `cargo build --target wasm32-unknown-unknown`. Version must exactly match wasm-bindgen crate version in Cargo.toml. |
| Dexie.js | 4.0.x (stable) | IndexedDB wrapper | The standard IndexedDB abstraction for 2025. Version 4.0.11 is current stable. Provides schema versioning, typed queries, and reactive live queries. 4.1.x betas add experimental Y.js/CRDT support but stable 4.0.x is the right choice for now. |
| IndexedDB (via Dexie) | Browser-native | Structured data persistence | Typed atom storage (Task, Fact, Event, Decision, Insight). OPFS is for large binary blobs (not row-query JSON). Use Dexie over raw IndexedDB for schema migrations and typed access. |
| Zod | 4.x | Schema validation and type inference | v4 released July 2025. TypeScript-first. Validates all atom mutations at runtime before they touch IndexedDB. Bridges compile-time types and runtime constraints. Single schema definition generates both TS types and runtime validators. |

### Supporting Libraries (v1.0)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vite-plugin-solid | 2.10.x | SolidJS JSX transform for Vite | Required in every SolidJS+Vite project. |
| vite-plugin-wasm | 3.5.0 | ESM-compatible WASM loading in Vite 7 | Required for loading custom Rust-compiled WASM modules in Vite. |
| vite-plugin-top-level-await | latest | Enables top-level `await` for WASM init | Required alongside vite-plugin-wasm unless build.target is `esnext`. |
| solid-dexie | 0.0.5 | Reactive Dexie queries as Solid signals | Bridges Dexie's live query system into SolidJS's reactive graph. |
| @solidjs/router | 0.14.x | SPA client-side routing | Hash-based or history API routing for navigating between Pages. |
| serde + serde-wasm-bindgen | serde: 1.x, serde-wasm-bindgen: 0.6.x | Rust↔JS data serialization | Serialize Rust structs to/from JS objects at the WASM boundary. |
| @huggingface/transformers | 3.8.1 | ONNX model inference in-browser | Semantic embeddings (v1.0) + AI classification (v2.0) + fine-tuned classifier inference (v3.0). STABLE. Do not upgrade to v4 (`@next`) yet. |
| MiniSearch | 7.x | Full-text search | Client-side full-text search for atom content. |
| Vitest | 2.x | Unit and integration testing | Works with SolidJS+Vite natively. |

### Supporting Libraries (v2.0 additions)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **fetch-event-stream** | **0.1.6** | **SSE streaming for cloud LLM APIs** | **Always — replaces any SDK for OpenAI/Anthropic streaming. 741 bytes, zero deps.** |
| @mlc-ai/web-llm | 0.2.81 | WebGPU in-browser LLM (optional) | Only when user explicitly enables "high-quality browser AI" in settings. NOT loaded by default. |

### New (v3.0 — Python training toolchain only, not browser deps)

| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| Python | 3.11+ | Training runtime | System install or pyenv; 3.11 for best ML ecosystem compatibility |
| PyTorch | 2.4+ | Train GTDClassifierHead | CPU build is sufficient; GPU optional |
| transformers | 4.57.3 | Generate training embeddings, Trainer API | Stable v4; NOT v5 pre-release |
| sentence-transformers | 3.x | Embed training data via MiniLM | Ensures embedding compatibility with browser worker |
| optimum[onnx] | 2.1.0 | Export PyTorch classifier to ONNX + quantize | `pip install optimum[onnx]` |
| onnx | 1.21.0 | ONNX graph validation | Explicit pin for compatibility |
| onnxruntime | 1.24.x | Validate exported model in Python before shipping | CPU inference for test harness |
| scikit-learn | 1.8.x | Baseline LR classifier, train/test utilities | Baseline comparison only; not deployed |
| datasets | 2.x+ | Training data format | HuggingFace datasets format for labeled examples |

---

## Transformers.js Version Note (v3 vs v4)

Use `@huggingface/transformers` **v3.8.1 (stable)** — do NOT upgrade to v4 (`@next`) yet.

v4 was announced as preview on Feb 9, 2026. It's a full runtime rewrite (new C++ WebGPU engine) with a 10-month development history and "next" tag on npm. The API may change before stable release. v3.8.1 has the full model support BinderOS needs (SmolLM2, embeddings, classification). Upgrade to v4 when it ships stable.

---

## Installation

```bash
# v2.0 new deps only (core stack from v1.0 already installed)
pnpm add fetch-event-stream

# Optional: high-quality browser LLM provider (add when implementing WebLLM route)
pnpm add @mlc-ai/web-llm

# v3.0: no new browser npm packages needed
# Training toolchain is Python-only — see training/requirements.txt
```

**Training environment setup (developer machine only):**

```bash
python -m venv .venv/training
source .venv/training/bin/activate
pip install torch>=2.4.0 transformers==4.57.3 sentence-transformers>=3.0 \
            optimum[onnx]==2.1.0 onnx==1.21.0 onnxruntime==1.24.0 \
            scikit-learn>=1.8.0 numpy>=2.4.0 datasets>=2.0.0
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| SolidJS 1.9.x | React 19 | If team has deep React expertise and WASM bridging overhead is acceptable. |
| SolidJS 1.9.x | SolidJS 2.0 (beta) | Wait for 2.0 when it reaches stable release. |
| @huggingface/transformers 3.8.1 | @mlc-ai/web-llm | When user explicitly opts into WebGPU-accelerated high-quality browser LLM. |
| @huggingface/transformers 3.8.1 | @wllama/wllama | When Safari CPU-only compatibility is a hard requirement (currently out of scope). |
| SmolLM2-135M-Instruct | SmolLM2-360M-Instruct | When higher instruction quality is needed; 360M is 2x download but better results. |
| SmolLM2 (browser path) | Cloud API only | When user disables local LLM — cloud API is always the escalation path. |
| fetch + fetch-event-stream | openai SDK | Never for browser-only apps. SDK is fine for Node.js server use. |
| Chrome Prompt API (window.ai) | any of above | Chrome-only, origin trial only, Chrome 138+ Extensions only — not suitable as default. |
| Dexie 4.0.x | Raw IndexedDB | Only if Dexie's abstraction creates unacceptable overhead — benchmark first. |
| wasm-bindgen-cli (direct) | wasm-pack | wasm-pack was sunset and archived by the rustwasm org in July 2025. Do not use. |
| Embedding + classifier head (v3.0) | Fine-tuned DistilBERT in browser | Only if classification accuracy proves insufficient AND 60–80MB per-model download is acceptable |
| Custom generation script (v3.0) | distilabel 1.5.3 | When training set exceeds 2,000 examples needing automated quality filtering |
| transformers 4.57.3 for training | transformers v5 pre-release | When v5 reaches stable GA release |
| Anthropic API for synthetic data | OpenAI API | Either works; BinderOS already integrates Anthropic so use that to avoid a new API key |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| wasm-pack | Sunset and archived by rustwasm org, July 2025. The toolchain is abandoned. | `cargo build` → `wasm-bindgen-cli` → `wasm-opt` |
| openai npm package (browser) | ~17KB gzip, designed for Node.js, pulls polyfills. Browser fetch does 100% of what's needed. | Raw `fetch` + `fetch-event-stream` |
| @anthropic-ai/sdk (browser) | Same as above. ~15KB, server-centric. | Raw `fetch` + `fetch-event-stream` |
| Vercel AI SDK (`ai` package) | 30–50KB, server-centric, React/Next-centric. `useChat` hook doesn't work with SolidJS. | Raw `fetch` + `fetch-event-stream` + SolidJS signals |
| EventSource (native browser API) | Only supports GET requests. OpenAI and Anthropic require POST with auth headers. | `fetch` + `fetch-event-stream` |
| @huggingface/transformers@next (v4) | Preview/unstable as of Feb 2026. API changes expected before stable release. | `@huggingface/transformers` v3.8.1 |
| solid-motionone for orb UI | 5.8KB for what CSS `@keyframes` + `transform` solve in 20 lines. | Pure CSS animations |
| TinyLlama | Outperformed by SmolLM2 at every comparable size. No reason to choose it in 2026. | SmolLM2-135M or SmolLM2-360M |
| Gemma-2B / Phi-3-mini as browser defaults | Too large for CPU ONNX inference. WebGPU required. Breaks fallback guarantees. | SmolLM2-135M-Instruct (CPU viable) |
| SolidStart | Full-stack meta-framework. BinderOS is browser-only, no server. Adds SSR complexity with zero benefit. | Plain SolidJS + Vite |
| server-side database (Postgres, SQLite file, etc.) | Contradicts the browser-only, local-first constraint. | IndexedDB via Dexie.js |
| Embedding LLMs as hard dependencies | WebGPU is not universally available. Hard-coding WebLLM breaks for users without it. | Abstract AI provider interface; WebLLM as one optional impl |
| Full DistilBERT/TinyBERT in browser for classification | 60–80MB per task model; duplicates MiniLM embeddings already in the worker | MiniLM embedding + lightweight PyTorch classifier head exported to ONNX (<400KB) |
| distilabel at project start | Framework overhead exceeds value for <500 labeled examples; adds 6+ transitive dependencies | Custom Python generation script |
| transformers v5 pre-release in training | RC status as of March 2026; API breaks expected before stable release | transformers 4.57.3 stable |

---

## Stack Patterns by Variant

**WASM module initialization (async):**
- Initialize the WASM module once at app startup via `await init()` before rendering UI
- Use SolidJS `<Suspense>` to block rendering until WASM is ready
- Because WASM init returns a Promise, vite-plugin-top-level-await is needed unless build.target is `esnext`

**AI provider interface pattern:**
- Define a `AIService` interface in TypeScript: `{ classify(text, opts): Promise<ClassifyResult>; streamChat(msgs, onChunk, signal): Promise<void>; isAvailable(): boolean }`
- Implementations: `TransformersJSProvider` (SmolLM2-135M), `TransformersJSProvider360M` (SmolLM2-360M), `WebLLMProvider` (WebGPU), `OpenAIProvider`, `AnthropicProvider`, `NullProvider`
- User selects provider tier in settings; all AI features degrade gracefully to NullProvider

**Browser LLM model loading pattern:**
- Models are NOT bundled — fetched from HuggingFace CDN on first use, cached to browser Cache API
- Show download progress in the floating orb UI (first-time only)
- Transformers.js handles caching automatically; no IndexedDB collision with Dexie atom data
- Gate model inference behind `isAvailable()` check; fall through to cloud or null

**Cloud API streaming pattern:**
- Store API keys in `localStorage` only (never IndexedDB — not for secrets, and overkill)
- API key entry via settings modal, never committed to source, never sent to any BinderOS service
- AbortController tied to floating orb lifecycle: abort on orb close or view navigation

**Floating orb architecture:**
- Single `<OrbContainer>` component mounted at app root outside the router `<Routes>` — always present
- Orb state: `'idle' | 'thinking' | 'streaming' | 'expanded'` — SolidJS signal
- Expanded panel renders above content via `position: fixed; z-index: 9999`
- GTD menu: hardcoded action list (Weekly Review, Inbox Triage, Add Item, Compression Check) — no dynamic generation needed

**WASM↔SolidJS state bridge:**
- WASM functions return plain JS objects (via serde-wasm-bindgen)
- TS layer receives return values and writes to SolidJS stores or signals
- Never pass SolidJS signal objects into WASM — pass raw values, receive raw values back
- For live query reactivity: WASM computes priority scores → TS writes results to Dexie → solid-dexie live query triggers UI update

**IndexedDB schema migrations (AI mutation tracking):**
- v2.0 extends the changelog schema with `source: 'user' | 'ai'` field
- Add via Dexie `db.version(N+1).stores({...}).upgrade(...)` — never mutate existing version
- Zod schemas updated to include source field before any write

**v3.0 fine-tuned classifier pattern:**
- Classifier ONNX files live in `public/models/classifiers/` — committed to git, served by Vite as static assets
- Embedding worker extends to load classifier sessions lazily on first CLASSIFY_FINE_TUNED message
- One classifier ONNX per GTD task type (atom type, priority, staleness, section routing)
- Training pipeline lives in `training/` directory (Python scripts, not part of browser bundle)
- Classification log exports feed back into training data for continuous improvement
- Model artifacts committed to git (small enough: ~400KB each); embedding model remains gitignored (22MB)

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| solid-js 1.9.x | vite-plugin-solid 2.8.x+ | vite-plugin-solid 2.8.2+ handles all test config automatically for Vitest |
| vite 7.3.x | vite-plugin-wasm 3.5.0 | Plugin explicitly supports Vite 2–7 |
| vite 7.3.x | vite-plugin-solid 2.10.x | Verified compatible |
| wasm-bindgen 0.2.109 (Cargo.toml) | wasm-bindgen-cli 0.2.109 | These MUST match exactly — mismatched versions cause cryptic binary format errors |
| dexie 4.0.x | solid-dexie 0.0.5 | solid-dexie declares dexie as a peer dep; version 4.x is supported |
| TypeScript 5.9.x | zod 4.x | Zod 4 requires TS 5.5+ |
| @huggingface/transformers 3.8.1 | fetch-event-stream 0.1.6 | No conflict — different runtime paths |
| @mlc-ai/web-llm 0.2.81 | @huggingface/transformers 3.8.1 | No conflict when each runs in its own Web Worker |
| @mlc-ai/web-llm 0.2.81 | Chrome 113+, Edge 113+ | WebGPU required. Firefox: flag only. Safari: 18+ on macOS only. iOS: not supported. |
| transformers 4.57.3 (Python) | optimum[onnx] 2.1.0 | Verified compatible per optimum GitHub releases |
| onnx 1.21.0 | onnxruntime 1.24.0 | Both tested against skl2onnx 1.20.0 per their compatibility matrix |
| sentence-transformers 3.x | transformers 4.57.3 | sentence-transformers declares transformers as peer dep; 4.x supported |
| numpy 2.4.x | scikit-learn 1.8.0 | Per skl2onnx 1.20.0 tested stack |

---

## Build Pipeline (WASM modules)

The three-step pipeline replacing wasm-pack:

```bash
# Step 1: Compile Rust to WASM
cargo build --target wasm32-unknown-unknown --release

# Step 2: Generate JS bindings
wasm-bindgen \
  --target web \
  ./target/wasm32-unknown-unknown/release/binderos_core.wasm \
  --out-dir ./src/wasm/

# Step 3: Optimize binary size (optional but recommended for production)
wasm-opt -Oz \
  ./src/wasm/binderos_core_bg.wasm \
  -o ./src/wasm/binderos_core_bg.wasm
```

Wrap in a Makefile or package.json script (`"build:wasm": "..."`). Run before or alongside `vite build`.

Note for Windows: set LIB env var to MSVC + Windows SDK paths before invoking the build pipeline.

---

## Sources

### v1.0 (Core Stack)
- [SolidJS Releases — GitHub](https://github.com/solidjs/solid/releases) — v1.9.11 current stable, v2.0 in development
- [SolidJS Road to 2.0 Discussion](https://github.com/solidjs/solid/discussions/2425) — v2.0 status
- [Sunsetting the rustwasm GitHub org — Inside Rust Blog](https://blog.rust-lang.org/inside-rust/2025/07/21/sunsetting-the-rustwasm-github-org/) — wasm-pack sunset, July 2025; wasm-bindgen transferred to new org
- [wasm-bindgen Guide](https://rustwasm.github.io/docs/wasm-bindgen/) — Authoritative wasm-bindgen docs
- [Dexie.js — dexie.org](https://dexie.org/) — v4.0.x stable, actively maintained
- [Vite 7.0 announcement](https://vite.dev/blog/announcing-vite7) — v7.3.1 current
- [TypeScript 5.9 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-5-9/) — v5.9.3 current stable
- [Zod v4 release notes](https://zod.dev/v4) — v4.3.6 current; v4 released July 2025

### v2.0 (AI Stack)
- [@mlc-ai/web-llm — npm/docs](https://webllm.mlc.ai/docs/) — v0.2.81 current (Feb 2026)
- [@huggingface/transformers — npm](https://www.npmjs.com/package/@huggingface/transformers) — v3.8.1 stable; v4 (`@next`) preview only
- [Transformers.js v4 Preview — HuggingFace Blog](https://huggingface.co/blog/transformersjs-v4) — preview tag, Feb 9 2026; do not use yet
- [SmolLM2 model collection — HuggingFace](https://huggingface.co/collections/HuggingFaceTB/smollm2-6723884218bcda64b34d7db9) — 135M, 360M, 1.7B; ONNX + Transformers.js support confirmed
- [SmolLM2-360M structured generation in browser — Simon Willison](https://simonwillison.net/2024/Nov/29/structured-generation-smollm2-webgpu/) — confirmed browser-runnable with WebGPU
- [fetch-event-stream — GitHub](https://github.com/lukeed/fetch-event-stream) — v0.1.6, 741 bytes, Oct 2025
- [WebLLM + WASM + WebWorkers — Mozilla AI Blog](https://blog.mozilla.ai/3w-for-in-browser-ai-webllm-wasm-webworkers/) — architecture: WebLLM in separate worker, no conflict with existing WASM
- [WebGPU in-browser LLM guide — Intel Developer](https://www.intel.com/content/www/us/en/developer/articles/technical/web-developers-guide-to-in-browser-llms.html) — runtime comparison
- [Chrome Prompt API — Chrome Developers](https://developer.chrome.com/docs/ai/prompt-api) — Chrome Extensions origin trial only, Chrome 138+; not suitable as default
- [Phi-3 ONNX web — HuggingFace](https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-onnx-web) — confirmed WebGPU via Transformers.js; too large for CPU default
- [ONNX Runtime Web threading — onnxruntime.ai](https://onnxruntime.ai/docs/tutorials/web/) — ONNX uses proxy workers; no conflict with Rust/WASM workers

### v3.0 (Fine-Tuned ONNX + Training Pipeline)
- [HuggingFace Optimum PyPI — pypi.org/project/optimum](https://pypi.org/project/optimum/) — v2.1.0, Dec 19 2025; ONNX integration moved to optimum-onnx package
- [optimum-onnx GitHub — github.com/huggingface/optimum-onnx](https://github.com/huggingface/optimum-onnx) — current ONNX export home; install via `optimum[onnx]`
- [transformers PyPI — pypi.org/project/transformers](https://pypi.org/project/transformers/) — v4.57.3 stable; v5 pre-release RC only
- [Transformers v5 blog — huggingface.co/blog/transformers-v5](https://huggingface.co/blog/transformers-v5) — v5 is RC, not stable GA; use v4.57.3
- [onnxruntime-web npm — npmjs.com/package/onnxruntime-web](https://www.npmjs.com/package/onnxruntime-web) — v1.24.2 latest; bundled in Transformers.js
- [skl2onnx PyPI — pypi.org/project/skl2onnx](https://pypi.org/project/skl2onnx/) — v1.20.0; tested with onnx 1.21.0 + sklearn 1.8.0
- [Logistic regression on embeddings paper — Bank of England 2025](https://www.bankofengland.co.uk/working-paper/2025/improving-text-classification-logistic-regression-llms-tens-of-shot-classifiers) — validates embedding + LR approach with tens of labeled examples; HIGH confidence for feasibility
- [Full client-side ONNX classifier + MiniLM — bandarra.me](https://bandarra.me/posts/from-pytorch-to-browser-a-full-client-side-solution-with-onnx-and-transformers-js) — confirms classifier head < 2MB combined with MiniLM; exact architecture for embedding→classifier pattern
- [distilabel GitHub — github.com/argilla-io/distilabel](https://github.com/argilla-io/distilabel) — v1.5.3, Jan 2025; mature but unnecessary for <2,000 examples
- [Synthetic data for text classification — EMNLP 2023](https://aclanthology.org/2023.emnlp-main.647/) — confirms LLM-generated synthetic data works better with few-shot seeding; validates generation strategy
- [ONNX Runtime Web size budgets — onnxruntime.ai/docs/tutorials/web/large-models.html](https://onnxruntime.ai/docs/tutorials/web/large-models.html) — classifier head well under 4GB limit; float32 head ~200–400KB
- [Optimum ONNX export docs — huggingface.co/docs/optimum/en/exporters/onnx](https://huggingface.co/docs/optimum/en/exporters/onnx/usage_guides/export_a_model) — ORTQuantizer, ORTModelForSequenceClassification

---

## Confidence Notes

| Area | Confidence | Notes |
|------|------------|-------|
| SolidJS version | HIGH | npm confirmed, GitHub releases checked |
| Vite version | HIGH | Official blog post, v7.3.1 confirmed |
| wasm-bindgen workflow | HIGH | Inside Rust Blog official announcement; crates.io version checked |
| wasm-pack deprecation | HIGH | Official Inside Rust Blog announcement July 2025 |
| Dexie.js + solid-dexie | HIGH | npm and GitHub checked; active maintenance confirmed |
| TypeScript version | HIGH | Official MS dev blog, v5.9.3 confirmed |
| Zod v4 | HIGH | Official zod.dev release notes |
| @huggingface/transformers v3.8.1 | HIGH | npm confirmed, active development |
| fetch-event-stream v0.1.6 | HIGH | GitHub confirmed, Oct 2025, widely used |
| @mlc-ai/web-llm v0.2.81 | HIGH | npm confirmed, docs confirmed, Feb 2026 |
| SmolLM2 Transformers.js support | HIGH | Official HuggingFace model card confirms ONNX + Transformers.js |
| SmolLM2 CPU inference speed | MEDIUM | Approximate figures from community benchmarks; measure at integration time |
| WebLLM/ONNX worker conflict | MEDIUM | Architecture analysis from Mozilla AI blog + ONNX RT docs; confirm with integration test |
| Transformers.js v4 stability | LOW | Preview/next tag only as of Feb 9 2026; do not use until stable tag released |
| IronCalc maturity | LOW | Project self-describes as "early stage". Deferred to v3.0 anyway. |
| optimum[onnx] 2.1.0 | HIGH | PyPI confirmed, Dec 19 2025, official HuggingFace project |
| transformers 4.57.3 stable | HIGH | PyPI confirmed, installed 3M/day, v5 explicitly flagged pre-release |
| Embedding + classifier head architecture | HIGH | Confirmed by bandarra.me full working implementation; architecture analysis self-consistent |
| Classifier head size (<400KB) | MEDIUM | Derived from architecture (384→128→5 params = ~200K floats), confirmed by bandarra.me "under 5MB combined"; exact size verified at training time |
| Synthetic data via Anthropic prompt | MEDIUM | Pattern validated by EMNLP 2023 paper and general practice; GTD-specific quality unverified until data is generated |
| ort.InferenceSession in embedding worker | MEDIUM | Import deduplication with Transformers.js bundled ORT needs integration-time verification |
| distilabel unnecessary at <500 examples | HIGH | Framework overhead is documented; custom script approach is standard for small datasets |
| Python training on CPU | HIGH | Classifier head is trivially small; CPU training is seconds not hours |

---

*Stack research for: BinderOS — local-first, browser-only personal information management system*
*v1.0 researched: 2026-02-21 | v2.0 AI milestone update: 2026-02-22 | v3.0 fine-tuned ONNX milestone: 2026-03-03*
