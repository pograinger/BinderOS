# Requirements: BinderOS

**Defined:** 2026-02-21
**Core Value:** Every piece of stored information must encode predictive value about future actions, decisions, or understanding — if it doesn't change behavior, it's noise, and the system actively manages this boundary.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Data Model

- [x] **DATA-01**: User can create atoms of exactly five types: Task, Fact, Event, Decision, Insight
- [x] **DATA-02**: Every atom has an ID, type, created_at, updated_at, links array, and status
- [x] **DATA-03**: Atom type is mandatory — system never persists an untyped atom outside the inbox
- [x] **DATA-04**: Atom content supports Markdown formatting (enough for clarity, not rich text editing)
- [x] **DATA-05**: Atoms are stored in IndexedDB via Dexie.js with enforced schema (Zod validation on all mutations)
- [x] **DATA-06**: Atom schema evolves only via explicit migrations, not ad-hoc fields

### Capture & Inbox

- [ ] **CAPT-01**: User can quick-capture an item to the inbox via keyboard shortcut from any view
- [x] **CAPT-02**: Inbox has a hard cap (configurable, default 20) — system blocks new items when full
- [x] **CAPT-03**: When inbox is full, system presents resolution UI (classify, schedule, or discard existing items)
- [x] **CAPT-04**: Inbox items must be classified (assigned a type and optionally linked to a section) before becoming atoms
- [x] **CAPT-05**: Open tasks have a hard cap (configurable, default 30) — adding beyond cap requires replacing, scheduling, or merging
- [x] **CAPT-06**: Soft warning appears at 80% of inbox and task caps; hard block at 100%

### Organization

- [x] **ORG-01**: System has four stable sections: Projects, Areas, Resources, Archive
- [x] **ORG-02**: User can create, rename, and archive items within sections (e.g., specific projects, specific areas)
- [ ] **ORG-03**: Pages are query definitions over the atom store, not separate data silos
- [ ] **ORG-04**: Default pages exist: Today, This Week, Active Projects, Waiting, Insights
- [ ] **ORG-05**: User can filter atom lists by type, status, date range, section, and priority tier
- [ ] **ORG-06**: User can sort atom lists by date, priority score, last updated, and staleness
- [ ] **ORG-07**: Tasks have status: open, in-progress, waiting, done, cancelled
- [ ] **ORG-08**: Tasks support due date and scheduled date; Events are dated by nature
- [x] **ORG-09**: UI follows binder metaphor: left sidebar (sections), top tabs (pages), main pane (atom list + detail)

### Entropy Engine

- [x] **ENTR-01**: Priority score is computed dynamically: P = f(deadline, importance, recency, dependencies, energy)
- [x] **ENTR-02**: Priority scoring runs in a Rust/WASM module in a Web Worker (never on main thread)
- [x] **ENTR-03**: Staleness decay reduces atom relevance scores over time unless the atom is touched, linked to active items, or pinned
- [x] **ENTR-04**: Each atom displays a visual staleness indicator showing its current relevance state
- [x] **ENTR-05**: Entropy health indicator (green/yellow/red) is visible on every view, showing system health
- [x] **ENTR-06**: Entropy score is a function of open tasks count, stale item count, zero-link atom count, and inbox length
- [x] **ENTR-07**: Link density is tracked per atom — items with many links are surfaced as core; zero-link stale items are entropy candidates
- [x] **ENTR-08**: System surfaces compression prompt candidates: stale atoms, zero-link atoms, semantically similar atoms
- [x] **ENTR-09**: Compression prompts offer archive, delete, or keep options — user decides, system suggests
- [x] **ENTR-10**: Entropy enforcement is advisory-first: soft warnings before hard blocks, forgiving decay for new users (first 30 days)

### Navigation & Search

- [ ] **NAV-01**: User can full-text search across all atom types with results ranked by relevance
- [ ] **NAV-02**: Search supports filtering by type, status, and date range
- [ ] **NAV-03**: User can navigate the entire system via keyboard (arrow keys, hotkeys for common actions)
- [ ] **NAV-04**: Command palette is accessible via keyboard shortcut and lists all available actions
- [ ] **NAV-05**: Backlinks are visible on each atom — user can see all atoms that link to the current one
- [ ] **NAV-06**: User can add lightweight tags to atoms for cross-cutting categorization
- [ ] **NAV-07**: User can create and save custom filter definitions on pages

### Trust & Safety

- [x] **TRST-01**: System operates fully offline — zero network calls for core read/write operations
- [x] **TRST-02**: User can export all data as JSON and Markdown at any time
- [x] **TRST-03**: All atom mutations are logged in an append-only change log
- [x] **TRST-04**: User can undo recent changes (Ctrl+Z at minimum, browse change log optionally)
- [x] **TRST-05**: System requests persistent storage (`navigator.storage.persist()`) at first launch
- [x] **TRST-06**: Storage persistence grant status is visible in the entropy health indicator
- [x] **TRST-07**: All data is stored locally in IndexedDB/OPFS — never leaves the device unless user explicitly exports

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### AI Orchestration

- **AI-01**: Pluggable AI interface — user can connect cloud APIs (OpenAI), local LLMs (Ollama), or disable entirely
- **AI-02**: AI suggests compression candidates (stale, redundant, zero-link atoms) — user approves/rejects
- **AI-03**: AI provides prioritization hints based on atom content and relationships
- **AI-04**: AI never writes atoms directly — only proposes; user explicitly accepts
- **AI-05**: API keys stored in-memory (session-only) or encrypted — never in IndexedDB unencrypted
- **AI-06**: Explicit opt-in for any data transmission to external AI services

### Embedded Content

- **EMBD-01**: IronCalc spreadsheet engine can be embedded inside atoms for computational content
- **EMBD-02**: IronCalc loads on demand (lazy-loaded) — not in initial bundle
- **EMBD-03**: Spreadsheet state persists in OPFS blob storage

### Sync & Mobile

- **SYNC-01**: CRDT-based P2P sync for multi-device support
- **SYNC-02**: End-to-end encrypted sync with append-only log replication
- **MOBL-01**: Mobile-optimized web experience

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Mobile native app | Web-first; mobile web optimization is v2 |
| Real-time collaboration | Personal, single-user, local-first tool |
| Cloud-hosted SaaS | Local-first, self-hosted only |
| User accounts / auth | Single-user local tool, no accounts needed |
| Unlimited inbox | Destroys entropy budget; inbox cap is the triage mechanism |
| Free-form untyped notes | Untyped content is the primary source of PKM decay |
| Nested folders / hierarchy | Flat atom layer with links and sections prevents hierarchy bloat |
| Rich text / WYSIWYG editor | Encourages long-form dumping; Markdown is sufficient |
| Plugin ecosystem | Plugins can bypass caps and break the information-theory constraints |
| Daily notes / journal | Encourages unprocessed dumping; inbox + "captured today" filter replaces this |
| Habit tracking | Separate domain; recurring Tasks handle habitual actions |
| Calendar view (full) | Complex; due dates in list views + Events page suffices for v1 |
| AI-generated content | AI as orchestrator, never author; auto-generated atoms undermine trust |
| Custom dashboard widgets | Opinionated pages with fixed layouts; defer rich dashboards to post-MVP |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DATA-01 | Phase 1 | Complete |
| DATA-02 | Phase 1 | Complete |
| DATA-03 | Phase 1 | Complete |
| DATA-04 | Phase 1 | Complete |
| DATA-05 | Phase 1 | Complete |
| DATA-06 | Phase 1 | Complete |
| CAPT-01 | Phase 3 | Pending |
| CAPT-02 | Phase 2 | Pending |
| CAPT-03 | Phase 2 | Pending |
| CAPT-04 | Phase 2 | Pending |
| CAPT-05 | Phase 2 | Pending |
| CAPT-06 | Phase 2 | Pending |
| ORG-01 | Phase 1 | Complete |
| ORG-02 | Phase 1 | Complete |
| ORG-03 | Phase 3 | Pending |
| ORG-04 | Phase 3 | Pending |
| ORG-05 | Phase 3 | Pending |
| ORG-06 | Phase 3 | Pending |
| ORG-07 | Phase 3 | Pending |
| ORG-08 | Phase 3 | Pending |
| ORG-09 | Phase 1 | Complete |
| ENTR-01 | Phase 2 | Complete |
| ENTR-02 | Phase 2 | Complete |
| ENTR-03 | Phase 2 | Complete |
| ENTR-04 | Phase 2 | Pending |
| ENTR-05 | Phase 2 | Pending |
| ENTR-06 | Phase 2 | Complete |
| ENTR-07 | Phase 2 | Complete |
| ENTR-08 | Phase 2 | Complete |
| ENTR-09 | Phase 2 | Complete |
| ENTR-10 | Phase 2 | Complete |
| NAV-01 | Phase 3 | Pending |
| NAV-02 | Phase 3 | Pending |
| NAV-03 | Phase 3 | Pending |
| NAV-04 | Phase 3 | Pending |
| NAV-05 | Phase 3 | Pending |
| NAV-06 | Phase 3 | Pending |
| NAV-07 | Phase 3 | Pending |
| TRST-01 | Phase 1 | Complete |
| TRST-02 | Phase 1 | Complete |
| TRST-03 | Phase 1 | Complete |
| TRST-04 | Phase 1 | Complete |
| TRST-05 | Phase 1 | Complete |
| TRST-06 | Phase 1 | Complete |
| TRST-07 | Phase 1 | Complete |

**Coverage:**
- v1 requirements: 45 total
- Mapped to phases: 45
- Unmapped: 0

---
*Requirements defined: 2026-02-21*
*Last updated: 2026-02-22 — TRST-02, TRST-04, ORG-09 completed in Plan 01-03*
