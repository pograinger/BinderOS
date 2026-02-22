---
phase: 02-compute-engine
plan: 02
subsystem: ui
tags: [solidjs, priority-badge, entropy, cap-enforcement, portal, staleness, opacity]

# Dependency graph
requires:
  - phase: 02-01
    provides: AtomScore type with opacity/priorityTier, EntropyScore, capConfig in store, inboxCapStatus/taskCapStatus memos, getCapConfig() handler

provides:
  - PriorityBadge component (Critical=flame/red, High=arrow-up/amber, Medium=dash/blue, Low=arrow-down/grey, Someday=clock/dim)
  - AtomCard staleness opacity (reads state.scores[id].opacity, 1.0 fresh to 0.6 stale, 0.5s CSS transition)
  - AtomCard PriorityBadge integration for task/event atoms with pinned_tier indicator
  - StatusBar entropy health badge (Healthy/Warning/Critical with colored dot)
  - StatusBar cap status color coding (inbox + task segments: ok/warning/full)
  - CapEnforcementModal (Portal-based hard-block, dismiss only when count < cap)
  - Inbox cap enforcement in worker: rejects CREATE_INBOX_ITEM at inboxCap
  - Task cap enforcement in worker: rejects CREATE_ATOM/UPDATE_ATOM at taskCap
  - DELETE_INBOX_ITEM command for discard without classifying
  - untrack() in store STATE_UPDATE handler to safely clear capExceeded

affects: [03-retrieval, all views using AtomCard, StatusBar, app shell]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Switch/Match for mutually exclusive SolidJS rendering (never multiple early-returns)
    - Portal for modal overlay (bypasses CSS stacking context)
    - untrack() for intentional non-reactive reads inside message handlers
    - Worker returns string sentinel 'cap_exceeded' for non-error rejection paths
    - createMemo signals imported directly into components (not read from state object)

key-files:
  created:
    - src/ui/components/PriorityBadge.tsx
    - src/ui/components/CapEnforcementModal.tsx
  modified:
    - src/ui/components/AtomCard.tsx
    - src/ui/layout/StatusBar.tsx
    - src/ui/layout/layout.css
    - src/ui/theme/colors.ts
    - src/ui/signals/store.ts
    - src/worker/handlers/inbox.ts
    - src/worker/handlers/atoms.ts
    - src/worker/worker.ts
    - src/types/messages.ts
    - src/app.tsx

key-decisions:
  - "Switch/Match used in PriorityBadge TierIcon instead of multiple Show blocks — only one tier is active at a time"
  - "DELETE_INBOX_ITEM added as new command (Rule 2 auto-fix) — discard action in cap modal requires it"
  - "untrack() wraps capExceeded clearing logic in STATE_UPDATE handler — reads are intentionally non-reactive (one-shot check)"
  - "Worker handlers return 'cap_exceeded' sentinel string rather than throwing — allows caller to distinguish cap rejection from errors"
  - "CapEnforcementModal clears via state.capExceeded=null in store on STATE_UPDATE when count drops below cap — no separate close event needed"

patterns-established:
  - "Inbox/task cap enforcement: check-then-reject in handler, postMessage CAP_EXCEEDED from worker, modal auto-closes on next STATE_UPDATE"
  - "Priority icons use inline SVG with currentColor fill — inherits badge color without extra CSS"
  - "StatusBar cap segments use CSS class composition: status-segment inbox-{status}"

requirements-completed: [ENTR-04, ENTR-05, CAPT-02, CAPT-03, CAPT-04, CAPT-05, CAPT-06]

# Metrics
duration: 10min
completed: 2026-02-22
---

# Phase 02 Plan 02: Compute Engine Visualization Summary

**Staleness opacity on AtomCard, tier badges for tasks/events, entropy health in StatusBar, and inbox/task cap enforcement with hard-block modal using Portal**

## Performance

- **Duration:** 10 min
- **Started:** 2026-02-22T15:27:42Z
- **Completed:** 2026-02-22T15:38:11Z
- **Tasks:** 2
- **Files modified:** 10 (2 new, 8 extended)

## Accomplishments

- AtomCard now shows per-atom staleness as opacity fade (fresh=1.0, stale=0.6) with 0.5s CSS transition
- PriorityBadge renders tier icon + color for task/event atoms; pin icon shown for pinned_tier
- StatusBar shows entropy health badge (green Healthy / yellow Warning / red Critical) and cap-colored inbox + task counts
- Worker enforces inbox cap (rejects CREATE_INBOX_ITEM at limit) and task cap (rejects CREATE_ATOM/UPDATE_ATOM at limit)
- CapEnforcementModal renders via Portal with triage actions; auto-dismisses when count drops below cap

## Task Commits

Each task was committed atomically:

1. **Task 1: PriorityBadge + AtomCard + StatusBar entropy/caps** - `c160ba7` (feat)
2. **Task 2: Cap enforcement + CapEnforcementModal** - `8487bba` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/ui/components/PriorityBadge.tsx` - New: tier badge with SVG icon + color per PriorityTier; Switch/Match for exclusive icon selection
- `src/ui/components/CapEnforcementModal.tsx` - New: Portal-based hard-block modal; InboxItemRow with inline classify; TaskRow with complete/archive/schedule
- `src/ui/components/AtomCard.tsx` - Extended: reads state.scores[atom.id] for staleness opacity; PriorityBadge shown for task/event
- `src/ui/layout/StatusBar.tsx` - Extended: entropy health badge segment; inbox and task cap color-coded segments
- `src/ui/layout/layout.css` - Extended: --color-warning/--color-danger vars; PriorityBadge, entropy, cap segment, CapEnforcementModal styles
- `src/ui/theme/colors.ts` - Extended: tierColors and entropyColors objects
- `src/ui/signals/store.ts` - Extended: STATE_UPDATE clears capExceeded via untrack() when count < cap; imports untrack
- `src/worker/handlers/inbox.ts` - Extended: handleCreateInboxItem checks inboxCap before insert; handleDeleteInboxItem added
- `src/worker/handlers/atoms.ts` - Extended: handleCreateAtom checks taskCap for open tasks; handleUpdateAtom checks cap on reopen
- `src/worker/worker.ts` - Extended: cap_exceeded sentinel handling in CREATE_ATOM/UPDATE_ATOM/CREATE_INBOX_ITEM; DELETE_INBOX_ITEM case
- `src/types/messages.ts` - Extended: DELETE_INBOX_ITEM command added
- `src/app.tsx` - Extended: CapEnforcementModal rendered at root

## Decisions Made

- Switch/Match used in TierIcon component instead of multiple Show blocks — only one tier is active at a time, Switch is the correct SolidJS primitive
- DELETE_INBOX_ITEM added as a new worker command (auto-fix Rule 2) — the discard action in CapEnforcementModal requires deleting inbox items without classifying them
- untrack() wraps the capExceeded clearing logic inside STATE_UPDATE handler — reads are intentionally non-reactive (one-shot check in event handler), prevents ESLint solid/reactivity warning
- Worker handlers return the string sentinel 'cap_exceeded' rather than throwing — allows the worker switch case to distinguish cap rejection from real errors without exception flow
- CapEnforcementModal auto-closes via state.capExceeded becoming null in the store when STATE_UPDATE arrives with counts below cap — no explicit close command needed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added DELETE_INBOX_ITEM command**
- **Found during:** Task 2 (CapEnforcementModal implementation)
- **Issue:** CapEnforcementModal discard action needed to delete inbox items without classifying. No DELETE_INBOX_ITEM command existed in messages.ts or worker.
- **Fix:** Added DELETE_INBOX_ITEM to Command union in messages.ts, handleDeleteInboxItem() in inbox.ts, and worker.ts case
- **Files modified:** src/types/messages.ts, src/worker/handlers/inbox.ts, src/worker/worker.ts
- **Verification:** Build passes, lint passes, TypeScript exhaustiveness check satisfied
- **Committed in:** 8487bba (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical functionality)
**Impact on plan:** DELETE_INBOX_ITEM is essential for the discard action in CapEnforcementModal. Without it, users could not free inbox slots by discarding items — the modal would be unusable. No scope creep.

## Issues Encountered

- ESLint solid/reactivity warning on STATE_UPDATE handler after adding reactive reads for capExceeded clearing. Resolved with untrack() wrapper — the reads are intentionally non-reactive (one-shot check in a message handler, not a reactive computation).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All Phase 2 visualization components complete: staleness opacity, priority badges, entropy health, cap enforcement
- CapEnforcementModal provides the advisory-first discipline UX (soft warning = color shift, hard block = modal)
- Phase 2 Plan 3 (compression/review) can proceed — compressionCandidates from store are ready to consume
- Concerns: cap clearing logic in STATE_UPDATE relies on inboxItems/atoms being included in the payload; worker always sends full state in flushAndSendState() so this should always work

---
*Phase: 02-compute-engine*
*Completed: 2026-02-22*

## Self-Check: PASSED

- src/ui/components/PriorityBadge.tsx — FOUND
- src/ui/components/CapEnforcementModal.tsx — FOUND
- src/ui/components/AtomCard.tsx — FOUND
- src/ui/layout/StatusBar.tsx — FOUND
- Commit c160ba7 (Task 1) — FOUND
- Commit 8487bba (Task 2) — FOUND
