---
phase: 10-browser-inference-integration
plan: "01"
subsystem: search/ai
tags: [onnx, worker, cache-api, inference, classification]
dependency_graph:
  requires: []
  provides:
    - CLASSIFY_ONNX message handler in embedding worker
    - Cache API model persistence for ONNX classifier
    - CLASSIFIER_PROGRESS/CLASSIFIER_READY/CLASSIFIER_ERROR events
    - classify-type confidence threshold 0.78
  affects:
    - src/search/embedding-worker.ts
    - src/ai/tier2/types.ts
tech_stack:
  added: [onnxruntime-web (already installed, now imported in worker)]
  patterns:
    - Cache API for binary model persistence from workers
    - Fetch ReadableStream for chunk-by-chunk download progress
    - ort.InferenceSession.create(Uint8Array) from Cache API or fetch
    - Versioned cache name with cleanOldCaches() for auto-migration
key_files:
  created:
    - public/models/classifiers/triage-type.onnx (placeholder, 10KB, LogisticRegression skl2onnx export)
    - public/models/classifiers/triage-type-classes.json (class map: 0=decision..4=task)
  modified:
    - src/search/embedding-worker.ts (CLASSIFY_ONNX handler, loadClassifier, Cache API loading)
    - src/ai/tier2/types.ts (classify-type threshold 0.65 -> 0.78)
    - .gitignore (fix: use per-subdirectory exclusions instead of parent dir block)
decisions:
  - "Placeholder ONNX (sklearn LogisticRegression, random weights, 10KB) committed to unblock worker wiring validation independent of Phase 9 training"
  - ".gitignore fixed from 'public/models/' + negation (broken) to 'public/models/Xenova/' per-subdirectory approach (correct)"
  - "ort.env.wasm.numThreads = 1 to avoid SharedArrayBuffer requirement and ORT issue #26858"
  - "ort.env.wasm.proxy = false (already inside worker, proxy adds unnecessary indirection)"
  - "CLASSIFY_ONNX receives text (not embedding): worker embeds then classifies in one round-trip, same interface as CLASSIFY_TYPE"
metrics:
  duration: "~25 minutes"
  completed: "2026-03-04T18:01:11Z"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 4
  files_created: 2
---

# Phase 10 Plan 01: ONNX Classifier Worker Integration Summary

ONNX classifier inference added to embedding worker with Cache API model persistence and progress reporting — loader is eager, errors degrade silently to Tier 1, confidence threshold updated to 0.78 for Platt-calibrated probabilities.

## What Was Built

### Task 1: ONNX Classifier in Embedding Worker (commit: 1136744)

Added full ONNX classifier infrastructure to `src/search/embedding-worker.ts` alongside the existing MiniLM pipeline. The two coexist in the same worker with no interference.

**New message types added to WorkerIncoming union:**
- `CLASSIFY_ONNX { id, text }` — embeds text via MiniLM, then runs ONNX inference, returns `ONNX_RESULT { id, scores, vector }` or `ONNX_ERROR { id, error }`
- `LOAD_CLASSIFIER` — explicit trigger for eager loading (fire-and-forget)

**New outgoing message types documented in worker header:**
- `ONNX_RESULT`, `ONNX_ERROR`, `CLASSIFIER_READY`, `CLASSIFIER_PROGRESS`, `CLASSIFIER_ERROR`

**New functions:**
- `fetchWithCache(url)` — Cache API with ReadableStream progress; reports `CLASSIFIER_PROGRESS { percent }` during download; stores in cache on first fetch; subsequent loads skip network entirely
- `cleanOldCaches()` — deletes any `onnx-classifier-*` cache keys that don't match the current version name; auto-migrates when model version changes
- `resolveBase()` — derives model URL base from `self.location.pathname`; handles `/BinderOS/` GitHub Pages prefix vs `/` dev
- `loadClassifier()` — guarded async loader: checks `classifierLoading || classifierSession` to prevent double-load; posts `CLASSIFIER_READY` on success, `CLASSIFIER_ERROR` on any failure; never throws
- `runClassifierInference(embedding)` — creates `ort.Tensor('float32', Float32Array.from(embedding), [1, 384])`, runs session, finds probability output by searching for 'prob' in output name (standard skl2onnx convention), maps Float32Array to `Record<string, number>` via classMap

**ORT configuration:**
- `ort.env.wasm.proxy = false` (already in worker; proxy mode adds indirection)
- `ort.env.wasm.numThreads = 1` (avoids SharedArrayBuffer requirement; safe for ~10KB model)

**Eager loading:** `void loadClassifier()` called at module bottom — loads both class map JSON and ONNX model from Cache API or network on worker startup.

**Placeholder model files committed:**
- `public/models/classifiers/triage-type.onnx` (10KB, LogisticRegression + skl2onnx, random weights, opset 1, outputs: label + probabilities)
- `public/models/classifiers/triage-type-classes.json` (`{"0":"decision","1":"event","2":"fact","3":"insight","4":"task"}`)

**All existing handlers unchanged:** EMBED, EMBED_ATOMS, CLASSIFY_TYPE, ROUTE_SECTION — centroid-based classification still works for ROUTE_SECTION.

### Task 2: Confidence Threshold Update (commit: e9bd092)

Updated `CONFIDENCE_THRESHOLDS['classify-type']` from `0.65` to `0.78` in `src/ai/tier2/types.ts`. Added inline comment explaining the change: centroid similarity scores (Phase 8) vs. Platt-calibrated ONNX probabilities (Phase 10) have different distributions; 0.78 is the calibrated decision boundary from STATE.md locked decisions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] .gitignore negation pattern broken — classifier files not committable**
- **Found during:** Task 1, when attempting to git add the ONNX model files
- **Issue:** `.gitignore` had `public/models/` (excludes entire directory) followed by `!public/models/classifiers/` (negation). Git cannot re-include a subdirectory of an excluded parent — the negation is silently ignored. STATE.md locked decision says classifier heads should be committed.
- **Fix:** Changed `.gitignore` from parent-dir exclusion to per-subdirectory exclusions: `public/models/Xenova/`, `public/models/*.json`, `public/models/*.onnx`. This preserves the exclusion of the large MiniLM model files while allowing `public/models/classifiers/` contents to be committed normally.
- **Files modified:** `.gitignore`
- **Commit:** 1136744

**2. [Rule 2 - Missing functionality] Placeholder ONNX model needed for worker wiring validation**
- **Found during:** Task 1, when verifying model files exist
- **Issue:** `public/models/classifiers/` only had `.gitkeep`. The plan's RESEARCH.md Open Question 3 flagged this: "whether Phase 9 training is complete and `triage-type.onnx` is available." Phase 9 Python infrastructure exists in scripts but was not run. The worker code would fail to load without a model file.
- **Fix:** Generated placeholder ONNX using `sklearn.linear_model.LogisticRegression` + `skl2onnx` with random weights (100 synthetic 384-dim samples, 5 classes). Installed `scikit-learn` and `skl2onnx` for this purpose (temporary; these are Python dev deps). The model has the correct input/output schema: `float_input [None, 384]` → `label` (int64) + `probabilities` (float32 [None, 5]).
- **Files created:** `public/models/classifiers/triage-type.onnx`, `public/models/classifiers/triage-type-classes.json`
- **Commit:** 1136744

## Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit --skipLibCheck` | PASS — no new errors (only pre-existing VoiceCapture/vite.config) |
| `pnpm build` | PASS — `embedding-worker-*.js` 1,273 kB includes ORT; WASM files in dist/ |
| `CLASSIFY_ONNX` in built bundle | PASS — confirmed via grep |
| `caches.open` in built bundle | PASS — confirmed via grep |
| `loadClassifier()` at module init | PASS — last 5 lines of worker file |
| `classify-type: 0.78` in types.ts | PASS — confirmed via grep |

## Self-Check

### File existence:
- `src/search/embedding-worker.ts` — FOUND
- `src/ai/tier2/types.ts` — FOUND
- `public/models/classifiers/triage-type.onnx` — FOUND
- `public/models/classifiers/triage-type-classes.json` — FOUND

### Commits:
- `1136744` — FOUND (feat(10-01): add ONNX classifier inference to embedding worker)
- `e9bd092` — FOUND (feat(10-01): update classify-type confidence threshold from 0.65 to 0.78)

## Self-Check: PASSED
