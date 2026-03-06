---
phase: 11-tech-debt-settings-correction
plan: "02"
subsystem: ui
tags: [solidjs, status-bar, ai-orb, atom-detail, read-only, css]

# Dependency graph
requires:
  - phase: 10-browser-inference-integration
    provides: classifierLoadProgress signal, llmStatus/cloudStatus in store
provides:
  - Simplified StatusBar AI indicator (dot-only, no text, no busy state)
  - Clean AIOrb with no stale phase comments or debug logs
  - isReadOnly guard on all edit handlers in AtomDetailView
  - disabled prop on MentionAutocomplete for content textarea visual guard
affects: [AtomDetailView, StatusBar, AIOrb, MentionAutocomplete]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "isReadOnly safe cast: (a as Record<string, unknown>)['isReadOnly'] === true — same pattern as getAtomDate, avoids 'in' operator on SolidJS proxies"

key-files:
  created: []
  modified:
    - src/ui/layout/StatusBar.tsx
    - src/ui/components/AIOrb.tsx
    - src/ui/views/AtomDetailView.tsx
    - src/ui/components/MentionAutocomplete.tsx
    - src/ui/layout/layout.css

key-decisions:
  - "StatusBar AI indicator reduced to dot-only with no busy state — aiActivity branching removed entirely per POLISH-03"
  - "isReadOnly memo uses safe cast pattern (not 'in' operator) to avoid SolidJS proxy reactivity pitfall"
  - "MentionAutocomplete gained optional disabled prop to thread visual disable through to internal textarea"

patterns-established:
  - "isReadOnly guard pattern: add memo with safe cast, then if (isReadOnly()) return; as first line of every edit handler"

requirements-completed: [POLISH-03, POLISH-04, POLISH-05, POLISH-06]

# Metrics
duration: 22min
completed: 2026-03-05
---

# Phase 11 Plan 02: Tech Debt Cleanup (StatusBar, AIOrb, AtomDetailView) Summary

**Dot-only AI status indicator in StatusBar, stale phase comments removed from AIOrb, and isReadOnly guard on all AtomDetailView edit paths with visual disabled feedback**

## Performance

- **Duration:** 22 min
- **Started:** 2026-03-05T01:05:10Z
- **Completed:** 2026-03-05T01:27:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- StatusBar: replaced verbose AI indicator (dot + "AI" text + busy branching) with a single green dot that only appears when AI is enabled AND a provider is available
- AIOrb: removed all stale "Phase 5/6/7" references from file header and handleMenuAction, removed two debug console.log calls in discuss handlers
- llm-worker.ts: verified clean — abort handler and abortControllers map are real functionality, not dead code; no changes needed
- AtomDetailView: added isReadOnly createMemo with safe cast, guarded all 5 edit handlers, added disabled prop to all date inputs, project select, title input, and MentionAutocomplete content textarea; added .atom-detail-readonly CSS class

## Task Commits

Each task was committed atomically:

1. **Task 1: Simplify StatusBar AI indicator, verify llm-worker, clean AIOrb comments** - `f95b08f` (chore)
2. **Task 2: Enforce isReadOnly at UI level in AtomDetailView** - `f494810` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/ui/layout/StatusBar.tsx` - Replaced verbose AI indicator with dot-only Show block; removed stale Phase 4/10 import comments
- `src/ui/components/AIOrb.tsx` - Removed Phase 5/6/7 references from header and handleMenuAction; removed debug console.logs in discuss handlers
- `src/ui/views/AtomDetailView.tsx` - Added isReadOnly memo and guard on startEditTitle, handleStatusChange, handleDateField, handleContentChange, project select onChange; disabled attribute on all inputs
- `src/ui/components/MentionAutocomplete.tsx` - Added optional disabled prop threaded through to internal textarea
- `src/ui/layout/layout.css` - Added .atom-detail-readonly rule (opacity 0.7, cursor not-allowed)

## Decisions Made
- StatusBar AI indicator: dot-only when `aiEnabled && (llmStatus === 'available' || cloudStatus === 'available')` — no busy state, no text label, no loading state (POLISH-03)
- llm-worker.ts verified clean per scout finding — abort handler is documented limitation of Transformers.js, not dead code; no changes made (POLISH-04)
- isReadOnly uses safe cast `(a as Record<string, unknown>)['isReadOnly'] === true` not `'isReadOnly' in atom` — avoids SolidJS store proxy reactivity pitfall (POLISH-05)
- MentionAutocomplete needed `disabled` prop addition to surface visual disable on content textarea — minimal surface change, single prop (POLISH-06)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added disabled prop to MentionAutocomplete**
- **Found during:** Task 2 (isReadOnly enforcement in AtomDetailView)
- **Issue:** Plan said to add `disabled={isReadOnly()}` to content textarea, but textarea is internal to MentionAutocomplete which had no disabled prop
- **Fix:** Added optional `disabled?: boolean` prop to MentionAutocompleteProps interface and threaded it through to the internal `<textarea>`
- **Files modified:** src/ui/components/MentionAutocomplete.tsx
- **Verification:** TypeScript check passes, disabled attribute renders on textarea
- **Committed in:** f494810 (Task 2 commit)

**2. [Rule 2 - Missing Critical] Removed stale Phase references from AIOrb file header**
- **Found during:** Task 1 (AIOrb stale comment cleanup)
- **Issue:** Plan called out lines 147-149 and 196-197 specifically, but the file header also contained "Phase 5: AIUX-01, AIUX-02" and "Phase 6: 'review' radial action" references and an inline "Phase 7:" comment
- **Fix:** Removed the two header lines with phase references; replaced "Phase 7:" inline comment with clean text
- **Files modified:** src/ui/components/AIOrb.tsx
- **Verification:** grep -n "Phase [0-9]" shows no matches in AIOrb.tsx
- **Committed in:** f95b08f (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 2 — missing critical/completeness)
**Impact on plan:** Both fixes were necessary for full compliance with the plan's intent. No scope creep.

## Issues Encountered
None — TypeScript pre-existing errors (VoiceCapture, vite.config) were not introduced by this plan. Build succeeds.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- StatusBar, AIOrb, and AtomDetailView tech debt items resolved
- Plan 03 can proceed with settings panel corrections

## Self-Check: PASSED

- FOUND: src/ui/layout/StatusBar.tsx
- FOUND: src/ui/components/AIOrb.tsx
- FOUND: src/ui/views/AtomDetailView.tsx
- FOUND: src/ui/components/MentionAutocomplete.tsx
- FOUND: .planning/phases/11-tech-debt-settings-correction/11-02-SUMMARY.md
- FOUND commit f95b08f (Task 1)
- FOUND commit f494810 (Task 2)

---
*Phase: 11-tech-debt-settings-correction*
*Completed: 2026-03-05*
