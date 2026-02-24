---
phase: 05-triage-ai
plan: 01
subsystem: ui
tags: [solidjs, css-animations, radial-menu, ai-orb, keyframes, conic-gradient]

# Dependency graph
requires:
  - phase: 04-ai-infrastructure
    provides: anyAIAvailable() signal, AI adapter router, store AI state fields (llmReady, cloudReady)

provides:
  - AIOrb.tsx — fixed-position floating orb with 5-state machine and CSS animations
  - AIRadialMenu.tsx — 5-segment radial menu with CSS transform positioning
  - setOrbState export — allows triage pipeline (Plan 03) to drive orb animations externally
  - startTriageInbox stub + registerTriageInboxFn — Plan 03 replaces with real triage call
  - Phase 5 AI Orb CSS block in layout.css (all 4 @keyframes + radial menu styles)
  - Shell.tsx integration — AIOrb rendered as permanent fixture in app shell

affects:
  - 05-02: triage card suggestions augment InboxView — orb is the trigger point
  - 05-03: triage pipeline wires into setOrbState and registerTriageInboxFn
  - 05-04: AIQuestionFlow wired to 'discuss' radial action

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-level signal export pattern: setOrbState exported at module level (not via prop) for external pipeline control — same pattern as Shell.tsx setShowAISettings"
    - "startTriageInbox stub + registerTriageInboxFn: deferred wiring pattern — Plan 01 creates the stub, Plan 03 registers the real implementation"
    - "CSS nth-child transform radial positioning: 5 items at ~72deg intervals using fixed translateX/Y offsets (no trigonometry required)"
    - "CSS conic-gradient ring visual: binder ring aesthetic via conic-gradient background gap for streaming/expanded states"

key-files:
  created:
    - src/ui/components/AIOrb.tsx
    - src/ui/components/AIRadialMenu.tsx
  modified:
    - src/ui/layout/Shell.tsx
    - src/ui/layout/layout.css
    - src/ui/signals/store.ts

key-decisions:
  - "setOrbState exported at module level (not via component ref or context) so Plan 03 triage pipeline can drive orb state without coupling — follows Shell.tsx setShowAISettings pattern"
  - "startTriageInbox implemented as mutable let export with registerTriageInboxFn override — avoids circular dependency between AIOrb (ui layer) and triage.ts (ai layer); Plan 03 calls registerTriageInboxFn to replace the stub"
  - "AIOrb placed in Shell.tsx (not app.tsx) — Shell owns all AI overlays; AIOrb follows that pattern and needs access to showAISettings for overlay suppression"
  - "isAnyOverlayOpen() derived in Shell.tsx to suppress radial menu when AI settings, guided setup, or cloud preview are active — orb itself stays visible as a dot"
  - "Radial menu backdrop is a fixed-position overlay at z-index 99 (below orb at z-index 100) to capture outside-click close events cleanly"

patterns-established:
  - "Pattern 1: CSS @keyframes orb states — all animation driven by state class (ai-orb--{state}); no JS animation timers"
  - "Pattern 2: Context-aware CSS custom property positioning — createEffect sets --orb-bottom/--orb-right, CSS transition handles smooth movement"
  - "Pattern 3: Inline SVG icons in radial items — consistent with PriorityBadge; no icon library needed for small UI indicators"

requirements-completed: [AIUX-01, AIUX-02]

# Metrics
duration: 5min
completed: 2026-02-24
---

# Phase 5 Plan 01: AI Orb and Radial Menu Summary

**Fixed-position binder-ring AI orb with 5-state CSS animation machine and 5-segment context-aware radial menu, integrated as a permanent Shell fixture.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-24T13:07:41Z
- **Completed:** 2026-02-24T13:12:45Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- AIOrb.tsx renders a fixed-position glowing binder-ring orb using CSS @keyframes for idle pulse, thinking spin, streaming open, and error flash states
- AIRadialMenu.tsx renders 5 segments (Triage, Review, Compress, Discuss, Settings) using pure CSS nth-child transform positioning at radius 70px — no third-party library
- Shell.tsx now permanently renders `<AIOrb>` with overlay suppression wired to showAISettings/guided setup/cloud preview signals
- All 4 orb @keyframes and radial menu styles added to layout.css Phase 5 section
- `setOrbState` exported at module level so Plan 03 triage pipeline can drive orb states externally
- `startTriageInbox` stub exported with `registerTriageInboxFn` override hook for Plan 03 to wire real triage logic

## Task Commits

Each task was committed atomically:

1. **Task 1: Create AIOrb component with state machine and CSS animations** - `568597b` (feat)
2. **Task 2: Integrate AIOrb into Shell and wire radial menu settings action** - `7d642fa` (feat)

## Files Created/Modified

- `src/ui/components/AIOrb.tsx` — Floating orb with 5-state machine, context-aware positioning, overlay suppression, error retry
- `src/ui/components/AIRadialMenu.tsx` — Radial menu with 5 segments, primary action highlight, settings action wiring
- `src/ui/layout/Shell.tsx` — AIOrb rendered as permanent fixture; isAnyOverlayOpen() derived for suppression
- `src/ui/layout/layout.css` — Phase 5 AI Orb section: .ai-orb, .ai-orb-ring, all state variants, 4 @keyframes, radial menu CSS
- `src/ui/signals/store.ts` — startTriageInbox stub + registerTriageInboxFn added for Plan 03 wiring

## Decisions Made

- `setOrbState` exported at module level (not via prop/ref) — follows existing `setShowAISettings` Shell.tsx pattern; allows triage pipeline to drive orb state without component coupling
- `startTriageInbox` as mutable `let` export with `registerTriageInboxFn` override — avoids circular dependency between AIOrb (UI layer) and triage.ts (AI layer) while providing a clean wiring point for Plan 03
- AIOrb placed in Shell.tsx not app.tsx — Shell owns all AI overlay state; orb needs access to showAISettings for overlay detection
- Radial backdrop at z-index 99 (below orb at 100) — captures outside-click cleanly without blocking the orb button itself

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added startTriageInbox stub to store.ts**
- **Found during:** Task 1 (AIOrb.tsx creation)
- **Issue:** AIOrb.tsx imports `startTriageInbox` from store.ts for error-state retry, but it doesn't exist yet (will be created in Plan 03). Without a stub, the import would fail TypeScript compilation.
- **Fix:** Added `export let startTriageInbox: () => void` stub and `export function registerTriageInboxFn(fn)` override hook to store.ts. Plan 03 calls `registerTriageInboxFn` to replace the stub with the real triage pipeline.
- **Files modified:** `src/ui/signals/store.ts`
- **Verification:** TypeScript compiles without errors; no new lint warnings
- **Committed in:** `568597b` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Required for compile-time correctness. The stub cleanly defers the real implementation to Plan 03 without creating a circular dependency.

## Issues Encountered

- Pre-existing TypeScript errors in node_modules (HuggingFace Transformers, workbox, vite-plugin-pwa) and VoiceCapture.tsx — these are out of scope and were present before Plan 01 execution. Not fixed.

## Next Phase Readiness

- AIOrb renders as permanent Shell fixture when any AI adapter is available
- setOrbState and registerTriageInboxFn ready for Plan 03 to wire real triage pipeline
- 'settings' radial action opens AISettingsPanel immediately
- 'triage', 'review', 'compress', 'discuss' actions are stubs — Plan 03-04 and Phases 6-7 will wire them

## Self-Check: PASSED

- src/ui/components/AIOrb.tsx: FOUND
- src/ui/components/AIRadialMenu.tsx: FOUND
- .planning/phases/05-triage-ai/05-01-SUMMARY.md: FOUND
- Commit 568597b: FOUND
- Commit 7d642fa: FOUND
- @keyframes orbIdlePulse in layout.css: FOUND

---
*Phase: 05-triage-ai*
*Completed: 2026-02-24*
