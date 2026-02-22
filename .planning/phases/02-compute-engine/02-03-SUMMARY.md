---
phase: 02-compute-engine
plan: 03
subsystem: ui
tags: [solidjs, compression, review, merge, entropy, triage]

# Dependency graph
requires:
  - phase: 02-compute-engine
    provides: compressionCandidates in store state, WASM scoring, entropy health signals
  - phase: 01-foundation
    provides: InboxView card-by-card triage pattern, sendCommand(), Worker dispatch, layout.css foundations

provides:
  - ReviewView component with card-by-card compression candidate triage
  - Four review actions: Archive, Delete, Keep, Merge (with MERGE_ATOMS worker command)
  - MERGE_ATOMS handler: transfers links, appends content, deletes source atom
  - Review tab in PageTabStrip with live candidate count badge
  - Rewarding empty state when all candidates resolved

affects: [phase-03-search-and-query, any-feature-using-compression-candidates]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Card-by-card triage with currentIndex signal (same as InboxView)
    - Merge selector with search-by-title type-ahead (filtered from state.atoms)
    - Raw touch handlers for swipe gestures mirroring InboxView pattern
    - Sentinel string ('cap_exceeded') pattern for worker handler responses

key-files:
  created:
    - src/ui/views/ReviewView.tsx
  modified:
    - src/types/messages.ts
    - src/ui/layout/PageTabStrip.tsx
    - src/ui/layout/MainPane.tsx
    - src/ui/layout/layout.css
    - src/worker/handlers/atoms.ts
    - src/worker/worker.ts

key-decisions:
  - "ARCHIVE_ATOM reused as UPDATE_ATOM with status='archived' — no new command needed (existing UPDATE_ATOM already handles status changes)"
  - "MERGE_ATOMS de-duplicates links via Set spread: [...new Set([...target.links, ...source.links])]"
  - "Merge appends source content to target with '---\\nMerged from:' separator before deleting source"
  - "Review tab badge shows live compressionCandidates.length — badge hidden when count is zero"

patterns-established:
  - "Triage card pattern: createSignal(currentIndex) + advance on each action — reusable for any review flow"
  - "Worker merge pattern: read both entities, combine data, write target, delete source, flush state"

requirements-completed: [ENTR-08, ENTR-09, ENTR-10]

# Metrics
duration: 15min
completed: 2026-02-22
---

# Phase 2 Plan 03: ReviewView Summary

**Card-by-card compression prompt triage page with MERGE_ATOMS command: Archive, Delete, Keep, and Merge actions surface entropy candidates for intentional review**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-02-22T10:17:45Z
- **Completed:** 2026-02-22T10:32:45Z
- **Tasks:** 2 (1 auto, 1 checkpoint:human-verify)
- **Files modified:** 7

## Accomplishments

- ReviewView mirrors InboxView card-by-card triage pattern for compression candidates from state.compressionCandidates
- MERGE_ATOMS worker command implemented: combines links via Set deduplication, appends source content with separator, deletes source atom
- Review tab added to PageTabStrip with live candidate count badge (hidden when zero)
- Four action buttons: Archive (UPDATE_ATOM status=archived), Delete (DELETE_ATOM), Keep (UPDATE_ATOM updated_at=now), Merge (MERGE_ATOMS with target search)
- Swipe gestures mirroring InboxView: left=archive, right=keep, up=delete
- Rewarding empty state: "All clear!" with entropy health summary when no candidates remain
- Complete Phase 2 compute engine verified by user: staleness, priority badges, entropy health, inbox/task caps, and Review page all functioning

## Task Commits

Each task was committed atomically:

1. **Task 1: ReviewView + merge handler + tab integration** - `297c9f7` (feat)
2. **Task 2: Verify Phase 2 complete system** - checkpoint approved by user (no code changes)

## Files Created/Modified

- `src/ui/views/ReviewView.tsx` - Card-by-card compression candidate triage view, 383 lines, four actions, merge target search, swipe gestures, empty state
- `src/types/messages.ts` - Added MERGE_ATOMS command type with sourceId/targetId payload
- `src/ui/layout/PageTabStrip.tsx` - Added Review tab with live compressionCandidates count badge
- `src/ui/layout/MainPane.tsx` - Added ReviewView Match case for activePage === 'review'
- `src/ui/layout/layout.css` - Added 703 lines of ReviewView styles: .review-view, .review-card, .review-reason, .review-actions, .review-merge-search, .review-empty-state, .review-progress, swipe animation classes
- `src/worker/handlers/atoms.ts` - Added handleMergeAtoms(): reads both atoms, combines links (Set), appends content, updates target, deletes source
- `src/worker/worker.ts` - Added MERGE_ATOMS case in dispatch, calls handleMergeAtoms() then flushAndSendState()

## Decisions Made

- ARCHIVE_ATOM reused existing UPDATE_ATOM command with status='archived' — no new command type required since UPDATE_ATOM already handles arbitrary field updates
- MERGE_ATOMS de-duplicates links with `[...new Set([...target.links, ...source.links])]` — prevents duplicate references after merge
- Source content appended to target with `\n\n---\nMerged from: {title}` separator so history is preserved but target is authoritative
- Review tab badge shows raw candidate count; hidden (not rendered) when count is zero to avoid visual noise

## Deviations from Plan

None - plan executed exactly as written. ARCHIVE_ATOM was correctly identified in the plan as potentially reusing UPDATE_ATOM, and that path was taken.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 2 Compute Engine complete: all four plans shipped (WASM scoring, staleness/visualization/caps, ReviewView)
- Phase 3 (Search and Query) can begin: all atoms have computed priority scores, entropy candidates are surfaced, store state is stable
- No blockers for Phase 3

---
*Phase: 02-compute-engine*
*Completed: 2026-02-22*
