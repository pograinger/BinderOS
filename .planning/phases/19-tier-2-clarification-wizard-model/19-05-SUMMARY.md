---
phase: 19-tier-2-clarification-wizard-model
plan: 05
subsystem: ai
tags: [self-learning, option-ranking, skip-patterns, clarification, classification-log, solidjs]

# Dependency graph
requires:
  - phase: 19-tier-2-clarification-wizard-model
    provides: "ClarificationFlow UI and triage integration (Plan 04), ONNX classifiers and cloud options (Plan 03)"
provides:
  - "Frequency-based option ranking that promotes most-selected options to top positions"
  - "Category skip pattern tracking that deprioritizes frequently-skipped categories"
  - "Freeform entry promotion for entries appearing 3+ times"
  - "End-to-end verified clarification wizard flow"
affects: [23-cloud-tutored-reinforcement]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Self-learning ranking loads classification history once at startClarification, applies per-question"
    - "Cloud options bypass ranking (already contextual) -- only template options get ranked"
    - "70% skip threshold with minimum 5 interactions before deprioritization activates"

key-files:
  created:
    - src/ai/clarification/option-ranking.ts
  modified:
    - src/ui/components/ClarificationFlow.tsx
    - src/ui/signals/store.ts

key-decisions:
  - "Cloud options are NOT ranked -- they are already contextual from LLM generation"
  - "Freeform entries promoted at 3+ occurrences for manual retraining export, not permanent auto-promotion"
  - "Skip pattern deprioritization requires >70% skip rate AND >5 total clarifications (cold start guard)"

patterns-established:
  - "Self-learning loop: log events -> analyze frequency -> rank options -> present to user -> log again"

requirements-completed: [CLAR-06]

# Metrics
duration: 8min
completed: 2026-03-09
---

# Phase 19 Plan 05: Self-Learning Option Ranking Summary

**Frequency-based option ranking and skip-pattern tracking for clarification wizard with end-to-end verified flow**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-09T02:30:00Z
- **Completed:** 2026-03-09T02:38:00Z
- **Tasks:** 2 (1 auto + 1 human-verify)
- **Files modified:** 3

## Accomplishments
- Option ranking module sorts template options by historical selection frequency, promoting most-chosen answers to top
- Skip pattern tracking deprioritizes categories skipped >70% of the time (with cold-start guard requiring 5+ interactions)
- Freeform entries appearing 3+ times are promoted into the option list for manual retraining export
- ClarificationFlow integration loads history once and applies ranking per question
- End-to-end clarification wizard verified by user: vague atom -> triage flag -> Clarify button -> modal -> questions -> enrichment -> re-triage -> self-learning

## Task Commits

Each task was committed atomically:

1. **Task 1: Create option ranking module and integrate with ClarificationFlow** - `459b50e` (feat)
2. **Task 2: Verify complete clarification wizard end-to-end** - human-verify checkpoint (approved, no code changes)

## Files Created/Modified
- `src/ai/clarification/option-ranking.ts` - Pure module: rankOptions, getSkipPatterns, shouldDeprioritizeCategory
- `src/ui/components/ClarificationFlow.tsx` - Integrated ranking into startClarification and question rendering
- `src/ui/signals/store.ts` - Ensured freeform answers included in classification log events

## Decisions Made
- Cloud options bypass ranking since they are already contextual from LLM generation
- Freeform promotion threshold set at 3 occurrences (for correction JSONL export, not permanent auto-add)
- Skip deprioritization requires both >70% skip rate and >5 total clarifications to avoid cold-start false positives

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 19 (Tier 2 Clarification Wizard Model) is now fully complete with all 5 plans executed
- Self-learning loop is ready for phase 23 (cloud-tutored reinforcement) to enhance with deeper GTD reasoning
- User noted the flow will be "even more fruitful when the local models are extensively reasoned" (planned for phase 23)

---
*Phase: 19-tier-2-clarification-wizard-model*
*Completed: 2026-03-09*

## Self-Check: PASSED
- All 3 files verified present on disk
- Commit 459b50e verified in git history
