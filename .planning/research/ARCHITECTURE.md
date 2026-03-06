# Architecture Research

**Domain:** Device-adaptive AI tiers, ONNX sanitization classifiers, multi-provider cloud — BinderOS v4.0
**Researched:** 2026-03-05
**Confidence:** HIGH (existing codebase read directly; new integrations verified via official docs, npm packages, and GitHub repositories)

---

## What This Document Covers

This is a v4.0-specific architecture document. It assumes the v3.0 architecture (tiered pipeline, MiniLM embedding worker, ONNX type classifier, WebLLM BrowserAdapter, Anthropic CloudAdapter) is already in place and operational. It answers exactly four questions:

1. How does a WASM-based mobile LLM integrate alongside WebLLM?
2. Where does the sanitization classifier sit in the pipeline?
3. How does multi-provider cloud fit into the adapter pattern?
4. Where does the template engine live — worker or main thread?

---

## System Overview (v4.0 Target State)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                            Main Thread (SolidJS)                              │
│                                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────────────────────┐  │
│  │ InboxView│  │  AIOrb   │  │ Reviews  │  │     Compression Coach       │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────────┬────────────────┘  │
│       └─────────────┴─────────────┴──────────────────────┘                  │
│                              │                                               │
│                    dispatchTiered(request)                                    │
│                     src/ai/tier2/pipeline.ts                                 │
│                              │                                               │
│              ┌───────────────┼─────────────────┐                             │
│              ▼               ▼                 ▼                             │
│          Tier 1          Tier 2            Tier 3                            │
│       deterministic    ONNX ML         LLM (local or cloud)                  │
│       heuristics     classifiers                                             │
│                                             │                                │
│                                  ┌──────────┴───────────┐                    │
│                                  ▼                       ▼                   │
│                          DeviceAdapter             CloudAdapter              │
│                    (new v4.0: wraps either)    (multi-provider v4.0)        │
│                          │         │                     │                   │
│              ┌───────────┘         └──────────┐          └───────────┐       │
│              ▼                                ▼                       ▼       │
│        WebLLM Worker              WllamaAdapter            Provider Router   │
│       (GPU/WebGPU)               (WASM/CPU)              (Anthropic/OpenAI   │
│                                                            /Grok/Corporate)  │
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐   │
│  │                    Embedding Worker (unchanged)                        │   │
│  │  MiniLM Embeddings │ ONNX type classifier │ NEW: sanitization model   │   │
│  └───────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│  ┌────────────────────────────────────────────────────────┐                  │
│  │        Template Engine (main thread, pure functions)   │                  │
│  │  Slot-fill templates for reviews, coaching, GTD flows  │                  │
│  └────────────────────────────────────────────────────────┘                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Integration Point 1: Device-Adaptive Local LLM

### The Core Problem

WebLLM (`@mlc-ai/web-llm`) is WebGPU-only. It has no WASM fallback when WebGPU is unavailable. Mobile browsers — particularly iOS Safari before version 26 and Firefox on Android — either lack WebGPU or have incomplete implementations. The app currently fails silently to `NoOpAdapter` on these devices.

### Solution: DeviceAdapter Wrapping Two Implementations

Introduce a `DeviceAdapter` that wraps either `BrowserAdapter` (WebLLM/WebGPU) or a new `WasmAdapter` (wllama/WASM), selected at initialization by GPU detection.

**File:** `src/ai/adapters/device.ts` (NEW)

The `DeviceAdapter`:
1. Calls `detectDevice()` at init — checks `navigator.gpu` availability
2. Instantiates `BrowserAdapter` (WebLLM) if WebGPU is present
3. Instantiates `WasmAdapter` (wllama) if WebGPU is absent
4. Exposes the same `AIAdapter` interface — callers never need to know which is active
5. Reports `device: 'webgpu' | 'wasm-cpu'` to the store for UI display

```typescript
// src/ai/adapters/device.ts (NEW)

export class DeviceAdapter implements AIAdapter {
  readonly id = 'browser' as const; // keeps existing store field name

  private inner: BrowserAdapter | WasmAdapter | null = null;

  async initialize(): Promise<void> {
    const hasWebGPU = 'gpu' in navigator && !!(await navigator.gpu?.requestAdapter());
    if (hasWebGPU) {
      this.inner = new BrowserAdapter(this.modelId);
    } else {
      this.inner = new WasmAdapter(this.wasmModelUrl);
    }
    await this.inner.initialize();
  }

  execute(request: AIRequest): Promise<AIResponse> {
    return this.inner!.execute(request);
  }
}
```

**File:** `src/ai/adapters/wasm.ts` (NEW)

The `WasmAdapter` wraps `@wllama/wllama`:
- Runs inference inside a worker thread (wllama's default — does not block UI)
- Loads a small GGUF model: SmolLM2-360M-Instruct-Q4 (~200MB) or Qwen2.5-0.5B-Q4 (~300MB)
- Single-threaded mode only (avoids COEP/COOP header requirement)
- Model stored in Cache API (same pattern as existing ONNX classifier)

```typescript
// src/ai/adapters/wasm.ts (NEW)

import { Wllama } from '@wllama/wllama';

export class WasmAdapter implements AIAdapter {
  readonly id = 'browser' as const;
  private wllama: Wllama | null = null;

  async initialize(): Promise<void> {
    this.wllama = new Wllama({
      'single-thread/wllama.wasm': '/wllama/single-thread/wllama.wasm',
    });
    // Use single-thread to avoid COEP/COOP requirement
    await this.wllama.loadModelFromUrl(this.modelUrl, { n_ctx: 512 });
    this._status = 'available';
  }

  async execute(request: AIRequest): Promise<AIResponse> {
    const text = await this.wllama!.createCompletion(request.prompt, {
      nPredict: request.maxTokens ?? 256,
      temperature: 0.3,
    });
    return { requestId: request.requestId, text, provider: 'browser' };
  }
}
```

**Critical constraint:** wllama requires WASM binary files served from the same origin. Add to `public/wllama/single-thread/wllama.wasm` (copy from `node_modules/@wllama/wllama/esm/single-thread/`).

**COEP/COOP decision:** Use single-threaded wllama only. Multi-threaded wllama requires `Cross-Origin-Embedder-Policy: require-corp` and `Cross-Origin-Opener-Policy: same-origin`. These headers break third-party iframes and some CDN resources. For a BYOK privacy-focused app, the tradeoff is not worth it. Single-thread wllama is slower but has zero header requirements.

### What Changes vs. What Stays

| Component | Status | Notes |
|-----------|--------|-------|
| `src/ai/adapters/browser.ts` | UNCHANGED | WebLLM/WebGPU path, stays as is |
| `src/ai/adapters/device.ts` | NEW | Wraps browser or wasm, decides at init |
| `src/ai/adapters/wasm.ts` | NEW | Wllama WASM path for mobile/no-WebGPU |
| `src/ai/router.ts` | UNCHANGED | `setActiveAdapter()` / `dispatchAI()` unchanged |
| Store initialization | MODIFIED | Instantiates `DeviceAdapter` instead of `BrowserAdapter` directly |
| `adapter.ts` types | MODIFIED | Add `'wasm-cpu'` to device string; keep `provider: 'browser'` |

### Model Selection for WasmAdapter

Use the smallest capable GGUF model — this is for mobile devices with 3-4GB RAM:

| Model | GGUF Size | RAM Usage | Context | Recommendation |
|-------|-----------|-----------|---------|----------------|
| SmolLM2-360M-Q4 | ~200MB | ~300MB | 512 tok | Best for mobile: fast, tiny |
| Qwen2.5-0.5B-Q4 | ~300MB | ~450MB | 512 tok | Better quality, still mobile-safe |
| Phi-3.5-mini-Q4 | ~2.4GB | ~3GB | 2k tok | Desktop-class only, not wllama target |

**Recommendation:** Ship SmolLM2-360M-Q4 for WasmAdapter. The WASM path is a capability floor (offline mobile), not a capability ceiling. Limit context to 512 tokens to keep latency acceptable.

---

## Integration Point 2: ONNX Sanitization Classifier

### The Core Problem

The current `sanitizeForCloud()` in `privacy-proxy.ts` is a type-boundary-only enforcement — it validates that a prompt is a string but does not actually detect whether it contains PII or sensitive content. When `level = 'full'` is selected, raw content flows to cloud providers unchecked. The v4.0 goal is an ONNX classifier that flags content as "safe to send" or "contains sensitive data" before it leaves the device.

### Pipeline Position: Embedding Worker

The sanitization classifier belongs inside the existing embedding worker (`src/search/embedding-worker.ts`), not in the main thread or a separate worker. Rationale:

- The embedding worker already runs ONNX Runtime Web (`ort`) and manages the MiniLM model
- Sanitization classification uses the same 384-dim MiniLM embedding as input — share the embedding step, run two ONNX inference sessions
- Adding a second worker would double the startup overhead for model loading
- All classification remains off main thread — no blocking
- Graceful degradation pattern already exists: if classifier fails, emit error and continue

**New message types added to embedding-worker.ts:**

```typescript
// Incoming
{ type: 'SANITIZE_CHECK'; id: string; text: string }

// Outgoing
{ type: 'SANITIZE_RESULT'; id: string; isSafe: boolean; confidence: number; flags: string[] }
{ type: 'SANITIZE_ERROR'; id: string; error: string }
```

**Sanitization classifier model:** Binary MLP classifier trained on:
- Positive class: PII-containing text (names, emails, phone numbers, addresses, account numbers, medical info)
- Negative class: abstract GTD content (tasks, facts, decisions without personal identifiers)
- Architecture: same MiniLM embedding → sigmoid binary head (same training pipeline as triage-type classifier)
- Output: `isSafe: boolean`, `confidence: 0-1`, `flags: string[]` (detected categories)
- Model path: `public/models/classifiers/sanitize-check.onnx`
- Cache key: `onnx-sanitizer-v1` (separate from `onnx-classifier-v1`)

### Where It Gates Cloud Requests

The sanitization check integrates into `CloudAdapter.execute()` between the `sanitizeForCloud()` call and the pre-send approval modal:

```
CloudAdapter.execute()
  1. Check API key, online status, session consent (existing)
  2. sanitizeForCloud(prompt, level) — string cleanup (existing)
  3. NEW: await sanitizationWorker.check(sanitizedPrompt)
     → if ONNX flags sensitive data AND level != 'full': throw with explanation
     → if confidence < 0.6: pass through with warning in log entry
     → if isSafe or level == 'full' (user acknowledged): continue
  4. Pre-send approval modal (existing)
  5. API call (existing)
```

The sanitization check should NOT block when the ONNX model is not yet loaded — degrade to `{ isSafe: true, confidence: 0 }` with a log entry flagging that the check was skipped.

### Privacy Proxy Update

`privacy-proxy.ts` evolves from a passthrough to an active gate:

```typescript
// src/ai/privacy-proxy.ts (MODIFIED)

export interface SanitizationResult {
  isSafe: boolean;
  confidence: number;
  flags: string[];  // e.g., ['email', 'phone', 'name']
  checkedAt: number;
}

// NEW: async check via embedding worker
export async function checkSanitization(
  text: string,
  worker: Worker,
): Promise<SanitizationResult>
```

### Python Training Pipeline

New script: `scripts/train/train-sanitizer.py`

Same pattern as `train-classifier.py` but binary labels:
- `scripts/training-data/sanitize-check.jsonl` — labeled examples
- `scripts/training-data/generate-sanitizer-data.py` — synthetic PII generation for training
- Exports to `public/models/classifiers/sanitize-check.onnx`

This is a separate training pipeline from the type classifier. The class file becomes `sanitize-check-classes.json` with `{"0": "safe", "1": "sensitive"}`.

### What Changes vs. What Stays

| Component | Status | Notes |
|-----------|--------|-------|
| `src/search/embedding-worker.ts` | MODIFIED | Add SANITIZE_CHECK handler, second ONNX session |
| `src/ai/privacy-proxy.ts` | MODIFIED | Add `checkSanitization()` async function |
| `src/ai/adapters/cloud.ts` | MODIFIED | Call sanitization check before approval modal |
| `scripts/train/` | NEW FILES | `train-sanitizer.py`, sanitizer data generation |
| `public/models/classifiers/` | NEW FILES | `sanitize-check.onnx`, `sanitize-check-classes.json` |
| Existing type classifier | UNCHANGED | Different ONNX session, no interference |

---

## Integration Point 3: Multi-Provider Cloud Adapter

### The Core Problem

`CloudAdapter` is hardcoded to Anthropic's SDK (`@anthropic-ai/sdk`). The `AIResponse.provider` type is `'noop' | 'browser' | 'cloud'` — "cloud" is singular. Adding OpenAI, Grok, and corporate LLMs requires either: (a) a new adapter per provider (duplicates all safety gates), or (b) a single `CloudAdapter` that delegates to a provider-specific implementation.

Option (b) is correct. The safety gates (key vault, session consent, pre-send approval, cloud request log) belong in ONE place — the `CloudAdapter`. Provider-specific implementations are thin request formatters.

### Provider Plugin Architecture

**File:** `src/ai/adapters/cloud-provider.ts` (NEW)

```typescript
// src/ai/adapters/cloud-provider.ts (NEW)

export interface CloudProvider {
  readonly id: 'anthropic' | 'openai' | 'grok' | 'corporate';
  readonly displayName: string;
  readonly defaultModel: string;

  /** Initialize with user-supplied API key */
  initialize(apiKey: string): void;

  /** Execute a pre-sanitized, pre-approved request */
  execute(
    sanitizedPrompt: string,
    maxTokens: number,
    onChunk?: (chunk: string) => void,
    signal?: AbortSignal,
  ): Promise<{ text: string; model: string }>;

  dispose(): void;
}
```

**File:** `src/ai/adapters/providers/anthropic-provider.ts` (extracted from `cloud.ts`)
**File:** `src/ai/adapters/providers/openai-provider.ts` (NEW)
**File:** `src/ai/adapters/providers/grok-provider.ts` (NEW)
**File:** `src/ai/adapters/providers/corporate-provider.ts` (NEW — custom base URL)

`CloudAdapter` becomes provider-agnostic:

```typescript
// src/ai/adapters/cloud.ts (REFACTORED — all safety gates stay here)

export class CloudAdapter implements AIAdapter {
  private provider: CloudProvider | null = null;

  setProvider(provider: CloudProvider): void {
    this.provider = provider;
    this.provider.initialize(getMemoryKey() ?? '');
    this._status = 'available';
  }

  async execute(request: AIRequest): Promise<AIResponse> {
    // ALL safety gates execute here, provider-agnostic:
    if (!isOnline()) throw ...;
    if (!hasSessionConsent()) throw ...;
    const sanitized = sanitizeForCloud(request.prompt, level);
    await checkSanitization(sanitized, embeddingWorker); // NEW
    // Pre-send approval modal
    const approved = await this.onPreSendApproval?.(logEntry);
    if (!approved) throw ...;
    // Delegate to provider (no safety logic in provider)
    const { text, model } = await this.provider!.execute(...);
    return { requestId: request.requestId, text, provider: 'cloud', model };
  }
}
```

### Provider Implementations

**OpenAI Provider:**
- Uses `openai` npm package with `dangerouslyAllowBrowser: true`
- Default model: `gpt-4o-mini` (cost-efficient, same use case as Haiku)
- Streaming via `client.chat.completions.create({ stream: true })`
- Same BYOK pattern as Anthropic

**Grok Provider:**
- Grok API is OpenAI-compatible — use the `openai` package with custom `baseURL: 'https://api.x.ai/v1'`
- No separate SDK needed: `new OpenAI({ apiKey, baseURL: 'https://api.x.ai/v1', dangerouslyAllowBrowser: true })`
- Default model: `grok-4` (current as of 2026-03)
- HIGH confidence (verified: xAI docs confirm OpenAI SDK compatibility with baseURL swap)

**Corporate LLM Provider:**
- Same pattern as Grok: OpenAI-compatible base URL, user-supplied endpoint
- Supports Ollama, LM Studio, vLLM, Azure OpenAI, any OpenAI-compatible endpoint
- User enters base URL + optional API key in settings
- No auth required for local Ollama deployments (key = empty string)

### CloudRequestLogEntry Update

Add `provider` field granularity to the log:

```typescript
export interface CloudRequestLogEntry {
  // ... existing fields ...
  provider: 'anthropic' | 'openai' | 'grok' | 'corporate'; // was just string
  providerDisplayName: string; // e.g., "OpenAI", "Grok (xAI)", "My Ollama"
}
```

### What Changes vs. What Stays

| Component | Status | Notes |
|-----------|--------|-------|
| `src/ai/adapters/cloud.ts` | REFACTORED | Becomes provider-agnostic shell; all safety gates stay |
| `src/ai/adapters/cloud-provider.ts` | NEW | Interface definition |
| `src/ai/adapters/providers/anthropic-provider.ts` | NEW (extracted) | Extracted from cloud.ts |
| `src/ai/adapters/providers/openai-provider.ts` | NEW | Uses `openai` npm package |
| `src/ai/adapters/providers/grok-provider.ts` | NEW | OpenAI SDK + `baseURL: 'https://api.x.ai/v1'` |
| `src/ai/adapters/providers/corporate-provider.ts` | NEW | OpenAI SDK + user-supplied baseURL |
| `src/ai/adapters/adapter.ts` | MODIFIED | `provider` field in AIResponse stays `'cloud'` — sub-provider tracked in model field |
| `src/ai/key-vault.ts` | MODIFIED | Multi-key storage: one slot per provider |
| AI Settings UI | MODIFIED | Provider selector + per-provider key entry |

### Key Vault Multi-Provider Extension

Currently `key-vault.ts` stores a single `binderos-ai-key`. Extend to per-provider slots:

```typescript
// key-vault.ts (MODIFIED)
const PROVIDER_KEY_PREFIX = 'binderos-ai-key-'; // e.g., binderos-ai-key-anthropic

export function setProviderKey(provider: CloudProviderId, key: string): void
export function getProviderKey(provider: CloudProviderId): string | null
export function clearProviderKey(provider: CloudProviderId): void
```

This is additive — existing `setMemoryKey()` / `getMemoryKey()` remain for backward compatibility during transition.

---

## Integration Point 4: Template Engine

### The Core Problem

Review briefings, compression explanations, and GTD flow prompts currently require LLM generation — even when the content is mostly boilerplate with a few slot-filled values (entropy score, atom count, section name). A template engine handles 80% of these cases deterministically, skipping Tier 3 entirely for structured content.

### Placement: Main Thread, Pure Functions

The template engine belongs in the main thread as pure functions, not in a worker. Rationale:

- Templates are string interpolation — trivially fast, no compute pressure
- Moving to a worker adds message-passing overhead for no benefit
- Template functions need access to current store state (entropy signals, atom counts) — easier from main thread
- Pure functions are testable, zero dependencies on workers

**Pattern:** No external template library is needed. The existing GTD prompt building in `triage.ts`, `compression.ts`, and `analysis.ts` already demonstrates the pattern. Formalize it.

**File:** `src/ai/templates/index.ts` (NEW directory)

```typescript
// src/ai/templates/types.ts (NEW)
export interface TemplateContext {
  atomCount?: number;
  staleCount?: number;
  inboxCount?: number;
  entropyLevel?: 'green' | 'yellow' | 'red';
  sectionName?: string;
  weekNumber?: number;
  topStaleAtom?: { title: string; staleness: number };
  // ... etc
}

export interface TemplateResult {
  text: string;
  source: 'template';
  templateId: string;
}
```

```typescript
// src/ai/templates/review-templates.ts (NEW)
export function weeklyReviewBriefing(ctx: TemplateContext): TemplateResult
export function getCleanBriefing(ctx: TemplateContext): TemplateResult
export function getCurrentBriefing(ctx: TemplateContext): TemplateResult
export function getCreativeBriefing(ctx: TemplateContext): TemplateResult
```

```typescript
// src/ai/templates/compression-templates.ts (NEW)
export function compressionExplanation(atom: AtomSummary, ctx: TemplateContext): TemplateResult
export function compressionCoachIntro(count: number, ctx: TemplateContext): TemplateResult
```

```typescript
// src/ai/templates/gtd-templates.ts (NEW)
export function inboxTriageBriefing(ctx: TemplateContext): TemplateResult
export function waitingFollowUpNudge(ctx: TemplateContext): TemplateResult
```

### Template Integration in the Tiered Pipeline

Templates add a Tier 0 concept — deterministic, no ML, no LLM:

```
Tier 0: Template engine (new for structured content)
  ↓ (if template not applicable for this task)
Tier 1: Deterministic heuristics (existing)
  ↓ (confidence < threshold)
Tier 2: ONNX classifiers (existing)
  ↓ (confidence < threshold)
Tier 3: LLM (existing)
```

Templates are not registered as `TierHandler` instances — they are called directly by the feature modules that know their content is template-eligible. The `AITaskType` system grows:

```typescript
// types.ts (MODIFIED)
export type AITaskType =
  | 'classify-type'
  | 'route-section'
  | 'extract-entities'
  | 'assess-staleness'
  | 'summarize'
  | 'analyze-gtd'
  | 'generate-review-briefing'  // NEW — template-eligible
  | 'generate-compression-explanation';  // NEW — template-eligible
```

For `generate-review-briefing` and `generate-compression-explanation`, `dispatchTiered()` checks for a template first before escalating. If a template covers the request, `TieredResult.tier` = 0 (or `1` with a `source: 'template'` annotation — implementation detail to decide during build).

### What Changes vs. What Stays

| Component | Status | Notes |
|-----------|--------|-------|
| `src/ai/templates/` | NEW directory | Pure function slot-fill templates |
| `src/ai/tier2/types.ts` | MODIFIED | Add template-eligible task types |
| `src/ai/triage.ts` | MODIFIED | Call templates before dispatchTiered when appropriate |
| `src/ai/compression.ts` | MODIFIED | Call templates for coaching intros |
| `src/ai/review-flow.ts` | MODIFIED | Call templates for briefing sections |
| `src/ai/analysis.ts` | MODIFIED | Minor wiring changes |
| `dispatchTiered()` | UNCHANGED | Template callers bypass it directly |

---

## Recommended File Structure (v4.0 Changes Only)

```
src/ai/
├── adapters/
│   ├── adapter.ts           # MODIFIED: WasmAdapter device field
│   ├── browser.ts           # UNCHANGED (WebLLM)
│   ├── cloud.ts             # REFACTORED (provider-agnostic shell)
│   ├── cloud-provider.ts    # NEW: CloudProvider interface
│   ├── device.ts            # NEW: DeviceAdapter (WebGPU vs WASM router)
│   ├── wasm.ts              # NEW: WlamaAdapter (wllama binding)
│   ├── noop.ts              # UNCHANGED
│   └── providers/
│       ├── anthropic-provider.ts   # NEW (extracted from cloud.ts)
│       ├── openai-provider.ts      # NEW
│       ├── grok-provider.ts        # NEW
│       └── corporate-provider.ts   # NEW
├── templates/
│   ├── index.ts             # NEW: re-exports all templates
│   ├── types.ts             # NEW: TemplateContext, TemplateResult
│   ├── review-templates.ts  # NEW: weekly review, get clear/current/creative
│   ├── compression-templates.ts  # NEW: compression coach text
│   └── gtd-templates.ts     # NEW: inbox triage, waiting nudges
├── tier2/
│   ├── types.ts             # MODIFIED: add template task types, Tier 0
│   ├── pipeline.ts          # UNCHANGED
│   ├── handler.ts           # UNCHANGED
│   ├── tier1-handler.ts     # UNCHANGED
│   ├── tier2-handler.ts     # MINOR: add new ONNX classifiers
│   ├── tier3-handler.ts     # UNCHANGED
│   ├── centroid-builder.ts  # UNCHANGED
│   └── index.ts             # UNCHANGED
├── router.ts                # UNCHANGED
├── privacy-proxy.ts         # MODIFIED: add checkSanitization()
├── key-vault.ts             # MODIFIED: multi-provider key slots
├── triage.ts                # MODIFIED: template integration
├── compression.ts           # MODIFIED: template integration
├── review-flow.ts           # MODIFIED: template integration
└── llm-worker.ts            # UNCHANGED (WebLLM worker entry point)

src/search/
└── embedding-worker.ts      # MODIFIED: add SANITIZE_CHECK, second ONNX session

public/
├── models/
│   └── classifiers/
│       ├── triage-type.onnx         # UNCHANGED
│       ├── triage-type-classes.json # UNCHANGED
│       ├── sanitize-check.onnx      # NEW
│       └── sanitize-check-classes.json  # NEW
└── wllama/
    └── single-thread/
        └── wllama.wasm             # NEW (copied from npm package)

scripts/train/
├── train-classifier.py     # UNCHANGED
├── train-sanitizer.py      # NEW
└── generate-sanitizer-data.py  # NEW
```

---

## Architectural Patterns

### Pattern 1: Adapter-Within-Adapter (DeviceAdapter)

**What:** The `DeviceAdapter` implements `AIAdapter` and delegates to either `BrowserAdapter` or `WasmAdapter`. The store and router never know which is active.

**When to use:** When two implementations of the same interface diverge only in capability detection, not in interface contract.

**Trade-offs:** Adds one layer of indirection. Worth it because it keeps all device-detection logic in one file and the rest of the codebase device-oblivious.

```typescript
// Store init (MODIFIED):
// Before v4.0: new BrowserAdapter(modelId)
// After v4.0:  new DeviceAdapter(modelId, wasmModelUrl)
```

### Pattern 2: Safety Gates in One Place (CloudAdapter)

**What:** All cloud safety gates (key check, online check, session consent, sanitization check, pre-send approval, request logging) live in `CloudAdapter.execute()`. Provider implementations (`AnthropicProvider`, `OpenAIProvider`, etc.) contain only request formatting and response parsing — zero safety logic.

**When to use:** Whenever security checks must apply uniformly across multiple implementations.

**Trade-offs:** `CloudAdapter` becomes longer. Acceptable because the length reflects actual safety requirements, not accidental complexity.

### Pattern 3: Template-First, LLM-Fallback

**What:** For tasks with predictable structure (review briefings, compression explanations), call a pure template function first. If it produces output, return immediately without touching the pipeline. Escalate to `dispatchTiered()` only for truly open-ended content.

**When to use:** When output structure is known in advance and only data values vary (counts, titles, scores).

**Trade-offs:** Templates produce less creative output than LLMs. The trade is acceptable: briefings and explanations are functional, not creative.

### Pattern 4: Single ONNX Session per Model (Embedding Worker)

**What:** The embedding worker maintains separate `ort.InferenceSession` instances for the type classifier and the sanitization classifier. Both run in the same worker thread, sequentially. The shared MiniLM embedding step feeds both.

**When to use:** When multiple ONNX models share the same input representation.

**Trade-offs:** Sequential execution means sanitization adds latency to cloud dispatch. This is acceptable because cloud dispatch already has user-visible approval wait time — a 100-200ms ONNX check is imperceptible.

---

## Data Flow

### New: Cloud Request with Sanitization Check

```
User approves cloud AI use in settings
    ↓
Feature module (e.g., review-flow.ts) builds prompt
    ↓
dispatchAI({ requestId, prompt })  [or dispatchTiered → Tier 3]
    ↓
CloudAdapter.execute(request)
    ├── Check API key, online, session consent (existing)
    ├── sanitizeForCloud(prompt, level)     (existing string cleanup)
    ├── checkSanitization(text, worker) [NEW] ← postMessage to embedding worker
    │       ↓ CLASSIFY_ONNX (reuse embedding) → sanitize-check.onnx → isSafe + flags
    │   if not safe AND level != 'full' → throw SanitizationBlockedError
    │   if confidence < 0.6 → log warning, continue
    ├── Pre-send approval modal (existing, shows sanitization flags if any)
    └── Provider.execute(sanitizedPrompt, ...) [NEW: delegates to active provider]
            ↓
        AnthropicProvider / OpenAIProvider / GrokProvider / CorporateProvider
```

### New: Device LLM Selection

```
Store initializes AI adapter
    ↓
DeviceAdapter.initialize()
    ├── await navigator.gpu?.requestAdapter()
    │   ├── WebGPU available → new BrowserAdapter(modelId) → initialize()
    │   └── WebGPU unavailable → new WasmAdapter(wasmModelUrl) → initialize()
    └── onStatusChange({ device: 'webgpu' | 'wasm-cpu', status: 'available' })
            ↓
        Store updates: aiDeviceType, llmStatus
        UI shows: "Local AI: WebGPU" or "Local AI: WASM (mobile mode)"
```

### New: Template-First Review Briefing

```
User starts Weekly Review
    ↓
review-flow.ts: buildWeeklyReviewBriefing(ctx)
    ├── ctx = { atomCount, staleCount, entropyLevel, weekNumber, ... }
    ├── result = weeklyReviewBriefing(ctx)  ← pure template function
    │       → returns structured briefing text immediately
    │   if result.text.length > 50:
    │       return result  (no LLM needed)
    │   else:
    │       dispatchTiered({ task: 'generate-review-briefing', features })
    └── render briefing in ConversationTurnCard
```

---

## Integration Boundaries

### What Tier 2 ONNX Expansion Adds

The question asked about sanitization classifier specifically, but v4.0 also adds:
- Section routing classifier (ONNX, not centroid)
- Compression candidate detector (ONNX binary: "compress now" vs "keep")
- Priority prediction (ONNX regression: importance score 0-1)

All three follow the same integration pattern as the sanitization classifier: new ONNX session in the embedding worker, new message type, new `TieredResult` field. They slot into the existing Tier 2 handler's `canHandle()` routing.

### External Service Boundaries

| Service | Integration | Auth | Notes |
|---------|-------------|------|-------|
| Anthropic API | `@anthropic-ai/sdk` via `AnthropicProvider` | BYOK, memory-only | Existing, extracted into provider |
| OpenAI API | `openai` npm, `dangerouslyAllowBrowser: true` | BYOK, memory-only | New provider |
| xAI Grok API | `openai` npm + `baseURL: 'https://api.x.ai/v1'` | BYOK, memory-only | OpenAI-compatible, verified |
| Corporate LLM | `openai` npm + user baseURL | Optional BYOK | Covers Ollama, LM Studio, Azure OpenAI |
| HuggingFace CDN | BLOCKED (`allowRemoteModels = false`) | None | No change — models bundled locally |

### Internal Module Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Main thread ↔ Embedding Worker | `postMessage` / `onmessage` typed protocol | Add SANITIZE_CHECK/RESULT messages |
| Main thread ↔ LLM Worker (WebLLM) | `CreateWebWorkerMLCEngine` RPC | Unchanged |
| Main thread ↔ WasmAdapter | Wllama internal worker (transparent) | Wllama manages its own worker |
| CloudAdapter ↔ CloudProvider | Direct method call (same thread) | Provider is injected, not async |
| DeviceAdapter ↔ BrowserAdapter/WasmAdapter | Direct method delegation | Thin wrapper |
| Template functions ↔ Store | Store state passed as `TemplateContext` arg | No direct store import in templates |

---

## Anti-Patterns

### Anti-Pattern 1: Safety Gates in Provider Implementations

**What people do:** Put API key checks, consent verification, and request logging inside each cloud provider.

**Why it's wrong:** Safety gates must apply uniformly. Duplicate code drifts. One provider forgets a check. Cloud data leaks.

**Do this instead:** All gates live in `CloudAdapter.execute()`. Providers only format requests and parse responses.

### Anti-Pattern 2: Multi-Threaded Wllama

**What people do:** Enable wllama multi-thread for better performance on mobile, requiring COEP/COOP headers.

**Why it's wrong:** COEP breaks cross-origin resources (fonts, analytics, CDN scripts). On GitHub Pages and most static hosts, COOP/COEP headers are not configurable without a service worker hack. Single-thread is slower but universally compatible.

**Do this instead:** Use `single-thread/wllama.wasm` only. Set `n_threads: 1`. Accept the performance tradeoff — WASM path is a mobile fallback, not a primary path.

### Anti-Pattern 3: Template Engine in a Worker

**What people do:** Move template rendering to a web worker to avoid main thread work.

**Why it's wrong:** Templates are string interpolation — microseconds on main thread. Worker overhead (message serialization, deserialization, worker startup) costs more than the template execution itself.

**Do this instead:** Pure functions on main thread. If a "template" becomes complex enough to need a worker, it's no longer a template — escalate to the LLM tier.

### Anti-Pattern 4: Sanitization as a Complete Blocker

**What people do:** Refuse to send ANY content that the sanitization classifier flags, treating it as a hard block.

**Why it's wrong:** Binary ONNX classifiers have false positives. Blocking legitimate content (e.g., a task about "calling my doctor" is not PII) destroys trust in the system. The user is the privacy arbiter, not the classifier.

**Do this instead:** Classifier flags surface as a warning in the pre-send approval modal ("This content may contain personal information. Review before sending."). User can proceed or cancel. Only when `level = 'abstract'` and sensitivity is detected should the system auto-block.

---

## Build Order Implications

Based on dependencies between the four integration points:

**Phase 1 — Template Engine** (no dependencies on other new components)
- New file, no modified interfaces
- Immediately reduces LLM calls for review briefings
- Can be built and tested independently

**Phase 2 — Multi-Provider Cloud** (depends only on existing CloudAdapter interface)
- Refactor CloudAdapter before adding sanitization (avoids doing the refactor twice)
- Provider extraction (Anthropic) → add OpenAI → add Grok → add Corporate
- Key vault multi-slot extension is a parallel sub-task

**Phase 3 — Sanitization Classifier** (depends on multi-provider CloudAdapter refactor being done first)
- Add SANITIZE_CHECK messages to embedding worker
- Update privacy-proxy.ts with async check
- Wire into CloudAdapter.execute() (after Phase 2 refactor)
- Python training pipeline (can run in parallel with code work)

**Phase 4 — Device-Adaptive Local LLM** (depends only on existing BrowserAdapter interface)
- WasmAdapter and DeviceAdapter can be built independently
- WASM binary serving via Vite public dir is the main setup task
- Model download and caching follows same Cache API pattern as ONNX classifier

**Tier 2 ONNX Expansion** (section routing, compression detection, priority prediction) fits after Phase 3 because:
- Embedding worker already modified for sanitization
- Training pipeline already extended
- Adding more ONNX sessions follows the same pattern

---

## Scaling Considerations

This is a local-first PWA — traditional scaling (users, servers) does not apply. The relevant scale dimension is device capability diversity.

| Device Profile | Expected Behavior | Risk |
|----------------|-------------------|------|
| Modern desktop (WebGPU) | WebLLM + all ONNX classifiers + cloud | None — optimal path |
| Modern mobile (no WebGPU) | WasmAdapter (SmolLM2 Q4) + ONNX + no cloud | SmolLM2 quality lower than Llama 3B |
| Low-RAM mobile (<3GB) | ONNX + templates only (WasmAdapter OOM risk) | Need RAM detection before loading WASM model |
| Offline any device | Templates + ONNX + local LLM (if loaded) | Cloud features gracefully disabled |
| Corporate (custom endpoint) | Corporate provider + ONNX + templates | Endpoint auth varies; user-configured |

**RAM detection for WasmAdapter:** Before loading the WASM model, check `navigator.deviceMemory` (available in Chrome/Edge on Android). If `< 4`, skip WasmAdapter initialization and use templates + Tier 2 only. Degrade gracefully rather than OOM-crash.

---

## Sources

- WebLLM / MLC-AI: [GitHub](https://github.com/mlc-ai/web-llm), [Docs](https://webllm.mlc.ai/docs/)
- Wllama (llama.cpp WASM binding): [GitHub](https://github.com/ngxson/wllama), [npm @wllama/wllama](https://app.unpkg.com/@wllama/wllama@1.16.2/files/README.md)
- OpenAI Node SDK browser support: [github.com/openai/openai-node](https://github.com/openai/openai-node)
- xAI Grok API / OpenAI compatibility: [docs.x.ai/developers/quickstart](https://docs.x.ai/developers/quickstart)
- COEP/COOP for SharedArrayBuffer: [web.dev/articles/coop-coep](https://web.dev/articles/coop-coep)
- Vite COEP/COOP plugin: [github.com/chaosprint/vite-plugin-cross-origin-isolation](https://github.com/chaosprint/vite-plugin-cross-origin-isolation)
- WebGPU browser support 2025: [caniuse.com/webgpu](https://caniuse.com/webgpu)
- sklearn-onnx for classifier export: [onnx.ai/sklearn-onnx](https://onnx.ai/sklearn-onnx/)
- ONNX local PII detection patterns: [Medium: local-first reversible PII scrubber](https://medium.com/@tj.ruesch/a-local-first-reversible-pii-scrubber-for-ai-workflows-using-onnx-and-regex-e9850a7531fc)

---

*Architecture research for: BinderOS v4.0 Device-Adaptive AI*
*Researched: 2026-03-05*
