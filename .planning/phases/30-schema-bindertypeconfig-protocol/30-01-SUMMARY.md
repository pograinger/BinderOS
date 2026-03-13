---
phase: 30-schema-bindertypeconfig-protocol
plan: 01
subsystem: database
tags: [dexie, zod, typescript, indexeddb, migration, binder-type, onnx, cognitive-signals]

# Dependency graph
requires:
  - phase: 26-intelligence-sidecar
    provides: v9 migration pattern, CRDT field conventions, atomIntelligence/entity/entityRelations tables
  - phase: 28-relationship-inference-cognitive-harness
    provides: COGNITIVE_MODEL_IDS, COMPOSITOR_RULES, CompositorRule interface in cognitive-signals.ts

provides:
  - GateActivationLogEntry, SequenceContextEntry, BinderTypeConfigEntry Dexie table entry types
  - GateContext, GatePredicateResult, GateResult types for predicate evaluation
  - ExpandedBinderTypeConfig Zod schema with columnSet, compositorRules, predicateConfig, maturityThresholds
  - CompositorRuleConfigSchema — declarative AND/OR condition DSL replacing evaluate() functions
  - Dexie v10 migration adding gateActivationLog, sequenceContext, binderTypeConfig tables
  - GTD Personal config split into 7 per-concern JSON files under gtd-personal/ directory

affects:
  - 30-02 (predicate registry scaffold, ActivationGate stub — reads gate types and predicateConfig)
  - 30-03 (BinderTypeConfig registry, config loader — reads all 7 JSON files via manifest)
  - 31 (dispatchTiered() integration with ActivationGate — uses GateContext and GateResult)
  - 32 (entity pipeline consumers — reads entityTypePriority and entityContextMappings from new JSON)
  - 33 (sequence context ONNX — fills sequenceContext table schema defined here)
  - 34 (harness adversarial training — uses binderTypeConfig Dexie table for config injection)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "BinderTypeConfig as OS-like driver descriptor: all binder-type concerns in per-concern JSON files"
    - "Declarative compositor rule DSL: condition { operator, clauses } replaces evaluate() functions in JSON"
    - "CRDT-ready migration pattern: version, deviceId, updatedAt on all new Dexie table entry types"
    - "Additive-only v10 migration: no existing tables modified, 3 new empty tables added"
    - "TDD for type validation: interface shape tests + Zod schema validation tests as single test run"

key-files:
  created:
    - src/types/gate.ts
    - src/types/gate.test.ts
    - src/config/binder-types/schema.ts
    - src/config/binder-types/schema.test.ts
    - src/storage/migrations/v10.ts
    - src/storage/__tests__/v10-migration.test.ts
    - src/config/binder-types/gtd-personal/manifest.json
    - src/config/binder-types/gtd-personal/columns.json
    - src/config/binder-types/gtd-personal/compositor.json
    - src/config/binder-types/gtd-personal/enrichment.json
    - src/config/binder-types/gtd-personal/relationships.json
    - src/config/binder-types/gtd-personal/gating.json
    - src/config/binder-types/gtd-personal/entities.json
  modified:
    - src/storage/db.ts

key-decisions:
  - "BinderTypeConfigEntry stores full config as configJson blob (string) — enables harness injection and runtime override without rebuild, avoids schema coupling"
  - "CompositorRuleConfig uses declarative condition DSL (AND/OR clauses) instead of evaluate() functions — JSON is source of truth for both Python training and TypeScript runtime"
  - "Relationship patterns copied into gtd-personal/relationships.json (not deleted from original) — Plan 02 handles consumer migration and cleanup"
  - "All 10 ONNX model IDs in GTD columnSet — GTD uses all cognitive dimensions, mobile-specific binder types can subset"
  - "gateActivationLog compound indexes [predicateName+timestamp] and [atomId+timestamp] — enables per-predicate rate queries and per-atom gate history for harness threshold tuning"

patterns-established:
  - "Gate type file: src/types/gate.ts contains all Dexie entry types and gate evaluation types"
  - "Schema file: src/config/binder-types/schema.ts contains Zod schema and inferred types"
  - "Per-concern JSON split: manifest.json + 6 concern files per binder type directory"
  - "Migration test pattern: mock db.version().stores() to verify index specs without IndexedDB"

requirements-completed: [SCHM-01, BTYPE-01]

# Metrics
duration: 30min
completed: 2026-03-13
---

# Phase 30 Plan 01: Schema + BinderTypeConfig Foundation Summary

**Dexie v10 migration with 3 CRDT-ready tables, ExpandedBinderTypeConfig Zod schema with declarative compositor DSL, and GTD config split into 7 per-concern JSON files establishing the binder-type-as-plugin architecture**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-03-13T00:03:00Z
- **Completed:** 2026-03-13T00:14:31Z
- **Tasks:** 2
- **Files modified:** 14 (1 modified, 13 created)

## Accomplishments

- All Phase 30 types defined: 3 Dexie table entry types + 3 gate evaluation types in `src/types/gate.ts`
- ExpandedBinderTypeConfig Zod schema with all v5.5 fields (columnSet, compositorRules, predicateConfig, maturityThresholds) plus legacy enrichment fields preserved
- CompositorRuleConfigSchema: declarative AND/OR condition DSL converts all 10 COMPOSITOR_RULES from evaluate() functions to JSON-serializable form
- Dexie v10 migration: gateActivationLog (with compound indexes), sequenceContext, binderTypeConfig — additive-only, no existing tables touched
- GTD config split into 7 per-concern JSON files under `src/config/binder-types/gtd-personal/` — manifest-driven plugin architecture ready for third-party binder types
- 25 tests pass across 3 test files (10 gate type tests, 9 schema tests, 6 migration tests)

## Task Commits

Each task was committed atomically:

1. **Task 1: Gate types and Zod schema** - `fecd966` (feat)
2. **Task 2: v10 migration, db.ts, GTD JSON split** - `301dbcb` (feat)

## Files Created/Modified

- `src/types/gate.ts` — GateActivationLogEntry, SequenceContextEntry, BinderTypeConfigEntry, GateContext, GatePredicateResult, GateResult
- `src/types/gate.test.ts` — 10 TDD tests for all gate interface shapes
- `src/config/binder-types/schema.ts` — ExpandedBinderTypeConfig Zod schema, CompositorRuleConfigSchema, GatePredicateConfigSchema
- `src/config/binder-types/schema.test.ts` — 9 schema validation tests
- `src/storage/migrations/v10.ts` — additive migration adding 3 new tables
- `src/storage/__tests__/v10-migration.test.ts` — 6 migration tests using mock db
- `src/storage/db.ts` — added v10 import, 3 table declarations, applyV10Migration call
- `src/config/binder-types/gtd-personal/manifest.json` — slug, metadata, configFiles list
- `src/config/binder-types/gtd-personal/columns.json` — all 10 ONNX model IDs
- `src/config/binder-types/gtd-personal/compositor.json` — 10 rules in declarative condition DSL
- `src/config/binder-types/gtd-personal/enrichment.json` — purpose, questionTemplates, followUpTemplates
- `src/config/binder-types/gtd-personal/relationships.json` — 34 keyword patterns from relationship-patterns.json
- `src/config/binder-types/gtd-personal/gating.json` — predicateConfig with routeGating/timeGating/historyGating
- `src/config/binder-types/gtd-personal/entities.json` — entityTypePriority, entityContextMappings, maturityThresholds

## Decisions Made

- `BinderTypeConfigEntry.configJson` stores full config as a string blob — enables harness config injection (`setActiveBinderConfig()`) without requiring a Zod parse on every read; parse only on write/validation
- Compositor rules use declarative DSL (operator + clauses) instead of embedding evaluate() functions in JSON — JSON is the single source of truth; Python training scripts and TypeScript runtime both read from this file
- Old `gtd-personal.json` and `relationship-patterns.json` NOT deleted yet — Plan 02 migrates consumers and does the clean delete, consistent with Phase 26 clean-break approach
- All 10 ONNX model IDs in GTD columnSet — future mobile-optimized binder types can subset, but GTD Personal uses all dimensions

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- One pre-existing TS strict mode error in gate.test.ts (`predicateResults[0]` indexing): fixed with optional chaining (`[0]?.name`). Not a deviation — TS strict mode applies to test files.

## Next Phase Readiness

- Gate types and Zod schema unblock Plans 02 and 03 in this phase
- v10 migration storage ready for Phase 31 gate activation logging and Phase 33 sequence context writes
- GTD JSON split establishes the directory-based binder-type plugin pattern for Plans 02/03 to build the registry/loader
- Old `gtd-personal.json` and `relationship-patterns.json` preserved — Plan 02 must migrate consumers before cleanup

---
*Phase: 30-schema-bindertypeconfig-protocol*
*Completed: 2026-03-13*
