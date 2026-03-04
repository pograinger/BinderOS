---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Local AI + Polish
status: ready_to_plan
last_updated: "2026-03-04T05:46:57.787Z"
progress:
  total_phases: 8
  completed_phases: 8
  total_plans: 27
  completed_plans: 27
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-03)

**Core value:** Every piece of stored information must encode predictive value about future actions, decisions, or understanding — if it doesn't change behavior, it's noise, and the system actively manages this boundary.
**Current focus:** Phase 10 — Browser Inference Integration

## Current Position

Milestone: v3.0 Local AI + Polish
Phase: 10 of 12 (Browser Inference Integration)
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-03-04 — Phase 9 complete (Python training infrastructure: synthetic data, classifier training, ONNX export, browser validation)

Progress: [███░░░░░░░] 25% (v3.0 scope)

## Accumulated Context

### From v2.0
- 3-Ring Binder tiered pipeline foundation exists (Tier 1 deterministic, Tier 2 ONNX centroids, Tier 3 LLM)
- Embedding worker with Xenova/all-MiniLM-L6-v2 already running
- Classification log in Dexie for pattern learning already wired
- Tech debt items identified and carried forward for cleanup

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
- `!public/models/classifiers/` gitignore exception so trained classifier heads can be committed for Phase 10 browser integration.

### Blockers/Concerns

- [Phase 9]: 0.78 confidence threshold is a research estimate — measure escalation rate on held-out set and adjust before Phase 10 integration.
- [Phase 9]: decision/insight boundary is hardest classification pair. If calibrated accuracy below 65%, consider collapsing to single class with secondary UI selection.
- [Phase 10]: Production COOP/COEP header configuration must be verified against actual hosting environment — COEP `credentialless` is correct but environment-specific.

### Pending Todos

None yet.

## Session Continuity

Last session: 2026-03-04
Stopped at: Completed Phase 9 Plan 02 (09-02-PLAN.md) — classifier training script, ONNX export (opset=17, zipmap=False), browser-runtime validation harness. Phase 9 complete.
Resume file: None
