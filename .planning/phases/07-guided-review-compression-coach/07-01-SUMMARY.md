---
phase: 07-guided-review-compression-coach
plan: 01
subsystem: ui
tags: [solidjs, gtd, review-flow, state-machine, typescript]

# Dependency graph
requires:
  - phase: 06-review-pre-analysis
    provides: ReviewBriefingView, ReviewSession, startReviewBriefing, BriefingResult — review foundation this plan extends
  - phase: 05-triage-ai
    provides: AIOrb, store orchestration patterns, dispatchAI router
provides:
  - GTD three-phase review flow state machine (get-clear, get-current, get-creative)
  - ReviewFlowStep queue builder for all three phases
  - ReviewPhaseContext with AI-generated phase summaries for context management
  - store.ts orchestration: startGuidedReview, advanceReviewStep, cancelGuidedReview, completeGuidedReview
  - ConversationTurnCard inline question card component
  - ReviewFlowView full-screen review experience with phase progress dots
  - review-flow page route in MainPane
  - Start Guided Review button in ReviewBriefingView
affects:
  - 07-02-compression-coach
  - 07-03-staging-area

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Phase builder pattern: pure functions returning ReviewFlowStep[] queues — store dequeues them one at a time"
    - "Phase summary generation at phase transitions keeps API token budget bounded (~200 tokens/phase)"
    - "ReviewFlowStatus as ephemeral module-level signal (same pattern as triageSuggestions — not in BinderState)"
    - "AIOrb redirect pattern: check in-progress flow status before starting new briefing"

key-files:
  created:
    - src/types/review.ts
    - src/ai/review-flow.ts
    - src/ui/components/ConversationTurnCard.tsx
    - src/ui/views/ReviewFlowView.tsx
  modified:
    - src/storage/review-session.ts
    - src/ui/signals/store.ts
    - src/ui/layout/MainPane.tsx
    - src/ui/views/ReviewBriefingView.tsx
    - src/ui/components/AIOrb.tsx
    - src/ui/layout/layout.css

key-decisions:
  - "ReviewFlowStatus as ephemeral module-level signal — not in BinderState — prevents worker reconcile from touching flow state"
  - "executeStagingAction executes immediately in Plan 01 — Plan 03 replaces with full staging area"
  - "AIOrb review action checks reviewFlowStatus directly (synchronous import) to redirect mid-flow reviews"
  - "CSS placed in layout.css (not app.css which doesn't exist) — plan referenced wrong path, auto-corrected"

patterns-established:
  - "ReviewFlowStep queue: phase builders are pure functions, store manages dequeue + transitions"
  - "Phase boundary summaries: AI generates ~50-word summaries per phase for context compression"

requirements-completed:
  - AIRV-03

# Metrics
duration: 14min
completed: 2026-03-02
---

# Phase 7 Plan 01: Guided Review Flow Summary

**Forward-only GTD three-phase review flow — Get Clear/Get Current/Get Creative with ConversationTurnCard question steps, AI phase summaries for context management, and store orchestration for startGuidedReview/advanceReviewStep/completeGuidedReview**

## Performance

- **Duration:** 14 min
- **Started:** 2026-03-02T18:59:59Z
- **Completed:** 2026-03-02T19:14:04Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Created complete GTD review flow type system (ReviewPhase, ReviewAction, ReviewPhaseContext, ReviewFlowStep, StagingAction, ReviewStepOption)
- Built three-phase state machine in review-flow.ts: Get Clear (inbox processing), Get Current (stale/project review), Get Creative (someday/area/trigger/pattern/final with AI-generated pattern surfacing)
- Added store orchestration: startGuidedReview builds Get Clear queue from inbox, advanceReviewStep dequeues steps and handles staging actions, transitionToNextPhase generates AI summaries and builds next phase
- Created ConversationTurnCard inline question card with options, descriptions, and optional freeform input
- Created ReviewFlowView with three-phase progress dots, loading state, staging state, and completion state
- Wired review-flow route in MainPane, Start Guided Review button in ReviewBriefingView, AIOrb redirect for in-progress reviews

## Task Commits

1. **Task 1: Review flow types + state machine + ReviewSession extension + store orchestration** - `635897a` (feat)
2. **Task 2: ConversationTurnCard + ReviewFlowView + MainPane routing + ReviewBriefingView button + CSS** - `89c3234` (feat)

## Files Created/Modified

- `src/types/review.ts` - ReviewPhase, ReviewAction, ReviewPhaseContext, ReviewFlowStep, StagingAction, ReviewStepOption types
- `src/ai/review-flow.ts` - buildGetClearSteps, buildGetCurrentSteps, buildGetCreativeSteps, generatePhaseSummary
- `src/ui/components/ConversationTurnCard.tsx` - Inline question card with options and freeform input
- `src/ui/views/ReviewFlowView.tsx` - Full-screen guided review with phase progress dots
- `src/storage/review-session.ts` - Extended with reviewPhase, reviewPhaseContext, reviewCompleted optional fields
- `src/ui/signals/store.ts` - Added Phase 7 review flow signals and orchestration functions
- `src/ui/layout/MainPane.tsx` - Added review-flow route before review route
- `src/ui/views/ReviewBriefingView.tsx` - Added Start Guided Review primary button
- `src/ui/components/AIOrb.tsx` - Added reviewFlowStatus import and redirect logic for in-progress reviews
- `src/ui/layout/layout.css` - Added Phase 7 review flow and ConversationTurnCard CSS

## Decisions Made

- ReviewFlowStatus kept as ephemeral module-level signal (not in BinderState) — worker reconcile must not overwrite live review flow state
- executeStagingAction dispatches mutations immediately in Plan 01 — Plan 03 replaces this with a proper staging area where proposals await user approval
- AIOrb.handleMenuAction is synchronous, so reviewFlowStatus was imported at module level rather than via dynamic import
- CSS added to `src/ui/layout/layout.css` because `src/styles/app.css` referenced in the plan does not exist

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] AIOrb async import in synchronous handler**
- **Found during:** Task 2 (AIOrb update)
- **Issue:** Plan specified `await import('../signals/store')` inside `handleMenuAction` which is a synchronous function — TypeScript error TS1308
- **Fix:** Imported `reviewFlowStatus` directly at file top level (it's already exported from store.ts) and removed the dynamic import
- **Files modified:** src/ui/components/AIOrb.tsx
- **Verification:** TypeScript compilation passes
- **Committed in:** 89c3234 (Task 2 commit)

**2. [Rule 3 - Blocking] CSS file path incorrect in plan**
- **Found during:** Task 2 (CSS addition)
- **Issue:** Plan referenced `src/styles/app.css` which does not exist — all CSS is in `src/ui/layout/layout.css`
- **Fix:** Added CSS to the actual file `src/ui/layout/layout.css`
- **Files modified:** src/ui/layout/layout.css
- **Verification:** File exists and styles are appended at end of file
- **Committed in:** 89c3234 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes required for correctness. No scope creep.

## Issues Encountered

- TypeScript `queue[nextIndex]` returns `ReviewFlowStep | undefined` while `setReviewFlowStep` expects `ReviewFlowStep | null` — fixed with `?? null` coercion

## Next Phase Readiness

- Review flow infrastructure complete for Plan 02 (compression coach with AI explanations per candidate)
- Plan 03 (staging area) can replace executeStagingAction stubs with proposal-based mutations
- Get Creative pattern surfacing calls dispatchAI — requires cloud or browser LLM to be active

---
*Phase: 07-guided-review-compression-coach*
*Completed: 2026-03-02*
