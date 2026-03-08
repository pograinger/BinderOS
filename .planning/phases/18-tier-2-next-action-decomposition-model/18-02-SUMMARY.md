---
phase: 18-tier-2-next-action-decomposition-model
plan: 02
subsystem: ai
tags: [onnx, decomposition, gtd, slot-filling, templates, tier2]

# Dependency graph
requires:
  - phase: 18-tier-2-next-action-decomposition-model
    provides: decomposition.onnx classifier (35 categories), decomposition-classes.json
  - phase: 14-sanitization-classifier
    provides: regex-patterns.ts detectWithRegex for entity extraction
provides:
  - Decomposition pipeline (categories.ts, slot-extractor.ts, decomposer.ts)
  - CLASSIFY_DECOMPOSE embedding worker message handler
  - 'decompose' task type in tier2 handler
affects: [18-03, tier2-handler, store, triage-ui]

# Tech tracking
tech-stack:
  added: []
  patterns: [slot-filled template decomposition, lazy ONNX classifier loading per task type]

key-files:
  created:
    - src/ai/decomposition/categories.ts
    - src/ai/decomposition/slot-extractor.ts
    - src/ai/decomposition/decomposer.ts
  modified:
    - src/ai/tier2/types.ts
    - src/ai/tier2/tier2-handler.ts
    - src/search/embedding-worker.ts

key-decisions:
  - "0.60 confidence threshold for decompose task -- lower than type classification due to 35 classes, acceptable since user-triggered"
  - "Slot extractor reuses sanitization regex-patterns for PERSON/LOCATION -- no duplicate entity detection"
  - "Decomposer is pure function with injected classifyFn -- tier2 handler provides pre-computed ONNX scores"

patterns-established:
  - "Template slot-filling: {topic}, {person}, {location} placeholders with undefined-slot cleanup"
  - "Lazy ONNX classifier per task type: decomposition model loads on first CLASSIFY_DECOMPOSE message"

requirements-completed: [DECOMP-03, DECOMP-04]

# Metrics
duration: 10min
completed: 2026-03-08
---

# Phase 18 Plan 02: Decomposition Runtime Summary

**35-category slot-filled template pipeline turning ONNX-classified patterns into personalized GTD next-action steps via tier2 handler**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-08T20:32:48Z
- **Completed:** 2026-03-08T20:42:36Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- 35 decomposition templates (25 task + 10 decision) with 3-5 GTD-style verb-first action steps each, all matching ONNX classifier labels exactly
- Slot extractor reusing sanitization regex for PERSON/LOCATION entities plus verb-stripping for topic extraction
- Complete decompose pipeline callable via dispatchTiered({ task: 'decompose', features: { content, atomType } })
- Embedding worker lazy-loads decomposition ONNX model on first CLASSIFY_DECOMPOSE request

## Task Commits

Each task was committed atomically:

1. **Task 1: Create decomposition types, categories, and slot extractor** - `515da48` (feat)
2. **Task 2: Wire ONNX classifier into embedding worker and tier2 handler** - `d73c9e9` (feat)

## Files Created/Modified
- `src/ai/decomposition/categories.ts` - 35 DecompositionTemplate definitions with TemplateStep types
- `src/ai/decomposition/slot-extractor.ts` - Entity/topic extraction via sanitization regex + verb stripping
- `src/ai/decomposition/decomposer.ts` - Main pipeline: classify -> template lookup -> slot fill -> return steps
- `src/ai/tier2/types.ts` - Added 'decompose' AITaskType, atomType to TieredFeatures, decomposition to TieredResult
- `src/ai/tier2/tier2-handler.ts` - Added classifyDecomposeViaWorker and decompose case in handle()
- `src/search/embedding-worker.ts` - Added DECOMPOSITION_CLASSIFIER config and CLASSIFY_DECOMPOSE handler

## Decisions Made
- Used 0.60 confidence threshold for decompose task (lower than 0.78 for type classification) because 35-class distribution means lower per-class ceilings, and decomposition is user-triggered so false positives have low cost
- Slot extractor reuses detectWithRegex from sanitization/regex-patterns.ts rather than implementing separate entity detection
- Decomposer receives classifyFn as dependency injection so tier2 handler can pass pre-computed ONNX scores without double inference
- Fallback templates for tasks and decisions when confidence is below threshold or category doesn't match atomType

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Decomposition pipeline ready for UI wiring in Plan 03 ("break this down" button + AIQuestionFlow integration)
- All modules are pure (no store imports) -- ready for store integration in next plan
- Worker message protocol extended -- no breaking changes to existing messages

## Self-Check: PASSED

- All 6 files verified on disk
- Commit 515da48 (Task 1) verified in git log
- Commit d73c9e9 (Task 2) verified in git log
