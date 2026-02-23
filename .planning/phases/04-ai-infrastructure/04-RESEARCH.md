# Phase 4: AI Infrastructure - Research

**Researched:** 2026-02-22
**Domain:** Browser LLM inference (Transformers.js + WebGPU), Cloud API streaming (Anthropic SDK), Web Crypto API key encryption, browser model caching, SolidJS store extension, Web Worker architecture
**Confidence:** HIGH (stack verified through official docs and project code inspection)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Settings UX**
- AI settings accessible via Ctrl+P command palette — opens a settings panel/overlay
- Per-feature toggles: separate toggles for Browser LLM, Cloud API, Triage suggestions, Review analysis, Compression coach
- Guided setup on first v2.0 launch: step-by-step wizard walks through enabling AI, model download, cloud API key entry
- Status bar shows activity indicator: "Analyzing inbox...", "Preparing review...", "Idle". Model details on hover/click
- Simple labels for normal use ("Local AI: Ready") with expandable model details for power users

**Model Download**
- Model downloads during guided setup — first-run wizard offers download with progress indicator
- AI features blocked until model is ready — clear message: "Downloading AI model (45%)..."
- Simple choice: two options — "Fast (150MB)" and "Quality (300MB)" — recommended option highlighted based on hardware detection
- Cache API for model storage (automatic, not user-managed). Uses navigator.storage.persist() to prevent eviction

**Security Model — Privacy Proxy Architecture**
- CRITICAL DECISION: Multi-model with privacy boundary
  - Local LLMs have direct access to atoms (trusted, on-device)
  - Cloud/remote LLMs NEVER see raw atom data
  - Local LLM acts as privacy proxy — summarizes/anonymizes data before sending to cloud
  - Cloud models communicate through the local LLM, not directly with the atom store
- User-controlled sanitization levels: from "abstract patterns only" (counts, types, scores) to "structured summaries" (metadata without content) to "full context" (titles and content). Default is most private.
- API keys encrypted locally: Web Crypto AES-GCM encryption in localStorage with user passphrase. Persists across sessions.
- Per-session consent: each new session that uses cloud API shows brief reminder: "Cloud AI will be used via local proxy. [Continue / Disable]"
- Full transparency on cloud requests: every cloud request shows a preview of what the local LLM is sending. User can see exactly what data leaves the device and can cancel before sending.
- Communication log accessible in settings for review.
- Graceful degradation without cloud key: features work with browser LLM only at lower quality. Subtle hint: "Cloud API would improve this."

**Provider Tiers**
- Multi-provider support: user can configure multiple cloud providers (Anthropic, Ollama, LM Studio, etc.)
- System routes to best available provider
- Auto-upgrade on GPU detection: if WebGPU available, automatically use larger/faster model. User sees "GPU detected — using enhanced model."
- Status bar shows activity indicator with current model engagement
- Provider adapter interface designed for extensibility from day one

### Claude's Discretion
- Exact adapter interface design and message routing
- No-op adapter implementation details
- WebGPU feature detection implementation
- Store extension field naming and structure
- Guided setup wizard step ordering and visual design

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AINF-01 | Pluggable AI adapter interface with provider routing (no-op, browser LLM, cloud API) | Adapter pattern section; discriminated union message types; no-op adapter code example |
| AINF-02 | Dedicated LLM worker running SmolLM2 via Transformers.js, isolated from BinderCore worker | Transformers.js pipeline API in Web Worker; separate worker file pattern; project worker bridge architecture |
| AINF-03 | WebGPU-tiered model selection — larger/faster models on GPU-capable machines, CPU fallback with smaller model | `env.IS_WEBGPU_AVAILABLE`, `navigator.gpu.requestAdapter()`, device: 'webgpu' vs WASM; SmolLM2 size tiers |
| AINF-04 | Cloud API integration layer with Anthropic CORS support and streaming via fetch-event-stream | Anthropic SDK `dangerouslyAllowBrowser`, `client.messages.stream()`, SSE event protocol |
| AINF-05 | AI provider status (available/unavailable/loading/error/disabled) surfaced in store and UI | Store extension pattern (following Phase 2/3 precedents); SolidJS createMemo for derived status |
| AINF-06 | Graceful offline degradation — browser LLM works offline; cloud features show friendly unavailable message | `navigator.onLine` + online/offline events; Transformers.js runs fully offline after model cached |
| AIST-01 | Explicit opt-in/opt-out for all AI features; cloud API requires separate consent | Per-feature toggle pattern in settings panel; consent gate before cloud use |
| AIST-02 | API key stored in memory only by default; encrypted persistence optional with security disclosure | Web Crypto AES-GCM + PBKDF2 pattern; localStorage for encrypted bytes only |
| AIST-03 | Destructive AI actions (delete, archive, overwrite content) always require explicit user approval | Confirmation modal pattern; AI mutation tagging in changelog |
| AIST-04 | AI never runs autonomously on a schedule — all analysis triggered by user action or app launch | Worker message dispatch is always user/app-initiated; no setInterval for AI calls |
</phase_requirements>

---

## Summary

Phase 4 builds the entire AI backbone before any user-facing AI features. The core technical challenge is three parallel systems that must interlock: (1) a dedicated LLM Web Worker running SmolLM2 via Transformers.js with WebGPU acceleration, (2) a cloud API adapter using the Anthropic TypeScript SDK with browser CORS support and streaming, and (3) a pluggable adapter interface that lets the rest of the system dispatch AI commands without knowing which backend handles them. All three are verified end-to-end through a no-op adapter round-trip before real AI is connected.

The project already has the pattern for this: the existing `worker.ts` + `bridge.ts` + `messages.ts` + `store.ts` architecture defines exactly how to add a second worker and extend the store. Phase 4 repeats that pattern for the LLM worker: a new `llm-worker.ts`, a new `llm-bridge.ts`, new AI message types added to a separate type file, and new AI state fields added to `BinderState`. The no-op adapter is the first target — it satisfies success criterion 3 (full round-trip verified) without requiring any real model download.

The security model is architecturally significant: cloud LLMs never receive raw atom data. The local LLM is the only entity that reads the atom store directly; it sanitizes before any cloud call. This "privacy proxy" pattern must be enforced at the adapter interface level — the cloud adapter only accepts pre-sanitized strings, never atom objects. Web Crypto AES-GCM handles optional API key persistence, and the Cache API (already confirmed as Transformers.js default) handles model storage with `navigator.storage.persist()` for eviction protection.

**Primary recommendation:** Build in three sequential plans — (1) message protocol + store extension + no-op adapter, (2) LLM worker + browser adapter + WebGPU detection, (3) cloud adapter + key management + settings UI. This matches the phase's declared plan structure and lets each plan ship independently.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@huggingface/transformers` | ^3.8.1 (already installed) | SmolLM2 inference in browser via ONNX Runtime | Official HuggingFace browser ML library; pipeline API matches Python transformers |
| `@anthropic-ai/sdk` | latest (~0.61+) | Anthropic cloud API with streaming + browser CORS | Official SDK; `dangerouslyAllowBrowser` enables direct browser calls; built-in SSE stream helpers |
| Web Crypto API | Browser built-in | AES-GCM encryption for optional API key persistence | No library needed; `crypto.subtle` available in all modern browsers and Web Workers |
| Cache API | Browser built-in | Model weight storage (Transformers.js default backend) | Transformers.js uses it automatically via `env.useBrowserCache = true` (default) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| SolidJS `createMemo` | already in use | Derive AI status signals from store state | For `aiProviderStatus`, `llmReady`, `cloudAvailable` derived signals |
| SolidJS `createStore` / `reconcile` | already in use | Extend `BinderState` with AI fields | Follow existing Phase 2/3 pattern exactly |
| `navigator.storage.persist()` | Browser built-in | Request persistent storage to prevent model eviction | Call during first-run setup; check result to warn user if denied |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@huggingface/transformers` | WebLLM / mlc-ai | WebLLM has better WebGPU perf for large models but requires MLC compilation toolchain; transformers.js is already installed and uses ONNX which has broader model support |
| Anthropic SDK | Raw fetch + SSE parser | SDK handles connection management, error recovery, streaming accumulation; raw fetch saves a dependency but replicates existing logic |
| Web Crypto API | `crypto-js` library | Web Crypto is native, always available in workers, no dependency; crypto-js is legacy synchronous |
| Cache API | IndexedDB / OPFS for models | Chrome team explicitly recommends Cache API for AI model storage; IndexedDB serializes data (worst for large binaries); OPFS is better than IndexedDB but Cache API has simpler API and transformers.js uses it natively |

**Installation:**
```bash
pnpm add @anthropic-ai/sdk
# @huggingface/transformers already installed at ^3.8.1
```

---

## Architecture Patterns

### Recommended Project Structure

The LLM worker follows the exact same pattern as the existing BinderCore worker:

```
src/
├── worker/
│   ├── worker.ts           # existing BinderCore worker (DO NOT MODIFY)
│   ├── bridge.ts           # existing BinderCore bridge (DO NOT MODIFY)
│   ├── llm-worker.ts       # NEW: dedicated LLM inference worker
│   └── llm-bridge.ts       # NEW: main-thread bridge for LLM worker
├── ai/
│   ├── adapters/
│   │   ├── adapter.ts      # AIAdapter interface + AIRequest/AIResponse types
│   │   ├── noop.ts         # NoOpAdapter (returns fixed response, no model needed)
│   │   ├── browser.ts      # BrowserAdapter (routes to LLM worker via llm-bridge)
│   │   └── cloud.ts        # CloudAdapter (Anthropic SDK, privacy-proxy enforced)
│   ├── privacy-proxy.ts    # Sanitizes atom data before any cloud call
│   └── router.ts           # Selects active adapter based on store state
├── types/
│   ├── messages.ts         # existing (extend with AI command types)
│   └── ai-messages.ts      # NEW: LLM worker message protocol
└── ui/
    ├── signals/
    │   └── store.ts        # extend BinderState with AI fields
    └── components/
        └── AISettingsPanel.tsx  # NEW: settings panel opened from CommandPalette
```

### Pattern 1: LLM Worker Message Protocol

The LLM worker uses a separate typed protocol (same pattern as `types/messages.ts`). The main thread sends `LLMCommand`, the worker responds with `LLMResponse`.

```typescript
// src/types/ai-messages.ts
// Source: mirrors existing src/types/messages.ts pattern

export type LLMCommand =
  | { type: 'LLM_INIT' }
  | { type: 'LLM_REQUEST'; payload: { requestId: string; prompt: string; maxTokens?: number } }
  | { type: 'LLM_ABORT'; payload: { requestId: string } };

export type LLMResponse =
  | { type: 'LLM_READY'; payload: { modelId: string; device: 'webgpu' | 'wasm'; tier: 'fast' | 'quality' } }
  | { type: 'LLM_PROGRESS'; payload: { requestId: string; chunk: string } }
  | { type: 'LLM_COMPLETE'; payload: { requestId: string; text: string } }
  | { type: 'LLM_STATUS'; payload: { status: AIProviderStatus; modelId?: string; device?: string } }
  | { type: 'LLM_ERROR'; payload: { requestId?: string; message: string } }
  | { type: 'LLM_DOWNLOAD_PROGRESS'; payload: { progress: number; loaded: number; total: number } };
```

### Pattern 2: Pluggable Adapter Interface

```typescript
// src/ai/adapters/adapter.ts
// Source: standard discriminated union adapter pattern

export type AIProviderStatus = 'disabled' | 'loading' | 'available' | 'error' | 'unavailable';

export interface AIRequest {
  requestId: string;
  prompt: string;           // ALWAYS pre-sanitized string — never raw atom data
  maxTokens?: number;
  onChunk?: (chunk: string) => void;
  signal?: AbortSignal;
}

export interface AIResponse {
  requestId: string;
  text: string;
  provider: 'noop' | 'browser' | 'cloud';
  model?: string;
}

export interface AIAdapter {
  readonly id: 'noop' | 'browser' | 'cloud';
  readonly status: AIProviderStatus;
  execute(request: AIRequest): Promise<AIResponse>;
  dispose(): void;
}
```

### Pattern 3: Store Extension (follows Phase 2/3 pattern exactly)

```typescript
// Extend BinderState in src/ui/signals/store.ts
// Source: existing Phase 2 (scores/entropyScore) and Phase 3 (savedFilters) extension pattern

export interface BinderState {
  // ... existing fields unchanged ...

  // Phase 4: AI infrastructure
  aiEnabled: boolean;                          // master AI toggle
  browserLLMEnabled: boolean;                  // browser LLM feature toggle
  cloudAPIEnabled: boolean;                    // cloud API feature toggle
  llmStatus: AIProviderStatus;                 // 'disabled' | 'loading' | 'available' | 'error'
  cloudStatus: AIProviderStatus;               // status of configured cloud provider
  llmModelId: string | null;                   // active model ID when ready
  llmDevice: 'webgpu' | 'wasm' | null;        // active compute backend
  llmDownloadProgress: number | null;          // 0-100 during download, null otherwise
  aiActivity: string | null;                   // "Analyzing inbox..." | null
  aiFirstRunComplete: boolean;                 // whether guided setup was completed
}
```

### Pattern 4: WebGPU Detection

```typescript
// src/worker/llm-worker.ts
// Source: Transformers.js env API + navigator.gpu MDN docs

import { env } from '@huggingface/transformers';

// Transformers.js exposes IS_WEBGPU_AVAILABLE as a detection flag
// Also do explicit adapter request to confirm GPU is actually usable
async function detectDevice(): Promise<'webgpu' | 'wasm'> {
  if (!env.apis.IS_WEBGPU_AVAILABLE) return 'wasm';
  try {
    // requestAdapter can return null even if navigator.gpu exists (GPU blocked/unavailable)
    const adapter = await navigator.gpu.requestAdapter();
    return adapter ? 'webgpu' : 'wasm';
  } catch {
    return 'wasm';
  }
}

// Model selection based on device tier
const MODEL_TIERS = {
  webgpu: 'HuggingFaceTB/SmolLM2-360M-Instruct',  // ~150MB q8 — "Quality"
  wasm:   'HuggingFaceTB/SmolLM2-135M-Instruct',   // ~70MB q8 — "Fast"
} as const;
```

### Pattern 5: Anthropic Cloud Adapter (browser-safe)

```typescript
// src/ai/adapters/cloud.ts
// Source: Anthropic SDK docs + dangerouslyAllowBrowser pattern

import Anthropic from '@anthropic-ai/sdk';

export class CloudAdapter implements AIAdapter {
  readonly id = 'cloud' as const;
  private client: Anthropic | null = null;

  initialize(apiKey: string): void {
    this.client = new Anthropic({
      apiKey,
      dangerouslyAllowBrowser: true,  // required for direct browser calls
    });
  }

  async execute(request: AIRequest): Promise<AIResponse> {
    if (!this.client) throw new Error('Cloud adapter not initialized');
    // prompt is ALWAYS pre-sanitized by privacy-proxy — never raw atom data
    const stream = this.client.messages.stream({
      model: 'claude-haiku-4-5',  // cost-efficient for routing/classification
      max_tokens: request.maxTokens ?? 512,
      messages: [{ role: 'user', content: request.prompt }],
    });

    stream.on('text', (text) => request.onChunk?.(text));
    if (request.signal) {
      request.signal.addEventListener('abort', () => stream.abort());
    }

    const message = await stream.finalMessage();
    return {
      requestId: request.requestId,
      text: message.content[0].type === 'text' ? message.content[0].text : '',
      provider: 'cloud',
      model: 'claude-haiku-4-5',
    };
  }
}
```

### Pattern 6: Web Crypto API Key Encryption

```typescript
// src/ai/key-vault.ts
// Source: Web Crypto API MDN + AES-GCM pattern

// Memory-only by default. Encrypted persistence is opt-in.
let memoryKey: string | null = null;

export async function encryptAndStore(apiKey: string, passphrase: string): Promise<void> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Derive encryption key from user passphrase via PBKDF2
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']
  );
  const encKey = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    encKey,
    encoder.encode(apiKey)
  );

  // Store only encrypted bytes + salt + iv in localStorage (never plaintext)
  const payload = { salt: btoa(String.fromCharCode(...salt)), iv: btoa(String.fromCharCode(...iv)), data: btoa(String.fromCharCode(...new Uint8Array(ciphertext))) };
  localStorage.setItem('binderos-ai-key', JSON.stringify(payload));
}

export function setMemoryKey(apiKey: string): void {
  memoryKey = apiKey;  // memory-only default — cleared on page unload
}

export function getMemoryKey(): string | null {
  return memoryKey;
}
```

### Anti-Patterns to Avoid

- **Sharing the BinderCore worker for LLM inference:** Inference blocks the event loop. WASM model execution and atom mutations must be in separate workers.
- **Passing raw Atom objects to cloud adapters:** Cloud adapters must only receive pre-sanitized strings from `privacy-proxy.ts`. Enforce this at the type level (cloud adapter `execute()` accepts `AIRequest` with `prompt: string`, not atoms).
- **Calling `navigator.gpu` directly in the main thread:** WebGPU detection should happen in the LLM worker where inference will actually run. Detection in the main thread doesn't guarantee the worker can use GPU.
- **Storing API keys in plaintext in localStorage:** Memory-only is the default. Encrypted persistence requires explicit user opt-in and a passphrase. Never write plaintext to localStorage.
- **Importing Transformers.js in the main thread:** Transformers.js + ONNX Runtime is heavy. It belongs exclusively in `llm-worker.ts`.
- **Scheduling AI on timers (setInterval):** AIST-04 requires all AI analysis to be user-triggered. No autonomous scheduling.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Browser LLM inference | Custom WASM ML runtime | `@huggingface/transformers` pipeline API | ONNX Runtime handles quantization, WebGPU backend, tokenization, autoregressive decoding; thousands of edge cases |
| SSE streaming from Anthropic | Manual `fetch` + SSE parser | `@anthropic-ai/sdk` `.stream()` | SDK handles reconnection, accumulation, abort, error recovery; SSE has non-obvious edge cases |
| Model weight caching | IndexedDB binary storage | Cache API (transformers.js default: `env.useBrowserCache = true`) | Chrome team recommendation; transformers.js already uses it; no code needed |
| AES-GCM encryption | Custom crypto | Web Crypto `crypto.subtle` | Built-in, no dependency, available in workers, FIPS-validated |
| WebGPU capability check | GPU benchmark | `navigator.gpu.requestAdapter()` | requestAdapter returns null when GPU is unavailable/blocked, which is the exact check needed |

**Key insight:** Transformers.js handles model download progress, caching, quantization selection, and device routing. The only work needed is: (1) wrap it in a Web Worker, (2) post progress messages to the main thread, (3) dispatch `pipeline()` calls with the right device.

---

## Common Pitfalls

### Pitfall 1: WebGPU in Web Workers vs Service Workers
**What goes wrong:** Service Worker does not have WebGPU access (historically); regular DedicatedWorker does.
**Why it happens:** WebGPU spec exposed to DedicatedWorker first; ServiceWorker support came later (Chrome 124+).
**How to avoid:** Use a DedicatedWorker (the same pattern as the existing `worker.ts`), not a ServiceWorker, for the LLM worker. The existing Vite worker pattern (`new Worker(url, { type: 'module' })`) is correct.
**Warning signs:** `navigator.gpu is undefined` inside the worker.

### Pitfall 2: Transformers.js model download and browser cache in development
**What goes wrong:** During development (localhost), Cache API may not persist across reloads as expected; `navigator.storage.persist()` is usually denied on localhost.
**Why it happens:** Browser treats localhost as a non-persistent origin by default.
**How to avoid:** Accept that dev mode redownloads on each full page reload; focus persistence testing on production build. Add a flag so download progress UI doesn't block development.
**Warning signs:** Download starts from 0% every reload in dev.

### Pitfall 3: Vite bundling of LLM worker with ONNX Runtime
**What goes wrong:** Vite may try to bundle ONNX Runtime WASM files inline, breaking the worker.
**Why it happens:** ONNX Runtime uses dynamic imports to load `.wasm` binaries; bundlers can break these paths.
**How to avoid:** Use the `?worker` import pattern Vite supports, and configure `vite.config.ts` to handle `worker.format: 'es'`. The existing project uses `vite-plugin-wasm` and `vite-plugin-top-level-await` which already handle this for the BinderCore worker — verify the LLM worker works with the same config before adding new plugins.
**Warning signs:** `Failed to fetch dynamically imported module` or missing `.wasm` file errors in console.

### Pitfall 4: Cross-Origin Isolation Required for SharedArrayBuffer
**What goes wrong:** Transformers.js WASM backend may require `SharedArrayBuffer` which requires `crossOriginIsolated = true`.
**Why it happens:** Chrome restricts `SharedArrayBuffer` to cross-origin isolated contexts for security (Spectre mitigation).
**How to avoid:** Add COOP/COEP headers to the Vite dev server and production build. In `vite.config.ts`, add server headers: `Cross-Origin-Embedder-Policy: require-corp` and `Cross-Origin-Opener-Policy: same-origin`. The `vite-plugin-cross-origin-isolation` package handles this for dev.
**Warning signs:** `SharedArrayBuffer is not defined` or `document is not cross-origin isolated` errors.

### Pitfall 5: The `dangerouslyAllowBrowser` security disclosure pattern
**What goes wrong:** Anthropic SDK throws an error if `dangerouslyAllowBrowser` is not set when running in a browser context.
**Why it happens:** SDK detects browser environment and refuses to run to protect against accidental API key exposure.
**How to avoid:** Set `dangerouslyAllowBrowser: true` explicitly in the `CloudAdapter` constructor, and document in code why this is safe (user-provided key, memory-only by default, not embedded in source).
**Warning signs:** Runtime error: `It looks like you're running in a browser-like environment`.

### Pitfall 6: API key in memory is cleared on page refresh
**What goes wrong:** User enters API key, navigates to a different page or refreshes — key is gone.
**Why it happens:** Memory-only storage is intentional per AIST-02, but users expect keys to persist.
**How to avoid:** The UI must clearly communicate: "Your API key is stored in memory only and will be cleared when you close the app. Enable encrypted persistence to save it." Don't hide this — it's a feature, not a bug. The guided setup should surface this choice explicitly.
**Warning signs:** User confusion, repeated key entry prompts.

### Pitfall 7: SmolLM2 ONNX model ID format for Transformers.js
**What goes wrong:** Using the base model ID fails because ONNX quantized variants live at different HuggingFace Hub paths.
**Why it happens:** Transformers.js uses ONNX-converted model variants, not the base PyTorch weights.
**How to avoid:** Use the correct Hub IDs:
  - Fast (CPU/WASM): `HuggingFaceTB/SmolLM2-135M-Instruct` with `dtype: 'q8'`
  - Quality (WebGPU): `HuggingFaceTB/SmolLM2-360M-Instruct` with `dtype: 'fp16'` or `'q8'`

Note: The CONTEXT.md mentions "Fast (150MB)" and "Quality (300MB)". Actual sizes: SmolLM2-135M q8 ≈ 70-90MB, SmolLM2-360M q8 ≈ 200-250MB. The user-facing labels should reflect actual downloaded sizes — verify at implementation time.
**Warning signs:** 404 errors fetching model files, or `Model class ... not supported` errors.

---

## Code Examples

Verified patterns from official sources:

### Transformers.js pipeline in Web Worker with WebGPU

```typescript
// src/worker/llm-worker.ts
// Source: https://huggingface.co/docs/transformers.js (official docs)
import { pipeline, env } from '@huggingface/transformers';

// Disable local model loading in browser — use remote Hub models only
env.allowLocalModels = false;

let generator: Awaited<ReturnType<typeof pipeline>> | null = null;

async function initModel(modelId: string, device: 'webgpu' | 'wasm') {
  generator = await pipeline('text-generation', modelId, {
    device,
    dtype: device === 'webgpu' ? 'fp16' : 'q8',
    progress_callback: (progress: { progress?: number; loaded?: number; total?: number }) => {
      self.postMessage({
        type: 'LLM_DOWNLOAD_PROGRESS',
        payload: {
          progress: Math.round(progress.progress ?? 0),
          loaded: progress.loaded ?? 0,
          total: progress.total ?? 0,
        },
      });
    },
  });
}

self.onmessage = async (event: MessageEvent) => {
  const msg = event.data;
  if (msg.type === 'LLM_INIT') {
    const device = await detectDevice();
    const modelId = MODEL_TIERS[device];
    await initModel(modelId, device);
    self.postMessage({ type: 'LLM_READY', payload: { modelId, device, tier: device === 'webgpu' ? 'quality' : 'fast' } });
  }
  // ... handle LLM_REQUEST
};
```

### Anthropic streaming in browser

```typescript
// src/ai/adapters/cloud.ts
// Source: https://platform.claude.com/docs/en/api/messages-streaming
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: getMemoryKey()!,
  dangerouslyAllowBrowser: true,
});

// Stream with event handler (non-blocking)
const stream = client.messages.stream({
  model: 'claude-haiku-4-5',
  max_tokens: 512,
  messages: [{ role: 'user', content: sanitizedPrompt }],
});

stream.on('text', (text) => {
  // text arrives chunk by chunk as content_block_delta events
  onChunk(text);
});

const finalMessage = await stream.finalMessage();
// finalMessage.content[0].text has the complete response
```

### Extend BinderState with AI fields (following Phase 2/3 pattern)

```typescript
// src/ui/signals/store.ts — extend BinderState
// Source: existing store.ts (Phase 2 and 3 extension pattern)

export interface BinderState {
  // ... all existing fields unchanged ...

  // Phase 4: AI infrastructure state
  aiEnabled: boolean;
  browserLLMEnabled: boolean;
  cloudAPIEnabled: boolean;
  llmStatus: 'disabled' | 'loading' | 'available' | 'error' | 'unavailable';
  cloudStatus: 'disabled' | 'loading' | 'available' | 'error' | 'unavailable';
  llmModelId: string | null;
  llmDevice: 'webgpu' | 'wasm' | null;
  llmDownloadProgress: number | null;   // 0-100 during download, null when idle
  aiActivity: string | null;             // "Analyzing inbox..." text for status bar
  aiFirstRunComplete: boolean;           // false triggers guided setup wizard
}

// In initialState, add:
// aiEnabled: false,  (false until user enables via guided setup)
// browserLLMEnabled: false,
// cloudAPIEnabled: false,
// llmStatus: 'disabled',
// cloudStatus: 'disabled',
// llmModelId: null,
// llmDevice: null,
// llmDownloadProgress: null,
// aiActivity: null,
// aiFirstRunComplete: false,

// Derived signals
export const llmReady = createMemo(() => state.llmStatus === 'available');
export const cloudReady = createMemo(() => state.cloudStatus === 'available');
export const anyAIAvailable = createMemo(() => llmReady() || cloudReady());
```

### No-op adapter (the first target)

```typescript
// src/ai/adapters/noop.ts
// Source: Claude's discretion — simplest valid implementation

export class NoOpAdapter implements AIAdapter {
  readonly id = 'noop' as const;
  readonly status: AIProviderStatus = 'available';

  async execute(request: AIRequest): Promise<AIResponse> {
    // Simulate a tiny delay to test async round-trip
    await new Promise(resolve => setTimeout(resolve, 50));
    request.onChunk?.('[no-op response]');
    return {
      requestId: request.requestId,
      text: '[no-op response]',
      provider: 'noop',
    };
  }

  dispose(): void {}
}
```

### WebGPU detection (correct approach)

```typescript
// Correct: detect in the LLM worker, not the main thread
// Source: navigator.gpu MDN + transformers.js env API
// Note: TypeScript needs `@webgpu/types` or `/// <reference types="@webgpu/types" />`

async function detectDevice(): Promise<'webgpu' | 'wasm'> {
  // env.apis.IS_WEBGPU_AVAILABLE is set by transformers.js at load time
  if (!env.apis.IS_WEBGPU_AVAILABLE) return 'wasm';
  try {
    const adapter = await navigator.gpu.requestAdapter();
    // requestAdapter returns null when GPU is unavailable or blocked
    return adapter !== null ? 'webgpu' : 'wasm';
  } catch {
    return 'wasm';
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Xenova/transformers (community fork) | `@huggingface/transformers` (official) | v3.0 (2024) | Use the official package — already installed in this project at ^3.8.1 |
| WASM-only browser inference | WebGPU acceleration via `device: 'webgpu'` | Transformers.js v3 (2024) | 5-10x faster inference on GPU-capable machines |
| OpenAI API (no browser CORS) | Anthropic API with CORS support | August 2024 | Direct browser calls without proxy server; REQUIREMENTS.md explicitly notes "Anthropic only for v2.0" |
| Service Worker for AI (broken) | DedicatedWorker for AI inference | Ongoing | ServiceWorker lacked WebGPU; DedicatedWorker always supported it; Chrome 124 added ServiceWorker support but DedicatedWorker remains the safe choice |
| Model weights in IndexedDB | Cache API for model storage | Ongoing | Cache API is the Chrome team's explicit recommendation for AI model storage; transformers.js uses it by default |
| Transformers.js v4 with WebGPU runtime | v3 (project currently uses ^3.x) | February 2026 | v4 rewrote WebGPU runtime in C++; current project is on v3.8.1 which is stable; do not upgrade to v4 during Phase 4 |

**Deprecated/outdated:**
- `fetch-event-stream` (mentioned in REQUIREMENTS.md AINF-04): This appears to refer to the SSE streaming capability of Anthropic's API. The Anthropic TypeScript SDK handles this natively via `.stream()` — no separate `fetch-event-stream` package needed. The SDK internally uses server-sent events.

---

## Open Questions

1. **Cross-Origin Isolation headers in production PWA**
   - What we know: `SharedArrayBuffer` (required by some ONNX WASM configs) needs COOP + COEP headers. Vite dev server needs a plugin. Production needs the same headers from the server.
   - What's unclear: BinderOS is a PWA served as static files. If hosted on GitHub Pages or similar, adding COOP/COEP headers may require custom server config. The VitePWA workbox config may also be affected.
   - Recommendation: Test whether SmolLM2 WASM inference actually requires `SharedArrayBuffer` in practice. If it does, add `vite-plugin-cross-origin-isolation` for dev and document that production deployment requires these response headers. If it doesn't require SAB, skip cross-origin isolation entirely.

2. **`navigator.storage.persist()` behavior in standalone PWA mode**
   - What we know: The existing `storage/persistence.ts` already calls `navigator.storage.persist()` and the existing `bridge.ts` already handles `REQUEST_PERSISTENCE`. The Transformers.js docs confirm Cache API is the default model storage and `navigator.storage.persist()` can prevent eviction.
   - What's unclear: Whether calling persist() twice (once for the existing BinderCore DB, once during AI model setup) causes any issues. They should coalesce into one permission.
   - Recommendation: Reuse the existing persistence request mechanism; do not create a second call. Model storage and IndexedDB share the same storage bucket and the same persistence grant.

3. **AINF-04 requirement: "fetch-event-stream"**
   - What we know: The Anthropic SDK handles SSE streaming natively. The `fetch-event-stream` library (if it refers to a specific npm package) is not needed when using the SDK.
   - What's unclear: Whether this requirement literally means a specific npm package or just refers to the SSE streaming capability.
   - Recommendation: Satisfy AINF-04 using `@anthropic-ai/sdk` `.stream()`. If a raw fetch SSE approach is desired instead (e.g., for Ollama/LM Studio support which the SDK doesn't cover), use the `eventsource-parser` package which is well-maintained. For Phase 4, SDK-only is sufficient.

4. **Ollama / LM Studio multi-provider support in Phase 4**
   - What we know: CONTEXT.md says "Multi-provider support: user can configure multiple cloud providers (Anthropic, Ollama, LM Studio, etc.)"
   - What's unclear: Whether Phase 4 must implement all these providers or just define the adapter interface that future providers plug into.
   - Recommendation: Phase 4 defines the `AIAdapter` interface and ships `NoOpAdapter`, `BrowserAdapter` (SmolLM2), and one real cloud adapter (Anthropic). The interface being pluggable satisfies AINF-01. Ollama/LM Studio adapters can be added in future plans without interface changes.

---

## Sources

### Primary (HIGH confidence)
- `@huggingface/transformers` official docs — pipeline API, env configuration, WebGPU device parameter, useBrowserCache default
- `https://platform.claude.com/docs/en/api/messages-streaming` — Anthropic streaming protocol, SDK `.stream()` API, event types
- `https://huggingface.co/docs/transformers.js/en/api/env` — env.IS_WEBGPU_AVAILABLE, env.useBrowserCache, TransformersEnvironment type
- `https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt` — AES-GCM + PBKDF2 pattern
- Project source code: `src/worker/worker.ts`, `src/worker/bridge.ts`, `src/types/messages.ts`, `src/ui/signals/store.ts`, `src/storage/db.ts`

### Secondary (MEDIUM confidence)
- `https://developer.chrome.com/docs/ai/cache-models` — Cache API recommendation for model storage over IndexedDB
- `https://simonwillison.net/2024/Aug/23/anthropic-dangerous-direct-browser-access/` — Anthropic browser CORS feature confirmed August 2024
- `https://huggingface.co/collections/HuggingFaceTB/smollm2-6723884218bcda64b34d7db9` — SmolLM2 model family sizes and variants
- `https://github.com/huggingface/transformers.js/issues/787` — WebGPU in DedicatedWorker vs ServiceWorker confirmation

### Tertiary (LOW confidence — flag for validation at implementation)
- SmolLM2 actual ONNX quantized file sizes (~70-90MB for 135M q8, ~200-250MB for 360M q8) — verify from HuggingFace Hub at implementation time; CONTEXT.md states "150MB" and "300MB" which likely refers to unquantized or different variants
- Whether SharedArrayBuffer / cross-origin isolation is actually required for SmolLM2-135M WASM in practice — needs runtime test

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — `@huggingface/transformers` already installed; Anthropic SDK official; Web Crypto and Cache API are browser standards
- Architecture: HIGH — follows the existing project's own worker/bridge/store pattern directly; no new patterns introduced
- Pitfalls: MEDIUM-HIGH — most verified through official docs or GitHub issues; WASM/SharedArrayBuffer requirement flagged as LOW until tested
- Model sizes: LOW — approximated from community reports; must verify from HuggingFace Hub at implementation time

**Research date:** 2026-02-22
**Valid until:** 2026-04-22 (Anthropic SDK updates frequently; Transformers.js v4 may land and should not be adopted mid-phase)
