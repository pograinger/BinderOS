---
phase: 33
plan: 01
subsystem: sequence-context
tags: [onnx, lstm, ring-buffer, embedding-worker, sequence-context, tier2]
dependency_graph:
  requires: [Phase 30 sequenceContext Dexie table, Phase 32 invalidateCache]
  provides: [ring buffer infrastructure, LSTM session lazy loading, sequence context injection into classifier inference]
  affects: [embedding-worker.ts, tier2-handler.ts, store.ts, triage.ts, types.ts]
tech_stack:
  added: [ring-buffer.ts, sequence-context-concat.ts]
  patterns: [TDD red-green, lazy ONNX session load, ring buffer FIFO eviction, zero-pad cold-start fallback, fire-and-forget Dexie persist]
key_files:
  created:
    - src/search/ring-buffer.ts
    - src/ai/tier2/sequence-context-concat.ts
    - src/search/__tests__/ring-buffer.test.ts
    - src/ai/tier2/__tests__/sequence-concat.test.ts
  modified:
    - src/search/embedding-worker.ts
    - src/ai/tier2/types.ts
    - src/ai/tier2/tier2-handler.ts
    - src/ui/signals/store.ts
    - src/ai/triage.ts
decisions:
  - Ring buffer module extracted as ring-buffer.ts for testability — embedding-worker.ts imports and delegates
  - Simpler concatenation path chosen: CLASSIFY_ONNX accepts optional binderId, worker concatenates internally — avoids separate GET_SEQUENCE_CONTEXT round-trip
  - binderId passed via GateContext.customFields to tier2-handler — avoids changing GateContext interface for a field that belongs to execution context
  - triageInbox() gateContext type extended with binderId — minimal signature change, backward compat (optional field)
  - state.binders[0]?.id pattern reused for ring buffer hydration — follows existing pattern at line 1436
metrics:
  duration: ~11 minutes
  completed: 2026-03-13
  tasks: 3
  files_created: 4
  files_modified: 5
  tests_added: 14
  tests_passing: 328
---

# Phase 33 Plan 01: Ring Buffer + Sequence Context Infrastructure Summary

Established the complete TypeScript runtime infrastructure for sequence context — from per-binder ring buffer management in the embedding worker through Dexie persistence to injection into Tier 2 classifier inference before atom triage.

## What Was Built

### Task 1: Ring buffer + LSTM session in embedding worker (TDD)

Created `src/search/ring-buffer.ts` as a pure testable module with `updateRingBuffer`, `getRingBuffer`, `setRingBuffer`, and `clearRingBuffers`. The embedding worker imports these to maintain per-binder FIFO buffers of MiniLM embeddings (capped at `windowSize`, default 5).

Added `SEQUENCE_MODEL` ClassifierConfig and lazy `loadSequenceModel()` following the completeness gate pattern — fails silently when `models/sequence-context.onnx` is absent (pre-training cold-start path).

Added `runSequenceInference()` that flattens the ring buffer to `[seq_len, 1, 384]` Float32Array, runs LSTM inference, and returns a 128-dim context vector. Zero-pad fallback (128 zeros) when model is not loaded or buffer is empty.

Added 3 new message handlers in the worker's `onmessage`:
- `LOAD_RING_BUFFER` — hydrates in-memory buffer from main thread data (no response)
- `UPDATE_RING_BUFFER` — appends to buffer, posts `RING_BUFFER_UPDATED` with full buffer state
- `GET_SEQUENCE_CONTEXT` — runs LSTM inference, posts `SEQUENCE_CONTEXT_RESULT`

Updated `CLASSIFY_ONNX` handler to accept optional `binderId` — when present, retrieves ring buffer and concatenates 128-dim sequence context with 384-dim MiniLM embedding before classifier inference, producing a 512-dim input vector. Returns the original 384-dim vector to the main thread (used for centroid building and ring buffer updates).

8 ring buffer unit tests all pass.

### Task 2: TieredFeatures extension + variable-dim classifier input (TDD)

Added `sequenceContext?: Float32Array` field to `TieredFeatures` in `types.ts` with JSDoc explaining the 384+128=512-dim concatenation intent.

Fixed `runClassifierOnEmbedding` in `embedding-worker.ts` to use `[1, embedding.length]` instead of hardcoded `[1, 384]` — backward compatible with existing 384-dim classifiers, forward compatible with 512-dim retrained classifiers.

Created `src/ai/tier2/sequence-context-concat.ts` with `concatSequenceContext(miniLM, seqCtx)` and `zeroPadSequenceContext(miniLM)` helpers for 512-dim concatenation.

6 sequence concatenation unit tests all pass.

### Task 3: Caller-side wiring (no TDD — integration changes)

**store.ts:**
- Added `updateSequenceRingBuffer()` helper sending `UPDATE_RING_BUFFER` to the embedding worker
- Added `RING_BUFFER_UPDATED` case in `ensureEmbeddingWorker` message handler — fire-and-forget Dexie `sequenceContext.put()` persist
- Added `LOAD_RING_BUFFER` hydration in `initTieredAI` — reads Dexie on startup, reconstructs `number[][]` from flat Float32Array, sends to worker
- Exposed `_getTier2LastVector` getter from `initTieredAI` — captures last T2 embedding from triage
- Hooked triage completion path to call `updateSequenceRingBuffer` with last T2 embedding after `invalidateCache`

**tier2-handler.ts:**
- Extended `classifyViaONNX` to accept optional `binderId` parameter
- In `handle()` for `classify-type`, extracts `binderId` from `request.context.customFields?.binderId` and passes to `classifyViaONNX`

**triage.ts:**
- Extended `gateContext` parameter type to include optional `binderId`
- Adds `customFields: { binderId }` to `itemGateContext` when binderId is provided

**store.ts triage call:**
- Passes `state.binders[0]?.id` as `binderId` in gateContext to `triageInbox()`

## Verification

- `pnpm test`: 328 tests pass, 3 pre-existing failures in `keyword-patterns.test.ts` (unrelated to this plan)
- `pnpm tsc --noEmit`: No new TypeScript errors in modified files; all pre-existing errors unchanged

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing structure] Extracted ring buffer as separate testable module**
- **Found during:** Task 1 RED phase
- **Issue:** Tests import from `../ring-buffer` — needed a separate pure module (not just functions inside the worker, which is not importable in tests)
- **Fix:** Created `ring-buffer.ts` as standalone module, imported into `embedding-worker.ts`
- **Files modified:** `src/search/ring-buffer.ts` (created), `src/search/embedding-worker.ts` (import added)

**2. [Rule 2 - Missing structure] binderId via customFields instead of new GateContext field**
- **Found during:** Task 3 — tier2-handler doesn't have access to store state
- **Issue:** GateContext has no `binderId` field; tier2-handler needs binderId to pass to CLASSIFY_ONNX
- **Fix:** Used existing `customFields?: Record<string, unknown>` in GateContext as the extension point; updated triage.ts to populate it
- **Impact:** No GateContext interface change needed; backward compatible

## Self-Check: PASSED

| Item | Status |
|------|--------|
| src/search/ring-buffer.ts | FOUND |
| src/ai/tier2/sequence-context-concat.ts | FOUND |
| src/search/__tests__/ring-buffer.test.ts | FOUND |
| src/ai/tier2/__tests__/sequence-concat.test.ts | FOUND |
| commit 4529ab3 (ring buffer + LSTM) | FOUND |
| commit 646e920 (TieredFeatures + variable-dim) | FOUND |
| commit eb42ab0 (caller-side wiring) | FOUND |
