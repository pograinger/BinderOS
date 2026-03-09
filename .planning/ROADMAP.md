# Roadmap: BinderOS

## Milestones

- [x] **v1.0** — Foundation + Compute Engine + Pages/Navigation/Search (45/45 requirements, 11 plans, shipped 2026-02-22) → [Archive](.planning/milestones/v1.0-ROADMAP.md)
- [x] **v2.0 AI Orchestration** — Phases 4-7 (30/30 requirements, 14 plans, shipped 2026-03-03) → [Archive](.planning/milestones/v2.0-ROADMAP.md)
- [x] **v3.0 Local AI + Polish** — Phases 9-11 (18/18 requirements, 8 plans, shipped 2026-03-05) → [Archive](.planning/milestones/v3.0-ROADMAP.md)
- 🚧 **v4.0 Device-Adaptive AI** — Phases 12-16 (18 requirements, in progress)

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

<details>
<summary>v3.0 Local AI + Polish (Phases 9-11) — SHIPPED 2026-03-05</summary>

See [Archive](.planning/milestones/v3.0-ROADMAP.md) for full detail.

- [x] **Phase 9: Python Training Infrastructure** - Synthetic data corpus, classifier training, ONNX export, browser-runtime validation (2/2 plans, 2026-03-04)
- [x] **Phase 10: Browser Inference Integration** - ONNX inference in embedding worker, confidence calibration UX, graceful fallback, model caching (3/3 plans, 2026-03-04)
- [x] **Phase 11: Tech Debt, Settings + Correction Utility** - Settings panel cleanup, v2.0 tech debt, model status display, correction export script (3/3 plans, 2026-03-05)

</details>

### v4.0 Device-Adaptive AI (In Progress)

**Milestone Goal:** Restructure AI tiers for device-adaptive inference — local LLMs on every device, expanded ONNX classifiers, multi-provider cloud, and a privacy gate — so the app is fully functional offline on any device.

- [x] **Phase 12: Template Engine** - Offline structured text generation for reviews, compression explanations, and GTD flow prompts without any LLM call (completed 2026-03-06)
- [x] **Phase 13: Multi-Provider Cloud** - Refactor CloudAdapter to provider-agnostic shell; add OpenAI, Grok, and corporate endpoints via openai SDK (completed 2026-03-06)
- [ ] **Phase 14: Sanitization Classifier** - ONNX NER privacy gate in dedicated sanitization worker; Python training pipeline; branded SanitizedPrompt type enforcing execution order
- [ ] **Phase 15: Device-Adaptive Local LLM** - DeviceAdapter selects WebLLM (desktop) or WASM LLM (mobile); wllama integration; iOS explicitly excluded; adaptive confidence thresholds
- [ ] **Phase 16: ONNX Section Routing** - ONNX classifier replaces centroid fallback for section routing; Python training pipeline; classifier-worker.ts for memory isolation

## Phase Details

### Phase 12: Template Engine
**Goal**: Users receive review briefings, compression explanations, and GTD flow prompts generated from entropy signals without triggering any LLM call
**Depends on**: Nothing (first v4.0 phase)
**Requirements**: TMPL-01, TMPL-02, TMPL-03
**Success Criteria** (what must be TRUE):
  1. User opens weekly review on a device with no AI enabled and receives a structured briefing populated with real stale task counts, section names, and entropy scores — not a blank state
  2. User views a compression candidate and sees an explanation citing the atom's staleness age and last-accessed date, generated with zero network requests
  3. User enters GTD Get Clear flow and all prompt cards render with context-aware questions derived from their inbox count and section load — without an LLM call
  4. App running fully offline on mobile produces identical review briefing output to online mode (no degraded fallback message for structural content)
**Plans**: 3 plans
Plans:
- [x] 12-01-PLAN.md — Template engine module + briefing integration (TMPL-01)
- [x] 12-02-PLAN.md — Compression + GTD flow template wiring (TMPL-02, TMPL-03)
- [ ] 12-03-PLAN.md — Gap closure: fix derivePatternSteps per-section empty detection (TMPL-03)

### Phase 13: Multi-Provider Cloud
**Goal**: Users can send AI requests to OpenAI, Grok, or a custom corporate endpoint using their own API keys, with all safety gates preserved in one place and provider identity shown in the communication log
**Depends on**: Phase 12
**Requirements**: CLOUD-01, CLOUD-02, CLOUD-03, CLOUD-04
**Success Criteria** (what must be TRUE):
  1. User enters an OpenAI API key in settings and AI requests route to gpt-4o-mini; pre-send approval modal displays "OpenAI" as the provider before dispatch
  2. User configures Grok via xAI API key and receives responses from Grok; communication log entry shows "Grok" as the provider
  3. User enters a custom base URL (Ollama, LM Studio, Azure) with a Bearer token and AI requests route to that endpoint without code changes
  4. Communication log shows which provider handled each request; switching providers does not require app restart
  5. Anthropic adapter continues working identically — refactor is non-breaking for existing users
**Plans**: 2 plans
Plans:
- [ ] 13-01-PLAN.md — Provider registry, adapters, key vault, and store factory (CLOUD-01, CLOUD-02, CLOUD-03)
- [ ] 13-02-PLAN.md — Multi-provider UI, settings panel, status bar, and communication log (CLOUD-01, CLOUD-02, CLOUD-03, CLOUD-04)

### Phase 14: Sanitization Classifier
**Goal**: All atom content is checked for sensitive entities by an ONNX NER classifier before the pre-send approval modal appears, and users can see exactly what was redacted before approving cloud dispatch
**Depends on**: Phase 13 (refactored CloudAdapter safety shell)
**Requirements**: SNTZ-01, SNTZ-02, SNTZ-03
**Success Criteria** (what must be TRUE):
  1. User initiates a cloud AI request containing a name and a financial reference; the pre-send modal shows a diff with those entities redacted before the user can approve
  2. Python training pipeline at scripts/train/train-sanitizer.py runs end-to-end and produces a sanitize-check.onnx model that passes the recall >= 0.85 gate on the soft-PII test set
  3. Sanitization runs in under 50ms for a typical atom (no perceptible delay between tapping the AI action and the pre-send modal appearing)
  4. Cloud API never receives unsanitized content — the TypeScript compiler rejects any code path that constructs a log entry before SanitizedPrompt is produced
**Plans**: 3 plans
Plans:
- [ ] 14-01-PLAN.md — Python NER training pipeline: synthetic data, DistilBERT fine-tuning, ONNX export (SNTZ-02)
- [ ] 14-02-PLAN.md — TypeScript sanitization core: branded types, NER worker, regex, entity registry, cloud adapter wiring (SNTZ-01)
- [ ] 14-03-PLAN.md — Pre-send modal entity map UI, restore toggles, and end-to-end verification (SNTZ-03)

### Phase 15: Device-Adaptive Local LLM
**Goal**: Users on any device (desktop with WebGPU, mobile without WebGPU, iOS) get the appropriate local AI mode selected automatically, with a visible indication of which mode is active and a download-with-progress flow for the mobile WASM model
**Depends on**: Phase 12 (independent of 13-14; can run in parallel with Phase 14 on separate branch)
**Requirements**: DLLM-01, DLLM-02, DLLM-03, DLLM-04, DLLM-05
**Success Criteria** (what must be TRUE):
  1. User on a desktop with WebGPU enables local AI and the app loads WebLLM (GPU mode) automatically; the settings panel displays "Local AI: GPU mode (~2.2GB)"
  2. User on an Android device without WebGPU enables local AI and the app loads the WASM LLM (wllama + SmolLM2-360M-Q4) with a download progress indicator; model persists via Cache API and does not re-download on next launch
  3. User on iOS enables local AI and the app displays "Lightweight mode — using offline classifiers + cloud" with no WASM LLM download attempted
  4. On a mobile device, Tier 2->3 confidence thresholds are raised so that fewer requests escalate to LLM inference, reducing latency on slower WASM execution
  5. Integrated GPU machine that fails the VRAM sentinel check falls back to WASM mode within 30 seconds rather than hanging in "loading" state indefinitely
**Plans**: TBD

### Phase 16: ONNX Section Routing
**Goal**: Section routing uses a trained ONNX classifier instead of the centroid fallback, working reliably for new users who have no atom history, with the new model loaded in a dedicated classifier worker to preserve memory budget on mobile
**Depends on**: Phase 14 (worker architecture from sanitization phase establishes classifier-worker.ts pattern)
**Requirements**: ONNX-01, ONNX-02, ONNX-03
**Success Criteria** (what must be TRUE):
  1. New user with zero atoms triages their first inbox item and receives a section suggestion from the ONNX classifier (not a centroid fallback or blank); section suggestions match PARA semantics with accuracy comparable to the v3.0 type classifier
  2. Python training pipeline at scripts/train/train-section-router.py runs end-to-end and produces a section-router.onnx model following the same pattern as the v3.0 type classifier pipeline
  3. On a mobile device, the section routing ONNX model loads in classifier-worker.ts (not embedding-worker.ts); embedding worker heap stays under its v3.0 baseline
**Plans**: TBD

## Progress

**Execution Order:** 12 → 13 → 14 → 15 → 16
Note: Phase 15 is independent of 13-14 and may execute in parallel with Phase 14 on a separate branch.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 4/4 | Complete | 2026-02-22 |
| 2. Compute Engine | v1.0 | 3/3 | Complete | 2026-02-22 |
| 3. Pages, Navigation, Search | v1.0 | 4/4 | Complete | 2026-02-22 |
| 4. AI Infrastructure | v2.0 | 4/4 | Complete | 2026-02-23 |
| 5. Triage AI | v2.0 | 4/4 | Complete | 2026-02-24 |
| 6. Review Pre-Analysis | v2.0 | 3/3 | Complete | 2026-02-26 |
| 7. Guided Review + Compression Coach | v2.0 | 3/3 | Complete | 2026-03-02 |
| 9. Python Training Infrastructure | v3.0 | 2/2 | Complete | 2026-03-04 |
| 10. Browser Inference Integration | v3.0 | 3/3 | Complete | 2026-03-04 |
| 11. Tech Debt, Settings + Correction Utility | v3.0 | 3/3 | Complete | 2026-03-05 |
| 12. Template Engine | 3/3 | Complete    | 2026-03-06 | 2026-03-06 |
| 13. Multi-Provider Cloud | 2/2 | Complete    | 2026-03-06 | - |
| 14. Sanitization Classifier | 2/3 | In Progress|  | - |
| 15. Device-Adaptive Local LLM | v4.0 | 0/TBD | Not started | - |
| 16. ONNX Section Routing | v4.0 | 0/TBD | Not started | - |

### Phase 17: Tier 2 GTD classification models

**Goal:** Four ONNX classifiers (GTD list routing, actionability, project detection, context tagging) trained and deployed in the embedding worker, enabling offline sub-second GTD intelligence on triage cards with confidence indicators and correction logging
**Requirements**: GTD-01, GTD-02, GTD-03, GTD-04, GTD-05, GTD-06, GTD-07, GTD-08
**Depends on:** Phase 16
**Plans:** 3/3 plans complete

Plans:
- [x] 17-01-PLAN.md — Python training pipeline: Faker data generation, MLP+ONNX training, Node.js validation (GTD-01, GTD-02, GTD-03, GTD-04, GTD-05)
- [x] 17-02-PLAN.md — Browser integration: embedding worker multi-classifier, tier2 handler, triage cascade (GTD-05, GTD-06)
- [x] 17-03-PLAN.md — Triage card GTD display, classification-log extension, visual verification (GTD-07, GTD-08)

### Phase 18: Tier 2 next action decomposition model

**Goal:** User can decompose multi-step tasks and decisions into GTD next-action steps via an ONNX pattern classifier and slot-filled templates -- offline, sub-second, user-triggered via "Break this down" button on triage cards
**Requirements**: DECOMP-01, DECOMP-02, DECOMP-03, DECOMP-04, DECOMP-05, DECOMP-06
**Depends on:** Phase 17
**Success Criteria** (what must be TRUE):
  1. Python training pipeline generates ~35 decomposition pattern categories and trains an ONNX MLP with >95% accuracy and >95% Python/Node parity
  2. User taps "Break this down" on a task or decision triage card and sees personalized GTD next-action steps derived from ONNX classification + template slot-filling
  3. User reviews steps one at a time with accept/edit/skip controls; accepted steps are created as new inbox items for triage
  4. After decomposition, user is asked whether to mark the parent atom as a project
  5. Decomposition works fully offline with sub-second latency (no LLM call required)
**Plans:** 3/3 plans complete

Plans:
- [ ] 18-01-PLAN.md — Python training pipeline: Faker data generation, MLP+ONNX training, Node.js validation (DECOMP-01, DECOMP-02)
- [ ] 18-02-PLAN.md — TypeScript runtime: categories, slot extractor, decomposer, worker + tier2 wiring (DECOMP-03, DECOMP-04)
- [ ] 18-03-PLAN.md — DecompositionFlow UI: "Break this down" button, step presentation, atom creation (DECOMP-05, DECOMP-06)

### Phase 19: Tier 2 clarification wizard model

**Goal:** User taps "Clarify this" on vague triage cards to walk through targeted GTD questions (outcome, next-action, timeframe, context, reference) with pre-built options, enriching atom content and triggering re-triage — powered by 6 ONNX binary classifiers (completeness gate + 5 missing-info detectors), tier-adaptive option generation, self-learning from corrections, entity graph seeding, and extensible binder type config
**Requirements**: CLAR-01, CLAR-02, CLAR-03, CLAR-04, CLAR-05, CLAR-06, CLAR-07, CLAR-08, CLAR-09
**Depends on:** Phase 18
**Success Criteria** (what must be TRUE):
  1. Python training pipeline trains 6 ONNX binary classifiers (1 completeness gate + 5 missing-info) each with >95% accuracy and >95% Python/Node parity
  2. Completeness gate runs in triage cascade after type classification, flagging vague atoms with "Clarify this" button
  3. User taps "Clarify this" and sees one question at a time with 3-4 options + freeform, following GTD importance ordering
  4. After clarification, atom content is enriched with structured key:value lines and auto re-triaged
  5. Entity graph table seeded with clarification answers for future knowledge graph
  6. Self-learning: frequently selected options float to top, frequently skipped categories get deprioritized
  7. Binder type config architecture enables future non-GTD binder types via JSON config files
**Plans:** 5/5 plans complete

Plans:
- [x] 19-01-PLAN.md — Python training pipeline: Faker data generation, 6 classifiers, Node.js validation (CLAR-01, CLAR-02)
- [x] 19-02-PLAN.md — Foundation: clarification types, binder config, entity graph table, enrichment (CLAR-08, CLAR-09)
- [x] 19-03-PLAN.md — Worker + tier2 integration: ONNX classifiers, triage cascade, cloud options, log extension (CLAR-03, CLAR-05, CLAR-06)
- [x] 19-04-PLAN.md — ClarificationFlow UX: modal, questions, enrichment wiring, re-triage (CLAR-04, CLAR-07)
- [x] 19-05-PLAN.md — Self-learning option ranking, skip patterns, end-to-end verification (CLAR-06)

### Phase 20: Multi-atom context engine

**Goal:** ONNX models can gather multi-atom context (parent project, sibling tasks, linked entities, related atoms, metadata) to reconstruct meaningful intent before any cloud interaction — enabling context-aware sanitization and structured prompt assembly
**Requirements**: TBD
**Depends on:** Phase 19
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 20 to break down)

### Phase 21: Cloud packet sanitization pipeline

**Goal:** Local ONNX models produce structured, sanitized "cloud packets" — entity-masked text with stable IDs, context bundles (summaries not raw text), graph structure, and intent classification — ensuring the cloud never sees raw personal data while preserving reasoning ability
**Requirements**: TBD
**Depends on:** Phase 20
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 21 to break down)

### Phase 22: Cloud reasoning integration and response re-merge

**Goal:** Cloud model receives only sanitized structured packets and returns structured reasoning; local ONNX models validate cloud output, re-inject masked entities, enforce GTD rules, and update the atom graph — keeping the cloud stateless and blind to personal data
**Requirements**: TBD
**Depends on:** Phase 21
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 22 to break down)

### Phase 23: Cloud-tutored local model reinforcement

**Goal:** Use Anthropic API as a GTD guru training oracle to maximize local ONNX classifier intelligence out of the box. The cloud brings deep GTD methodology expertise — contexts, next actions, someday/maybe boundaries, 2-minute rule, horizons of focus, natural planning model — to generate adversarial edge cases, identify model blind spots, and distill Tier 3 knowledge into Tier 2. All training data is synthetic (zero privacy concern). Covers: adversarial data generation, systematic gap analysis, knowledge distillation (Tier 3 → Tier 2), active learning loop for low-confidence predictions. Leverages phase 19 training infrastructure.
**Requirements**: TUTOR-01, TUTOR-02, TUTOR-03, TUTOR-04, TUTOR-05
**Depends on:** Phase 19
**Success Criteria** (what must be TRUE):
  1. Benchmark pipeline measures baseline accuracy for all 12 ONNX classifiers with per-class precision/recall/F1 and generates a cloud "expert exam" test set that stress-tests GTD boundaries
  2. Adversarial data generator produces deliberately hard examples near decision boundaries per classifier, targeting weakest classes
  3. Gap analysis identifies systematic GTD methodology blind spots (not individual misclassifications) with actionable Markdown reports
  4. Teacher-student distillation feeds low-confidence predictions to Claude Sonnet and gets expert labels with GTD reasoning
  5. Retrained classifiers show no accuracy regression on original test sets, with before/after Markdown report showing per-classifier deltas
**Plans:** 3/3 plans complete

Plans:
- [ ] 23-01-PLAN.md — Classifier registry + benchmark pipeline: baseline accuracy, cloud expert exam generation and scoring (TUTOR-01)
- [ ] 23-02-PLAN.md — Adversarial generation + gap analysis: boundary-testing data, systematic GTD blind spot identification (TUTOR-02, TUTOR-03)
- [ ] 23-03-PLAN.md — Teacher-student distillation + retrain orchestrator: expert relabeling, automated retrain cycle, before/after report (TUTOR-04, TUTOR-05)

### Phase 24: Unified Enrichment Wizard

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 23
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 24 to break down)
