---
phase: 32-predictive-enrichment-scorer
plan: "02"
subsystem: enrichment
tags: [predictive-scorer, momentum, enrichment, store-wiring, sidecar]
dependency_graph:
  requires:
    - src/ai/enrichment/predictive-scorer.ts
    - src/ai/enrichment/momentum-builder.ts
    - src/config/binder-types/gtd-personal/prediction.json
    - src/storage/atom-intelligence.ts
    - src/ui/signals/store.ts
  provides:
    - src/ai/enrichment/enrichment-engine.ts (updated — predictive ordering live)
    - src/storage/atom-intelligence.ts (writePredictionMomentum, writeEntityMomentum)
  affects:
    - src/config/binder-types/index.ts (prediction.json now merged)
    - src/ai/enrichment/enrichment-engine.test.ts (updated + 3 new wiring tests)
tech_stack:
  added: []
  patterns:
    - fire-and-forget-sidecar-snapshot
    - backward-compatible-optional-params
    - signal-vector-adaptation
    - triage-completion-cache-invalidation
key_files:
  created: []
  modified:
    - src/ai/enrichment/enrichment-engine.ts
    - src/ai/enrichment/enrichment-engine.test.ts
    - src/storage/atom-intelligence.ts
    - src/ui/signals/store.ts
    - src/config/binder-types/index.ts
decisions:
  - "createEnrichmentSession() remains synchronous — caller (store.ts) computes momentum before calling and passes result in"
  - "SignalVector adapted to scorer format inline — scorer's atomSignals type is narrower than SignalVector; topLabel maps to label"
  - "prediction.json was missing from index.ts mergeGtdPersonalConfig() — added import and merge fields as Rule 3 auto-fix (blocker)"
  - "Re-enrichment call sites use fallback path — momentum ordering set on initial wizard open, no re-computation in deepening"
  - "computeFallbackRelevance() is private, not exported — safety net only; all new callers should use predictEnrichmentOrder()"
metrics:
  duration: "14 minutes"
  completed: "2026-03-13"
  tasks_completed: 2
  files_created: 0
  files_modified: 5
  tests_added: 3
---

# Phase 32 Plan 02: Predictive Enrichment Scorer Wiring Summary

Predictive scorer wired end-to-end: store.ts computes momentum before enrichment session creation, enrichment-engine uses predictEnrichmentOrder() for live question ordering, sidecar snapshots enable harness analysis.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Wire predictive scorer into enrichment engine, add sidecar helpers, and add wiring tests | c0f11eb | enrichment-engine.ts, enrichment-engine.test.ts, atom-intelligence.ts |
| 2 | Wire store.ts caller to compute momentum and pass to enrichment session + invalidate cache on triage | f2b496f | store.ts, index.ts |

## What Was Built

**enrichment-engine.ts changes:**
- Deleted `SIGNAL_CATEGORY_MAP` constant (was hardcoded, now lives in prediction.json)
- Deleted `computeSignalRelevance()` function (replaced by `predictEnrichmentOrder()`)
- Added `momentum`, `entityScores`, `signalCategoryMap`, `entityCategoryMap`, `entityTypePriorityWeights` optional params to `createEnrichmentSession()`
- Sorting logic: if momentum provided → `predictEnrichmentOrder()`; if only cognitiveSignals → `computeFallbackRelevance()` (backward compat); neither → default order
- `SignalVector` adapted inline to scorer's narrower `{ signals: Record<string, { label, confidence }> }` format using `topLabel`
- `computeFallbackRelevance()` is private — safety net for callers that haven't migrated yet

**atom-intelligence.ts additions:**
- `writePredictionMomentum(atomId, snapshot)` — fire-and-forget async, writes `predictionMomentum` sidecar field
- `writeEntityMomentum(atomId, snapshot)` — fire-and-forget async, writes `entityMomentum` sidecar field
- Both follow established fire-and-forget pattern: IIFE, try/catch, console.warn on failure, never throw

**store.ts caller wiring (startEnrichment):**
- Fetches `getBinderConfig()` for `predictionConfig`
- Calls `computeMomentumVector(binderId, predictionConfig)` before session creation
- Calls `computeEntityTrajectory(binderId, atomEntityIds, predictionConfig)` for entity boost
- Fire-and-forget snapshots via `writePredictionMomentum` / `writeEntityMomentum`
- Extracts `cognitiveSignals` from `intel.cognitiveSignals` sidecar (was hardcoded null before)
- Passes all momentum/signals/config to `createEnrichmentSession()` — predictive scorer is live
- All wrapped in `if (predictionConfig)` guard — degrades gracefully for non-GTD binder types
- Adds `invalidateCache(binderId, 'triage-complete')` after `setTriageStatus('complete')`
- Four re-enrichment call sites annotated: "momentum ordering was set on initial wizard open; no re-computation needed"

**binder-types/index.ts auto-fix:**
- Added `import prediction from './gtd-personal/prediction.json'`
- Added `predictionConfig`, `signalCategoryMap`, `entityCategoryMap`, `entityTypePriorityWeights` to `mergeGtdPersonalConfig()` — prediction.json was listed in manifest.json but never imported

**Test updates (enrichment-engine.test.ts):**
- Updated Test 7 to pass `signalCategoryMap` parameter (required now that hardcoded constant is deleted)
- Added `TEST_SIGNAL_CATEGORY_MAP` constant matching former hardcoded `SIGNAL_CATEGORY_MAP`
- Phase32-1: warm momentum uses `predictEnrichmentOrder` — verifies outcome/timeframe ranked before next-action
- Phase32-2: no momentum falls back to signal-based ordering — verifies fallback path with signalCategoryMap
- Phase32-3: neither momentum nor signals preserves default ordering — no crash safety test

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] prediction.json not imported in binder-types/index.ts**
- **Found during:** Task 2 implementation
- **Issue:** `binderConfig.predictionConfig` would always be `undefined` — the `if (predictionConfig)` guard would never enter, making the entire momentum computation dead code. The manifest.json listed prediction.json but `mergeGtdPersonalConfig()` never imported or merged it.
- **Fix:** Added `import prediction from './gtd-personal/prediction.json'` and merged all 4 prediction fields into the config object.
- **Files modified:** src/config/binder-types/index.ts
- **Commit:** f2b496f (included in Task 2 commit)

**2. [Rule 1 - Bug] SignalVector type incompatible with predictEnrichmentOrder atomSignals param**
- **Found during:** Task 1 TypeScript check
- **Issue:** `predictEnrichmentOrder` expects `{ signals: Record<string, { label: string; confidence: number }> } | null` but `SignalVector.signals` is `Partial<Record<CognitiveModelId, CognitiveSignal>>`. `CognitiveSignal` has more fields and uses `topLabel` not `label`.
- **Fix:** Added inline adaptation in `createEnrichmentSession()`: maps `topLabel → label` using `Object.entries` + `fromEntries`. Clean narrow conversion, no type assertions needed.
- **Files modified:** src/ai/enrichment/enrichment-engine.ts
- **Commit:** c0f11eb

**3. [Rule 1 - Bug] computeFallbackRelevance accessing typed signals with string key**
- **Found during:** Task 1 TypeScript check
- **Issue:** `signals.signals[modelId]` where `modelId` is `string` but `Partial<Record<CognitiveModelId, CognitiveSignal>>` requires `CognitiveModelId` key — required re-importing `CognitiveModelId` type.
- **Fix:** Added `import type { CognitiveModelId }` and cast `modelId as CognitiveModelId` in the fallback function. Also updated Test 7 to pass `signalCategoryMap` so it exercises the actual fallback behavior.
- **Files modified:** src/ai/enrichment/enrichment-engine.ts, enrichment-engine.test.ts
- **Commit:** c0f11eb

## Self-Check: PASSED

- FOUND: src/ai/enrichment/enrichment-engine.ts (updated — contains predictEnrichmentOrder)
- FOUND: src/storage/atom-intelligence.ts (contains writePredictionMomentum and writeEntityMomentum)
- FOUND: src/ui/signals/store.ts (contains computeMomentumVector call and invalidateCache call)
- FOUND: src/config/binder-types/index.ts (contains prediction.json import and merged fields)
- FOUND commits: c0f11eb, f2b496f
- GREP: computeSignalRelevance NOT in enrichment-engine.ts — CONFIRMED
- GREP: SIGNAL_CATEGORY_MAP NOT in enrichment-engine.ts — CONFIRMED
- GREP: predictEnrichmentOrder IS in enrichment-engine.ts — CONFIRMED
- GREP: computeMomentumVector IS in store.ts — CONFIRMED
- GREP: invalidateCache IS in store.ts after setTriageStatus — CONFIRMED
