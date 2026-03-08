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

- [ ] **DECOMP-01**: Python training pipeline generates synthetic data and trains ONNX decomposition classifier with >95% accuracy
- [ ] **DECOMP-02**: Node.js validation confirms >95% Python/Node prediction parity for the decomposition model
- [ ] **DECOMP-03**: Embedding worker loads decomposition ONNX model lazily and classifies text into pattern categories
- [ ] **DECOMP-04**: Decomposition runtime produces personalized GTD next-action steps from pattern templates with slot-filling
- [ ] **DECOMP-05**: User sees "Break this down" button on task and decision triage cards; tapping triggers decomposition flow
- [ ] **DECOMP-06**: DecompositionFlow presents steps one at a time with accept/edit/skip and offers to mark parent as project

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
| DECOMP-01 | Phase 18 | Pending |
| DECOMP-02 | Phase 18 | Pending |
| DECOMP-03 | Phase 18 | Pending |
| DECOMP-04 | Phase 18 | Pending |
| DECOMP-05 | Phase 18 | Pending |
| DECOMP-06 | Phase 18 | Pending |

**Coverage:**
- v4.0 requirements: 24 total
- Mapped to phases: 24
- Unmapped: 0

---
*Requirements defined: 2026-03-05*
*Last updated: 2026-03-08 after Phase 18 planning — 24/24 requirements mapped*
