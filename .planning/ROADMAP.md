# Roadmap: BinderOS

## Milestones

- [x] **v1.0** — Foundation + Compute Engine + Pages/Navigation/Search (45/45 requirements, 11 plans, shipped 2026-02-22) → [Archive](.planning/milestones/v1.0-ROADMAP.md)
- [x] **v2.0 AI Orchestration** — Phases 4-7 (30/30 requirements, 14 plans, shipped 2026-03-03) → [Archive](.planning/milestones/v2.0-ROADMAP.md)
- [ ] **v3.0 Local AI + Polish** — Phases 9-12 (24 requirements, in progress)

## Phases

<details>
<summary>v1.0 Foundation (Phases 1-3) — SHIPPED 2026-02-22</summary>

See [Archive](.planning/milestones/v1.0-ROADMAP.md) for full detail.

- [x] **Phase 1: Foundation** - Typed atoms, IndexedDB persistence, worker bridge, capture UI
- [x] **Phase 2: Compute Engine** - Rust/WASM scoring, staleness decay, entropy health, cap enforcement
- [x] **Phase 3: Pages, Navigation, Search** - 5 page views, search overlay, command palette, tags, backlinks

</details>

<details>
<summary>v2.0 AI Orchestration (Phases 4-7) — SHIPPED 2026-03-03</summary>

See [Archive](.planning/milestones/v2.0-ROADMAP.md) for full detail.

- [x] **Phase 4: AI Infrastructure** - Worker isolation, adapter interface, store extension, trust & safety (4/4 plans, 2026-02-23)
- [x] **Phase 5: Triage AI** - Floating orb, radial menu, triage pipeline, suggestion tray, accept/dismiss (4/4 plans, 2026-02-24)
- [x] **Phase 6: Review Pre-Analysis** - Analysis atoms, briefing pipeline, session persistence, WebLLM (3/3 plans, 2026-02-26)
- [x] **Phase 7: Guided Review + Compression Coach** - GTD review flow, compression coach, staging area, AI mutation tracking (3/3 plans, 2026-03-02)

</details>

### v3.0 Local AI + Polish (Phases 9-12)

**Milestone Goal:** Replace centroid-similarity Tier 2 with real fine-tuned ONNX classifiers for full offline GTD intelligence. Cloud LLM becomes an optional quality boost, not a dependency. Ship with v2.0 tech debt resolved.

- [x] **Phase 9: Python Training Infrastructure** - Synthetic data corpus, classifier training, ONNX export, browser-runtime validation (completed 2026-03-04)
- [ ] **Phase 10: Browser Inference Integration** - ONNX inference in embedding worker, confidence calibration UX, graceful fallback, model caching
- [ ] **Phase 11: Tech Debt, Settings + Correction Utility** - Settings panel cleanup, v2.0 tech debt, model status display, correction export script
- [ ] **Phase 12: Section Routing** - Offline nearest-neighbor section routing, graceful degradation, no new model download

## Phase Details

### Phase 9: Python Training Infrastructure
**Goal**: Developer can generate, train, validate, and reproduce a fine-tuned ONNX type classifier from scratch
**Depends on**: Nothing (Python-only, no browser dependency)
**Requirements**: TRAIN-01, TRAIN-02, TRAIN-03, TRAIN-04, CONF-01
**Success Criteria** (what must be TRUE):
  1. Developer runs a single script that generates 300-500 labeled GTD training examples per atom type and writes them to `scripts/training-data/type-classification.jsonl`
  2. Developer runs a second script that trains the classifier head on MiniLM embeddings, applies Platt/temperature confidence calibration, and exports a validated `triage-type.onnx` file to `public/models/classifiers/`
  3. A browser-runtime validation harness confirms >95% top-1 prediction match between Python inference and ONNX Runtime Web on the same 50+ inputs
  4. A new developer can reproduce the entire pipeline (data generation through browser-validated ONNX export) using only `scripts/train/` and the committed `requirements.txt`
**Plans:** 2/2 plans complete
Plans:
- [ ] 09-01-PLAN.md — Project scaffold, synthetic data generation, and MiniLM embedding scripts
- [ ] 09-02-PLAN.md — Classifier training, ONNX export, and browser-runtime validation harness

### Phase 10: Browser Inference Integration
**Goal**: Users experience fully offline atom type classification via the fine-tuned ONNX model with correct escalation behavior and no UI blocking
**Depends on**: Phase 9 (for validated ONNX model file; can start with placeholder ONNX)
**Requirements**: INFER-01, INFER-02, INFER-03, INFER-04, INFER-05, CONF-02, CONF-03
**Success Criteria** (what must be TRUE):
  1. User triages an inbox atom with no internet connection and receives an AI type suggestion from the ONNX model (no cloud API call made)
  2. On first visit, user sees a progress indicator labeled "one-time download" while the ONNX model fetches; subsequent visits skip the download entirely
  3. When the ONNX model fails to load or errors, triage continues working via Tier 1 keyword heuristics with no crash or blank suggestion
  4. When two atom type probabilities are within 0.15 of each other, user sees both options presented rather than a single pre-filled type
  5. Classification log records `modelSuggestion` separately from `userChoice`, preserving the ability to detect and prevent model-collapse feedback loops
**Plans:** 3 plans
Plans:
- [ ] 10-01-PLAN.md -- ONNX classifier loading in embedding worker with Cache API and progress reporting
- [ ] 10-02-PLAN.md -- Pipeline wiring: Tier 2 ONNX switch, store signals, modelSuggestion capture
- [ ] 10-03-PLAN.md -- UX: StatusBar download progress and ambiguous two-button classification display

### Phase 11: Tech Debt, Settings + Correction Utility
**Goal**: v2.0 tech debt is resolved, settings panel is clean and informative, and developer has a correction export path for future retraining
**Depends on**: Phase 10 (model status display requires ONNX integration to be live)
**Requirements**: CORR-01, CORR-02, POLISH-01, POLISH-02, POLISH-03, POLISH-04, POLISH-05, POLISH-06, POLISH-07
**Success Criteria** (what must be TRUE):
  1. User opens settings and sees model version, download status, and correction count displayed clearly
  2. User opens settings and finds a clean, readable panel (v2.0 rough UX resolved)
  3. Developer runs a script that exports all classification corrections (`chosenType != suggestedType`) from Dexie as JSONL, with the original synthetic corpus preserved as a floor
  4. Dead code in `llm-worker.ts` is removed, `isReadOnly` is enforced at UI level, and stale AIOrb comments and verbose status bar are cleaned up
**Plans**: TBD

### Phase 12: Section Routing
**Goal**: Users' section suggestions work offline using embedding nearest-neighbor against their own section atoms, with no new model download
**Depends on**: Phase 10 (embedding worker must handle CLASSIFY_ONNX; nearest-neighbor reuses same MiniLM worker)
**Requirements**: ROUTE-01, ROUTE-02, ROUTE-03
**Success Criteria** (what must be TRUE):
  1. User triages an inbox atom with no internet connection and receives a section suggestion derived from similarity to existing section atoms (no cloud API call)
  2. Section suggestion uses per-atom embedding similarity rather than centroid averaging, matching more precisely to the user's existing content
  3. When a user has insufficient section atoms for reliable nearest-neighbor matching, section routing falls back to the existing centroid or Tier 1 path without error
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 4/4 | Complete | 2026-02-22 |
| 2. Compute Engine | v1.0 | 3/3 | Complete | 2026-02-22 |
| 3. Pages, Navigation, Search | v1.0 | 4/4 | Complete | 2026-02-22 |
| 4. AI Infrastructure | v2.0 | 4/4 | Complete | 2026-02-23 |
| 5. Triage AI | v2.0 | 4/4 | Complete | 2026-02-24 |
| 6. Review Pre-Analysis | v2.0 | 3/3 | Complete | 2026-02-26 |
| 7. Guided Review + Compression Coach | v2.0 | 3/3 | Complete | 2026-03-02 |
| 9. Python Training Infrastructure | 2/2 | Complete   | 2026-03-04 | - |
| 10. Browser Inference Integration | v3.0 | 0/3 | Planning complete | - |
| 11. Tech Debt, Settings + Correction Utility | v3.0 | 0/TBD | Not started | - |
| 12. Section Routing | v3.0 | 0/TBD | Not started | - |
