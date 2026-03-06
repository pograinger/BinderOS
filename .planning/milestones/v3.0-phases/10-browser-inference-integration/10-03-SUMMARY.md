---
phase: 10-browser-inference-integration
plan: "03"
subsystem: ui/ai
tags: [statusbar, ux, ambiguous-classification, onnx, inference, progress-indicator]
dependency_graph:
  requires:
    - 10-01 (ONNX worker, CLASSIFIER_PROGRESS/READY events)
    - 10-02 (classifierLoadProgress signal, classifierReady signal, TriageSuggestion.alternativeType)
  provides:
    - StatusBar classifier download progress segment
    - InboxAISuggestion two-button ambiguous type UX
    - InboxView type pre-fill guard for ambiguous suggestions
  affects:
    - src/ui/layout/StatusBar.tsx
    - src/ui/components/InboxAISuggestion.tsx
    - src/ui/views/InboxView.tsx
    - src/ui/layout/layout.css
tech_stack:
  added: []
  patterns:
    - SolidJS Show block with null-check for conditional status bar segment
    - Two-branch Show/when pattern (alternativeType truthy vs falsy) in suggestion component
    - Guard pattern for pre-fill: check suggestion.alternativeType before calling setSelectedType
key_files:
  created: []
  modified:
    - src/ui/layout/StatusBar.tsx (classifierLoadProgress import and Show segment)
    - src/ui/components/InboxAISuggestion.tsx (onSelectType prop, ambiguous two-button branch)
    - src/ui/views/InboxView.tsx (onSelectType passthrough, three pre-fill guards)
    - src/ui/layout/layout.css (Phase 10 ambiguous button CSS classes)
decisions:
  - "Ambiguous path shows only Dismiss button alongside the two type-select buttons — clicking either type button selects AND accepts, so separate Accept is redundant"
  - "Three pre-fill guard sites in InboxView: swipe-right handler, Enter key handler, and desktop Classify button all now check alternativeType before setSelectedType"
  - "CSS uses var(--border-primary) and var(--accent) from existing design system — no new color tokens needed"
metrics:
  duration: "~19 minutes"
  completed: "2026-03-04T18:20:29Z"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 4
  files_created: 0
---

# Phase 10 Plan 03: StatusBar Progress and Ambiguous Type UX Summary

Classifier download progress added to StatusBar and two-button ambiguous type UX added to InboxAISuggestion — completes the user-facing UX for Phase 10 ONNX integration.

## What Was Built

### Task 1: Classifier download progress in StatusBar (commit: d9b21c6)

Added a non-intrusive download progress segment to `StatusBar.tsx` that appears during the first-time ONNX classifier model fetch and disappears silently when loading completes.

**Changes to `src/ui/layout/StatusBar.tsx`:**
- Import `classifierLoadProgress` signal from store (alongside existing imports)
- New `<Show when={classifierLoadProgress() !== null}>` block renders between the task count segment and the AI status segment
- When `classifierLoadProgress()` is -1: shows `"AI model (one-time download)..."` (indeterminate, no stuck 0%)
- When `classifierLoadProgress()` is 0-100: shows `"AI model X% (one-time download)"`
- Uses existing `status-bar-dot dev` class (amber dot) for visual consistency with AI and Dev Mode indicators
- No new CSS required — segment disappears completely from DOM when `classifierLoadProgress()` is null

### Task 2: Ambiguous two-button UX and type pre-fill guard (commit: 4885b67)

**Changes to `src/ui/components/InboxAISuggestion.tsx`:**
- Added `onSelectType: (type: AtomType) => void` to `InboxAISuggestionProps` interface
- Added `AtomType` to imports (from `../../types/atoms`)
- Restructured the complete-suggestion `<Show>` block into two branches:

  **Ambiguous path** (`when={props.suggestion.alternativeType}`):
  - `"could be either:"` label (italic, muted text)
  - Two side-by-side `<button class="ai-suggestion-type-btn">` elements with type icon + name
  - Clicking either button calls `props.onSelectType(type)` then `props.onAccept()` — select-and-accept in one tap
  - Related atom chips displayed (same as confident path)
  - Only Dismiss button shown (Accept is built into the type buttons)

  **Confident path** (`when={!props.suggestion.alternativeType}`):
  - Existing display unchanged: header row, reasoning, expand toggle, related atoms, Accept/Dismiss

**Changes to `src/ui/views/InboxView.tsx`:**
- Pass `onSelectType={(type) => setSelectedType(type)}` to `<InboxAISuggestion>`
- Three pre-fill guards added: swipe-right handler, Enter key handler, desktop Classify button
  - Pattern: check `triageSuggestions().get(currentItem()!.id)?.alternativeType` before calling `setSelectedType(suggestedType())`
  - When ambiguous suggestion present: skip pre-fill, leaving type unset until user chooses via buttons

**Changes to `src/ui/layout/layout.css`:**
- `.ai-suggestion-ambiguous` — column-flex container with 4px gap
- `.ai-suggestion-ambiguous-label` — 0.75rem italic muted text for "could be either:"
- `.ai-suggestion-ambiguous-buttons` — flex row with 8px gap
- `.ai-suggestion-type-btn` — bordered button with icon+text, 6px border-radius, transitions on hover
- `.ai-suggestion-type-btn:hover` — border shifts to `var(--accent)` on hover

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Plan 02 partially incomplete — classifierLoadProgress not yet in store**

- **Found during:** Pre-task verification (reading store.ts for classifierLoadProgress)
- **Issue:** Plan 02 SUMMARY.md did not exist; plan 03 depends on store.ts having `classifierLoadProgress`, `classifierReady`, `ensureEmbeddingWorker`. Initial check showed these were missing from store.ts.
- **Resolution:** Discovered that plan 02 was actually fully committed (commits `4f71466` and `c612e5b`) — all three signals and the shared worker singleton were present in store.ts. The SUMMARY.md for plan 02 was missing but the code was complete. Plan 03 proceeded without needing any additional plan 02 work.
- **Files modified:** None (no deviation fix needed)

## Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit --skipLibCheck` (Task 1) | PASS — only pre-existing VoiceCapture/vite.config errors |
| `npx tsc --noEmit --skipLibCheck` (Task 2) | PASS — only pre-existing VoiceCapture/vite.config errors |
| `pnpm build` | PASS — built in 9.53s |
| StatusBar imports `classifierLoadProgress` | PASS |
| StatusBar Show block uses `classifierLoadProgress() !== null` | PASS |
| InboxAISuggestion `alternativeType` check renders two-button layout | PASS |
| InboxAISuggestion `onSelectType` prop added and wired to button clicks | PASS |
| InboxView `selectedType` not pre-filled when `alternativeType` present (3 sites) | PASS |
| CSS file contains `.ai-suggestion-ambiguous` and `.ai-suggestion-type-btn` | PASS |

## Self-Check

### File existence:
- `src/ui/layout/StatusBar.tsx` — FOUND
- `src/ui/components/InboxAISuggestion.tsx` — FOUND
- `src/ui/views/InboxView.tsx` — FOUND
- `src/ui/layout/layout.css` — FOUND

### Commits:
- `d9b21c6` — Task 1: add classifier download progress indicator to StatusBar
- `4885b67` — Task 2: add ambiguous two-button UX and guard type pre-fill

## Self-Check: PASSED
