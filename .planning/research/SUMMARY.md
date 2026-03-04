# Project Research Summary

**Project:** BinderOS v3.0 — Local AI + Polish Milestone
**Domain:** Fine-tuned in-browser ONNX classification models for offline GTD intelligence
**Researched:** 2026-03-03
**Confidence:** MEDIUM-HIGH (core ONNX/Transformers.js patterns HIGH; GTD-specific synthetic data and model quality MEDIUM)

## Executive Summary

BinderOS v3.0 upgrades the existing 3-tier AI pipeline by replacing centroid-similarity matching (Tier 2) with real fine-tuned ONNX classification models. The milestone promises "full offline GTD intelligence" — atom triage and section routing that works without any cloud API key, at quality parity with or better than the current centroid approach. The recommended implementation is a two-model pipeline: the existing MiniLM embedding model (already running in the embedding worker) produces 384-dim vectors that are fed into a lightweight PyTorch classifier head exported to ONNX (~200–400KB per task type). This eliminates a second large model download, reuses an already-loaded model, and keeps browser memory pressure minimal.

The critical path is entirely in Python, not TypeScript. Before any browser integration can activate, a synthetic training data corpus must be generated (Anthropic API, ~$0.01–0.05, 300–500 labeled examples per GTD atom type), a classifier head must be trained and exported to ONNX (PyTorch + HuggingFace sentence-transformers + optimum[onnx]), and the exported model must be validated in a browser-runtime harness using `onnxruntime-web` directly — not just Python's `onnxruntime`. The browser integration itself is surgical: two modified files (`embedding-worker.ts` and `tier2-handler.ts`), two new ONNX files in `public/models/classifiers/`, and a centroid fallback preserved throughout. The existing tiered pipeline, escalation logic, classification log schema, and all store signals remain unchanged.

Key risks cluster around data quality and model validation, not technical integration. Synthetic training data trained on LLM-generated examples can produce models that are confidently wrong on real user input (fragments, typos, mixed-case, ambiguous cross-category items). Confidence calibration is required before the model enters the pipeline — raw softmax probabilities are overconfident and will misfire escalation thresholds. A model-collapse feedback loop is possible if users rubber-stamp model suggestions, which then become training data for the next version. These risks are all mitigable with well-defined process controls at the data generation and retraining stages.

## Key Findings

### Recommended Stack

The v3.0 stack adds a Python-only developer toolchain alongside minimal browser-side changes. The core SolidJS + Vite + Dexie + ONNX Runtime Web stack is unchanged. New Python tools run on developer machines only and produce `.onnx` artifacts committed to git.

**Core technologies (browser — unchanged):**
- `@huggingface/transformers` v3.8.1: MiniLM embedding worker — already running, no changes
- `onnxruntime-web` (transitive via Transformers.js): ONNX inference in Web Worker — extended with `CLASSIFY_ONNX` message type
- Dexie.js 4.0: classification log already captures `ClassificationEvent` with embeddings, tier, confidence — no schema changes needed for v3.0 core

**New Python toolchain (developer machine only):**
- Python 3.11+ + PyTorch 2.4+: classifier head training (5-class GTD atom type)
- `sentence-transformers` 3.x: embedding generation during training — must use identical model as browser (Xenova/all-MiniLM-L6-v2, mean pooling, normalized)
- `optimum[onnx]` 2.1.0: ONNX export and INT8 quantization via `ORTQuantizer`
- `onnxruntime` 1.24.x: Python-side validation before browser deployment
- Anthropic Claude API (existing key): synthetic training data generation (~$0.01–0.05 per run)

**Architecture key decision:** The classifier head is a separate ONNX file that accepts the 384-dim MiniLM embedding vector as input and outputs class logits. It is NOT a full fine-tuned transformer — it is a 2-layer MLP (~200–400KB) that sits downstream of the existing embedding model. Multiple task classifiers remain well under 2MB total.

See [STACK.md](.planning/research/STACK.md) for full decision rationale.

### Expected Features

**Must have (table stakes — P1 for v3.0 launch):**
- Synthetic training data corpus (300–500 labeled GTD examples per class) — prerequisite to all model features
- Python fine-tuning + ONNX export script — reproducible, committed to `scripts/train/`
- ONNX type classifier in Tier 2 — replaces centroid similarity for `classify-type` task
- Confidence calibration (Platt/temperature scaling) — required for pipeline escalation correctness; uncalibrated softmax misfires existing `CONFIDENCE_THRESHOLDS`
- First-load download UX — progress indicator for the one-time model download
- Graceful fallback when ONNX model fails — fall through to Tier 1 keyword heuristics, no crash
- Correction export utility — offline script to extract `chosenType != suggestedType` events from Dexie for future retraining
- Settings panel model status — model version, download status, correction count (tech debt cleanup already in v3.0 scope)

**Should have (P2 — add after core validated):**
- Section routing via nearest-neighbor embedding (Option B) — reuses MiniLM, no new model download, avoids dynamic-label problem of a shared section model
- Staleness score classifier — requires separate training data; add once type classifier is stable
- Compression candidate model — depends on staleness model; higher complexity

**Defer (v3.x / P3):**
- Model quality dashboard (full settings panel view with accuracy trend)
- Priority prediction (behavioral signal capture raises privacy concerns; treat as research spike)
- Community corpus contributions (requires consent UX, anonymization, governance)
- WebGPU acceleration (CPU ONNX is <50ms for 5-class classification; WebGPU not universally available)

**Anti-features (do not build):**
- In-browser retraining: ONNX Runtime Web is inference-only; retraining requires Python offline pipeline
- Continuous online learning: catastrophic forgetting on single examples; use correction log + offline retrain cycle
- Auto-tune confidence thresholds per user: creates unpredictable escalation behavior; use fixed thresholds with a simple "AI assertiveness" slider
- Multi-task single model: section routing uses dynamic user-specific labels; must be separate models or use embedding nearest-neighbor
- Bundle large model with app: DistilBERT-base INT8 is ~60–80MB; browser Cache API is the correct caching mechanism

See [FEATURES.md](.planning/research/FEATURES.md) for full prioritization matrix and dependency graph.

### Architecture Approach

The integration is a surgical replacement inside one component. The Tier 2 handler's centroid cosine similarity lookup is replaced by an ONNX inference call to the embedding worker. The `TierHandler` interface, `dispatchTiered()` pipeline, `ClassificationEvent` schema, and all store signals are unchanged. The embedding worker gains a `CLASSIFY_ONNX` message type and a `Map<task, InferenceSession>` singleton for cached ONNX sessions. The centroid builder is preserved as fallback during bootstrap (when ONNX model files are absent) and is gated by a `getOnnxReady(task)` flag.

**Major components:**
1. `scripts/train/` (NEW — Python only): 4-step pipeline — synthetic data generation, embedding via Python MiniLM, classifier head training, ONNX export + browser-runtime validation
2. `public/models/classifiers/` (NEW — static assets): `triage-type.onnx`, `route-section.onnx` — committed to git (~200–400KB each), served by Vite as static assets, no Vite config changes needed
3. `src/search/embedding-worker.ts` (MODIFIED): adds ONNX InferenceSession management + `CLASSIFY_ONNX` / `ONNX_CLASSIFY_RESULT` message types; MiniLM pipeline unchanged
4. `src/ai/tier2/tier2-handler.ts` (MODIFIED): replaces centroid cosine comparison with ONNX inference call; centroid path preserved as fallback via `getOnnxReady()` flag
5. `src/ai/tier2/types.ts` (MODIFIED): confidence threshold tuning based on measured ONNX model accuracy (start at 0.78 for `classify-type`, not the current 0.65)

**Unchanged (confirmed from codebase):** `pipeline.ts`, `handler.ts`, `tier1-handler.ts`, `tier3-handler.ts`, `centroid-builder.ts`, `classification-log.ts`, `router.ts`, `triage.ts`, `compression.ts`, all SolidJS store signals.

**Build order:** Phase A (Python training) and Phase B (browser integration with placeholder ONNX) can proceed in parallel. Phase C integrates trained models. This prevents the Python training timeline from blocking TypeScript development.

See [ARCHITECTURE.md](.planning/research/ARCHITECTURE.md) for full component diagram, data flow sequences, and new/modified/unchanged component tables.

### Critical Pitfalls

See [PITFALLS.md](.planning/research/PITFALLS.md) for all 7 critical pitfalls with prevention checklists, recovery strategies, and "looks done but isn't" verification checklist. Top 5:

1. **ONNX numerical mismatch (Python vs browser WASM backend)** — After ONNX export, validate using `onnxruntime-web` in a browser-side harness on 50+ representative inputs, NOT just Python `onnxruntime`. Assert top-1 predictions match on >95% of inputs. Keep opset at 17. A `max_diff > 0.01` on softmax logits is a release blocker. Prevention phase: training pipeline.

2. **Synthetic data distribution gap (model is confidently wrong on real input)** — LLM-generated examples are fluent; real user input is fragmentary, typo-ridden, and ambiguous. Generate diverse examples including short fragments, typo-variants, and cross-category cases. Test set must include 50–100 real-style examples. Set initial Tier 2 threshold at 0.78–0.80. Prevention phase: synthetic data generation.

3. **Model-collapse feedback loop from approval fatigue** — Log `modelSuggestion` separately from `userChoice` in the classification log (requires Dexie schema migration). Always keep original synthetic data as a training floor — never replace it with only user-confirmed data. Show top-2 predictions to reduce rubber-stamping. Prevention phase: data collection design and schema update before classifier ships.

4. **GTD classification ambiguity causes overconfident wrong predictions** — task/decision/insight boundaries are subjective; 15–25% of real items are genuinely ambiguous. For inputs where top-2 class probabilities are within 0.15 of each other, show both options rather than pre-filling. Use label smoothing (epsilon=0.1) during training. Prevention phase: synthetic data generation and UI integration.

5. **ONNX model files accidentally bundled in JS chunk** — Place all `.onnx` files in `public/models/classifiers/`. Never import `.onnx` in TypeScript. Reference by URL string. Verify: no JS chunk in `dist/assets/` exceeds 2MB after integration. Prevention phase: first browser integration phase.

## Implications for Roadmap

The natural phase structure follows the dependency chain: training data and Python toolchain must exist before ONNX models can be produced; ONNX models can be integrated into the browser before training completes (using a placeholder); both converge at integration testing.

### Phase 1: Python Training Infrastructure and Synthetic Data

**Rationale:** Everything else depends on trained ONNX artifacts. Synthetic data generation is the critical path — no training data means no model. This phase has no TypeScript changes and can be executed fully independently. The `modelSuggestion` field must also be added to the classification log schema here — retrofitting it after the classifier ships is painful.
**Delivers:** `scripts/train/` with 4-step reproducible pipeline; `scripts/training-data/type-classification.jsonl` (300–500 labeled examples per class, including diverse/fragmentary/ambiguous examples); `requirements.txt` for Python environment; `modelSuggestion` field added to `ClassificationEvent` schema in Dexie with migration.
**Addresses:** Synthetic training data corpus (P1), Python fine-tuning + ONNX export script (P1)
**Avoids:** Synthetic data distribution gap (Pitfall 2) — diversity requirements and real-style test set defined here; model-collapse schema requirement (Pitfall 5) — `modelSuggestion` field added before classifier ships

**Research flag:** SKIP — stack decisions are confirmed (PyTorch + sentence-transformers + optimum[onnx]). Standard ML pipeline with well-documented tools. Proceed directly.

### Phase 2: ONNX Model Training and Validation

**Rationale:** With training data in hand, train the classifier head, export to ONNX, and validate. The browser-runtime validation harness is the acceptance gate — the model does not ship to the browser until it passes `onnxruntime-web` validation on 50+ inputs with top-1 match rate >95%. Confidence calibration must happen here before browser integration begins.
**Delivers:** `public/models/classifiers/triage-type.onnx` validated by browser-runtime harness; confidence calibration applied (Platt scaling on 20% hold-out); accuracy on real-style test set >75%; per-class sample count report to guard against minority-class collapse.
**Addresses:** ONNX type classifier in Tier 2 (P1), Confidence calibration (P1)
**Avoids:** ONNX numerical mismatch (Pitfall 1) — browser-runtime validation is the phase gate; GTD ambiguity overconfidence (Pitfall 6) — label smoothing applied during training, starting threshold set at 0.78

**Research flag:** SKIP — ONNX export + validation pattern confirmed by official Optimum docs and bandarra.me reference implementation. No additional research needed.

### Phase 3: Browser Inference Integration

**Rationale:** Can start before Phase 2 completes using a placeholder ONNX (random-weight sklearn LogisticRegression export) to validate worker wiring. When Phase 2 delivers validated model files, ONNX-backed inference activates. COOP/COEP headers must be addressed during this phase — they are a deployment blocker.
**Delivers:** `embedding-worker.ts` extended with `CLASSIFY_ONNX` message handler + session cache; `tier2-handler.ts` with ONNX inference path + centroid fallback flag; first-load download UX with progress indicator; graceful fallback when model fails to load; COOP/COEP headers verified on production hosting; bundle size check confirms no `.onnx` in JS chunks.
**Addresses:** First-load download UX (P1), Graceful fallback on model failure (P1)
**Avoids:** ONNX model files bundled in JS chunk (Pitfall 7) — `public/models/` pattern enforced; env.allowLocalModels cache poisoning (Pitfall 4) — env flags set as first operations in worker; COOP/COEP header breakage (Pitfall 3) — `credentialless` policy + `SharedArrayBuffer` test on production

**Research flag:** SKIP — the `classifyViaWorker()` pattern already exists in `tier2-handler.ts`; ONNX path follows the same structure. May need minor investigation on COOP/COEP header syntax for the specific production hosting environment, but this is environment-specific configuration, not research.

### Phase 4: Tech Debt + Settings Panel + Correction Utility

**Rationale:** v3.0 scope includes existing tech debt cleanup (settings panel UX, status bar AI indicator, dead code in `llm-worker.ts`, `isReadOnly` enforcement, stale AIOrb comments). Model status display and correction export utility are low-complexity additions that naturally belong alongside this cleanup work.
**Delivers:** Settings panel showing model version, download status, correction count; `scripts/export-corrections.ts` offline utility for extracting classification corrections from Dexie as JSONL for retraining; tech debt items resolved.
**Addresses:** Settings: model status display (P1), Correction export utility (P1)
**Avoids:** No specific pitfalls — consolidation and cleanup phase.

**Research flag:** SKIP — no research needed. All work is within existing codebase patterns.

### Phase 5: Section Routing via Nearest-Neighbor (P2 — Post-Core)

**Rationale:** Section routing via embedding nearest-neighbor (Option B from FEATURES.md) is higher-value than a fine-tuned section classifier because user sections are dynamic — a shared trained model cannot handle variable output labels across users. Option B reuses the existing MiniLM worker with no new model download and achieves higher accuracy than centroid averaging.
**Delivers:** Offline section routing replacing centroid averaging; per-atom embedding nearest-neighbor to existing section atoms stored in Dexie; no new model file or download.
**Addresses:** Section routing via nearest-neighbor (P2)

**Research flag:** SKIP — embedding nearest-neighbor is a well-understood retrieval technique. Implementation is within the `tier2-handler.ts` route-section task path.

### Phase Ordering Rationale

- Python training (Phase 1–2) and browser integration (Phase 3) overlap by design — the browser integration uses a placeholder ONNX from day one, preventing the training timeline from blocking frontend development.
- Synthetic data pipeline is first because it is the prerequisite dependency for all model work. No training data means no model.
- `modelSuggestion` field must be added to the classification log schema in Phase 1, before the classifier ships in Phase 3. Retrofitting this schema change after production data is recorded is costly.
- Tech debt cleanup deferred to Phase 4 to avoid mixing high-risk model validation work with low-risk code cleanup. Completing model integration first means the core feature is working before cleanup introduces unrelated churn.
- Section routing last because it is P2 scope and adds value incrementally after the type classifier is validated in production.

### Research Flags

Phases needing deeper research during planning:
- **None.** All critical decisions are resolved in the research files. Stack, architecture, and pitfall mitigations are confirmed with HIGH-MEDIUM confidence from official documentation and working examples.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Python toolchain):** Standard ML pipeline with well-documented tools (PyTorch + sentence-transformers + optimum[onnx]).
- **Phase 2 (ONNX training):** Official ONNX export docs + Optimum docs + existing BinderOS embedding patterns.
- **Phase 3 (browser integration):** Existing `classifyViaWorker()` pattern is the template; ONNX path extends it with `CLASSIFY_ONNX`.
- **Phase 4 (tech debt):** Pure code cleanup within established patterns.
- **Phase 5 (section routing):** Standard embedding nearest-neighbor retrieval.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core browser stack unchanged and validated through v2.0. Python toolchain (PyTorch + sentence-transformers + optimum[onnx]) verified against official docs. Classifier head architecture (MiniLM embed + lightweight ONNX classification head) confirmed by bandarra.me reference implementation and HuggingFace official patterns. |
| Features | MEDIUM-HIGH | ONNX/Transformers.js integration pipeline HIGH confidence. Synthetic GTD data quality is novel — no prior GTD-specific studies exist — MEDIUM. Staleness/compression models are research-level — correctly deferred to P2/P3. Section routing Option B (nearest-neighbor) is MEDIUM confidence: well-understood technique, relies on sufficient section atom coverage in user's Dexie. |
| Architecture | HIGH | Architecture research was derived directly from reading the existing BinderOS codebase. Component boundaries, unchanged files, and modification targets are confirmed against current implementation in `src/ai/tier2/` and `src/search/embedding-worker.ts`. Build order validated against dependency graph. |
| Pitfalls | HIGH | ONNX Runtime Web operator gaps and WASM backend numerical behavior verified against official docs and GitHub issues. Synthetic data model-collapse and distribution shift backed by peer-reviewed papers (Shumailov et al. Nature 2024; ACL/EMNLP 2025; arXiv 2503.14023). COOP/COEP patterns verified against web.dev and working Vite configurations. GTD classification ambiguity from ACL LAW-XIX 2025. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **GTD-specific synthetic data quality on decision/insight boundary:** No prior studies on this specific classification pair. The "decision vs. insight" boundary is acknowledged as the hardest case. Plan to generate intentionally ambiguous cross-category examples and validate specifically on this boundary with real-style examples before shipping. If calibrated accuracy on decision/insight remains below 65% after training, consider collapsing them into a single class with secondary UI selection.
- **Confidence threshold tuning requires empirical measurement:** The recommended starting threshold of 0.78 for `classify-type` is based on research analysis, not measured performance on a trained model. Plan one calibration iteration after the first model is trained — measure escalation rate on a held-out set and adjust before integration testing.
- **Production hosting COOP/COEP configuration:** The specific hosting environment for the production PWA is not captured in the research. The COEP `credentialless` header approach is confirmed technically correct but must be tested against whatever CDN/server serves the production build. Flag for Phase 3 environment setup.
- **Classification log `modelSuggestion` field for pre-v3.0 entries:** Existing classification log entries do not have the `modelSuggestion` field required by the model-collapse guard (Pitfall 5). The Dexie migration will handle new entries. Decide explicitly in Phase 1 whether to back-populate existing entries as `undefined` or mark pre-v3.0 entries as non-eligible for retraining via a version field.

## Sources

### Primary (HIGH confidence)
- [From PyTorch to Browser: full client-side ONNX + Transformers.js — bandarra.me](https://bandarra.me/posts/from-pytorch-to-browser-a-full-client-side-solution-with-onnx-and-transformers-js) — confirmed two-model pipeline (MiniLM embed + custom ONNX classification head)
- [Transformers.js official docs](https://huggingface.co/docs/transformers.js/en/index) — `env.localModelPath`, `env.allowRemoteModels`, Cache API model caching
- [HuggingFace Optimum ONNX docs](https://huggingface.co/docs/optimum-onnx/onnxruntime/usage_guides/quantization) — `ORTQuantizer`, INT8 dynamic quantization
- [ONNX Runtime Web official docs](https://onnxruntime.ai/docs/tutorials/web/) — `InferenceSession` API, WASM execution provider, operator support
- [skl2onnx documentation](https://onnx.ai/sklearn-onnx/) — sklearn model ONNX export, opset compatibility
- [ONNX Runtime Web — large model storage](https://onnxruntime.ai/docs/tutorials/web/large-models.html) — Cache API vs IndexedDB for ONNX models
- Existing BinderOS codebase (`src/search/embedding-worker.ts`, `src/ai/tier2/`) — integration constraints derived from current implementation

### Secondary (MEDIUM confidence)
- [Synthetic Data Generation Using LLMs — arXiv 2503.14023](https://arxiv.org/abs/2503.14023) — topic-guided generation, diversity strategies
- [Demystifying Synthetic Data in LLM Pre-training — ACL/EMNLP 2025](https://aclanthology.org/2025.emnlp-main.544/) — model collapse, real+synthetic mixtures
- [AI models collapse when trained on recursively generated data — Nature 2024](https://www.nature.com/articles/s41586-024-07566-y) — foundational model collapse paper (Shumailov et al.)
- [Measuring Label Ambiguity in Subjective Tasks — ACL LAW-XIX 2025](https://aclanthology.org/2025.law-1.2/) — entropy-based ambiguity scoring for subjective classification
- [ONNX Runtime Web COOP/COEP requirements — web.dev](https://web.dev/articles/coop-coep) — SharedArrayBuffer cross-origin isolation
- [Optimizing Transformers.js for production — SitePoint](https://www.sitepoint.com/optimizing-transformers-js-production/) — cold-start latency, main thread blocking patterns
- [Faster and smaller quantized NLP — Microsoft/Medium](https://medium.com/microsoftazure/faster-and-smaller-quantized-nlp-with-hugging-face-and-onnx-runtime-ec5525473bb7) — BERT quantization accuracy drop patterns

### Tertiary (LOW-MEDIUM confidence)
- [Active Learning in ML — Encord 2025](https://encord.com/blog/active-learning-machine-learning-guide/) — uncertainty sampling reduces annotation needs 50–80%
- [Model Drift Best Practices — Encord 2025](https://encord.com/blog/model-drift-best-practices/) — retraining strategies, catastrophic forgetting
- [Local-First AI definitive guide — SitePoint 2026](https://www.sitepoint.com/definitive-guide-local-first-ai-2026/) — OPFS model caching, cache invalidation with version manifests

---
*Research completed: 2026-03-03*
*Ready for roadmap: yes*
