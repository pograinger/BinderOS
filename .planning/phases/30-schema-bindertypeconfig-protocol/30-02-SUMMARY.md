---
phase: 30-schema-bindertypeconfig-protocol
plan: 02
subsystem: config
tags: [binder-type, registry, zod, tdd, compositor, harness, migration]

# Dependency graph
requires:
  - phase: 30-schema-bindertypeconfig-protocol
    plan: 01
    provides: "ExpandedBinderTypeConfig Zod schema, 7 per-concern JSON files, CompositorRuleConfigSchema DSL"

provides:
  - "getBinderConfig(), listBinderTypes(), getActiveBinderType(), setActiveBinderType(), setActiveBinderConfig()"
  - "hydrateCompositorRules(configs) — converts CompositorRuleConfig[] to CompositorRule[] at runtime"
  - "evaluateComposites(signals, rules?) — backward-compatible optional rules parameter"
  - "keyword-patterns.ts reads relationshipPatterns from getBinderConfig() instead of JSON import"
  - "All harness scripts read patterns from binder-types/gtd-personal/relationships.json"

affects:
  - 30-03 (predicate registry — uses getBinderConfig().predicateConfig)
  - 31 (dispatchTiered() integration — uses evaluateComposites(signals, hydrateCompositorRules(config.compositorRules)))
  - 34 (harness adversarial training — setActiveBinderConfig() for config injection)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Static JSON imports merged at registry init — no Vite virtual module plugin needed"
    - "Module-level override state (NOT SolidJS store) per project memory SolidJS proxy gotcha"
    - "Type-only import for CompositorRuleConfig — no circular dep at runtime"
    - "hydrateCompositorRules(configs) parameter pattern — cognitive-signals.ts never imports from binder-types"
    - "evaluateComposites optional rules parameter — backward compat while enabling binder-type-specific rules"

key-files:
  created:
    - src/config/__tests__/binder-type-registry.test.ts
  modified:
    - src/config/binder-types/index.ts
    - src/ai/tier2/cognitive-signals.ts
    - src/inference/keyword-patterns.ts
    - scripts/harness/harness-inference.ts
    - scripts/harness/adversarial-cycle.ts
    - scripts/harness/auto-tune-patterns.ts
    - scripts/harness/generate-corpus.ts
    - scripts/harness/generate-persona.ts
  deleted:
    - src/config/binder-types/gtd-personal.json (already deleted by 30-03 which ran first)
    - src/config/relationship-patterns.json (already deleted by 30-03 which ran first)

key-decisions:
  - "Static imports not virtual module — Vite natively hot-reloads JSON files, no plugin needed"
  - "ExpandedBinderTypeConfig re-exported as BinderTypeConfig alias — zero change for existing consumers"
  - "hydrateCompositorRules accepts configs parameter, never calls getBinderConfig() — preserves one-directional dependency"
  - "targetEntityType cast in keyword-patterns.ts — schema uses z.string(), inference types use 'PER'|'LOC'|'ORG' union; cast is safe since JSON values are always those three literals"

# Metrics
duration: ~25min
completed: 2026-03-13
---

# Phase 30 Plan 02: Registry API + Consumer Migration Summary

**Expanded binder-type registry with Zod validation, harness override API, hydrateCompositorRules() DSL evaluator, and migration of all consumers from deleted JSON files to the new BinderTypeConfig-based config**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-03-13T00:32:00Z
- **Tasks:** 2 (Task 1 TDD, Task 2 migration)
- **Files modified:** 9 (1 created, 8 modified)

## Accomplishments

- Rewrote `src/config/binder-types/index.ts` to merge 7 per-concern JSON files at module init, validate with Zod (`safeParse` with graceful fallback), and expose 5-function registry API
- `setActiveBinderConfig(override | null)` enables harness to inject configs without a Dexie write or rebuild
- `listBinderTypes()` returns `BinderTypeMeta[]` for all registered types — foundation for future picker/marketplace UI
- `hydrateCompositorRules(configs)` in `cognitive-signals.ts` converts the declarative AND/OR condition DSL into runtime `evaluate()` functions; handles `==`, `in`, `!=` operators, template interpolation for `{model-id.top_label}`
- `evaluateComposites(signals, rules?)` now accepts optional rules parameter — backward-compatible, enables binder-type-specific compositor rules
- `keyword-patterns.ts` migrated from direct JSON import to `getBinderConfig().relationshipPatterns`
- All 5 harness scripts updated from `relationship-patterns.json` to `binder-types/gtd-personal/relationships.json`
- 19 tests pass (12 new registry tests + 7 pre-existing enrichment/clarification tests)
- 3 pre-existing failures in `keyword-patterns.test.ts` are Dexie mock issues unrelated to this plan

## Task Commits

1. `871273f` — test(30-02): add failing tests for binder-type registry expanded API (RED)
2. `ffd2789` — feat(30-02): expand binder-type registry with full API and Zod validation (GREEN)
3. `80a8424` — feat(30-02): migrate all consumers to BinderTypeConfig, hydrate compositor rules

## Files Created/Modified

- `src/config/__tests__/binder-type-registry.test.ts` — 12 TDD tests: expanded fields, override API, listBinderTypes, active type
- `src/config/binder-types/index.ts` — merged JSON imports, Zod validation, 5-function registry API, BinderTypeConfig alias
- `src/ai/tier2/cognitive-signals.ts` — hydrateCompositorRules(), evaluateComposites(signals, rules?) with backward compat
- `src/inference/keyword-patterns.ts` — removed JSON import, reads from getBinderConfig().relationshipPatterns
- `scripts/harness/harness-inference.ts` — path updated to binder-types/gtd-personal/relationships.json
- `scripts/harness/adversarial-cycle.ts` — both patternsPath instances updated
- `scripts/harness/auto-tune-patterns.ts` — PATTERNS_PATH constant updated
- `scripts/harness/generate-corpus.ts` — patternsPath updated
- `scripts/harness/generate-persona.ts` — patternsPath updated (was missed in initial scan)

## Decisions Made

- Static imports not virtual module: Vite natively watches imported JSON files; no `resolveId`/`load` complexity needed. RESEARCH.md confirmed simpler approach acceptable.
- `ExpandedBinderTypeConfig` re-exported as `BinderTypeConfig` alias in index.ts — all existing consumers import `BinderTypeConfig` and `getBinderConfig()` unchanged.
- `hydrateCompositorRules(configs)` takes configs as parameter instead of calling `getBinderConfig()` internally — preserves one-directional dependency rule (cognitive-signals.ts never imports from binder-types).
- `targetEntityType` cast: schema uses `z.string()` for extensibility but runtime inference expects `'PER'|'LOC'|'ORG'` union. Cast is safe since all JSON values are those three literals.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Missing consumer] generate-persona.ts had undocumented relationship-patterns.json read**
- **Found during:** Task 2 verification grep
- **Issue:** `scripts/harness/generate-persona.ts` had a `readFileSync` call on the deleted `relationship-patterns.json` that wasn't listed in the plan's harness scripts section
- **Fix:** Updated path to `binder-types/gtd-personal/relationships.json` like the other harness scripts
- **Files modified:** `scripts/harness/generate-persona.ts`

**2. [Rule 1 - Type mismatch] targetEntityType narrower union in RelationshipPattern**
- **Found during:** Task 2 TypeScript check
- **Issue:** `ExpandedBinderTypeConfig.relationshipPatterns[n].targetEntityType` is `string` (from Zod schema) but `RelationshipPatternsConfig.patterns[n].targetEntityType` is `'PER'|'LOC'|'ORG'`
- **Fix:** Added safe cast in `keyword-patterns.ts` with explanatory comment. The JSON values are always the three valid literals.
- **Files modified:** `src/inference/keyword-patterns.ts`

## Self-Check: PASSED

- `src/config/__tests__/binder-type-registry.test.ts` — exists, 12 tests pass
- `src/config/binder-types/index.ts` — exists, exports 5 functions
- `src/ai/tier2/cognitive-signals.ts` — hydrateCompositorRules exported
- Commits 871273f, ffd2789, 80a8424 — all exist in git log
- No imports of `relationship-patterns.json` or `gtd-personal.json` remain (comments only)
- 19 tests pass, 3 pre-existing failures in keyword-patterns.test.ts (Dexie mock unrelated)

---
*Phase: 30-schema-bindertypeconfig-protocol*
*Completed: 2026-03-13*
