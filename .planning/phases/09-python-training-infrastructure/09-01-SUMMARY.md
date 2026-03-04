---
phase: 09-python-training-infrastructure
plan: 01
subsystem: infra
tags: [python, sentence-transformers, anthropic, onnx, sklearn, training-data, classifier]

# Dependency graph
requires:
  - phase: 08-tiered-pipeline
    provides: ClassificationEvent interface in classification-log.ts that modelSuggestion extends
provides:
  - Python training scaffold in scripts/train/ with pinned requirements.txt
  - Anthropic structured-output data generator (01_generate_data.py)
  - MiniLM embedding generator with browser parity verification (02_embed_data.py)
  - modelSuggestion optional field on ClassificationEvent interface
  - Directory structure: scripts/training-data/ and public/models/classifiers/
affects:
  - 09-02 (train and validate classifier — depends on JSONL output and embedding cache)
  - 10-browser-integration (consumes triage-type.onnx from public/models/classifiers/)

# Tech tracking
tech-stack:
  added:
    - sentence-transformers==5.2.3 (Python MiniLM embedding with browser parity)
    - scikit-learn>=1.6,<1.7 (classifier training in plan 02)
    - skl2onnx==1.20.0 (ONNX export in plan 02)
    - onnxruntime>=1.20,<1.22 (Python validation in plan 02)
    - anthropic>=0.45,<1.0 (structured output data generation)
    - python-dotenv>=1.0,<2.0 (load ANTHROPIC_API_KEY from .env.local)
    - numpy>=1.26,<2.0 (embedding cache .npy files)
    - onnx>=1.17,<1.18 (ONNX graph inspection in plan 02)
    - tqdm>=4.66,<5.0 (progress bars in generation loop)
  patterns:
    - Anthropic structured outputs via output_config.format/json_schema (no retry/parsing needed)
    - normalize_embeddings=True for Python-browser embedding parity
    - 5 style variants per label rotation for training data diversity
    - .npy caches gitignored; JSONL corpus and label_map.json committed
    - Optional TypeScript field addition to JSON-blob config table requires no Dexie migration

key-files:
  created:
    - scripts/train/requirements.txt
    - scripts/train/README.md
    - scripts/train/01_generate_data.py
    - scripts/train/02_embed_data.py
    - scripts/training-data/.gitkeep
    - public/models/classifiers/.gitkeep
  modified:
    - .gitignore
    - src/storage/classification-log.ts

key-decisions:
  - "modelSuggestion field added as optional AtomType on ClassificationEvent — no Dexie migration needed since ClassificationEvent is stored as JSON blob in config table, not indexed records"
  - "embeddings_cache.npy and labels_cache.npy gitignored — reproducible from committed JSONL; label_map.json committed as needed by browser"
  - "JSONL corpus in scripts/training-data/ committed — small files (~1MB), auditable, required for TRAIN-04 reproducibility without API key"
  - "!public/models/classifiers/ gitignore exception added so trained classifier heads (~200-400KB) can be committed for Phase 10 browser integration"

patterns-established:
  - "Pattern: Anthropic structured outputs use output_config.format with json_schema for guaranteed schema compliance in data generation loops"
  - "Pattern: Python embedding scripts must use normalize_embeddings=True to match browser Xenova/all-MiniLM-L6-v2 { normalize: true } setting"
  - "Pattern: Parity verification in 02_embed_data.py asserts shape (N, 384), dtype float32, and |norm - 1.0| < 1e-5 for each vector"

requirements-completed: [TRAIN-01, TRAIN-04]

# Metrics
duration: 5min
completed: 2026-03-04
---

# Phase 9 Plan 01: Python Training Infrastructure Scaffold Summary

**4-script Python training pipeline scaffold with synthetic GTD data generator (Anthropic structured outputs), MiniLM embedding script (browser parity), pinned requirements.txt, and modelSuggestion field on ClassificationEvent**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-04T05:23:30Z
- **Completed:** 2026-03-04T05:28:44Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Created `scripts/train/` scaffold with `requirements.txt` (9 pinned Python deps) and `README.md` (full 4-step pipeline guide with reproducibility instructions)
- Created `01_generate_data.py`: Anthropic structured-output generation loop with 5 style variants per label, JSONL output, `--resume` flag, diversity summary, retry with exponential backoff
- Created `02_embed_data.py`: MiniLM embedding with `normalize_embeddings=True` for browser parity, `.npy` cache output, `label_map.json`, and L2-norm parity verification
- Added `modelSuggestion?: AtomType` to `ClassificationEvent` interface (no Dexie migration needed — JSON blob storage pattern)
- Updated `.gitignore`: `!public/models/classifiers/` exception and Python intermediates block

## Task Commits

Each task was committed atomically:

1. **Task 1: Create training infrastructure scaffold and update gitignore** - `78f85e5` (feat)
2. **Task 2: Create synthetic data generation and embedding scripts** - `7ade9b8` (feat)

**Plan metadata:** (added below)

## Files Created/Modified

- `scripts/train/requirements.txt` - Pinned Python dependencies for reproducible environment
- `scripts/train/README.md` - Step-by-step reproduction instructions for all 4 pipeline scripts
- `scripts/train/01_generate_data.py` - Synthetic GTD data generation via Anthropic Claude Haiku structured outputs
- `scripts/train/02_embed_data.py` - MiniLM embedding with browser parity verification and .npy cache output
- `scripts/training-data/.gitkeep` - Directory placeholder; committed JSONL corpus lives here
- `public/models/classifiers/.gitkeep` - Directory placeholder; trained ONNX classifier lives here
- `.gitignore` - Added `!public/models/classifiers/` exception and Python intermediates block
- `src/storage/classification-log.ts` - Added `modelSuggestion?: AtomType` to ClassificationEvent interface

## Decisions Made

- `modelSuggestion` is optional (not required) on ClassificationEvent — existing entries just have the field undefined; no DB migration needed
- Python embedding uses `normalize_embeddings=True` to match browser's `{ normalize: true }` — any deviation causes silent accuracy loss (distribution shift)
- JSONL corpus is committed (small, auditable, needed for TRAIN-04 reproducibility); `.npy` caches are gitignored (reproducible from JSONL)
- `!public/models/classifiers/` exception in `.gitignore` so trained ONNX files (~200-400KB each) can be committed for Phase 10 browser integration

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all verification checks passed on first attempt.

## User Setup Required

To run the data generation script, a developer needs:
- `ANTHROPIC_API_KEY` in `.env.local` at the repo root
- Python 3.11+ and `pip install -r scripts/train/requirements.txt`

The embedding script (02) needs no API key — it only downloads the sentence-transformers model from HuggingFace on first run.

## Next Phase Readiness

- Phase 9 Plan 02 (train and validate classifier) can proceed immediately
- `01_generate_data.py` is ready to generate the JSONL corpus when an API key is available
- `02_embed_data.py` will produce browser-parity embeddings from the committed JSONL
- `ClassificationEvent.modelSuggestion` field is in place for Phase 10 classifier integration

---
*Phase: 09-python-training-infrastructure*
*Completed: 2026-03-04*
