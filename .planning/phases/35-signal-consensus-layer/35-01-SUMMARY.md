---
phase: 35-signal-consensus-layer
plan: "01"
subsystem: ai/feature-vectors
tags:
  - canonical-vectors
  - feature-engineering
  - onnx-input
  - tdd

dependency_graph:
  requires:
    - src/types/intelligence.ts (AtomIntelligence, Entity, EntityRelation)
    - src/types/atoms.ts (TaskAtom, EventAtom)
    - src/config/binder-types/schema.ts (BinderTypeConfigSchema)
    - src/config/binder-types/index.ts (mergeGtdPersonalConfig)
  provides:
    - src/ai/feature-vectors/types.ts (CanonicalVector, dimension constants)
    - src/ai/feature-vectors/task-vector.ts (computeTaskVector)
    - src/ai/feature-vectors/person-vector.ts (computePersonVector)
    - src/ai/feature-vectors/calendar-vector.ts (computeCalendarVector)
    - src/ai/feature-vectors/index.ts (public barrel)
    - src/config/binder-types/gtd-personal/vectors.json (authoritative dimension names)
  affects:
    - Phase 36 specialist ONNX models (consume canonical vectors as input)

tech_stack:
  added:
    - Float32Array vector computation (no new deps — pure TypeScript)
  patterns:
    - Named offset constants derived from dimension name arrays (no magic numbers)
    - JSON config as authoritative dimension source (vectors.json)
    - pickPrimaryEntity() shared helper in types.ts
    - Cold-start zero-fill pattern (undefined sidecar/entities → valid zero vector)
    - Runtime dimension assertion (console.error on schema drift)

key_files:
  created:
    - src/ai/feature-vectors/types.ts
    - src/ai/feature-vectors/task-vector.ts
    - src/ai/feature-vectors/person-vector.ts
    - src/ai/feature-vectors/calendar-vector.ts
    - src/ai/feature-vectors/index.ts
    - src/ai/feature-vectors/task-vector.test.ts
    - src/ai/feature-vectors/person-vector.test.ts
    - src/ai/feature-vectors/calendar-vector.test.ts
    - src/config/binder-types/gtd-personal/vectors.json
  modified:
    - src/types/intelligence.ts (canonicalVector optional field in AtomIntelligenceSchema)
    - src/config/binder-types/schema.ts (vectorSchema optional field in BinderTypeConfigSchema)
    - src/config/binder-types/index.ts (vectors import + merge)
    - src/config/binder-types/schema.test.ts (vectorSchema tests + dimension constant tests)

decisions:
  - "vectors.json is authoritative dimension source — constants in types.ts are derived via import, never hardcoded"
  - "pickPrimaryEntity() lives in types.ts as shared helper — used by task-vector.ts and calendar-vector.ts"
  - "'waiting' status maps to status_open slot — waiting is an active state, not dropped"
  - "Default responsiveness slot is resp_unknown for all entities — Phase 38 will derive from interaction patterns"
  - "canonicalVector added to AtomIntelligenceSchema as optional field — no Dexie migration needed (non-indexed)"

metrics:
  duration: "11 minutes"
  completed: "2026-03-13"
  tasks_completed: 2
  files_created: 9
  files_modified: 4
  tests_added: 69
  test_results: "69 new tests pass (24 task + 25 person + 20 calendar)"
---

# Phase 35 Plan 01: Canonical Feature Vector Types and Compute Functions Summary

**One-liner:** Three pure compute functions producing deterministic Float32Array vectors (27/23/34 dims) from atom metadata + sidecar + entity registry data, with GTD vectors.json as authoritative dimension source.

## What Was Built

### Core Types (`src/ai/feature-vectors/types.ts`)
- `CanonicalVector` interface for serializable vector snapshots
- `TASK_DIMENSION_NAMES` (27 entries), `PERSON_DIMENSION_NAMES` (23), `CALENDAR_DIMENSION_NAMES` (34)
- All dimension constants derived from `vectors.json` at import time — never hardcoded
- `pickPrimaryEntity()` shared helper for highest-confidence relation lookup
- `VectorSchema` interface mirroring the BinderTypeConfig.vectorSchema shape

### GTD Vectors Config (`src/config/binder-types/gtd-personal/vectors.json`)
Authoritative dimension name arrays for all three vector types:
- task (27): age/staleness/deadline/status/context/energy/enrichment/entity dimensions
- person (23): relationship type/mention-count/recency/confidence/collaboration dimensions
- calendar (34): time-of-day/day-of-week/duration/energy/deadline/entity-priority dimensions

### Schema Extensions
- `AtomIntelligenceSchema` — added `canonicalVector` optional field (no migration needed)
- `BinderTypeConfigSchema` — added `vectorSchema` optional field with task/person/calendar sub-arrays
- `index.ts` — merges `vectors.vectorSchema` into GTD personal config

### Compute Functions

**`computeTaskVector(atom, sidecar, entities, relations)`** → `Float32Array(27)`
- Age norm (365-day cap), staleness norm (90-day cap)
- Deadline features: has_deadline, days_to_deadline_norm, time_pressure_score (sigmoid)
- Status one-hot: open/in-progress/waiting→[4], done→[5], cancelled/archived→[6]
- Context one-hot: @home/@office/@phone/@computer/@errands/anywhere
- Energy one-hot: Quick→energy_low, Medium→energy_medium, Deep→energy_high
- Enrichment depth norm, has_person_dep, entity_reliability, responsiveness (default: unknown)

**`computePersonVector(entity, relations)`** → `Float32Array(23)`
- Relationship type one-hot (9 slots) — picks highest-confidence relation; unknown if none
- Mention count norm (50-cap), recency norm (30-day decay), days_since_seen norm (90-day)
- has_user_correction, confidence_norm, collaboration frequency one-hot, reliability score
- Alias count norm (5-cap), responsiveness one-hot (default: unknown)

**`computeCalendarVector(atom, sidecar, entities, relations)`** → `Float32Array(34)`
- Temporal: start_tod_norm, day-of-week one-hot, has_deadline, days_to_event_norm, time_pressure_score
- Energy one-hot, entity_is_high_priority (spouse/reports-to/parent/child relations)
- Entity type flags: has_person_entity, has_org_entity, has_loc_entity from sidecar mentions
- Placeholder zeros for: duration buckets, overrun_risk, slack_before, mobility, is_recurring, prep_time

### Test Coverage (69 tests)
- `task-vector.test.ts` (24 tests): dimensions, cold-start, determinism, age cap, status/energy one-hot, entity reliability, deadlines, enrichment depth
- `person-vector.test.ts` (25 tests): dimensions, all relationship types, rel_unknown cold-start, mention cap, user correction, confidence, collab frequency, responsiveness
- `calendar-vector.test.ts` (20 tests): dimensions, temporal zero-fill, entity_is_high_priority for all 4 priority types, energy one-hot, entity type flags, placeholder defaults

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] 'waiting' status not mapped to any one-hot slot**
- **Found during:** Task 2 test execution
- **Issue:** `computeTaskVector` only handled `open`, `in-progress`, `done`, `cancelled`, `archived`. The `waiting` status fell through all branches, leaving all three status slots at 0.0 — violating the "exactly one status slot = 1.0" test assertion.
- **Fix:** Added `waiting` to the `status_open` condition (`open || in-progress || waiting`). Semantically correct — waiting tasks are still active items in the GTD workflow.
- **Files modified:** `src/ai/feature-vectors/task-vector.ts`
- **Commit:** 28b4878

## Self-Check: PASSED

Files exist:
- src/ai/feature-vectors/types.ts — FOUND
- src/ai/feature-vectors/task-vector.ts — FOUND
- src/ai/feature-vectors/person-vector.ts — FOUND
- src/ai/feature-vectors/calendar-vector.ts — FOUND
- src/ai/feature-vectors/index.ts — FOUND
- src/config/binder-types/gtd-personal/vectors.json — FOUND

Commits:
- 7f425f1 feat(35-01): define canonical vector types, schema extensions, and compute functions
- 28b4878 test(35-01): add full test coverage for all three compute functions
