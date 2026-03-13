# Requirements: BinderOS

**Defined:** 2026-03-12
**Core Value:** Every piece of stored information must encode predictive value about future actions, decisions, or understanding — if it doesn't change behavior, it's noise, and the system actively manages this boundary.

## v5.5 Requirements

Requirements for v5.5 Cortical Intelligence milestone. Each maps to roadmap phases.

### Context Gating

- [x] **GATE-01**: Agents activate only when relevant — a pre-dispatch `ActivationGate` filter in `dispatchTiered()` evaluates context predicates before any handler runs, without modifying the `TierHandler.canHandle()` interface
- [x] **GATE-02**: Route-aware gating skips triage and enrichment agents when user is on Insights, Archive, or Settings views — reads SolidJS `useLocation().pathname` reactively
- [x] **GATE-03**: Time-of-day gating suppresses deep-cognitive agents during low-energy windows based on hour of day — no new model, reads `Date.now()` only
- [x] **GATE-04**: Recent atom history gating skips re-enrichment when `atomIntelligence.enrichment.depth >= 2` and no content change within 7 days — reads sidecar, respects atom edits
- [x] **GATE-05**: Gate activation decisions are logged to a sidecar audit table so the harness can measure activation rates and tune predicate thresholds via Optuna

### Predictive Enrichment

- [x] **PRED-01**: Predictive scoring function replaces static `computeSignalRelevance()` with dynamic scoring over entity graph trajectory (recency, mention count deltas) and cognitive signal history window (composite signal trends over last-N atoms)
- [x] **PRED-02**: Cognitive signal delta trends computed from windowed query over last-N `CachedCognitiveSignal` records — rising `stress-risk` or `urgent-important` composites influence enrichment question priority ordering
- [x] **PRED-03**: Cold-start gate prevents predictions from activating until minimum evidence threshold is met (e.g., 15+ atoms with cognitive signals cached) — avoids wrong predictions eroding user trust in early usage

### Sequence Learning

- [x] **SEQ-01**: Embedding ring buffer maintains last N (default 5, tunable) MiniLM embeddings per binder in the embedding worker — capped memory, updated on atom save/triage completion only
- [x] **SEQ-02**: Lightweight ONNX sequence model (single-layer LSTM or attention head, <500KB) trained offline via Python pipeline on harness persona corpus, exported via PyTorch `dynamo=True` opset 18
- [x] **SEQ-03**: Sequence context embedding (128-dim) concatenated with MiniLM embedding (384-dim) before T2 classifier inference via new `sequenceContext` field on `TieredFeatures` — existing classifiers retrained with 512-dim input
- [x] **SEQ-04**: Harness ablation compares T2 classifier F1 with and without sequence context across N=3, N=5, N=7 window sizes — production classifiers only replaced after ablation confirms improvement

### Binder-Type Specialization

- [x] **BTYPE-01**: `BinderTypeConfig` interface formalized with column set (ONNX model IDs), compositor rules, enrichment categories, relationship patterns, entity types, and context gate predicates — GTD updated as first implementation
- [ ] **BTYPE-02**: Harness parameterized on `BinderTypeConfig` so training, adversarial cycles, and ablation reporting are config-driven — the harness becomes an SDK for training custom binder-type local stacks
- [ ] **BTYPE-03**: A stub non-GTD binder type (e.g., ProjectBinder) exercises the full adversarial cycle to validate the protocol isn't GTD-shaped — interface is proven pluggable before shipping

### Schema

- [x] **SCHM-01**: Dexie v10 migration adds `gateActivationLog`, `sequenceContext`, and `binderTypeConfig` tables — fully additive, no mutations to v1-v9 tables

### Canonical Feature Vectors

- [x] **CFVEC-01**: `computeTaskVector()` derives a typed Float32Array from atom metadata (age, staleness, deadline, context, energy, dependencies) and sidecar data — pure function, no model inference, deterministic output for same input
- [x] **CFVEC-02**: `computePersonVector()` derives a typed vector from entity registry data (relationship type, responsiveness, reliability, collaboration frequency) — sparse one-hot + normalized floats
- [x] **CFVEC-03**: `computeCalendarVector()` derives a typed vector from derived calendar atom fields (time pressure, slack windows, energy cost, overrun risk) — same sparse canonical format
- [x] **CFVEC-04**: Canonical vectors cached in `atomIntelligence.canonicalVector` as Float32Array snapshots, invalidated on atom save/triage/enrichment — vector dimension schemas defined per `BinderTypeConfig`

### Specialist Consensus

- [ ] **CONS-01**: 4+ specialist ONNX risk models trained on non-overlapping canonical vector slices (time-pressure, dependency, staleness, energy-context) — each under 20KB, exported via Python pipeline
- [x] **CONS-02**: `computeConsensus()` returns weighted-average probability + pairwise agreement score + majority vote from specialist outputs — pure function, no side effects
- [x] **CONS-03**: Consensus result stored in `atomIntelligence.consensusRisk` with per-specialist probability contributions for downstream explainability
- [ ] **CONS-04**: Cold-start guard prevents consensus from activating until binder has 15+ atoms with cached canonical vectors — avoids misleading early predictions

### Emergent Intelligence Index

- [ ] **EII-01**: `computeEII(binderId)` returns `{ coherence, stability, impact, eii }` — coherence from consensus AUC, stability from pairwise model agreement, impact from binder-level high-risk recall
- [ ] **EII-02**: EII computed after each harness adversarial cycle, stored in harness report with per-persona breakdowns — EII curve across corpus sizes must show positive slope
- [ ] **EII-03**: Ablation engine extended to measure consensus vs each specialist independently — report includes `consensus_lift` metric proving ensemble > any single model
- [ ] **EII-04**: Harness personas with 50+ atoms achieve EII > 0.80 — threshold validates the architecture produces emergent intelligence at realistic corpus sizes

### Risk Surfacing

- [ ] **RISK-01**: Inbox and review views sort by `consensusRisk` when available, falling back to staleness score — high-risk atoms surface without user action
- [ ] **RISK-02**: Tasks above 0.7 risk threshold show a risk indicator badge with one-line natural language explanation derived from per-specialist contributions
- [ ] **RISK-03**: Staleness prediction ONNX model forecasts when atoms will go stale based on temporal canonical vector patterns (age, days_since_touched, review cadence) — first predictive model
- [ ] **RISK-04**: Risk scores re-computed on triage, enrichment, or entity update — never stale for more than 24h on active binders; `predictionCache` TTL applies

## Future Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### Programmable Pages (v6.0)

- **PAGE-01**: Free-form programmable pages with embedded WASM runtimes (Pyodide, IronCalc, DuckDB)
- **PAGE-02**: Structured pages with predefined blocks for dashboards, workflows, guided modules
- **PAGE-03**: Agent-assisted pages — ONNX agents detect concepts, extract tasks, suggest structure within pages

### CRDT Sync (v7.0)

- **CRDT-01**: Cross-device P2P sync of entity knowledge graph via CRDT merge
- **CRDT-02**: Per-device agent stacks collaborating through shared enriched state, not shared compute

## Out of Scope

Explicitly excluded from v5.5. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| NuPIC / SDR algorithms | HTM as organizing principle only; ONNX transformers beat SDR on every practical benchmark |
| Centralized context orchestrator | Violates emergent/no-conductor architecture; `COMPOSITOR_RULES` handles multi-signal synthesis |
| Per-user personalized sequence model | Privacy surface too large; shared model trained on synthetic personas is correct approach |
| Real-time sequence embedding on keystroke | 50-100ms per call on mobile; trigger on atom save/triage only |
| Bio-inspired lateral inhibition protocol | Current confidence threshold + escalation already achieves functional equivalent |
| Separate prediction object database | Predictions are scores on existing candidates, not new stored objects |
| In-browser model training | ONNX Runtime Web is inference-only; Python offline pipeline is the training path |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCHM-01 | Phase 30 | Complete |
| BTYPE-01 | Phase 30 | Complete |
| GATE-01 | Phase 31 | Complete |
| GATE-02 | Phase 31 | Complete |
| GATE-03 | Phase 31 | Complete |
| GATE-04 | Phase 31 | Complete |
| GATE-05 | Phase 31 | Complete |
| PRED-01 | Phase 32 | Complete |
| PRED-02 | Phase 32 | Complete |
| PRED-03 | Phase 32 | Complete |
| SEQ-01 | Phase 33 | Complete |
| SEQ-02 | Phase 33 | Complete |
| SEQ-03 | Phase 33 | Complete |
| SEQ-04 | Phase 33 | Complete |
| BTYPE-02 | Phase 34 | Pending |
| BTYPE-03 | Phase 34 | Pending |
| CFVEC-01 | Phase 35 | Complete |
| CFVEC-02 | Phase 35 | Complete |
| CFVEC-03 | Phase 35 | Complete |
| CFVEC-04 | Phase 35 | Complete |
| CONS-01 | Phase 36 | Pending |
| CONS-02 | Phase 36 | Complete |
| CONS-03 | Phase 36 | Complete |
| CONS-04 | Phase 36 | Pending |
| EII-01 | Phase 37 | Pending |
| EII-02 | Phase 37 | Pending |
| EII-03 | Phase 37 | Pending |
| EII-04 | Phase 37 | Pending |
| RISK-01 | Phase 38 | Pending |
| RISK-02 | Phase 38 | Pending |
| RISK-03 | Phase 38 | Pending |
| RISK-04 | Phase 38 | Pending |

**Coverage:**
- v5.5 requirements: 32 total
- Mapped to phases: 32
- Unmapped: 0

---
*Requirements defined: 2026-03-12*
*Last updated: 2026-03-13 — added CFVEC, CONS, EII, RISK requirements from EII experiment validation*
