---
phase: 25-iterative-enrichment-deepening
plan: 01
subsystem: ai
tags: [enrichment, maturity, iterative-deepening, dexie-migration, question-templates]

requires:
  - phase: 24-unified-enrichment-wizard
    provides: EnrichmentSession, maturity scoring, question templates, Dexie v7

provides:
  - Extended EnrichmentSession with categoryDepth, cognitiveSignals, activeDeepening
  - InboxItemSchema enrichmentDepth field with Dexie v8 migration
  - followUpTemplates in gtd-personal.json for all 5 categories with {prior_answer} slots
  - generateFollowUpOptions function for depth 2+ question generation
  - computeDepthWeightedMaturity function for proportional depth scoring

affects: [25-02 engine wiring, 25-03 UI]

tech-stack:
  added: []
  patterns: [depth-weighted scoring, follow-up template slot filling with prior_answer]

key-files:
  created:
    - src/storage/migrations/v8.ts
    - src/ai/clarification/question-templates.test.ts
    - src/ai/enrichment/types.test.ts
    - src/ai/enrichment/schema.test.ts
    - src/ai/enrichment/binder-config.test.ts
  modified:
    - src/ai/enrichment/types.ts
    - src/types/atoms.ts
    - src/storage/db.ts
    - src/config/binder-types/gtd-personal.json
    - src/config/binder-types/index.ts
    - src/ai/clarification/question-templates.ts
    - src/ai/enrichment/maturity.ts
    - src/ai/enrichment/enrichment-engine.ts
    - src/worker/handlers/inbox.ts
    - src/storage/import.ts
    - src/dev/import-binder.ts

key-decisions:
  - "SignalVector re-exported from enrichment types.ts for downstream convenience"
  - "v8 migration backfills enrichmentDepth from maturityFilled (depth=1 for answered categories)"
  - "followUpTemplates use {prior_answer} + {freeform} sentinel pattern matching existing questionTemplates"
  - "computeDepthWeightedMaturity separate from computeMaturity for backward compatibility"

patterns-established:
  - "Follow-up templates: {prior_answer} slot in question text and options for iterative deepening"
  - "Depth-weighted scoring: min(depth, maxDepth) / maxDepth per category, averaged over 5 categories"

requirements-completed: [ITER-01, ITER-02, ITER-03, ITER-07]

duration: 9min
completed: 2026-03-10
---

# Phase 25 Plan 01: Data Model & Templates for Iterative Enrichment Summary

**Per-category depth tracking, follow-up question templates with {prior_answer} slots, and depth-weighted maturity scoring for iterative enrichment deepening**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-10T07:36:41Z
- **Completed:** 2026-03-10T07:46:04Z
- **Tasks:** 2 (TDD: RED-GREEN each)
- **Files modified:** 16

## Accomplishments
- Extended EnrichmentSession with categoryDepth, cognitiveSignals, activeDeepening fields
- Added enrichmentDepth to InboxItemSchema with Dexie v8 migration (backfills from maturityFilled)
- Created followUpTemplates for all 5 GTD categories with {prior_answer} context-aware questions
- Implemented generateFollowUpOptions with template-based and generic fallback paths
- Implemented computeDepthWeightedMaturity for proportional 0-1 scoring by depth

## Task Commits

Each task was committed atomically (TDD: RED then GREEN):

1. **Task 1: Extend types, schema, migration, and follow-up templates**
   - `9af797c` (test: RED - failing tests for types and schema)
   - `d966292` (feat: GREEN - implement all type/schema/migration/template changes)

2. **Task 2: Follow-up question generator and depth-weighted maturity**
   - `3a2c5ec` (test: RED - failing tests for generator and maturity)
   - `7fc17c4` (feat: GREEN - implement generateFollowUpOptions and computeDepthWeightedMaturity)

## Files Created/Modified
- `src/ai/enrichment/types.ts` - Added categoryDepth, cognitiveSignals, activeDeepening, MAX_ENRICHMENT_DEPTH
- `src/types/atoms.ts` - Added enrichmentDepth to InboxItemSchema
- `src/storage/migrations/v8.ts` - New v8 migration for enrichmentDepth backfill
- `src/storage/db.ts` - Wired applyV8Migration
- `src/config/binder-types/gtd-personal.json` - Added followUpTemplates for all 5 categories
- `src/config/binder-types/index.ts` - Extended BinderTypeConfig with optional followUpTemplates
- `src/ai/clarification/question-templates.ts` - Added generateFollowUpOptions function
- `src/ai/enrichment/maturity.ts` - Added computeDepthWeightedMaturity function
- `src/ai/enrichment/enrichment-engine.ts` - Updated createEnrichmentSession with new fields
- `src/worker/handlers/inbox.ts` - Added enrichmentDepth to inbox item creation
- `src/storage/import.ts` - Added enrichmentDepth to import path
- `src/dev/import-binder.ts` - Added enrichmentDepth to dev import path

## Decisions Made
- SignalVector re-exported from enrichment types.ts for downstream convenience
- v8 migration backfills enrichmentDepth from maturityFilled (depth=1 for answered categories)
- followUpTemplates use {prior_answer} + {freeform} sentinel pattern matching existing questionTemplates
- computeDepthWeightedMaturity kept separate from computeMaturity for backward compatibility

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added enrichmentDepth to inbox item creation sites**
- **Found during:** Task 2 (TypeScript compilation verification)
- **Issue:** Three files construct InboxItems without the new enrichmentDepth field: inbox.ts handler, import.ts, import-binder.ts
- **Fix:** Added `enrichmentDepth: {}` to all three creation sites
- **Files modified:** src/worker/handlers/inbox.ts, src/storage/import.ts, src/dev/import-binder.ts
- **Verification:** TypeScript compiles without new errors
- **Committed in:** 7fc17c4 (Task 2 GREEN commit)

**2. [Rule 3 - Blocking] Updated createEnrichmentSession and graduation test helper**
- **Found during:** Task 1 (TypeScript compilation)
- **Issue:** Existing createEnrichmentSession and graduation.test.ts makeSession lacked new required fields
- **Fix:** Added categoryDepth: {}, cognitiveSignals: null, activeDeepening: null to both
- **Files modified:** src/ai/enrichment/enrichment-engine.ts, src/ai/enrichment/graduation.test.ts
- **Verification:** All 82 enrichment tests pass
- **Committed in:** d966292 (Task 1 GREEN commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 blocking)
**Impact on plan:** Both fixes required for TypeScript compilation after adding required fields. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All data model extensions ready for Plan 02 (engine wiring)
- followUpTemplates and generateFollowUpOptions ready for enrichment engine integration
- computeDepthWeightedMaturity ready to replace binary maturity in enrichment flow
- Plan 03 (UI) can reference categoryDepth and activeDeepening from session state

## Self-Check: PASSED

All 8 key files verified present. All 4 commits verified in git log.

---
*Phase: 25-iterative-enrichment-deepening*
*Completed: 2026-03-10*
