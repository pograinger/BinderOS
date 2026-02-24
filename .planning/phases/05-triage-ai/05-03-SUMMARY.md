---
phase: 05-triage-ai
plan: 03
subsystem: ai-pipeline
tags: [ai, triage, solidjs, signals, jaccard, abortcontroller, sequential-processing]

# Dependency graph
requires:
  - phase: 05-triage-ai
    plan: 01
    provides: AIOrb component with setOrbState export, startTriageInbox stub in store.ts
  - phase: 05-triage-ai
    plan: 02
    provides: aiSourced field on CLASSIFY_INBOX_ITEM, AtomScore/EntropyScore types, BinderState fields
provides:
  - src/ai/similarity.ts: pure Jaccard keyword similarity, findRelatedAtoms() for related atom discovery
  - src/ai/triage.ts: full triage pipeline with TriageSuggestion type, buildTriagePrompt, parseTriageResponse, triageInbox, cancelTriage
  - store.ts: triageSuggestions/triageStatus/triageError ephemeral signals (NOT in BinderState)
  - store.ts: startTriageInbox() real implementation replacing Plan 01 stub
  - store.ts: acceptAISuggestion, dismissAISuggestion, acceptAllAISuggestions
affects: [05-triage-ai/04-triage-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sequential triage processing with AbortController — one item at a time prevents rate limit exhaustion"
    - "Pending placeholder pattern — emit status:pending before AI call so UI shows Analyzing... indicator"
    - "Lazy dynamic import for setOrbState — avoids circular dependency between store.ts and AIOrb.tsx at module init time"
    - "Ephemeral triage signal Map — createSignal<Map<string, TriageSuggestion>> isolated from BinderState reconcile"
    - "Regex+try/catch JSON extraction — responseText.match(/{[\\s\\S]*}/) handles model wrapping around JSON"

key-files:
  created:
    - src/ai/similarity.ts
    - src/ai/triage.ts
  modified:
    - src/ui/signals/store.ts

key-decisions:
  - "Dynamic import of setOrbState from AIOrb in startTriageInbox — avoids circular dependency; store.ts and AIOrb.tsx both import each other, dynamic import defers resolution until function call time"
  - "startTriageInbox changed from mutable let to async function — cleaner API, same call signature for AIOrb (called without await)"
  - "Pending placeholder before AI call — onSuggestion called with status:pending to let UI render Analyzing... before AI response arrives"
  - "sectionItemId null-check includes 'null' string — AI models sometimes return the literal string 'null' instead of JSON null"

requirements-completed: [AITG-01, AITG-02, AITG-03, AITG-04, AITG-05, AIUX-06]

# Metrics
duration: 7min
completed: 2026-02-24
---

# Phase 5 Plan 03: Triage Pipeline Summary

**Sequential AI triage pipeline with Jaccard similarity for related atoms, entropy-informed prompts, AbortController cancellation, and ephemeral SolidJS signal Map for suggestion state**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-02-24T13:21:03Z
- **Completed:** 2026-02-24T13:27:59Z
- **Tasks:** 2
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- Created `src/ai/similarity.ts` — pure Jaccard keyword similarity module with `findRelatedAtoms()` that scores all atoms, filters by 0.15 threshold, and returns top-N IDs
- Created `src/ai/triage.ts` — complete triage pipeline including `TriageSuggestion` interface, `buildTriagePrompt` with atom type definitions + entropy context + section list, `parseTriageResponse` with regex JSON extraction and type validation, `triageInbox` sequential processing with pending placeholder pattern, and `cancelTriage` via AbortController
- Updated `src/ui/signals/store.ts` — added module-level ephemeral triage signals (`triageSuggestions`, `triageStatus`, `triageError`) as `createSignal` NOT in BinderState; replaced Plan 01 stub with real `startTriageInbox()` async function; added `acceptAISuggestion` (sends CLASSIFY_INBOX_ITEM with aiSourced: true), `dismissAISuggestion`, `acceptAllAISuggestions`

## Task Commits

1. **Task 1: Create similarity module and triage pipeline** - `65a1a75` (feat)
2. **Task 2: Add triage store signals and orchestration** - `47dbf7b` (feat)

**Plan metadata:** (pending final commit)

## Files Created/Modified

- `src/ai/similarity.ts` - Pure Jaccard keyword similarity; `findRelatedAtoms(content, atoms, limit=3)` filters > 0.15 threshold
- `src/ai/triage.ts` - Triage pipeline: `TriageSuggestion` interface, `buildTriagePrompt`, `parseTriageResponse`, `triageInbox`, `cancelTriage`
- `src/ui/signals/store.ts` - Ephemeral triage signals + `startTriageInbox` / accept / dismiss / acceptAll functions

## Decisions Made

- **Dynamic import for setOrbState**: `startTriageInbox()` uses `await import('../components/AIOrb')` to get `setOrbState` at call time rather than at module init. This avoids a circular dependency (store.ts imports AIOrb, AIOrb imports store.ts) that would cause runtime errors during module initialization.
- **startTriageInbox changed from `let` to `async function`**: The Plan 01 stub was a mutable `let` variable to allow Plan 03 to replace it. Plan 03 directly defines the real async function, removing the need for `registerTriageInboxFn`. The AIOrb component calls it without `await` (fire-and-forget), which works correctly with async functions.
- **Pending placeholder before AI call**: `triageInbox` calls `onSuggestion` with `status: 'pending'` before the `dispatchAI` call for each item. This allows the UI to immediately show an "Analyzing..." indicator on the current card, providing visual feedback during sequential processing.
- **sectionItemId null-check for string 'null'**: `parseTriageResponse` checks `parsed.sectionItemId !== 'null'` in addition to the type check, because small models sometimes return the literal string `"null"` instead of JSON `null`.

## Deviations from Plan

None — plan executed exactly as written.

The lazy `await import()` approach was used for `setOrbState` instead of a static top-level import, which slightly deviates from the plan's code snippet. This was necessary to prevent a circular import cycle at module initialization time (store.ts imports AIOrb, AIOrb already imports store.ts). The behavior is identical since the import resolves to the same module-level signal.

## Issues Encountered

- Pre-existing TypeScript errors in `VoiceCapture.tsx` (SpeechRecognition API types) — confirmed pre-existing, out of scope
- Pre-existing TypeScript errors in node_modules (workbox, vite-plugin-pwa, transformers) — confirmed pre-existing, out of scope

## Next Phase Readiness

- Plan 04 (Triage UI) can import `triageSuggestions`, `triageStatus`, `startTriageInbox`, `acceptAISuggestion`, `dismissAISuggestion`, `acceptAllAISuggestions` from `store.ts`
- The `TriageSuggestion` type is exported from `src/ai/triage.ts` for use in UI components
- Triage state is fully isolated from BinderState — worker reconcile will not affect suggestions

---
*Phase: 05-triage-ai*
*Completed: 2026-02-24*
