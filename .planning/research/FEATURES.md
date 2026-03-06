# Feature Research

**Domain:** Device-adaptive AI tiers, ONNX sanitization, template generation, multi-provider cloud LLMs (BinderOS v4.0)
**Researched:** 2026-03-05
**Confidence:** MEDIUM-HIGH — Device detection and WebLLM/Transformers.js fallback patterns HIGH (official docs verified); sanitization ONNX classifier MEDIUM (general NER-via-ONNX confirmed, GTD-specific sanitization is novel); template engine for offline AI generation HIGH (established patterns, low technical risk); multi-provider cloud adapter MEDIUM-HIGH (OpenAI/xAI APIs are OpenAI-compatible, CORS and browser key concerns documented)

---

## Context

This research targets BinderOS **v4.0: Device-Adaptive AI**. The v3.0 baseline (shipped 2026-03-05) delivered:

- Fine-tuned ONNX type classifier in the embedding worker (replaces centroid matching)
- Platt-calibrated confidence → correct Tier 2→3 escalation at 0.78 threshold
- Python training pipeline: synthetic data generation → MiniLM fine-tune → ONNX INT8 export
- Classification correction export (JSONL) for retraining
- Model lifecycle UX: download progress, Cache API persistence, model info in settings
- Existing adapters: NoOp, BrowserAdapter (WebLLM/WebGPU, desktop-only), CloudAdapter (Anthropic only)
- Privacy proxy: `sanitizeForCloud()` passthrough — full ML sanitization was deferred

**What v4.0 changes:**

| Area | v3.0 State | v4.0 Target |
|------|-----------|-------------|
| Tier 1 local LLM | WebLLM WebGPU only (desktop) | Device-adaptive: WebGPU on desktop, WASM/Transformers.js on mobile |
| Tier 2 ONNX | Type classifier only | + Section routing (ONNX), sanitization classifier, compression detection, priority prediction |
| Tier 2 generation | LLM prose for reviews/coaching | Template engine: entropy-signal-driven text, no LLM required for structured outputs |
| Tier 3 cloud | Anthropic only | + OpenAI, xAI/Grok, corporate LLM (OpenAI-compatible endpoint) |
| Privacy gate | String-level passthrough | Tier 2 sanitization ONNX classifier scrubs PII before cloud dispatch |
| Offline mobile | Tier 1 unavailable | Tier 1 (WASM LLM) + Tier 2 + templates → fully functional without cloud |

**Scope boundary:** Features new to v4.0 only. Existing type classification, approval modal, floating orb, conversational flows, and all v3.0 patterns are baseline — not described here unless they change.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that make v4.0's device-adaptive and multi-provider promises feel real. Missing these = the milestone delivers a half-step upgrade, not a full one.

| Feature | Why Expected | Complexity | Dependency on Existing System |
|---------|--------------|------------|-------------------------------|
| **Device detection: WebGPU vs WASM LLM tier** | If the app claims "fully functional offline on any device," users on mobile expect local AI to work — not a "WebGPU required" error. Device capability detection is the precondition for everything else in v4.0. | LOW | `navigator.gpu` check already exists conceptually (BrowserAdapter currently relies on WebLLM/WebGPU). Add: `navigator.deviceMemory`, `navigator.gpu.requestAdapter()` for VRAM estimation, user-agent heuristics for mobile. Map result to model tier selection. |
| **Transformers.js WASM LLM for mobile** | Mobile users on Android Chrome (WebGPU available since Chrome 121) and iOS Safari (WebGPU not yet stable) need a WASM-backed LLM path. Transformers.js with `device: 'wasm'` runs SmolLM2 (360M, ~200MB q8) at usable speed on modern phones. | MEDIUM | New adapter or BrowserAdapter variant. Transformers.js already in project for MiniLM embeddings. Add text-generation pipeline from same library. Worker pattern already established in `llm-worker.ts`. |
| **Automatic model size selection by capability** | Giving users a manual "Low VRAM / Medium / High" dropdown hides complexity but still requires them to know their device. The system must pick a sane default: SmolLM2-360M on low-memory or WASM path, Llama-3.2-1B on mid-range WebGPU, Llama-3.2-3B on capable desktop. | LOW | Build on existing `WEBLLM_MODELS` list in `browser.ts`. Extend with capability probe at init time. Existing settings UI can still show override. |
| **Offline mobile experience (Tier 1 + Tier 2)** | A user on a plane with an iPhone expects triage, compression coaching, and review briefings to work. The current BrowserAdapter fails without WebGPU. WASM LLM + ONNX classifiers + template engine must together provide a complete offline experience. | HIGH (integrated) | Requires: WASM LLM adapter (Tier 1) + all expanded Tier 2 ONNX classifiers + template engine. These features compose to deliver the offline promise. |
| **OpenAI API provider in CloudAdapter** | Anthropic-only cloud limits users who already pay for OpenAI. OpenAI's Chat Completions API is the de facto standard; its SDK supports `dangerouslyAllowBrowser: true` with user-provided keys (same pattern as Anthropic). | MEDIUM | Extend `cloud.ts` or add `cloud-openai.ts`. Register in AI Settings alongside Anthropic. Model selection: gpt-4o-mini for cost efficiency (same role as claude-haiku). |
| **xAI Grok API provider** | xAI Grok API is OpenAI-compatible (same endpoint structure, `x.ai/api`). Adds a third major provider for users who prefer xAI. | LOW-MEDIUM | If OpenAI SDK is added, Grok reuses it with a custom `baseURL`. Near-zero new code once OpenAI adapter is built. |
| **Pre-send approval modal works for all providers** | The existing `onPreSendApproval` callback gate must trigger for OpenAI, Grok, and any future provider — not just Anthropic. | LOW | Abstract the pre-send gate into the base cloud dispatch layer. All cloud providers use the same modal; log entry records which provider. |
| **Communication log shows provider identity** | `CloudRequestLogEntry.provider` is currently typed as `'anthropic'`. Must expand to `'anthropic' | 'openai' | 'grok' | 'corporate'`. Settings > Communication Log must display which provider was called per request. | LOW | Type extension + UI label update. Already stored in `key-vault.ts` log. |
| **Section routing ONNX classifier** | Section routing was deferred from v3.0 (listed in PROJECT.md deferred). The centroid-based routing in `tier2-handler.ts` has low confidence on new users (few atoms, sparse centroids). A shared ONNX section classifier trained on PARA semantics provides better cold-start routing. | HIGH | New training pipeline (PARA section semantics: Projects, Areas, Resources, Archives). New ONNX model file. Extend embedding worker with new message type. New Tier 2 handler path for `route-section` task using ONNX instead of centroid. |

---

### Differentiators (Competitive Advantage)

Features that distinguish BinderOS v4.0 from any other browser-based GTD tool and from generic AI assistants.

| Feature | Value Proposition | Complexity | Dependency on Existing System |
|---------|-------------------|------------|-------------------------------|
| **Tier 2 sanitization ONNX classifier (privacy gate)** | Before any atom content reaches a cloud LLM, an on-device ONNX NER/classification model detects sensitive entities: names, locations, financial amounts, health information, credentials. Flagged tokens are masked before cloud transmission. This is the first browser-native GTD tool with an ML privacy gate — most tools either send everything or nothing. | HIGH | New Python training pipeline (NER-based, or binary sensitive/non-sensitive classifier). ONNX model loaded in embedding worker (or separate sanitization worker). `sanitizeForCloud()` in `privacy-proxy.ts` currently a passthrough — replace with ONNX inference. Needs to run before `addCloudRequestLog()` to ensure the log stores only sanitized text. |
| **Template engine for offline review generation** | Weekly review briefings, compression explanations, and GTD flow prompts currently require a Tier 3 LLM call to produce prose. A template engine (Eta.js, ~3KB) + entropy signal inputs generates structured, high-quality review text entirely offline. "You have 12 stale tasks in Projects, 3 items waiting review. Entropy: 68% — above threshold." No LLM, no download. | MEDIUM | New `src/ai/tier2/template-engine.ts`. Templates parameterized by WASM entropy signals already computed (`src/wasm/`). Replaces Tier 3 calls for `assess-staleness`, weekly briefing, and compression explanation when no LLM is available. Tier 3 LLM escalates only for freeform narrative or creative synthesis tasks (`analyze-gtd`). |
| **Corporate/self-hosted LLM endpoint (OpenAI-compatible)** | Enterprise users running Ollama locally, LM Studio, or corporate OpenAI proxies can point BinderOS at a custom base URL. Any OpenAI-compatible endpoint works with the same adapter. No additional code after OpenAI adapter is built. | LOW (given OpenAI adapter) | Settings UI: add "Custom endpoint" field. OpenAI SDK `baseURL` parameter. Same pre-send approval gate and communication log. Users provide endpoint URL + API key. |
| **Compression candidate ONNX detector** | Current compression coach uses WASM staleness score + heuristics to surface candidates. A binary ONNX classifier trained on "compress-worthy vs keep" signals (age, link count, type, staleness score, query frequency) predicts candidates with higher precision and fewer false positives. Users see fewer irrelevant compression suggestions. | HIGH | Requires v3.0 correction data for training (compress-accepted vs compress-rejected). New Python pipeline for compression training data. New message type in embedding worker. Extends `compression.ts` replace-or-augment heuristic candidate selection. |
| **Priority prediction signal (research feature)** | WASM priority formula (entropy × recency × link density) is deterministic. An ONNX regression model trained on behavioral signals (which atoms does the user actually act on?) would predict behavioral priority closer to actual user intent. Exposed as optional "behavioral priority" signal in store alongside existing computed priority. | VERY HIGH | High privacy surface: requires tracking user interactions (opens, edits per atom). Must be explicit opt-in. Training data is fully personal. Flag as research/experimental feature. Only expose if behavioral signal capture is implemented with full user consent UX. |
| **Adaptive confidence thresholds per device** | On a high-end desktop with WebGPU LLM, the pipeline can afford lower Tier 2 confidence thresholds (escalate more → better answers from Tier 3). On mobile with WASM LLM, escalation should be more conservative (Tier 3 is fast on desktop, slow on mobile WASM). Device-adaptive thresholds tune the escalation balance for the device class. | MEDIUM | Extend `CONFIDENCE_THRESHOLDS` to support per-device-class overrides. Mobile class: raise thresholds (escalate less). Desktop class: keep current thresholds. Settings: expose "AI assertiveness" slider that maps to threshold profile. |
| **Model capability probing with user-visible feedback** | When the app first loads on a new device, it runs a 2-second capability probe (WebGPU adapter info, device memory, GPU limits). It reports to the user: "Your device supports local AI (GPU, ~2.2GB model)" or "Lightweight AI mode (CPU, ~200MB model)." Transparency builds trust; no other browser AI app does this. | LOW | Extend `BrowserAdapter.initialize()` capability probe logic. Display result in AI Settings. One-time UX flow on first AI enable. |

---

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Auto-send to cloud without approval** | "Cloud AI is faster — just use it automatically" | Every cloud request must go through the pre-send approval modal (locked architectural decision). Removing this gate exposes user data without explicit consent per the project's privacy contract. | Keep the modal. Make it lower-friction: checkbox "Don't ask again this session" (session consent already implemented). Don't remove the gate. |
| **Store API keys in IndexedDB** | "So I don't have to re-enter my key every session" | Keys in IndexedDB are readable by any script running on the origin (including injected scripts). Memory-only storage (current pattern in `key-vault.ts`) is the correct tradeoff for a local-first privacy tool. | Offer optional session-length persistence using `sessionStorage` (cleared on tab close). Never use IndexedDB or localStorage for API keys. Explicit user opt-in. |
| **WebGPU LLM on mobile** | "Android Chrome supports WebGPU — use it for WebLLM" | Chrome Android WebGPU support exists since version 121, but memory limits are severe (1–2GB shared VRAM). WebLLM's smallest model (Llama-3.2-1B at ~900MB VRAM) routinely OOMs on mid-range Android phones. Safari iOS WebGPU is not stable. | Use Transformers.js WASM path on mobile as the default. Optionally probe WebGPU adapter on Android; if `maxBufferSize` is above threshold, offer the 1B WebGPU model as an experimental opt-in. Never default to WebGPU LLM on mobile. |
| **LLM-based sanitization** | "Use a local LLM to summarize/redact before sending to cloud" | Using a LLM for sanitization adds 500ms–2000ms latency before every cloud request. On mobile (WASM LLM), this would make cloud AI unusable. LLM-based sanitization also requires the LLM to be loaded and ready before any cloud call can proceed. | ONNX NER classifier for sanitization: runs in <50ms on CPU, does not require the LLM worker to be initialized, operates independently in the embedding worker. Fast, always available, predictable. |
| **Three separate workers for three LLM providers** | "Isolate each provider for safety" | Memory pressure from three simultaneously running AI workers would OOM most browser tabs. Worker startup overhead is significant for WASM modules. | One cloud adapter manager on the main thread dispatches to the active provider via fetch. One embedding worker handles ONNX. One LLM worker handles the active local model. Provider switching is configuration, not separate workers. |
| **Real-time sanitization overlay UI** | "Show users what gets redacted in real time as they type" | Adds O(n) ONNX inference on every keystroke. At 50ms per inference, typing lags visibly after 20 characters. Significantly raises implementation complexity with minimal added privacy benefit (sanitization already happens before cloud dispatch). | Sanitization runs once, immediately before cloud dispatch, in the existing approval modal flow. The approval modal can display the sanitized text diff so users see what was redacted before approving. |
| **All-in-one multi-task LLM (local + cloud)** | "One model that handles type classification, summarization, and routing" | Local LLMs (1B–3B parameters) have poor few-shot classification accuracy compared to the fine-tuned ONNX classifiers for fixed-label tasks. Routing all classification through the LLM would: (a) slow inbox triage from <50ms (ONNX) to 500ms+ (LLM), (b) introduce stochastic variance into a deterministic task, (c) break the tiered escalation logic. | Keep the tiered architecture: ONNX for fixed-label classification, LLM for open-ended generation and ambiguous cases. The tiers are complementary, not redundant. |
| **Streaming responses from all providers** | "Show text generation in real-time for every provider" | Streaming is already implemented for Anthropic (using `client.messages.stream()`). OpenAI streaming uses `stream: true` with SSE. Grok uses OpenAI-compatible streaming. Streaming UX requires the ConversationTurnCard to handle partial updates — currently it shows completed responses. Implementation risk: each provider has subtle streaming differences. | Implement streaming for OpenAI adapter (reuses existing chunk callback pattern). Grok inherits it. Mark corporate endpoint streaming as opt-in (custom endpoints may not support it). Defer streaming UI polish (partial typing animation) to a later milestone. |
| **Corporate LLM with custom auth schemes (OAuth, SAML)** | "Our company uses Azure AD to authenticate to our LLM endpoint" | OAuth/SAML flows from a browser PWA require redirect flows or PKCE, adding significant auth infrastructure. This is backend work, not frontend work. | Support OpenAI-compatible endpoints with static Bearer token (API key). This covers 95% of self-hosted and corporate proxy setups. OAuth/SAML is out of scope — use a proxy that accepts Bearer tokens. |

---

## Feature Dependencies

```
[Device-Adaptive BrowserAdapter]
    └──requires──> [navigator.gpu capability probe (WebGPU available?)]
    └──requires──> [navigator.deviceMemory + user-agent for device class]
    └──branches──> [WebGPU path: existing WebLLM/BrowserAdapter (desktop)]
    └──branches──> [WASM path: Transformers.js text-generation pipeline (mobile/low-memory)]
    └──enables──> [Offline mobile experience]

[Transformers.js WASM LLM (mobile Tier 1)]
    └──uses──> [Transformers.js (already in project for MiniLM embeddings)]
    └──requires──> [SmolLM2-360M-Instruct or similar WASM-compatible model]
    └──requires──> [LLM worker extended or new WASM LLM worker]
    └──requires──> [Cache API model persistence (pattern from ONNX classifier)]
    └──note──> [Shared library with embedding, separate model file — no Dexie conflict]

[Template Engine (offline generation)]
    └──uses──> [Eta.js or similar micro-template library (~3KB)]
    └──requires──> [WASM entropy signals: staleness scores, atom counts, section health]
    └──requires──> [Template files for: weekly briefing, compression explanation, GTD prompts]
    └──replaces──> [Tier 3 LLM calls for assess-staleness, weekly-briefing, compression-explanation tasks]
    └──note──> [LLM still used for analyze-gtd (open-ended) and ambiguous classify-type escalations]

[Sanitization ONNX Classifier (privacy gate)]
    └──requires──> [New Python NER/binary-classification training pipeline]
    └──requires──> [ONNX model: sensitive entity detection (names, locations, financial, health, credentials)]
    └──replaces──> [sanitizeForCloud() passthrough in privacy-proxy.ts]
    └──runs-in──> [Embedding worker (alongside type classifier) OR dedicated sanitization worker]
    └──gates──> [CloudAdapter.execute() — must pass before pre-send approval modal]
    └──note──> [Must be independent of LLM worker state — runs even when local LLM not loaded]

[OpenAI Cloud Adapter]
    └──requires──> [openai npm package (similar to @anthropic-ai/sdk pattern)]
    └──requires──> [Key vault extension: openai key slot]
    └──requires──> [Pre-send approval modal: already provider-agnostic in design]
    └──extends──> [CloudRequestLogEntry.provider type: add 'openai']
    └──enables──> [Grok adapter (reuses OpenAI SDK with baseURL override)]
    └──enables──> [Corporate LLM adapter (same, custom baseURL + Bearer token)]

[Grok/xAI Cloud Adapter]
    └──requires──> [OpenAI Cloud Adapter] (built first — Grok is OpenAI-compatible)
    └──requires──> [baseURL: 'https://api.x.ai/v1' in OpenAI SDK]
    └──note──> [Near-zero additional code beyond OpenAI adapter]

[Corporate/Self-Hosted Endpoint]
    └──requires──> [OpenAI Cloud Adapter]
    └──requires──> [Settings UI: custom base URL field + API key field]
    └──note──> [Covers Ollama, LM Studio, Azure OpenAI, any OpenAI-compatible proxy]

[Compression Candidate ONNX Detector]
    └──requires──> [v3.0 correction data: compress-accepted vs compress-rejected events in classification log]
    └──requires──> [New Python training pipeline for compression candidate classification]
    └──requires──> [New ONNX model and embedding worker message type]
    └──enhances──> [compression.ts: replaces heuristic candidate selection]

[Section Routing ONNX Classifier]
    └──requires──> [Training data: PARA semantics (Projects/Areas/Resources/Archives)]
    └──requires──> [New Python training pipeline for section routing]
    └──requires──> [New ONNX model loaded in embedding worker]
    └──replaces──> [Centroid-based route-section in tier2-handler.ts]
    └──note──> [User-specific section names still handled via embedding nearest-neighbor fallback]

[Adaptive Confidence Thresholds]
    └──requires──> [Device detection (device class: mobile vs desktop)]
    └──modifies──> [CONFIDENCE_THRESHOLDS in src/ai/tier2/types.ts]
    └──note──> [Mobile: raise thresholds (less escalation). Desktop: current thresholds.]

[Offline Mobile Experience]
    └──requires──> [Transformers.js WASM LLM] (Tier 1 on mobile)
    └──requires──> [Section routing ONNX classifier] (Tier 2 upgrade)
    └──requires──> [Template engine] (Tier 2 generation offline)
    └──requires──> [Sanitization ONNX classifier] (privacy gate works offline)
    └──note──> [Cloud features still unavailable offline — Tier 3 degrades gracefully]
```

### Dependency Notes

- **Device detection is the foundation.** Without knowing the device class (WebGPU capable desktop vs WASM mobile), the adapter selection logic cannot route correctly. Build detection before any new adapter code.
- **OpenAI adapter unlocks Grok and corporate LLMs for free.** xAI Grok uses the OpenAI SDK with `baseURL: 'https://api.x.ai/v1'`. Corporate/Ollama endpoints use the same pattern. Build OpenAI adapter first; others are configuration variants.
- **Sanitization ONNX must be independent of the LLM worker.** If it runs in the embedding worker (already always loaded), it's always available. If it requires the LLM worker, it fails on mobile when the WASM LLM is loading. Run sanitization in the embedding worker.
- **Template engine blocks offline mobile UX.** Without templates, offline review briefings require a Tier 3 LLM call. Template engine is the critical path for the "fully functional offline" promise.
- **Section routing ONNX has a cold-start problem.** New users have no atom history, so centroid fallback produces nothing. An ONNX section classifier trained on PARA semantics solves cold-start. User-specific section naming is handled by embedding nearest-neighbor for section titles after onboarding.
- **Compression ONNX detector requires correction data from v3.0.** The model must be trained on real compress-accepted vs compress-rejected examples. Training data does not exist until v3.0 has run in production. Build training pipeline and model after v3.0 correction data accumulates. Initially ship v4.0 with enhanced heuristics; swap in ONNX when data is ready.

---

## MVP Definition

### Ship in v4.0 (Core Milestone Deliverables)

The minimum set that delivers the "device-adaptive AI, fully functional offline" promise.

- [ ] **Device capability probe** — Detect WebGPU availability, device memory class, and mobile/desktop heuristic. Output: `DeviceCapabilityProfile { hasWebGPU, deviceClass, recommendedModel }`. Drives all subsequent adapter decisions.
- [ ] **WASM LLM adapter (mobile Tier 1)** — Transformers.js text-generation pipeline with SmolLM2-360M (WASM, ~200MB). Same worker interface as BrowserAdapter. Cache API persistence for model file. Download progress UX (reuse existing pattern from ONNX classifier).
- [ ] **Adaptive BrowserAdapter init** — On `initialize()`, run capability probe → select WebLLM (WebGPU) or WASM LLM (Transformers.js) path automatically. Existing `WEBLLM_MODELS` list expands to include SmolLM2 entry for WASM path.
- [ ] **Template engine (offline generation)** — Eta.js-based template system for: weekly review briefing, compression explanation sentences, GTD flow prompts. Parameterized by WASM entropy signals. Removes Tier 3 dependency for structured output tasks.
- [ ] **Sanitization ONNX classifier** — Binary or NER-based ONNX model detecting sensitive entities. Integrated into `sanitizeForCloud()` — replaces the current passthrough. Runs in embedding worker. Python training pipeline for sanitization model (new `scripts/train/` subdirectory). Pre-send approval modal shows sanitized diff.
- [ ] **OpenAI cloud adapter** — Full `CloudAdapter` equivalent using `openai` SDK with user-provided key. Pre-send approval gate and communication log extended. Model: `gpt-4o-mini` (cost-efficient). Settings UI: add OpenAI key slot alongside Anthropic.
- [ ] **Grok/xAI cloud adapter** — OpenAI adapter with `baseURL: 'https://api.x.ai/v1'`. Settings UI: add Grok key slot. Model: `grok-3-mini` or equivalent cost-efficient Grok model.
- [ ] **Corporate/custom endpoint adapter** — OpenAI adapter with configurable `baseURL` and key. Settings UI: custom endpoint URL field. Covers Ollama, LM Studio, Azure OpenAI.
- [ ] **Section routing ONNX classifier** — ONNX model trained on PARA-domain text. Replaces centroid-based `route-section` in `tier2-handler.ts`. Python training pipeline added to `scripts/train/`. New embedding worker message type.
- [ ] **Adaptive confidence thresholds** — `CONFIDENCE_THRESHOLDS` extended with mobile-class overrides. Device class from capability probe feeds threshold selection at pipeline init.

### Add After Validation (v4.x)

- [ ] **Compression candidate ONNX detector** — Requires v3.0 correction data (compress-accepted vs compress-rejected) to accumulate before training. Build training pipeline and model after 4–6 weeks of v3.0 production use. Ship as v4.1 patch.
- [ ] **Priority prediction (research spike)** — Requires behavioral signal capture (explicit user opt-in). High privacy surface. Treat as a research feature behind a settings flag. Only productize if correction data shows WASM formula is consistently wrong.
- [ ] **Streaming UI for OpenAI/Grok** — Streaming tokens are available from both providers. ConversationTurnCard currently shows completed responses. Animated streaming display adds perceived performance. Add after core adapters are stable.
- [ ] **WebGPU LLM opt-in for Android** — Probe `maxBufferSize` on Android Chrome WebGPU adapter. If above threshold, offer 1B WebGPU model as experimental opt-in. Default stays WASM. Add once WASM path is stable.

### Future Consideration (v5+)

- [ ] **Community sanitization model improvements** — Public corpus of sensitive entity patterns to improve sanitization recall. Requires opt-in anonymization pipeline.
- [ ] **OAuth/SAML corporate auth** — Out of scope until a backend exists. Corporate users should use API key-based proxies.
- [ ] **Voice capture + local STT** — picoLLM/Cheetah for local speech-to-text. High-value for mobile but significant new dependency surface.
- [ ] **Model federation across devices** — Share correction log for model improvement across user's own devices. Requires CRDT sync (already deferred to future milestone).

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority | Notes |
|---------|------------|---------------------|----------|-------|
| Device capability probe | HIGH | LOW | P1 | Gates everything else; prerequisite |
| WASM LLM adapter (mobile) | HIGH | MEDIUM | P1 | Core v4.0 promise: offline on any device |
| Adaptive BrowserAdapter init | HIGH | LOW | P1 | Wires device probe to adapter selection |
| Template engine | HIGH | MEDIUM | P1 | Removes Tier 3 dependency for structured output |
| Sanitization ONNX classifier | HIGH | HIGH | P1 | Privacy gate — the "privacy-first" differentiator |
| OpenAI cloud adapter | HIGH | MEDIUM | P1 | Largest user request; unlocks Grok/corporate |
| Grok/xAI cloud adapter | MEDIUM | LOW | P1 | Free given OpenAI adapter |
| Corporate endpoint adapter | MEDIUM | LOW | P1 | Free given OpenAI adapter |
| Section routing ONNX | HIGH | HIGH | P1 | Deferred from v3.0; needed for offline completeness |
| Adaptive confidence thresholds | MEDIUM | LOW | P1 | Correctness: prevent mobile over-escalation |
| Compression ONNX detector | MEDIUM | HIGH | P2 | Needs v3.0 training data to accumulate first |
| Streaming UI for OpenAI/Grok | LOW | MEDIUM | P2 | Polish; core adapters ship without it |
| WebGPU LLM opt-in on Android | LOW | MEDIUM | P2 | Experimental; WASM is the safe default |
| Priority prediction | LOW | VERY HIGH | P3 | Research spike only |
| Corporate OAuth/SAML | LOW | VERY HIGH | P3 | Out of scope without backend |

**Priority key:**
- P1: Must ship in v4.0 to deliver the milestone promise
- P2: Add after v4.0 core is validated
- P3: Future consideration or research spike

---

## Technical Constraints Specific to This Feature Set

### Device Detection Reliability

`navigator.gpu` presence confirms WebGPU API availability but not GPU memory capacity. `navigator.deviceMemory` (available in Chrome/Edge, not Firefox or Safari) gives approximate RAM in GB. Pattern:

```typescript
// Capability probe
const hasWebGPU = 'gpu' in navigator;
const adapter = hasWebGPU ? await navigator.gpu.requestAdapter() : null;
const maxBuffer = adapter?.limits.maxBufferSize ?? 0;
const deviceMemoryGB = (navigator as { deviceMemory?: number }).deviceMemory ?? 2;

// Decision: 2GB GPU buffer + 4GB device RAM = capable desktop
const deviceClass = (maxBuffer > 2_000_000_000 && deviceMemoryGB >= 4) ? 'desktop' : 'mobile-wasm';
```

**Confidence: MEDIUM** — `navigator.deviceMemory` is not available in Firefox or Safari. User-agent string heuristics fill the gap (iOS/Android → WASM) but are brittle. The fallback must always be WASM (safe default), never WebGPU LLM.

### WASM LLM Model Size Budget

| Model | WASM Size (q8) | Cold Start Download | Inference Time (WASM CPU) | Notes |
|-------|----------------|--------------------|-----------------------------|-------|
| SmolLM2-360M-Instruct | ~200MB | 30–60s (4G) | 2–8s per response | Suitable for mobile; Transformers.js compatible |
| SmolLM2-1.7B-Instruct | ~900MB | 2–4min (4G) | 10–30s per response | Too slow for interactive use on mobile |
| Phi-3.5-mini (WASM) | ~2.4GB | Very slow | Unusable on mobile | Desktop-only; use WebLLM for this |

**Decision: SmolLM2-360M-Instruct for WASM mobile path.** First-load UX must communicate download size. Cache API persists across sessions.

### Sanitization Model Approach

Two viable patterns for the sanitization ONNX classifier:

**Option A: Binary classifier** — "Does this sentence contain sensitive information? Yes/No." Fast (~20ms CPU ONNX), simple to train, but cannot identify which tokens to mask. Requires a second regex pass to locate and redact detected sensitive text.

**Option B: NER token classifier** — Labels each token as `O` (non-sensitive) or one of `PER`, `LOC`, `ORG`, `FINANCIAL`, `HEALTH`, `CRED`. Directly identifies what to mask. Heavier model (~50–100MB INT8 XLM-RoBERTa), but produces a masking map. Existing art: local-first ONNX PII scrubbers use this pattern.

**Recommendation: Option B (NER), starting with a lightweight DistilBERT-NER (~60MB INT8).** Hybrid regex handles structured PII (emails, phone numbers, SSNs) at near-zero cost; NER handles unstructured PII (names, places). Accuracy: 90%+ recall on common PII types with quantized models. Run in the embedding worker alongside the type classifier — both use ONNX Runtime Web.

**Confidence: MEDIUM** — ONNX NER in browser confirmed by multiple projects (PII 360, local-first PII scrubber with XLM-RoBERTa). GTD-specific sensitive entity patterns require domain-specific training data. Start with a pre-trained multilingual NER and fine-tune on GTD-context sensitive examples.

### Multi-Provider Cloud API Browser Compatibility

| Provider | SDK | Browser Support | CORS | Key Exposure Risk |
|----------|-----|-----------------|------|-------------------|
| Anthropic | `@anthropic-ai/sdk` | Yes (`dangerouslyAllowBrowser: true`) | CORS headers present | User-provided key, memory-only — acceptable |
| OpenAI | `openai` npm SDK | Yes (`dangerouslyAllowBrowser: true`) | CORS headers present for Chat Completions | Same as Anthropic — user key, memory-only |
| xAI Grok | OpenAI SDK, `baseURL: 'https://api.x.ai/v1'` | Inherits OpenAI SDK browser support | xAI API CORS headers confirmed | Same as OpenAI |
| Corporate/Ollama | OpenAI SDK, custom `baseURL` | Depends on endpoint CORS config | Endpoint must allow browser origin | User's own endpoint — user's responsibility |

**CORS note for corporate endpoints:** If the user's self-hosted endpoint (Ollama, LM Studio) doesn't include CORS headers, browser fetch will fail. Must surface a clear error: "Custom endpoint CORS not configured. Add `--cors` flag to Ollama or configure your proxy to allow this origin." This is a documentation and error messaging problem, not a code problem.

**Confidence: MEDIUM-HIGH** — Anthropic SDK browser support confirmed in existing code. OpenAI SDK `dangerouslyAllowBrowser` pattern confirmed in community sources. xAI OpenAI-compatible API confirmed in official docs. Corporate CORS is inherently user-environment-dependent.

### Template Engine Selection

Criteria: browser-native (no Node.js dependencies), TypeScript-friendly, tiny bundle (<5KB), supports simple interpolation and conditionals.

| Engine | Size | TypeScript | Browser | Notes |
|--------|------|------------|---------|-------|
| Eta.js | ~3KB | Yes | Yes | ESM-native, Deno/browser first. Recommended. |
| Mustache.js | ~10KB | Types available | Yes | Logic-less; insufficient for conditional entropy display |
| Handlebars | ~55KB | Types available | Yes | Too heavy for this use case |
| Template literals (plain TS) | 0KB | Native | Yes | Viable for simple cases; no template files |

**Recommendation: Eta.js for rich templates; plain TypeScript template literals for trivial cases.** Weekly review briefing requires conditionals (if entropy > threshold, show warning) and loops (for each stale section). Eta.js handles these at minimal bundle cost.

**Confidence: HIGH** — Eta.js is well-documented, maintained, browser-native. No surprises expected.

---

## Interaction with Existing Pipeline

### What Changes

```
Tier 1 handler:
  Before: always routes to BrowserAdapter (WebLLM WebGPU required)
  After:  capability probe → BrowserAdapter (WebGPU) OR WasmLlmAdapter (Transformers.js)

Tier 2 handler:
  Before: classify-type (ONNX), route-section (centroid fallback), extract-entities (Tier 1 regex)
  After:  classify-type (ONNX, unchanged), route-section (ONNX primary, centroid fallback),
          + sanitize (new ONNX sanitization classifier, runs pre-cloud not in escalation path),
          + compress-detect (ONNX, v4.x after data accumulates)

Privacy proxy (sanitizeForCloud):
  Before: string passthrough
  After:  ONNX NER inference → token masking → masked string returned

Cloud adapter:
  Before: CloudAdapter wraps Anthropic only; provider: 'anthropic' hardcoded
  After:  Multi-provider: CloudAdapter base + AnthropicAdapter + OpenAIAdapter + GrokAdapter
          + CorporateAdapter. Pre-send gate and communication log are provider-agnostic.

Template engine (new):
  New Tier 2 path for: assess-staleness, weekly-briefing, compression-explanation tasks.
  Returns structured text without LLM. Tier 3 LLM still handles: analyze-gtd, summarize.
  Task routing in pipeline.ts gains 'generate-template' task type (or existing tasks
  re-routed to templates when LLM unavailable).
```

### What Does NOT Change

- Tiered escalation logic in `pipeline.ts` — `dispatchTiered()` is unchanged
- `CONFIDENCE_THRESHOLDS` structure — extended, not replaced
- Classification log schema in Dexie — no migration needed for new features
- Approval modal flow — provider-agnostic redesign is additive
- Atom type classifier ONNX — v3.0 model continues operating unchanged
- Correction export JSONL format — unchanged

---

## Sources

- [WebLLM GitHub — mlc-ai/web-llm](https://github.com/mlc-ai/web-llm) — model list, WebGPU device detection patterns, VRAM guidance; HIGH confidence
- [WebLLM home/docs](https://webllm.mlc.ai/docs/) — official adapter API, `CreateWebWorkerMLCEngine` patterns; HIGH confidence
- [Transformers.js v3 — HuggingFace blog](https://huggingface.co/blog/transformersjs-v3) — WASM fallback, `device: 'wasm'` for mobile, SmolLM/Phi support; HIGH confidence
- [Transformers.js official docs](https://huggingface.co/docs/transformers.js/en/index) — text-generation pipeline API; HIGH confidence
- [Cross-browser local LLM via WASM — Picovoice blog](https://picovoice.ai/blog/cross-browser-local-llm-inference-using-webassembly/) — WASM LLM feasibility analysis, model size guidance; MEDIUM confidence
- [AI in Browser with WebGPU: 2025 Developer Guide](https://aicompetence.org/ai-in-browser-with-webgpu/) — WebGPU support matrix, mobile detection; MEDIUM confidence
- [Local-first ONNX PII scrubber — Medium/DEV](https://dev.to/tjruesch/a-local-first-reversible-pii-scrubber-for-ai-workflows-using-onnx-and-regex-53fb) — hybrid regex + ONNX NER pattern, XLM-RoBERTa quantized ~280MB; MEDIUM confidence
- [Building privacy-first anonymizer for LLMs — Medium](https://medium.com/@rom_55053/under-the-hood-building-a-privacy-first-anonymizer-for-llms-e74ca10fb76e) — architecture for pre-LLM sanitization; MEDIUM confidence
- [ONNX Runtime Web — onnxruntime.ai/docs/tutorials/web](https://onnxruntime.ai/docs/tutorials/web/) — browser inference setup; HIGH confidence
- [xAI Grok API — Vercel AI SDK providers](https://ai-sdk.dev/providers/ai-sdk-providers/xai) — OpenAI-compatible API, `baseURL: 'https://api.x.ai/v1'`; HIGH confidence
- [xAI API release notes — docs.x.ai](https://docs.x.ai/developers/release-notes) — Grok model availability; HIGH confidence
- [OpenAI `dangerouslyAllowBrowser` community discussion](https://community.openai.com/t/cross-origin-resource-sharing-cors/28905) — CORS and browser key handling; MEDIUM confidence
- [LLM abstraction layer: why your codebase needs one — ProxAI](https://www.proxai.co/blog/archive/llm-abstraction-layer) — multi-provider patterns; MEDIUM confidence
- [Eta.js template engine](https://eta.js.org/) — 3KB, ESM-native, browser-compatible; HIGH confidence
- [Bring your own API key: browser extension pattern — xiegerts.com](https://www.xiegerts.com/post/browser-extension-genai-key-prompts/) — user-provided key security in browser; MEDIUM confidence
- [WebGPU crash on Android Chrome — Transformers.js issue #1205](https://github.com/huggingface/transformers.js/issues/1205) — SmolVLM WebGPU OOM on Android; confirms WASM default for mobile; MEDIUM confidence (community-reported)

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Device detection and adapter branching | HIGH | `navigator.gpu`, `navigator.deviceMemory`, WebGPU adapter limits — all documented API |
| WASM LLM via Transformers.js (SmolLM2-360M) | MEDIUM-HIGH | Library confirmed compatible; SmolLM2 WASM inference speed on mobile is community-reported, not officially benchmarked for BinderOS's GTD workload |
| Sanitization ONNX NER classifier | MEDIUM | Pattern confirmed in multiple open-source projects; GTD-domain fine-tuning is novel; 90%+ recall is typical for quantized NER but not guaranteed for all PII categories |
| Template engine (Eta.js) | HIGH | Mature library, well-documented, browser-native, no surprises expected |
| OpenAI cloud adapter | HIGH | SDK is well-documented, `dangerouslyAllowBrowser: true` pattern confirmed in community |
| Grok/xAI adapter | HIGH | OpenAI-compatible API confirmed in official xAI docs; near-zero additional risk beyond OpenAI adapter |
| Corporate endpoint adapter | MEDIUM | CORS configuration is user-environment-dependent; error messaging must be clear |
| Section routing ONNX | MEDIUM | ONNX text classification pipeline is proven; PARA-domain training data must be generated (same pipeline as type classifier, but PARA semantics are less well-defined than atom types) |
| Compression ONNX detector | LOW-MEDIUM | Requires training data that doesn't yet exist (v3.0 correction data must accumulate) |
| Adaptive confidence thresholds | MEDIUM | Threshold adjustment logic is simple; calibration values for mobile are estimated, not empirically tested |

---

*Feature research for: device-adaptive AI tiers, ONNX sanitization, template generation, multi-provider cloud — BinderOS v4.0*
*Researched: 2026-03-05*
