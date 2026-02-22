---
phase: 01-foundation
plan: 04
subsystem: ui
tags: [solidjs, inbox-triage, swipe-gestures, voice-capture, web-speech-api, type-suggestion, type-ahead, capture-overlay, classification-log, pattern-learning, micro-animation]

# Dependency graph
requires:
  - phase: 01-03
    provides: "Worker command handlers, SolidJS store, binder shell layout with MainPane placeholder"
provides:
  - Card-by-card inbox triage with swipe gestures (classify/skip/quick-archive)
  - Content-based atom type suggestion heuristic (task/event/decision/insight/fact)
  - Pattern learning via classification event logging with suggestTypeFromPatterns()
  - Type-ahead search for linking atoms to section items during triage
  - Swipe-to-archive (left) and swipe-to-complete (right) on atom rows
  - Fast capture overlay (Ctrl+N / FAB) with auto-focus textarea
  - Voice capture via Web Speech API with feature detection and graceful degradation
  - Storage persistence warning overlay with platform-specific instructions
  - Section view with AtomCard list and SectionItemList filter
  - Micro-animation rewards on triage completion and capture save
  - Keyboard shortcuts: Ctrl+N (capture), Ctrl+Z (undo), Escape (close overlay)
  - FAB button for mobile capture
affects:
  - Phase 2 (entropy cap enforcement hooks into inbox/task counts from store)
  - Phase 3 (search and filter operate on the same atom list views)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Raw touch handlers for swipe gestures (solid-gesture not installed; scroll-vs-swipe disambiguation via direction detection)"
    - "Content heuristic type suggestion: keyword matching for task/event/decision/insight, fallback to fact"
    - "Classification event logging in Dexie config table for pattern-based type suggestion"
    - "Web Speech API feature detection: hide mic button in unsupported browsers"
    - "SolidJS Show/For components exclusively (no ternary/map) per ESLint solid rules"

key-files:
  created:
    - src/ui/views/InboxView.tsx (card-by-card triage with swipe, type suggestion, type-ahead linking)
    - src/ui/views/SectionView.tsx (atom list with AtomCard components)
    - src/ui/views/StorageWarning.tsx (full-screen persistence warning)
    - src/ui/views/CaptureOverlay.tsx (fast capture modal with voice button)
    - src/ui/components/AtomCard.tsx (compact row with swipe gestures)
    - src/ui/components/AtomTypeIcon.tsx (colored SVG icons per atom type)
    - src/ui/components/SectionItemList.tsx (section item CRUD)
    - src/ui/components/VoiceCapture.tsx (Web Speech API with graceful degradation)
    - src/storage/classification-log.ts (classification event logging for pattern learning)
  modified:
    - src/ui/layout/MainPane.tsx (routes to real views instead of placeholders)
    - src/ui/layout/layout.css (500+ lines added for all new components)
    - src/app.tsx (capture overlay state, Ctrl+N shortcut, FAB button, StorageWarning)

key-decisions:
  - "Raw touch handlers used instead of solid-gesture (not installed) — scroll-vs-swipe disambiguation built-in"
  - "Classification events stored in Dexie config table as JSON array (lightweight, no separate table)"
  - "Pattern suggestion requires 60% confidence (3+ similar items classified same way) before overriding content heuristic"
  - "Voice capture disclaimer shown near mic button (Web Speech API routes audio to external servers)"

patterns-established:
  - "Card-by-card triage: one item at a time, forced decision (classify or discard), no snooze"
  - "Type suggestion pipeline: pattern history -> content heuristic -> fallback to 'fact'"
  - "Swipe gesture pattern: touchstart -> detect direction -> horizontal triggers action, vertical allows scroll"
  - "Capture flow: Ctrl+N -> auto-focus textarea -> type -> Ctrl+Enter -> save -> close (under 3 seconds)"

requirements-completed: [TRST-02, TRST-04, ORG-09]

# Metrics
duration: 20min
completed: 2026-02-22
---

# Phase 1 Plan 04: Views + Capture Summary

**Card-by-card inbox triage with swipe gestures, content-based type suggestion, type-ahead linking, fast capture overlay with voice input, and classification pattern logging**

## Performance

- **Duration:** 20 min (Tasks 1-2 auto-executed, Task 3 human-verify checkpoint)
- **Started:** 2026-02-22T13:00:00Z
- **Completed:** 2026-02-22T13:40:24Z
- **Tasks:** 3 of 3 (2 auto + 1 human-verify)
- **Files modified:** 12

## Accomplishments
- Card-by-card inbox triage shows one item at a time with swipe gestures (Tinder-like): right to classify, left to skip, up to quick-archive
- Content-based type suggestion heuristic pre-selects atom type with one-tap confirm/change
- Type-ahead search filters section items during triage for quick linking
- Fast capture overlay (Ctrl+N or FAB) saves to inbox in under 3 seconds
- Voice capture via Web Speech API in Chrome/Safari, hidden in unsupported browsers
- Swipe-to-archive (left) and swipe-to-complete (right) on atom rows in section views
- Classification events logged for pattern-based type suggestion improvement over time
- Storage persistence warning with platform-specific instructions (Safari vs Chrome)
- Micro-animation rewards on triage completion and capture save

## Task Commits

Each task was committed atomically:

1. **Task 1: Views + components with triage, swipe, type-ahead, type suggestion** - `1de8bf3` (feat)
2. **Task 2: Capture overlay, voice input, keyboard shortcuts, classification logging** - `598745f` (feat)
3. **Task 3: Human verification checkpoint** - approved by user

## Files Created/Modified
- `src/ui/views/InboxView.tsx` - Card-by-card triage with swipe gestures, type suggestion, type-ahead linking, micro-animations
- `src/ui/views/SectionView.tsx` - Atom list filtered by section with AtomCard components
- `src/ui/views/StorageWarning.tsx` - Full-screen persistence warning with platform-specific instructions
- `src/ui/views/CaptureOverlay.tsx` - Fast capture modal, auto-focus textarea, Ctrl+Enter save, voice button
- `src/ui/components/AtomCard.tsx` - Compact atom row with raw touch swipe gestures (left=archive, right=complete)
- `src/ui/components/AtomTypeIcon.tsx` - Colored inline SVG icons per atom type
- `src/ui/components/SectionItemList.tsx` - Section item list with add/rename/archive
- `src/ui/components/VoiceCapture.tsx` - Web Speech API with feature detection, graceful degradation
- `src/storage/classification-log.ts` - Classification event logging with pattern-based type suggestion
- `src/ui/layout/MainPane.tsx` - Routes to real InboxView/SectionView (replaced placeholders)
- `src/ui/layout/layout.css` - 500+ lines added for all new components and animations
- `src/app.tsx` - Capture overlay state, Ctrl+N shortcut, FAB button, StorageWarning integration

## Decisions Made
- Used raw touch handlers instead of solid-gesture (package not installed) with scroll-vs-swipe disambiguation
- Classification events stored in Dexie config table as JSON array (lightweight approach, no separate table needed)
- Pattern suggestion requires 60% confidence threshold (3+ similar items) before overriding content heuristic
- Voice capture shows disclaimer about audio being sent to browser speech service

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] solid-gesture not installed**
- **Found during:** Task 1 (AtomCard swipe implementation)
- **Issue:** Plan referenced solid-gesture but it was not in package.json dependencies
- **Fix:** Implemented raw touch handlers with scroll-vs-swipe disambiguation per RESEARCH.md fallback recommendation
- **Files modified:** src/ui/components/AtomCard.tsx, src/ui/views/InboxView.tsx
- **Verification:** Swipe gestures work with 80px threshold and velocity detection
- **Committed in:** 1de8bf3

**2. [Rule 1 - Bug] ESLint SolidJS reactivity fixes in VoiceCapture.tsx**
- **Found during:** Task 2 (VoiceCapture implementation)
- **Issue:** Early `return null` breaks SolidJS reactivity (solid/components-return-once rule)
- **Fix:** Wrapped component body in `<Show when={available()}>` instead of early return
- **Files modified:** src/ui/components/VoiceCapture.tsx
- **Verification:** pnpm lint passes
- **Committed in:** 598745f

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes were necessary. Raw touch handlers are the documented fallback. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- **Phase 1 COMPLETE** — all 4 plans executed, all success criteria met
- All five atom types can be created, classified, persisted, undone, and exported
- Binder UI shell is functional with dark theme, responsive layout, and all user-facing interactions
- CRDT-compatible change log with lamport clock and device ID from day one
- Pattern learning foundation in place for future AI-powered suggestions
- Ready for Phase 2: Compute Engine (priority scoring, staleness decay, entropy health, caps)

## Self-Check: PASSED

All key files verified:
- src/ui/views/InboxView.tsx, SectionView.tsx, StorageWarning.tsx, CaptureOverlay.tsx: FOUND
- src/ui/components/AtomCard.tsx, AtomTypeIcon.tsx, SectionItemList.tsx, VoiceCapture.tsx: FOUND
- src/storage/classification-log.ts: FOUND
- Build: passes (34 modules, 18.28KB CSS, 206.85KB JS, 10.93KB WASM)
- Lint: passes (zero errors)

All commits verified:
- 1de8bf3 (Task 1: views + components): FOUND
- 598745f (Task 2: capture + voice): FOUND

---
*Phase: 01-foundation*
*Completed: 2026-02-22*
