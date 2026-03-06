# Pitfalls Research

**Domain:** Adding device-adaptive local LLMs, ONNX sanitization classifiers, multi-provider cloud, and template-based generation to existing browser-based tiered AI system (BinderOS v4.0)
**Researched:** 2026-03-05
**Confidence:** HIGH for ONNX Runtime Web/Transformers.js operator and memory pitfalls (verified against official docs and GitHub issues); HIGH for synthetic data model-collapse patterns (multiple peer-reviewed 2025 papers agree); HIGH for WebGPU capability detection limitations (W3C spec + browser vendor docs confirmed); MEDIUM for WASM-LLM mobile constraints (wllama docs + GitHub issues + community reports, iOS-specific numbers vary by device generation); MEDIUM for multi-provider API schema mismatches (verified against official Anthropic/OpenAI docs + production routing reports); LOW for sanitization model precision/recall degradation under quantization (single GitHub issue + general NLP quantization literature, project-specific numbers will vary)

---

## Critical Pitfalls

### Pitfall 1: WebGPU Capability Detection Cannot Reliably Determine VRAM — Device Tier Logic Silently Routes Wrong

**What goes wrong:**
The v4.0 device-adaptive tier selects between WebLLM (WebGPU-accelerated, desktop) and a WASM-based small LLM (mobile/CPU fallback) based on device capability. Developers write capability detection that checks `navigator.gpu` for WebGPU presence, then assume WebGPU = desktop = adequate VRAM for a 3B parameter model. On mid-range laptops with integrated GPUs (e.g., Intel Iris Xe with 4GB shared VRAM), WebGPU is available but VRAM is insufficient for Llama-3.2-3B-Instruct-q4f16 (~2.2GB). The model load appears to start, then OOM-crashes mid-download with a vague "Device lost" error that surfaces in the console as a WebGPU context loss — not an out-of-memory error. The app enters a broken state: browser adapter is "loading," never transitions to "error," and subsequent requests hang.

**Why it happens:**
The WebGPU spec deliberately does not expose total VRAM through `requestAdapterInfo()` or `device.limits`. The only usable proxy is `device.limits.maxBufferSize` — the per-allocation limit — which indicates the largest single tensor that can be allocated, not whether the full model fits. Developers mistake "WebGPU is available" for "GPU is adequate," which is true on gaming-class discrete GPUs but false on integrated graphics sharing system RAM. The WebLLM error path also has a known issue where context loss during model loading does not reliably invoke the `onStatusChange` error callback (confirmed in mlc-ai/web-llm GitHub issues).

**How to avoid:**
- Never use WebGPU presence alone as the tier-selection signal. Use a compound check: (1) `navigator.gpu !== undefined`, (2) `device.limits.maxBufferSize >= model_largest_tensor_size`, and (3) a heuristic from `navigator.deviceMemory` (where available, Chrome only). Gate WebLLM on maxBufferSize >= 2GB for 3B models; gate on >= 800MB for 1B models.
- Implement a hard timeout (30 seconds) on `BrowserAdapter.initialize()`. If the Promise does not resolve within the timeout, force-transition status to 'error' and trigger the WASM-LLM fallback. Do not rely solely on WebLLM's internal error propagation.
- After `CreateWebWorkerMLCEngine()` completes, immediately run a tiny inference test (single token) to confirm the engine is functional. If this sentinel inference throws, mark the adapter as error and escalate to WASM fallback.
- Expose a manual override in settings: "Use CPU-only mode (slower, more compatible)" so users can force WASM-LLM without waiting for a failed WebGPU attempt.

**Warning signs:**
- Capability detection code reads only `navigator.gpu !== undefined` without checking `device.limits`
- No timeout on `BrowserAdapter.initialize()` — it can hang forever on OOM
- No sentinel inference after initialization
- User-facing status remains "loading" indefinitely on integrated GPU machines
- No fallback path from BrowserAdapter error to WASM-LLM adapter

**Phase to address:** Device-adaptive Tier 1 phase. Capability detection logic must be designed and tested before any model download UI is built.

---

### Pitfall 2: WASM-LLM on iOS Safari Silently Degrades to Broken Single-Thread Mode

**What goes wrong:**
Adding a WASM-based LLM (e.g., wllama/llama.cpp-wasm) as the mobile fallback for Tier 1 works on Android Chrome and desktop Firefox but produces unusable inference latency on iOS Safari. The root cause is that iOS Safari disables multi-threaded WebAssembly even when COOP/COEP headers are correctly set — every browser on iOS must use Apple's WebKit, and as of 2026-03, SharedArrayBuffer (required for WASM threads) is conditionally available on iOS only if the page is cross-origin isolated AND the browser is Safari 15.2+. But wllama and llama.cpp-wasm automatically fall back to single-threaded WASM when SharedArrayBuffer is unavailable, which is 30–100x slower than multi-threaded. A Llama 3.2-1B model that runs at 10–15 tokens/second on Android Chrome runs at 0.3–1 token/second in single-threaded iOS Safari — unusable for any interactive feature. Developers testing on Android assume mobile support is working.

**Why it happens:**
iOS Safari's threading model is categorically different from other browsers. Every iOS browser (Chrome iOS, Firefox iOS, Edge iOS) is a WebKit wrapper — Safari restrictions apply to all of them. WASM SIMD is available on Safari 16.4+ (required for any reasonable LLM inference speed), but multi-threading requires COOP/COEP plus Apple's own internal toggle. The 2GB ArrayBuffer limit on iOS Safari (documented in Godot Engine GitHub issues and ONNX Runtime issues) means models over 2GB cannot be loaded regardless of threading. The combination of single-thread fallback + SIMD dependency + 2GB limit makes 1B+ parameter models practically unusable on iOS.

**How to avoid:**
- iOS must be treated as a "Tier 2 + cloud only" target for v4.0, not a WASM-LLM target. Detect iOS explicitly: `navigator.userAgent.includes('iPhone') || navigator.userAgent.includes('iPad')` combined with checking SharedArrayBuffer availability. On iOS, skip WASM-LLM initialization entirely and route directly to Tier 2 ONNX classifiers + Tier 3 cloud.
- Do not advertise "local LLM on mobile" for iOS. The UX should state "Offline AI (ONNX classifiers)" for iOS and "Full local AI" for Android/desktop.
- For Android Chrome, validate WASM-LLM performance against a sentinel benchmark (time a fixed 50-token prompt completion) on first initialization. If tokens/second < 2, offer the user a warning: "Local AI is very slow on this device. Consider using cloud AI for better results."
- Model size hard cap: never attempt to load a model > 1.5GB on mobile WASM path (wllama's 2GB ArrayBuffer limit minus OS overhead).

**Warning signs:**
- Testing of "mobile WASM-LLM" done only on Android devices, not iOS
- No iOS-specific code path in device capability detection
- Inference latency not measured post-initialization (no sentinel benchmark)
- No model size cap in WASM-LLM adapter configuration
- User reports of "infinite loading" on iPhone that appear after launch

**Phase to address:** Device-adaptive Tier 1 phase. iOS exclusion must be decided before implementation, not discovered in testing.

---

### Pitfall 3: Multi-Provider Cloud Adapter Breaks on Structural API Differences Between Anthropic, OpenAI, and Grok

**What goes wrong:**
Extending the existing CloudAdapter (Anthropic-only) to support OpenAI and Grok by sharing the same adapter interface and prompt format produces systematically wrong behavior. Three specific failure modes appear: (1) JSON schema passed as `jsonSchema` to the existing AIRequest interface is forwarded to OpenAI using Anthropic's `tool_use` format (which OpenAI rejects with a 400 error), (2) streaming response chunks from OpenAI's SSE format (`data: {"choices":[...]}`) are not parsed the same way as Anthropic's streaming events (`event: content_block_delta`), causing the `onChunk` callback to receive raw JSON strings instead of text fragments, and (3) Grok's API uses OpenAI-compatible endpoints but not OpenAI's structured output schema — `strict: true` on function calling is silently ignored, returning unvalidated JSON that breaks the existing response parsers.

**Why it happens:**
The existing `AIRequest` interface was designed around Anthropic's API semantics. Structured output, streaming protocol, error formats, rate limit headers, and even the `system` message placement differ between providers. Developers add a `provider: 'openai' | 'anthropic' | 'grok'` flag to the adapter and use `if (provider === 'openai')` branches, but the branches miss edge cases in JSON schema translation (nested `$ref`, `oneOf`, `anyOf` — all of which are valid in the current GTD task schemas and all of which translate differently between providers). The Anthropic SDK's `dangerouslyAllowBrowser: true` pattern is safe for all three providers since users supply their own keys, but each SDK initializes differently and error handling needs provider-specific mapping.

**How to avoid:**
- Do not extend `CloudAdapter` with provider branching. Create a separate adapter class per provider: `AnthropicAdapter` (existing, renamed), `OpenAIAdapter`, `GrokAdapter`. Each implements the `AIAdapter` interface independently. Share only the pre-send approval gate and key-vault logic via a `CloudAdapterBase` mixin or utility functions.
- Define a canonical `StructuredOutputRequest` type that each adapter translates to its own provider format. This translation must be tested with the full GTD JSON schema (including nested schemas) before any provider goes to production.
- For streaming: define a `StreamChunk` interface with `text: string` and implement provider-specific parsers that map raw SSE events to `StreamChunk`. The `onChunk` callback always receives `StreamChunk`, never raw SSE data.
- Test all providers with the same 10 canonical GTD prompts that exercise: (a) plain text response, (b) JSON schema output, (c) streaming with onChunk, (d) rate limit error (mock), (e) timeout/abort. Any provider that cannot pass all 5 categories should not ship.
- Maintain a provider compatibility matrix in code comments: which features each provider supports (structured JSON, streaming, tool calling, system messages) and the known behavioral differences.

**Warning signs:**
- Single `CloudAdapter` class growing with `if (this.provider === ...)` branches
- JSON schema passed directly to OpenAI without translation from Anthropic format
- `onChunk` callback receiving raw SSE data strings rather than parsed text
- No test suite exercising each provider independently with the full GTD schema set
- CORS errors appearing only for OpenAI/Grok but not Anthropic (indicates missing or wrong request headers per provider)

**Phase to address:** Multi-provider cloud phase. Provider-specific adapter classes must be designed before any provider integration starts, not refactored after.

---

### Pitfall 4: Sanitization Model Training Data Creates False Precision — Regex-Caught PII Becomes a Proxy for All PII

**What goes wrong:**
Training an ONNX sanitization classifier to detect sensitive data before cloud transmission requires labeled training data. The fastest path is generating training examples by taking real GTD prompts and running them through a regex-based PII detector (emails, phone numbers, SSNs, URLs) to create "sensitive" labels. The trained model learns to detect the same patterns the regex catches — structured, predictable PII. It misses soft PII: person names embedded in task descriptions ("Follow up with Dr. Martinez about test results"), organizational affiliations ("Prepare for Q3 board presentation"), financial context ("Budget review: $340K shortfall"), and health context ("Take insulin at 8am"). Users who enable the sanitization gate believe their data is protected when it is not — the model provides false assurance for the majority of sensitive content while reliably catching only the minority of structured PII.

**Why it happens:**
Regex-generated labels are cheap and accurate for structured PII. Soft PII (names, orgs, financial figures, medical context) requires human annotation or a larger language model to label, which is slower and introduces subjectivity. Developers use the fast path and validate on the regex-generated test set, achieving 95%+ accuracy — on the same easy inputs the model was trained on. The model is a sophisticated implementation of the regex it was trained against.

**How to avoid:**
- Explicitly exclude regex-detectable PII from the sanitization model's training data for the first iteration. The regex layer already handles structured PII; the ONNX model should be trained exclusively on soft PII examples where regex fails. This separates concerns clearly.
- Architecture: sanitization pipeline = (1) regex layer for structured PII, then (2) ONNX NER model for soft PII, then (3) user-controlled allowlist. The ONNX model's job is to catch what regex misses.
- Training data for the ONNX soft-PII layer must include: person names in task contexts, organization names, financial amounts with context, health/medical references, location-specific references. Generate via LLM prompt: "Generate 20 GTD task descriptions that would be embarrassing or harmful if shared publicly but contain no email addresses, phone numbers, or URLs."
- Test the sanitization model against a manually curated "embarrassing sentences" test set (not programmatically generated) — 50 examples that a reasonable person would not want sent to a cloud API.
- Explicitly communicate to users what the sanitization model does and does not catch. The existing `SANITIZATION_LEVEL_DESCRIPTIONS` in `privacy-proxy.ts` can be extended: "Structured data (emails, phone numbers): always redacted. Personal names: detected with ~80% accuracy. Other sensitive context: not detected — use 'abstract' level for maximum privacy."

**Warning signs:**
- Sanitization training data generated entirely by regex labeling
- Test set accuracy > 95% on first iteration (model learned regex, not semantics)
- No "embarrassing sentences without structured PII" examples in the test set
- The architecture docs show sanitization as a single ONNX model, not a pipeline (regex + ONNX + allowlist)
- Privacy gate documentation does not list what it does NOT catch

**Phase to address:** Sanitization model training phase, before the model is integrated into the cloud transmission path. The false-precision failure is invisible until a user's sensitive data reaches a cloud provider.

---

### Pitfall 5: ONNX Quantization Destroys Recall on Sanitization NER Model — Precision Stays High, Recall Collapses

**What goes wrong:**
A token-classification ONNX model trained for PII/sensitivity detection (NER-style: token-level labels for SENSITIVE/NON-SENSITIVE spans) shows acceptable F1 on the Python-side full-precision model. After INT8 quantization for browser deployment, precision remains high (few false positives) but recall collapses: the quantized model misses 30–40% of sensitive spans it caught before quantization. This is the opposite of the naive expectation (quantization causes uniform degradation). The result is a sanitization gate that looks precise (rarely flags non-sensitive text) but has Swiss-cheese recall — it lets substantial sensitive content through. Users trust the gate because it does not over-flag; it under-flags.

**Why it happens:**
INT8 quantization affects token-classification models asymmetrically. The model's CLS-like span boundaries (the zero-point decisions that determine where a sensitive span begins and ends) are computed using matrix multiplication with quantized weights, where rounding errors accumulate in the low-activation path (non-sensitive tokens). The high-activation path (clearly sensitive tokens) is more robust to rounding. So the model reliably labels "definitely sensitive" spans while missing "borderline sensitive" spans — exactly the ambiguous cases that require catching. This quantization recall-collapse pattern was documented in the `huggingface/optimum` GitHub issues (Issue #151) for LaBSE-based models and is reproducible for any token-classification model with INT8 dynamic quantization.

**How to avoid:**
- Do not use INT8 quantization for the sanitization model. Use INT8 dynamic quantization only for the type-classification ONNX model (already validated in v3.0). For the sanitization NER model, use FP16 or Q8 (8-bit float, not integer) as the quantization target.
- Alternatively, use a sequence-classification approach (full sentence → SENSITIVE/NON-SENSITIVE binary output) rather than token classification. Sequence classification degrades more gracefully under quantization because the final pooled representation is more robust than per-token boundaries.
- Measure precision AND recall separately after quantization. A model that achieves 0.95 precision and 0.60 recall is not good enough for a privacy gate, even if F1 appears acceptable (~0.74). For privacy enforcement, recall matters more than precision.
- Set the acceptance threshold: require recall >= 0.85 on the sensitive-spans test set before shipping the quantized model. If recall < 0.85 with INT8, use FP16.

**Warning signs:**
- Sanitization model evaluated only on F1 score, not precision and recall separately
- INT8 quantization applied to the sanitization model without recall-specific testing
- Token classification (NER-style) chosen over sequence classification without quantization-specific rationale
- No minimum recall threshold defined in the training pipeline acceptance criteria
- Test set contains mostly structured PII (which is robust to quantization) rather than soft PII

**Phase to address:** Sanitization model training phase and ONNX export/quantization step. Quantization strategy for the sanitization model must be different from the type-classification model (v3.0) — do not reuse the same quantization approach by default.

---

### Pitfall 6: Template Engine Produces Output That Is Semantically Correct But Incoherent at Scale — Context Signals Are Not Grounded

**What goes wrong:**
Template-based generation (using entropy signals, section names, and atom counts to fill Handlebars/string-template slots) works well for deterministic briefing phrases like "You have 7 stale tasks in Projects, your oldest is 14 days old." It fails for higher-level synthesis: "Here's what stood out this week..." filled from entropy deltas produces technically accurate but contextually meaningless output — the template cannot reason about *which* 7 tasks matter or why. Users receive review briefings that feel like a database export in paragraph form, not insight. This gap was acceptable when the template was supplementary to Tier 3 LLM output. When the template replaces Tier 3 LLM output entirely (the v4.0 mobile offline scenario), the quality gap becomes the primary product experience.

**Why it happens:**
Templates are signals-driven; insight requires context-sensitive synthesis. Entropy score, atom age, section name, and priority value are all quantitative signals that templates can inject cleanly. The *relationship* between signals — why the combination of high-entropy Projects + zero completed Tasks + 3 overdue Events constitutes a specific insight — requires reasoning, not substitution. Developers underestimate this gap because template output looks plausible in isolation (each sentence is accurate) but fails to cohere across the full briefing.

**How to avoid:**
- Design templates as augmentation for Tier 2, not replacement for Tier 3. On mobile (no LLM), templates produce a structural briefing; users who want narrative synthesis are told "Enable cloud AI for enhanced briefings." Do not attempt to replicate Tier 3 output quality with templates — acknowledge the capability tier explicitly.
- Identify which features genuinely require no synthesis (entropy score alerts, stale counts, section health summary) and which require synthesis (weekly review narrative, compression explanations, project status). Only the first category should use pure templates in offline mode.
- For compression explanations and review flow in offline mode: use a hybrid — template provides structure, entropy signals provide numbers, and a fixed set of curated "insight phrases" selected by signal thresholds provide qualitative framing. This is not synthesis, but it produces qualitatively better output than pure slot-filling.
- Test template output with real user sessions: print 20 template-generated briefings from a seeded dataset and have a reviewer rate them 1–5 for coherence. Set a minimum coherence threshold (>= 3.0 average) before shipping. If templates score below threshold, reduce their scope rather than accepting bad output.

**Warning signs:**
- Template strings contain more than 3 variable slots — each additional slot reduces output coherence
- Template output tested only by checking that variables are substituted, not by reviewing the resulting prose
- Review briefing templates attempt to produce "insight" by combining 4+ signals without explicit reasoning logic
- No user-facing acknowledgment that offline mode produces simplified output versus cloud mode
- Template quality evaluated against "does it compile" rather than "does a human find it useful"

**Phase to address:** Template engine phase. Template scope must be bounded before implementation. The "what templates cannot do" constraints must be defined before any template is written.

---

### Pitfall 7: Privacy Gate Race Condition — ONNX Sanitization Completes After Pre-Send Approval Modal Shows

**What goes wrong:**
The v4.0 architecture adds ONNX sanitization as a Tier 2 pre-flight check before cloud transmission. The intended flow is: (1) user triggers cloud AI request, (2) ONNX sanitization runs (~50–200ms), (3) sanitized prompt is shown in pre-send approval modal, (4) user approves. In practice, the pre-send approval modal (existing `CloudRequestPreview` in `cloud.ts`) is triggered immediately after the request enters `execute()`, before sanitization completes. The modal shows the pre-sanitization prompt. The user sees and approves prompt content that does not match what is actually sent. If sanitization redacts content from the prompt, the modal showed a more detailed prompt than what was dispatched — less alarming than the reverse, but still a consent violation.

**Why it happens:**
The existing `CloudAdapter.execute()` creates the `logEntry` from the input `request.prompt` and then immediately calls `onPreSendApproval(logEntry)`. Sanitization happens before `logEntry` creation (via `sanitizeForCloud()`), but only with the text-level sanitization from `privacy-proxy.ts` — not ONNX model-based sanitization. When ONNX sanitization is added as an async step, it naturally comes before the modal, but only if the execution order is explicitly designed for it. If the ONNX sanitization call is added after the modal call (a common mistake when adding a new step to existing code), the modal shows unsanitized content.

**How to avoid:**
- Enforce the execution order in code with explicit typing: create a `SanitizedPrompt` branded type (e.g., `type SanitizedPrompt = string & { readonly __brand: 'sanitized' }`) that the modal's input type requires. The ONNX sanitizer is the only function that returns `SanitizedPrompt`. `logEntry.sanitizedPrompt` must be `SanitizedPrompt` type — if the ONNX step has not run, the code will not compile.
- Add a test: modal content must equal what is actually sent to the API. Capture both `logEntry.sanitizedPrompt` (shown to user) and the actual request body (sent to provider) in tests and assert equality.
- The `logEntry` must be constructed *after* ONNX sanitization completes. Never construct a log entry from the raw input `request.prompt`.

**Warning signs:**
- `logEntry` constructed before the ONNX sanitization step runs
- Modal shows `request.prompt` directly rather than `sanitizedPrompt`
- No type distinction between `rawPrompt` and `sanitizedPrompt` in the adapter code
- Integration test does not verify modal content matches sent payload

**Phase to address:** Sanitization integration phase (wiring ONNX sanitizer into cloud adapter). This pitfall is invisible in functional testing if testers do not explicitly verify modal content against actual sent payload.

---

### Pitfall 8: Expanding the Embedding Worker to 4+ ONNX Models Causes Cumulative Memory Exhaustion

**What goes wrong:**
v4.0 adds new ONNX classifiers (section routing, compression detection, priority prediction, sanitization) to the embedding worker alongside the existing MiniLM pipeline and type-classification model. Each ONNX `InferenceSession` holds the model weights in the worker's WASM heap. Adding 4 more models (even if each is 10–30MB quantized) accumulates 50–100MB+ in a single worker's heap. On desktop this is manageable; on mobile (4GB RAM device, 1GB available to browser, worker memory limits enforced by the browser) the worker crashes with `RangeError: WebAssembly.Memory: Requested initial size is too large`. This crash terminates all Tier 2 classification silently — the embedding worker closes and the main thread's message promises never resolve.

**Why it happens:**
Workers have independent memory spaces but share the browser's overall memory quota. Mobile browsers enforce stricter per-worker limits than desktop. Adding models to the same worker is convenient (shared embedding pipeline, single message protocol) but each additional `InferenceSession.create()` adds to the peak memory. The peak occurs when all sessions are loaded simultaneously at worker init — which happens because v3.0's `void loadClassifier()` pattern at worker startup will be replicated for each new classifier.

**How to avoid:**
- Split workers by function: keep the embedding worker (MiniLM + type classifier) as-is. Create a separate `classifier-worker.ts` for new ONNX classifiers (section routing, compression, priority). Create a third `sanitization-worker.ts` for the sanitization model (it needs to run before cloud requests, not in the same hot path as triage classification).
- Load ONNX sessions lazily per task, not eagerly at worker startup. Only load a classifier when a request for that task type arrives. Use a `Map<task, InferenceSession>` in each worker.
- Implement a memory budget check before loading any new session: if `performance.memory?.usedJSHeapSize > 200MB` (Chrome-only API, treat as advisory), skip eager loading and wait for explicit request.
- The existing v3.0 pattern of loading the classifier immediately at worker startup (`void loadClassifier()`) should be changed to a lazy-on-first-use pattern for all new classifiers.

**Warning signs:**
- All ONNX models loaded in the same `embedding-worker.ts`
- `void loadClassifier()` pattern called at startup for each new model added
- No test of peak worker memory with all models loaded simultaneously
- Worker crashes reproduce on low-memory devices but not developer machines
- Main thread's pending message promises accumulate (leak) when worker crashes

**Phase to address:** ONNX expansion phase (adding new classifiers). Worker architecture must be revisited before adding any new models — the single-worker pattern does not scale to 5+ models.

---

## Retained Pitfalls from v3.0 (Remain Fully Applicable)

The following pitfalls from the v3.0 research remain valid and unresolved for v4.0. They are summarized here with their v4.0 implications.

### Pitfall 9 (was 1): ONNX Export Numerical Mismatch Between Python and Browser WASM

The new sanitization and expanded classifier models must each go through browser-runtime validation (using `onnxruntime-web` in Node.js, not Python `onnxruntime`). v4.0 adds 3–4 new models, each requiring independent validation. The v3.0 validation script (`04_validate_model.mjs`) must be extended or replicated for each new model.

**v4.0 implication:** The sanitization model's NER-style output (token-level probabilities) is more sensitive to numerical mismatch than the type-classification softmax output. Use opset 17 or lower; apply `onnxsim` before quantization.

**Phase to address:** Each new ONNX model training pipeline phase.

---

### Pitfall 10 (was 2): Synthetic Training Data Distribution Gap on Real User Input

For the sanitization model specifically, this pitfall is more severe: synthetic sensitive data is often over-explicit ("My SSN is 555-12-3456") while real sensitive data is embedded in context ("The accountant confirmed the number from my file"). The sanitization model's synthetic data must be generated with this distribution gap in mind.

**Phase to address:** Sanitization model synthetic data generation phase.

---

### Pitfall 11 (was 3): COOP/COEP Headers Break External Resources for WASM Multi-Threading

Adding WASM-LLM (wllama) multiplies this risk: wllama explicitly requires COOP + COEP headers for multi-threaded inference. If BinderOS adds these headers for WASM-LLM, all resources without `Cross-Origin-Resource-Policy` headers break. The ONNX Runtime Web single-thread fallback already avoids this (v3.0 solved it). The new WASM-LLM worker adds the requirement back.

**v4.0 implication:** Use `Cross-Origin-Embedder-Policy: credentialless` (Chrome 96+, Firefox 119+) instead of `require-corp`. Verify wllama multi-threading works with `credentialless` before shipping.

**Phase to address:** WASM-LLM integration phase.

---

### Pitfall 12 (was 5): Model-Collapse Feedback Loop in Classification Log

The expanded ONNX classifiers (section routing, compression) will each write to the classification log. Each new task type adds a new collapse risk if correction data is not tracked per-task. The `modelSuggestion` field in the log must cover all task types, not just type-classification.

**Phase to address:** ONNX expansion integration phase.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Extending `CloudAdapter` with provider branching (`if provider === 'openai'`) | One file to maintain | Schema mismatches compound with each provider; edge cases multiply; the file becomes untestable | Never for production — separate adapter classes per provider |
| Reusing v3.0 INT8 quantization for the sanitization NER model | No new quantization tooling needed | Recall collapses on soft PII (borderline sensitive spans); users trust a leaky privacy gate | Never — sanitization model must use FP16 or Q8, not INT8 |
| Adding all new ONNX models to the existing embedding worker | No new worker infrastructure | Cumulative memory exhaustion on mobile; OOM crash silences all Tier 2 | Never for mobile-targeted deployment — use dedicated workers |
| Using `navigator.gpu !== undefined` as the sole WebGPU capability check | Simple one-liner | OOM crashes on integrated GPUs; "loading" state that never resolves; silent fallback failure | Never — must include `maxBufferSize` check and sentinel inference |
| Treating iOS as a supported WASM-LLM target | "Cross-platform" claim | Single-threaded iOS WASM-LLM is unusable (<1 token/second for 1B models); ruins mobile experience | Never — iOS must be explicitly excluded from WASM-LLM, routed to Tier 2 + cloud |
| Pre-filling template slots from all available entropy signals (>3 signals per sentence) | Rich-seeming output | Incoherent briefing prose; template output becomes a data dump rather than a useful summary | Never for user-facing narrative — limit to 2 signals per template clause |
| Constructing cloud request log entry from `request.prompt` before ONNX sanitization runs | Quick implementation | Pre-send approval modal shows unsanitized content; consent violation; privacy audit failure | Never — log entry must use post-sanitization prompt |
| Adding `dangerouslyAllowBrowser: true` to OpenAI SDK without a key-in-memory-only constraint | Enables browser API calls | User API key exposed to any script injected on the page if XSS occurs; key logging | Only acceptable with the same key-vault pattern used for the existing Anthropic adapter (key in JS memory, never persisted to localStorage/IndexedDB) |

---

## Integration Gotchas

Common mistakes when wiring new v4.0 capabilities into the existing system.

| Integration Point | Common Mistake | Correct Approach |
|-------------------|----------------|------------------|
| Device capability detection | Checking `navigator.gpu` alone for tier selection | Compound check: `navigator.gpu` + `device.limits.maxBufferSize` + `navigator.deviceMemory` heuristic |
| WASM-LLM on mobile | Testing only on Android, not iOS | Explicit iOS detection; route iOS to Tier 2 + cloud only; test on actual iOS device |
| Multi-provider cloud | Single adapter with provider flag | Separate adapter class per provider; shared pre-send approval and key-vault utilities only |
| Sanitization model in cloud flow | Adding ONNX sanitization after `logEntry` creation | `logEntry` must be constructed after sanitization; use branded type to enforce order |
| New ONNX models in existing worker | `void loadClassifier()` at startup for each model | Lazy loading on first request; separate workers for classification vs. sanitization |
| Template engine scope | Writing templates for all features including narrative insight | Templates for deterministic facts only; acknowledge capability tier in UX for offline mobile |
| Provider-specific streaming | Using the `onChunk` callback for raw SSE data | Each adapter implements its own SSE parser; `onChunk` always receives parsed text string |
| Grok/OpenAI JSON schema | Passing Anthropic-format schemas directly | Translate canonical `StructuredOutputRequest` to each provider's format in the adapter |
| WASM-LLM + COOP/COEP | Adding `require-corp` COEP for wllama threading | Use `credentialless` COEP; verify wllama threading works with credentialless before shipping |
| Worker memory budget | Assuming desktop memory budget applies to mobile | Check `performance.memory?.usedJSHeapSize` as advisory; cap per-worker model load |

---

## Performance Traps

Patterns that work at small scale but fail under real usage.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Loading all ONNX classifiers eagerly at worker startup | Worker startup takes 3–5 seconds; mobile OOM crash on devices with <2GB available | Lazy load classifiers on first use; defer non-critical classifiers until after first user interaction | At 3+ classifiers in the same worker on 4GB RAM mobile devices |
| Running sanitization ONNX synchronously in the cloud request hot path | Cloud requests feel slow (200–500ms added); user perceives cloud as broken | Pre-warm sanitization session in idle background; run sanitization in dedicated worker; cache result for identical prompts | On every cloud request when sanitization adds visible latency |
| Sentinel inference for WebGPU validation running the full model | First-time initialization takes 2x longer; download progress appears complete but model seems unresponsive | Sentinel inference must be a single token, not a representative prompt | On large models (3B+) where even a 1-sentence prompt requires significant compute |
| Re-creating `InferenceSession` per request for ONNX classifiers | Each classification takes 500ms+ (session creation dominates) | Create `InferenceSession` once per classifier type; keep alive for the worker's lifetime | On any device if session is not cached between requests |
| Template rendering with real-time entropy recalculation on every briefing open | Briefing renders slowly because entropy signals are recomputed | Template rendering must use pre-computed entropy snapshot from store; never call entropy computation during render | On stores with >100 atoms when entropy calculation is synchronous |
| WASM-LLM inference blocking the Tier 2 classification queue | Triage requests queue behind an LLM inference and time out | WASM-LLM worker is dedicated and separate from the Tier 2 classification worker; queues do not share | Immediately when both WASM-LLM and ONNX classification are active simultaneously |

---

## Security Mistakes

Domain-specific security issues for v4.0's expanded cloud and privacy gate capabilities.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Sanitization model providing false confidence — UI says "sanitized" but soft PII passes through | User sends medical, financial, or personal relationship context to cloud provider under false assurance | Display explicit limitations: "Emails and phone numbers: always removed. Names and context: best-effort. Use 'abstract' level for maximum privacy." Never label partial sanitization as complete |
| Storing OpenAI/Grok API keys in localStorage "for convenience" | Any XSS attack on the page extracts all provider keys permanently | All provider keys use the same memory-only key-vault pattern as the existing Anthropic key; session consent per provider |
| Pre-send approval modal showing raw prompt before ONNX sanitization completes | User approves transmission of more data than they see in the modal | Enforce typed `SanitizedPrompt` — modal input type requires the branded type returned by the sanitizer |
| WASM-LLM model download from untrusted URL without integrity check | Man-in-the-middle attack substitutes a model that produces adversarial outputs | SHA-256 hash verification of all model files before loading into WASM runtime; reject if hash mismatch |
| Corporate LLM integration storing endpoint URL + bearer token together in an insecure config | Internal corporate API credentials exposed in browser storage | Corporate LLM credentials use the same key-vault with a separate namespace; endpoint URL is non-secret and can be stored in user config; only the bearer token needs memory-only storage |
| Cloud log recording full prompts (including post-sanitization content) | Communication log itself becomes a privacy leak in the Dexie config table | Log only the first 100 characters of sanitized prompt (already implemented in `cloud.ts`); confirm this limit applies across all new provider adapters |

---

## UX Pitfalls

Common user experience mistakes when exposing device-adaptive AI to users.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No visible indication that the app is in "mobile offline" mode (Tier 2 + templates only) | User expects LLM-quality output; receives template output; perceives app as broken | Status indicator: "AI mode: Smart offline (no narrative AI)" vs "AI mode: Full local AI" vs "AI mode: Cloud AI active" |
| Showing WebGPU model download progress on a device that will OOM mid-download | User waits through a multi-GB download for an experience that fails at the end | Validate device capability with a 30-second sentinel before initiating any model download; show capability check status before download |
| Treating WASM-LLM and WebLLM as equivalent "local AI" in the settings UI | User enables "local AI" on iOS, gets invisible degradation to unusable single-threaded WASM | Settings must distinguish: "GPU-accelerated local AI (desktop/Android)" vs "Basic offline AI (ONNX only, recommended for mobile)" |
| Pre-send approval modal not identifying which provider is receiving the request | User approved "cloud AI" in general but not aware their data goes to OpenAI specifically (or vs. Anthropic) | Pre-send modal must show provider name, endpoint, model name explicitly: "Sending to OpenAI gpt-4o-mini" |
| ONNX sanitization failure (model not loaded) silently allowing unsanitized prompts through | User believes sanitization gate is active; cloud receives full prompt | If sanitization ONNX fails to load, the cloud adapter must fall back to the text-level abstract sanitization and show a warning: "Privacy gate unavailable — using basic sanitization only" |
| Template briefing shown on mobile without explaining it is simplified | User compares mobile and desktop experiences; perceives mobile as broken | Explicit inline note on mobile: "This is a simplified briefing (offline mode). Enable cloud AI for narrative insights." |

---

## "Looks Done But Isn't" Checklist

Things that appear complete in demos but are missing critical production pieces.

- [ ] **Device capability detection:** Often missing `maxBufferSize` check — verify that `navigator.gpu` is paired with a buffer size gate and a 30-second initialization timeout before a model download starts
- [ ] **iOS WASM-LLM exclusion:** Often missing explicit iOS detection — verify that `navigator.userAgent` check for iOS routes to Tier 2 + cloud, not WASM-LLM, and that this is tested on an actual iOS device
- [ ] **Multi-provider adapter separation:** Often missing — verify that OpenAI, Anthropic, and Grok each have their own adapter class, not branches in a single class, and that each is independently tested with the GTD JSON schema suite
- [ ] **Sanitization model recall:** Often evaluated only on F1 — verify that recall >= 0.85 on the soft-PII test set (names, financial context, health context) before shipping the quantized model
- [ ] **Sanitization execution order:** Often wrong — verify that `logEntry.sanitizedPrompt` is constructed after ONNX sanitization completes, and that the pre-send modal displays the post-sanitization prompt
- [ ] **Worker memory budget:** Often untested on mobile — verify peak worker heap with all classifiers loaded on a 4GB RAM device (use Chrome DevTools memory profiler with mobile device emulation)
- [ ] **Template scope bounded:** Often over-extended — verify that templates handle only deterministic signal substitution and that features requiring synthesis acknowledge the capability gap explicitly in the UX
- [ ] **COOP/COEP with `credentialless`:** Often set to `require-corp` — verify that wllama threading works with `credentialless` COEP and that no existing resources break when the header is added
- [ ] **Grok/OpenAI streaming parser:** Often missing — verify that `onChunk` receives parsed text (not raw SSE frames) for each non-Anthropic provider
- [ ] **Sanitization model quantization type:** Often INT8 by default — verify that the sanitization model uses FP16 or Q8 (not INT8) and that recall is measured post-quantization before integration

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| WebGPU OOM crash during model download on integrated GPU | MEDIUM | Implement 30-second timeout + sentinel inference; force fallback to WASM-LLM or Tier 2 only; add `maxBufferSize` gate to prevent future attempts on the same device |
| iOS WASM-LLM unusable performance discovered post-launch | MEDIUM | Ship emergency update: detect iOS and redirect to Tier 2 + cloud; add settings note explaining the limitation; no data loss involved |
| Multi-provider adapter schema mismatch causing 400 errors in production | MEDIUM | Roll back the affected provider adapter; keep other providers active; fix translation function for nested schemas in the adapter before re-shipping |
| Sanitization model precision/recall failure discovered post-integration | HIGH | Immediately add disclaimer to pre-send modal: "Privacy gate operating in degraded mode"; re-train with FP16 quantization; do not remove sanitization step (it still catches structured PII) |
| Pre-send modal consent violation (shows unsanitized prompt) | HIGH | Emergency patch: construct `logEntry` after sanitization; add branded type enforcement; audit all provider adapters for same bug; notify users that a consent issue was fixed |
| Worker OOM crash silencing Tier 2 on mobile | MEDIUM | Add worker crash recovery: detect Promise timeout (>10s), restart worker, reload models lazily; split monolithic worker into separate workers |
| Template briefings receiving user complaints for incoherence | LOW | Reduce template scope to pure signal substitution; add explicit "offline mode — simplified" framing; do not attempt to add synthesis logic to templates without LLM backbone |
| Grok/OpenAI streaming parser delivering raw SSE to onChunk | LOW | Fix the provider adapter's SSE parser; SSE data is visible in network tab, trivial to diagnose; no data loss |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| WebGPU VRAM detection failure (Pitfall 1) | Device-adaptive Tier 1 phase | Compound capability check passes on integrated GPU laptop; 30s timeout resolves gracefully; sentinel inference confirms engine |
| iOS WASM-LLM unusable (Pitfall 2) | Device-adaptive Tier 1 phase | iOS device routes to Tier 2 + cloud only; no WASM-LLM initialization attempted |
| Multi-provider API schema mismatch (Pitfall 3) | Multi-provider cloud phase | Each provider passes 5-category GTD prompt test suite independently |
| Sanitization model false precision on soft PII (Pitfall 4) | Sanitization model training phase | Soft-PII test set (names, financial, health context) coverage >= 80% recall |
| Sanitization quantization recall collapse (Pitfall 5) | Sanitization ONNX export phase | Post-quantization recall >= 0.85; FP16 or Q8 quantization confirmed |
| Template incoherence at scale (Pitfall 6) | Template engine phase | Coherence review (>= 3.0 average human rating); template scope bounded to <= 2 signals per clause |
| Privacy gate race condition (Pitfall 7) | Sanitization integration phase | `SanitizedPrompt` branded type enforced; modal content verified against sent payload in integration test |
| Worker memory exhaustion (Pitfall 8) | ONNX expansion phase | Peak worker heap < 150MB with all models loaded; mobile OOM does not occur on 4GB RAM device |
| ONNX numerical mismatch (Pitfall 9 / v3.0 #1) | Each new model training pipeline | Browser-runtime validation script passes for each new model before integration |
| COOP/COEP breakage from wllama (Pitfall 11 / v3.0 #3) | WASM-LLM integration phase | `credentialless` COEP set; wllama threading confirmed; no resource CORP errors |
| Model-collapse in expanded log (Pitfall 12 / v3.0 #5) | ONNX expansion integration phase | `modelSuggestion` field populated for all new task types; per-class sample count reported per-task |

---

## Sources

- [WebGPU spec — device.limits.maxBufferSize](https://www.w3.org/TR/webgpu/#dom-gpudevice-limits) — VRAM proxy measurement
- [WebGPU for On-Device AI Inference — MakitSol 2025](https://makitsol.com/webgpu-for-on-device-ai-inference/) — device tier detection patterns
- [WebGPU bugs are holding back the browser AI revolution — Medium 2025](https://medium.com/@marcelo.emmerich/webgpu-bugs-are-holding-back-the-browser-ai-revolution-27d5f8c1dfba) — OOM and context loss failure modes
- [AI In Browser With WebGPU: 2025 Developer Guide — aicompetence.org](https://aicompetence.org/ai-in-browser-with-webgpu/) — mobile capability constraints
- [wllama GitHub — WebAssembly binding for llama.cpp](https://github.com/ngxson/wllama) — 2GB ArrayBuffer limit, COOP/COEP requirement, iOS threading behavior
- [FOSDEM 2025 — wllama: bringing llama.cpp to the web](https://archive.fosdem.org/2025/schedule/event/fosdem-2025-5154-wllama-bringing-llama-cpp-to-the-web/) — mobile constraints presentation
- [WebAssembly maximum memory 2GB causes OOM on iOS Safari 16.2 — Godot Engine GitHub #70621](https://github.com/godotengine/godot/issues/70621) — iOS 2GB ArrayBuffer limit documentation
- [WASM SIMD broken on iOS 16.4+ — ONNX Runtime GitHub #15644](https://github.com/microsoft/onnxruntime/issues/15644) — iOS SIMD and threading constraints
- [3W for In-Browser AI: WebLLM + WASM + WebWorkers — Mozilla.ai blog](https://blog.mozilla.ai/3w-for-in-browser-ai-webllm-wasm-webworkers/) — worker architecture, memory pressure
- [Provider-Agnostic Agents: Why Adapters Alone Aren't Enough — fdrechsler.de](https://fdrechsler.de/blog/provider-agnostic-agents) — schema mismatch, semantic divergence between providers
- [Structured Output Comparison across LLM providers — Medium](https://medium.com/@rosgluk/structured-output-comparison-across-popular-llm-providers-openai-gemini-anthropic-mistral-and-1a5d42fa612a) — Anthropic vs OpenAI schema differences
- [We Routed 10 Million API Calls — DEV Community](https://dev.to/xujfcn/we-routed-10-million-api-calls-last-month-heres-what-broke-4i71) — production multi-provider routing failures
- [OpenAI SDK compatibility — Anthropic API docs](https://docs.anthropic.com/en/api/openai-sdk) — schema translation limitations
- [A local-first, reversible PII scrubber for AI workflows using ONNX — Medium](https://medium.com/@tj.ruesch/a-local-first-reversible-pii-scrubber-for-ai-workflows-using-onnx-and-regex-e9850a7531fc) — regex + ONNX hybrid architecture
- [Comparing Best NER Models For PII Identification — Protecto.ai](https://www.protecto.ai/blog/best-ner-models-for-pii-identification/) — NER model selection for PII tasks
- [Quantizing ONNX text classification model causes much lower precision — huggingface/optimum GitHub #151](https://github.com/huggingface/optimum/issues/151) — recall collapse under INT8 quantization for NER models
- [The 2025 Playbook For Securing Sensitive Data in LLM Applications — Protecto.ai](https://www.protecto.ai/blog/securing-sensitive-data-llm-applications/) — pre-transmission sanitization architecture
- [LLM Security 2025 — mend.io](https://www.mend.io/blog/llm-security-risks-mitigations-whats-next/) — data leakage, inference-layer exposure
- [3 common mistakes when integrating the OpenAI API — Backmesh](https://backmesh.com/blog/openai-api-mistakes/) — key exposure, CORS, browser API calls
- [Cross-Origin Resource Sharing (CORS) — OpenAI Developer Community](https://community.openai.com/t/cross-origin-resource-sharing-cors/28905) — CORS limitations for direct browser OpenAI calls
- [xAI API CORS and OpenAI compatibility — xAI docs](https://docs.x.ai/docs) — Grok browser compatibility
- [PWA iOS Limitations and Safari Support — magicbell.com](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide) — iOS storage limits, background processing
- Existing BinderOS codebase: `src/ai/adapters/cloud.ts`, `src/ai/adapters/browser.ts`, `src/ai/privacy-proxy.ts`, `src/search/embedding-worker.ts`, `src/ai/tier2/pipeline.ts` — integration-specific constraints from current implementation

---

*Pitfalls research for: adding device-adaptive local LLMs, ONNX sanitization classifiers, template-based generation, and multi-provider cloud to BinderOS (v4.0 Device-Adaptive AI)*
*Researched: 2026-03-05*
