---
phase: 10-browser-inference-integration
plan: "02"
subsystem: ai/tier2
tags: [onnx, tier2, worker, classifier, triage, store]
dependency_graph:
  requires:
    - 10-01 (CLASSIFY_ONNX handler in embedding worker, CLASSIFIER_READY/PROGRESS events)
  provides:
    - ONNX classify-type path in Tier 2 handler via CLASSIFY_ONNX worker message
    - classifierLoadProgress and classifierReady signals in store
    - Shared embedding worker singleton (ensureEmbeddingWorker)
    - modelSuggestion capture on every triage suggestion (CONF-03)
    - alternativeType and confidenceSpread on ambiguous ONNX results
  affects:
    - src/ai/tier2/tier2-handler.ts
    - src/ai/tier2/types.ts
    - src/ai/triage.ts
    - src/ui/signals/store.ts
    - src/ui/views/SearchOverlay.tsx
    - src/ui/views/InboxView.tsx
tech_stack:
  added: []
  patterns:
    - Dual-path handler: ONNX primary, centroid fallback via getClassifierReady() gate
    - Shared worker singleton exported from store (prevents duplicate model loading)
    - modelSuggestion captured pre-interaction for model-collapse loop prevention (CONF-03)
    - confidenceSpread < 0.15 = ambiguous, returns alternativeType for UI affordance
key_files:
  created: []
  modified:
    - src/ai/tier2/tier2-handler.ts (classifyViaONNX, dual path, getClassifierReady param)
    - src/ai/tier2/types.ts (alternativeType and confidenceSpread on TieredResult)
    - src/ai/triage.ts (TriageSuggestion extended, modelSuggestion populated both paths)
    - src/ui/signals/store.ts (classifierLoadProgress, classifierReady, ensureEmbeddingWorker, initTieredAI update)
    - src/ui/views/SearchOverlay.tsx (use ensureEmbeddingWorker from store)
    - src/ui/views/InboxView.tsx (logClassification includes tier, confidence, modelSuggestion)
decisions:
  - "TieredResult extended with alternativeType and confidenceSpread rather than casting — cleaner type contract between handler and triage"
  - "ensureEmbeddingWorker() exported from store.ts (not SearchOverlay) so Tier 2 handler can get the same worker instance via getEmbeddingWorker()"
  - "updateTier2Centroids() exported for future use by centroid rebuild pipeline — centroid references held in initTieredAI closure"
  - "SearchOverlay uses ensureEmbeddingWorker() — no behavioral change for search, just uses shared instance"
  - "InboxView logClassification approximates numeric confidence from 'high'/'low' as 0.85/0.5 (sufficient for logging; exact value from ONNX probabilities not available at UI layer)"
metrics:
  duration: "~7 minutes"
  completed: "2026-03-04T18:13:47Z"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 6
  files_created: 0
---

# Phase 10 Plan 02: ONNX Pipeline Wiring Summary

ONNX classifier connected to Tier 2 handler with dual-path (ONNX primary / centroid fallback), classifier lifecycle signals wired to store, shared embedding worker singleton prevents duplicate instances, and modelSuggestion captured pre-interaction to prevent model-collapse feedback loops.

## What Was Built

### Task 1: Tier 2 Handler ONNX Path + TriageSuggestion Extension (commit: 4f71466)

**`src/ai/tier2/tier2-handler.ts` — Dual-path classify-type:**

Added `classifyViaONNX()` function parallel to existing `classifyViaWorker()`. Sends `{ type: 'CLASSIFY_ONNX', id, text }` to embedding worker using same UUID correlation pattern as centroid path. Worker embeds text + runs ONNX session in one round-trip.

Updated `createTier2Handler()` signature:
```typescript
export function createTier2Handler(
  getWorker: () => Worker | null,
  getTypeCentroids: () => CentroidSet | null,
  getSectionCentroids: () => CentroidSet | null,
  getClassifierReady: () => boolean,  // NEW
)
```

`canHandle()` for `classify-type`: if `getClassifierReady()` is true, returns true without requiring centroids (ONNX handles it). Falls through to centroid check otherwise.

`handle()` for `classify-type`:
- ONNX path: computes top-1 and top-2 from per-class probabilities, `confidenceSpread = best - second`, `alternativeType` set when `spread < 0.15` (ambiguous). Uses `bestScore` directly as confidence (Platt-calibrated, no transform needed).
- Centroid fallback path: unchanged from Phase 8 implementation.

`route-section` path: unchanged (centroid cosine similarity, no ONNX equivalent until Phase 12).

**`src/ai/tier2/types.ts` — TieredResult extended:**
```typescript
alternativeType?: AtomType;      // Second-best when ONNX spread < 0.15
confidenceSpread?: number;       // Top-1 minus top-2 probability
```

**`src/ai/triage.ts` — TriageSuggestion extended:**
```typescript
alternativeType?: AtomType;      // Passed through from TieredResult
confidenceSpread?: number;       // Passed through from TieredResult
modelSuggestion?: AtomType;      // Model's top-1 BEFORE user changes anything (CONF-03)
```

Both tiered path and direct dispatchAI (Tier 3) path now set `modelSuggestion`:
- Tiered: `modelSuggestion: result.type` at the moment of `onSuggestion()` call
- Direct: `suggestion.modelSuggestion = suggestion.suggestedType` before `onSuggestion()`

### Task 2: Classifier Lifecycle Signals + Shared Worker (commit: c612e5b)

**`src/ui/signals/store.ts` — Classifier signals:**
```typescript
const [classifierLoadProgress, setClassifierLoadProgress] = createSignal<number | null>(null);
const [classifierReady, setClassifierReady] = createSignal(false);
export { classifierLoadProgress, classifierReady };
```

`classifierLoadProgress`: `null` = idle/ready, `0-100` = download percent, `-1` = indeterminate (from Cache API load)

**Shared embedding worker:**
```typescript
export function getEmbeddingWorker(): Worker | null  // Returns current instance or null
export function ensureEmbeddingWorker(): Worker      // Creates if needed, attaches lifecycle listeners
```

Worker lifecycle listener (attached once on creation):
- `CLASSIFIER_PROGRESS`: sets `classifierLoadProgress(percent ?? -1)`
- `CLASSIFIER_READY`: clears progress, sets `classifierReady(true)`
- `CLASSIFIER_ERROR`: clears progress silently (per locked decision — degrade to centroid path)

**Updated `initTieredAI()`:**
1. Loads persisted type and section centroids from Dexie
2. Calls `ensureEmbeddingWorker()` to create shared worker
3. Sends `{ type: 'LOAD_CLASSIFIER' }` for eager ONNX loading
4. Creates `Tier2Handler` with `() => classifierReady()` getter
5. Registers Tier 2 in the pipeline via `registerHandler(tier2)`

**`src/ui/views/SearchOverlay.tsx`:** Removed local `embeddingWorker` singleton and `getOrCreateWorker()`. Now calls `ensureEmbeddingWorker()` imported from store. No behavioral change for search — still the same worker, same event listener pattern.

**`src/ui/views/InboxView.tsx`:** Updated `logClassification` call in `classifyItem()`:
```typescript
const currentSuggestion = triageSuggestions().get(item.id);
logClassification({
  // ... existing fields ...
  tier: currentSuggestion?.tier,
  confidence: currentSuggestion?.confidence === 'high' ? 0.85 : 0.5,
  modelSuggestion: currentSuggestion?.modelSuggestion,
});
```

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Implementation Notes

The plan's `initTieredAI()` pseudocode referenced a `getCentroidSet('type')` function that doesn't exist in `centroid-builder.ts` (which has `loadTypeCentroids()` / `loadSectionCentroids()`). Adapted to use the actual API: loaded persisted centroids from Dexie at init time and stored in closure variables. Also added `updateTier2Centroids()` export for future centroid rebuild pipeline use.

## Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit --skipLibCheck` | PASS — no new errors (only pre-existing VoiceCapture/vite.config) |
| `pnpm build` | PASS — `tier2-handler-*.js` 3.73 kB, index bundles include classifierLoadProgress |
| `CLASSIFY_ONNX` in tier2-handler bundle | PASS |
| `classifierLoadProgress` in store bundle | PASS |
| `LOAD_CLASSIFIER` sent in initTieredAI | PASS |
| `modelSuggestion` in triage.ts tiered path | PASS |
| `modelSuggestion` in triage.ts direct path | PASS |
| `modelSuggestion` in InboxView logClassification | PASS |
| `ensureEmbeddingWorker` in SearchOverlay | PASS |

## Self-Check

### File existence:
- `src/ai/tier2/tier2-handler.ts` — FOUND
- `src/ai/tier2/types.ts` — FOUND
- `src/ai/triage.ts` — FOUND
- `src/ui/signals/store.ts` — FOUND
- `src/ui/views/SearchOverlay.tsx` — FOUND
- `src/ui/views/InboxView.tsx` — FOUND

### Commits:
- `4f71466` — feat(10-02): add ONNX classify-type path and extend TriageSuggestion type
- `c612e5b` — feat(10-02): wire classifier lifecycle signals and shared embedding worker

## Self-Check: PASSED
