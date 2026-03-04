# Requirements: BinderOS v3.0

**Defined:** 2026-03-03
**Core Value:** Every piece of stored information must encode predictive value about future actions, decisions, or understanding — if it doesn't change behavior, it's noise, and the system actively manages this boundary.

## v3.0 Requirements

Requirements for the Local AI + Polish milestone. Each maps to roadmap phases.

### Training Pipeline

- [x] **TRAIN-01**: Developer can generate 300–500 labeled synthetic GTD training examples per atom type (task, fact, event, decision, insight) via cloud LLM script
- [ ] **TRAIN-02**: Developer can fine-tune a classification head on MiniLM embeddings using the synthetic training corpus and export a validated ONNX model
- [ ] **TRAIN-03**: Developer can validate the exported ONNX model in a browser-runtime harness with >95% top-1 prediction match vs Python inference
- [x] **TRAIN-04**: Developer can reproduce the full training pipeline from synthetic data generation through ONNX export via committed scripts in `scripts/train/`

### Model Inference

- [ ] **INFER-01**: User's inbox triage type classification (task/fact/event/decision/insight) works fully offline using the fine-tuned ONNX model in Tier 2
- [ ] **INFER-02**: User sees a progress indicator during first-time model download with clear messaging ("one-time download")
- [ ] **INFER-03**: User's triage continues working via Tier 1 keyword heuristics if the ONNX model fails to load or errors during inference
- [ ] **INFER-04**: User experiences no UI blocking during model loading — all ONNX inference runs in the embedding worker off main thread
- [ ] **INFER-05**: ONNX model files are cached in browser Cache API across sessions — no re-download on subsequent visits

### Confidence & Calibration

- [ ] **CONF-01**: ONNX model confidence scores are calibrated (Platt/temperature scaling) so pipeline escalation thresholds produce correct Tier 2→3 escalation rates
- [ ] **CONF-02**: When top-2 class probabilities are within 0.15 of each other, user sees both options rather than a single pre-filled suggestion
- [ ] **CONF-03**: Classification log captures `modelSuggestion` separately from `userChoice` to prevent model-collapse feedback loops

### Section Routing

- [ ] **ROUTE-01**: User's section routing works offline using embedding nearest-neighbor against existing section atoms (no cloud dependency)
- [ ] **ROUTE-02**: Section routing uses per-atom embedding similarity rather than centroid averaging for higher accuracy
- [ ] **ROUTE-03**: Section routing gracefully degrades when insufficient section atoms exist (falls back to existing centroid or Tier 1)

### Correction & Retraining

- [ ] **CORR-01**: Developer can export classification corrections (chosenType != suggestedType) from Dexie as JSONL for retraining via offline script
- [ ] **CORR-02**: Correction export preserves the original synthetic training corpus as a floor — corrections augment, never replace

### Settings & Polish

- [ ] **POLISH-01**: User can see model version, download status, and correction count in the settings panel
- [ ] **POLISH-02**: Settings panel UX is cleaned up (v2.0 tech debt)
- [ ] **POLISH-03**: Status bar AI indicator is less verbose (v2.0 tech debt)
- [ ] **POLISH-04**: Dead code in `src/worker/llm-worker.ts` is removed
- [ ] **POLISH-05**: `isReadOnly` is enforced at UI level — read-only atoms cannot be edited
- [ ] **POLISH-06**: Stale comments in AIOrb component are cleaned up
- [ ] **POLISH-07**: Resume UX uses explicit prompt instead of badge dot

## Future Requirements

Deferred to v3.x or later. Tracked but not in current roadmap.

### Advanced Models

- **ADV-01**: Staleness score classifier predicts compress/review/keep from content + entropy signals
- **ADV-02**: Compression candidate model replaces heuristic candidate selection with ML-based predictions
- **ADV-03**: Model quality dashboard shows accuracy trend, training date, corpus size in settings

### Community & Ecosystem

- **COMM-01**: Users can opt-in to contribute anonymized corrections to a shared public training corpus
- **COMM-02**: Domain-specific model variants for specialized GTD workflows (legal, medical, academic)

## Out of Scope

| Feature | Reason |
|---------|--------|
| In-browser model retraining | ONNX Runtime Web is inference-only; retraining requires Python offline pipeline |
| Continuous online learning | Catastrophic forgetting on single examples; use correction log + offline retrain cycle |
| Per-user personalized models | Privacy surface too large for open-source tool without backend |
| Auto-tuning confidence thresholds | Creates unpredictable escalation behavior; use fixed thresholds with AI assertiveness slider |
| Multi-task single model | Section routing has dynamic user-specific labels; must be separate models |
| WebGPU acceleration | CPU ONNX is <50ms for 5-class classification; WebGPU not universally available |
| Bundling ONNX model in JS chunks | 60-80MB would break Vite chunking; Cache API is the correct mechanism |
| Priority prediction model | Behavioral signal capture raises privacy concerns; no clear training data path |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| TRAIN-01 | Phase 9 | Complete |
| TRAIN-02 | Phase 9 | Pending |
| TRAIN-03 | Phase 9 | Pending |
| TRAIN-04 | Phase 9 | Complete |
| CONF-01 | Phase 9 | Pending |
| INFER-01 | Phase 10 | Pending |
| INFER-02 | Phase 10 | Pending |
| INFER-03 | Phase 10 | Pending |
| INFER-04 | Phase 10 | Pending |
| INFER-05 | Phase 10 | Pending |
| CONF-02 | Phase 10 | Pending |
| CONF-03 | Phase 10 | Pending |
| CORR-01 | Phase 11 | Pending |
| CORR-02 | Phase 11 | Pending |
| POLISH-01 | Phase 11 | Pending |
| POLISH-02 | Phase 11 | Pending |
| POLISH-03 | Phase 11 | Pending |
| POLISH-04 | Phase 11 | Pending |
| POLISH-05 | Phase 11 | Pending |
| POLISH-06 | Phase 11 | Pending |
| POLISH-07 | Phase 11 | Pending |
| ROUTE-01 | Phase 12 | Pending |
| ROUTE-02 | Phase 12 | Pending |
| ROUTE-03 | Phase 12 | Pending |

**Coverage:**
- v3.0 requirements: 24 total
- Mapped to phases: 24
- Unmapped: 0

---
*Requirements defined: 2026-03-03*
*Last updated: 2026-03-03 after roadmap creation — all 24 requirements mapped to phases 9-12*
