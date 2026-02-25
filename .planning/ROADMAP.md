# Roadmap: BinderOS

## Milestones

- [x] **v1.0** — Foundation + Compute Engine + Pages/Navigation/Search (45/45 requirements, 11 plans, shipped 2026-02-22) → [Archive](.planning/milestones/v1.0-ROADMAP.md)
- [ ] **v2.0 AI Orchestration** — Phases 4–7 (in progress)

## Phases

<details>
<summary>v1.0 Foundation (Phases 1–3) — SHIPPED 2026-02-22</summary>

See [Archive](.planning/milestones/v1.0-ROADMAP.md) for full detail.

- [x] **Phase 1: Foundation** - Typed atoms, IndexedDB persistence, worker bridge, capture UI
- [x] **Phase 2: Compute Engine** - Rust/WASM scoring, staleness decay, entropy health, cap enforcement
- [x] **Phase 3: Pages, Navigation, Search** - 5 page views, search overlay, command palette, tags, backlinks

</details>

---

### v2.0 AI Orchestration

**Milestone Goal:** Make GTD review cycles effortless through AI-powered triage, guided reviews, and proactive suggestions — all accessible via a floating orb with conversational question flows.

- [x] **Phase 4: AI Infrastructure** - Worker isolation, adapter interface, store extension, trust & safety model (complete 2026-02-22)
- [ ] **Phase 5: Triage AI** - Floating orb, suggestion tray, question-flow UX, inbox triage suggestions
- [ ] **Phase 6: Review Pre-Analysis** - Background analysis briefings, session persistence, cloud API end-to-end
- [ ] **Phase 7: Guided Review + Compression Coach** - Full GTD weekly review, compression coach, draft atom staging, AI mutation tracking

## Phase Details

### Phase 4: AI Infrastructure
**Goal**: The AI layer has correct worker isolation, a pluggable adapter interface, extended store state, and a complete security model — all verified end-to-end with a no-op adapter before any real AI is connected
**Depends on**: Phase 3 (v1.0 complete)
**Requirements**: AINF-01, AINF-02, AINF-03, AINF-04, AINF-05, AINF-06, AIST-01, AIST-02, AIST-03, AIST-04
**Success Criteria** (what must be TRUE):
  1. User can open Settings and enable/disable AI features with separate toggles for browser LLM and cloud API; all AI surfaces disappear immediately when disabled
  2. User can enter an API key in Settings; the key is memory-only by default with a visible security disclosure; the settings panel shows current provider status (loading, available, error, disabled)
  3. An AI command dispatched through the orb completes the full worker round-trip with a no-op response — verifying message routing, store updates, and UI reaction — without touching the BinderCore worker
  4. On a GPU-capable machine the browser LLM status reflects the appropriate model tier; on CPU-only machines a smaller fallback model is selected; going offline shows a friendly unavailable message for cloud features only
**Plans:** 4/4 plans complete

Plans:
- [x] 04-01-PLAN.md — AI message protocol + store extension + no-op adapter (end-to-end routing proof)
- [x] 04-02-PLAN.md — LLM worker (SmolLM2 via Transformers.js) + browser adapter + WebGPU detection
- [x] 04-03-PLAN.md — Cloud API adapter (Anthropic SDK + streaming + BYOK) + trust & safety settings UI
- [ ] 04-04-PLAN.md — Gap closure: fix NoOpAdapter thread split + add dev-only round-trip proof

### Phase 5: Triage AI
**Goal**: Users have a floating orb available on every page that opens a suggestion tray during inbox triage, presents AI-suggested atom type and section with reasoning, and lets them accept or dismiss each suggestion — all changes tagged as AI-sourced in the changelog
**Depends on**: Phase 4
**Requirements**: AIUX-01, AIUX-02, AIUX-03, AIUX-04, AIUX-05, AIUX-06, AITG-01, AITG-02, AITG-03, AITG-04, AITG-05
**Success Criteria** (what must be TRUE):
  1. The floating orb is visible on every page; tapping it while on the Inbox shows a context-aware primary action with the GTD menu below; tapping it on other pages shows a different relevant primary action based on current page and selected atom
  2. When triage AI runs, each inbox card shows a suggested atom type and section with a one-sentence reasoning; 2-3 semantically related existing atoms are surfaced alongside each suggestion
  3. User can accept or dismiss each suggestion individually; accepted suggestions apply via the existing mutation pipeline and appear with a persistent AI badge; dismissed suggestions disappear from the tray without affecting the atom
  4. AI responses stream token-by-token into the suggestion tray; the user can cancel mid-stream; on abort a partial response is shown with a "Retry" option
  5. AI type and section suggestions reflect entropy signals — the reasoning references observable data from the atom store (staleness, link density, scoring)
**Plans:** 3/4 plans executed

Plans:
- [ ] 05-01-PLAN.md — Floating orb component + radial menu + CSS state animations + Shell integration
- [ ] 05-02-PLAN.md — AI-source schema extensions + Dexie v3 migration + AI badge + settings persistence
- [ ] 05-03-PLAN.md — Triage pipeline (prompt builder + response parser + similarity + batch engine + abort)
- [ ] 05-04-PLAN.md — InboxView suggestion integration + swipe semantics + AIQuestionFlow + end-to-end verification

### Phase 6: Review Pre-Analysis
**Goal**: Users can start a weekly review and receive an AI-generated briefing summarizing their entropy state, stale tasks, projects without next actions, and compression candidates — and incomplete reviews can be resumed within 24 hours
**Depends on**: Phase 5
**Requirements**: AIRV-01, AIRV-02, AIRV-05, AIGN-01
**Success Criteria** (what must be TRUE):
  1. Opening the weekly review shows an AI-generated briefing — a structured summary of stale tasks, projects missing next actions, and compression candidates — before the first review question appears
  2. The briefing is generated by a read-only background worker; the UI remains fully interactive and atom mutations continue normally during analysis
  3. Closing the review mid-way and reopening the app within 24 hours shows a "Resume your review?" prompt that restores the user to the step where they stopped
  4. Analysis artifacts (briefings, insight summaries) appear as a visually distinct artifact type that cannot be edited, making clear they are AI-generated and not user-authored content
**Plans**: 3 plans

Plans:
- [ ] 06-01-PLAN.md — Analysis atom type + Dexie v4 + briefing pipeline + store review state + orb wiring
- [ ] 06-02-PLAN.md — ReviewBriefingView (frosted glass cards, inline actions) + session persistence + resume + orb badge
- [ ] 06-03-PLAN.md — WebLLM migration (replace Transformers.js/SmolLM2) + model selector in settings

### Phase 7: Guided Review + Compression Coach
**Goal**: Users can complete a full AI-guided GTD weekly review through a structured conversational question flow, receive AI explanations for compression candidates with specific reasoning, and stage AI-proposed atom changes for explicit approval — all mutations tracked as AI-sourced and fully reversible
**Depends on**: Phase 6
**Requirements**: AIRV-03, AIRV-04, AIGN-02, AIGN-03, AIGN-04
**Success Criteria** (what must be TRUE):
  1. Starting a weekly review guides the user through Get Clear, Get Current, and Get Creative phases via the ConversationTurnCard question flow; each step presents 3-4 options plus a freeform input; the review escalates to cloud API for Get Creative reasoning
  2. Compression candidates in the review include AI-written explanations of why each atom is stale, referencing specific signals from the store (e.g., last-linked date, count of semantically similar atoms, relevant decisions)
  3. AI-proposed atom changes (tag additions, section moves, priority hints, link additions) appear in a staging area before anything is written; the user approves or rejects each change individually
  4. Every AI mutation accepted by the user appears in the changelog with source: 'ai'; the existing undo system reverses the change completely as if it never happened
**Plans**: TBD

Plans:
- [ ] 07-01: Full AI_START_REVIEW (mode: weekly) handler — multi-turn ConversationTurn flow through three GTD phases + context summarization for long reviews
- [ ] 07-02: Compression coach — AI_SUGGEST_COMPRESSION handler reading staleness + embeddings + link density + AI reasoning per candidate
- [ ] 07-03: Draft atom staging area — AIGN-02 approve/reject flow + AIGN-03 metadata mutation staging + AIGN-04 changelog source tagging + undo integration

## Progress

**Execution Order:**
Phases execute in numeric order: 4 → 5 → 6 → 7

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 4/4 | Complete | 2026-02-22 |
| 2. Compute Engine | v1.0 | 3/3 | Complete | 2026-02-22 |
| 3. Pages, Navigation, Search | v1.0 | 4/4 | Complete | 2026-02-22 |
| 4. AI Infrastructure | 4/4 | Complete   | 2026-02-23 | 2026-02-22 |
| 5. Triage AI | 3/4 | In Progress|  | - |
| 6. Review Pre-Analysis | v2.0 | 0/3 | Not started | - |
| 7. Guided Review + Compression Coach | v2.0 | 0/3 | Not started | - |
