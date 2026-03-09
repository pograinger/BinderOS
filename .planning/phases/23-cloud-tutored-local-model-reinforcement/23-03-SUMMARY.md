---
phase: 23-cloud-tutored-local-model-reinforcement
plan: 03
subsystem: ml-training
tags: [anthropic-api, distillation, teacher-student, retrain, onnx, classifier, gtd]

# Dependency graph
requires:
  - phase: 23-cloud-tutored-local-model-reinforcement
    plan: 01
    provides: "Classifier registry, benchmark pipeline with JSON output, expert exam scoring"
  - phase: 23-cloud-tutored-local-model-reinforcement
    plan: 02
    provides: "Adversarial generator and gap analysis producing augmented JSONL data"
provides:
  - "Teacher-student distillation feeding low-confidence predictions to Claude for expert corrections"
  - "Retrain-and-report orchestrator automating full cycle: retrain, validate, benchmark, compare"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: [teacher-student-distillation, correction-only-training, retrain-orchestrator, regression-detection]

key-files:
  created:
    - scripts/train/53_distill_labels.py
    - scripts/train/54_retrain_and_report.py
  modified: []

key-decisions:
  - "Only corrections (Claude disagrees with model) appended to training JSONL -- confirmations logged but not duplicated"
  - "Distillation defaults to Sonnet model for quality over quantity (unlike adversarial gen which uses Haiku)"
  - "Retrain orchestrator calls existing train scripts via subprocess without modifying them"
  - "Sequential retraining: no parallel execution due to shared WASM/GPU resources"
  - "0.5% accuracy drop threshold triggers prominent regression warning in reports"
  - "Validation scripts grouped by pipeline type to avoid redundant runs"

patterns-established:
  - "Correction-only distillation: only teacher disagreements are high-value training signals worth appending"
  - "Subprocess orchestration: retrain scripts called externally, never imported, preserving isolation"
  - "Regression safety gate: before/after comparison with threshold-based alerting"

requirements-completed: [TUTOR-04, TUTOR-05]

# Metrics
duration: 5min
completed: 2026-03-09
---

# Phase 23 Plan 03: Distillation and Retrain-Report Summary

**Teacher-student distillation via Claude Sonnet with correction-only JSONL append, plus retrain orchestrator with before/after regression-checked comparison reports**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-09T04:02:31Z
- **Completed:** 2026-03-09T04:07:48Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Teacher-student distillation script identifies low-confidence and incorrect predictions, feeds them to Claude with deep GTD methodology prompts, and appends only corrections to training data
- Retrain-and-report orchestrator automates the full cycle (retrain all 12 classifiers, Node.js validation, re-benchmark, before/after comparison) via subprocess without modifying existing scripts
- Regression detection warns prominently if any classifier accuracy drops more than 0.5% after augmentation

## Task Commits

Each task was committed atomically:

1. **Task 1: Create teacher-student distillation script** - `fb997c8` (feat)
2. **Task 2: Create retrain-and-report orchestrator** - `1f3988b` (feat)

## Files Created/Modified
- `scripts/train/53_distill_labels.py` - Teacher-student distillation: identifies candidates, feeds to Claude, appends corrections to JSONL, produces distillation report
- `scripts/train/54_retrain_and_report.py` - Retrain orchestrator: calls train scripts (02+03, 21, 31, 41) via subprocess, runs Node.js validation, re-benchmarks, generates before/after comparison report

## Decisions Made
- Only corrections (where Claude disagrees with the model's prediction) are appended to training data -- confirmations are logged but not duplicated since the model already handles those
- Retrain orchestrator uses subprocess isolation so existing train scripts (01-42 series) are never imported or modified
- 0.5% accuracy regression threshold chosen as safety gate -- prominent WARNING in both stdout and report if any classifier degrades
- Validation scripts run once per pipeline type (type, gtd, decomposition, clarification) rather than per classifier

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 5 scripts (50-54) in the cloud-tutored reinforcement pipeline are complete
- Full active learning loop: benchmark -> adversarial gen -> gap analysis -> distillation -> retrain -> compare
- Pipeline ready for end-to-end execution on all 12 classifiers

---
*Phase: 23-cloud-tutored-local-model-reinforcement*
*Completed: 2026-03-09*
