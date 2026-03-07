---
phase: 17-tier-2-gtd-classification-models
plan: 01
subsystem: ai
tags: [onnx, sklearn, mlp, platt-calibration, gtd, faker, sentence-transformers]

# Dependency graph
requires:
  - phase: 09-python-training-infrastructure
    provides: "MLP + Platt + ONNX export pattern (03_train_classifier.py)"
  - phase: 14-sanitization-classifier
    provides: "Faker-based template data generation pattern (10_generate_sanitization_data.py)"
provides:
  - "Four trained ONNX classifiers: gtd-routing, actionability, project-detection, context-tagging"
  - "Faker-based GTD training data generator (20_generate_gtd_data.py)"
  - "MLP training + ONNX export script (21_train_gtd_classifier.py)"
  - "Node.js ONNX validation harness (22_validate_gtd_models.mjs)"
  - "JSONL training datasets for all 4 classifiers"
affects: [17-02, 17-03, embedding-worker, tier2-handler, triage]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Multi-classifier training via --classifier flag", "Per-classifier MLP architecture config"]

key-files:
  created:
    - scripts/train/20_generate_gtd_data.py
    - scripts/train/21_train_gtd_classifier.py
    - scripts/train/22_validate_gtd_models.mjs
    - public/models/classifiers/gtd-routing.onnx
    - public/models/classifiers/actionability.onnx
    - public/models/classifiers/project-detection.onnx
    - public/models/classifiers/context-tagging.onnx
    - scripts/training-data/gtd-routing.jsonl
    - scripts/training-data/actionability.jsonl
    - scripts/training-data/project-detection.jsonl
    - scripts/training-data/context-tagging.jsonl
  modified: []

key-decisions:
  - "MLP (256,128) for multi-class (gtd-routing, context-tagging); MLP (128,64) for binary (actionability, project-detection)"
  - "All 4 models achieve >98% test accuracy, far exceeding >90% target (>85% for context-tagging)"
  - "100% Python/Node parity across all 4 models"

patterns-established:
  - "Multi-classifier training script: single --classifier flag dispatches to per-classifier config"
  - "Validation artifacts per classifier: gtd_{name}_test_embeddings.json, predictions, probabilities"

requirements-completed: [GTD-01, GTD-02, GTD-03, GTD-04, GTD-05]

# Metrics
duration: 10min
completed: 2026-03-07
---

# Phase 17 Plan 01: GTD Classification Models Summary

**Four ONNX GTD classifiers trained via MiniLM+MLP+Platt pipeline: routing (99.0%), actionability (99.4%), project-detection (98.5%), context-tagging (99.1%), all with 100% Python/Node parity**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-07T05:07:45Z
- **Completed:** 2026-03-07T05:18:03Z
- **Tasks:** 2
- **Files modified:** 26

## Accomplishments
- Created Faker-based training data generator with 15-20% ambiguous borderline examples per classifier
- Trained 4 ONNX classifiers all exceeding accuracy targets (98.5-99.4% vs 90% target)
- Achieved 100% Python/Node.js ONNX inference parity across all 4 models
- Balanced context-tagging templates deliberately to avoid @computer overrepresentation

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Faker-based GTD training data generator** - `d0439c4` (feat)
2. **Task 2: Create MLP training + ONNX export, train all 4 models** - `c193904` (feat)

## Files Created/Modified
- `scripts/train/20_generate_gtd_data.py` - Faker-based synthetic data generation for 4 GTD classifiers
- `scripts/train/21_train_gtd_classifier.py` - MLP training + Platt calibration + ONNX export
- `scripts/train/22_validate_gtd_models.mjs` - Node.js ONNX validation harness with --all flag
- `public/models/classifiers/gtd-routing.onnx` - 4-way GTD list routing model (2594 KB)
- `public/models/classifiers/actionability.onnx` - Binary actionability model (1134 KB)
- `public/models/classifiers/project-detection.onnx` - Binary project detection model (1134 KB)
- `public/models/classifiers/context-tagging.onnx` - 6-way context tagging model (2603 KB)
- `scripts/training-data/gtd-routing.jsonl` - 4819 training examples (4 labels x 1000 + ambiguous)
- `scripts/training-data/actionability.jsonl` - 2409 training examples
- `scripts/training-data/project-detection.jsonl` - 2409 training examples
- `scripts/training-data/context-tagging.jsonl` - 7228 training examples (6 labels x 1000 + ambiguous)

## Decisions Made
- Used (256, 128) hidden layers for multi-class classifiers (gtd-routing, context-tagging) and (128, 64) for binary classifiers (actionability, project-detection) per plan spec
- Template diversity includes domain-specific verbs per context (@errands: pick up, drop off; @phone: call, dial; @home: clean, fix, mow)
- Ambiguous examples labeled by "most GTD-orthodox" interpretation as specified

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 4 ONNX models ready for browser inference integration in Phase 17-02
- Validation artifacts in scripts/train/ available for regression testing
- Per-classifier confidence thresholds documented in 21_train_gtd_classifier.py CLASSIFIER_CONFIGS

---
*Phase: 17-tier-2-gtd-classification-models*
*Completed: 2026-03-07*
