---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Local AI + Polish
status: in_progress
last_updated: "2026-03-04T05:29:00.000Z"
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 2
  completed_plans: 1
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-03)

**Core value:** Every piece of stored information must encode predictive value about future actions, decisions, or understanding — if it doesn't change behavior, it's noise, and the system actively manages this boundary.
**Current focus:** Phase 9 — Python Training Infrastructure

## Current Position

Milestone: v3.0 Local AI + Polish
Phase: 9 of 12 (Python Training Infrastructure)
Plan: 1 of 2 complete in current phase
Status: In progress
Last activity: 2026-03-04 — Phase 9 Plan 01 complete (training scaffold, data generation scripts)

Progress: [█░░░░░░░░░] 5% (v3.0 scope)

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
Stopped at: Completed Phase 9 Plan 01 (09-01-PLAN.md) — training scaffold, data generation scripts, modelSuggestion field.
Resume file: None
