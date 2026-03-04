# Pitfalls Research

**Domain:** Adding fine-tuned ONNX classification models to existing browser-based tiered AI system (BinderOS v3.0)
**Researched:** 2026-03-03
**Confidence:** HIGH for ONNX Runtime Web/Transformers.js operator and memory pitfalls (verified against official docs and GitHub issues); HIGH for synthetic data model-collapse patterns (multiple peer-reviewed 2025 papers agree); MEDIUM for GTD-specific classification ambiguity (first-principles derivation + general NLP subjectivity research, no GTD-specific studies found); MEDIUM for quantization accuracy degradation specifics (official docs + practitioner reports but project-specific numbers vary)

---

## Critical Pitfalls

### Pitfall 1: Fine-Tuned Model Conversion Breaks Silently — Numerical Mismatch Between PyTorch and ONNX Output

**What goes wrong:**
After fine-tuning a small classifier (e.g., DistilBERT or a MobileBERT variant) and exporting to ONNX, the model appears to load and run in the browser but produces systematically wrong class probabilities. The softmax output values from ONNX Runtime Web differ from the original PyTorch model by amounts like 0.004–0.36, which is small enough to miss in casual testing but large enough to flip classification decisions on borderline inputs. This is not a random error — it is a systematic shift caused by fused operator decomposition during ONNX graph optimization. The `LayerNorm` fusion, attention pattern rewriting, and `Gather` embedding lookups all have known numerical accuracy differences between the PyTorch reference and the ONNX graph as processed by `onnxruntime-web`.

**Why it happens:**
Developers validate the ONNX export on CPU using `onnxruntime` (Python), confirm accuracy is within tolerance, then ship to the browser. The browser's WASM and WebGPU backends implement operator math slightly differently from the Python CPU backend — especially for `MatMul` with INT8 quantized weights where zero-point representation can cause accumulated rounding errors. The gap between "ONNX Runtime on Python/CPU" and "ONNX Runtime Web/WASM" is not zero.

**How to avoid:**
- After ONNX export and quantization, run a browser-side validation suite: load the model in a test harness using `onnxruntime-web` (the exact package used in production), run 50–100 representative GTD text inputs through both the original PyTorch model and the ONNX Web runtime, and assert that top-1 predictions match on at least 95% of inputs.
- Use `onnxruntime-web`'s `InferenceSession` directly in a Node.js test (with `--experimental-vm-modules` or a jsdom harness) rather than solely trusting Python `onnxruntime`.
- Keep the ONNX opset at 17 or lower (Transformers.js default for WASM path). Do not use opsets 18+ unless you have confirmed WebGPU backend support for every op in the graph.
- For quantization: prefer dynamic quantization (no calibration dataset needed) over static for the first iteration. Static quantization's calibration can introduce additional deviation if calibration data is not representative.
- Always print the `max_diff` between PyTorch and ONNX output activations during validation. A `max_diff > 0.01` on softmax logits should be treated as a blocker.

**Warning signs:**
- No browser-runtime validation step in the training/export pipeline
- Validation only done against Python `onnxruntime`, not `onnxruntime-web`
- Opset version not pinned in export script
- Accuracy drops more than 2% vs. PyTorch baseline on a held-out test set after ONNX export

**Phase to address:** Training pipeline phase (synthetic data + fine-tuning). The export validation must be part of the model build artifact before integration into the browser app begins.

---

### Pitfall 2: Synthetic Training Data Produces Confident Models That Are Confidently Wrong on Real User Input

**What goes wrong:**
A classifier fine-tuned entirely on LLM-generated GTD examples achieves 85–95% accuracy on a held-out synthetic test set but drops to 60–70% on real user input. The model has learned the LLM's distribution of how GTD items "should" sound, not how users actually write them. Real inbox items are fragmentary ("call dentist"), use abbreviations, mix languages, contain typos, and often omit context that the LLM consistently includes in synthetic examples. The model produces high softmax confidence (>0.85) on wrong predictions because it has never seen input that looks ambiguous to it — all its training inputs were fluent, well-formed, and unambiguous.

**Why it happens:**
LLM-generated synthetic data has systematic over-completeness. When prompted to generate "example GTD tasks," Claude or GPT writes "Schedule a dentist appointment for next Tuesday and follow up with insurance" rather than "dentist tue?". The fine-tuned model learns a token distribution that does not exist in real user input. Developers test on synthetic validation data (same distribution as training) and conclude the model is ready.

**How to avoid:**
- Never evaluate a model trained on synthetic data using only synthetic validation data. The test set must contain real user-style input, even if small (50–100 hand-written examples per GTD category).
- Generate diverse synthetic examples: short fragments (1–5 words), typo-variants, mixed case, partial sentences, items in non-English, and ambiguous cross-category examples. Use a prompt that explicitly requests these degenerate forms, not just fluent examples.
- Mix synthetic and real data from the start. For BinderOS: export the user's own existing classified atoms from IndexedDB as seed real data (with user consent UI). Even 20 real examples per category anchors the distribution.
- Apply confidence calibration (temperature scaling) after training so that the model's softmax confidence reflects actual accuracy. An uncalibrated model that says 0.90 confidence but is right only 70% of the time at that threshold will cause false escalation decisions in the tier system.
- In the tiered pipeline: set the confidence threshold for Tier 2 ONNX classifiers deliberately high (0.80+) for the first release, rather than the current centroid threshold of 0.65. Lower it only after measuring real-world escalation rates.

**Warning signs:**
- Test set entirely generated by the same LLM as training data
- No short/fragmentary examples in synthetic data
- Confidence on wrong predictions consistently above 0.75
- Escalation rate to Tier 3 below 10% in testing (suggests overconfident model, not good model)

**Phase to address:** Synthetic data generation phase. The validation strategy must be defined before generating any training data, not after.

---

### Pitfall 3: COOP/COEP Headers Break the Existing App's External Resources When Multi-Threaded ONNX Is Added

**What goes wrong:**
ONNX Runtime Web's multi-threaded WASM backend requires `SharedArrayBuffer`, which browsers block unless the page is cross-origin isolated (COOP + COEP headers). Adding these headers to BinderOS's Vite dev server and production build breaks every external resource that does not opt in: Google Fonts, any CDN-hosted scripts, embedded `<iframe>` content, and any resource loaded without explicit CORS headers. The existing Vite config does not set COOP/COEP. When developers add them to enable multi-threaded ONNX, they see a cascade of `CORP check failed` errors in the console as previously-working resources silently fail to load.

**Why it happens:**
`Cross-Origin-Embedder-Policy: require-corp` means every resource the page loads must either be same-origin or send a `Cross-Origin-Resource-Policy: cross-origin` response header. Most CDN resources do not send this header. Developers add COOP/COEP because the ONNX Runtime Web docs say to, then are surprised that unrelated parts of the app stop working.

**How to avoid:**
- Audit every external resource currently loaded by BinderOS before enabling COOP/COEP. The existing app uses: Transformers.js WASM files (already served from `/models/` — safe), potentially Vite's HMR websocket (needs configuration).
- Use `Cross-Origin-Embedder-Policy: credentialless` as an alternative to `require-corp`. This is supported in Chrome 96+ and Firefox 119+ and is less restrictive: anonymous resources load without CORP headers, only credentialed resources are blocked. For a local-first app with no third-party embeds, this is sufficient.
- Configure the Vite dev server plugin to set COOP/COEP headers and verify with the ONNX Runtime Web `isOrtEnvInitialized()` check that multi-threading is actually available before relying on it.
- For the production PWA: COOP/COEP must be set at the HTTP server level (nginx/Caddy config), not just in Vite. Test in production hosting environment before releasing.
- Fallback path: if `SharedArrayBuffer` is unavailable (COOP/COEP not set, old browser), ONNX Runtime Web falls back to single-threaded WASM automatically. The fallback is slower (2–4x) but functionally correct. Design the system to accept single-threaded ONNX as a valid operating mode.

**Warning signs:**
- `CORP check failed` errors in browser console after adding COOP/COEP
- ONNX inference works in `localhost` but breaks on production hosting
- `typeof SharedArrayBuffer === 'undefined'` in the browser console on production
- No COOP/COEP check in the app's capability detection code

**Phase to address:** First phase that introduces the fine-tuned ONNX model into the browser. Header configuration is a deployment blocker and must be resolved before integration testing.

---

### Pitfall 4: env.allowLocalModels Cache Poisoning Causes Persistent JSON Parse Errors

**What goes wrong:**
The existing `embedding-worker.ts` correctly sets `env.allowRemoteModels = false` and `env.localModelPath = '/models/'`. When adding a second ONNX model (the fine-tuned classifier), developers may initialize a new Transformers.js pipeline instance with `allowLocalModels` in an inconsistent state — for example, a test run where the flag was not set fetches a corrupted or partial response from `localhost/models/` and saves it to the browser cache. Subsequent runs with the correct flag set still read the corrupt cached entry and throw `JSON.parse: unexpected character` or `Unexpected token` errors that do not reveal the root cause. The fix requires manually clearing the browser cache or using a new cache namespace, but without knowing the root cause developers chase inference bugs for hours.

**Why it happens:**
Transformers.js uses the browser's Cache API to store downloaded model files. If a request is made before `allowLocalModels` and `localModelPath` are set, or if the local model server returns a non-JSON error page that gets cached, that error response is stored as if it were the model file. The cache key is based on the URL, so every subsequent load hits the cached error.

**How to avoid:**
- Set `env.allowRemoteModels = false` and `env.localModelPath = '/models/'` as the absolute first operations in any new worker file that imports from `@huggingface/transformers`. Never do this lazily or conditionally.
- For the fine-tuned classifier model: create a separate worker file rather than extending the existing `embedding-worker.ts`. This prevents the two models' cache namespaces from interfering.
- Add a development-mode cache-busting script: `node scripts/clear-model-cache.cjs` that programmatically clears the browser's Cache API storage for model files. Include in `package.json` scripts as `"clear-models": "..."`.
- During development, use browser DevTools → Application → Cache Storage to verify that only valid JSON responses are cached under the model's URL namespace.
- Use a unique `localModelPath` subdirectory for each model to prevent key collisions: `/models/all-MiniLM-L6-v2/` for embeddings, `/models/gtd-classifier/` for the classifier.

**Warning signs:**
- `JSON.parse` or `SyntaxError: Unexpected token` in the console when loading the ONNX model
- Error persists even after fixing the model file path
- Error clears after opening an Incognito/Private window (confirms cache corruption)
- `env.allowLocalModels` set after `pipeline()` is called rather than before

**Phase to address:** First phase that adds the fine-tuned ONNX model to the browser. Environment configuration must be tested in a fresh browser profile, not just a developer's profile with models already cached.

---

### Pitfall 5: Model-Collapse Feedback Loop When Classifier Output Feeds Back Into Training Data

**What goes wrong:**
BinderOS's classification log records user triage decisions. The v3.0 plan is to use these logged decisions as training data for the next model version. If the Tier 2 ONNX classifier pre-fills the triage UI with a suggestion and the user accepts it without reviewing (approval fatigue), the classification log accumulates entries where "user decision" is actually "model decision ratified by distracted user." Training the next model on this data fine-tunes toward the current model's existing biases. Over 2–3 retraining cycles, minority categories (rare atom types) get progressively fewer training examples as the model confidently routes them to the majority class, which users rubber-stamp. This is the model-collapse pattern documented by Shumailov et al. (Nature, 2024) applied to a personal data classifier.

**Why it happens:**
The feedback loop is structurally invisible: each individual user confirmation looks like a genuine label. The bias accumulates slowly across hundreds of decisions. Developers testing the retrained model see overall accuracy hold steady (majority classes are fine) while minority-class recall quietly degrades.

**How to avoid:**
- Log the original model suggestion separately from the user's final choice in the classification log. The training pipeline must use only examples where `userChoice !== modelSuggestion` OR where `userChoice === modelSuggestion` AND the user actively typed or interacted with the UI (not just pressed Enter within 2 seconds).
- Track minority-class sample counts per retraining cycle. If any class has fewer samples in cycle N+1 than cycle N, flag it before retraining. Do not retrain with a class that has fewer than `MIN_SAMPLES_PER_TYPE` examples (currently 3 — this may need to be raised to 10+ for the fine-tuned model).
- Always keep the original synthetic training data as a floor. Retraining adds real user data on top of the synthetic base — it never replaces it. This prevents collapse from pure-model-generated data, consistent with 2025 research showing mixed real+synthetic outperforms pure synthetic.
- Add a UI affordance that makes reviewing the suggestion effortful enough to prevent rubber-stamping: show the confidence score and the second-best prediction alongside the top suggestion. "Task (82% confident) or Fact (14%)?" is harder to dismiss than a pre-filled field.

**Warning signs:**
- Classification log has >80% entries where user accepted model's first suggestion
- Minority atom type sample counts declining across log entries over time
- Retrained model shows improved accuracy on majority classes but degraded recall on `insight` or `decision` types
- No separation in the log between model-suggested and user-initiated labels

**Phase to address:** Training pipeline phase (data collection design) and integration phase (classification log schema update). The log schema must capture `modelSuggestion` before the classifier ships — retrofitting is painful.

---

### Pitfall 6: GTD Classification Is Inherently Ambiguous — Model Overconfidence on Subjective Labels Will Cause User Frustration

**What goes wrong:**
The five GTD atom types (task, fact, event, decision, insight) are not mutually exclusive categories. "Buy birthday gift for Sarah by Friday" is simultaneously a task and an event-trigger. "Decided to use Tailwind for the project" is both a decision and a fact. A fine-tuned classifier will assign one label with high confidence, but a significant fraction (estimated 15–25% of real inbox items) are genuinely ambiguous. When the classifier confidently pre-fills the wrong type and the user corrects it, the user records the model as "broken" — even though the model's chosen label was defensible. This is the label-ambiguity problem documented in ACL 2025 for subjective classification tasks.

**Why it happens:**
Training data, whether synthetic or real, forces single-label annotation. The LLM generating synthetic data picks one label per example, eliminating the ambiguity that exists in real input. The fine-tuned model learns a decision boundary that is crisper than the underlying concept, resulting in overconfident predictions on ambiguous inputs.

**How to avoid:**
- For ambiguous GTD inputs (where the top-2 class probabilities are within 0.15 of each other), do not pre-fill the type selector. Instead, show both options as equal-weight suggestions: "This looks like a Task or Decision — which fits better?" This is honest about the uncertainty and trains better data.
- Define explicit GTD disambiguation rules in the training prompt and enforce them in synthetic data generation: task = has an action verb + clear completion state; fact = no action required; event = time-anchored; decision = records a choice already made; insight = generalizable principle. Apply these rules consistently so the model learns crisp boundaries.
- Include intentionally ambiguous examples in training data with both labels annotated, and train with label smoothing (epsilon=0.1) to reduce overconfidence on the boundaries.
- Set the Tier 2 confidence threshold for `classify-type` conservatively — the current 0.65 is too low for a task that has inherent labeling disagreement. Start at 0.78 and measure escalation rate. The goal is that Tier 2 handles clear-cut cases and escalates genuinely ambiguous ones to Tier 3 (LLM) for richer reasoning.

**Warning signs:**
- Synthetic training data has no examples where two categories would both be defensible
- Training accuracy above 92% on a GTD classification task (suggests overfitting to synthetic distribution, not learning real boundaries)
- User correction rate above 30% on Tier 2 predictions in the first 30 days of production use
- Confidence score distribution is bimodal: most predictions cluster near 0.9 or 0.5, with few in 0.65–0.8 range

**Phase to address:** Synthetic data generation phase (training data design) and integration phase (UI behavior for uncertain predictions).

---

### Pitfall 7: ONNX Model Files Shipped in the Vite Bundle Break Build and Bloat the JS Chunk

**What goes wrong:**
When a fine-tuned ONNX classifier is added to the project, developers sometimes import the `.onnx` file directly in TypeScript: `import modelUrl from '../models/gtd-classifier.onnx?url'` or worse, import it as a byte array. Vite either refuses to process the binary file, includes it as a base64-encoded string in the JS bundle (adding 2–10 MB to the initial chunk), or incorrectly inlines it. The result is either a broken build or a 10MB+ JS bundle that kills Time-to-Interactive.

**Why it happens:**
ONNX files are binary assets, not JavaScript modules. Vite's default asset handling has a 4KB inline threshold; files above it are moved to the output directory as content-hashed assets. But `.onnx` is not a recognized extension in Vite's default config, so treatment is inconsistent across Vite versions. The existing project loads models from `/public/models/` served as static files, but the new classifier model may be added differently if the developer is not aware of this pattern.

**How to avoid:**
- Place all ONNX model files in `/public/models/gtd-classifier/` alongside the existing MiniLM model. Never import `.onnx` files into TypeScript — reference them by URL string: `const MODEL_URL = '/models/gtd-classifier/model_quantized.onnx'`.
- Add an explicit Vite asset rule in `vite.config.ts` to ensure `.onnx` files are treated as static assets if they must be in `src/`:
  ```typescript
  assetsInclude: ['**/*.onnx']
  ```
- Add the classifier model files to `.gitattributes` with Git LFS: `*.onnx filter=lfs diff=lfs merge=lfs -text`. Without LFS, a 20–80 MB model file in git history will make the repository unusable for new contributors.
- Add a download script (analogous to the existing `scripts/download-model.cjs`) for the fine-tuned classifier, so the model is fetched from a versioned URL rather than committed to the repository.
- Verify bundle size after integration: `pnpm build && du -sh dist/assets/*.js` must not show any JS chunk above 2MB. If it does, the model is being bundled.

**Warning signs:**
- `.onnx` file in `src/` directory rather than `public/`
- JS bundle size increases by the size of the ONNX file after adding the model
- `import` statement referencing an `.onnx` file anywhere in TypeScript source
- Build time increases by 30+ seconds after adding the model (Vite processing binary)
- Repository size jumps by model file size in git diff

**Phase to address:** First integration phase (wiring the fine-tuned model into the browser). Bundle discipline must be established before the model file is added to the project.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Extend `embedding-worker.ts` to run the classifier instead of creating a new worker | Avoids creating a second worker, reuses pipeline singleton | Memory contention between embedding and classification tasks; pipeline singleton holds both models in memory simultaneously even when only one is needed; worker message protocol becomes bloated | Never for production — separate workers |
| Use centroid fallback confidence thresholds (0.65) unchanged for fine-tuned model | No threshold tuning work required | Fine-tuned models have a different confidence distribution than cosine similarity centroid scores; 0.65 on softmax output ≠ 0.65 on cosine similarity; will either over-escalate or under-escalate | Never — must be independently measured |
| Skip browser-runtime validation and trust Python ONNX validation | Saves 1–2 days of test harness work | Numerical mismatch between Python and WASM backends causes subtle wrong predictions in production | Never for a model used in production decisions |
| Generate all synthetic data in one batch upfront | Simplicity, no iterative prompting needed | Single-batch generation produces homogeneous examples; LLM outputs cluster around the same phrasings; diversity requires varied prompts across multiple sessions | Acceptable for a proof-of-concept first iteration, not for the training dataset used in production |
| Store the ONNX model in IndexedDB as a Blob | Avoids static file hosting complexity | Blobs in IndexedDB are subject to storage eviction; browser storage quotas apply; model can silently disappear; OPFS is the correct API for large files | Never for production; use OPFS or `/public/models/` |
| Hard-code confidence thresholds as constants | Quick to implement | Different tasks (classify-type vs. assess-staleness vs. route-section) have different natural confidence distributions; a single constant makes tuning one task degrade another | Acceptable as a starting point if thresholds are named constants per task type (already done in `CONFIDENCE_THRESHOLDS`) |

---

## Integration Gotchas

Common mistakes when connecting the fine-tuned ONNX model to the existing tier system.

| Integration Point | Common Mistake | Correct Approach |
|-------------------|----------------|------------------|
| Tier 2 handler replacement | Replace centroid-based `tier2-handler.ts` entirely with ONNX classifier, removing centroid fallback | Keep centroid classification as a fallback within Tier 2; use fine-tuned ONNX as primary, centroid as secondary when ONNX model fails to load |
| Classification log schema | Add `modelSuggestion` field without a Dexie schema migration | Create a new Dexie schema version with the field added; existing entries get `undefined` for `modelSuggestion`, which is safe |
| Worker message protocol | Add ONNX classifier messages to the existing `CLASSIFY_TYPE`/`CLASSIFY_RESULT` protocol | Use new message types (e.g., `CLASSIFY_ONNX` / `ONNX_RESULT`) to distinguish embedding-centroid classification from fine-tuned model classification; prevents routing bugs |
| Model loading timing | Load the ONNX classifier eagerly at worker startup | Load lazily on first `CLASSIFY_ONNX` request; warm up in background after first user interaction, not at worker init (avoids cold start blocking early UI) |
| Confidence score semantics | Use fine-tuned model's raw softmax max as `confidence` value directly | Softmax max is not calibrated confidence; apply temperature scaling or at minimum verify that the model's softmax distribution matches actual accuracy at each decile before using raw values as tier escalation thresholds |
| Task coverage | Build fine-tuned model for `classify-type` only, then wire it into tasks it wasn't trained for | The `CONFIDENCE_THRESHOLDS` object gates tasks independently; only enable fine-tuned ONNX for tasks it was explicitly trained on; `assess-staleness` requires separate training data |
| Model update deployment | Update the model file without updating the version hash in the download script | Content-hash the model filename (e.g., `gtd-classifier-v1.2.3.onnx`) so browser cache invalidation is automatic; never overwrite the same filename |

---

## Performance Traps

Patterns that work at small scale but fail under real usage.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Running embedding + classification sequentially for every triage request | Each inbox item takes 2x embedding time (one for search index, one for classification) | Share embeddings: when an item is embedded for search, cache the vector and reuse it for Tier 2 classification without re-embedding | Noticeable at >10 items/session as cumulative latency; user sees delayed triage UI |
| Rebuilding centroids AND running fine-tuned inference on every classification | Centroid rebuild is O(n) over classification history; at 500+ entries this takes 50–100ms per classification | Gate centroid rebuild to the `CENTROID_REBUILD_INTERVAL` (every 10 classifications, already implemented); never rebuild synchronously during triage | At ~200+ classification history entries (heavy users after 2–3 weeks) |
| Loading the ONNX classifier model file on every service worker activation | Service worker activates on every page load; model file is 10–80MB; triggers a new fetch even if cached | Implement cache-first loading: check Cache API or OPFS before fetching; use content-hash URL so cache hit is guaranteed on repeat visits | First visit after every deploy if model URL is not content-hashed |
| Blocking the main thread during ONNX session creation | `ort.InferenceSession.create()` is async but the WASM compilation step can take 500ms–2s synchronously on slow hardware | Call `InferenceSession.create()` in the Worker thread, not the main thread; the embedding worker already does this correctly for MiniLM — apply the same pattern | On low-end hardware (4GB RAM laptop) with a 50MB+ model file |
| Accumulating unresolved pending classification Promises | Each classification request creates a Promise that is stored in a Map; if the worker crashes, all pending Promises leak | Implement a timeout (5 seconds) for each pending classification Promise; on timeout, reject with a fallback "tier-2-unavailable" result; clean the pending map on worker restart | Under memory pressure when the WASM runtime crashes and respawns |

---

## Security Mistakes

Domain-specific security issues for a local-first, privacy-first ML system.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Sending raw atom content to the LLM for synthetic data generation without user consent UI | User's private life data (tasks, decisions, health facts) sent to cloud AI during "training data bootstrapping" without understanding | Require explicit opt-in with disclosure: "Generate training examples from your existing atoms using [cloud AI]. Your data is used only to create anonymous examples and is not stored by [provider]." Allow opt-out with purely synthetic LLM-generated data that contains no personal details |
| Storing synthetic training data (which may contain paraphrases of user content) in plain text in OPFS | User's private thoughts appear in app storage in a form different from the original atoms, making them harder to audit or export | Apply the same data ownership guarantee to training data as to atoms: store in a namespaced location, include in the export-all data flow, and provide a "delete training data" option in settings |
| Fine-tuned model weights encoding user data patterns | A sophisticated attacker who extracts the ONNX model weights could theoretically reverse-engineer user data patterns through membership inference | Use differential privacy during fine-tuning if training on real user content; for v3.0 scope, the simpler mitigation is to train primarily on synthetic data (no real user content in model weights) and use real user data only as validation |
| Model file served from a CDN without integrity check | Man-in-the-middle attack substitutes a malicious model file that outputs adversarial classifications | Use Subresource Integrity (`integrity` attribute) on model `fetch()` calls, or verify a SHA-256 hash of the downloaded model file before loading it into ONNX Runtime Web |

---

## UX Pitfalls

Common user experience mistakes when exposing ML classification to users.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Pre-filling the atom type selector with the model's top prediction without showing confidence | User accepts wrong classification without knowing a correction was possible; confidence not communicated | Show top prediction with confidence band: "Task (high confidence)" or "Task or Fact?" when confidence is borderline; make the field obviously editable |
| Escalating to Tier 3 cloud LLM without informing the user why their item is taking longer | User sees spinner with no explanation; may think the app is broken | When Tier 2 escalates, show: "Thinking harder about this one..." with a brief delay indicator; if Tier 3 uses cloud, show the cloud API indicator from the existing AI status bar |
| Showing raw model version information to users | Users do not understand "gtd-classifier v1.2.3 loaded" and it creates anxiety | Translate model state to user language: "Offline AI ready" or "Smart triage active"; model version is developer metadata, not user-facing |
| Offering to "improve AI" through feedback without explaining what is collected | Users distrust data collection without transparency | Be explicit: "When you correct a suggestion, BinderOS records the item text and your correction locally. This data never leaves your device." Show the classification log entry that was created. |
| Silent degradation when fine-tuned model fails to load | User gets Tier 1 deterministic results without knowing why suggestions are less smart | Show a non-alarming notice: "Offline AI unavailable — using basic classification." Provide a "retry" action and a link to the settings panel with diagnostic info |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Fine-tuned model trained and exported:** Often missing browser-runtime validation — verify that `onnxruntime-web` (not Python `onnxruntime`) produces matching top-1 predictions on a 50-item test set
- [ ] **ONNX model loading in worker:** Often missing warm-up call — verify that the first real classification request does not include model-loading latency by pre-loading on worker init (after first user interaction)
- [ ] **Synthetic data pipeline:** Often missing diversity verification — verify that training examples span short fragments, typos, mixed-language, and cross-category ambiguous inputs, not just fluent well-formed sentences
- [ ] **Classification log extended with `modelSuggestion`:** Often missing Dexie migration — verify that existing entries are not broken by the schema change and that the new field is being populated on every classification event
- [ ] **Confidence threshold tuning:** Often missing per-task calibration — verify that the escalation rate to Tier 3 is in the 10–25% range (not 0% = overconfident model, not 50%+ = underperforming model)
- [ ] **COOP/COEP headers:** Often missing in production environment — verify that `typeof SharedArrayBuffer !== 'undefined'` returns true in the production deployment, not just localhost
- [ ] **Model file cache strategy:** Often missing invalidation — verify that updating the model file triggers a cache miss in the browser (content-hashed filename or version manifest)
- [ ] **Tier 2 fallback when ONNX unavailable:** Often missing after replacing centroid approach — verify that Tier 1 deterministic classification still fires when the ONNX model file fails to load (network error, corrupt file, WASM unavailable)
- [ ] **Training data provenance logging:** Often missing — verify that synthetic examples generated by the LLM are tagged with generation prompt version and LLM model version so future retraining can identify which data came from which generation run
- [ ] **Model collapse guard:** Often missing — verify that the retraining pipeline reports per-class sample counts and blocks training if any class falls below the minimum threshold

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Numerical mismatch in ONNX export discovered post-integration | MEDIUM | Re-export with lower opset version; apply `onnxsim` (ONNX Simplifier) to the graph before quantization; if mismatch persists, switch from INT8 static to INT8 dynamic quantization |
| Synthetic data model-collapse discovered in production (minority class degrading) | HIGH | Immediately disable Tier 2 for affected tasks; revert to Tier 1 deterministic; regenerate synthetic data for minority classes with explicit diversity prompts; retrain with original synthetic data as floor |
| COOP/COEP header breakage in production | MEDIUM | Switch to `COEP: credentialless` header; audit all external resources; temporarily disable ONNX multi-threading (fall back to single-threaded WASM) while headers are corrected |
| env.allowLocalModels cache corruption | LOW | Add a one-time cache-clearing routine: detect corrupted cache (JSON parse error on model load) and call `caches.delete()` for the model namespace; show user "Clearing model cache, please wait..." |
| Model file accidentally bundled in JS chunk | MEDIUM | Remove from `src/`, move to `public/models/`, delete from git history using `git filter-repo`; add Git LFS for `.onnx` files; rebuild and redeploy |
| Classification log schema migration failure | HIGH | Implement Dexie migration defensively: wrap in try/catch, fall back to old schema if migration fails; do not gate new features on schema version without a version gate check |
| Overconfident model accepted wrong predictions at scale | HIGH | Add a model confidence calibration step (temperature scaling) as a post-training step; roll back to centroid-based Tier 2 while recalibrating; increase confidence threshold for Tier 2 from 0.65 to 0.85 as a temporary measure |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| ONNX numerical mismatch (Pitfall 1) | Synthetic data + training pipeline phase | Browser-runtime validation harness runs as part of model build artifact |
| Synthetic data distribution gap (Pitfall 2) | Synthetic data generation phase | Test set includes 50+ real-style short/fragmentary examples; accuracy on real test set > 75% |
| COOP/COEP header breakage (Pitfall 3) | First ONNX browser integration phase | `typeof SharedArrayBuffer !== 'undefined'` on production URL |
| env.allowLocalModels cache poisoning (Pitfall 4) | First ONNX browser integration phase | Test in fresh browser profile with no cached model files |
| Model-collapse feedback loop (Pitfall 5) | Synthetic data + classification log schema phase | `modelSuggestion` field populated; per-class sample counts reported in retraining pipeline |
| GTD classification ambiguity overconfidence (Pitfall 6) | Synthetic data generation phase + UI integration phase | Confidence distribution does not cluster above 0.85 for >70% of predictions; UI shows two options for borderline predictions |
| ONNX model file bundling (Pitfall 7) | First ONNX browser integration phase | `du -sh dist/assets/*.js` shows no JS chunk > 2MB |
| Centroid fallback removal (integration gotcha) | Tier 2 replacement phase | Unit test: when ONNX model fails to load, Tier 2 still returns a centroid result |
| Sequential embedding waste (performance trap) | Triage integration phase | Profiling shows single embedding call per inbox item, not two |

---

## Sources

- [ONNX Runtime Web documentation](https://onnxruntime.ai/docs/tutorials/web/) — operator support gaps, WASM backend behavior
- [Transformers.js Production Optimization — SitePoint](https://www.sitepoint.com/optimizing-transformers-js-production/) — main thread blocking, memory spikes, ONNX binary asset handling
- [Transformers.js v3 announcement — HuggingFace Blog](https://huggingface.co/blog/transformersjs-v3) — WebGPU support, model loading patterns, package rename
- [ONNX Runtime Web COOP/COEP requirements — web.dev](https://web.dev/articles/coop-coep) — SharedArrayBuffer cross-origin isolation
- [Excessive Memory consumption issue — Transformers.js GitHub #759](https://github.com/huggingface/transformers.js/issues/759) — real-world memory spike reports
- [Quantize ONNX models — onnxruntime.ai](https://onnxruntime.ai/docs/performance/model-optimizations/quantization.html) — dynamic vs. static quantization, zero-point accuracy
- [Selective Quantization Tuning for ONNX Models — arXiv 2025](https://arxiv.org/html/2507.12196v1) — layer-sensitivity analysis
- [Faster and smaller quantized NLP — Microsoft Azure/Medium](https://medium.com/microsoftazure/faster-and-smaller-quantized-nlp-with-hugging-face-and-onnx-runtime-ec5525473bb7) — BERT quantization accuracy drop patterns
- [Demystifying Synthetic Data in LLM Pre-training — ACL/EMNLP 2025](https://aclanthology.org/2025.emnlp-main.544/) — model collapse, real+synthetic mixtures
- [Synthetic Data Generation Using LLMs — arXiv March 2025](https://arxiv.org/abs/2503.14023) — bias amplification, distribution shift, diversity challenges
- [Explicitly Unbiased LLMs Still Form Biased Associations — PNAS 2025](https://www.pnas.org/doi/10.1073/pnas.2416228122) — implicit bias in synthetic data from aligned models
- [Measuring Label Ambiguity in Subjective Tasks — ACL LAW-XIX 2025](https://aclanthology.org/2025.law-1.2/) — entropy-based ambiguity scoring for subjective classification
- [AI models collapse when trained on recursively generated data — Nature 2024](https://www.nature.com/articles/s41586-024-07566-y) — foundational model collapse paper (Shumailov et al.)
- [ONNX Versioning — onnx.ai](https://onnx.ai/onnx/repo-docs/Versioning.html) — opset versioning, IR versioning, model versioning
- [Offline-first frontend apps in 2025 — LogRocket](https://blog.logrocket.com/offline-first-frontend-apps-2025-indexeddb-sqlite/) — OPFS vs IndexedDB for large model file storage
- [Local-First AI definitive guide — SitePoint 2026](https://www.sitepoint.com/definitive-guide-local-first-ai-2026/) — OPFS-first model caching, cache invalidation with version manifests
- [Cross-Origin-Isolation with SvelteKit, Vite — Captain Codeman](https://www.captaincodeman.com/cross-origin-isolation-with-sveltekit-vite-and-firebase) — Vite COOP/COEP configuration patterns
- Existing BinderOS codebase: `src/search/embedding-worker.ts`, `src/ai/tier2/`, `src/ai/tier2/centroid-builder.ts` — integration-specific constraints derived from current implementation

---
*Pitfalls research for: adding fine-tuned ONNX classification models to BinderOS browser-based tiered AI system (v3.0 Local AI + Polish)*
*Researched: 2026-03-03*
