# Project Research Summary

**Project:** BinderOS v4.0 — Device-Adaptive AI
**Domain:** Browser-native GTD application with tiered local + cloud AI pipeline
**Researched:** 2026-03-05
**Confidence:** HIGH (stack verified against official docs/npm/GitHub; architecture grounded in existing codebase; pitfalls from official GitHub issues and peer-reviewed sources)

---

## Executive Summary

BinderOS v4.0 extends the validated v3.0 tiered AI pipeline (Tier 1 deterministic, Tier 2 ONNX classification, Tier 3 LLM) to work on every device and with multiple cloud providers. The core architectural bet is that a well-structured adapter pattern can handle the full range from mobile WASM inference to corporate OpenAI-compatible proxies without duplicating the safety infrastructure that makes BinderOS privacy-first. Research confirms this bet is sound, with two firm constraints: iOS must be explicitly excluded from WASM LLM (route to Tier 2 + cloud only), and the cloud adapter refactor must complete before any new provider is wired in or the safety gates will scatter across implementations.

The recommended build path adds two JS dependencies (`@wllama/wllama` for mobile WASM LLM, `openai` for OpenAI/Grok/corporate cloud) and one Python dependency (`optimum-onnx` for the sanitization NER training pipeline). The template engine requires no new package — TypeScript template literal functions are sufficient for BinderOS's bounded set of developer-controlled templates. All four additions integrate cleanly into the existing architecture without replacing any v3.0 component. The biggest integration decision is where the sanitization ONNX model lives: it must run in the embedding worker (always loaded, independent of LLM worker state) so it is available for every cloud request, including on mobile where the WASM LLM may not yet be loaded.

The primary risks are not technical novelty but integration ordering and quantization strategy. Worker memory exhaustion from accumulating ONNX models is the most likely silent failure on mobile. The sanitization model's recall under INT8 quantization collapsing from ~0.90 to ~0.60 is a documented failure mode that must be blocked by requiring FP16/Q8 quantization and a minimum recall >= 0.85 acceptance gate. A privacy gate race condition (pre-send modal showing unsanitized content) is avoidable with a branded `SanitizedPrompt` type that forces the compiler to enforce execution order. Both risks are fully avoidable with the implementation order and acceptance criteria in the pitfalls research, but they will not surface in demo conditions — only in production on real mobile hardware.

---

## Key Findings

### Recommended Stack

The v3.0 stack (SolidJS, Vite, Dexie, WebLLM, ONNX Runtime Web, Anthropic SDK, HuggingFace Transformers) is validated and unchanged. V4.0 adds exactly four new dependencies.

**Core new technologies:**
- `@wllama/wllama@^2.3.7` — Mobile WASM LLM; wraps llama.cpp as WASM, no WebGPU required, runs in its own internal worker thread. Use single-thread mode only (avoids COEP/COOP headers). Ship SmolLM2-360M-Q4 (~200MB) as the default mobile model; wllama's 2GB ArrayBuffer limit means nothing larger is safe to attempt.
- `openai@^6.27.0` — Multi-provider cloud; covers OpenAI directly, Grok/xAI via `baseURL: 'https://api.x.ai/v1'`, and any corporate OpenAI-compatible endpoint via user-supplied `baseURL`. One package, three providers, zero structural differences between them.
- `optimum-onnx[onnxruntime]>=0.1.0,<0.2.0` — Python training pipeline for the sanitization NER model; `ORTModelForTokenClassification` for token-level PII detection. Must use FP16 or Q8 quantization for the sanitization model (not INT8, which collapses recall by 30-40%).
- TypeScript template literal functions — Zero-dependency template engine for structured briefing text; no Handlebars, no Eta.js. All slots are strongly typed; templates are developer-controlled and bounded (~25 total across review, compression, and GTD flow categories).

**Critical version and compatibility constraints:**
- wllama WASM binary files must be served from the same origin (`public/wllama/single-thread/wllama.wasm` copied from npm package)
- `optimum-onnx` pins `transformers>=4.56,<4.58` — compatible with existing `onnxruntime>=1.20,<1.22`
- GGUF model files must be added to Vite PWA `globIgnores` (same pattern as existing ONNX WASM exclusion)
- `openai` SDK `dangerouslyAllowBrowser: true` — same BYOK memory-only key pattern as existing Anthropic adapter

See [STACK.md](.planning/research/STACK.md) for full decision rationale, version compatibility matrix, and rejected alternatives.

### Expected Features

**Must have (P1 — table stakes for v4.0 milestone promise):**
- Device capability probe — detects WebGPU availability, `device.limits.maxBufferSize`, and `navigator.deviceMemory`; drives all adapter selection downstream
- WASM LLM adapter (`WasmAdapter` wrapping wllama) — mobile Tier 1 local AI, single-thread only
- Adaptive `DeviceAdapter` — routes to `BrowserAdapter` (WebGPU) or `WasmAdapter` (WASM) at init; callers stay device-oblivious
- Template engine — offline review briefings, compression explanations, GTD flow prompts with no LLM required; scoped to deterministic signal substitution only
- Sanitization ONNX classifier — replaces `sanitizeForCloud()` passthrough; NER-style binary classifier in embedding worker; Python training pipeline for soft-PII data
- OpenAI cloud adapter — gpt-4o-mini default; same BYOK pattern as Anthropic
- Grok/xAI cloud adapter — reuses OpenAI SDK with `baseURL` override; near-zero additional code beyond OpenAI adapter
- Corporate/self-hosted endpoint adapter — configurable `baseURL` + Bearer token; covers Ollama, LM Studio, Azure OpenAI
- Section routing ONNX classifier — replaces centroid-based routing deferred from v3.0; solves cold-start for new users
- Adaptive confidence thresholds — mobile device class raises thresholds to reduce escalation on slower WASM inference

**Should have (competitive differentiators — add during v4.0 validation):**
- Model capability probe with user-visible feedback — "Local AI: WebGPU (GPU)" vs "Local AI: WASM (mobile mode)" transparency builds trust
- Pre-send approval modal showing sanitization diff — users see what was redacted before approving cloud dispatch
- Communication log provider identity — `CloudRequestLogEntry.provider` expanded to `'anthropic' | 'openai' | 'grok' | 'corporate'`
- Sanitization level UI that explicitly communicates what is and is not caught (partial vs structured PII)
- Error messaging for corporate CORS failures — Ollama/LM Studio users need clear "add `--cors` flag" guidance

**Defer to v4.x:**
- Compression candidate ONNX detector — requires v3.0 correction data (compress-accepted vs compress-rejected) to accumulate; build training pipeline after 4-6 weeks of v3.0 production use
- Streaming UI for OpenAI/Grok — both providers support streaming; ConversationTurnCard needs partial-update handling; defer until adapters are stable
- WebGPU LLM opt-in for Android — experimental; WASM is the safe mobile default; add after WASM path is proven
- Priority prediction ONNX — high privacy surface, requires behavioral signal capture with explicit opt-in; research spike only

**Anti-features (do not build):**
- Auto-send to cloud without approval — locked architectural decision; pre-send modal is the privacy contract
- API keys in IndexedDB — memory-only key vault is the correct tradeoff for a BYOK privacy tool
- WebGPU LLM as mobile default — OOMs on mid-range Android; hard failure on iOS Safari
- LLM-based sanitization — 500ms-2000ms latency before every cloud request; ONNX NER is <50ms
- All ONNX models in one worker — cumulative memory exhaustion on mobile

See [FEATURES.md](.planning/research/FEATURES.md) for full feature dependency graph, prioritization matrix, and technical constraints.

### Architecture Approach

V4.0 adds four integration points to the existing architecture without replacing any v3.0 component. The `DeviceAdapter` wraps either `BrowserAdapter` or `WasmAdapter` using an adapter-within-adapter pattern — the rest of the system never knows which is active. The `CloudAdapter` is refactored into a provider-agnostic safety shell with a `CloudProvider` interface; `AnthropicProvider`, `OpenAIProvider`, `GrokProvider`, and `CorporateProvider` are thin request formatters with zero safety logic. The sanitization classifier runs as a second ONNX session inside the existing embedding worker (or a dedicated sanitization worker if memory budget demands it). The template engine is main-thread pure functions with no worker overhead.

**Major components:**
1. `DeviceAdapter` (`src/ai/adapters/device.ts` — NEW) — capability detection at init; delegates to `BrowserAdapter` (WebGPU) or `WasmAdapter` (WASM/CPU); exposes same `AIAdapter` interface; store never needs to know which is active
2. `WasmAdapter` (`src/ai/adapters/wasm.ts` — NEW) — wllama single-thread binding; SmolLM2-360M-Q4 default; Cache API model persistence; 512-token context limit for mobile latency
3. `CloudAdapter` refactored + provider classes (`src/ai/adapters/cloud.ts` REFACTORED, `providers/` NEW) — all safety gates remain in `CloudAdapter.execute()`; providers are pure request formatters; `cloud-provider.ts` defines the `CloudProvider` interface
4. Sanitization ONNX in embedding worker (`src/search/embedding-worker.ts` MODIFIED) — second `InferenceSession` alongside type classifier; `SANITIZE_CHECK` / `SANITIZE_RESULT` message types; runs before `logEntry` construction using branded `SanitizedPrompt` type
5. Template engine (`src/ai/templates/` — NEW directory) — pure TypeScript functions; `TemplateContext` typed interface; no library dependency; covers review briefings, compression explanations, GTD flow prompts
6. Python sanitization pipeline (`scripts/train/train-sanitizer.py` — NEW) — NER training on synthetic soft-PII GTD data; FP16/Q8 export (not INT8); acceptance gate: recall >= 0.85 on soft-PII test set

**Recommended build order (from ARCHITECTURE.md build order analysis):**
1. Template engine — no dependencies on any other new component; immediately reduces Tier 3 calls
2. Multi-provider cloud refactor — refactor CloudAdapter before adding sanitization to avoid doing it twice
3. Sanitization classifier — wires into the already-refactored CloudAdapter; Python training can run in parallel with Phase 2
4. Device-adaptive local LLM — independent of Phases 1-3; can overlap with Phase 3 in parallel

**Unchanged from v3.0:** `pipeline.ts`, `router.ts`, `tier1-handler.ts`, `tier3-handler.ts`, `centroid-builder.ts`, `classification-log.ts`, `triage.ts`, `compression.ts`, `CONFIDENCE_THRESHOLDS` structure (extended, not replaced), all SolidJS store signals, atom type classifier ONNX model.

See [ARCHITECTURE.md](.planning/research/ARCHITECTURE.md) for full system diagram, data flow sequences, anti-patterns, and complete new/modified/unchanged component tables.

### Critical Pitfalls

See [PITFALLS.md](.planning/research/PITFALLS.md) for all 12 pitfalls with prevention checklists, "looks done but isn't" verification, and recovery strategies. Top 8:

1. **WebGPU capability detection insufficient for VRAM** — `navigator.gpu !== undefined` does not mean adequate VRAM. Use compound check: WebGPU presence + `device.limits.maxBufferSize >= 800MB/2GB` by model size + `navigator.deviceMemory` heuristic. Add a 30-second hard timeout on `BrowserAdapter.initialize()` and a sentinel single-token inference after init. Without this, integrated GPU machines (Intel Iris Xe) OOM mid-download and hang indefinitely in "loading" state.

2. **iOS is not a viable WASM LLM target** — iOS Safari single-threaded WASM produces 0.3-1 token/second for 1B models (vs. 10-15 on Android Chrome). SharedArrayBuffer threading requires COOP/COEP + Apple's internal toggle, which does not reliably fire on iOS. iOS must be explicitly routed to Tier 2 ONNX + cloud only. Testing "mobile WASM LLM" on Android alone is insufficient.

3. **Multi-provider cloud adapter breaks on structural API differences** — Anthropic-format JSON schema passed to OpenAI causes 400 errors. OpenAI SSE streaming format differs structurally from Anthropic streaming events. Grok silently ignores `strict: true` function calling. Each provider requires its own adapter class with independent schema translation and SSE parser. Never use `if (provider === ...)` branching inside a shared class.

4. **Sanitization model training data creates false precision** — Regex-labeled training data teaches the model to re-detect regex-catchable PII (emails, phone numbers, SSNs). Achieves 95%+ accuracy on structured PII while missing all soft PII (names in task context, financial references, medical references). Train the ONNX soft-PII layer exclusively on examples where regex fails. Evaluate against a human-curated "embarrassing sentences without structured PII" test set.

5. **INT8 quantization collapses recall on sanitization NER model** — Token-classification models lose 30-40% recall after INT8 quantization (borderline sensitive spans collapse; clearly sensitive spans survive). For the sanitization model, use FP16 or Q8. Require recall >= 0.85 on the soft-PII test set before integration. Never evaluate a privacy gate on F1 alone.

6. **Privacy gate race condition — modal shows unsanitized content** — If ONNX sanitization is added after `logEntry` creation, the pre-send approval modal shows pre-sanitization content while the API receives sanitized content. Use a branded `SanitizedPrompt` type so the TypeScript compiler enforces that `logEntry` can only be constructed after sanitization completes.

7. **Worker memory exhaustion from accumulating ONNX models** — Each new `InferenceSession` adds 10-30MB to the worker heap. Four new classifiers = 50-100MB cumulative. On mobile (1GB browser budget) this causes silent worker crash and all Tier 2 classification hangs. Split workers: embedding worker keeps MiniLM + type classifier; `classifier-worker.ts` for section routing/compression/priority; `sanitization-worker.ts` for the privacy gate.

8. **Template engine scope creep beyond deterministic signal substitution** — Templates produce coherent output for counts, scores, and section names. They fail for insight synthesis ("why these 7 tasks matter"). Templates must be scoped to Tier 2 structural output only. Acknowledge the capability gap in the UX on mobile: "Simplified briefing (offline mode) — enable cloud AI for narrative insights."

---

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Template Engine

**Rationale:** No dependencies on any other new v4.0 component. Pure TypeScript, no new packages, no worker changes. Immediately reduces Tier 3 cloud LLM calls for review briefings and compression coaching. Establishes the `TemplateContext` type that the rest of the pipeline will reference. Lowest-risk phase — start here to build momentum.
**Delivers:** `src/ai/templates/` directory; `TemplateContext` + `TemplateResult` types; templates for weekly review briefing, compression explanations, GTD flow prompts; `generate-review-briefing` and `generate-compression-explanation` task types added to `AITaskType`; offline-capable structured text generation.
**Addresses features:** Template engine (offline generation), partial offline mobile experience
**Avoids:** Pitfall 6 (template scope creep) — the `TemplateContext` design must define the "no synthesis" rule before any template is written; limit to 2 signals per template clause.
**Research flag:** SKIP — TypeScript template literal pattern is well-understood; no research needed.

### Phase 2: Multi-Provider Cloud Adapter Refactor

**Rationale:** Must happen before sanitization is wired in. Refactoring `CloudAdapter` after adding sanitization means doing the restructure twice under live code. Establishing the `CloudProvider` interface and extracting `AnthropicProvider` first makes OpenAI, Grok, and Corporate straightforward additions rather than structural rework under load. The `openai` package covers all three new providers.
**Delivers:** `CloudProvider` interface; `AnthropicProvider` (extracted from existing `cloud.ts`), `OpenAIProvider`, `GrokProvider`, `CorporateProvider`; refactored provider-agnostic `CloudAdapter` shell with all safety gates; multi-slot `key-vault.ts`; expanded `CloudRequestLogEntry.provider` type; provider identity shown in pre-send modal and communication log; settings UI with per-provider key entry.
**Uses stack:** `openai@^6.27.0` with `baseURL` override for Grok and corporate endpoints
**Implements architecture:** `CloudProvider` interface and four provider classes; `cloud-provider.ts`; provider-agnostic `CloudAdapter.execute()`
**Avoids:** Pitfall 3 (multi-provider schema mismatches) — each provider gets its own adapter class, independent schema translation, and independent SSE parser; no `if (provider === ...)` branching.
**Research flag:** SKIP — OpenAI SDK pattern is well-documented; xAI OpenAI-compatibility confirmed in official xAI docs; Anthropic SDK behavior already validated in production.

### Phase 3: Sanitization Classifier

**Rationale:** Depends on Phase 2 refactor being complete (wires into the refactored `CloudAdapter.execute()`). The Python training pipeline can run in parallel with Phase 2 code work, so the model may be ready when code integration begins. This phase delivers the privacy differentiator that distinguishes BinderOS from every other browser GTD tool. The branded `SanitizedPrompt` type prevents the race condition at the type system level.
**Delivers:** ONNX NER binary classifier replacing `sanitizeForCloud()` passthrough; `SANITIZE_CHECK` / `SANITIZE_RESULT` message types in embedding worker (or dedicated `sanitization-worker.ts`); `checkSanitization()` in `privacy-proxy.ts`; `SanitizedPrompt` branded type enforcing execution order; pre-send modal showing sanitization diff; `sanitize-check.onnx` (FP16/Q8, not INT8); Python training pipeline for synthetic soft-PII GTD data; acceptance gate: recall >= 0.85 on soft-PII test set.
**Uses stack:** `optimum-onnx[onnxruntime]>=0.1.0,<0.2.0` for Python training; existing `onnxruntime-web` for browser inference
**Implements architecture:** Second `InferenceSession` in embedding worker; `checkSanitization()` integrated between sanitization and logEntry construction; `SanitizedPrompt` branded type in cloud adapter
**Avoids:** Pitfall 4 (false precision from regex-labeled training) — train on soft-PII only; Pitfall 5 (INT8 recall collapse) — use FP16/Q8, minimum recall gate; Pitfall 7 (race condition) — `SanitizedPrompt` branded type enforces order at compile time.
**Research flag:** MEDIUM — ONNX NER browser inference is confirmed; GTD-domain soft-PII synthetic data generation is novel. The boundary between regex-catchable PII (handled by existing regex layer) and ONNX soft-PII layer needs validation during data generation. FP16 vs Q8 quantization tradeoffs for the specific model architecture may need investigation before the training pipeline is finalized.

### Phase 4: Device-Adaptive Local LLM

**Rationale:** Independent of Phases 1-3 (depends only on the existing `BrowserAdapter` interface). Can be built in parallel with Phase 3. Delivers the other half of the "offline on any device" promise: WASM LLM for mobile devices where WebGPU is unavailable or insufficient. The `DeviceAdapter` wrapper keeps the change fully isolated — store initialization is the only modification outside the new adapter files.
**Delivers:** `DeviceAdapter` (WebGPU vs WASM selection at init); `WasmAdapter` (wllama single-thread binding); SmolLM2-360M-Q4 model via Cache API persistence; device capability probe with user-visible feedback; adaptive confidence thresholds per device class (`CONFIDENCE_THRESHOLDS` extended with mobile-class overrides); `public/wllama/single-thread/wllama.wasm` served from same origin.
**Uses stack:** `@wllama/wllama@^2.3.7` single-thread mode; SmolLM2-360M-Q4 GGUF (~200MB)
**Implements architecture:** `DeviceAdapter` wrapper; `WasmAdapter`; modified store init (DeviceAdapter replaces direct BrowserAdapter instantiation)
**Avoids:** Pitfall 1 (WebGPU VRAM detection) — compound capability check (WebGPU + maxBufferSize + deviceMemory) + 30-second timeout + sentinel single-token inference; Pitfall 2 (iOS WASM LLM) — explicit iOS detection via user-agent, route to Tier 2 + cloud only, never attempt wllama on iOS; Pitfall 11/COEP (COOP/COEP) — single-thread wllama avoids COEP/COOP header requirements entirely.
**Research flag:** MEDIUM — wllama single-thread integration is straightforward; iOS-specific behavior and Android mid-range performance sentinel threshold calibration need validation on real hardware. The 2 tokens/second Android benchmark threshold is directional, not empirically measured for SmolLM2.

### Phase 5: Section Routing ONNX Classifier (Deferred from v3.0)

**Rationale:** Addresses the cold-start section routing problem deferred from v3.0. Centroid-based routing fails for new users who have no atom history. ONNX classifier trained on PARA semantics provides reliable routing without user history. Comes after Phase 4 because the worker memory architecture (worker split decisions from Phase 3) must be in place before adding another model — the section classifier goes in `classifier-worker.ts`, not the embedding worker.
**Delivers:** ONNX section routing model replacing centroid fallback in `tier2-handler.ts`; Python training pipeline for PARA-domain text (`scripts/train/`); new embedding/classifier worker message type; user-specific section name fallback via nearest-neighbor for section titles.
**Uses stack:** Existing ONNX Runtime Web + Python training pipeline patterns from v3.0 type classifier
**Implements architecture:** New ONNX session in `classifier-worker.ts`; `route-section` task rerouted to ONNX primary with centroid fallback
**Avoids:** Pitfall 8 (worker memory exhaustion) — section routing ONNX goes in `classifier-worker.ts`, not embedding worker; Pitfall 12 (model-collapse feedback loop) — section routing corrections must be tracked in classification log with per-task `modelSuggestion` field.
**Research flag:** LOW — ONNX text classification pipeline follows the same pattern as the v3.0 type classifier. PARA semantics are well-defined. Training data generation follows the same synthetic approach already proven in v3.0.

### Phase Ordering Rationale

- **Templates before cloud refactor** — templates have zero dependencies and produce immediate value (reduced Tier 3 calls) while Phase 2 refactoring happens. Phases 1 and 2 can run in parallel.
- **Cloud refactor before sanitization** — the safety gate architecture in `CloudAdapter` must be stable before the privacy gate is wired into it. Adding sanitization to the existing single-provider `CloudAdapter` would require a second refactor.
- **Python sanitization training runs in parallel with Phase 2** — the training pipeline can start immediately; model validation completes before Phase 3 code integration begins.
- **Device-adaptive LLM overlaps with sanitization** — Phase 4 depends only on `BrowserAdapter` (unchanged); Phases 3 and 4 can run in parallel on separate branches.
- **Section routing last** — deferred from v3.0; depends on worker architecture decisions from Phase 3; lowest user impact if delayed; uses proven v3.0 training patterns.

### Research Flags

**Phases likely needing `/gsd:research-phase` during planning:**
- **Phase 3 (Sanitization Classifier):** Soft-PII synthetic data generation for GTD context is novel territory. The "regex-catchable PII vs. ONNX soft-PII" boundary needs formal definition before training data is generated. FP16 vs Q8 quantization tradeoffs for the sanitization model architecture should be investigated before the training pipeline is finalized. Recall >= 0.85 is the target, but calibration of what "soft-PII in GTD context" means for the test set requires domain-specific thought.
- **Phase 4 (Device-Adaptive LLM):** iOS wllama exclusion logic is clear, but the Android sentinel benchmark threshold (2 tokens/second for SmolLM2) needs validation on real mid-range hardware. The 30-second initialization timeout for WebGPU may need calibration against actual wllama initialization behavior for the specific GGUF model files.

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Template Engine):** Pure TypeScript template literal functions; no external dependencies; bounded scope.
- **Phase 2 (Multi-Provider Cloud):** OpenAI SDK + `baseURL` override is thoroughly documented; xAI OpenAI-compatibility confirmed in official docs; Anthropic behavior already in production.
- **Phase 5 (Section Routing ONNX):** Same training pipeline as v3.0 type classifier; PARA semantics are well-defined; standard ONNX classification pattern.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All four new dependencies verified against official docs, GitHub releases, and npm. Version compatibility (wllama 2GB limit, optimum-onnx transformers constraint, openai SDK browser pattern) confirmed. Rejected alternatives documented with rationale. |
| Features | MEDIUM-HIGH | Table stakes features clearly defined and well-scoped. Sanitization model recall under quantization is MEDIUM (documented failure mode in optimum GitHub issues; GTD-specific numbers will vary). WASM LLM mobile performance on low-end Android is MEDIUM (community-reported, not officially benchmarked for SmolLM2 on BinderOS's GTD workload). |
| Architecture | HIGH | All integration points grounded in reading the existing codebase (`cloud.ts`, `embedding-worker.ts`, `adapters/`). Provider plugin pattern, worker split decisions, and sanitization execution order with branded types are all solid. Build order is unambiguous and dependency-driven. |
| Pitfalls | HIGH for critical; MEDIUM for quantization specifics | iOS WASM LLM, WebGPU VRAM detection, race condition, multi-provider schema mismatches, worker memory — all HIGH from official docs and verified GitHub issues. INT8 recall collapse for sanitization model — MEDIUM (documented in optimum issues, but exact degradation on the new sanitization model will vary). |

**Overall confidence:** HIGH

### Gaps to Address

- **Sanitization recall threshold (0.85):** The minimum recall figure is derived from NLP quantization literature and the optimum GitHub issue on token-classification models. The actual threshold for BinderOS's sanitization model on GTD-domain soft-PII may differ. Validate against a human-curated test set during Phase 3 rather than treating 0.85 as a fixed universal target.
- **iOS wllama performance measurement:** The <1 token/second figure for iOS single-thread WASM is documented but device-generation-specific. The decision to exclude iOS from WASM LLM is correct and firm. The Android sentinel benchmark threshold (2 tokens/second) should be validated on actual mid-range hardware before Phase 4 ships.
- **Corporate CORS error messaging:** Corporate/self-hosted endpoints (Ollama, LM Studio default configs) may lack browser CORS headers. This is a documentation and error UX decision, not a code problem, but it needs a deliberate messaging plan in Phase 2 so users see actionable guidance rather than an opaque fetch failure.
- **Worker split memory budget:** The recommendation to split workers is based on a 50-100MB estimate for 4+ ONNX models. Actual memory usage depends on model sizes chosen. Measure peak heap with all v4.0 models loaded on a mobile emulation profile before committing to the split vs. single-worker architecture for the sanitization model.
- **Compression ONNX detector training data:** This v4.x feature requires v3.0 correction data (compress-accepted vs compress-rejected) that does not yet exist. Do not schedule in the v4.0 milestone.

---

## Sources

### Primary (HIGH confidence)

- [ngxson/wllama GitHub](https://github.com/ngxson/wllama) — v2.3.7 release, API, 2GB model limit, single-thread vs multi-thread COEP requirements, Firefox 142 adoption
- [openai/openai-node releases](https://github.com/openai/openai-node/releases) — v6.27.0 current (2026-03-05), `dangerouslyAllowBrowser` pattern
- [xAI Developer Quickstart](https://docs.x.ai/developers/quickstart) — `baseURL: 'https://api.x.ai/v1'`, OpenAI SDK compatibility confirmed
- [huggingface/optimum-onnx](https://github.com/huggingface/optimum-onnx) — v0.1.0 Dec 2025, `ORTModelForTokenClassification`, transformers 4.56/4.57 compatibility matrix
- [SmolLM2-360M-Instruct-GGUF](https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct-GGUF) — Q8_0 at 386MB, Q4 at ~200MB, llama architecture
- [MDN: Navigator.gpu](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/gpu) — WebGPU detection, `device.limits.maxBufferSize`
- [web.dev/articles/coop-coep](https://web.dev/articles/coop-coep) — COEP `credentialless` vs `require-corp` tradeoffs
- [Transformers.js v3 blog](https://huggingface.co/blog/transformersjs-v3) — WASM fallback, `device: 'wasm'`, SmolLM2 compatibility
- [ONNX Runtime Web docs](https://onnxruntime.ai/docs/tutorials/web/) — browser inference, session lifetime, memory model
- Existing BinderOS codebase (`src/ai/adapters/cloud.ts`, `src/search/embedding-worker.ts`, `src/ai/tier2/`) — integration constraints derived directly from current implementation

### Secondary (MEDIUM confidence)

- [Local-first ONNX PII scrubber](https://dev.to/tjruesch/a-local-first-reversible-pii-scrubber-for-ai-workflows-using-onnx-and-regex-53fb) — hybrid regex + NER pattern, XLM-RoBERTa INT8 quantization recall behavior
- [huggingface/optimum GitHub issues](https://github.com/huggingface/optimum) — INT8 recall collapse on token-classification models (Issue #151 area, LaBSE-based models)
- [WebGPU crash on Android Chrome — Transformers.js #1205](https://github.com/huggingface/transformers.js/issues/1205) — SmolVLM OOM on Android; confirms WASM as safe mobile default
- Cross-browser local LLM via WASM (Picovoice blog) — model size guidance, WASM LLM feasibility on mobile
- OpenAI `dangerouslyAllowBrowser` community discussion — CORS behavior and browser key handling
- Building privacy-first anonymizer for LLMs (Medium) — architecture for pre-LLM sanitization pipeline

### Tertiary (LOW confidence)

- iOS WASM threading performance figures — community-reported; device-generation-specific; treat as directional, not definitive
- Qwen2.5-0.5B-Q4 ~280MB size figure — community measurement; validate against official model card before shipping

---

*Research completed: 2026-03-05*
*Ready for roadmap: yes*
