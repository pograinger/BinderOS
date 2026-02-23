---
phase: 04-ai-infrastructure
plan: "04"
subsystem: ai
tags: [noop-adapter, ai-router, dispatchAI, browser-worker, main-thread, round-trip-verification]

# Dependency graph
requires:
  - phase: 04-ai-infrastructure
    provides: "NoOpAdapter, AIAdapter interface, dispatchAI router, dispatchAICommand in store.ts"
provides:
  - "Main-thread NoOpAdapter initialization fixing the main-thread router activeAdapter=null bug"
  - "Dev-only round-trip test proof: dispatchAICommand() -> dispatchAI() -> NoOpAdapter.execute() succeeds"
  - "Worker-side NoOpAdapter init removed — no longer confuses architectural split"
affects: [05-triage, 06-review, 07-compression]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Main-thread adapter initialization: setActiveAdapter() called in App.tsx onMount (not in worker)"
    - "Dev-only round-trip proof: import.meta.env.DEV guard for startup verification dispatches"

key-files:
  created: []
  modified:
    - src/app.tsx
    - src/worker/worker.ts

key-decisions:
  - "[04-04]: NoOpAdapter must be initialized on the main thread (app.tsx onMount) not in the BinderCore worker — browser workers and the main thread have separate module registries, so setActiveAdapter() in the worker never affected the main-thread router instance that store.ts imports"
  - "[04-04]: Dev-only dispatchAICommand test dispatch added to app.tsx onMount behind import.meta.env.DEV guard — Vite tree-shakes it from production builds, proving round-trip without shipping debug code"

patterns-established:
  - "Worker module scope isolation: never call setActiveAdapter() in the BinderCore worker expecting it to affect the main thread"

requirements-completed: [AINF-01, AINF-05]

# Metrics
duration: 5min
completed: 2026-02-23
---

# Phase 4 Plan 04: AI Infrastructure Gap Closure Summary

**Main-thread NoOpAdapter initialization fixing the activeAdapter=null bug, with dev-only round-trip proof that dispatchAICommand() completes end-to-end without "No AI adapter available" error**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-23T12:54:02Z
- **Completed:** 2026-02-23T12:59:11Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Fixed the architectural split where NoOpAdapter was initialized in the worker module scope but dispatchAICommand() runs in the main-thread module scope — they are separate JS module registries, so the worker-side setActiveAdapter() call never set the adapter the main thread router uses
- Added setActiveAdapter(new NoOpAdapter()) in App.tsx onMount (after initWorker()) so the main-thread router has a working adapter immediately
- Added dev-only dispatchAICommand('Phase 4 round-trip test') dispatch behind import.meta.env.DEV guard — logs success/failure to console, proves the full pipeline, tree-shaken from production
- Removed the now-redundant worker-side setActiveAdapter/NoOpAdapter call and imports from worker.ts to prevent future confusion about where adapter initialization belongs

## Task Commits

1. **Task 1: Move NoOpAdapter initialization to main thread and add dev-only round-trip test** - `156ff64` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/app.tsx` - Added setActiveAdapter(new NoOpAdapter()) and dev-only round-trip test dispatch in onMount; added imports for setActiveAdapter, NoOpAdapter, dispatchAICommand
- `src/worker/worker.ts` - Removed setActiveAdapter/NoOpAdapter imports and INIT call; updated Phase 4 header comment to reflect fix

## Decisions Made
- NoOpAdapter initialized on main thread in app.tsx onMount rather than in the BinderCore worker: browser workers have their own module registry isolated from the main thread, so the worker-side call silently did nothing for main-thread dispatch
- Dev-only dispatchAICommand guard uses import.meta.env.DEV (Vite constant) so the test dispatch is tree-shaken out of production bundles completely

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing build warning: workbox PWA plugin fails with "ort-wasm-simd-threaded.jsep.wasm is 21.6 MB, exceeds 2 MiB precache limit" — this is unrelated to this plan and existed before these changes (confirmed by testing against clean git state). The Vite JS build itself succeeds (`built in 7.64s`).
- Pre-existing TypeScript errors: node_modules type declaration issues (workbox, @huggingface/transformers) and VoiceCapture.tsx SpeechRecognition types — all pre-existing and unrelated to this plan.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 4 success criterion 3 is now satisfied: the AI round-trip proof ("AI round-trip verified: NoOp adapter responded") will appear in the browser dev console on startup
- The main-thread router is correctly initialized and ready for Phase 5 to swap in BrowserAdapter or CloudAdapter via setActiveAdapter()
- No blockers for Phase 5 (Triage) from this plan

## Self-Check: PASSED

All files verified present. Commit 156ff64 confirmed in git history.

---
*Phase: 04-ai-infrastructure*
*Completed: 2026-02-23*
