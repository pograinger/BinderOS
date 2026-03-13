# Roadmap: BinderOS

## Milestones

- [x] **v1.0** — Foundation + Compute Engine + Pages/Navigation/Search (45/45 requirements, 11 plans, shipped 2026-02-22) → [Archive](.planning/milestones/v1.0-ROADMAP.md)
- [x] **v2.0 AI Orchestration** — Phases 4-7 (30/30 requirements, 14 plans, shipped 2026-03-03) → [Archive](.planning/milestones/v2.0-ROADMAP.md)
- [x] **v3.0 Local AI + Polish** — Phases 9-11 (18/18 requirements, 8 plans, shipped 2026-03-05) → [Archive](.planning/milestones/v3.0-ROADMAP.md)
- [x] **v4.0 Device-Adaptive AI** — Phases 12-25 (48/48 requirements, 32 plans, shipped 2026-03-10) → [Archive](.planning/milestones/v4.0-ROADMAP.md)
- [x] **v5.0 Entity Intelligence & Knowledge Graph** — Phases 26-29 (22 requirements, shipped 2026-03-12)
- 🚧 **v5.5 Cortical Intelligence** — Phases 30-38 (16+ requirements, in progress)

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

<details>
<summary>v4.0 Device-Adaptive AI (Phases 12-25) — SHIPPED 2026-03-10</summary>

See [Archive](.planning/milestones/v4.0-ROADMAP.md) for full detail.

- [x] **Phase 12: Template Engine** - Offline structured text generation for reviews, compression, GTD prompts (3/3 plans, 2026-03-06)
- [x] **Phase 13: Multi-Provider Cloud** - OpenAI, Grok, custom endpoints via provider registry (2/2 plans, 2026-03-06)
- [x] **Phase 14: Sanitization Classifier** - ONNX NER privacy gate, Python training pipeline, pre-send approval (3/3 plans)
- [x] **Phase 15: Device-Adaptive Local LLM** - WebLLM/WASM auto-selection, download progress, adaptive thresholds
- [x] **Phase 16: ONNX Section Routing** - ONNX classifier replaces centroid fallback for section routing
- [x] **Phase 17: Tier 2 GTD classification models** - 4 GTD ONNX classifiers (3/3 plans)
- [x] **Phase 18: Tier 2 next action decomposition** - ONNX pattern classifier + slot-filled templates (3/3 plans)
- [x] **Phase 19: Tier 2 clarification wizard** - 6 ONNX binary classifiers, completeness gate, entity graph seeding (5/5 plans)
- [x] **Phase 20: Multi-atom context engine** - Context gathering for sanitization and prompt assembly
- [x] **Phase 21: Cloud packet sanitization pipeline** - Structured sanitized cloud packets
- [x] **Phase 22: Cloud reasoning integration** - Cloud response validation, entity re-injection, GTD rules
- [x] **Phase 23: Cloud-tutored model reinforcement** - Adversarial training, gap analysis, distillation (3/3 plans)
- [x] **Phase 24: Unified Enrichment Wizard** - Question-first flow, maturity model, graduation, provenance (7 plans)
- [x] **Phase 25: Iterative Enrichment Deepening** - Follow-up questions, cognitive signal priority, depth tracking (3/3 plans)

</details>

<details>
<summary>v5.0 Entity Intelligence & Knowledge Graph (Phases 26-29) — SHIPPED 2026-03-12</summary>

- [x] **Phase 26: Intelligence Sidecar + Schema** - Dexie migration with atomIntelligence sidecar, entity/relation tables, enrichment refactor to structured records, smart links field (completed 2026-03-11)
- [x] **Phase 27: Entity Detection + Registry** - Sanitization worker extended for entity detection, detection lifecycle, entity-atom linking, dedup/normalization, entity badges (completed 2026-03-11)
- [x] **Phase 28: Relationship Inference + Cognitive Harness** - T1 keyword pattern engine, co-occurrence accumulation, evidence scoring, headless testing harness, synthetic user profile, cloud adversarial scoring (completed 2026-03-11)
- [x] **Phase 29: Entity Consumers + Trained Agent Validation** - Entity-aware enrichment, user correction UX, GTD context suggestions, cloud-as-user training loop, local stack benchmark proving emergent user learning (completed 2026-03-12)

</details>

### v5.5 Cortical Intelligence (In Progress)

**Milestone Goal:** Apply HTM cortical organizing principles to the local ONNX agent stack — context gating for efficient activation, predictive enrichment that anticipates user needs, sequence learning across atom history, a formalized binder-type specialization protocol that turns GTD into the first pluggable column set, canonical feature vectors as the structured representation layer, specialist consensus voting that yields emergent intelligence, and risk surfacing as the first user-visible payoff of the cognitive stack.

- [x] **Phase 30: Schema + BinderTypeConfig Protocol** - Dexie v10 migration, BinderTypeConfig interface with GTD as first implementation, predicate registry scaffold (completed 2026-03-13)
- [x] **Phase 31: Context Gate Evaluator** - ActivationGate pre-dispatch filter, four predicate dimensions (route, time-of-day, binder type, atom history), gate audit logging (completed 2026-03-13)
- [x] **Phase 32: Predictive Enrichment Scorer** - Entity trajectory + cognitive signal delta scoring, predictionCache with TTL, cold-start guard, enrichment question reordering (completed 2026-03-13)
- [x] **Phase 33: Sequence Context ONNX Model** - Embedding ring buffer, LSTM training pipeline, sequence context signal wired to T2 classifiers, harness ablation validation (completed 2026-03-13)
- [ ] **Phase 34: Harness SDK + Second Binder Type Validation** - Harness parameterized on BinderTypeConfig, non-GTD stub binder type exercised through full adversarial cycle
- [x] **Phase 35: Canonical Feature Vectors** - Structured per-atom-type vectors from metadata + sidecar + entities, cached in atomIntelligence, BinderTypeConfig-driven dimensions (completed 2026-03-13)
- [ ] **Phase 36: Specialist Consensus Layer** - Train specialist risk models on non-overlapping vector slices, ONNX export, consensus voter, dispatchTiered wiring
- [ ] **Phase 37: EII Diagnostic + Consensus Ablation** - Emergent Intelligence Index per binder, consensus vs specialist ablation proof, harness integration
- [ ] **Phase 38: Risk Surface + Proactive Alerts** - Consensus risk scores surface high-risk atoms, risk badges with explanations, staleness prediction model

## Phase Details

### Phase 26: Intelligence Sidecar + Schema
**Goal**: All AI-generated knowledge lives in a structured sidecar table separate from atom content, with entity and relationship tables ready for the knowledge graph, and enrichment answers rendered from structured records instead of parsed content text
**Depends on**: Phase 25 (v4.0 enrichment architecture)
**Requirements**: SIDE-01, SIDE-02, SIDE-03, SIDE-04, ENTR-01, ENTR-02
**Success Criteria** (what must be TRUE):
  1. Enrichment Q&A pairs for an atom are stored in `atomIntelligence.enrichment[]` as structured records, not appended to atom.content as text lines
  2. User opens an atom that was enriched before v5.0 and sees their prior enrichment answers rendered correctly from the migrated sidecar data
  3. User pastes a URL into an atom and sees it stored as a structured smart link with title, summary, and resolution metadata in `atom.links[]`
  4. Dexie schema includes `entities` table with normalization, alias tracking, mention counts, and CRDT-ready version fields
  5. Dexie schema includes `entityRelations` table with typed edges, source attribution, and confidence scores
**Plans**: 2 plans
Plans:
- [x] 26-01-PLAN.md — Intelligence type system, v9 migration, sidecar helpers, entity stubs
- [x] 26-02-PLAN.md — Enrichment pipeline refactor from content-appending to sidecar writes

### Phase 27: Entity Detection + Registry
**Goal**: The system detects people, places, and organizations in atom content using the existing NER model, accumulates them into a deduplicated entity registry, and shows entity badges on atom detail views
**Depends on**: Phase 26 (sidecar and entity tables must exist)
**Requirements**: ENTD-01, ENTD-02, ENTD-03, ENTR-03, ENTR-04, ENTR-05
**Success Criteria** (what must be TRUE):
  1. User creates or updates an atom mentioning "Sarah Chen" and the system detects it as a PER entity within the existing triage lifecycle — no new worker, no perceptible delay
  2. NER results are stored in `atomIntelligence.entityMentions` as structured records with entity text, type, span positions, and confidence
  3. "Sarah Chen" and "Dr. Chen" appearing in different atoms resolve to the same entity in the registry via normalized text matching and alias resolution
  4. User opens atom detail view and sees entity badges/chips for detected people, places, and organizations
  5. Entity-atom links exist in the entity graph so that looking up an entity returns all atoms that mention it
**Plans**: 2 plans
Plans:
- [ ] 27-01-PLAN.md — NER model swap, detection pipeline, entity matcher, registry dedup, lifecycle hooks
- [ ] 27-02-PLAN.md — Entity badge UI on atom detail views

### Phase 28: Relationship Inference + Cognitive Harness
**Goal**: The system infers relationships between entities using keyword patterns and co-occurrence evidence, AND a headless testing harness enables cloud-adversarial validation where a sealed synthetic user profile scores how well the local cognitive stack learns the user
**Depends on**: Phase 27 (entities must be accumulated before relationships can be inferred)
**Requirements**: RELI-01, RELI-02, RELI-03, HARN-01, HARN-02, HARN-03
**Success Criteria** (what must be TRUE):
  1. User creates an atom "Pam's anniversary is next month" and the system infers a spouse relationship between "Pam" and the user via the "anniversary" keyword pattern at confidence 0.3
  2. After 3+ atoms mention "Pam" alongside family-related keywords, the spouse relationship confidence increases based on accumulated evidence
  3. Co-occurrence counts for entity pairs are tracked in memory and periodically flushed to Dexie, with sentence-level proximity checks preventing false positives from unrelated entities in the same atom
  4. Headless testing harness exercises the full local pipeline (triage → enrichment → entity detection → relationship inference) without UI, driven by a sealed synthetic user profile
  5. Cloud generates coherent inbox items matching the synthetic user and scores the resulting entity graph against ground truth — reporting precision/recall on entities, relationships, and user facts
  6. The harness simulates user interactions (triage acceptance, enrichment Q&A answers, entity corrections) as the synthetic user would, producing a realistic GTD binder graph
**Plans**: 2 plans
Plans:
- [ ] 28-01-PLAN.md — Keyword pattern engine, co-occurrence tracker, relationship inference orchestrator
- [ ] 28-02-PLAN.md — Headless cognitive harness with synthetic user profile and scoring

### Phase 29: Entity Consumers + Trained Agent Validation
**Goal**: Entity knowledge feeds into enrichment questions, GTD context suggestions, and user correction UX — AND the cloud-adversarial training loop proves the local cognitive stack achieves emergent user learning on a single device, with the local stack's knowledge used to protect the user in cloud interactions
**Depends on**: Phase 28 (relationship inference + harness infrastructure)
**Requirements**: ENTC-01, ENTC-02, ENTC-03, ENTC-04, ENTC-05, TVAL-01, TVAL-02
**Success Criteria** (what must be TRUE):
  1. User enriches an atom mentioning "Sarah" and the enrichment question references her known relationship — "You mentioned Sarah (your wife) — is this related to your anniversary planning?"
  2. User sees an inline entity card for "Dr. Chen" showing the inferred "healthcare-provider" relationship, taps "wrong", selects "dentist", and the correction is stored as ground truth (confidence 1.0) overriding all inference
  3. User triages an atom "Meeting with Dr. Chen" and sees @health suggested as a GTD context tag, derived from the entity's healthcare-provider relationship
  4. Entity relevance scores decay over time with ~30 day half-life — entities not mentioned recently rank lower in context injection
  5. User taps an entity badge and sees a timeline view of all atoms mentioning that entity, ordered chronologically
  6. After processing 30+ synthetic inbox items through the harness training loop, the local stack correctly identifies >80% of the synthetic user's key relationships (family, work colleagues, medical providers) without cloud assistance
  7. T2 sanitization uses entity knowledge to produce semantically-rich cloud packets — "Pam" → "[SPOUSE]", "Dr. Chen" → "[CPA]" — preserving meaning while protecting identity
**Plans**: 5 plans
Plans:
- [ ] 29-01-PLAN.md — Multi-cycle adversarial training loop, 10+ personas, enrichment emulation, correction ripple
- [ ] 29-02-PLAN.md — Production entity consumers: recency decay, semantic sanitization, correction UX, entity timeline
- [ ] 29-03-PLAN.md — Ablation testing, auto-tune patterns, investment report
- [ ] 29-04-PLAN.md — [GAP] Entity context mapping: BinderTypeConfig interface + suggestContextFromEntities() + store wiring
- [ ] 29-05-PLAN.md — [GAP] Execute adversarial training run, verify TVAL-01/TVAL-02 benchmarks

### Phase 30: Schema + BinderTypeConfig Protocol
**Goal**: The v10 Dexie schema is locked with all tables needed by v5.5, and the `BinderTypeConfig` interface is formalized with GTD as its first full implementation — unblocking every subsequent phase that reads binder type, writes gate audit logs, or stores sequence context
**Depends on**: Phase 29 (v5.0 complete)
**Requirements**: SCHM-01, BTYPE-01
**Success Criteria** (what must be TRUE):
  1. Dexie v10 migration runs without errors on a database that has v9 data, adding `gateActivationLog`, `sequenceContext`, and `binderTypeConfig` tables without touching any prior table
  2. `BinderTypeConfig` interface is the authoritative source for GTD's column set, compositor rules, enrichment categories, relationship patterns, entity types, and context gate predicates — no GTD-specific constants remain scattered in other files
  3. A developer can define a new binder type by implementing `BinderTypeConfig` and registering it in the type registry without modifying any GTD-specific code
  4. The predicate registry scaffold in `src/ai/context-gate/predicates/` exists with typed stubs that compile, ready to receive Phase 31 implementations
**Plans**: 3 plans
Plans:
- [x] 30-01-PLAN.md — Types, Zod schema, v10 migration, GTD config split into per-concern JSON files
- [x] 30-02-PLAN.md — Registry API expansion, consumer migration, compositor hydration, old file deletion
- [x] 30-03-PLAN.md — Context gate predicate scaffold with registry and four config-reading stubs

### Phase 31: Context Gate Evaluator
**Goal**: Agents activate only when relevant — a pre-dispatch `ActivationGate` filter in `dispatchTiered()` evaluates route, time-of-day, binder type, and atom history predicates before any handler runs, with all gate decisions logged for harness measurement
**Depends on**: Phase 30 (BinderTypeConfig and gateActivationLog table must exist)
**Requirements**: GATE-01, GATE-02, GATE-03, GATE-04, GATE-05
**Success Criteria** (what must be TRUE):
  1. User navigates to the Insights view and triggers triage — the triage and enrichment agents do not fire (route predicate blocks them), observable via gate audit log entries
  2. A triage request dispatched at 10pm is processed with deep-cognitive agents suppressed — time-of-day predicate correctly identifies the low-energy window
  3. An atom that already has `enrichment.depth >= 2` and was last updated 8 days ago is submitted for re-enrichment — the atom history predicate blocks the redundant enrichment pass
  4. All gate activation decisions are written to `gateActivationLog` with predicate name, outcome, and context snapshot — harness can query the table and compute per-predicate activation rates
  5. The harness test suite passes all existing handler tests unchanged — `dispatchTiered()` without a `context` field behaves identically to pre-Phase 31 behavior (full backwards compatibility)
**Plans**: 2 plans
Plans:
- [x] 31-01-PLAN.md — Types, staleDays completion, pipeline gate pre-filter, fire-and-forget log writer
- [x] 31-02-PLAN.md — Caller updates (triage, decomposition, harness), existing test fixes

### Phase 32: Predictive Enrichment Scorer
**Goal**: Enrichment question ordering shifts from static signal relevance to dynamic prediction — a scoring function over entity graph trajectory and cognitive signal delta trends predicts what the user will need next, with a cold-start guard preventing premature predictions from eroding trust
**Depends on**: Phase 31 (gate infrastructure must exist; prediction scorer integrates as a gate-aware enrichment path)
**Requirements**: PRED-01, PRED-02, PRED-03
**Success Criteria** (what must be TRUE):
  1. User enriches a second atom about "quarterly budget planning" after previously enriching several atoms with rising `urgent-important` composite signals — the enrichment wizard leads with deadline and delegation questions rather than the default outcome question, reflecting the signal trend
  2. User opens the enrichment wizard for an atom mentioning a recently-active entity (high recency + rising mention count delta) — that entity's enrichment category is promoted to the top of the question order
  3. A brand-new binder with 10 atoms (below the 15-atom cold-start threshold) shows default static enrichment question ordering — the predictive scorer does not activate, preventing incorrect early predictions
  4. Prediction results are cached in `predictionCache` with a 5-minute TTL — repeated wizard opens within the window do not re-query Dexie; a new atom triage correctly invalidates the cache
**Plans**: 2 plans
Plans:
- [ ] 32-01-PLAN.md — Types, config extension, predictive scorer pure function, momentum builder with cache
- [ ] 32-02-PLAN.md — Wire predictive scorer into enrichment-engine, sidecar snapshot writes

### Phase 33: Sequence Context ONNX Model
**Goal**: A lightweight LSTM sequence model trained on harness persona atom history provides a 128-dim context embedding that is concatenated with MiniLM embeddings before T2 classifier inference — improving classification quality without adding a new worker or exceeding mobile memory limits
**Depends on**: Phase 32 (harness data quality and gate infrastructure proven; prediction scorer validates entity/signal data is queryable before sequence model relies on it)
**Requirements**: SEQ-01, SEQ-02, SEQ-03, SEQ-04
**Success Criteria** (what must be TRUE):
  1. The embedding worker maintains a per-binder ring buffer of the last 5 MiniLM embeddings (default N), capped in memory, updated only on atom save or triage completion — observable via worker message log
  2. The Python sequence training pipeline (`scripts/train/sequence/`) runs end-to-end producing a `sequence-context.onnx` file that validates successfully against `onnxruntime-node` before any browser deployment
  3. T2 classifiers receive a 512-dim input (384 MiniLM + 128 sequence context) without breaking existing classification for atoms in a binder with fewer than N prior embeddings (cold-start fallback to zero-padded context)
  4. Harness ablation report shows T2 classifier F1 with sequence context vs without across N=3, N=5, N=7 window sizes — production MLP classifiers are only replaced if ablation confirms improvement
**Plans**: 3 plans
Plans:
- [ ] 33-01-PLAN.md — Ring buffer management, LSTM session, TieredFeatures extension, variable-dim classifier input
- [ ] 33-02-PLAN.md — Python training pipeline: LSTM training, ONNX export, 512-dim classifier retraining
- [ ] 33-03-PLAN.md — Ablation comparison across N=3,5,7 window sizes, production recommendation

### Phase 34: Harness SDK + Second Binder Type Validation
**Goal**: The harness is parameterized on `BinderTypeConfig` so any binder type can run a full adversarial training cycle, and a non-GTD stub binder type exercises the complete pipeline end-to-end — proving the protocol is genuinely pluggable, not GTD-shaped
**Depends on**: Phase 33 (all v5.5 core features complete; this phase integrates and validates everything)
**Requirements**: BTYPE-02, BTYPE-03
**Success Criteria** (what must be TRUE):
  1. Running the harness with a non-GTD `BinderTypeConfig` (e.g., ProjectBinder) produces a complete adversarial cycle report with per-binder-type ablation metrics — no GTD-specific constants appear in the output
  2. The harness SDK `scripts/harness/harness-binder-type-sdk.ts` accepts any `BinderTypeConfig` and drives `runAdversarialCycle` + `AblationEngine` without modification — third-party binder type authors can use it as a framework
  3. Gap analysis in the ablation report identifies which model columns are undertrained for the new binder type — the report is actionable, not just confirmatory
**Plans**: TBD

## Progress

**Execution Order:** 30 → 31 → 32 → 33 → 34

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
| 12. Template Engine | v4.0 | 3/3 | Complete | 2026-03-06 |
| 13. Multi-Provider Cloud | v4.0 | 2/2 | Complete | 2026-03-06 |
| 14. Sanitization Classifier | v4.0 | 3/3 | Complete | 2026-03-07 |
| 15. Device-Adaptive Local LLM | v4.0 | - | Complete | 2026-03-07 |
| 16. ONNX Section Routing | v4.0 | - | Complete | 2026-03-07 |
| 17. Tier 2 GTD classification | v4.0 | 3/3 | Complete | 2026-03-08 |
| 18. Next action decomposition | v4.0 | 3/3 | Complete | 2026-03-08 |
| 19. Clarification wizard | v4.0 | 5/5 | Complete | 2026-03-08 |
| 20. Multi-atom context engine | v4.0 | - | Complete | 2026-03-09 |
| 21. Cloud packet sanitization | v4.0 | - | Complete | 2026-03-09 |
| 22. Cloud reasoning integration | v4.0 | - | Complete | 2026-03-09 |
| 23. Cloud-tutored reinforcement | v4.0 | 3/3 | Complete | 2026-03-09 |
| 24. Unified Enrichment Wizard | v4.0 | 7/7 | Complete | 2026-03-10 |
| 25. Iterative Enrichment Deepening | v4.0 | 3/3 | Complete | 2026-03-10 |
| 26. Intelligence Sidecar + Schema | v5.0 | 2/2 | Complete | 2026-03-11 |
| 27. Entity Detection + Registry | v5.0 | 2/2 | Complete | 2026-03-11 |
| 28. Relationship Inference + Cognitive Harness | v5.0 | 2/2 | Complete | 2026-03-11 |
| 29. Entity Consumers + Trained Agent Validation | v5.0 | 4/5 | Complete | 2026-03-12 |
| 30. Schema + BinderTypeConfig Protocol | v5.5 | 3/3 | Complete | 2026-03-13 |
| 31. Context Gate Evaluator | v5.5 | 2/2 | Complete | 2026-03-13 |
| 32. Predictive Enrichment Scorer | v5.5 | 2/2 | Complete | 2026-03-13 |
| 33. Sequence Context ONNX Model | 3/3 | Complete    | 2026-03-13 | - |
| 34. Harness SDK + Second Binder Type Validation | v5.5 | 0/? | Not started | - |
| 35. Canonical Feature Vectors | 2/2 | Complete   | 2026-03-13 | - |
| 36. Specialist Consensus Layer | v5.5 | 0/? | Not started | - |
| 37. EII Diagnostic + Consensus Ablation | v5.5 | 0/? | Not started | - |
| 38. Risk Surface + Proactive Alerts | v5.5 | 0/? | Not started | - |

### Phase 35: Canonical Feature Vectors
**Goal**: Define and compute structured, sparse, typed feature vectors per atom type (task, person, calendar) from sidecar + metadata + entity data — replacing raw embeddings as the primary input for specialist ONNX models. Vectors are cached in atomIntelligence and invalidated on atom mutation.
**Depends on**: Phase 34 (BinderTypeConfig protocol proven pluggable)
**Requirements**: CFVEC-01, CFVEC-02, CFVEC-03, CFVEC-04
**Success Criteria** (what must be TRUE):
  1. `computeTaskVector(atom, sidecar, entities)` returns a typed Float32Array from atom metadata (age, staleness, deadline, context, energy, dependencies) — no model inference required
  2. `computePersonVector(entity, relations)` returns a typed vector from entity registry data (relationship type, responsiveness, reliability, collaboration frequency)
  3. `computeCalendarVector(calendarAtom)` returns a typed vector from derived calendar atom fields (time pressure, slack, energy cost, overrun risk)
  4. Vectors are stored in `atomIntelligence.canonicalVector` as a cached snapshot, invalidated on atom save/triage/enrichment
  5. Vector dimension schemas are defined in `BinderTypeConfig` so non-GTD binder types can define their own canonical dimensions
**Plans**: 2 plans
Plans:
- [ ] 35-01-PLAN.md � Types, schema extensions, vectors.json config, three compute functions (task/person/calendar) with tests
- [ ] 35-02-PLAN.md � Vector cache module, dirty-check, store.ts invalidation wiring at save/triage/enrichment

### Phase 36: Specialist Consensus Layer
**Goal**: Train specialist risk models on non-overlapping slices of canonical feature vectors, deploy as ONNX, and wire a consensus voter that combines their outputs — proving that differentiated specialists in consensus outperform any single model, as validated by the EII experiment (`scripts/eii-experiment.py`)
**Depends on**: Phase 35 (canonical vectors must exist as input)
**Requirements**: CONS-01, CONS-02, CONS-03, CONS-04
**Success Criteria** (what must be TRUE):
  1. 4+ specialist ONNX models trained on different canonical vector slices (time-pressure, dependency, staleness, energy-context) — each under 20KB
  2. `computeConsensus(specialistOutputs)` returns weighted-average probability + agreement score + majority vote
  3. Consensus result stored in `atomIntelligence.consensusRisk` with per-specialist contributions for explainability
  4. `dispatchTiered()` calls consensus after specialist handlers fire — single composite risk score available to all downstream consumers
  5. Cold-start guard: consensus not computed until binder has 15+ atoms with canonical vectors
**Plans**: TBD
Plans:
- [ ] TBD (run /gsd:plan-phase 36 to break down)

### Phase 37: EII Diagnostic + Consensus Ablation
**Goal**: Compute the Emergent Intelligence Index per binder as a live diagnostic, and prove via ablation that consensus outperforms individual specialists — the EII curve must show monotonic growth with corpus size, matching the synthetic experiment
**Depends on**: Phase 36 (consensus layer must exist to measure)
**Requirements**: EII-01, EII-02, EII-03, EII-04
**Success Criteria** (what must be TRUE):
  1. `computeEII(binderId)` returns `{ coherence, stability, impact, eii }` from consensus AUC, pairwise agreement, and binder-level recall of surfaced high-risk atoms
  2. EII is computed after each harness adversarial cycle and stored in the harness report alongside per-persona breakdowns
  3. Ablation engine measures consensus vs each specialist independently — ablation report includes a `consensus_lift` metric
  4. EII curve across corpus sizes (10%, 25%, 50%, 75%, 100%) shows positive slope — if not, the report flags which component is flat and why
  5. Harness personas with 50+ atoms achieve EII > 0.80
**Plans**: TBD
Plans:
- [ ] TBD (run /gsd:plan-phase 37 to break down)

### Phase 38: Risk Surface + Proactive Alerts
**Goal**: Consensus risk scores surface high-risk atoms proactively — the first consumer of the consensus layer that changes user-visible behavior. Tasks that are overdue + blocked + energy-mismatched float to the top without the user asking.
**Depends on**: Phase 37 (consensus proven via ablation before surfacing to users)
**Requirements**: RISK-01, RISK-02, RISK-03, RISK-04
**Success Criteria** (what must be TRUE):
  1. Inbox/review views sort by consensus risk score when available, falling back to staleness when not
  2. Tasks above the 0.7 risk threshold show a risk indicator badge with a one-line explanation ("overdue + blocked by slow responder")
  3. Risk explanations are derived from per-specialist contributions — the system says which risk dimension is driving the score
  4. Staleness prediction uses temporal patterns from canonical vectors (age, days_since_touched, review cadence) — first predictive model that forecasts when an atom will go stale
  5. Risk scores decay and refresh: re-computed on triage, enrichment, or entity update — never stale for more than 24h on active binders
**Plans**: TBD
Plans:
- [ ] TBD (run /gsd:plan-phase 38 to break down)
