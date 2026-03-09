---
phase: 19-tier-2-clarification-wizard-model
plan: 03
subsystem: ai
tags: [onnx, embedding-worker, triage, clarification, cloud-options, classification-log]

# Dependency graph
requires:
  - phase: 19-tier-2-clarification-wizard-model
    provides: "6 trained ONNX binary classifiers (Plan 01), clarification types and question templates (Plan 02)"
  - phase: 17-tier-2-gtd-classification-models
    provides: "ClassifierConfig registry, sequential ONNX execution pattern"
  - phase: 18-tier-2-next-action-decomposition-model
    provides: "Lazy classifier loading pattern, decomposeAtom pipeline"
provides:
  - "CHECK_COMPLETENESS and CLASSIFY_MISSING_INFO embedding worker handlers with lazy model loading"
  - "Completeness gate in triage cascade (advisory, non-blocking)"
  - "Cloud option generation with 2s timeout and prefetch for tier-adaptive clarification"
  - "Classification log extension with clarification event tracking"
affects: [19-04, 19-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Completeness gate runs after type+GTD classification in triage cascade, advisory only"
    - "Binary classifier scores compared: missing > present determines isMissing"
    - "Cloud option generation with per-request AbortController and 2s timeout"

key-files:
  created:
    - src/ai/clarification/cloud-options.ts
  modified:
    - src/ai/tier2/types.ts
    - src/ai/tier2/tier2-handler.ts
    - src/search/embedding-worker.ts
    - src/ai/triage.ts
    - src/storage/classification-log.ts

key-decisions:
  - "Completeness gate is advisory (sets needsClarification flag, does not block triage flow)"
  - "Missing-info classifier scores use missing > present comparison for binary decision"
  - "Cloud options use 2s timeout with null return as fallback signal to template path"

patterns-established:
  - "Binary classifier inference: compare class scores directly (missing vs present, incomplete vs complete)"
  - "Advisory gate pattern: gate result adds metadata to suggestion but never blocks pipeline"

requirements-completed: [CLAR-03, CLAR-05, CLAR-06]

# Metrics
duration: 7min
completed: 2026-03-09
---

# Phase 19 Plan 03: ONNX Integration and Triage Wiring Summary

**Completeness gate wired into triage cascade with lazy-loaded ONNX classifiers, cloud option generation with 2s timeout, and classification log clarification event tracking**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-09T02:24:30Z
- **Completed:** 2026-03-09T02:31:30Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Wired all 6 ONNX binary classifiers (completeness gate + 5 missing-info) into embedding worker with lazy loading
- Completeness gate runs automatically in triage cascade for all atom types (advisory, non-blocking)
- Cloud option generation provides tier-adaptive enhanced options with 2s timeout and prefetch
- Classification log extended with clarification event fields for self-learning pattern detection

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire ONNX classifiers into embedding worker and tier2 handler** - `edcc407` (feat)
2. **Task 2: Add completeness gate to triage cascade, cloud options, and classification log extension** - `56db6de` (feat)

## Files Created/Modified
- `src/ai/tier2/types.ts` - Added check-completeness and classify-missing-info AITaskType entries with thresholds
- `src/ai/tier2/tier2-handler.ts` - Added classifyCompletenessViaWorker and classifyMissingInfoViaWorker with handle cases
- `src/search/embedding-worker.ts` - Added COMPLETENESS_GATE and MISSING_INFO_CLASSIFIERS configs with lazy loading and message handlers
- `src/ai/triage.ts` - Inserted completeness gate in triage cascade, added clarification fields to TriageSuggestion
- `src/ai/clarification/cloud-options.ts` - New file: generateCloudOptions with 2s timeout and prefetchCloudOptions
- `src/storage/classification-log.ts` - Extended ClassificationEvent with clarification fields, added logClarification helper

## Decisions Made
- Completeness gate is advisory only -- sets needsClarification flag but never blocks the triage pipeline
- Binary classifier decisions use direct score comparison (e.g., incompleteScore > completeScore)
- Cloud options return null on any failure (timeout, parse error, no adapter) -- caller falls back to templates
- Missing-info classifiers load all 5 sequentially on first request (consistent with GTD classifier pattern)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All ONNX classifier infrastructure ready for ClarificationFlow UX (Plan 04)
- Cloud option generation ready to be consumed by modal UI
- Classification log ready to record user clarification interactions
- Triage suggestions now carry needsClarification flag for UI rendering

---
*Phase: 19-tier-2-clarification-wizard-model*
*Completed: 2026-03-09*
