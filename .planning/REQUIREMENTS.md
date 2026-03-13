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

- [ ] **SEQ-01**: Embedding ring buffer maintains last N (default 5, tunable) MiniLM embeddings per binder in the embedding worker — capped memory, updated on atom save/triage completion only
- [ ] **SEQ-02**: Lightweight ONNX sequence model (single-layer LSTM or attention head, <500KB) trained offline via Python pipeline on harness persona corpus, exported via PyTorch `dynamo=True` opset 18
- [ ] **SEQ-03**: Sequence context embedding (128-dim) concatenated with MiniLM embedding (384-dim) before T2 classifier inference via new `sequenceContext` field on `TieredFeatures` — existing classifiers retrained with 512-dim input
- [ ] **SEQ-04**: Harness ablation compares T2 classifier F1 with and without sequence context across N=3, N=5, N=7 window sizes — production classifiers only replaced after ablation confirms improvement

### Binder-Type Specialization

- [x] **BTYPE-01**: `BinderTypeConfig` interface formalized with column set (ONNX model IDs), compositor rules, enrichment categories, relationship patterns, entity types, and context gate predicates — GTD updated as first implementation
- [ ] **BTYPE-02**: Harness parameterized on `BinderTypeConfig` so training, adversarial cycles, and ablation reporting are config-driven — the harness becomes an SDK for training custom binder-type local stacks
- [ ] **BTYPE-03**: A stub non-GTD binder type (e.g., ProjectBinder) exercises the full adversarial cycle to validate the protocol isn't GTD-shaped — interface is proven pluggable before shipping

### Schema

- [x] **SCHM-01**: Dexie v10 migration adds `gateActivationLog`, `sequenceContext`, and `binderTypeConfig` tables — fully additive, no mutations to v1-v9 tables

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
| SEQ-01 | Phase 33 | Pending |
| SEQ-02 | Phase 33 | Pending |
| SEQ-03 | Phase 33 | Pending |
| SEQ-04 | Phase 33 | Pending |
| BTYPE-02 | Phase 34 | Pending |
| BTYPE-03 | Phase 34 | Pending |

**Coverage:**
- v5.5 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0

---
*Requirements defined: 2026-03-12*
*Last updated: 2026-03-12 after roadmap creation — all 16 requirements mapped*
