---
phase: 02-compute-engine
plan: 01
subsystem: compute
tags: [rust, wasm, scoring, staleness, entropy, solidjs, worker, dexie, typescript]

# Dependency graph
requires:
  - 01-01 (Rust WASM pipeline, three-step build, BinderCore skeleton)
  - 01-02 (Dexie db with config table, WriteQueue, atom schema)
  - 01-03 (Worker bridge, store, SolidJS scaffold)
provides:
  - Rust WASM compute_scores(): staleness decay + priority scoring + energy inference
  - Rust WASM compute_entropy(): system health score (green/yellow/red)
  - Rust WASM filter_compression_candidates(): stale+orphan atoms for review page
  - src/types/config.ts: PriorityTier, EnergyLevel, AtomScore, EntropyScore, CapConfig types
  - src/worker/handlers/config.ts: getCapConfig()/setCapConfig() Dexie persistence
  - Scoring data in every STATE_UPDATE payload: scores, entropyScore, compressionCandidates, capConfig
  - SolidJS store scored state: state.scores, state.entropyScore, state.compressionCandidates, state.capConfig
  - Derived signals: inboxCapStatus(), taskCapStatus() (ok/warning/full)
affects:
  - 02-02 (UI views consume state.scores, inboxCapStatus, taskCapStatus)
  - 02-03 (Review page consumes state.compressionCandidates)
  - 02-04 (Cap enforcement modal reads capExceeded + capConfig)

# Tech tracking
tech-stack:
  added:
    - serde 1 with derive feature (already present, confirmed for new structs)
    - serde-wasm-bindgen 0.6 (already present, first real use for JsValue in/out)
  patterns:
    - "WASM scoring: Result<JsValue, JsValue> return type — zero .unwrap() calls, all errors mapped"
    - "AtomInput flattening: AtomLink[] -> string[] targetIds in flattenAtomLinksForWasm() before WASM call"
    - "Try/catch around each WASM call in flushAndSendState() — fallback to empty/null on failure"
    - "createMemo for derived cap status signals (not plain functions) — ensures fine-grained reactivity"
    - "reconcile() for scores and compressionCandidates in store — structural diffing for large maps"
    - "Zod safeParse for getCapConfig() fallback — invalid stored value falls back to defaults"

key-files:
  created:
    - wasm/core/src/lib.rs (extended with compute_scores, compute_entropy, filter_compression_candidates)
    - src/types/config.ts (PriorityTier, EnergyLevel, AtomScore, EntropyScore, CompressionCandidate, CapConfig, CapConfigSchema)
    - src/worker/handlers/config.ts (getCapConfig, setCapConfig with Zod validation + guardrails)
  modified:
    - wasm/core/src/lib.rs (was 30 lines skeleton, now 340 lines full scoring engine)
    - src/types/atoms.ts (added pinned_tier, pinned_staleness, importance, energy optional fields)
    - src/types/messages.ts (added RECOMPUTE_SCORES/UPDATE_CAP_CONFIG commands; extended STATE_UPDATE; added CAP_EXCEEDED response)
    - src/worker/worker.ts (flushAndSendState calls all three WASM functions; new command handlers; periodic re-score interval)
    - src/ui/signals/store.ts (extended BinderState; CAP_EXCEEDED handler; inboxCapStatus/taskCapStatus signals)
    - src/wasm/pkg/ (regenerated wasm-bindgen bindings with three new methods)

key-decisions:
  - "AtomLink[] flattened to string[] targetIds before passing to WASM (Rust AtomInput uses Vec<String> for links, not typed edges)"
  - "Three WASM calls per STATE_UPDATE are acceptable — all run off main thread in Worker, no UI jank"
  - "entropyScore passed as undefined (not null) in payload when WASM fails — store falls back to previous value gracefully"
  - "createMemo (not plain function) for inboxCapStatus/taskCapStatus — ensures SolidJS tracks reactive dependencies correctly"
  - "Periodic re-scoring every 10 minutes via setInterval in INIT handler — staleness drifts over time without user action"

# Metrics
duration: 8min
completed: 2026-02-22
---

# Phase 2 Plan 01: Rust WASM Scoring Engine + Store Extension Summary

**Rust WASM compute engine with staleness decay (14-day half-life), priority scoring (5-weight formula for tasks/events), entropy health score, and compression candidates — wired through Worker into SolidJS store on every STATE_UPDATE**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-22T15:14:32Z
- **Completed:** 2026-02-22T15:22:41Z
- **Tasks:** 2 of 2
- **Files modified:** 8

## Accomplishments

- Rust BinderCore extended with three WASM-exported scoring functions — all use Result<JsValue, JsValue>, no .unwrap() calls
- compute_scores(): exponential staleness decay (S = 1 - 2^(-age/half_life)) with link freshness boost (1.5x), onboarding forgiveness (2.0x for first 30 days), 5-weight priority formula for tasks/events, energy inference from content heuristics, opacity mapping (0.6-1.0)
- compute_entropy(): weighted sum of open-task load, inbox load, stale ratio, zero-link ratio into 0-1 score with green/yellow/red level
- filter_compression_candidates(): staleness >0.8 or orphan atoms (no links, >14 days old), excludes pinned-staleness items, human-readable reasons
- New src/types/config.ts: all scoring output types (PriorityTier, EnergyLevel, AtomScore, EntropyScore, CompressionCandidate) and Zod-validated CapConfig
- Atom schema extended: pinned_tier, pinned_staleness, importance, energy optional fields
- Message protocol extended: RECOMPUTE_SCORES/UPDATE_CAP_CONFIG commands, STATE_UPDATE carries full scoring payload, CAP_EXCEEDED response
- Worker flushAndSendState() calls all three WASM functions on every mutation with try/catch fallback, includes results in STATE_UPDATE
- Config handler: getCapConfig()/setCapConfig() with Zod validation, guardrails (inbox 10-30, tasks 15-50), Dexie config table persistence
- SolidJS store extended: reconcile() for scores map, derived createMemo signals inboxCapStatus() and taskCapStatus() with ok/warning/full states
- 10-minute periodic re-scoring via setInterval in INIT handler

## Task Commits

1. **Task 1: Rust WASM scoring functions + TypeScript types** — `3715b1a` (feat)
2. **Task 2: Worker scoring integration + store extension + config handler** — `ce22d58` (feat)

## Files Created/Modified

- `wasm/core/src/lib.rs` — Extended from 30-line skeleton to 340-line full scoring engine with compute_scores(), compute_entropy(), filter_compression_candidates()
- `src/types/config.ts` — NEW: PriorityTier, EnergyLevel, AtomScore, EntropyScore, CompressionCandidate, CapConfig types + CapConfigSchema (Zod/v4) + DEFAULT_CAP_CONFIG + CAP_CONFIG_KEY
- `src/worker/handlers/config.ts` — NEW: getCapConfig() with Zod safeParse fallback, setCapConfig() with guardrail validation
- `src/types/atoms.ts` — Extended BaseAtomFields with pinned_tier, pinned_staleness, importance, energy optional Zod fields
- `src/types/messages.ts` — Added RECOMPUTE_SCORES/UPDATE_CAP_CONFIG commands; extended STATE_UPDATE payload with scoring fields; added CAP_EXCEEDED response
- `src/worker/worker.ts` — Extended flushAndSendState() with WASM scoring pipeline; added RECOMPUTE_SCORES/UPDATE_CAP_CONFIG handlers; added 10-min setInterval; added flattenAtomLinksForWasm() helper
- `src/ui/signals/store.ts` — Extended BinderState interface; reconcile for scores/candidates; CAP_EXCEEDED handler; inboxCapStatus/taskCapStatus createMemo signals
- `src/wasm/pkg/` — Regenerated wasm-bindgen bindings (binderos_core.d.ts, binderos_core.js, binderos_core_bg.wasm, binderos_core_bg.wasm.d.ts)

## Decisions Made

- Rust AtomInput uses Vec<String> for links (target IDs only, not typed edges) — TypeScript AtomLink[] is flattened via flattenAtomLinksForWasm() before WASM calls
- Each WASM call individually wrapped in try/catch so a failure in one does not prevent the STATE_UPDATE from delivering atom/section data
- entropyScore sent as undefined (not null) when undefined in payload — store only updates if the field is present, avoiding null-flash on failure
- createMemo used for inboxCapStatus and taskCapStatus (not plain functions) to ensure SolidJS reactive dependency tracking works correctly
- Periodic re-scoring interval set in INIT handler (not module-level) so it only runs after WASM is ready

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

The only non-trivial design decision was the AtomLink flattening: the plan says "links (Vec<String>)" in AtomInput but the existing Atom type uses AtomLink[] with typed edges. This was addressed by implementing flattenAtomLinksForWasm() in worker.ts to extract targetId from each link before passing to WASM. This is not a deviation — it's a necessary adapter between the TypeScript layer and the Rust layer.

## Self-Check: PASSED

All key files verified:
- wasm/core/src/lib.rs: contains compute_scores, compute_entropy, filter_compression_candidates
- src/types/config.ts: contains CapConfig, PriorityTier, AtomScore, EntropyScore
- src/worker/handlers/config.ts: contains getCapConfig, setCapConfig
- src/worker/worker.ts: contains flattenAtomLinksForWasm, RECOMPUTE_SCORES, UPDATE_CAP_CONFIG
- src/ui/signals/store.ts: contains inboxCapStatus, taskCapStatus, capStatus

All commits verified:
- 3715b1a (Task 1: WASM scoring functions + TS types): FOUND
- ce22d58 (Task 2: Worker integration + store + config): FOUND

Build verification:
- pnpm build:wasm (cargo): PASSED — compiled in 5.68s
- pnpm lint: PASSED — zero errors
- pnpm build (vite): PASSED — 112 modules, clean bundle

---
*Phase: 02-compute-engine*
*Completed: 2026-02-22*
