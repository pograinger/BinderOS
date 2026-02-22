---
phase: 03-pages-navigation-and-search
plan: 01
subsystem: database
tags: [dexie, solidjs, indexeddb, zod, typescript, filtering, querying]

# Dependency graph
requires:
  - phase: 02-compute-engine
    provides: AtomScore, EntropyScore, PriorityTier types used in query memos and sort logic
  - phase: 01-foundation
    provides: Dexie v1 schema, Atom/InboxItem types, store/worker architecture
provides:
  - Dexie v2 schema migration with *tags, context indexes on atoms, savedFilters and interactions tables
  - SavedFilter, InteractionEvent, FilterConfig interfaces in db.ts
  - SAVE_FILTER, DELETE_FILTER, LOG_INTERACTION worker commands
  - tags (string[]) and context (string|null) fields on all atom types via BaseAtomFields
  - savedFilters[] and selectedAtomId in BinderState + selectedAtom derived memo
  - Five createMemo page query functions: todayAtoms, thisWeekAtoms, activeProjectAtoms, waitingAtoms, insightAtoms
  - Generic filteredAndSortedAtoms() higher-order filter/sort function
  - FilterState interface and createFilterState() factory
  - FilterBar component with type/status/priority/date/section/sort controls
affects:
  - 03-02: page views will consume todayAtoms, thisWeekAtoms, activeProjectAtoms, waitingAtoms, insightAtoms
  - 03-03: search will use FilterState and filteredAndSortedAtoms
  - 03-04: tags UI will rely on atom.tags[] and context fields

# Tech tracking
tech-stack:
  added: []
  patterns:
    - createMemo for all derived atom lists (never plain functions) — SolidJS reactive tracking
    - Higher-order memo pattern: filteredAndSortedAtoms wraps source memo with reactive FilterState
    - Dexie multi-entry index (*tags) enables tag queries without loading all atoms
    - Ring buffer for interactions table: trim to 1000 when count exceeds 1200 (hysteresis)
    - Filter chip toggle: array.includes check, spread to add, .filter to remove

key-files:
  created:
    - src/storage/migrations/v2.ts
    - src/ui/signals/queries.ts
    - src/ui/components/FilterBar.tsx
  modified:
    - src/storage/db.ts
    - src/types/atoms.ts
    - src/types/messages.ts
    - src/worker/worker.ts
    - src/ui/signals/store.ts
    - src/worker/handlers/inbox.ts

key-decisions:
  - "Dexie v2 upgrade() callback modifies existing atoms inline: atom.tags = [] if missing, atom.context = null if undefined — safe migration pattern for additive field migration"
  - "Ring buffer for interactions uses 1200 trigger / 1000 target hysteresis to avoid per-write trim overhead"
  - "filteredAndSortedAtoms is a higher-order function (not a component) returning createMemo — pages compose it with createFilterState factory"
  - "FilterBar CSS documented as comments in component file; actual styles deferred to global stylesheet phase"
  - "tags field added to InboxItem literal in inbox.ts (Rule 1 auto-fix) — Zod default() applies at parse time, not object construction"

patterns-established:
  - "Page query memos: five named createMemo exports in queries.ts, one per default page"
  - "Filter signal factory: createFilterState() returns { filters, setFilter, resetFilters } — pages use this to manage filter state"
  - "Worker interaction ring buffer: LOG_INTERACTION adds with UUID then trims if >1200 entries"

requirements-completed: [ORG-03, ORG-05, ORG-06]

# Metrics
duration: 6min
completed: 2026-02-22
---

# Phase 3 Plan 01: Schema Migration, Query Engine, and Filter Infrastructure Summary

**Dexie v2 migration adding tags/context/savedFilters/interactions, five reactive createMemo page queries, and a reusable FilterBar component with chip-based filter controls**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-22T18:05:10Z
- **Completed:** 2026-02-22T18:11:00Z
- **Tasks:** 2
- **Files modified:** 10 (3 created, 7 modified)

## Accomplishments

- Dexie v2 schema migration adds `*tags` (multi-entry) and `context` indexes on atoms plus new `savedFilters` and `interactions` tables with upgrade callback for existing data
- Five createMemo page query functions (todayAtoms, thisWeekAtoms, activeProjectAtoms, waitingAtoms, insightAtoms) derive atom subsets from state.atoms + state.scores with correct GTD semantics
- FilterBar component renders type/status/priority/date/section/sort controls with reactive chip toggles; createFilterState factory provides signal management for page components
- SAVE_FILTER, DELETE_FILTER, LOG_INTERACTION worker commands added with savedFilters hydrated in READY and every STATE_UPDATE
- Atom Zod schema extended with tags (string[] default []) and context (string|null) propagating automatically to all five atom types

## Task Commits

Each task was committed atomically:

1. **Task 1: Dexie v2 migration, Zod schema extension, store/worker updates** - `9851d18` (feat)
2. **Task 2: Query engine (queries.ts) and FilterBar component** - `750af60` (feat)

**Plan metadata:** committed with docs commit below

## Files Created/Modified

- `src/storage/migrations/v2.ts` - v2 schema definition with upgrade() callback for atom tag/context backfill
- `src/storage/db.ts` - SavedFilter, InteractionEvent, FilterConfig interfaces; savedFilters and interactions Table fields; applyV2Migration() call
- `src/types/atoms.ts` - tags (string[] default []) and context (string|null optional) added to BaseAtomFields
- `src/types/messages.ts` - SAVE_FILTER, DELETE_FILTER, LOG_INTERACTION commands; savedFilters in READY and STATE_UPDATE payloads
- `src/worker/worker.ts` - SAVE_FILTER/DELETE_FILTER/LOG_INTERACTION handlers; savedFilters hydrated in INIT READY; flushAndSendState includes savedFilters
- `src/ui/signals/store.ts` - savedFilters[], selectedAtomId, setSelectedAtomId(), selectedAtom createMemo; reconcile savedFilters in message handlers
- `src/worker/handlers/inbox.ts` - tags: [] added to InboxItem object literal (auto-fix)
- `src/ui/signals/queries.ts` - todayAtoms, thisWeekAtoms, activeProjectAtoms, waitingAtoms, insightAtoms memos; filteredAndSortedAtoms(); FilterState; createFilterState()
- `src/ui/components/FilterBar.tsx` - FilterBar component with all filter/sort controls; CSS documentation comments

## Decisions Made

- Dexie v2 `upgrade()` callback uses `.modify()` to patch existing atoms inline — avoids full table read; safe for additive field migration
- Ring buffer hysteresis for interactions (trim to 1000 when count exceeds 1200) prevents per-write overhead while bounding storage
- `filteredAndSortedAtoms` is a higher-order function returning a `createMemo`, not a component — allows flexible composition with any source memo
- FilterBar CSS documented as comments in the component file; actual styles deferred to global stylesheet integration in a later plan

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added `tags: []` to InboxItem object literal in inbox.ts**
- **Found during:** Task 1 verification (TypeScript compile check)
- **Issue:** After adding `tags: z.array(z.string()).default([])` to BaseAtomFields, the TypeScript type required `tags` to be present in the InboxItem object literal. Zod's `default()` applies at parse time, not at object construction time, so the TypeScript type still requires the field.
- **Fix:** Added `tags: []` to the `item: InboxItem` object literal in `handleCreateInboxItem`
- **Files modified:** `src/worker/handlers/inbox.ts`
- **Verification:** `npx tsc --noEmit` no longer reports error for inbox.ts
- **Committed in:** `9851d18` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - bug/type mismatch)
**Impact on plan:** Necessary correction — TypeScript type system correctly flags missing required field. No scope creep.

## Issues Encountered

None — plan executed smoothly. Pre-existing VoiceCapture.tsx SpeechRecognition type errors are out of scope (pre-existing, not caused by this plan).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Query infrastructure ready for page view components (03-02)
- FilterBar ready to be composed into any page that needs filter controls
- savedFilters infrastructure ready for saved filter UI in a later plan
- interactions table ready for search/filter analytics logging
- CSS classes for FilterBar need to be added to global stylesheet when first page component uses it

## Self-Check: PASSED

All files verified present. Both commits (9851d18, 750af60) confirmed in git log. queries.ts at 395 lines (exceeds 80 min). FilterBar.tsx at 354 lines (exceeds 40 min). TypeScript compiles cleanly for all new files (only pre-existing VoiceCapture.tsx errors remain).

---
*Phase: 03-pages-navigation-and-search*
*Completed: 2026-02-22*
