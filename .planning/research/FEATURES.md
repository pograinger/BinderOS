# Feature Research

**Domain:** Fine-tuned in-browser ML classification models for GTD intelligence (BinderOS v3.0)
**Researched:** 2026-03-03
**Confidence:** MEDIUM-HIGH — ONNX/Transformers.js pipeline HIGH (official docs verified); synthetic data pipeline MEDIUM (general LLM-labeling well-documented, GTD-specific is novel); model drift / incremental learning MEDIUM (research-backed, but browser-specific adaptation is LOW)

---

## Context

This research targets BinderOS **v3.0** specifically. The v2.0 AI layer (shipped 2026-03-03) built:

- Tiered pipeline: Tier 1 (keyword heuristics + Jaccard history) → Tier 2 (MiniLM embedding cosine similarity to centroids) → Tier 3 (cloud LLM escalation)
- Classification log in Dexie: stores `ClassificationEvent` with content, suggestedType, chosenType, sectionItemId, tier, confidence, and cached MiniLM embedding
- Centroid builder: computes per-type average embedding vectors from classification history
- Tasks handled: `classify-type`, `route-section`, `extract-entities`, `assess-staleness`
- All AI features require explicit user approval before any atom mutations

**What v3.0 changes about the Tier 2 layer:** Replace centroid-similarity matching with real fine-tuned ONNX classification models — one model per task domain. Models trained on synthetic GTD data (LLM-generated, then human-curated), then converted to quantized ONNX via HuggingFace Optimum. Loaded in the existing embedding worker via `onnxruntime-web`. Tier 3 cloud LLM becomes optional quality enhancement, not a dependency.

**Scope boundary for this research:** Features new to v3.0 only. The floating orb, conversational flows, approval modal, changelog tagging, and all v2.0 UX patterns are existing baseline. Research here covers what must be built, evaluated, and managed for the ML layer itself.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features the system must have for "offline GTD intelligence" to feel complete and trustworthy. Missing these = the offline mode feels half-baked or untrustworthy compared to the cloud-backed path.

| Feature | Why Expected | Complexity | Dependency on Existing System |
|---------|--------------|------------|-------------------------------|
| **Offline triage type classification** | If v3.0 promises "works without cloud," the atom type suggestion (task/fact/event/decision/insight) must work offline. Users who have disabled cloud API expect this to just work. | MEDIUM | Requires: existing embedding worker (`src/search/embedding-worker.ts`), Tier 2 handler (`src/ai/tier2/tier2-handler.ts`), classification log with embeddings. Replace centroid lookup with ONNX model inference in the same worker. |
| **Offline section routing** | Same expectation — if type classification works offline, PARA section routing should too. Users do not want one feature to work offline and the other to require cloud. | MEDIUM | Requires: existing `route-section` task in pipeline, section centroid logic. Replace centroids with a dedicated section-routing ONNX model or extend the type classifier with a routing head. |
| **Model quality parity or better vs. Tier 2 centroids** | Users experience Tier 2 today via centroid similarity. v3.0 must not regress. If fine-tuned model produces worse suggestions than centroids, the whole v3.0 rationale collapses. | MEDIUM | Requires: evaluation harness comparing centroid accuracy vs. model accuracy on the same held-out classification log data. |
| **Model loads without blocking UI** | Transformers.js v3 caches models to IndexedDB/Cache API after first download. Subsequent loads must not block the UI or delay triage. Cold start (first-ever load) needs a visible progress indicator. | MEDIUM | Requires: model loading in the existing embedding worker (off main thread already). Add first-load progress message back to main thread. |
| **Model stored in browser cache across sessions** | Users must not re-download the model on every session. Transformers.js caches automatically to Cache API; confirm this works for custom fine-tuned models loaded from a local path or bundled URL. | LOW-MEDIUM | Requires: model hosting strategy (bundle with app vs. serve from CDN vs. OPFS). First-load size budget must be declared to user. |
| **Graceful fallback if model fails to load** | Browser storage quotas, network errors, or corrupt caches can cause model load failures. The pipeline must fall through to Tier 1 (keyword heuristics) if Tier 2 ONNX fails. | LOW | Requires: existing tiered pipeline escalation logic — already handles Tier 2 absence. Verify failure path when model file is missing or corrupt. |
| **Training data visible and auditable** | Privacy-first users will ask: "What did you train this on?" Synthetic data must be generated without including any user's personal atom content. Training data must be inspectable (stored in repo). | LOW | No code dependency. Policy and generation discipline. Training corpus lives in `scripts/training-data/` — user can inspect. |
| **User corrections feed back into model quality** | Every time a user overrides an AI suggestion, that is a labeled correction. The classification log already captures `chosenType` vs `suggestedType`. This signal must be surfaced for retraining, not silently discarded. | MEDIUM | Requires: classification log query to extract correction events (chosenType != suggestedType at suggestedTier === 2). These become priority retraining examples. |
| **Confidence score calibration** | Current centroid confidence is a heuristic (cosine similarity × separation). Fine-tuned model outputs softmax probabilities — these must be calibrated to the same 0–1 confidence scale the pipeline uses for escalation thresholds. | MEDIUM | Requires: calibration step post-training (Platt scaling or temperature scaling). Must not break the CONFIDENCE_THRESHOLDS logic in `src/ai/tier2/types.ts`. |

---

### Differentiators (Competitive Advantage)

Features that go beyond "ONNX model in browser" to make the v3.0 ML layer genuinely novel for a GTD tool.

| Feature | Value Proposition | Complexity | Dependency on Existing System |
|---------|-------------------|------------|-------------------------------|
| **GTD-domain fine-tuned classifier (not generic)** | Generic text classifiers (DistilBERT on SST-2, BERT on news categories) do not understand GTD semantics. "Buy milk" is a task; "Milk is a dairy product" is a fact. A model fine-tuned on GTD-domain examples outperforms a generic classifier on these distinctions. No competitor ships a GTD-domain ONNX model. | HIGH | Requires: synthetic training data generation pipeline (LLM-generated GTD examples per atom type), Python fine-tuning environment (separate from app). Output: ONNX file committed to repo or served as asset. |
| **Synthetic training data pipeline for personal productivity** | Using a cloud LLM to generate labeled GTD training examples (100–500 examples per class) is a novel data source for this domain. The training corpus itself becomes a reusable asset. Users can contribute curated corrections back to the public dataset (opt-in). | HIGH | Requires: Python script (`scripts/generate-training-data.py`) calling Anthropic/OpenAI API. Output: JSONL files (`scripts/training-data/*.jsonl`). No app-side dependency. |
| **Correction-driven retraining loop** | Most in-browser ML classifiers are static — the model ships, never improves. BinderOS captures every user correction (chosen type differs from suggested type). These corrections become the highest-quality training data for the next model version. The retraining loop: export corrections from Dexie → add to training corpus → retrain → re-export ONNX → ship. | HIGH | Requires: Dexie export utility for classification log, Python retraining script, CI/CD or manual retrain process. The app-side hook is already in `logClassification()`. |
| **Staleness score model (ML-based)** | Current staleness assessment is WASM-computed decay + Tier 1 score interpretation (threshold-based string output). A fine-tuned regression or classification model that predicts "compress now / review soon / still fresh" from content features + entropy signals would outperform threshold-based rules — especially for edge cases (long-lived tasks that are still active vs. truly stale). | HIGH | Requires: staleness regression model, training data from historical classification log (atoms with known decay trajectories). Needs >100 labeled staleness examples per class — bootstrapped via synthetic data + WASM score labels. |
| **Priority prediction model** | Current priority is a deterministic WASM function (entropy × recency × link density). ML model trained on user behavior (which atoms did they work on? which did they ignore?) could predict behavioral priority better than the formula alone. | VERY HIGH | Requires: behavioral signal capture (not currently stored). High privacy sensitivity. Defer to future milestone unless the WASM formula proves insufficient. Flag as research item. |
| **Compression candidate model (beyond centroid similarity)** | Current compression coach uses WASM staleness + semantic similarity to surface candidates. A classification model fine-tuned to predict "compress-worthy / keep / review" from combined signals (staleness, link count, type, age, similarity cluster) would give higher-precision candidates with less noise. | HIGH | Requires: compression candidate training data (labeled atoms from user's own history — privacy-sensitive). Synthetic examples can bootstrap, but real user corrections matter most here. |
| **Model quality dashboard in settings panel** | Show users: model version, accuracy on their correction history, number of corrections incorporated, last retrain date. Gives power users confidence in the system. No competitor shows this. | MEDIUM | Requires: metadata stored with model (version, training date, accuracy on hold-out set). Settings panel UX already identified as tech debt target in v3.0. |
| **Offline-first with cloud-quality results** | With fine-tuned ONNX models, Tier 2 achieves quality close to cloud LLM for the fixed-label classification tasks (type and section). Cloud LLM becomes an escalation path for ambiguous or novel cases only. The system works fully offline — no API key, no network — and produces good results rather than degraded ones. This is the core v3.0 value proposition. | HIGH (system-level) | Requires: all of the above. The differentiator is the sum of parts. |

---

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Bundle large model with app** | "Ship the model so there's no download" | Fine-tuned DistilBERT-base-uncased INT8 is ~60–80MB. Bundling this doubles the app size and breaks Vite's chunk optimization. Browser cache is the right mechanism. | Host model as a separate static asset (same CDN as app or GitHub Releases). Transformers.js caches to browser Cache API automatically after first download. Show first-load progress indicator. |
| **Re-train the model in-browser** | "Let the model learn from my corrections locally, continuously" | In-browser retraining of transformer models is not feasible — ONNX Runtime Web is an inference runtime only, not a training runtime. The model graph is frozen at export. In-browser "retraining" would require PyTorch.js or TensorFlow.js with a full training graph, adding 10–50MB+ and significant memory pressure. | Use the correction log as input to an offline retraining script (Python, run periodically). Ship updated ONNX file as a new model version. Incremental improvement via version releases, not live in-browser adaptation. |
| **Auto-tune confidence thresholds per user** | "Learn my tolerance for AI suggestions" | Dynamic thresholds that vary per-user create a moving target for the pipeline escalation logic. A user whose threshold drifts means Tier 3 fires more or less often unpredictably. Hard to debug, hard to trust. | Fixed thresholds per task type (already in `CONFIDENCE_THRESHOLDS`). Allow user to set a global "AI assertiveness" slider (conservative / balanced / assertive) that maps to pre-defined threshold profiles. Simple, transparent, user-controlled. |
| **Separate models per user** | "Fine-tune a personal model on my data" | GTD atom content is personal. Using it as training data requires explicit consent, secure handling, and a training infrastructure with privacy guarantees. The privacy surface is too large for an open-source tool without a backend. | Shared base model (trained on synthetic GTD data) + user-specific correction signals stored locally in the classification log. Corrections influence retraining of the shared model (anonymized, opt-in), but not per-user personalization. |
| **Online learning / incremental model updates** | "Update the model weights immediately when I correct a suggestion" | Catastrophic forgetting: neural networks updated on a single example destroy prior learned patterns. A single correction from "task" to "insight" would corrupt the model for future "task" items unless proper continual learning techniques are applied — techniques that are not supported in ONNX Runtime Web (inference only). | Log corrections in Dexie. Run offline retraining script against accumulated corrections + original training data (prevents forgetting). Corrections only affect the model after deliberate retrain + ship cycle. |
| **Model accuracy guarantees ("95% accurate")** | "Tell me this model is X% accurate" | Accuracy on a generic benchmark is meaningless for a personal productivity tool. The user's atom content distribution differs from any training set. Synthetic training data further decouples synthetic-world accuracy from real-world performance. | Report: "Model trained on N examples. You've made M corrections. Corrections are queued for next retrain." Show trend (is accuracy improving or stable?) not a single number. |
| **Multi-task single model (type + section + staleness in one forward pass)** | "Efficient — one model does everything" | Multi-task learning requires a shared backbone architecture. Section routing depends on user-specific sections (dynamic labels), making it impossible to pre-train a single shared model for all tasks. Type classification labels are fixed (5 classes); section routing labels vary per user. These must be separate models or separate heads with different output layers. | Type classifier: shared fine-tuned model (fixed 5-class output). Section routing: embed + nearest-neighbor to existing atom section embeddings (reuse MiniLM already loaded). Staleness: separate lightweight model or continue WASM rule-based with ML refinement. |
| **WebGPU acceleration for model inference** | "Make it faster with WebGPU" | WebGPU is not universally available (Firefox: flag only; iOS: not supported). The MiniLM model already runs <50ms on CPU ONNX. For a 5-class classification task, CPU inference is adequate. Adding a WebGPU path creates a maintenance bifurcation for negligible real-world gain on short inputs. | CPU ONNX is the default path. If WebGPU becomes universally available in future, add `{device: 'webgpu'}` as an optional accelerator behind a settings flag. Don't build it now. |

---

## Feature Dependencies

```
[Fine-tuned Type Classifier ONNX]
    └──requires──> [Training data: synthetic GTD examples (task/fact/event/decision/insight)]
    └──requires──> [Python fine-tuning script (PyTorch + HuggingFace Transformers)]
    └──requires──> [ONNX export via HuggingFace Optimum (INT8 quantization)]
    └──replaces──> [Centroid similarity in Tier 2 handler for classify-type task]
    └──uses──> [Existing embedding worker for model loading + inference]

[Synthetic Training Data Pipeline]
    └──requires──> [Cloud LLM access (Anthropic/OpenAI) for generation script]
    └──requires──> [Labeled JSONL output format matching classifier input schema]
    └──provides──> [Training corpus for all fine-tuned models]
    └──note──> [No app-side code dependency — pure Python + LLM API]

[Section Routing (Offline)]
    └──option-A──> [Fine-tuned section classifier: requires dynamic-label handling — user sections vary]
    └──option-B──> [MiniLM embed + nearest-neighbor to existing section atom embeddings]
    └──note──> [Option B reuses existing MiniLM worker with no new model download]
    └──depends-on──> [Section atoms existing in Dexie with embeddings]

[Correction-Driven Retraining Loop]
    └──requires──> [Classification log query: chosenType != suggestedType AND suggestedTier === 2]
    └──requires──> [Dexie export utility (offline script, not in-app)]
    └──requires──> [Python retraining script that merges corrections + original training data]
    └──outputs──> [New ONNX model version to replace previous]
    └──note──> [The app-side hook already exists in logClassification()]

[Staleness Score Model]
    └──requires──> [Training data: atoms labeled with WASM staleness score + manual compress/keep/review label]
    └──requires──> [WASM score signals passed as features alongside text content]
    └──enhances──> [assess-staleness task in Tier 1 handler (replaces threshold logic)]

[Compression Candidate Model]
    └──requires──> [Staleness Score Model] (shares signal space)
    └──requires──> [Training data: labeled compress-worthy / keep / review examples]
    └──enhances──> [Compression coach: replaces heuristic candidate selection]

[Model Quality Dashboard (Settings)]
    └──requires──> [Model metadata: version, training date, training corpus size, accuracy on hold-out]
    └──requires──> [Settings panel tech debt cleanup (already in v3.0 scope)]
    └──reads──> [Classification log: count of corrections, correction rate trend]

[Confidence Calibration]
    └──requires──> [Fine-tuned model outputs softmax probabilities]
    └──requires──> [Calibration step: Platt scaling or temperature scaling on hold-out set]
    └──ensures──> [Pipeline escalation thresholds in CONFIDENCE_THRESHOLDS remain valid]

[Model Storage / Caching]
    └──uses──> [Transformers.js automatic Cache API caching (built-in)]
    └──requires──> [Model hosting: static asset URL (same CDN, GitHub Releases, or bundled as separate chunk)]
    └──requires──> [First-load progress indicator in existing embedding worker → main thread message]
    └──note──> [IndexedDB is NOT the storage mechanism — Cache API is. No Dexie conflict.]
```

### Dependency Notes

- **Synthetic data pipeline is the critical path.** Without training data, there is no fine-tuned model to deploy. This is the first thing to build — before any app-side code changes.
- **Type classifier is the highest-ROI first model.** It handles the highest-frequency task (inbox triage). Five fixed output classes (task/fact/event/decision/insight) means a shared model works for all users.
- **Section routing is user-specific.** Section labels differ per user setup. Do not attempt a fine-tuned section routing model shared across users — use embedding-based nearest-neighbor to the user's own section atoms instead (Option B). This avoids the dynamic-label problem entirely and reuses the MiniLM model already loaded.
- **Staleness and compression models are optional v3.0 scope.** The type classifier alone is a meaningful v3.0 upgrade. Staleness and compression models add value but require additional training data and are higher-risk on quality.
- **Confidence calibration must happen before the model goes into the pipeline.** Uncalibrated softmax probabilities will misfire escalation thresholds. Platt scaling on a small hold-out set (20% of training data) is sufficient.
- **Correction loop does not require in-app tooling for v3.0.** Export classification log from Dexie via DevTools or a one-time export script, retrain offline, ship new ONNX. The infrastructure need not be polished for v3.0.

---

## MVP Definition

### Launch With (v3.0 — Local AI + Polish milestone)

The minimum set that delivers "full offline GTD intelligence" as a meaningful upgrade over centroid similarity.

- [ ] **Synthetic training data corpus (type classification)** — 300–500 labeled GTD examples per atom type (task, fact, event, decision, insight) generated via cloud LLM. Stored in `scripts/training-data/type-classification.jsonl`. This is the prerequisite to everything else.
- [ ] **Python fine-tuning script** — Fine-tune DistilBERT (or MiniLM classification head) on GTD corpus. Export to ONNX INT8 via HuggingFace Optimum. Reproducible, committed to `scripts/train-type-classifier.py`. Produces `public/models/type-classifier/` output.
- [ ] **ONNX type classifier integrated into Tier 2** — Load the fine-tuned model in the existing embedding worker. Replace centroid cosine similarity with a proper classification forward pass for the `classify-type` task. Confidence score from softmax probabilities (calibrated).
- [ ] **First-load model download UX** — Progress indicator when model downloads for the first time. Clear message ("Downloading offline classifier, ~60MB, one-time only"). Subsequent loads from Cache API: silent.
- [ ] **Graceful fallback if model fails** — If ONNX model fails to load or errors during inference, fall through to Tier 1 keyword heuristics. Log the failure. No user-visible crash.
- [ ] **Correction-driven retraining utility** — Offline script (`scripts/export-corrections.ts` or similar) that exports classification corrections from Dexie as JSONL for the next retraining run. App-side: no changes needed (classification log already captures corrections).
- [ ] **Settings panel: model status display** — In the existing settings panel (v3.0 tech debt target), show: model version, download status, number of corrections logged. Simple, not a full dashboard.
- [ ] **Tech debt cleanup** — Settings panel UX, status bar AI indicator, dead code in llm-worker.ts, isReadOnly enforcement, stale AIOrb comments (already in v3.0 scope).

### Add After Validation (v3.x)

- [ ] **Staleness score classifier** — Fine-tuned model for compress/review/keep prediction. Add once the type classifier is validated and the correction loop is producing quality data. Needs 100+ labeled staleness examples per class.
- [ ] **Compression candidate model** — Replaces heuristic candidate selection in compression coach. Higher complexity; add after staleness model is stable.
- [ ] **Section routing via nearest-neighbor** — Upgrade offline section routing from centroid average to per-atom embedding nearest-neighbor. Uses existing embeddings stored in classification log. Higher accuracy, same model.
- [ ] **Model quality dashboard** — Full settings panel view: correction count, model accuracy trend, training date, corpus size. Add when enough users are running the correction loop.
- [ ] **Priority prediction (research spike)** — Investigate whether behavioral signal capture is feasible without privacy violation. High risk, high reward. Treat as a spike before committing.

### Future Consideration (v4+)

- [ ] **Community training data contributions** — Opt-in mechanism for users to contribute anonymized corrections to a shared public corpus. Requires consent UX, anonymization pipeline, and a governance model. Significant complexity.
- [ ] **Domain-specific model variants** — Users with very specific GTD domains (legal, medical, academic) might benefit from domain-adapted models. Feasible with fine-tuning tooling but requires more training data per domain.
- [ ] **WebGPU acceleration** — Add `{device: 'webgpu'}` inference path for users on Chrome/Edge with discrete GPUs. Only after WebGPU achieves broader browser support.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority | Notes |
|---------|------------|---------------------|----------|-------|
| Synthetic training data corpus | HIGH | MEDIUM | P1 | Prerequisite — nothing else builds without it |
| Python fine-tuning + ONNX export script | HIGH | MEDIUM | P1 | Reproducible pipeline; output feeds all model features |
| ONNX type classifier in Tier 2 | HIGH | MEDIUM | P1 | Core v3.0 upgrade — replaces centroid similarity |
| Confidence calibration | HIGH | LOW | P1 | Required for pipeline escalation correctness |
| First-load download UX | HIGH | LOW | P1 | User trust — must know why app is pausing |
| Graceful fallback on model failure | HIGH | LOW | P1 | Resilience — degrades to Tier 1, never crashes |
| Correction export utility | MEDIUM | LOW | P1 | Enables future retraining cycles |
| Settings: model status display | MEDIUM | LOW | P1 | Tech debt target anyway; add model info here |
| Section routing via nearest-neighbor | HIGH | MEDIUM | P2 | Better offline routing, no new model download |
| Staleness score classifier | MEDIUM | HIGH | P2 | Add after type classifier is validated |
| Compression candidate model | MEDIUM | HIGH | P2 | Higher complexity; needs staleness model first |
| Model quality dashboard | LOW | MEDIUM | P3 | Nice for power users; not blocking for v3.0 |
| Priority prediction (spike) | MEDIUM | VERY HIGH | P3 | Research only — don't commit to shipping |
| Community corpus contributions | LOW | VERY HIGH | P3 | Requires governance — defer |

**Priority key:**
- P1: Must ship in v3.0 to deliver the milestone promise
- P2: Add after v3.0 core is validated
- P3: Future consideration or research spike

---

## Technical Constraints Specific to This Feature Set

### Model Size Budget

| Model | Architecture | INT8 Size | Cold Start (4G) | Inference Time (CPU) |
|-------|-------------|-----------|-----------------|----------------------|
| DistilBERT-base INT8 (type classifier) | 6-layer BERT, 66M params → ~66MB FP32, ~17–20MB INT8 | ~20MB | 5–8 sec download | 30–80ms per item |
| MiniLM-L6-v2 (already loaded for embeddings) | 6-layer, 22M params → ~23MB INT8 | Already cached | 0 sec (shared) | 20–40ms per item |
| Combined (MiniLM + type classifier) | Two separate models | ~43MB total new download | 8–15 sec first-time | — |

**Decision rationale:** MiniLM (already in the embedding worker) can be repurposed as the backbone for the type classifier by adding a classification head and fine-tuning. This avoids downloading a second model entirely. The classification head is a single linear layer (~5 × 384 = ~2K parameters). **Recommended approach: fine-tune a classification head on top of the existing MiniLM backbone** rather than introducing DistilBERT as a second model.

### Browser Storage Constraints

Transformers.js caches models to the **Cache API** (not IndexedDB). This avoids Dexie collision. Quota: Chrome allocates a fraction of available disk (typically 10–20% of disk space). Safari: ~1GB per origin. For a ~20MB INT8 MiniLM classifier, storage pressure is minimal on modern devices. Wrap cache writes in `QuotaExceededError` handler — fall back to in-memory-only mode (re-download on next session).

### Training Data Quality Requirements

Based on research (arXiv 2310.07849 — LLM synthetic data for text classification), models trained on synthetic data:
- Perform best when examples are topic-guided (diverse GTD scenarios, not repetitive patterns)
- Degrade on subjective tasks (a "decision" vs. "insight" is genuinely ambiguous — expect higher error rates on these two classes)
- Improve significantly when a small number of real user corrections are mixed in (few-shot curated data)

**Implication:** Generate 400–500 synthetic examples per class for the initial model. Prioritize real correction data for the decision/insight boundary — these are the hardest cases.

### Confidence Calibration

Softmax probabilities from fine-tuned classifiers are often overconfident. The current pipeline uses fixed thresholds (`classify-type: 0.65`, `route-section: 0.60`). After fine-tuning:

1. Hold out 20% of training data before training.
2. Run model on hold-out set; collect softmax probabilities and true labels.
3. Apply Platt scaling (logistic regression over raw probabilities) to calibrate.
4. Verify calibrated confidence tracks actual accuracy within 5% across the 0.5–0.9 range.
5. Only then integrate into the pipeline with existing thresholds.

If calibration fails (overconfidence persists), raise the threshold for `classify-type` from 0.65 to 0.75 for the ONNX model specifically.

---

## Interaction with Existing Pipeline

The existing pipeline in `src/ai/tier2/` does not need to be restructured — only the Tier 2 handler's `handle()` function for `classify-type` changes. The interface contract is unchanged:

```
TieredRequest → TieredResult { tier: 2, confidence: number, type: AtomType, reasoning: string }
```

The ONNX model inference replaces the centroid lookup:

```
Old: embed(text) → cosine_similarity(embedding, centroid) → top class + score
New: tokenize(text) → model.run(tokens) → softmax(logits) → top class + calibrated confidence
```

The centroid builder (`centroid-builder.ts`) and its persistence to Dexie can remain — the centroid still serves as a useful fallback if the ONNX model fails to load. The `canHandle()` method in the Tier 2 handler will check for ONNX model availability first, falling back to centroid mode if the model is not loaded.

---

## Sources

- [From PyTorch to Browser: full client-side ONNX + Transformers.js](https://bandarra.me/posts/from-pytorch-to-browser-a-full-client-side-solution-with-onnx-and-transformers-js) — confirmed MiniLM + custom ONNX classifier pattern; HIGH confidence
- [Transformers.js official docs — model loading](https://huggingface.co/docs/transformers.js/en/index) — `env.localModelPath`, `env.allowRemoteModels`, custom ONNX pipeline; HIGH confidence
- [HuggingFace Optimum — ONNX quantization docs](https://huggingface.co/docs/optimum-onnx/onnxruntime/usage_guides/quantization) — `ORTQuantizer`, `ORTModelForSequenceClassification`, INT8 dynamic quantization; HIGH confidence
- [Optimum CLI export](https://github.com/huggingface/optimum-onnx) — `optimum-cli export onnx` command; HIGH confidence
- [Synthetic Data Generation Using LLMs — arXiv 2503.14023](https://arxiv.org/abs/2503.14023) — topic-guided generation, diversity strategies, text classification results; MEDIUM confidence
- [Synthetic Data for Text Classification: Potential and Limitations — ACL/EMNLP 2023](https://aclanthology.org/2023.emnlp-main.647/) — subjectivity degrades synthetic data quality; MEDIUM confidence (2023, but findings still applicable)
- [Active Learning in ML — Encord 2025](https://encord.com/blog/active-learning-machine-learning-guide/) — uncertainty sampling reduces annotation needs 50–80%; MEDIUM confidence
- [Cleanlab for label quality](https://encord.com/blog/active-learning-machine-learning-guide/) — label noise detection; MEDIUM confidence
- [ONNX Runtime Web — large model storage](https://onnxruntime.ai/docs/tutorials/web/large-models.html) — Cache API vs IndexedDB for ONNX models; HIGH confidence
- [Optimizing Transformers.js for production — SitePoint](https://www.sitepoint.com/optimizing-transformers-js-production/) — cold-start latency breakdown, q8 recommendations; MEDIUM confidence
- [Model Drift Best Practices — Encord 2025](https://encord.com/blog/model-drift-best-practices/) — concept drift, retraining strategies, catastrophic forgetting; MEDIUM confidence
- [F1 Score for imbalanced classification — Analytics Vidhya 2025](https://www.analyticsvidhya.com/blog/2025/12/what-is-f1-score-in-machine-learning/) — evaluation metric selection; HIGH confidence
- [Transformers.js GitHub — custom ONNX model issue #1018](https://github.com/huggingface/transformers.js/issues/1018) — known limitations with custom ONNX models outside standard pipeline; MEDIUM confidence (community-reported)
- [Running AI models in browser — Worldline Tech Blog 2026](https://blog.worldline.tech/2026/01/13/transformersjs-intro.html) — general Transformers.js v3 patterns, Jan 2026; MEDIUM confidence

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| ONNX fine-tune → Transformers.js deployment pipeline | HIGH | Official docs + multiple verified community examples confirm the pattern end-to-end |
| MiniLM as classification backbone (add head, fine-tune) | HIGH | Standard HuggingFace pattern; MiniLM for sequence classification is well-documented |
| Synthetic GTD training data quality | MEDIUM | General LLM-labeling research is solid; GTD-specific synthetic data is novel and untested |
| Section routing via nearest-neighbor (Option B) | MEDIUM | Embedding-based classification is well understood; relies on sufficient section atom coverage |
| Staleness / compression models | LOW-MEDIUM | Domain is novel (personal productivity signals); training data construction is research-level |
| Confidence calibration (Platt scaling) | MEDIUM | Standard ML technique; browser-side pipeline integration requires care |
| Model drift / correction loop | MEDIUM | Browser storage patterns confirmed; retraining cadence is project-specific |
| Priority prediction | LOW | Behavioral signal capture raises privacy concerns; no clear training data source defined |

---

*Feature research for: fine-tuned in-browser ONNX classification models — BinderOS v3.0*
*Researched: 2026-03-03*
