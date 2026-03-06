# Stack Research

**Domain:** BinderOS v4.0 — Device-Adaptive AI (WASM LLM + ONNX Sanitization + Multi-Provider Cloud)
**Researched:** 2026-03-05 (v4.0 update — appended to existing v1.0/v2.0/v3.0 research)
**Confidence:** HIGH (all new library choices verified against official docs/npm/GitHub releases)

---

## v4.0 Additions — New Stack Only

This section covers **only net-new dependencies** for v4.0. The existing stack (SolidJS, Vite, Dexie, WebLLM, ONNX Runtime Web, Anthropic SDK, HuggingFace Transformers, Python training pipeline) is validated through v3.0 and not re-researched.

---

## New Dependency 1: Mobile WASM LLM (`@wllama/wllama`)

**Recommendation: `@wllama/wllama@^2.3.7`**

### Why wllama

WebLLM (already in use for desktop) requires WebGPU — hard-unavailable on iOS Safari and many Android browsers. For device-adaptive Tier 1, a second local LLM runtime is needed that works without GPU.

| Runtime | Mechanism | WebGPU Required | Mobile Works | Production Signal |
|---------|-----------|----------------|--------------|------------------|
| `@mlc-ai/web-llm` (existing) | WebGPU kernels | YES (hard) | No (iOS Safari) | Validated v2.0 |
| `@wllama/wllama` | llama.cpp→WASM, SIMD | No | Yes | Firefox uses it for Link Preview (FF 142+) |
| `llama-cpp-wasm` | llama.cpp→WASM | No | Yes | Unmaintained, no npm typed API |
| Transformers.js ONNX generation | ONNX Runtime Web | No | Yes | Slow for generation — designed for classification |

**Why wllama wins over Transformers.js for generation:**
Transformers.js routes text generation through ONNX Runtime which is optimized for classification inference, not autoregressive generation. wllama uses llama.cpp's native GGUF kernels — 2-5x faster tokens/sec for the same model size. v2.2.0 (Feb 2025) added 2x speed improvement for Q4/Q5 quantization; v2.3.x syncs with latest llama.cpp upstream.

### Version Details

- **Latest stable:** 2.3.7 (November 27, 2025)
- **Install:** `pnpm add @wllama/wllama`
- **Worker support:** Inference runs inside a Web Worker — does not block UI thread
- **Multi-thread requirement:** SharedArrayBuffer → requires COOP/COEP headers. Already configured in `vite.config.ts`:
  ```
  Cross-Origin-Embedder-Policy: require-corp
  Cross-Origin-Opener-Policy: same-origin
  ```
  No Vite config changes needed.

### Model Recommendations for Mobile

| Model | Size | Quantization | Mobile Fit |
|-------|------|-------------|-----------|
| `SmolLM2-360M-Instruct-Q8_0.gguf` | ~386MB | 8-bit | Comfortable for most phones (2GB+ RAM tabs) |
| `Qwen2.5-0.5B-Instruct-Q4_K_M.gguf` | ~280MB | 4-bit | Best for low-memory devices |

**Hard constraint:** wllama 2GB ArrayBuffer limit per file — use split-model chunks for any model approaching that size. SmolLM2-360M and Qwen2.5-0.5B are well under the limit and do not need splitting.

### Integration Pattern

```typescript
// src/ai/adapters/wasm.ts — new WasmAdapter alongside existing BrowserAdapter
import { Wllama } from '@wllama/wllama';

// Detection: use WebGPU probe to decide which local adapter to use
export async function supportsWebGPU(): Promise<boolean> {
  if (!('gpu' in navigator)) return false;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}
// If supportsWebGPU() → use existing BrowserAdapter (WebLLM)
// Otherwise         → use new WasmAdapter (wllama)
```

---

## New Dependency 2: Multi-Provider Cloud (`openai@^6.27.0`)

**Recommendation: `openai@^6.27.0`** — covers OpenAI AND Grok/xAI with base URL override, and corporate LLMs via OpenAI-compatible endpoints.

### Current Version

- **Latest:** v6.27.0 (released 2026-03-05, confirmed from GitHub releases)
- **Install:** `pnpm add openai`
- **Browser compatibility:** `dangerouslyAllowBrowser: true` — same pattern as existing Anthropic SDK. Safe for user-supplied keys stored in memory vault.

### Why One Package Covers Three Providers

xAI Grok exposes an OpenAI-compatible API. The OpenAI JS SDK accepts a `baseURL` constructor option:

```typescript
// OpenAI
const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });

// Grok/xAI — same SDK, different base URL
const grok = new OpenAI({
  apiKey: xaiKey,
  baseURL: 'https://api.x.ai/v1',
  dangerouslyAllowBrowser: true,
});

// Corporate LLM (OpenAI-compatible endpoint)
const corp = new OpenAI({
  apiKey: corpKey,
  baseURL: corpEndpointUrl,  // user-configurable
  dangerouslyAllowBrowser: true,
});
```

**xAI base URL:** `https://api.x.ai/v1` (verified from official xAI developer docs).

### Why Not `@ai-sdk/xai` or Vercel AI SDK

`@ai-sdk/xai` is a provider abstraction for the Vercel AI SDK (`ai` package). The Vercel AI SDK has its own streaming interface (`streamText`, `generateText`) that differs from BinderOS's `AIAdapter` pattern. Adopting it would require rewriting the existing adapter abstraction. The `openai` package alone covers all three provider use cases.

### Adapter Architecture

```
AIAdapter (interface)
├── NoOpAdapter          (existing — v1.0)
├── BrowserAdapter       (existing — WebLLM/WebGPU, v2.0)
├── WasmAdapter          (NEW — wllama/mobile)
├── CloudAdapter         (existing — Anthropic, v2.0)
├── OpenAICloudAdapter   (NEW — openai package, default baseURL)
├── GrokCloudAdapter     (NEW — openai package, xAI baseURL)
└── CompatibleCloudAdapter (NEW — openai package, user-configured baseURL)
```

All new cloud adapters extend the same pre-send approval flow, communication log, session consent, and privacy proxy pattern from the existing `CloudAdapter`.

---

## New Python Dependency: ONNX NER Export (`optimum-onnx`)

**Recommendation: `optimum-onnx[onnxruntime]>=0.1.0,<0.2.0`** for the sanitization model training pipeline.

### Why a New Approach vs. Existing Pipeline

The v3.0 pipeline uses `skl2onnx` to export a scikit-learn MLP classifier. That works for binary classification (atom type). Sanitization is a **token classification (NER) task** — different model architecture (transformer with token-level heads), different export path.

| Task | Model Type | Export Tool | Output |
|------|-----------|-------------|--------|
| Atom type classification (v3.0) | scikit-learn MLP | `skl2onnx` | ONNX MLP |
| Sanitization/PII detection (v4.0) | Transformer NER | `optimum-onnx` | ONNX token classifier |

### optimum-onnx Details

- **Package:** `optimum-onnx[onnxruntime]`
- **Version:** 0.1.0 (December 23, 2025 — first stable release from HuggingFace)
- **Transformer compatibility:** 4.56/4.57 (pinned by optimum-onnx compatibility matrix)
- **Key class:** `ORTModelForTokenClassification` — loads pre-trained NER model, optionally fine-tunes, exports to ONNX with INT8 dynamic quantization in one call

### Sanitization Model Design

```
Architecture: Token Classification NER
Base model:   dslim/bert-base-NER (HuggingFace)
Labels:       [O, B-NAME, I-NAME, B-EMAIL, I-EMAIL, B-PHONE, I-PHONE,
               B-LOCATION, I-LOCATION, B-ORG, I-ORG]
Training:     Synthetic labeled text (same approach as v3.0 type classifier)
Export:       ONNX INT8 quantized via ORTQuantizer
Runtime:      Existing onnxruntime-web in embedding worker
```

**Why `dslim/bert-base-NER` as base:**
- Widely used, well-maintained HuggingFace model for NER
- 108M parameters — exportable and runnable (ONNX INT8 ~110MB)
- Covers all PII categories relevant to GTD atom content (names, emails, phone, location, org)
- Fine-tuning from this checkpoint requires ~200-500 curated examples vs. thousands from scratch

**Inference integration:** Sanitization model loads as a second `InferenceSession` in the existing embedding worker alongside the MiniLM model. Output token spans map to redaction replacements in `privacy-proxy.ts`.

### Updated `requirements.txt` additions

```txt
# Add to scripts/train/requirements.txt for v4.0 sanitization pipeline
optimum-onnx[onnxruntime]>=0.1.0,<0.2.0
transformers>=4.56,<4.58
# Note: onnxruntime constraint already present (>=1.20,<1.22) — compatible with optimum-onnx
```

---

## New Feature: Template Engine Decision

**Recommendation: Native TypeScript template literals — no new package.**

### Rationale

BinderOS's template use case is bounded and developer-controlled:
- ~10 review briefing templates
- ~5 compression coaching templates
- ~8 GTD flow prompt templates
- All slots are strongly typed (entropy score, section name, atom count, etc.)

External template engines (Handlebars ~35KB, Eta ~12KB, Mustache ~17KB, Nunjucks ~50KB) are designed for dynamic rendering from user-provided or database-driven templates. BinderOS templates are compiled into the app by the developer.

TypeScript template literals provide:
- Full type safety on all slot parameters (catches schema drift at compile time)
- Zero runtime overhead
- No parsing/security surface (XSS not a concern for developer-controlled templates)
- IDE autocomplete for slots

```typescript
// src/ai/templates/review-briefing.ts — pattern for all templates
export interface ReviewSignals {
  staleCandidateCount: number;
  entropyScore: number;
  topSection: string;
  overdueCount: number;
}

export function buildWeeklyBriefing(signals: ReviewSignals): string {
  const urgencyNote = signals.overdueCount > 0
    ? ` You have ${signals.overdueCount} overdue items.`
    : '';
  return (
    `Weekly review: ${signals.staleCandidateCount} stale candidates detected. ` +
    `Entropy score ${signals.entropyScore.toFixed(2)}.` +
    urgencyNote +
    ` Primary focus: ${signals.topSection}.`
  );
}
```

---

## Installation Summary

```bash
# Browser runtime — WASM mobile LLM
pnpm add @wllama/wllama

# Browser runtime — multi-provider cloud (OpenAI + Grok + corporate)
pnpm add openai
```

```diff
# scripts/train/requirements.txt — additions for v4.0 sanitization pipeline
+ optimum-onnx[onnxruntime]>=0.1.0,<0.2.0
+ transformers>=4.56,<4.58
  # Existing: onnxruntime>=1.20,<1.22 — already compatible, no change needed
```

No `devDependencies` changes — `onnxruntime-web` already present.

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@ai-sdk/xai` or `ai` (Vercel AI SDK) | Streaming API incompatible with BinderOS adapter pattern; adds abstraction over an already-abstracted system | `openai` package with `baseURL: 'https://api.x.ai/v1'` |
| AWS Bedrock SDK, Azure OpenAI SDK | 200KB+ cloud SDKs for browser; all expose OpenAI-compatible REST anyway | `openai` package with `baseURL` pointing to corporate endpoint |
| `presidio` (Microsoft) | Python server library for server-side scrubbing; cannot run in browser | Custom ONNX NER model via optimum-onnx running in embedding worker |
| `spaCy` for NER training | Does not export to ONNX natively; requires Thinc integration | HuggingFace transformers + optimum-onnx |
| `llama-cpp-wasm` | Unmaintained; no typed npm API; no split-model parallel download | `@wllama/wllama` |
| WASM models > 500MB for mobile | Mobile browser tab memory ceiling; model load crashes tabs above ~500MB reliably | SmolLM2-360M Q8_0 (~386MB) or Qwen2.5-0.5B Q4_K_M (~280MB) |
| WebLLM on mobile without detection guard | WebGPU unavailable on iOS Safari; throws hard error on init | wllama WasmAdapter via `supportsWebGPU()` detection probe |
| Handlebars/Eta/Mustache for templates | 12-50KB for a bounded set of developer-controlled templates with typed slots | TypeScript template literal functions |

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `@wllama/wllama@2.3.7` | `vite@7.x` + `vite-plugin-wasm` | WASM loading via existing plugin; no new config needed |
| `@wllama/wllama@2.3.7` | `onnxruntime-web@1.24.x` | No conflict; separate WASM modules in separate workers |
| `openai@6.27.0` | `@anthropic-ai/sdk@0.78.0` | No conflict; separate SDK instances per cloud adapter |
| `openai@6.27.0` | TypeScript 5.9 | TypeScript >= 4.9 required — satisfied |
| `optimum-onnx@0.1.0` | `transformers>=4.56,<4.58` | Version constraint from optimum-onnx compatibility matrix |
| `optimum-onnx@0.1.0` | `onnxruntime>=1.20,<1.22` | Same constraint as existing v3.0 pipeline — no conflict |
| wllama GGUF model files | Vite PWA service worker | Must add GGUF to `globIgnores` in workbox config — same pattern as existing ONNX WASM exclusion |

---

## Sources

- [ngxson/wllama GitHub](https://github.com/ngxson/wllama) — version 2.3.7, API, multi-threading constraints, 2GB model limit (HIGH confidence — official repo)
- [wllama releases](https://github.com/ngxson/wllama/releases) — v2.3.7 Nov 2025, v2.2.0 speed improvement, Firefox 142 adoption (HIGH confidence)
- [SmolLM2-360M-Instruct-GGUF](https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct-GGUF) — Q8_0 at 386MB, llama architecture (HIGH confidence — official HF model card)
- [Qwen2.5-0.5B-Instruct-GGUF](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF) — Q4_K_M at ~280MB (MEDIUM confidence — community measurement)
- [openai/openai-node releases](https://github.com/openai/openai-node/releases) — v6.27.0 current as of 2026-03-05 (HIGH confidence — verified from releases page)
- [xAI Developer Quickstart](https://docs.x.ai/developers/quickstart) — base URL `https://api.x.ai/v1`, OpenAI SDK compatibility (HIGH confidence — official xAI docs)
- [huggingface/optimum-onnx](https://github.com/huggingface/optimum-onnx) — v0.1.0 Dec 2025, transformers 4.56/4.57 support (HIGH confidence — official HF repo)
- [MDN: Navigator.gpu](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/gpu) — WebGPU detection pattern (HIGH confidence)
- [ONNX NER local-first PII scrubber](https://dev.to/tjruesch/a-local-first-reversible-pii-scrubber-for-ai-workflows-using-onnx-and-regex-53fb) — hybrid regex + NER pattern, INT8 XLM-RoBERTa (MEDIUM confidence — community verified against optimum docs)

---

## Prior Version Stack Sections

The full v1.0, v2.0, and v3.0 stack research has been superseded by this file's v4.0 additions section. Validated existing stack:

| Layer | Package | Version | Status |
|-------|---------|---------|--------|
| UI framework | `solid-js` | `^1.9.11` | Validated v1.0 |
| Router | `@solidjs/router` | `^0.15.4` | Validated v1.0 |
| Database | `dexie` | `^4.3.0` | Validated v1.0 |
| Search | `minisearch` | `^7.2.0` | Validated v1.0 |
| Validation | `zod` | `^4.3.6` | Validated v1.0 |
| WebGPU LLM | `@mlc-ai/web-llm` | `0.2.81` | Validated v2.0 |
| Cloud AI | `@anthropic-ai/sdk` | `^0.78.0` | Validated v2.0 |
| Embeddings | `@huggingface/transformers` | `^3.8.1` | Validated v3.0 |
| ONNX inference | `onnxruntime-web` | `^1.24.2` (dev) | Validated v3.0 |
| Build | `vite` | `^7.3.1` | Validated v1.0 |
| PWA | `vite-plugin-pwa` | `^1.2.0` | Validated v1.0 |
| WASM | `vite-plugin-wasm` | `^3.5.0` | Validated v1.0 |

---

*Stack research for: BinderOS v4.0 Device-Adaptive AI*
*Researched: 2026-03-05*
