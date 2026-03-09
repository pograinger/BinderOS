---
phase: 19-tier-2-clarification-wizard-model
plan: 01
subsystem: ai
tags: [onnx, sklearn, mlp, sentence-transformers, clarification, binary-classifier, faker]

# Dependency graph
requires:
  - phase: 17-tier-2-gtd-classification-models
    provides: "MLP + Platt + ONNX training pipeline pattern, ClassifierConfig registry"
  - phase: 18-tier-2-next-action-decomposition-model
    provides: "Decomposition training pipeline pattern, Faker data generation"
provides:
  - "6 trained ONNX binary classifiers for clarification wizard"
  - "Completeness gate model (complete vs incomplete)"
  - "5 missing-info detector models (outcome, next-action, timeframe, context, reference)"
  - "20,600 JSONL training examples across 6 datasets"
  - "Node.js validation script for parity testing"
affects: [19-02, 19-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Clarification classifier training with --classifier all flag"
    - "Enriched text examples in completeness training data to prevent re-triage loops"

key-files:
  created:
    - scripts/train/40_generate_clarification_data.py
    - scripts/train/41_train_clarification_classifier.py
    - scripts/train/42_validate_clarification.mjs
    - public/models/classifiers/completeness-gate.onnx
    - public/models/classifiers/missing-outcome.onnx
    - public/models/classifiers/missing-next-action.onnx
    - public/models/classifiers/missing-timeframe.onnx
    - public/models/classifiers/missing-context.onnx
    - public/models/classifiers/missing-reference.onnx
  modified: []

key-decisions:
  - "MLP(128,64) architecture for all 6 binary classifiers -- matches plan, all exceed 98% accuracy"
  - "1600 examples per label (default) to exceed 20k total training examples"
  - "0.60 confidence threshold for missing-info classifiers, 0.75 for completeness gate"
  - "Enriched text examples (with ---/Outcome/Deadline format) included in completeness training data"

patterns-established:
  - "Clarification training pipeline: 40_generate -> 41_train -> 42_validate"

requirements-completed: [CLAR-01, CLAR-02]

# Metrics
duration: 8min
completed: 2026-03-09
---

# Phase 19 Plan 01: Clarification Training Pipeline Summary

**6 ONNX binary classifiers (1 completeness gate + 5 missing-info detectors) trained with MLP(128,64) + Platt calibration, all exceeding 98% accuracy with 100% Python/Node parity**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-09T02:12:16Z
- **Completed:** 2026-03-09T02:20:30Z
- **Tasks:** 2
- **Files modified:** 39

## Accomplishments
- Trained 6 ONNX binary classifiers all exceeding 98% test accuracy (target was 95%)
- 100% Python/Node prediction parity across all 6 models (0.000000 max probability diff)
- Generated 20,600 training examples across 6 JSONL datasets with balanced classes and ambiguous borderlines
- Included enriched-text examples in completeness gate training data to prevent re-triage infinite loops

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Faker-based clarification training data generator** - `c508183` (feat)
2. **Task 2: Train all 6 classifiers and validate Python/Node parity** - `d1729fc` (feat)

## Files Created/Modified
- `scripts/train/40_generate_clarification_data.py` - Faker-based synthetic data generator for 6 classifiers (470+ lines)
- `scripts/train/41_train_clarification_classifier.py` - MLP training + Platt calibration + ONNX export with --classifier flag (270+ lines)
- `scripts/train/42_validate_clarification.mjs` - Node.js ONNX Runtime parity validation for all 6 models (180+ lines)
- `scripts/training-data/clarification-completeness.jsonl` - 3,600 completeness gate examples
- `scripts/training-data/clarification-missing-outcome.jsonl` - 3,400 missing-outcome examples
- `scripts/training-data/clarification-missing-next-action.jsonl` - 3,400 examples
- `scripts/training-data/clarification-missing-timeframe.jsonl` - 3,400 examples
- `scripts/training-data/clarification-missing-context.jsonl` - 3,400 examples
- `scripts/training-data/clarification-missing-reference.jsonl` - 3,400 examples
- `public/models/classifiers/completeness-gate.onnx` - Completeness gate ONNX model (~1134 KB)
- `public/models/classifiers/missing-*.onnx` - 5 missing-info ONNX models (~1134 KB each)
- `public/models/classifiers/*-classes.json` - 6 class mapping files

## Model Accuracy Results

| Classifier | Test Accuracy | Node Parity | ONNX Size |
|------------|--------------|-------------|-----------|
| completeness-gate | 99.0% | 100% | 1134 KB |
| missing-outcome | 99.4% | 100% | 1134 KB |
| missing-next-action | 99.1% | 100% | 1134 KB |
| missing-timeframe | 98.5% | 100% | 1134 KB |
| missing-context | 99.7% | 100% | 1134 KB |
| missing-reference | 99.7% | 100% | 1134 KB |

## Decisions Made
- MLP(128,64) architecture for all 6 binary classifiers -- all well above 95% accuracy target, no need to upsize
- Default 1600 examples per label to generate 20,600+ total (exceeds 20k minimum)
- 0.60 confidence threshold for 5 missing-info classifiers; 0.75 for completeness gate
- Enriched text examples included in completeness "complete" class to prevent re-triage infinite loops (Research Pitfall 5)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All 6 ONNX models ready for embedding worker integration (Plan 02)
- Validation artifacts available for future retraining verification
- Training pipeline follows established Phase 17/18 patterns exactly

## Self-Check: PASSED

All 15 key files verified present. Both task commits (c508183, d1729fc) verified in git log.

---
*Phase: 19-tier-2-clarification-wizard-model*
*Completed: 2026-03-09*
