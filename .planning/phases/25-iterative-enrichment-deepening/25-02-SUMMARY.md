---
phase: 25-iterative-enrichment-deepening
plan: 02
subsystem: ai
tags: [enrichment, iterative-deepening, cognitive-signals, follow-up-questions, depth-tracking]

requires:
  - phase: 25-iterative-enrichment-deepening
    plan: 01
    provides: EnrichmentSession extensions (categoryDepth, cognitiveSignals), generateFollowUpOptions, MAX_ENRICHMENT_DEPTH

provides:
  - Depth-aware createEnrichmentSession with depthMap and cognitiveSignals params
  - Signal-guided question priority ordering via SIGNAL_CATEGORY_MAP
  - Follow-up question generation for answered categories below MAX_ENRICHMENT_DEPTH
  - applyAnswer with categoryDepth increment and duplicate answer replacement
  - Backward-compatible behavior when depthMap not provided

affects: [25-03 UI integration]

tech-stack:
  added: []
  patterns: [signal-to-category relevance mapping, depth-gated follow-up generation, answer deduplication by category]

key-files:
  created: []
  modified:
    - src/ai/enrichment/enrichment-engine.ts
    - src/ai/enrichment/enrichment-engine.test.ts

key-decisions:
  - "Backward compat: without depthMap, answered categories treated as MAX_DEPTH (skipped) to preserve existing caller behavior"
  - "SIGNAL_CATEGORY_MAP maps 7 cognitive models to 5 enrichment categories for relevance scoring"
  - "Signal relevance = sum of (1 - confidence) for mapped signals; higher = more uncertain = ask first"
  - "applyAnswer replaces existing answer for same category via findIndex, not append"

patterns-established:
  - "Signal-guided question ordering: computeSignalRelevance scores categories by cognitive signal uncertainty"
  - "depthMap activation pattern: explicit param triggers deepening, absence preserves legacy behavior"

requirements-completed: [ITER-01, ITER-04]

duration: 3min
completed: 2026-03-10
---

# Phase 25 Plan 02: Engine Wiring for Iterative Enrichment Summary

**Depth-aware enrichment engine with signal-guided question priority, follow-up generation for answered categories, and duplicate-free answer replacement**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-10T07:49:27Z
- **Completed:** 2026-03-10T07:52:30Z
- **Tasks:** 1 (TDD: RED-GREEN)
- **Files modified:** 2

## Accomplishments
- Wired iterative deepening into createEnrichmentSession: depthMap activates follow-up generation for answered categories below MAX_ENRICHMENT_DEPTH
- Added SIGNAL_CATEGORY_MAP and computeSignalRelevance for cognitive signal-guided question ordering
- Updated applyAnswer to increment categoryDepth and replace (not duplicate) answers for same category
- All 36 tests pass (28 existing + 8 new), all 99 enrichment tests pass across 8 test files

## Task Commits

Each task was committed atomically (TDD: RED then GREEN):

1. **Task 1: Depth-aware session creation with signal-guided priority**
   - `ac89565` (test: RED - 10 failing tests for iterative deepening)
   - `f8414e0` (feat: GREEN - implement depth-aware engine wiring)

## Files Created/Modified
- `src/ai/enrichment/enrichment-engine.ts` - Added depthMap/cognitiveSignals params, SIGNAL_CATEGORY_MAP, computeSignalRelevance, follow-up generation, answer dedup in applyAnswer
- `src/ai/enrichment/enrichment-engine.test.ts` - Added 10 tests: follow-up generation, maxDepth cutoff, mixed questions, prior answer in text, depth init, signals storage, signal reordering, default ordering, depth increment, answer replacement

## Decisions Made
- Without depthMap, answered categories treated as MAX_ENRICHMENT_DEPTH for backward compatibility -- existing callers that don't pass depthMap still skip answered categories
- SIGNAL_CATEGORY_MAP maps 7 of 10 cognitive models to enrichment categories (3 models have no direct category mapping: emotional-valence, information-lifecycle, review-cadence)
- Signal relevance scoring uses (1 - confidence) sum -- low-confidence signals indicate uncertainty, making those categories more valuable to ask about
- applyAnswer uses findIndex to replace existing answers for same category rather than always appending

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Engine fully wired for iterative deepening, ready for Plan 03 (UI integration)
- UI can pass depthMap from InboxItem.enrichmentDepth and cognitiveSignals from cached signal vector
- Session categoryDepth updates flow through immutably, ready for persistence in store

## Self-Check: PASSED

All 2 key files verified present. All 2 commits verified in git log.

---
*Phase: 25-iterative-enrichment-deepening*
*Completed: 2026-03-10*
