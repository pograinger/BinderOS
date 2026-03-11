# Roadmap: BinderOS

## Milestones

- [x] **v1.0** — Foundation + Compute Engine + Pages/Navigation/Search (45/45 requirements, 11 plans, shipped 2026-02-22) → [Archive](.planning/milestones/v1.0-ROADMAP.md)
- [x] **v2.0 AI Orchestration** — Phases 4-7 (30/30 requirements, 14 plans, shipped 2026-03-03) → [Archive](.planning/milestones/v2.0-ROADMAP.md)
- [x] **v3.0 Local AI + Polish** — Phases 9-11 (18/18 requirements, 8 plans, shipped 2026-03-05) → [Archive](.planning/milestones/v3.0-ROADMAP.md)
- [x] **v4.0 Device-Adaptive AI** — Phases 12-25 (48/48 requirements, 32 plans, shipped 2026-03-10) → [Archive](.planning/milestones/v4.0-ROADMAP.md)
- 🚧 **v5.0 Entity Intelligence & Knowledge Graph** — Phases 26-29 (20 requirements, in progress)

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

### v5.0 Entity Intelligence & Knowledge Graph (In Progress)

**Milestone Goal:** Local AI agents that detect entities (people, places, orgs) from raw content, build a persistent entity registry with relationship inference, and feed entity context into enrichment and GTD processing — so the system "knows" the user's world through privacy-safe local-only intelligence.

- [x] **Phase 26: Intelligence Sidecar + Schema** - Dexie migration with atomIntelligence sidecar, entity/relation tables, enrichment refactor to structured records, smart links field (completed 2026-03-11)
- [x] **Phase 27: Entity Detection + Registry** - Sanitization worker extended for entity detection, detection lifecycle, entity-atom linking, dedup/normalization, entity badges (completed 2026-03-11)
- [ ] **Phase 28: Relationship Inference + Cognitive Harness** - T1 keyword pattern engine, co-occurrence accumulation, evidence scoring, headless testing harness, synthetic user profile, cloud adversarial scoring
- [ ] **Phase 29: Entity Consumers + Trained Agent Validation** - Entity-aware enrichment, user correction UX, GTD context suggestions, cloud-as-user training loop, local stack benchmark proving emergent user learning

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

## Progress

**Execution Order:** 26 → 27 → 28 → 29

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
| 27. Entity Detection + Registry | 2/2 | Complete   | 2026-03-11 | - |
| 28. Relationship Inference | v5.0 | 0/2 | Not started | - |
| 29. Entity Intelligence Consumers | v5.0 | 0/TBD | Not started | - |
