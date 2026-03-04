---
phase: 09-python-training-infrastructure
plan: 02
subsystem: infra
tags: [python, sklearn, onnx, onnxruntime-web, calibration, validation, classifier]

# Dependency graph
requires:
  - phase: 09-python-training-infrastructure
    plan: 01
    provides: embeddings_cache.npy, labels_cache.npy, label_map.json from 02_embed_data.py
provides:
  - scripts/train/03_train_classifier.py (MLP training, Platt calibration, ONNX export, validation artifact generation)
  - scripts/train/04_validate_model.mjs (browser-runtime WASM validation harness)
  - public/models/classifiers/triage-type.onnx (when training is run — committed after developer executes pipeline)
  - public/models/classifiers/triage-type-classes.json (class index to label mapping)
  - onnxruntime-web devDependency in package.json
affects:
  - 10-browser-integration (consumes triage-type.onnx and triage-type-classes.json from classifiers/)

# Tech tracking
tech-stack:
  added:
    - onnxruntime-web 1.24.2 (devDependency — WASM backend for browser-parity validation)
  patterns:
    - skl2onnx export with target_opset=17 and options={'zipmap': False} for WASM compatibility
    - CalibratedClassifierCV(method='sigmoid', cv=5) wraps base MLP for Platt scaling (CONF-01)
    - Browser-parity validation via onnxruntime-web/wasm import in Node.js (same .wasm binary as browsers)
    - JSON test artifact handoff between Python (script 03) and Node.js (script 04) validation
    - argmax on probability output (not label output) for consistent top-1 comparison
    - 95% top-1 match rate as hard pass/fail gate before Phase 10 deployment (TRAIN-03)

key-files:
  created:
    - scripts/train/03_train_classifier.py
    - scripts/train/04_validate_model.mjs
  modified:
    - package.json (added onnxruntime-web ^1.24.2 to devDependencies)
    - pnpm-lock.yaml (updated lockfile)

key-decisions:
  - "onnxruntime-web/wasm (not onnxruntime-web/node) used in 04_validate_model.mjs — ensures same WASM binary as browsers, giving true browser-parity validation (TRAIN-03 requirement)"
  - "argmax on probability output used for top-1 in both Python and Node.js, not the ort label output — ensures consistent comparison regardless of dtype conversion"
  - "Python predictions derived from onnxruntime (not sklearn predict) to match ONNX model behavior, not sklearn behavior — critical for detecting ONNX export bugs"

# Metrics
duration: 5min
completed: 2026-03-04
---

# Phase 9 Plan 02: Classifier Training and ONNX Export Summary

**Calibrated MLPClassifier (256,128) training script with Platt scaling + ONNX export (opset=17, zipmap=False) and onnxruntime-web WASM validation harness enforcing >95% top-1 match rate**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-04T05:33:28Z
- **Completed:** 2026-03-04T05:38:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Created `03_train_classifier.py`: full pipeline from embedding cache to validated ONNX export — MLP(256,128), CalibratedClassifierCV(sigmoid, cv=5), evaluation with classification report, calibration analysis at 0.78 threshold, decision/insight F1 boundary warning, ONNX export with opset=17 + zipmap=False, class mapping JSON, and test artifact generation for script 04
- Created `04_validate_model.mjs`: Node.js ESM validation harness using onnxruntime-web/wasm (browser-equivalent WASM backend) with >95% top-1 match rate as hard gate, probability diff analysis, mismatch reporting, and clear prerequisite error messages
- Installed `onnxruntime-web 1.24.2` as devDependency (satisfies transitive dependency from @huggingface/transformers and enables validation script)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create classifier training and ONNX export script** - `e847a1f` (feat)
2. **Task 2: Create browser-runtime validation harness and install onnxruntime-web** - `6ca2fa7` (feat)

## Files Created/Modified

- `scripts/train/03_train_classifier.py` - Train MLP, apply Platt calibration, export ONNX, generate validation artifacts
- `scripts/train/04_validate_model.mjs` - Browser-runtime WASM validation harness, 95% top-1 pass/fail gate
- `package.json` - Added onnxruntime-web ^1.24.2 to devDependencies
- `pnpm-lock.yaml` - Updated lockfile with onnxruntime-web resolution

## Decisions Made

- `onnxruntime-web/wasm` (not `onnxruntime-web/node`) is imported in the validation script. The Node.js condition in package.json exports maps the default `onnxruntime-web` import to the native Node.js backend — using `onnxruntime-web/wasm` explicitly forces the WASM execution path, which is the same binary browsers use. This is what TRAIN-03 requires.
- Python validation artifacts (`python_predictions.json`) are derived from Python onnxruntime inference on the ONNX model — not from sklearn's `predict()`. This ensures the comparison catches ONNX export bugs (e.g., wrong opset, zipmap enabled) that sklearn would not reveal.
- argmax over the probability output is used for top-1 comparison in both Python and Node.js. The ONNX label output has dtype handling differences between ort versions; probability argmax is numerically stable and consistent.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all verification checks passed on first attempt. onnxruntime-web installed cleanly and the `onnxruntime-web/wasm` import path works in Node.js ESM.

## Pipeline Status

The full 4-script reproducible chain is now complete:

1. `python scripts/train/01_generate_data.py` — Generate JSONL corpus via Anthropic (requires ANTHROPIC_API_KEY)
2. `python scripts/train/02_embed_data.py` — Embed corpus with MiniLM, produce .npy caches
3. `python scripts/train/03_train_classifier.py` — Train MLP, export triage-type.onnx, generate test artifacts
4. `node scripts/train/04_validate_model.mjs` — Validate ONNX with WASM backend, enforce >95% top-1 match (TRAIN-03)

## Next Phase Readiness

- Phase 10 browser integration can consume `public/models/classifiers/triage-type.onnx` and `triage-type-classes.json`
- The 0.78 confidence threshold (STATE.md locked decision) is embedded in the calibration analysis output of script 03 — actual escalation rate on held-out set is printed for adjustment before Phase 10 integration
- decision/insight boundary warning in script 03 will flag if F1 < 0.65 per STATE.md concern

## Self-Check: PASSED

- FOUND: scripts/train/03_train_classifier.py
- FOUND: scripts/train/04_validate_model.mjs
- FOUND: .planning/phases/09-python-training-infrastructure/09-02-SUMMARY.md
- FOUND commit: e847a1f (Task 1)
- FOUND commit: 6ca2fa7 (Task 2)
- All 9 verification checks passed

---
*Phase: 09-python-training-infrastructure*
*Completed: 2026-03-04*
