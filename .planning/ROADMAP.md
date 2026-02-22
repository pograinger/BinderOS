# Roadmap: BinderOS

## Overview

BinderOS ships in three phases. Phase 1 lays the typed-atom data model, local-first storage with browser durability guarantees, and the binder UI shell — everything downstream depends on atoms existing and persisting safely. Phase 2 adds the Rust/WASM compute engine that gives those atoms meaning: dynamic priority scoring, staleness decay, entropy health, and the hard caps (with advisory-first UX) that are the product thesis. Phase 3 completes the user-facing surface: pages as queries over the atom store, full navigation, search, and the cross-cutting tagging and filtering layer that makes the system navigable at scale.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - Typed atom schema, local-first storage with browser durability, and the binder UI shell with fast capture
- [ ] **Phase 2: Compute Engine** - Rust/WASM priority scoring, staleness decay, entropy health indicator, and advisory-first hard caps
- [ ] **Phase 3: Pages, Navigation, and Search** - Pages as queries, full-text search, keyboard navigation, command palette, backlinks, tags, and saved filters

## Phase Details

### Phase 1: Foundation
**Goal**: Users can create, classify, and persist typed atoms in a durable local store, with a binder UI shell that won't silently lose data
**Depends on**: Nothing (first phase)
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06, TRST-01, TRST-02, TRST-03, TRST-04, TRST-05, TRST-06, TRST-07, ORG-01, ORG-02, ORG-09
**Success Criteria** (what must be TRUE):
  1. User can create an atom of any of the five types (Task, Fact, Event, Decision, Insight) with Markdown content, and the atom persists across full browser restarts
  2. User can capture an item to the inbox via keyboard shortcut from any view without navigating away
  3. User can export all stored atoms as JSON and Markdown at any time, and the resulting file contains every atom visible in the UI
  4. System requests persistent storage at first launch and storage grant status is visible in the UI; atoms are never stored outside IndexedDB/OPFS and zero network calls are made for read/write
  5. User can undo a recent atom mutation via Ctrl+Z and the atom returns to its prior state
**Plans:** 4 plans

Plans:
- [ ] 01-01-PLAN.md — Project scaffolding: Vite + SolidJS + TypeScript + ESLint (solid plugin) + Zod, three-step WASM build pipeline, Web Worker bridge skeleton
- [ ] 01-02-PLAN.md — Atom schema + IndexedDB persistence: Zod-validated five-type schema, Dexie.js with write-queue, schema migrations, change log, sections, storage persistence
- [ ] 01-03-PLAN.md — Worker handlers + shell frame: Worker command dispatch, SolidJS reactive store, dark theme layout, sidebar, bottom tab bar, page tabs, status bar
- [ ] 01-04-PLAN.md — Views + components + capture: card-by-card triage with swipe/type-ahead/type-suggestion, atom cards with swipe gestures, fast capture overlay, voice, export, storage warning, classification logging

### Phase 2: Compute Engine
**Goal**: Every atom has a live priority score and staleness indicator computed off the main thread, the entropy health of the system is always visible, and the inbox and task caps enforce hygiene through warnings before blocks
**Depends on**: Phase 1
**Requirements**: ENTR-01, ENTR-02, ENTR-03, ENTR-04, ENTR-05, ENTR-06, ENTR-07, ENTR-08, ENTR-09, ENTR-10, CAPT-02, CAPT-03, CAPT-04, CAPT-05, CAPT-06
**Success Criteria** (what must be TRUE):
  1. Every atom displays a computed priority score (P = f(deadline, importance, recency, dependencies, energy)) that updates without a page reload when underlying factors change
  2. Every atom displays a visual staleness indicator; atoms not touched, linked, or pinned show visibly lower relevance over time
  3. Entropy health indicator (green/yellow/red) is visible on every view, reflecting open task count, stale item count, zero-link atom count, and inbox length
  4. Attempting to add a 17th inbox item (at 80% of default cap 20) shows a soft warning; attempting to add a 21st item shows a resolution UI (classify, schedule, or discard) and blocks the add
  5. System surfaces a list of compression prompt candidates (stale atoms, zero-link atoms) with archive, delete, or keep options — user decides, nothing is auto-deleted
**Plans**: TBD

Plans:
- [ ] 02-01: Rust/WASM core — priority scoring formula, staleness decay engine, entropy score function, panic=abort + catch_unwind, Web Worker integration
- [ ] 02-02: Cap enforcement UX + entropy UI — inbox cap with soft warning at 80% + resolution UI at 100%, open task cap, per-atom staleness indicator, entropy health badge, compression prompt candidates list

### Phase 3: Pages, Navigation, and Search
**Goal**: Users can navigate the full system by keyboard, find any atom via search, view their atoms through the built-in query pages, and organize cross-cutting concerns with tags and saved filters
**Depends on**: Phase 2
**Requirements**: ORG-03, ORG-04, ORG-05, ORG-06, ORG-07, ORG-08, NAV-01, NAV-02, NAV-03, NAV-04, NAV-05, NAV-06, NAV-07, CAPT-01
**Success Criteria** (what must be TRUE):
  1. Default pages (Today, This Week, Active Projects, Waiting, Insights) display correct atom subsets without storing atoms in page-specific state — each page is a query, not a silo
  2. User can full-text search across all atom types with results ranked by relevance and filterable by type, status, and date range
  3. User can navigate the entire system — move between atoms, switch pages, trigger common actions — using only the keyboard; command palette is accessible via shortcut and lists all available actions
  4. Each atom detail view shows all atoms that link to it (backlinks), and user can add tags and save custom filter definitions on any page view
  5. User can filter and sort any atom list by type, status, date range, section, priority tier, last updated, and staleness
**Plans**: TBD

Plans:
- [ ] 03-01: Pages as queries — query engine over atom store, five default pages, filter/sort controls, task status and date fields
- [ ] 03-02: Search + navigation — full-text search, keyboard navigation, command palette, backlinks UI, tags, saved filters

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/4 | Not started | - |
| 2. Compute Engine | 0/2 | Not started | - |
| 3. Pages, Navigation, and Search | 0/2 | Not started | - |
