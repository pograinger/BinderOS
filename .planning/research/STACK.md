# Stack Research

**Domain:** Local-first, browser-only personal information management system with WASM compute and AI integration
**Researched:** 2026-02-22 (v1.0 initial) / 2026-02-22 (v2.0 AI milestone update)
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
| @huggingface/transformers | 3.8.1 | ONNX model inference in-browser | Semantic embeddings (v1.0) + AI classification (v2.0). STABLE. Do not upgrade to v4 (`@next`) yet. |
| MiniSearch | 7.x | Full-text search | Client-side full-text search for atom content. |
| Vitest | 2.x | Unit and integration testing | Works with SolidJS+Vite natively. |

### New Supporting Libraries (v2.0 additions)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **fetch-event-stream** | **0.1.6** | **SSE streaming for cloud LLM APIs** | **Always — replaces any SDK for OpenAI/Anthropic streaming. 741 bytes, zero deps.** |
| @mlc-ai/web-llm | 0.2.81 | WebGPU in-browser LLM (optional) | Only when user explicitly enables "high-quality browser AI" in settings. NOT loaded by default. |

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

---

*Stack research for: BinderOS — local-first, browser-only personal information management system*
*v1.0 researched: 2026-02-21 | v2.0 AI milestone update: 2026-02-22*
