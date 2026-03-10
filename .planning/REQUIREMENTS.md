# Requirements: BinderOS

**Defined:** 2026-03-05
**Core Value:** Every piece of stored information must encode predictive value about future actions, decisions, or understanding — if it doesn't change behavior, it's noise, and the system actively manages this boundary.

## v4.0 Requirements

Requirements for v4.0 Device-Adaptive AI. Each maps to roadmap phases.

### Device-Adaptive Local LLM

- [ ] **DLLM-01**: App detects device capabilities (WebGPU, device memory, mobile/desktop) and selects optimal AI model automatically
- [ ] **DLLM-02**: User can run local LLM inference on mobile via WASM (wllama + SmolLM2-360M) without WebGPU
- [ ] **DLLM-03**: BrowserAdapter automatically initializes WebLLM (desktop) or WASM LLM (mobile) based on capability probe
- [ ] **DLLM-04**: WASM LLM model downloads with progress indicator and persists via Cache API
- [ ] **DLLM-05**: User sees their device's AI capability level on first AI enable (e.g., "GPU mode ~2.2GB" or "Lightweight mode ~200MB")

### Template Engine

- [x] **TMPL-01**: User receives weekly review briefings generated from entropy signals without any LLM call
- [x] **TMPL-02**: User receives compression explanations generated from staleness signals without any LLM call
- [x] **TMPL-03**: GTD flow prompts (Get Clear/Current/Creative) render from computed data without any LLM call

### Sanitization

- [x] **SNTZ-01**: ONNX NER classifier detects sensitive entities (names, locations, financial, health, credentials) in atom content before cloud dispatch
- [x] **SNTZ-02**: Python training pipeline produces sanitization ONNX model via scripts/train/
- [ ] **SNTZ-03**: Pre-send approval modal shows sanitized diff so user sees what was redacted before approving

### Multi-Provider Cloud

- [x] **CLOUD-01**: User can send AI requests to OpenAI (gpt-4o-mini) via user-provided API key
- [x] **CLOUD-02**: User can send AI requests to xAI Grok via user-provided API key
- [x] **CLOUD-03**: User can configure a custom OpenAI-compatible endpoint (Ollama, LM Studio, Azure)
- [x] **CLOUD-04**: Communication log displays which provider handled each cloud request

### ONNX Expansion

- [ ] **ONNX-01**: Section routing uses trained ONNX classifier instead of centroid fallback
- [ ] **ONNX-02**: Python training pipeline produces section routing ONNX model
- [ ] **ONNX-03**: Tier 2->3 confidence thresholds adapt to device class (mobile: less escalation, desktop: current thresholds)

### Next Action Decomposition

- [x] **DECOMP-01**: Python training pipeline generates synthetic data and trains ONNX decomposition classifier with >95% accuracy
- [x] **DECOMP-02**: Node.js validation confirms >95% Python/Node prediction parity for the decomposition model
- [x] **DECOMP-03**: Embedding worker loads decomposition ONNX model lazily and classifies text into pattern categories
- [x] **DECOMP-04**: Decomposition runtime produces personalized GTD next-action steps from pattern templates with slot-filling
- [x] **DECOMP-05**: User sees "Break this down" button on task and decision triage cards; tapping triggers decomposition flow
- [x] **DECOMP-06**: DecompositionFlow presents steps one at a time with accept/edit/skip and offers to mark parent as project

### Clarification Wizard

- [x] **CLAR-01**: Python training pipeline generates synthetic data for 6 clarification classifiers (1 completeness gate + 5 missing-info) with balanced examples and ambiguous borderlines
- [x] **CLAR-02**: All 6 ONNX classifiers achieve >95% test accuracy and >95% Python/Node prediction parity
- [x] **CLAR-03**: Completeness gate runs in triage cascade after type classification, flagging vague atoms with needsClarification flag (advisory, non-blocking)
- [x] **CLAR-04**: User taps "Clarify this" on triage cards and sees one question at a time with 3-4 options + freeform, following GTD importance ordering
- [x] **CLAR-05**: Tier-adaptive option generation: template options offline, cloud-enhanced options with 2s timeout when available
- [x] **CLAR-06**: Self-learning from corrections: frequency-based option ranking, category skip pattern tracking, classification log extension
- [x] **CLAR-07**: After clarification, atom content enriched with structured key:value lines, entity graph seeded, and auto re-triage triggered
- [x] **CLAR-08**: Binder type config architecture (JSON at src/config/binder-types/) enables future non-GTD binder types; ships with GTD Personal default
- [x] **CLAR-09**: Entity graph Dexie table with compound index supports seeding from clarification (Phase 19), with schema broad enough for decomposition, similarity, and GTD context sources (future phases)

### Cloud-Tutored Model Reinforcement

- [x] **TUTOR-01**: Benchmark pipeline measures baseline accuracy for all 12 ONNX classifiers with per-class precision/recall/F1 and generates cloud "expert exam" test set via Anthropic API
- [x] **TUTOR-02**: Adversarial data generator produces GTD boundary-testing examples per classifier via Anthropic API with configurable model (Haiku/Sonnet)
- [x] **TUTOR-03**: Gap analysis identifies systematic GTD methodology blind spots per classifier and produces actionable Markdown report
- [x] **TUTOR-04**: Teacher-student distillation relabels low-confidence predictions with expert reasoning via Sonnet
- [x] **TUTOR-05**: Retrained classifiers show no accuracy regression on original test sets and improvement on cloud expert exam, with before/after Markdown report

### Unified Enrichment Wizard

- [ ] **ENRICH-01**: Single "Enrich" button on all inbox cards replaces "Break this down" and "Clarify this" with unified entry point
- [ ] **ENRICH-02**: Enrichment wizard renders inline on triage card (not modal), questions-first flow with 4-option menus and category chips for non-linear navigation
- [x] **ENRICH-03**: Each enrichment answer persisted immediately to Dexie — partial enrichment survives navigation and page refresh
- [x] **ENRICH-04**: Inbox maturity model: items track enrichment completeness (0-1 score) with visual maturity indicator on every card
- [ ] **ENRICH-05**: Graduation flow converts enriched inbox item into parent atom + child atoms; graduation preview with quality spectrum and remove capability; children skip re-triage
- [x] **ENRICH-06**: Quality gate for atom creation: composite score from tier source + completeness + user content; soft gate with warning below minimum
- [x] **ENRICH-07**: Model provenance bitmask (32-bit) stored per atom/inbox item tracking which AI models contributed
- [x] **ENRICH-08**: 3-Ring stacked ring SVG indicator on every item: inner=T1, middle=T2 (ONNX+WASM segments), outer=T3; tap reveals model names
- [ ] **ENRICH-09**: Tier 2B handler stub registered in pipeline for WASM LLM tasks (enrich-questions, enrich-options, decompose-contextual, synthesize-enrichment); falls back to T2A on unsupported devices
- [x] **ENRICH-10**: Dexie v7 migration adds provenance and maturity fields; enrichment state machine orchestrates unified clarification+decomposition flow

## Future Requirements

Deferred to future release. Tracked but not in current roadmap.

### ONNX Expansion (v4.x)

- **ONNX-04**: Compression candidate ONNX detector replaces heuristic selection (requires v3.0 correction data accumulation)
- **ONNX-05**: Priority prediction signal from behavioral data (research spike, explicit opt-in)

### Cloud Polish (v4.x)

- **CLOUD-05**: Streaming token display for OpenAI/Grok responses
- **CLOUD-06**: WebGPU LLM opt-in for capable Android devices

### Sync (v5.0)

- **SYNC-01**: CRDT-based multi-device sync
- **SYNC-02**: Correction log federation across user's own devices

## Out of Scope

| Feature | Reason |
|---------|--------|
| Auto-send to cloud without approval | Violates privacy-first architecture; pre-send gate is locked decision |
| Store API keys in IndexedDB | Readable by any script on origin; memory-only is correct tradeoff |
| WebGPU LLM as default on mobile | OOMs on mid-range Android; WASM is the safe default |
| LLM-based sanitization | 500ms-2000ms latency per cloud request; ONNX NER is <50ms |
| Separate workers per cloud provider | Memory pressure from multiple AI workers would OOM browser tabs |
| Real-time sanitization overlay | O(n) ONNX inference on every keystroke causes typing lag |
| Corporate OAuth/SAML auth | Requires backend infrastructure; support Bearer token API keys only |
| In-browser model retraining | ONNX Runtime Web is inference-only; use Python offline pipeline |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DLLM-01 | Phase 15 | Pending |
| DLLM-02 | Phase 15 | Pending |
| DLLM-03 | Phase 15 | Pending |
| DLLM-04 | Phase 15 | Pending |
| DLLM-05 | Phase 15 | Pending |
| TMPL-01 | Phase 12 | Complete |
| TMPL-02 | Phase 12 | Complete |
| TMPL-03 | Phase 12 | Complete |
| SNTZ-01 | Phase 14 | Complete |
| SNTZ-02 | Phase 14 | Complete |
| SNTZ-03 | Phase 14 | Pending |
| CLOUD-01 | Phase 13 | Complete |
| CLOUD-02 | Phase 13 | Complete |
| CLOUD-03 | Phase 13 | Complete |
| CLOUD-04 | Phase 13 | Complete |
| ONNX-01 | Phase 16 | Pending |
| ONNX-02 | Phase 16 | Pending |
| ONNX-03 | Phase 15 | Pending |
| DECOMP-01 | Phase 18 | Complete |
| DECOMP-02 | Phase 18 | Complete |
| DECOMP-03 | Phase 18 | Complete |
| DECOMP-04 | Phase 18 | Complete |
| DECOMP-05 | Phase 18 | Complete |
| DECOMP-06 | Phase 18 | Complete |
| CLAR-01 | Phase 19 | Complete |
| CLAR-02 | Phase 19 | Complete |
| CLAR-03 | Phase 19 | Complete |
| CLAR-04 | Phase 19 | Complete |
| CLAR-05 | Phase 19 | Complete |
| CLAR-06 | Phase 19 | Complete |
| CLAR-07 | Phase 19 | Complete |
| CLAR-08 | Phase 19 | Complete |
| CLAR-09 | Phase 19 | Complete |
| TUTOR-01 | Phase 23 | Complete |
| TUTOR-02 | Phase 23 | Complete |
| TUTOR-03 | Phase 23 | Complete |
| TUTOR-04 | Phase 23 | Complete |
| TUTOR-05 | Phase 23 | Complete |
| ENRICH-01 | Phase 24 | Pending |
| ENRICH-02 | Phase 24 | Pending |
| ENRICH-03 | Phase 24 | Complete |
| ENRICH-04 | Phase 24 | Complete |
| ENRICH-05 | Phase 24 | Pending |
| ENRICH-06 | Phase 24 | Complete |
| ENRICH-07 | Phase 24 | Complete |
| ENRICH-08 | Phase 24 | Complete |
| ENRICH-09 | Phase 24 | Pending |
| ENRICH-10 | Phase 24 | Complete |

**Coverage:**
- v4.0 requirements: 48 total
- Mapped to phases: 48
- Unmapped: 0

---
*Requirements defined: 2026-03-05*
*Last updated: 2026-03-09 after Phase 24 planning — 48/48 requirements mapped*
