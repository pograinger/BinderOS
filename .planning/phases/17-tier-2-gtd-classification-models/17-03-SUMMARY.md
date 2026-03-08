---
phase: 17-tier-2-gtd-classification-models
plan: 03
subsystem: ai, ui
tags: [onnx, gtd, triage-ui, classification-log, badges]

# Dependency graph
requires:
  - phase: 17-tier-2-gtd-classification-models
    plan: 02
    provides: "CLASSIFY_GTD worker message, GTD cascade in triage, TriageSuggestion GTD fields"
provides:
  - "GTD routing/context/project badges on triage cards with confidence indicators"
  - "Extended ClassificationEvent with GTD correction fields"
  - "exportClassificationJSONL() for retraining data accumulation"
  - "Fix: ONNX wasmPaths object form for Vite worker compatibility"
  - "Fix: Sequential GTD classifier execution (single-threaded WASM constraint)"
affects: [triage-ui, classification-log, embedding-worker]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Sequential ONNX inference for single-threaded WASM backend", "Object-form wasmPaths for Vite worker compatibility"]

key-files:
  created: []
  modified:
    - src/storage/classification-log.ts
    - src/ui/components/InboxAISuggestion.tsx
    - src/ui/layout/layout.css
    - src/ui/views/InboxView.tsx
    - src/search/embedding-worker.ts

key-decisions:
  - "wasmPaths must use object form { wasm } not string '/' — string form bypasses ORT inline bundled WASM glue and triggers dynamic import() that fails in Vite workers"
  - "GTD classifiers run sequentially not via Promise.all — ONNX Runtime single-threaded WASM errors with 'Session already started' on concurrent sessions"
  - "Context tag labels include @ prefix from classifier (e.g., '@phone') — UI template must not add duplicate @"

patterns-established:
  - "Sequential ONNX classifier execution pattern for single-threaded WASM backend"

requirements-completed: [GTD-07, GTD-08]

# Metrics
duration: ~45min (including debugging ONNX WASM issues)
completed: 2026-03-08
---

# Phase 17 Plan 03: GTD Triage Card Display & Correction Logging Summary

**GTD classification badges on triage cards with ONNX WASM backend fixes for Vite worker compatibility and sequential classifier execution**

## Performance

- **Duration:** ~45 min (significant debugging of ONNX WASM issues)
- **Started:** 2026-03-08
- **Completed:** 2026-03-08
- **Tasks:** 2 (1 auto + 1 human-verify)
- **Files modified:** 5

## Accomplishments
- GTD routing badges (blue), context tag badges (green), and project badges (purple) on triage cards
- Low-confidence "?" suffix with muted styling on all badge types
- Extended ClassificationEvent with GTD fields for retraining data
- exportClassificationJSONL() for training pipeline
- Fixed ONNX WASM backend: object-form wasmPaths prevents failed dynamic import() in Vite workers
- Fixed concurrent session error: sequential GTD classifier execution
- Fixed double-@ in context tag display

## Task Commits

1. **Task 1: Extend classification-log and display GTD on triage cards** - `accebee` (feat)
2. **Bug fixes: ONNX WASM backend, sequential inference, double-@** - `95b2407` (fix)

## Files Created/Modified
- `src/storage/classification-log.ts` - GTD fields on ClassificationEvent, exportClassificationJSONL()
- `src/ui/components/InboxAISuggestion.tsx` - GTD badge rendering for confident and ambiguous paths
- `src/ui/layout/layout.css` - GTD badge styles (routing=blue, context=green, project=purple)
- `src/ui/views/InboxView.tsx` - Wire GTD fields into logClassification()
- `src/search/embedding-worker.ts` - wasmPaths fix, sequential classifier execution

## Decisions Made
- ONNX Runtime wasmPaths MUST use object form in Vite workers (string form triggers broken dynamic import)
- Sequential classifier execution required for single-threaded WASM backend
- Context tag classifier labels include @ prefix — no duplication needed in UI

## Deviations from Plan
- Three runtime bugs discovered during human verification required additional fixes (wasmPaths, concurrent sessions, double-@)

## Issues Encountered
- ONNX WASM backend failed to initialize in Vite workers due to string-form wasmPaths triggering dynamic import() of .mjs file
- Promise.all on 4 ONNX sessions caused "Session already started" / "Session mismatch" errors
- Context tag labels from classifier already include @ prefix, causing @@phone display

## User Setup Required
None.

## Self-Check: PASSED

All 5 modified files exist. Both commits verified (accebee, 95b2407). SUMMARY.md created.

---
*Phase: 17-tier-2-gtd-classification-models*
*Completed: 2026-03-08*
