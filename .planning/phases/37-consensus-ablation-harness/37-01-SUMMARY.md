---
phase: 37-consensus-ablation-harness
plan: "01"
subsystem: ai
tags: [eii, consensus, dexie, onnx, harness, specialist]

# Dependency graph
requires:
  - phase: 36-consensus-wired-gate-and-enrichment
    provides: ConsensusResult type, specialist-runner.ts fire-and-forget pattern, consensus worker
provides:
  - EIIResult and BinderEIISnapshot interfaces (src/ai/eii/types.ts)
  - computeEII() pure function (src/ai/eii/index.ts)
  - updateBinderEII() sidecar writer (src/ai/eii/index.ts)
  - v11 Dexie migration for binderIntelligence table
  - Production EII trigger wired after consensus in specialist-runner.ts
  - HarnessONNXSessions interface and loadSpecialistSessions() for Node.js harness
  - harness-types.ts extended with consensusResults, cycleEII, eiiProgression, excludeSpecialists
affects:
  - 37-02 (harness adversarial cycle and ablation reporting)
  - 38-risk-surface-proactive-alerts

# Tech tracking
tech-stack:
  added: []
  patterns:
    - EII computation: pure function + sidecar writer separation (computeEII vs updateBinderEII)
    - Dynamic import for lazy sidecar loading off critical paths
    - Full-recompute EII strategy (not incremental) — simpler, no stale accumulation bugs
    - Additive-only Dexie migration (v11 — no existing tables modified)
    - Fire-and-forget pattern: dynamic import().then().catch() for non-fatal side effects

key-files:
  created:
    - src/ai/eii/types.ts
    - src/ai/eii/index.ts
    - src/storage/migrations/v11.ts
    - scripts/harness/harness-onnx.ts
  modified:
    - src/storage/db.ts
    - src/ai/consensus/specialist-runner.ts
    - scripts/harness/harness-types.ts

key-decisions:
  - "EII coherence = std-dev of weightedProbability (NOT AUC — per user decision)"
  - "EII = (coherence + stability + impact) / 3 — equal weights per user decision"
  - "updateBinderEII uses full-recompute strategy — simpler than incremental, correct for small per-binder tables"
  - "Dynamic import() in specialist-runner for EII update — keeps EII module off critical consensus path"
  - "harness-onnx.ts loads only 4 specialist models, NOT all 14 T2 classifiers — existing harness handles T2"
  - "runSpecialistInference returns result['probabilities'].data[1] — positive class, matching consensus-worker.ts pattern"

patterns-established:
  - "EII module pattern: src/ai/eii/types.ts (interfaces) + src/ai/eii/index.ts (pure fn + sidecar writer)"
  - "Dexie v11 follows v10 pattern exactly — one .stores() call, no .upgrade(), additive only"

requirements-completed: [EII-01]

# Metrics
duration: 18min
completed: 2026-03-13
---

# Phase 37 Plan 01: EII Core Infrastructure Summary

**EII computation (std-dev coherence + mean stability + impact) with v11 Dexie migration, production fire-and-forget trigger after consensus, and harness ONNX session loader for specialist models**

## Performance

- **Duration:** 18 min
- **Started:** 2026-03-13T21:15:00Z
- **Completed:** 2026-03-13T21:33:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- `computeEII()` pure function: coherence (std-dev of weightedProbability), stability (mean agreementScore), equal-weight composite EII — verified empty input returns zeroes and divergent probabilities return positive coherence
- v11 Dexie migration adds `binderIntelligence` table (`&binderId, updatedAt`) — additive only, no existing tables modified
- Production EII trigger wired into `specialist-runner.ts` via `import('../../ai/eii/index').then()` fire-and-forget after `writeConsensusRisk()`
- `harness-onnx.ts` provides `loadSpecialistSessions()` and `runSpecialistInference()` for Node.js harness context (onnxruntime-node, no Worker)
- `harness-types.ts` extended with optional fields: `CycleState.consensusResults`, `CycleState.cycleEII`, `PersonaAdversarialResult.eiiProgression`, `AblationConfig.excludeSpecialists`

## Task Commits

Each task was committed atomically:

1. **Task 1: EII types, pure computation, and v11 Dexie migration** - `c2fdc23` (feat)
2. **Task 2: Production EII trigger, harness ONNX loader, harness type extensions** - `5f18106` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `src/ai/eii/types.ts` — EIIResult and BinderEIISnapshot interfaces
- `src/ai/eii/index.ts` — computeEII() pure function + updateBinderEII() sidecar writer
- `src/storage/migrations/v11.ts` — binderIntelligence table schema (additive, follows v10 pattern)
- `src/storage/db.ts` — import applyV11Migration, binderIntelligence table declaration with BinderEIISnapshot type
- `src/ai/consensus/specialist-runner.ts` — fire-and-forget EII update after writeConsensusRisk
- `scripts/harness/harness-onnx.ts` — ONNX session management for Node.js harness (loadSpecialistSessions, runSpecialistInference)
- `scripts/harness/harness-types.ts` — CycleState/PersonaAdversarialResult/AblationConfig extensions

## Decisions Made

- EII coherence = std-dev of weightedProbability (NOT AUC) — per existing user decision
- EII = (coherence + stability + impact) / 3 — equal weights per existing user decision
- `updateBinderEII` uses full-recompute (scan all atomIntelligence rows with consensusRisk) — simpler than incremental, correct for small per-binder tables
- Dynamic import in specialist-runner.ts — keeps EII module off critical consensus execution path
- harness-onnx.ts loads only 4 specialist models (not all 14 T2 classifiers) — Plan 02 handles T2 integration
- ONNX `probabilities` output index 1 = positive class probability — matches consensus-worker.ts precedent from Phase 36

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None — onnxruntime-node was already a project dependency. All TypeScript compiled cleanly. Pre-existing TS errors in enrichment, clarification, and inference test files were not introduced by this plan.

## Next Phase Readiness

- Plan 02 (37-02) can now import `computeEII` and `HarnessONNXSessions` to wire the adversarial cycle
- `harness-types.ts` fields are all optional — backward compatible with existing harness runners
- `binderIntelligence` table is ready in Dexie v11 — no further schema work needed for EII persistence

---
*Phase: 37-consensus-ablation-harness*
*Completed: 2026-03-13*
