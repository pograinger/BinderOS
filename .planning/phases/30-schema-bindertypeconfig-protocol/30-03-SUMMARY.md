---
phase: 30-schema-bindertypeconfig-protocol
plan: 03
subsystem: ai
tags: [typescript, context-gate, predicate-registry, vitest, tdd, binder-type-config]

# Dependency graph
requires:
  - phase: 30-01
    provides: GateContext, GatePredicateResult, GateResult types in src/types/gate.ts; ExpandedBinderTypeConfig Zod schema in src/config/binder-types/schema.ts; GTD gating.json with predicateConfig values

provides:
  - PredicateFn type alias in src/ai/context-gate/types.ts
  - registerPredicate/evaluatePredicates/clearPredicates in predicate-registry.ts
  - canActivate() entry point in activation-gate.ts (Phase 31 integration point)
  - routePredicate, timePredicate, historyPredicate, binderTypePredicate stubs in predicates/
  - initCorePredicates() registration function in predicates/index.ts
  - 20 TDD tests across 3 test files

affects:
  - 31 (dispatchTiered() integration — imports canActivate, calls it as pre-filter, logs to gateActivationLog)
  - 34 (harness adversarial training — can inject custom predicates via registerPredicate for ablation testing)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Predicate registry mirrors handler registry pattern from pipeline.ts (Map-based, name-keyed)"
    - "Default-allow semantics: empty registry returns canActivate: true — gate is opt-in, not opt-out"
    - "AND logic for canActivate: all predicates must pass — strict gating"
    - "initCorePredicates() explicit + module-level: test isolation via clearPredicates() + explicit call, production via side-effect import"
    - "Pure predicate functions: accept (ctx, config), return GatePredicateResult — no store, no Dexie"

key-files:
  created:
    - src/ai/context-gate/types.ts
    - src/ai/context-gate/predicate-registry.ts
    - src/ai/context-gate/activation-gate.ts
    - src/ai/context-gate/predicates/route-predicate.ts
    - src/ai/context-gate/predicates/time-predicate.ts
    - src/ai/context-gate/predicates/history-predicate.ts
    - src/ai/context-gate/predicates/binder-type-predicate.ts
    - src/ai/context-gate/predicates/index.ts
    - src/ai/context-gate/__tests__/predicate-registry.test.ts
    - src/ai/context-gate/__tests__/activation-gate.test.ts
    - src/ai/context-gate/__tests__/predicates.test.ts
  modified: []

key-decisions:
  - "staleDays stale-atom check stubbed as always-allow in historyPredicate — requires atom's lastEnrichedAt timestamp which is not in GateContext; TODO deferred to Phase 31 when gate is wired into dispatchTiered()"
  - "initCorePredicates() runs at module level AND is exported for explicit call — production uses side-effect import, tests use clearPredicates() + explicit initCorePredicates() for isolation"
  - "canActivate() is the single Phase 31 integration point — import from activation-gate.ts, call before handler loop in dispatchTiered()"

patterns-established:
  - "Context gate entry point pattern: canActivate(ctx, config) → GateResult — Phase 31 calls this before handler dispatch"
  - "Predicate isolation pattern: beforeEach(() => clearPredicates()) in tests, initCorePredicates() when needed"
  - "Config-reading predicate pattern: all four predicates read from config.predicateConfig — binder type owns gate behavior"

requirements-completed: [BTYPE-01]

# Metrics
duration: 8min
completed: 2026-03-13
---

# Phase 30 Plan 03: Context Gate Predicate Scaffold Summary

**Extensible context-gate module with Map-based predicate registry, AND-logic activation gate, and four BinderTypeConfig-reading predicate stubs — Phase 31 can wire canActivate() into dispatchTiered() without any structural changes**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-13T00:20:41Z
- **Completed:** 2026-03-13T00:28:00Z
- **Tasks:** 2
- **Files modified:** 11 (0 modified, 11 created)

## Accomplishments

- Complete context-gate module scaffold at `src/ai/context-gate/` — registry, evaluator, 4 predicate stubs
- Predicate registry follows the handler registration pattern from `pipeline.ts` (Map-based, warn on duplicate names)
- canActivate() with AND semantics and default-allow for empty registry — single Phase 31 integration point
- All four predicates read from `BinderTypeConfig.predicateConfig` — binder type owns its gate behavior
- 20 TDD tests pass across 3 test files covering all paths, edge cases, and integration registration

## Task Commits

Each task was committed atomically:

1. **Task 1: Predicate registry, activation gate, context-gate types** - `b5b9dd1` (feat)
2. **Task 2: Four config-reading predicate stubs and registration** - `1b88acc` (feat)

## Files Created/Modified

- `src/ai/context-gate/types.ts` — PredicateFn type alias, re-exports GateContext/GatePredicateResult/GateResult
- `src/ai/context-gate/predicate-registry.ts` — registerPredicate/evaluatePredicates/clearPredicates (Map-based registry)
- `src/ai/context-gate/activation-gate.ts` — canActivate(ctx, config) entry point with AND logic
- `src/ai/context-gate/predicates/route-predicate.ts` — blocks on config.predicateConfig.routeGating.blockedRoutes
- `src/ai/context-gate/predicates/time-predicate.ts` — suppresses during config.predicateConfig.timeGating.lowEnergyHours
- `src/ai/context-gate/predicates/history-predicate.ts` — gates on enrichmentDepth >= maxDepth (staleDays TODO Phase 31)
- `src/ai/context-gate/predicates/binder-type-predicate.ts` — verifies ctx.binderType === config.slug
- `src/ai/context-gate/predicates/index.ts` — initCorePredicates() + module-level registration
- `src/ai/context-gate/__tests__/predicate-registry.test.ts` — 4 tests for registry add/eval/clear
- `src/ai/context-gate/__tests__/activation-gate.test.ts` — 4 tests for AND logic, empty registry, predicate results shape
- `src/ai/context-gate/__tests__/predicates.test.ts` — 12 tests for all four predicates + index registration

## Decisions Made

- staleDays stale-atom check stubbed as always-allow in `historyPredicate` — this requires atom's `lastEnrichedAt` timestamp which is not yet in GateContext. Phase 31 will add it when wiring into dispatchTiered() (the Dexie atomIntelligence table already stores enrichment timestamps from Phase 26).
- `initCorePredicates()` exported AND called at module level — production uses side-effect import, tests use `clearPredicates()` + explicit `initCorePredicates()` call for isolation. No "already registered" error leaks into tests.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — all tests passed on first run.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 31 integration requires exactly three steps:
1. Import `canActivate` from `src/ai/context-gate/activation-gate.ts`
2. Import `src/ai/context-gate/predicates/index.ts` (side-effect — registers all 4 predicates)
3. Call `canActivate(ctx, config)` before the handler loop in `dispatchTiered()` — return early if `!result.canActivate`, log to gateActivationLog

The entire predicate infrastructure, type system, and config-reading are complete — Phase 31 only needs to wire in the entry point and add the gateActivationLog write.

---
*Phase: 30-schema-bindertypeconfig-protocol*
*Completed: 2026-03-13*
