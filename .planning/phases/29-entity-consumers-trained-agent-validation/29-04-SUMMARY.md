---
phase: 29
plan: "04"
subsystem: entity-consumers
tags: [entity, context-suggestion, triage, BinderTypeConfig, ENTC-03]
dependency_graph:
  requires: [29-01, 29-02, 29-03]
  provides: [ENTC-03]
  affects: [src/ui/signals/store.ts, src/config/binder-types/index.ts, src/entity/entity-context-suggestions.ts]
tech_stack:
  added: []
  patterns: [pure-function, fire-and-forget async, post-triage enrichment hook]
key_files:
  created:
    - src/entity/entity-context-suggestions.ts
    - src/entity/entity-context-suggestions.test.ts
  modified:
    - src/config/binder-types/index.ts
    - src/ui/signals/store.ts
decisions:
  - "Entity context enrichment is post-triage fire-and-forget — non-fatal, does not block triage display"
  - "Only enriches complete suggestions missing ONNX contextTag — ONNX takes precedence when present"
  - "Best candidate for metadata uses max confidence across all entity candidates"
  - "db imported directly in store.ts for atomIntelligence sidecar query (consistent with Phase 26 pattern)"
metrics:
  duration: 245
  completed_date: "2026-03-12T06:29:52Z"
  tasks_completed: 2
  files_modified: 4
---

# Phase 29 Plan 04: Entity Context Suggestion Wiring Summary

**One-liner:** Entity relationship mappings wired end-to-end from gtd-personal.json through TypeScript interface to post-triage context tag enrichment in store.ts.

## What Was Built

Closed the last missing production wiring for ENTC-03: the `entityContextMappings` data in `gtd-personal.json` was previously invisible to TypeScript and had no code path converting relationship types into GTD `@context` suggestions.

**Three-layer fix:**

1. **Type system** (`src/config/binder-types/index.ts`): Added `entityContextMappings?: Record<string, string>` to `BinderTypeConfig` interface. The existing JSON cast `gtdPersonal as BinderTypeConfig` now correctly includes the field instead of silently dropping it.

2. **Pure function** (`src/entity/entity-context-suggestions.ts`): New `suggestContextFromEntities(candidates, config)` that sorts entity candidates by confidence, walks the sorted list, and returns the first relationship type with a mapping in `entityContextMappings`. Returns `null` if no mapping exists. No store imports — consistent with pure module pattern.

3. **Production wiring** (`src/ui/signals/store.ts`): Post-triage async enrichment block in the `onSuggestion` callback. When a `complete` suggestion arrives with no `contextTag`, it:
   - Queries `atomIntelligence` sidecar for entity mentions on that inbox item
   - Calls `findHighestConfidenceRelation()` for each mention
   - Calls `suggestContextFromEntities()` with binder config
   - Updates the suggestion map with entity-derived context tag (+ confidence + low-confidence flag)
   - All wrapped in try/catch — non-fatal on failure

## Deviations from Plan

None - plan executed exactly as written.

## Test Results

- 9 unit tests covering: empty candidates, no mappings config, healthcare-provider→@health, spouse→@home, colleague→@work, unknown-type→null, multi-candidate priority by confidence, all-no-mapping→null
- All 9 tests passing via `npx vitest run src/entity/entity-context-suggestions.test.ts`
- TypeScript compiles clean for all modified files (pre-existing errors in other files unchanged)

## Commits

- `7fe01a4`: feat(29-04): entityContextMappings type and suggestContextFromEntities() pure function
- `0c5239d`: feat(29-04): wire entity context suggestion into store.ts post-triage enrichment

## Self-Check: PASSED
