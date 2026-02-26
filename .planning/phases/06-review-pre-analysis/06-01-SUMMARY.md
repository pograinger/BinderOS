---
phase: 06-review-pre-analysis
plan: 01
subsystem: ai
tags: [analysis, dexie, solidjs, zod, triage, briefing, atoms]

# Dependency graph
requires:
  - phase: 05-triage-ai
    provides: "dispatchAI router, triage pipeline pattern (triage.ts), store orchestration pattern (startTriageInbox)"
  - phase: 04-ai-infra
    provides: "AI adapter router, anyAIAvailable signal, store AI state fields"
provides:
  - "AnalysisAtomSchema in discriminated union (AtomSchema + CreateAtomInputSchema)"
  - "Dexie v4 migration for analysis atom type"
  - "src/ai/analysis.ts with two-phase generateBriefing pipeline"
  - "Store review state (reviewBriefing, reviewStatus, reviewProgress, reviewError)"
  - "startReviewBriefing() / cancelReviewBriefing() orchestrators in store"
  - "Orb Review radial action wired to startReviewBriefing()"
  - "Analysis atoms excluded from WASM scoring and all page queries"
affects:
  - "06-02 (ReviewBriefingView UI rendering)"
  - "Phase 7 compression (analysis atom type can be reused)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two-phase pipeline: sync pre-analysis followed by single AI summary call"
    - "Pure pipeline module with no store imports (mirrors triage.ts pattern)"
    - "AbortController cancellation at pipeline level (reviewAbortController)"
    - "Dynamic import of AIOrb.setOrbState to avoid circular dependencies"
    - "Analysis atoms as first-class Dexie records: persistent, reversible, queryable"

key-files:
  created:
    - "src/ai/analysis.ts"
    - "src/storage/migrations/v4.ts"
  modified:
    - "src/types/atoms.ts"
    - "src/types/messages.ts"
    - "src/storage/db.ts"
    - "src/worker/worker.ts"
    - "src/ui/signals/queries.ts"
    - "src/ui/signals/store.ts"
    - "src/ui/components/AIOrb.tsx"

key-decisions:
  - "Analysis atoms excluded from WASM scoring via filter in flattenAtomLinksForWasm (analysis atoms are AI-generated metadata, not user content to score)"
  - "No Dexie index changes for v4 migration — existing type index already covers the new 'analysis' type value"
  - "generateBriefing uses staleness field from AtomScore (not a .score field which doesn't exist on AtomScore interface)"
  - "AI summary uses single cloud call (max 100 tokens) with fallback template string on failure or abort"
  - "Projects without next actions check only includes sectionItems belonging to the projects section"

patterns-established:
  - "Phase 6 pipeline pattern: pure module (analysis.ts) + store orchestrator (startReviewBriefing) + orb action wiring"
  - "Exclusion filter pattern: a.type !== 'analysis' added as first predicate in all page query memos"
  - "BriefingResult stored in both reactive store state AND as a Dexie analysis atom for persistence"

requirements-completed: [AIGN-01, AIRV-01, AIRV-02]

# Metrics
duration: 9min
completed: 2026-02-25
---

# Phase 6 Plan 01: Review Pre-Analysis — Foundation Summary

**AnalysisAtomSchema in discriminated union, Dexie v4 migration, two-phase generateBriefing pipeline with stale/project/compression pre-analysis + AI summary, and orb Review action wired end-to-end**

## Performance

- **Duration:** 9 min
- **Started:** 2026-02-25T07:30:05Z
- **Completed:** 2026-02-25T07:39:05Z
- **Tasks:** 2
- **Files modified:** 9 (7 modified + 2 created)

## Accomplishments
- Added `analysis` to AtomType enum and created AnalysisAtomSchema in both AtomSchema and CreateAtomInputSchema discriminated unions
- Created Dexie v4 migration (no index changes needed) and registered it in BinderDB constructor
- Built `src/ai/analysis.ts` two-phase pipeline: sync pre-analysis (stale items, projects without next actions, compression candidates) + single AI summary call with fallback
- Extended store BinderState with reviewBriefing, reviewStatus, reviewProgress, reviewError fields
- Created startReviewBriefing() orchestrator with AbortController cancellation, orb state control, and analysis atom creation
- Wired orb 'review' radial action to startReviewBriefing() in AIOrb.tsx
- Added analysis exclusion filters to all 5 page query memos and filteredAndSortedAtoms
- Excluded analysis atoms from WASM scoring via filter in flattenAtomLinksForWasm

## Task Commits

Each task was committed atomically:

1. **Task 1: Analysis atom type schema + Dexie v4 migration + WASM/query exclusion** - `e2520ef` (feat)
2. **Task 2: Analysis pipeline module + store review state + orb Review action wiring** - `8ff73d2` (feat)

**Plan metadata:** (docs commit follows this summary)

## Files Created/Modified
- `src/types/atoms.ts` - Added 'analysis' to AtomType, AnalysisAtomSchema, updated discriminated unions
- `src/types/messages.ts` - Added reviewSession: unknown to READY payload (Plan 02 placeholder)
- `src/storage/migrations/v4.ts` - New Dexie v4 migration (no index changes)
- `src/storage/db.ts` - Import and register applyV4Migration after v3
- `src/worker/worker.ts` - Filter analysis atoms from flattenAtomLinksForWasm
- `src/ui/signals/queries.ts` - Add a.type !== 'analysis' filter to all 5 page query memos and filteredAndSortedAtoms
- `src/ai/analysis.ts` - New two-phase briefing pipeline with generateBriefing export
- `src/ui/signals/store.ts` - Phase 6 review state fields, startReviewBriefing/cancelReviewBriefing, BriefingResult import
- `src/ui/components/AIOrb.tsx` - Import startReviewBriefing, wire 'review' case in handleMenuAction

## Decisions Made
- Analysis atoms excluded from WASM scoring because they are AI-generated metadata records, not user content to score for staleness/priority
- No Dexie index changes for v4 migration — the existing `type` index already handles the new 'analysis' value
- `AtomScore.staleness` (not `.score` which doesn't exist) used as the entropyScore field in BriefingItem
- AI summary uses a single cloud call (max 100 tokens) with a fallback template string if the call fails or is aborted — briefing is still useful without the AI sentence
- Projects-without-next-action check scoped to sectionItems belonging to the projects section only

## Deviations from Plan

None - plan executed exactly as written.

The one fix that was applied inline: the plan spec said `scores[atom.id]?.score` for the BriefingItem entropyScore field, but `AtomScore` has no `.score` field (it has `.staleness`, `.priorityScore`, `.priorityTier`, `.energy`, `.opacity`). Used `.staleness` instead which is the closest analog. This was caught during TypeScript type checking and fixed before committing (Rule 1 - Bug, inline correction).

## Issues Encountered
None - both tasks executed cleanly. All TypeScript errors in the output are pre-existing issues in node_modules (`@mlc-ai/web-llm` missing peer types, `workbox-core` service worker types) and `VoiceCapture.tsx` browser API types from Phase 5. No new errors introduced.

## User Setup Required
None - no external service configuration required. The review briefing pipeline uses the existing cloud AI adapter which requires an API key already set up in Phase 5.

## Next Phase Readiness
- Analysis pipeline is fully functional end-to-end (pending UI rendering in Plan 02)
- `state.reviewBriefing` is reactive and ready for Plan 02 ReviewBriefingView to consume
- `state.reviewStatus` signals allow Plan 02 to show loading/ready/error states
- Analysis atoms are created in Dexie and will appear in state.atoms (filtered from page queries as intended)
- Plan 02 should implement ReviewBriefingView that reads state.reviewBriefing and renders the briefing sections

---
*Phase: 06-review-pre-analysis*
*Completed: 2026-02-25*
