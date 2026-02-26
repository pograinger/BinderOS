---
phase: 06-review-pre-analysis
plan: 02
subsystem: ui
tags: [review, solidjs, dexie, session-persistence, frosted-glass, orb, briefing]

# Dependency graph
requires:
  - phase: 06-review-pre-analysis
    plan: 01
    provides: "state.reviewBriefing, state.reviewStatus, state.reviewProgress, startReviewBriefing, cancelReviewBriefing, BriefingResult, BriefingItem"
provides:
  - "ReviewBriefingView full-screen briefing with frosted glass cards and inline quick actions"
  - "src/storage/review-session.ts: saveReviewSession, loadReviewSession, clearReviewSession, ReviewSession"
  - "Session persistence via Dexie config table (review-session key)"
  - "24-hour session resume with state restoration (expandedIds, addressedIds, scrollPosition)"
  - "Orb badge dot (ai-orb-review-badge) when pending review session exists"
  - "pruneOldBriefings() retention cleanup (keep 4 most recent analysis atoms)"
  - ".analysis-card frosted glass CSS class shared by all AI analysis artifacts"
affects:
  - "Phase 7 compression (can reuse .analysis-card CSS and BriefingSection pattern)"
  - "MainPane: review route now renders ReviewBriefingView (not ReviewView)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Local signals (createSignal<Set<string>>) for expandedIds and addressedIds — ephemeral UI state kept in component"
    - "onMount session hydration pattern: read state.reviewSession and restore local signals"
    - "Debounced scroll persistence (500ms) via updateReviewSession"
    - "pruneOldBriefings: async Dexie query before CREATE_ATOM for retention cleanup"
    - "Orb badge dot: Show component gated on reviewSession != null and orbState !== 'expanded'"

key-files:
  created:
    - "src/ui/views/ReviewBriefingView.tsx"
    - "src/storage/review-session.ts"
  modified:
    - "src/ui/layout/MainPane.tsx"
    - "src/ui/layout/layout.css"
    - "src/ui/signals/store.ts"
    - "src/ui/components/AIOrb.tsx"

key-decisions:
  - "Session hydration happens async after READY (loadReviewSession().then) not via worker READY payload — consistent with how other UI state is managed, avoids worker complexity"
  - "AIOrb resume path: since READY handler already sets reviewBriefing+reviewStatus from session, the orb review action only needs setActivePage('review') when session exists"
  - "pruneOldBriefings uses dynamic import of db to avoid circular dep at module init — same pattern as existing dynamic imports in store"
  - "REVIEW_SESSION_STALE_MS (24h) imported from review-session.ts in ReviewBriefingView to keep the constant in one place"

patterns-established:
  - "Frosted glass card: .analysis-card with backdrop-filter: blur(12px) + blue border — shared CSS class for all AI-generated content"
  - "BriefingSection helper component pattern: reusable card with header, items, chips, expand, and action buttons"
  - "Session restore on mount + debounced scroll persistence pattern for review-like views"

requirements-completed: [AIRV-02, AIRV-05, AIGN-01]

# Metrics
duration: 6min
completed: 2026-02-26
---

# Phase 6 Plan 02: ReviewBriefingView UI, Session Persistence, Orb Badge Summary

**Full-screen frosted glass review briefing view with inline quick actions, 24-hour session resume restoring all interaction state, and orb badge dot for pending reviews**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-26T01:45:13Z
- **Completed:** 2026-02-26T01:51:00Z
- **Tasks:** 2
- **Files modified:** 6 (4 modified + 2 created)

## Accomplishments

- Created `ReviewBriefingView.tsx` (373 lines): full-screen briefing with loading, error, ready, and idle states
- Three frosted glass sectioned cards: stale items (with chips for staleness, links, entropy), projects missing next actions, compression candidates
- `BriefingSection` helper component renders each card with item expand/collapse, metadata chips, addressed state, and quick action buttons
- Quick actions: Defer (updates updated_at), Archive (sets status archived), Add Next Action (creates inbox item)
- Session restore on mount from `state.reviewSession`: restores expandedIds, addressedIds, scroll position
- Stale session (>24h) warning banner with "Start Fresh" button
- "Finish Review" button clears session and navigates to inbox
- Created `src/storage/review-session.ts`: direct Dexie config table access, following ai-settings.ts pattern
- Added `reviewSession: ReviewSession | null` to BinderState and initialState
- Session hydrated on READY via `loadReviewSession().then(...)` in store READY handler
- Session saved on briefing completion in `startReviewBriefing()`
- Exported `updateReviewSession()` and `finishReviewSession()` from store
- Added `pruneOldBriefings()` (retention: 4 most recent analysis atoms)
- Updated MainPane `review` route to `ReviewBriefingView` (commented out old ReviewView import)
- Added `.analysis-card` frosted glass CSS + `.ai-orb-review-badge` and all briefing UI classes to layout.css
- AIOrb: `hasPendingReview()` signal, badge dot Show component, updated `primaryAction()` and review action handler

## Task Commits

1. **Task 1+2: ReviewBriefingView + MainPane + CSS + review-session.ts + store session** - `88c8197` (feat)
2. **Task 2: AIOrb badge dot and review resume logic** - `c0cb31c` (feat)

**Plan metadata:** (docs commit follows this summary)

## Files Created/Modified

- `src/ui/views/ReviewBriefingView.tsx` - New full-screen briefing view (373 lines)
- `src/storage/review-session.ts` - Session persistence module (Dexie config table)
- `src/ui/layout/MainPane.tsx` - Route 'review' to ReviewBriefingView
- `src/ui/layout/layout.css` - Phase 6 frosted glass CSS (.analysis-card, .briefing-*, .ai-orb-review-badge)
- `src/ui/signals/store.ts` - reviewSession state, hydration, updateReviewSession, finishReviewSession, pruneOldBriefings, session save in startReviewBriefing
- `src/ui/components/AIOrb.tsx` - hasPendingReview, badge dot, updated primaryAction, review resume logic

## Decisions Made

- Session hydration loads async after READY (not via worker payload) — keeps worker simple and consistent with other UI-only state
- AIOrb resume path needs only `setActivePage('review')` because READY handler already restores `state.reviewBriefing` and `state.reviewStatus = 'ready'` from the session
- `REVIEW_SESSION_STALE_MS` constant lives in `review-session.ts` and is imported directly by ReviewBriefingView — single source of truth
- `pruneOldBriefings` uses dynamic `import('../../storage/db')` to avoid circular module dependency at init time

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] UPDATE_ATOM payload shape correction**
- **Found during:** Implementation review before first TypeScript check
- **Issue:** Plan spec showed `{ id, updated_at, status }` flat payload, but the command type is `{ id: string; changes: Partial<Atom> }`
- **Fix:** Wrapped mutation fields in `changes: { ... }` in handleDefer and handleArchive
- **Files modified:** `src/ui/views/ReviewBriefingView.tsx`
- **Commit:** `88c8197`

**2. [Rule 1 - Bug] CREATE_INBOX_ITEM payload correction**
- **Found during:** Implementation review before first TypeScript check
- **Issue:** Plan spec showed `{ id, content, created_at }` but the command only accepts `{ content: string; title?: string }`
- **Fix:** Removed extra fields from CREATE_INBOX_ITEM payload
- **Files modified:** `src/ui/views/ReviewBriefingView.tsx`
- **Commit:** `88c8197`

**3. [Rule 2 - Architecture simplification] AIOrb resume uses READY hydration instead of setState in AIOrb**
- **Found during:** Task 2 implementation
- **Issue:** Plan suggested calling `setState('reviewBriefing', ...), setState('reviewStatus', 'ready')` inside AIOrb, but setState is internal to the store module
- **Fix:** READY handler already hydrates reviewBriefing + reviewStatus from session; AIOrb review action only calls `setActivePage('review')` for the resume case
- **Files modified:** `src/ui/components/AIOrb.tsx`
- **Commit:** `c0cb31c`

## Issues Encountered

None — all TypeScript errors in output are pre-existing issues in node_modules and VoiceCapture.tsx. No new errors introduced.

## Self-Check: PASSED

- FOUND: `src/ui/views/ReviewBriefingView.tsx`
- FOUND: `src/storage/review-session.ts`
- FOUND: `.planning/phases/06-review-pre-analysis/06-02-SUMMARY.md`
- FOUND: commit `88c8197` (feat — ReviewBriefingView + session)
- FOUND: commit `c0cb31c` (feat — AIOrb badge + resume)

---
*Phase: 06-review-pre-analysis*
*Completed: 2026-02-26*
