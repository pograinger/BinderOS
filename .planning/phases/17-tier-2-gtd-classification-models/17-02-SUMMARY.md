---
phase: 17-tier-2-gtd-classification-models
plan: 02
subsystem: ai
tags: [onnx, embedding-worker, tier2, gtd, classifier-registry, triage-cascade]

# Dependency graph
requires:
  - phase: 17-tier-2-gtd-classification-models
    plan: 01
    provides: "Four trained ONNX classifiers (gtd-routing, actionability, project-detection, context-tagging)"
  - phase: 10-browser-inference
    provides: "Embedding worker, ONNX inference path, tier2-handler pattern"
provides:
  - "Classifier registry pattern in embedding worker (ClassifierConfig interface)"
  - "CLASSIFY_GTD worker message: embed once, run 4 ONNX classifiers on same 384-dim vector"
  - "Lazy GTD model loading (zero memory until first classify-gtd request)"
  - "GTD confidence thresholds per classifier (0.70, 0.80, 0.75, 0.65)"
  - "Triage cascade: type -> GTD classifiers for task atoms only"
  - "GtdClassification interface with routing, actionability, project, context results"
affects: [17-03, store, triage-ui, classification-log]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Classifier registry with lazy loading", "Single-embedding multi-classifier inference", "Non-fatal cascade (GTD failure preserves type result)"]

key-files:
  created: []
  modified:
    - src/ai/tier2/types.ts
    - src/search/embedding-worker.ts
    - src/ai/tier2/tier2-handler.ts
    - src/ai/triage.ts

key-decisions:
  - "Classifier registry pattern replaces single-session globals; TYPE_CLASSIFIER loads eagerly, GTD_CLASSIFIERS load lazily"
  - "Cache version bumped to v2; cleanOldCaches() handles migration automatically"
  - "GTD cascade is non-fatal: type classification result preserved even if GTD classifiers fail"
  - "Overall GTD confidence = minimum across all available classifiers (conservative)"

patterns-established:
  - "ClassifierConfig interface: reusable for future ONNX classifiers (name, modelPath, classesPath, session, classMap, loading)"
  - "runClassifierOnEmbedding(): generic ONNX inference on pre-computed embedding vector"
  - "Cascade pattern in triage: conditional dispatch based on prior classification result"

requirements-completed: [GTD-05, GTD-06]

# Metrics
duration: 7min
completed: 2026-03-07
---

# Phase 17 Plan 02: GTD Browser Runtime Integration Summary

**Classifier registry pattern in embedding worker with lazy-loaded GTD ONNX models, tier2 handler for classify-gtd, and triage cascade that runs 4 GTD classifiers on task atoms using a single shared embedding vector**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-07T05:24:26Z
- **Completed:** 2026-03-07T05:31:36Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Refactored embedding worker from single-classifier globals to ClassifierConfig registry pattern
- Added CLASSIFY_GTD message handler: embeds text once, runs all 4 GTD classifiers on the same 384-dim vector
- Wired classify-gtd task through tier2-handler with per-classifier confidence thresholds
- Added triage cascade: type classification first, then GTD classifiers for tasks only (non-fatal)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend types and embedding worker for multi-classifier GTD inference** - `ab305ad` (feat)
2. **Task 2: Wire GTD classification into tier2-handler and triage cascade** - `56dcb58` (feat)

## Files Created/Modified
- `src/ai/tier2/types.ts` - Added classify-gtd task type, GTD_CONFIDENCE_THRESHOLDS, GtdClassification interface, gtd field on TieredResult
- `src/search/embedding-worker.ts` - Classifier registry pattern, lazy GTD loading, CLASSIFY_GTD handler, runClassifierOnEmbedding()
- `src/ai/tier2/tier2-handler.ts` - classify-gtd handler with classifyGtdViaWorker(), per-classifier score processing
- `src/ai/triage.ts` - GTD fields on TriageSuggestion, cascade logic dispatching classify-gtd for tasks

## Decisions Made
- Used classifier registry pattern (ClassifierConfig) instead of per-classifier separate globals -- scales to future classifiers
- Cache version bumped to v2 to invalidate old single-classifier cache entries
- GTD cascade is non-fatal: type classification result is always preserved even if GTD classifiers fail to load or error
- Overall GTD confidence uses minimum across classifiers (conservative approach flags lowest confidence)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 4 GTD classifiers wired end-to-end: worker -> tier2-handler -> triage pipeline
- TriageSuggestion now carries GTD fields for UI display in Phase 17-03
- GtdClassification interface available for store signals and classification logging

---
*Phase: 17-tier-2-gtd-classification-models*
*Completed: 2026-03-07*
