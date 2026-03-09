---
phase: 23-cloud-tutored-local-model-reinforcement
plan: 02
subsystem: ml-training
tags: [anthropic-api, adversarial-generation, gap-analysis, gtd, onnx, classifier]

# Dependency graph
requires:
  - phase: 23-cloud-tutored-local-model-reinforcement
    plan: 01
    provides: "Classifier registry (CLASSIFIER_REGISTRY) and benchmark pipeline with JSON output"
provides:
  - "Adversarial edge case generator targeting weakest classes with indirect prompts"
  - "Systematic GTD gap analysis producing Markdown reports and extracting training examples"
affects: [23-03-distillation, 23-04-retrain]

# Tech tracking
tech-stack:
  added: []
  patterns: [indirect-prompt-adversarial, budget-allocation-by-f1, gap-analysis-structured-output]

key-files:
  created:
    - scripts/train/51_generate_adversarial.py
    - scripts/train/52_gap_analysis.py
  modified: []

key-decisions:
  - "Indirect prompts describe scenarios (not labels) to avoid label leakage in adversarial generation"
  - "Budget allocation: 40% for F1<0.90, 35% for F1 0.90-0.95, 25% for F1>0.95; decomposition focuses bottom-10 classes only"
  - "20% of adversarial budget reserved for boundary pair generation targeting most confused class pairs"
  - "Gap analysis uses David Allen system prompt with structured output schema enforcing 3-7 gaps with severity ratings"
  - "Suggested examples from gap analysis extracted and appended to training JSONL automatically (not just reported)"

patterns-established:
  - "Indirect adversarial prompts: describe the scenario, not the label, to prevent leakage into generated text"
  - "Budget allocation from benchmark F1: weakest classes get proportionally more generation budget"
  - "Gap analysis as dual output: Markdown report for human review + JSONL append for automated training"

requirements-completed: [TUTOR-02, TUTOR-03]

# Metrics
duration: 6min
completed: 2026-03-09
---

# Phase 23 Plan 02: Adversarial Generator and Gap Analysis Summary

**Adversarial edge case generator with F1-weighted budget allocation and systematic GTD gap analysis producing both Markdown reports and training JSONL via Anthropic structured output**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-09T03:53:58Z
- **Completed:** 2026-03-09T04:00:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Adversarial generator with indirect prompts (avoids label leakage), F1-weighted budget allocation, boundary pair generation, and type-classifier-specific augmentation scenarios (compound tasks, ambiguous facts, vague events, implicit decisions, frustrated-tone insights)
- Gap analysis script using David Allen system prompt that identifies 3-7 systematic GTD blind spots per classifier, produces structured Markdown report, and extracts suggested examples into training JSONL
- Both scripts follow established patterns: dotenv, argparse, structured output, rate limiting, tqdm, classifier registry import

## Task Commits

Each task was committed atomically:

1. **Task 1: Create adversarial data generator** - `be1c65a` (feat)
2. **Task 2: Create gap analysis script** - `edbf19d` (feat)

## Files Created/Modified
- `scripts/train/51_generate_adversarial.py` - Adversarial edge case generation via Anthropic API (759 lines)
- `scripts/train/52_gap_analysis.py` - Systematic GTD knowledge gap identification (738 lines)

## Decisions Made
- Indirect prompts describe scenarios ("someone listing multiple things they need to do") rather than labels ("generate a task") to prevent label leakage into generated text
- F1-weighted budget allocation: classes with lowest F1 scores get 40% of generation budget, mid-range get 35%, strong get 25%
- Decomposition classifier (35 classes) focuses budget on bottom-10 F1 classes only to avoid negligible impact
- 20% of adversarial budget reserved for boundary pair generation targeting the most confused class pairs from the confusion matrix
- Gap analysis uses structured output schema with severity enum (high/medium/low) and extracts suggested examples into training JSONL automatically
- Classifiers with >99% accuracy are skipped by adversarial generator (diminishing returns)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - ANTHROPIC_API_KEY already configured in .env.local from prior phases.

## Next Phase Readiness
- Both scripts validated with live API calls (dry-run for adversarial, full run for gap analysis)
- Adversarial generator ready for bulk execution across all 12 classifiers
- Gap analysis ready for Sonnet-quality analysis of all classifiers
- Both scripts produce JSONL data compatible with existing train scripts (03, 21, 31, 41)

---
*Phase: 23-cloud-tutored-local-model-reinforcement*
*Completed: 2026-03-09*
