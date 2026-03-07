---
phase: 14-sanitization-classifier
plan: "01"
subsystem: ai
tags: [onnx, ner, distilbert, transformers, faker, seqeval, sanitization, pii]

# Dependency graph
requires:
  - phase: 09-python-training
    provides: training pipeline pattern (scripts/train/01-04)
provides:
  - Quantized ONNX NER model for browser-side PII detection
  - BIO-tagged synthetic data generator for 5 entity categories
  - Training pipeline with HuggingFace Trainer and ONNX export
  - Browser-side validation script using Transformers.js
affects: [14-sanitization-classifier, sanitization-worker]

# Tech tracking
tech-stack:
  added: [transformers, datasets, optimum, seqeval, faker]
  patterns: [HuggingFace Trainer for token classification, BIO tagging, ONNX quantization via Optimum]

key-files:
  created:
    - scripts/train/10_generate_sanitization_data.py
    - scripts/train/11_train_sanitizer.py
    - scripts/train/12_validate_sanitizer.mjs
    - public/models/sanitization/onnx/model_quantized.onnx
    - public/models/sanitization/config.json
    - public/models/sanitization/tokenizer.json
    - public/models/sanitization/sanitize-check-classes.json
    - scripts/training-data/sanitization-ner.jsonl
    - scripts/train/sanitization_label_map.json
  modified:
    - scripts/train/requirements.txt

key-decisions:
  - "DistilBERT-base-cased achieves 99.8% recall on synthetic NER data -- well above 0.85 gate"
  - "Q8 dynamic quantization produces 62.6 MB model, acceptable for browser loading"
  - "Faker-based synthetic data (not Claude API) for NER training -- deterministic, fast, free"

patterns-established:
  - "BIO tagging with tokenize_and_align_labels: only first subword gets label, rest -100"
  - "seqeval for entity-level metrics (not token-level) in NER evaluation"

requirements-completed: [SNTZ-02]

# Metrics
duration: 48min
completed: 2026-03-07
---

# Phase 14 Plan 01: Sanitization NER Training Pipeline Summary

**DistilBERT NER model fine-tuned on 4000 synthetic BIO-tagged samples with 99.8% recall, exported to quantized ONNX (62.6 MB) and validated via Transformers.js**

## Performance

- **Duration:** 48 min (mostly training time on CPU)
- **Started:** 2026-03-07T02:39:53Z
- **Completed:** 2026-03-07T03:28:42Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Trained DistilBERT-base-cased for token classification across 5 PII entity categories (PERSON, LOCATION, FINANCIAL, CONTACT, CREDENTIAL)
- Achieved 99.8% recall on test set (1.0 precision, 1.0 F1 on validation) -- far exceeding 0.85 gate
- Exported Q8 quantized ONNX model (62.6 MB) ready for browser-side inference
- Browser validation confirms all 5 entity categories detected correctly via Transformers.js pipeline

## Task Commits

Each task was committed atomically:

1. **Task 1: Synthetic BIO-tagged data generator and training pipeline** - `037682c` (feat) + `546c164` (feat: training artifacts)
2. **Task 2: Browser-side ONNX validation script** - `db8a211` (feat)

## Files Created/Modified
- `scripts/train/10_generate_sanitization_data.py` - Faker-based BIO-tagged NER data generator for 5 entity categories
- `scripts/train/11_train_sanitizer.py` - DistilBERT fine-tuning + ONNX export with Q8 quantization
- `scripts/train/12_validate_sanitizer.mjs` - Transformers.js token-classification pipeline validation
- `scripts/train/requirements.txt` - Added transformers, datasets, optimum, seqeval, faker
- `scripts/training-data/sanitization-ner.jsonl` - 4000 BIO-tagged training samples
- `scripts/train/sanitization_label_map.json` - O/B-*/I-* tag ID mapping
- `public/models/sanitization/config.json` - DistilBERT model config with NER labels
- `public/models/sanitization/tokenizer.json` - Cased tokenizer vocabulary
- `public/models/sanitization/tokenizer_config.json` - Tokenizer configuration
- `public/models/sanitization/special_tokens_map.json` - CLS/SEP/PAD token mapping
- `public/models/sanitization/sanitize-check-classes.json` - Label-to-ID mapping for inference
- `public/models/sanitization/onnx/model_quantized.onnx` - Quantized NER model (62.6 MB)

## Decisions Made
- Used Faker library (not Claude API) for data generation -- deterministic, fast, zero cost
- DistilBERT-base-cased selected (vs uncased) to preserve entity casing patterns
- Q8 dynamic quantization via Optimum reduces model from ~130 MB to 62.6 MB
- 5 epochs sufficient -- model converges to perfect recall by epoch 2

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Training ran on CPU (no GPU detected) -- took ~42 minutes for 5 epochs on 3200 training samples
- Transformers.js aggregation_strategy='simple' returns per-subword entities rather than fully merged spans, but all categories are correctly detected

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Quantized ONNX NER model is in public/models/sanitization/ ready for sanitization-worker.ts to load
- Model validated with Transformers.js -- same runtime used in browser
- Plan 02 (sanitization pipeline) is already complete -- wired the worker and core sanitizer

## Self-Check: PASSED

All 9 files verified present. All 3 commits verified in git log.

---
*Phase: 14-sanitization-classifier*
*Completed: 2026-03-07*
