# Requirements: BinderOS

**Defined:** 2026-02-22
**Core Value:** Every piece of stored information must encode predictive value about future actions, decisions, or understanding — if it doesn't change behavior, it's noise, and the system actively manages this boundary.

## v2.0 Requirements

Requirements for AI Orchestration milestone. Each maps to roadmap phases.

### AI Infrastructure

- [ ] **AINF-01**: Pluggable AI adapter interface with provider routing (no-op, browser LLM, cloud API)
- [ ] **AINF-02**: Dedicated LLM worker running SmolLM2 via Transformers.js, isolated from BinderCore worker
- [ ] **AINF-03**: WebGPU-tiered model selection — larger/faster models on GPU-capable machines, CPU fallback with smaller model
- [ ] **AINF-04**: Cloud API integration layer with Anthropic CORS support and streaming via fetch-event-stream
- [ ] **AINF-05**: AI provider status (available/unavailable/loading/error/disabled) surfaced in store and UI
- [ ] **AINF-06**: Graceful offline degradation — browser LLM works offline; cloud features show friendly unavailable message

### AI UX

- [ ] **AIUX-01**: Floating orb — always-visible, context-aware AI trigger reading current page/atom/entropy state
- [ ] **AIUX-02**: Orb GTD menu with relevant actions below context-aware primary suggestion
- [ ] **AIUX-03**: Conversational question-flow component (3-4 options + freeform input) for all AI interactions
- [ ] **AIUX-04**: AI suggestion tray with per-suggestion accept/dismiss and reasoning shown
- [ ] **AIUX-05**: Visual AI badge on all AI-sourced or AI-modified content, distinct from user content
- [ ] **AIUX-06**: Streaming response display with cancel/abort support

### AI Triage

- [ ] **AITG-01**: AI suggests atom type during inbox triage based on content analysis
- [ ] **AITG-02**: AI suggests section/project during inbox triage based on existing atom patterns
- [ ] **AITG-03**: Entropy-informed suggestions — AI reads staleness, link density, and scoring before recommending
- [ ] **AITG-04**: Related atoms surfaced during triage (2-3 semantically similar existing atoms)
- [ ] **AITG-05**: Reasoning shown per triage suggestion explaining why AI chose that type/section

### AI Reviews

- [ ] **AIRV-01**: Background pre-analysis workers that read-only analyze entropy state and prepare briefings
- [ ] **AIRV-02**: Review pre-analysis briefing — AI summary of stale tasks, projects without next actions, compression candidates
- [ ] **AIRV-03**: Guided GTD weekly review flow (Get Clear / Get Current / Get Creative) via conversational question-flow
- [ ] **AIRV-04**: Compression coach — AI explains why specific atoms are compression candidates with contextual reasoning
- [ ] **AIRV-05**: Review session persistence — resume incomplete reviews within 24 hours

### AI Generative

- [ ] **AIGN-01**: AI generates analysis artifacts (briefings, trend insights, relationship maps) as distinct artifact type
- [ ] **AIGN-02**: AI proposes draft atoms in staging area — user approves to promote to real atoms, rejects to discard
- [ ] **AIGN-03**: AI can modify existing atom metadata (tags, priority hints, section, links) — additive, tagged, reversible
- [ ] **AIGN-04**: All AI mutations tracked in changelog with `source: 'ai'` field, fully reversible via undo

### AI Trust & Safety

- [ ] **AIST-01**: Explicit opt-in/opt-out for all AI features; cloud API requires separate consent
- [ ] **AIST-02**: API key stored in memory only by default; encrypted persistence optional with security disclosure
- [ ] **AIST-03**: Destructive AI actions (delete, archive, overwrite content) always require explicit user approval
- [ ] **AIST-04**: AI never runs autonomously on a schedule — all analysis triggered by user action or app launch

## v3.0 Requirements

Deferred to future release. Tracked but not in current roadmap.

### PARA Section Views

- **PARA-01**: Full Projects page with project-specific workflows and progress tracking
- **PARA-02**: Areas page with ongoing responsibility tracking
- **PARA-03**: Resources page with reference material organization
- **PARA-04**: Archive page with completed/inactive item browsing

### Sync & Security

- **SYNC-01**: CRDT-based P2P multi-device sync
- **SYNC-02**: End-to-end encrypted sync with append-only log replication
- **ENCR-01**: IndexedDB encryption at rest

### Mobile & Content

- **MOBL-01**: Mobile-optimized touch-first responsive experience
- **EMBD-01**: IronCalc spreadsheet engine embedded inside atoms

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| AI auto-creates atoms without approval | Defeats the classification ritual that defines BinderOS's value |
| AI-generated atom content (summaries, notes) | AI suggests metadata only; user is sole content author |
| AI priority override of entropy engine | Deterministic scoring users can trust; AI explains, never overrides |
| AI-suggested new tasks/projects | Scope creep into coaching; AI flags existing atoms, never proposes new work items |
| Persistent AI behavioral learning model | Privacy surface, complexity; stateless per-session analysis is sufficient |
| Chat sidebar as primary AI interface | Structured question flows match GTD reviews; open-ended chat invites off-topic |
| OpenAI direct browser integration | No browser CORS support; Anthropic only for v2.0; OpenAI via proxy deferred |
| AI confidence scores as primary display | Research shows reasoning > numbers for trust; show "why" not percentages |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AINF-01 | Phase 4 | Pending |
| AINF-02 | Phase 4 | Pending |
| AINF-03 | Phase 4 | Pending |
| AINF-04 | Phase 4 | Pending |
| AINF-05 | Phase 4 | Pending |
| AINF-06 | Phase 4 | Pending |
| AIUX-01 | Phase 5 | Pending |
| AIUX-02 | Phase 5 | Pending |
| AIUX-03 | Phase 5 | Pending |
| AIUX-04 | Phase 5 | Pending |
| AIUX-05 | Phase 5 | Pending |
| AIUX-06 | Phase 5 | Pending |
| AITG-01 | Phase 5 | Pending |
| AITG-02 | Phase 5 | Pending |
| AITG-03 | Phase 5 | Pending |
| AITG-04 | Phase 5 | Pending |
| AITG-05 | Phase 5 | Pending |
| AIRV-01 | Phase 6 | Pending |
| AIRV-02 | Phase 6 | Pending |
| AIRV-03 | Phase 7 | Pending |
| AIRV-04 | Phase 7 | Pending |
| AIRV-05 | Phase 6 | Pending |
| AIGN-01 | Phase 6 | Pending |
| AIGN-02 | Phase 7 | Pending |
| AIGN-03 | Phase 7 | Pending |
| AIGN-04 | Phase 7 | Pending |
| AIST-01 | Phase 4 | Pending |
| AIST-02 | Phase 4 | Pending |
| AIST-03 | Phase 4 | Pending |
| AIST-04 | Phase 4 | Pending |

**Coverage:**
- v2.0 requirements: 30 total
- Mapped to phases: 30
- Unmapped: 0

---
*Requirements defined: 2026-02-22*
*Last updated: 2026-02-22 — traceability complete (v2.0 roadmap Phases 4–7)*
