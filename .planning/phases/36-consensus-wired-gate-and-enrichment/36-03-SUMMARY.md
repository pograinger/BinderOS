---
phase: 36-consensus-wired-gate-and-enrichment
plan: "03"
subsystem: consensus
tags: [onnx, specialist-runner, consensus-worker, cold-start, vector-cache, fire-and-forget]
dependency_graph:
  requires:
    - 36-01  # ConsensusResult types, computeConsensus voter
    - 36-02  # 4 specialist ONNX models in public/models/specialists/
    - 35-02  # writeCanonicalVector in vector-cache.ts
  provides:
    - End-to-end consensus pipeline: atom mutation -> vector write -> worker inference -> voter -> sidecar
    - runConsensusForAtom (main-thread entry point)
    - consensus-worker.ts (dedicated ONNX inference worker)
  affects:
    - src/ai/feature-vectors/vector-cache.ts (consensus trigger wired)
    - src/storage/atom-intelligence.ts (consensusRisk field populated via writeConsensusRisk)
tech_stack:
  added: []
  patterns:
    - requestMap promise pattern for worker round-trips
    - in-memory counter cache initialized lazily from Dexie (cold-start guard)
    - dynamic import() for lazy consensus module load on first task vector write
    - zero-padding for missing person/calendar vector segments
key_files:
  created:
    - src/workers/consensus-worker.ts
    - src/ai/consensus/specialist-runner.ts
  modified:
    - src/ai/consensus/index.ts
    - src/ai/feature-vectors/vector-cache.ts
decisions:
  - Worker receives full 84-dim vector + slices array per call — keeps worker generic, no TypeScript src/ imports needed
  - vectorCountCache initialized lazily from Dexie on first call per binder — avoids O(n) query on every invocation
  - binderId optional on writeCanonicalVector (backward-compatible) — recomputeAndCacheVector passes atom.binderId
  - Zero-padding for person/calendar when task atom has no associated person/calendar vectors
  - Dynamic import('../consensus/specialist-runner') in writeCanonicalVector — consensus module stays off critical render path
metrics:
  duration: "5 minutes"
  completed: "2026-03-13"
  tasks_completed: 2
  files_created: 2
  files_modified: 2
---

# Phase 36 Plan 03: Consensus Worker + Specialist Runner Summary

End-to-end consensus pipeline wired: dedicated Web Worker with lazy ONNX session loading, cold-start guard (15 task vectors per binder), and fire-and-forget trigger from writeCanonicalVector for task atoms.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Consensus worker + specialist runner with cold-start guard | 4757b5d |
| 2 | Wire consensus trigger from writeCanonicalVector | e23eafd |

## What Was Built

### consensus-worker.ts

Web Worker that lazily loads 4 specialist ONNX sessions on the first `RUN_SPECIALISTS` message. Session loading is idempotent — subsequent calls return immediately once sessions are cached. For each specialist, the worker extracts its feature slice from the 84-dim flat vector using the indices passed in the message, runs `session.run({ X: tensor })`, and extracts the positive-class probability from `output[1].data[1]` (ONNX output layout: `output[0]` = label, `output[1]` = probabilities `[p_class0, p_class1]`).

Model paths: `/models/specialists/{name}-risk.onnx` (e.g., `time-pressure-risk.onnx`).

### specialist-runner.ts

Main-thread bridge with:
- **Cold-start guard**: `vectorCountCache` (Map<string, number>) initialized lazily from Dexie on first call per binder. Skips consensus if count < 15. `incrementVectorCount()` is called by vector-cache after each task vector write.
- **Worker management**: lazy-instantiated singleton with `requestMap` for promise-based round-trips. Worker crash resets the singleton for automatic recovery.
- **Vector construction**: task canonical vector (27 dims) + zero-padded person (23 dims) + zero-padded calendar (34 dims) = 84-dim full vector.
- **Pipeline**: `computeConsensus(outputs)` → `writeConsensusRisk(atomId, result)` (fire-and-forget).

### vector-cache.ts wire-up

`writeCanonicalVector()` gains optional `binderId` parameter. After a successful task vector write, a dynamic import of `specialist-runner` calls `incrementVectorCount(binderId)` then `void runConsensusForAtom(atomId, binderId)`. The `recomputeAndCacheVector()` caller passes `atom.binderId` through.

## Pipeline Data Flow

```
atom mutation (store.ts)
  → recomputeAndCacheVector(atom, sidecar, entities, relations)
    → computeTaskVector() [task-vector.ts]
    → writeCanonicalVector(atomId, 'task', vector, binderId)
      → db.atomIntelligence.put(intel)  [sidecar write]
      → [fire-and-forget] runConsensusForAtom(atomId, binderId)
        → cold-start guard (vectorCountCache < 15 → return)
        → db.atomIntelligence.get(atomId)  [load sidecar]
        → build 84-dim vector [task | zeros(23) | zeros(34)]
        → worker.postMessage(RUN_SPECIALISTS)
          → consensus-worker: load 4 ONNX sessions (lazy)
          → consensus-worker: extract feature slices, run inference
          → consensus-worker: return per-specialist probabilities
        → computeConsensus(outputs)  [consensus-voter.ts]
        → writeConsensusRisk(atomId, result)  [atom-intelligence.ts]
          → db.atomIntelligence.put(intel)  [sidecar write]
```

## Deviations from Plan

None — plan executed exactly as written.

## Verification

```
grep -n 'runConsensusForAtom' src/ai/feature-vectors/vector-cache.ts   ✓ line 106, 109
grep -n 'RUN_SPECIALISTS' src/workers/consensus-worker.ts               ✓ lines 4, 9, 34, 127, 136
grep -n 'vectorCountCache\|COLD_START' src/ai/consensus/specialist-runner.ts  ✓ lines 45, 51, 157
pnpm exec tsc --noEmit (src/ai/consensus/* + src/workers/consensus-worker.ts) ✓ no errors
```

## Self-Check: PASSED

- FOUND: src/workers/consensus-worker.ts
- FOUND: src/ai/consensus/specialist-runner.ts
- FOUND: commit 4757b5d (Task 1)
- FOUND: commit e23eafd (Task 2)
