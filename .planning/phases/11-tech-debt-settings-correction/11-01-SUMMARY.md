---
phase: 11-tech-debt-settings-correction
plan: "01"
subsystem: ui
tags: [solidjs, dexie, onnx, settings, export, jsonl]

# Dependency graph
requires:
  - phase: 10-browser-inference-integration
    provides: classifierReady and classifierLoadProgress signals, ONNX embedding worker, classification-log Dexie store
provides:
  - exportCorrectionLog() in export.ts for browser JSONL correction download
  - classifierVersion signal in store.ts set on CLASSIFIER_READY
  - Model info card in AISettingsPanel showing classifier name, version, status, correction count
  - Export button wired to correction download, disabled when count is 0
affects: [training-pipeline, model-retraining, settings-ux]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dynamic import for correction export (avoids Dexie cold-path on panel load)"
    - "Local signal + onMount for async Dexie reads in settings panel"
    - "Export function returns count so caller can update local state without re-querying"

key-files:
  created: []
  modified:
    - src/storage/export.ts
    - src/ui/signals/store.ts
    - src/ui/components/AISettingsPanel.tsx
    - src/ui/layout/layout.css

key-decisions:
  - "classifierVersion hardcoded to 'v1' on CLASSIFIER_READY — no version metadata in ONNX file; add version field to triage-type-classes.json in next training cycle"
  - "exportCorrectionLog returns count (not void) so settings panel can update correctionCountLocal without a second Dexie read"
  - "Correction count reloaded after each export via loadCorrectionCount() — count loaded once on mount, stale-after-export pitfall avoided"
  - "Corrections filter: suggestedType !== undefined AND suggestedType !== chosenType — older events with no suggestion are excluded"

patterns-established:
  - "Classifier info card placed inside Local AI section — groups all local model info together"
  - "ai-settings-btn--small modifier for compact action buttons within detail rows"

requirements-completed: [CORR-01, CORR-02, POLISH-01, POLISH-02]

# Metrics
duration: 7min
completed: 2026-03-05
---

# Phase 11 Plan 01: Correction Export + Settings Model Info Card Summary

**JSONL correction export via browser download button, ONNX classifier info card in settings, with version/status/correction-count display**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-05T01:05:16Z
- **Completed:** 2026-03-05T01:12:40Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- `exportCorrectionLog()` added to export.ts — filters correction events (suggestedType != chosenType, undefined excluded), builds JSONL with trailing newline, downloads date-stamped file, returns count
- `classifierVersion` signal added to store.ts — set to 'v1' on CLASSIFIER_READY, exported alongside classifierReady and classifierLoadProgress
- Triage Type Classifier info card added in Local AI section of AISettingsPanel showing version, status (Ready / Downloading X% / Not loaded), correction count, and Export button
- Export button disabled when correction count is 0; count reloaded after each export
- Stale "Phases 5-7" references removed from Features section and component docblock

## Task Commits

Each task was committed atomically:

1. **Task 1: Add exportCorrectionLog and classifierVersion signal** - `f3a2d18` (feat)
2. **Task 2: Add model info card and polish settings panel** - `8a299f9` (feat)

**Plan metadata:** _(pending docs commit)_

## Files Created/Modified
- `src/storage/export.ts` - Added exportCorrectionLog(): filters corrections, downloads JSONL, returns count
- `src/ui/signals/store.ts` - Added classifierVersion signal, set 'v1' on CLASSIFIER_READY, exported
- `src/ui/components/AISettingsPanel.tsx` - Added classifier card, correctionCountLocal signal, handleExportCorrections, onMount loader; removed stale phase refs
- `src/ui/layout/layout.css` - Added classifier card CSS: .ai-settings-classifier-card, .ai-settings-detail-row, .ai-settings-btn--small, .ai-settings-classifier-hint

## Decisions Made
- `classifierVersion` hardcoded to 'v1' — no version metadata embedded in current ONNX model. Recommendation: add version field to `triage-type-classes.json` in next training cycle so it can be included in the CLASSIFIER_READY message.
- `exportCorrectionLog` returns `Promise<number>` instead of `Promise<void>` — allows caller to update local state without a second Dexie round-trip.
- Correction count is a local panel signal loaded on `onMount`, not a global store signal — panel opens infrequently, reactive LiveQuery would be unnecessary overhead.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - TypeScript compiled clean (only pre-existing VoiceCapture/vite.config errors), build succeeded.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Correction export path complete and ready for developer use after Phase 9 model training produces correction events
- classifierVersion signal ready to be driven dynamically once triage-type-classes.json includes a version field
- Settings panel polished and ready for remaining Phase 11 tasks (POLISH-03 through POLISH-07)

---
*Phase: 11-tech-debt-settings-correction*
*Completed: 2026-03-05*
