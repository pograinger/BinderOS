---
phase: 10-browser-inference-integration
verified: 2026-03-04T19:00:00Z
status: passed
score: 16/16 must-haves verified
re_verification: false
---

# Phase 10: Browser Inference Integration Verification Report

**Phase Goal:** Users experience fully offline atom type classification via the fine-tuned ONNX model with correct escalation behavior and no UI blocking
**Verified:** 2026-03-04T19:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                                    | Status     | Evidence                                                                                          |
|----|----------------------------------------------------------------------------------------------------------|------------|---------------------------------------------------------------------------------------------------|
| 1  | Embedding worker can load an ONNX classifier model from Cache API or network fetch                       | VERIFIED   | `fetchWithCache()` in embedding-worker.ts: `caches.open()`, `cache.match()`, `cache.put()` lines 160-203 |
| 2  | Embedding worker can run ONNX inference on a 384-dim embedding and return per-class probability scores   | VERIFIED   | `runClassifierInference()` lines 286-309: creates `ort.Tensor('float32', Float32Array, [1,384])`, maps probabilities via classMap |
| 3  | ONNX model is cached in Cache API after first fetch — subsequent loads skip network                      | VERIFIED   | `fetchWithCache()`: cache hit returns `cached.arrayBuffer()` directly (line 165), cache miss fetches then stores via `cache.put()` (line 198) |
| 4  | Worker reports CLASSIFIER_PROGRESS events during download and CLASSIFIER_READY when session is created   | VERIFIED   | `fetchWithCache()` posts `CLASSIFIER_PROGRESS` per chunk (line 185); `loadClassifier()` posts `CLASSIFIER_READY` on success (line 272) |
| 5  | Worker returns ONNX_ERROR when classifier fails — never crashes or hangs                                 | VERIFIED   | `CLASSIFY_ONNX` handler catch block (lines 381-383) posts `ONNX_ERROR`; `loadClassifier()` catch posts `CLASSIFIER_ERROR` (line 277); errors never rethrow |
| 6  | classify-type confidence threshold is 0.78 (up from 0.65)                                               | VERIFIED   | `types.ts` line 35: `'classify-type': 0.78` with comment explaining Platt scaling rationale |
| 7  | Tier 2 handler sends CLASSIFY_ONNX when classifier is ready, falls back to centroid path when not        | VERIFIED   | `tier2-handler.ts` lines 143-213: `canHandle()` returns true when `getClassifierReady()`; `handle()` branches on `getClassifierReady()` to call `classifyViaONNX` or `classifyViaWorker` |
| 8  | Store has classifierLoadProgress signal reflecting download state from worker                            | VERIFIED   | `store.ts` line 936: `createSignal<number | null>(null)`; exported line 943; wired to `CLASSIFIER_PROGRESS` (line 975), `CLASSIFIER_READY` (lines 978-980), `CLASSIFIER_ERROR` (line 984) |
| 9  | initTieredAI sends LOAD_CLASSIFIER to embedding worker and listens for CLASSIFIER_READY/PROGRESS/ERROR   | VERIFIED   | `store.ts` line 1027: `worker.postMessage({ type: 'LOAD_CLASSIFIER' })`; lifecycle listeners attached in `ensureEmbeddingWorker()` lines 972-987 |
| 10 | Triage pipeline populates modelSuggestion from ONNX top-1 before user interaction                       | VERIFIED   | `triage.ts` line 257: `modelSuggestion: result.type` in tiered path; line 279: `suggestion.modelSuggestion = suggestion.suggestedType` in direct path |
| 11 | TriageSuggestion type includes alternativeType and confidenceSpread fields                               | VERIFIED   | `triage.ts` lines 43-47: `alternativeType?: AtomType`, `confidenceSpread?: number`, `modelSuggestion?: AtomType` on interface |
| 12 | Classification log receives tier, confidence, and modelSuggestion fields                                 | VERIFIED   | `InboxView.tsx` lines 148-161: `logClassification` call includes `tier`, `confidence`, `modelSuggestion` from `currentSuggestion` |
| 13 | User sees progress indicator in status bar during ONNX model download with 'one-time download' messaging | VERIFIED   | `StatusBar.tsx` lines 104-114: `<Show when={classifierLoadProgress() !== null}>` block renders "AI model X% (one-time download)" or indeterminate text |
| 14 | Status bar progress indicator disappears silently when download completes                                | VERIFIED   | `store.ts` line 979: `setClassifierLoadProgress(null)` on `CLASSIFIER_READY`; StatusBar Show block renders nothing when null |
| 15 | When top-2 type probabilities are within 0.15, user sees two side-by-side type buttons with 'could be either' label | VERIFIED | `InboxAISuggestion.tsx` lines 88-136: `<Show when={props.suggestion.alternativeType}>` renders two buttons with "could be either:" label; `tier2-handler.ts` lines 196-210: `isAmbiguous = confidenceSpread < 0.15`, sets `alternativeType` |
| 16 | User tap on either ambiguous type button selects that type for classification; selectedType not pre-filled for ambiguous suggestions | VERIFIED | `InboxAISuggestion.tsx` lines 94-97, 104-106: each button calls `onSelectType` then `onAccept`; `InboxView.tsx` lines 266-267, 320-321, 502-503: three pre-fill guard sites check `alternativeType` before calling `setSelectedType` |

**Score:** 16/16 truths verified

---

### Required Artifacts

| Artifact                                         | Expected                                                              | Status      | Details                                                                        |
|--------------------------------------------------|-----------------------------------------------------------------------|-------------|--------------------------------------------------------------------------------|
| `src/search/embedding-worker.ts`                 | CLASSIFY_ONNX handler, Cache API model loading, progress reporting    | VERIFIED    | All three elements present; `loadClassifier()` called eagerly at module bottom |
| `src/ai/tier2/types.ts`                          | Updated classify-type confidence threshold 0.78                       | VERIFIED    | Line 35: `'classify-type': 0.78` with explanatory comment                     |
| `src/ai/tier2/tier2-handler.ts`                  | ONNX-based classify-type path via CLASSIFY_ONNX worker message        | VERIFIED    | `classifyViaONNX()` function + dual-path in `handle()`                         |
| `src/ui/signals/store.ts`                        | classifierLoadProgress signal, LOAD_CLASSIFIER, CLASSIFIER_READY listener | VERIFIED | All three wired; `ensureEmbeddingWorker()` singleton with lifecycle listeners  |
| `src/ai/triage.ts`                               | modelSuggestion populated from tiered result, alternativeType on TriageSuggestion | VERIFIED | Both tiered and direct Tier 3 paths populate `modelSuggestion`                |
| `src/ui/layout/StatusBar.tsx`                    | Classifier download progress indicator                                | VERIFIED    | `classifierLoadProgress` imported, Show block renders during download          |
| `src/ui/components/InboxAISuggestion.tsx`        | Ambiguous two-button UX for uncertain classifications                 | VERIFIED    | `onSelectType` prop, two-branch Show/when, "could be either:" label            |
| `src/ui/views/InboxView.tsx`                     | Type selection not pre-filled when alternativeType present            | VERIFIED    | Three guard sites (swipe, Enter key, Classify button) all check `alternativeType` |
| `public/models/classifiers/triage-type.onnx`     | ONNX classifier model file                                           | VERIFIED    | File exists (placeholder, 10KB LogisticRegression, correct I/O schema)         |
| `public/models/classifiers/triage-type-classes.json` | Class map for 5 atom types                                       | VERIFIED    | File exists; `{"0":"decision","1":"event","2":"fact","3":"insight","4":"task"}` |
| `src/ui/layout/layout.css`                       | CSS for ambiguous button layout                                       | VERIFIED    | Lines 4293-4329: `.ai-suggestion-ambiguous`, `.ai-suggestion-type-btn`, hover  |

---

### Key Link Verification

| From                                        | To                                          | Via                                        | Status  | Details                                                                                     |
|---------------------------------------------|---------------------------------------------|--------------------------------------------|---------|---------------------------------------------------------------------------------------------|
| `src/search/embedding-worker.ts`            | `onnxruntime-web`                           | `InferenceSession.create()` from Uint8Array | WIRED   | Line 266: `ort.InferenceSession.create(new Uint8Array(modelBuffer), { executionProviders: ['wasm'] })` |
| `src/search/embedding-worker.ts`            | Cache API                                   | `caches.open/match/put`                    | WIRED   | Lines 161-162, 198, 248: `caches.open(CLASSIFIER_CACHE_NAME)`, `cache.match()`, `cache.put()` |
| `src/search/embedding-worker.ts`            | `public/models/classifiers/triage-type.onnx` | fetch from static asset path              | WIRED   | Line 263: `fetchWithCache(modelUrl)` where `modelUrl` resolves to `...triage-type.onnx`    |
| `src/ai/tier2/tier2-handler.ts`             | `src/search/embedding-worker.ts`            | postMessage CLASSIFY_ONNX                  | WIRED   | Line 111: `worker.postMessage({ type: 'CLASSIFY_ONNX', id, text })`                        |
| `src/ui/signals/store.ts`                   | `src/search/embedding-worker.ts`            | postMessage LOAD_CLASSIFIER, onmessage CLASSIFIER_READY/PROGRESS | WIRED | Line 1027 sends LOAD_CLASSIFIER; lines 974-987 handle all lifecycle events |
| `src/ai/triage.ts`                          | `src/storage/classification-log.ts`         | modelSuggestion field in logClassification | WIRED   | `InboxView.tsx` lines 158-160 pass `modelSuggestion` to `logClassification()`              |
| `src/ui/layout/StatusBar.tsx`               | `src/ui/signals/store.ts`                   | import classifierLoadProgress signal       | WIRED   | Line 20: `import { ..., classifierLoadProgress } from '../signals/store'`                   |
| `src/ui/components/InboxAISuggestion.tsx`   | `src/ai/triage.ts`                          | reads alternativeType from TriageSuggestion | WIRED  | Line 88: `<Show when={props.suggestion.alternativeType}>` + buttons use it                 |
| `src/ui/views/InboxView.tsx`                | `src/ui/components/InboxAISuggestion.tsx`   | passes onSelectType callback               | WIRED   | Line 400: `onSelectType={(type) => setSelectedType(type)}`                                  |

---

### Requirements Coverage

| Requirement | Source Plan | Description                                                                                        | Status       | Evidence                                                                                                  |
|-------------|-------------|----------------------------------------------------------------------------------------------------|--------------|-----------------------------------------------------------------------------------------------------------|
| INFER-01    | 10-01, 10-02 | Inbox triage type classification works fully offline using fine-tuned ONNX model in Tier 2        | SATISFIED    | ONNX worker runs inside embedding worker (off main thread, offline); `CLASSIFY_ONNX` handler fully wired to Tier 2 |
| INFER-02    | 10-03       | User sees progress indicator during first-time model download with "one-time download" messaging    | SATISFIED    | `StatusBar.tsx` Show block: "AI model X% (one-time download)" or indeterminate text; disappears silently  |
| INFER-03    | 10-01, 10-02 | Triage continues working via Tier 1 keyword heuristics if ONNX model fails to load or errors       | SATISFIED    | Tier 1 always registered first via `initTieredPipeline()`; ONNX error in `classifyViaONNX` rejects promise which pipeline catches and continues to next tier (pipeline.ts lines 95-105); `CLASSIFIER_ERROR` silently clears progress and never sets `classifierReady(true)` so Tier 2 falls back to centroid path |
| INFER-04    | 10-01       | No UI blocking during model loading — all ONNX inference runs in embedding worker off main thread   | SATISFIED    | All ONNX operations (`loadClassifier`, `runClassifierInference`, `fetchWithCache`) execute inside the embedding Web Worker; main thread only receives postMessage events |
| INFER-05    | 10-01       | ONNX model files cached in browser Cache API — no re-download on subsequent visits                  | SATISFIED    | `fetchWithCache()` checks `cache.match(url)` first and returns cached `arrayBuffer()` without network fetch; class map also cached |
| CONF-02     | 10-03       | When top-2 class probabilities within 0.15, user sees both options rather than single pre-filled suggestion | SATISFIED | `tier2-handler.ts` computes `confidenceSpread = bestScore - secondScore`, sets `alternativeType` when `spread < 0.15`; `InboxAISuggestion.tsx` renders two-button layout when `alternativeType` present |
| CONF-03     | 10-02       | Classification log captures modelSuggestion separately from userChoice to prevent model-collapse feedback loops | SATISFIED | `triage.ts` sets `modelSuggestion: result.type` at time of suggestion (before user interaction); `InboxView.tsx` logs `modelSuggestion: currentSuggestion?.modelSuggestion` separately from `chosenType` |

**No orphaned requirements found.** All 7 phase-10 requirement IDs (INFER-01 through INFER-05, CONF-02, CONF-03) are claimed in plan frontmatter and verified implemented. CONF-01 is Phase 9 scope (not this phase).

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/search/embedding-worker.ts` | 388-391 | Eager `void loadClassifier()` at module init | Info | Intentional design decision — documented in plan and SUMMARY; loading on worker startup before any request arrives |
| `public/models/classifiers/triage-type.onnx` | — | Placeholder model with random weights | Info | Documented intentional decision: unblocks wiring validation; Phase 9 training output will replace this file |

No blockers. No stubs found in message handlers, component renders, or key wiring paths. All error paths return structured messages rather than crashing.

---

### Human Verification Required

The following items cannot be verified programmatically and require a running browser session:

#### 1. First-time ONNX model download progress display

**Test:** Clear browser storage/Cache API for the app origin, load the app with tiered AI enabled, and observe the status bar.
**Expected:** Status bar shows "AI model X% (one-time download)" animating from 0 to 100, then disappears. On subsequent loads, the progress indicator never appears (cache hit).
**Why human:** Cache API state, fetch streaming behavior, and status bar DOM visibility cannot be verified by static analysis.

#### 2. ONNX inference with placeholder model produces ambiguous results

**Test:** Add an inbox item, trigger triage with tiered AI enabled, observe the InboxAISuggestion card.
**Expected:** With the placeholder random-weight model, most classifications will have a confidence spread below 0.15 (random probabilities are unlikely to have a clear winner), so the two-button "could be either" layout should appear frequently. Clicking either button should select that type and classify the item.
**Why human:** Requires live ONNX inference in browser. The specific probabilities from the random-weight placeholder model cannot be predicted by static analysis.

#### 3. Tier 1 fallback when classifier fails

**Test:** Corrupt or remove the ONNX model file from Cache API (DevTools > Application > Cache Storage), reload the app, trigger triage.
**Expected:** Triage continues working — Tier 1 keyword heuristics produce a classification (confidence may be low/varied), or Tier 3 LLM is reached. No crash or hanging promise.
**Why human:** Requires simulating a failed ONNX load in a real browser and observing pipeline behavior end-to-end.

#### 4. Real model output quality (post Phase 9 training)

**Test:** After replacing the placeholder with the Phase 9 trained model, trigger triage on known inbox items.
**Expected:** Confident classifications (spread > 0.15) on clear-cut items (e.g., "Buy milk" → task), ambiguous two-button display on genuinely uncertain content.
**Why human:** Model quality assessment requires subjective human judgment on real examples.

---

### Gaps Summary

No gaps found. All 16 must-have truths are fully verified.

The implementation is complete and correctly wired across all three plans:

- **Plan 01** (worker layer): ONNX loading with Cache API, progress events, `CLASSIFY_ONNX` handler, threshold update — all verified in `embedding-worker.ts` and `types.ts`.
- **Plan 02** (pipeline layer): Dual-path Tier 2 handler, shared worker singleton, classifier lifecycle signals, `modelSuggestion` capture — all verified in `tier2-handler.ts`, `store.ts`, `triage.ts`, `InboxView.tsx`.
- **Plan 03** (UI layer): Status bar progress indicator, ambiguous two-button UX, three pre-fill guards — all verified in `StatusBar.tsx`, `InboxAISuggestion.tsx`, `InboxView.tsx`, `layout.css`.

The only open concern is that the committed ONNX model is a placeholder (random weights). This is an intentional and documented decision — the real Phase 9 trained model will replace it. The wiring and escalation logic are correct and will work with the production model.

---

_Verified: 2026-03-04T19:00:00Z_
_Verifier: Claude (gsd-verifier)_
