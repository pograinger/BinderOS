---
phase: 23-cloud-tutored-local-model-reinforcement
plan: 01
subsystem: ml-training
tags: [onnx, sklearn, anthropic-api, benchmark, classifier, gtd]

# Dependency graph
requires:
  - phase: 17-tier2-gtd-classification
    provides: "GTD ONNX classifiers (type, gtd-routing, actionability, project-detection, context-tagging)"
  - phase: 18-tier2-decomposition
    provides: "Decomposition ONNX classifier (35-class)"
  - phase: 19-tier2-clarification-wizard
    provides: "Clarification ONNX classifiers (completeness-gate, 5 missing-info)"
provides:
  - "Central classifier registry (CLASSIFIER_REGISTRY) with metadata for all 12 ONNX classifiers"
  - "Baseline benchmark pipeline producing per-class precision/recall/F1 metrics"
  - "Cloud expert exam generation via Anthropic API with GTD methodology depth"
  - "Machine-readable JSON results for downstream scripts (51-53)"
affects: [23-02-adversarial, 23-03-gap-analysis, 23-04-distillation]

# Tech tracking
tech-stack:
  added: []
  patterns: [classifier-registry-pattern, two-model-anthropic-strategy, expert-exam-generation]

key-files:
  created:
    - scripts/train/classifier_registry.py
    - scripts/train/50_benchmark_models.py
    - scripts/train/reports/.gitkeep
    - scripts/training-data/expert-exam/.gitkeep
  modified: []

key-decisions:
  - "Lazy-load class names from classes JSON for decomposition (35) and context-tagging (6) to avoid hardcoding"
  - "Expert exam uses batch schema (array of examples per API call) for efficiency vs single-example calls"
  - "Expert exam 57.5% accuracy on actionability confirms genuine difficulty vs 99.4% baseline -- validates approach"

patterns-established:
  - "classifier_registry.py: shared module imported by all 50-53 scripts with CLASSIFIER_REGISTRY dict, path constants, MODEL_MAP"
  - "Two-model strategy: haiku for bulk generation, sonnet for quality analysis via --model flag"
  - "Expert exam stored separately in scripts/training-data/expert-exam/ (not mixed with training JSONL)"

requirements-completed: [TUTOR-01]

# Metrics
duration: 12min
completed: 2026-03-09
---

# Phase 23 Plan 01: Classifier Registry and Benchmark Summary

**Classifier registry with 12 ONNX classifier metadata and benchmark pipeline producing stratified per-class F1 metrics plus Anthropic API expert exam generation**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-09T03:44:55Z
- **Completed:** 2026-03-09T03:55:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Central classifier registry covering all 12 ONNX classifiers with JSONL paths, train/validate scripts, architecture, class names, and GTD methodology definitions
- Benchmark script with stratified 80/20 split, sklearn classification_report, confusion matrices, and low-confidence example identification
- Cloud expert exam generation using Anthropic structured output with difficulty tiers (easy/medium/hard/adversarial) and deep GTD methodology prompts
- Machine-readable JSON output enabling downstream 51-53 scripts to target weakest classifiers and classes

## Task Commits

Each task was committed atomically:

1. **Task 1: Create classifier registry and benchmark script** - `f3f935e` (feat)
2. **Task 2: Verify expert exam generation with single classifier** - no commit (verification-only task, no code changes needed)

## Files Created/Modified
- `scripts/train/classifier_registry.py` - Central registry of 12 classifiers with metadata, GTD definitions, path constants, MODEL_MAP
- `scripts/train/50_benchmark_models.py` - Baseline benchmarking + cloud expert exam generation and scoring
- `scripts/train/reports/.gitkeep` - Output directory for benchmark reports
- `scripts/training-data/expert-exam/.gitkeep` - Output directory for expert exam JSONL files

## Decisions Made
- Lazy-loaded class names from classes JSON files for decomposition (35 classes) and context-tagging (6 classes) to avoid hardcoding and stay in sync with trained models
- Expert exam uses batch schema (array of examples per API call) rather than single-example calls for efficiency
- Type classifier augmentation hints from memory notes embedded directly in expert exam prompts
- Expert exam verified at 57.5% accuracy on actionability (vs 99.4% baseline) -- confirms the expert exam provides genuinely challenging boundary cases

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required. ANTHROPIC_API_KEY already configured in .env.local from prior phases.

## Next Phase Readiness
- Classifier registry ready for import by 51_generate_adversarial.py, 52_gap_analysis.py, 53_distill_labels.py
- Benchmark pipeline validated end-to-end (baseline + expert exam)
- JSON output format established for downstream consumption

---
*Phase: 23-cloud-tutored-local-model-reinforcement*
*Completed: 2026-03-09*
