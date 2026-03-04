# BinderOS GTD Classifier Training Pipeline

This directory contains the Python training pipeline that produces the `triage-type.onnx`
classifier used by the browser-side Tier 2 AI in Phase 10.

## Prerequisites

- Python 3.11+
- `ANTHROPIC_API_KEY` set in `.env.local` at the repo root (same key used for the browser AI)
- ~$0.50-2.00 in Anthropic API credits for data generation (Haiku pricing)

## Setup

```bash
cd scripts/train
pip install -r requirements.txt
```

This installs sentence-transformers, scikit-learn, skl2onnx, onnxruntime, and the Anthropic SDK.

## Pipeline Steps

### Step 1: Generate Training Data (requires API key)

```bash
python 01_generate_data.py
```

Generates 300-500 synthetic GTD examples per atom type (task, fact, event, decision, insight)
via the Anthropic Claude Haiku API. Uses structured outputs to guarantee valid JSON.

Output: `scripts/training-data/type-classification.jsonl`

Estimated cost: ~$0.50-2.00 (2000 examples at Haiku pricing).
Estimated time: ~15-30 minutes (2000+ API calls with rate limiting).

Options:
- `--count N` — generate N examples per label (default 400)
- `--resume` — skip labels that already have enough examples in the JSONL

### Step 2: Embed Training Data (no API key needed)

```bash
python 02_embed_data.py
```

Embeds all examples in the JSONL using the same MiniLM model the browser uses
(`sentence-transformers/all-MiniLM-L6-v2` with mean pooling and L2 normalization).
Downloads the model on first run (~90MB, cached in HuggingFace cache).

Output:
- `scripts/train/embeddings_cache.npy` — 384-dim float32 embedding matrix (gitignored)
- `scripts/train/labels_cache.npy` — integer label array (gitignored)
- `scripts/train/label_map.json` — class index to label name mapping (committed)

### Step 3: Train Classifier (coming in Phase 9 Plan 02)

```bash
python 03_train_classifier.py
```

Trains a 2-layer MLP on the cached embeddings, applies Platt calibration, and exports
the full pipeline to ONNX.

Output: `public/models/classifiers/triage-type.onnx`

### Step 4: Validate Model (coming in Phase 9 Plan 02)

```bash
node 04_validate_model.mjs
```

Run from the repo root. Loads the ONNX file with `onnxruntime-web` (WASM backend, same engine
as the browser) and confirms >95% top-1 prediction match against Python inference on 50+ inputs.

This is the acceptance gate before browser integration in Phase 10.

## File Map

```
scripts/train/
    requirements.txt        — pinned Python dependencies (committed)
    README.md               — this file (committed)
    01_generate_data.py     — Anthropic API → JSONL (committed)
    02_embed_data.py        — MiniLM embed → .npy cache (committed)
    03_train_classifier.py  — train + calibrate + export ONNX (Phase 9 Plan 02)
    label_map.json          — class index to label name (committed, written by script 02)
    embeddings_cache.npy    — gitignored (re-generate with script 02)
    labels_cache.npy        — gitignored (re-generate with script 02)

scripts/training-data/
    type-classification.jsonl   — labeled training examples (committed)

public/models/classifiers/
    triage-type.onnx            — trained classifier (committed when available)
    triage-type-classes.json    — class mapping for browser (committed when available)
```

## Reproducibility

To fully reproduce from scratch on a new machine:

1. Install Python 3.11+ and pip
2. `cd scripts/train && pip install -r requirements.txt`
3. Set `ANTHROPIC_API_KEY` in `.env.local` at repo root
4. `python 01_generate_data.py` (generates new JSONL — will differ slightly from committed data)
5. `python 02_embed_data.py` (deterministic given same JSONL)
6. `python 03_train_classifier.py` (deterministic given same embeddings + random_state=42)
7. `node 04_validate_model.mjs` from repo root

To reproduce exactly from committed JSONL (no API key needed):
Start from step 5 — the committed `scripts/training-data/type-classification.jsonl` is the
canonical training corpus.

## Technical Notes

- Embeddings must use `normalize_embeddings=True` to match the browser's `{ normalize: true }`
- ONNX export uses `target_opset=17` for WASM backend compatibility
- The classifier head is ~200-400KB — small enough to commit and ship in Phase 10
- `skl2onnx` exports with `zipmap=False` so `output_probability` is a float32 array
