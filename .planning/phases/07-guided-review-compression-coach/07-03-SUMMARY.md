---
phase: 07-guided-review-compression-coach
plan: 03
subsystem: ui
tags: [solidjs, staging-area, compression-coach, review-flow, mutation-pipeline]

requires:
  - phase: 07-01
    provides: ReviewFlowStatus, reviewFlowStatus signal, executeStagingAction, ReviewFlowView, ConversationTurnCard
  - phase: 07-02
    provides: generateCompressionExplanations, CompressionExplanation, UPDATE_ATOM/DELETE_ATOM with source+aiRequestId

provides:
  - Ephemeral staging area signals (stagingProposals, addStagingProposal, approveProposal, etc.)
  - StagingProposal types (NewAtomProposal, MutationProposal, DeletionProposal)
  - ReviewStagingArea component — batch proposal review UI
  - CompressionCoachCard component — per-candidate AI explanation with approve/reject
  - Compression coach wiring in transitionToNextPhase (get-current branch)
  - executeStagingAction routes destructive actions to staging during Get Current/Creative
  - completeGuidedReview and cancelGuidedReview clear staging area on session end

affects:
  - Phase 7 review flow (ReviewFlowView renders staging area at end of review)
  - Mutation pipeline (approveProposal dispatches with source: 'ai' + aiRequestId)

tech-stack:
  added: []
  patterns:
    - "Ephemeral staging area: module-level SolidJS signals for proposals, NOT in BinderState — worker reconcile never touches staging state"
    - "approveProposal re-reads atom from state before constructing mutation (avoids stale snapshot — Pitfall 3)"
    - "Destructive actions staged during Get Current/Creative, executed immediately during Get Clear"
    - "Batch display with individual approve/reject + secondary Approve All — never the default action"

key-files:
  created:
    - src/ui/components/CompressionCoachCard.tsx
    - src/ui/components/ReviewStagingArea.tsx
  modified:
    - src/ui/signals/store.ts
    - src/ai/review-flow.ts
    - src/ui/views/ReviewFlowView.tsx
    - src/ui/layout/layout.css

key-decisions:
  - "Staging area as module-level signals (not BinderState) — ephemeral per review session, worker reconcile cannot touch it"
  - "approveProposal re-reads current atom from state before UPDATE_ATOM — avoids stale snapshot pitfall"
  - "Destructive actions (archive, delete) staged during Get Current/Creative; non-destructive (defer, capture) execute immediately"
  - "completeGuidedReview calls clearStagingArea before cancelGuidedReview — ensures proposals cleared even on early exit"
  - "Compression explanations generated in transitionToNextPhase (store.ts) not review-flow.ts — store has both addStagingProposal and state.compressionCandidates access"

patterns-established:
  - "StagingProposal union type: NewAtomProposal | MutationProposal | DeletionProposal — source field distinguishes compression-coach vs review-flow origin"
  - "ReviewStagingArea groups proposals by type: compression-coach section first, then new-atoms, then other changes"

requirements-completed: [AIGN-02]

duration: 9min
completed: 2026-03-02
---

# Phase 7 Plan 03: Staging Area Summary

**Ephemeral staging area with SolidJS signals, batch approve/reject UI, and compression coach integration wiring approved AI mutations through the source: 'ai' pipeline**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-02T19:26:28Z
- **Completed:** 2026-03-02T19:35:24Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Staging area module-level signals (stagingProposals, addStagingProposal, approveProposal, approveAllProposals, clearStagingArea)
- approveProposal dispatches UPDATE_ATOM/DELETE_ATOM with source: 'ai' and aiRequestId through the mutation pipeline
- Compression explanations generated during Get Current phase transition and added as staging proposals
- CompressionCoachCard component with AI explanation, action badge, and approve/reject buttons
- ReviewStagingArea with grouped proposals (compression coach, new atoms, other changes), individual approve/reject, and secondary Approve All action
- ReviewFlowView updated to render ReviewStagingArea during staging status with pending suggestions banner

## Task Commits

Each task was committed atomically:

1. **Task 1: Staging area signals + compression coach wiring** - `376e182` (feat)
2. **Task 2: ReviewStagingArea + CompressionCoachCard + ReviewFlowView + CSS** - `4c68a9e` (feat)

## Files Created/Modified
- `src/ui/signals/store.ts` - StagingProposal types, module-level signals, approveProposal, updated executeStagingAction + completeGuidedReview/cancelGuidedReview
- `src/ai/review-flow.ts` - Updated compression step question text to reference staging area
- `src/ui/components/CompressionCoachCard.tsx` - NEW: per-candidate compression card with AI badge and approve/reject
- `src/ui/components/ReviewStagingArea.tsx` - NEW: batch proposal review UI, grouped by type
- `src/ui/views/ReviewFlowView.tsx` - Updated staging state to render ReviewStagingArea with pending count banner
- `src/ui/layout/layout.css` - Phase 7 staging area CSS (cards, badges, action buttons, empty state, banner)

## Decisions Made
- Staging area as ephemeral module-level signals (not BinderState) — keeps worker reconcile from touching live review flow state (consistent with reviewFlowStatus pattern from 07-01)
- approveProposal re-reads atom from state before constructing UPDATE_ATOM mutation — avoids stale snapshot (research Pitfall 3)
- Destructive actions staged during Get Current/Creative (user reviewable), non-destructive (defer, capture) execute immediately
- Compression explanations generated in transitionToNextPhase in store.ts — this function has both addStagingProposal and state access, keeping review-flow.ts pure
- completeGuidedReview clears staging area before delegating to cancelGuidedReview to ensure proposals are always discarded on session end

## Deviations from Plan

None — plan executed exactly as written. The plan offered two implementation options for compression wiring (review-flow.ts export vs. store.ts inlined) and explicitly chose the store.ts approach; implemented as specified.

## Issues Encountered
None. TypeScript compilation passes (only pre-existing VoiceCapture.tsx SpeechRecognition errors remain, unrelated to this plan).

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Phase 7 is now complete — all three plans executed (GTD review flow + compression coach engine + staging area)
- End-to-end path: start review → walk through phases → proposals accumulate in staging → approve/reject → changelog entries with source: 'ai'
- AIGN-02 delivered: AI-proposed atom changes must be explicitly approved before being committed

---
*Phase: 07-guided-review-compression-coach*
*Completed: 2026-03-02*
