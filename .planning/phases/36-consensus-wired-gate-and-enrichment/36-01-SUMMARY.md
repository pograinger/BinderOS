---
phase: 36-consensus-wired-gate-and-enrichment
plan: "01"
subsystem: ai/consensus
tags: [consensus, specialist-voting, feature-vectors, sidecar, tdd]
dependency_graph:
  requires:
    - Phase 35 canonical vectors (TASK/PERSON/CALENDAR_DIMENSION_NAMES)
    - src/ai/feature-vectors/types.ts
    - src/storage/atom-intelligence.ts
    - src/types/intelligence.ts
  provides:
    - computeConsensus() pure voter function
    - SPECIALIST_WEIGHTS and SPECIALIST_FEATURE_SLICES constants
    - consensusRisk field on AtomIntelligenceSchema
    - writeConsensusRisk fire-and-forget sidecar helper
  affects:
    - Future consensus worker (36-02)
    - Future risk badge UI consumers (Phase 38)
    - Harness ablation pipeline (Phase 37)
tech_stack:
  added: []
  patterns:
    - TDD (RED-GREEN): test first, pure function second
    - Fire-and-forget sidecar write pattern (writePredictionMomentum precedent)
    - Index derivation from dimension name arrays (never hardcoded)
    - Direct type import (not barrel) to avoid circular dep
key_files:
  created:
    - src/ai/consensus/types.ts
    - src/ai/consensus/consensus-voter.ts
    - src/ai/consensus/consensus-voter.test.ts
    - src/ai/consensus/index.ts
  modified:
    - src/types/intelligence.ts
    - src/storage/atom-intelligence.ts
decisions:
  - "SPECIALIST_FEATURE_SLICES derives all indices from TASK/PERSON/CALENDAR_DIMENSION_NAMES — catches mismatches at module load time via indexByName() throw"
  - "Agreement score = agreeing pairs / total pairs; single specialist → 1.0 (no pairs to disagree)"
  - "ConsensusResult imported directly from src/ai/consensus/types (not barrel index) in atom-intelligence.ts to avoid circular dependency risk"
  - "consensusRisk is non-indexed optional field — no Dexie migration needed"
metrics:
  duration: "~12 minutes"
  completed: "2026-03-13T19:51:00Z"
  tasks_completed: 2
  files_created: 4
  files_modified: 2
---

# Phase 36 Plan 01: Consensus Types, Voter Function, and Sidecar Schema Summary

**One-liner:** Specialist consensus layer with weighted-average voter, pairwise agreement scoring, and derived feature index slices from authoritative dimension arrays.

## What Was Built

Task 1 established the consensus module's type contracts and core pure function via TDD. Task 2 extended the intelligence sidecar schema and added the fire-and-forget write helper.

### Task 1: Consensus types, voter function, and unit tests

**RED phase:** Wrote 28 unit tests covering empty-throws, unanimous agreement, split-vote math, weighted bias, contribution tracking, SPECIALIST_WEIGHTS values, and SPECIALIST_FEATURE_SLICES structure.

**GREEN phase:** Implemented:

- `src/ai/consensus/types.ts` — `SpecialistOutput`, `ConsensusResult`, `SpecialistFeatureSlice` interfaces, `SPECIALIST_WEIGHTS` constant (`time-pressure=1.5, dependency=1.5, staleness=1.0, energy-context=1.0` from EII experiment), `SPECIALIST_FEATURE_SLICES` for all 4 specialists with indices derived from `TASK/PERSON/CALENDAR_DIMENSION_NAMES` via `indexByName()` helper.
- `src/ai/consensus/consensus-voter.ts` — `computeConsensus()` pure function: weighted average via `sum(p*w)/sum(w)`, majority vote via `count(p>=0.5) >= ceil(n/2)`, pairwise agreement via agreed-pairs/total-pairs.
- `src/ai/consensus/index.ts` — barrel re-exporting all public types and `computeConsensus`.

All 28 tests pass.

### Task 2: Schema extension and sidecar write helper

- `src/types/intelligence.ts` — added `consensusRisk` optional Zod field to `AtomIntelligenceSchema` (non-indexed, no Dexie migration needed).
- `src/storage/atom-intelligence.ts` — added `writeConsensusRisk(atomId, result)` fire-and-forget helper following the identical `writePredictionMomentum` pattern. `ConsensusResult` imported directly from `../ai/consensus/types` (not barrel) to avoid circular dependency.

TypeScript compiles without new errors.

## Verification Results

```
pnpm test -- src/ai/consensus/consensus-voter.test.ts
  28 tests passed
  0 failures (3 pre-existing failures in keyword-patterns.test.ts — unrelated)

pnpm exec tsc --noEmit
  No new errors from source files
  Pre-existing node_modules errors only (huggingface, mlc-ai, workbox, vite-plugin-pwa)

grep -n 'consensusRisk' src/types/intelligence.ts   → line 138
grep -n 'writeConsensusRisk' src/storage/atom-intelligence.ts → lines 11, 193, 202
```

## Feature Slice Architecture

The 84-dim canonical vector layout (task[0-26] | person[27-49] | calendar[50-83]):

| Specialist | Features | Source dims |
|---|---|---|
| time-pressure | has_deadline, days_to_deadline_norm, time_pressure_score + ALL calendar (34) | task[2,3,20] + cal[50-83] |
| dependency | is_waiting_for, has_person_dep, entity_* (4) + ALL person (23) | task[8,19,23-26] + person[27-49] |
| staleness | age_norm, staleness_norm, has_deadline, days_to_deadline_norm, prev_staleness_score | task[0,1,2,3,21] |
| energy-context | ctx_*(6) + energy_*(3) + time_pressure + prev_energy_fit + cal energy/pressure/risk | task[9-20] + cal[62-64,67,68] |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

All created files exist on disk. Both task commits present:
- `3353cec` feat(36-01): consensus types, voter function, and unit tests
- `b3b0ad9` feat(36-01): schema extension and sidecar write helper
