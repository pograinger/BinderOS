---
phase: 18-tier-2-next-action-decomposition-model
plan: 01
subsystem: ai
tags: [onnx, mlp, sentence-transformers, sklearn, decomposition, classification]

# Dependency graph
requires:
  - phase: 17-tier-2-gtd-classification-models
    provides: MLP+Platt training pipeline pattern, MiniLM embedding approach
provides:
  - decomposition.onnx ONNX classifier (35 categories, 99.6% accuracy)
  - decomposition-classes.json label map
  - decomposition.jsonl training data (42,168 examples)
  - Training and validation scripts (30, 31, 32)
affects: [18-02, 18-03, tier2-handler, embedding-worker]

# Tech tracking
tech-stack:
  added: []
  patterns: [single-classifier training script (vs Phase 17 multi-classifier)]

key-files:
  created:
    - scripts/train/30_generate_decomposition_data.py
    - scripts/train/31_train_decomposition_classifier.py
    - scripts/train/32_validate_decomposition_model.mjs
    - scripts/training-data/decomposition.jsonl
    - public/models/classifiers/decomposition.onnx
    - public/models/classifiers/decomposition-classes.json
  modified: []

key-decisions:
  - "MLP(256,128) architecture for 35-class decomposition — matches Phase 17 multi-class pattern"
  - "Single-classifier scripts (no --classifier flag) since decomposition is one model, not four"
  - "42,168 training examples (1000/category + 17% ambiguous) across 25 task + 10 decision patterns"

patterns-established:
  - "Decomposition-specific Faker placeholders: {appliance}, {vehicle}, {pet}, {cuisine}, {diet}, etc."

requirements-completed: [DECOMP-01, DECOMP-02]

# Metrics
duration: 18min
completed: 2026-03-08
---

# Phase 18 Plan 01: Decomposition Training Pipeline Summary

**ONNX MLP classifier trained on 35 decomposition categories (25 task + 10 decision) with 99.6% accuracy and 100% Python/Node parity**

## Performance

- **Duration:** 18 min
- **Started:** 2026-03-08T20:10:30Z
- **Completed:** 2026-03-08T20:28:30Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Faker-based training data generator producing 42,168 labeled examples across 35 decomposition pattern categories
- MLP(256,128) + Platt calibration achieving 99.6% test accuracy with 0.70 confidence threshold
- 100% Python/Node ONNX inference parity (8,434 test samples, zero mismatches)
- 2.7MB ONNX model ready for browser deployment via onnxruntime-web

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Faker-based decomposition training data generator** - `3b42be1` (feat)
2. **Task 2: Train MLP classifier and validate Python/Node parity** - `0e4dc50` (feat)

## Files Created/Modified
- `scripts/train/30_generate_decomposition_data.py` - Faker-based JSONL training data generator for 35 decomposition categories
- `scripts/train/31_train_decomposition_classifier.py` - MiniLM embedding + MLP training + Platt calibration + ONNX export
- `scripts/train/32_validate_decomposition_model.mjs` - Node.js ONNX parity validation against Python predictions
- `scripts/training-data/decomposition.jsonl` - 42,168 training examples (25 task + 10 decision patterns)
- `public/models/classifiers/decomposition.onnx` - Trained 2.7MB ONNX model
- `public/models/classifiers/decomposition-classes.json` - Index-to-label mapping for 35 categories

## Decisions Made
- Used MLP(256,128) matching Phase 17 multi-class architecture -- 35 classes benefits from larger hidden layers
- Single-classifier scripts (no --classifier CLI flag) since decomposition is one model unlike Phase 17's four
- 42,168 total examples (1000 per category + 17% ambiguous borderline cases) -- above the 30K+ target
- Confidence threshold set to 0.70 -- at this threshold 99.8% of predictions are above threshold with 99.7% accuracy

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- decomposition.onnx ready for integration into the embedding worker (Plan 02)
- decomposition-classes.json provides label mapping for template lookup
- Validation artifacts (test embeddings, predictions, probabilities) available for regression testing

## Self-Check: PASSED

- All 6 created files verified on disk
- Commit 3b42be1 (Task 1) verified in git log
- Commit 0e4dc50 (Task 2) verified in git log

---
*Phase: 18-tier-2-next-action-decomposition-model*
*Completed: 2026-03-08*
