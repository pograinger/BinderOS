---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Local AI + Polish
status: unknown
last_updated: "2026-03-04T18:31:22.683Z"
progress:
  total_phases: 9
  completed_phases: 9
  total_plans: 30
  completed_plans: 30
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-03)

**Core value:** Every piece of stored information must encode predictive value about future actions, decisions, or understanding — if it doesn't change behavior, it's noise, and the system actively manages this boundary.
**Current focus:** Phase 10 — Browser Inference Integration

## Current Position

Milestone: v3.0 Local AI + Polish
Phase: 10 of 12 (Browser Inference Integration)
Plan: 3 of TBD in current phase
Status: In progress
Last activity: 2026-03-04 — Phase 10 Plan 03 complete (StatusBar classifier download progress, ambiguous two-button type UX in InboxAISuggestion, type pre-fill guard in InboxView)

Progress: [████░░░░░░] 30% (v3.0 scope)

## Accumulated Context

### From v2.0
- 3-Ring Binder tiered pipeline foundation exists (Tier 1 deterministic, Tier 2 ONNX centroids, Tier 3 LLM)
- Embedding worker with Xenova/all-MiniLM-L6-v2 already running
- Classification log in Dexie for pattern learning already wired
- Tech debt items identified and carried forward for cleanup

### Decisions (Phase 10 Plan 03)

- Ambiguous ONNX classification path shows two-button UX instead of pre-filled type — user must actively choose when ONNX confidence spread < 0.15.
- Ambiguous path has only Dismiss button (not Accept) — clicking either type button selects-and-accepts in one tap; separate Accept would be redundant.
- Three pre-fill guard sites in InboxView (swipe-right, Enter key, desktop Classify button) all check alternativeType before calling setSelectedType.
- StatusBar classifier progress uses existing status-bar-dot dev class (amber dot) — no new CSS; segment disappears completely from DOM when classifierLoadProgress is null.

### Decisions (Phase 10 Plan 02)

- TieredResult extended with alternativeType and confidenceSpread — cleaner type contract between handler and triage than type casting.
- ensureEmbeddingWorker() exported from store.ts so Tier 2 handler and SearchOverlay share one worker instance; prevents duplicate model loading.
- updateTier2Centroids() exported for future centroid rebuild pipeline — centroid references held in initTieredAI closure.
- InboxView logClassification approximates numeric confidence as 0.85/0.5 for 'high'/'low' — exact ONNX probability not available at UI layer.

### Decisions (Phase 10 Plan 01)

- Placeholder ONNX (sklearn LogisticRegression, random weights, 10KB) committed to `public/models/classifiers/` to validate worker wiring independently of Phase 9 training timeline.
- `.gitignore` fixed: parent-dir exclusion `public/models/` + negation pattern does not work in Git. Changed to per-subdirectory exclusion `public/models/Xenova/` to properly allow `public/models/classifiers/` to be committed.
- `ort.env.wasm.numThreads = 1` set in worker to avoid SharedArrayBuffer requirement and ORT issue #26858 (hanging with external data + multi-threading).
- `CLASSIFY_ONNX` receives text (not embedding): worker embeds then classifies in one step, same external interface as `CLASSIFY_TYPE`.

### Decisions (v3.0 kickoff)

- Classifier head is a separate ONNX MLP (~200-400KB) consuming MiniLM 384-dim embeddings — not a full fine-tuned transformer. Reuses existing embedding worker.
- Section routing uses nearest-neighbor (not fine-tuned model) — sections are user-specific dynamic labels, no shared model can cover them.
- `modelSuggestion` field added to ClassificationEvent schema in Phase 9, before classifier ships in Phase 10. Retrofitting after production data is costly.
- Phase 10 browser integration can start with placeholder ONNX (random-weight export) to validate worker wiring independently of Phase 9 training timeline.
- Confidence threshold for `classify-type` starts at 0.78 (not current 0.65) — requires one empirical calibration iteration after first model is trained.

### Decisions (Phase 9 Plan 02)

- `onnxruntime-web/wasm` import (not `onnxruntime-web/node`) used in validation harness — forces WASM execution path matching browsers exactly, satisfying TRAIN-03 browser-parity requirement.
- Python validation artifacts derived from Python onnxruntime on ONNX model (not sklearn predict) — catches ONNX export bugs that sklearn would not reveal.
- argmax over probability output used for top-1 in both Python and Node.js — avoids dtype inconsistency in the ONNX label output across ort versions.

### Decisions (Phase 9 Plan 01)

- `modelSuggestion?: AtomType` added as optional field to ClassificationEvent — no Dexie migration needed since ClassificationEvent is a JSON blob in the config table, not indexed records.
- embeddings_cache.npy and labels_cache.npy gitignored (reproducible from committed JSONL); label_map.json committed (needed by browser in Phase 10).
- JSONL corpus in scripts/training-data/ committed — small files, auditable, needed for TRAIN-04 reproducibility without API key.
- `public/models/classifiers/` committed via per-subdirectory gitignore fix in Phase 10 Plan 01 (negation on excluded parent dir does not work in Git).

### Blockers/Concerns

- [Phase 9]: 0.78 confidence threshold is a research estimate — measure escalation rate on held-out set and adjust before Phase 10 integration.
- [Phase 9]: decision/insight boundary is hardest classification pair. If calibrated accuracy below 65%, consider collapsing to single class with secondary UI selection.
- [Phase 10]: Production COOP/COEP header configuration must be verified against actual hosting environment — COEP `credentialless` is correct but environment-specific.

### Pending Todos

None yet.

## Session Continuity

Last session: 2026-03-04
Stopped at: Phase 10 Plan 03 complete — StatusBar classifier download progress indicator, ambiguous two-button type UX in InboxAISuggestion, type pre-fill guard in InboxView. All Phase 10 user-facing UX complete.
Resume file: .planning/phases/10-browser-inference-integration/10-03-SUMMARY.md
