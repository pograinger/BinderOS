---
phase: 28
plan: 01
subsystem: relationship-inference
tags: [inference, entity-relations, keyword-patterns, co-occurrence, pwa, tdd]
dependency_graph:
  requires:
    - 27-01 (entity-detector.ts, entity-helpers.ts, EntityRelation schema)
    - 26-01 (atomIntelligence sidecar, Dexie entity tables)
  provides:
    - src/inference/keyword-patterns.ts (runKeywordPatterns)
    - src/inference/cooccurrence-tracker.ts (updateCooccurrence, flushCooccurrenceToDexie)
    - src/inference/relationship-inference.ts (inferRelationshipsForAtom)
    - src/config/relationship-patterns.json (~21 patterns)
  affects:
    - src/entity/entity-detector.ts (calls inferRelationshipsForAtom after NER)
    - Dexie entityRelations table (new records written on each inference)
tech_stack:
  added: []
  patterns:
    - Sentence-scoped keyword matching with title abbreviation handling
    - Sorted UUID pair keys for symmetric co-occurrence tracking
    - In-memory Map for co-occurrence with device-adaptive PWA flush
    - TDD red-green-refactor for all three modules
key_files:
  created:
    - src/config/relationship-patterns.json
    - src/inference/types.ts
    - src/inference/keyword-patterns.ts
    - src/inference/keyword-patterns.test.ts
    - src/inference/cooccurrence-tracker.ts
    - src/inference/cooccurrence-tracker.test.ts
    - src/inference/relationship-inference.ts
    - src/inference/relationship-inference.test.ts
  modified:
    - src/entity/entity-detector.ts
decisions:
  - "relationship-patterns.json loaded as standalone import, not nested in BinderTypeConfig"
  - "CO_OCCURRENCE_THRESHOLD = 3 (personal GTD: fewer atoms, 3 = meaningful signal)"
  - "Sorted UUID pair key: entityId1 < entityId2 guarantees symmetric pair identity"
  - "[SELF] sentinel as sourceEntityId for implicit self-relationships (no USER entity in registry)"
  - "db.entityRelations compound index '[sourceEntityId+targetEntityId]' used for upsert lookup"
metrics:
  duration_seconds: 583
  tasks_completed: 3
  tasks_total: 3
  files_created: 8
  files_modified: 1
  tests_written: 37
  tests_passing: 37
  completed_date: "2026-03-11"
---

# Phase 28 Plan 01: Relationship Inference Engine Summary

Relationship inference engine connecting entity detection to typed relationship creation — keyword pattern matching and co-occurrence tracking that infer "Pam is spouse", "Dr. Chen is healthcare-provider", and "Bob and Sarah frequently appear together" from atom content.

## What Was Built

### Task 1: Keyword Pattern Engine (TDD)
- `src/config/relationship-patterns.json`: 21 patterns covering spouse (anniversary=0.30, direct=0.65), reports-to (0.55), healthcare-provider (0.70), parent/child/sibling (0.60), colleague/friend (0.45), works-at (0.55), lives-at (0.50), org-member (0.40), mentor (0.55), client (0.50), neighbor (0.55), teacher/landlord/accountant/lawyer/veterinarian (0.60), coach (0.55)
- `src/inference/types.ts`: RelationshipPattern, PatternMatch, InferenceResult interfaces
- `src/inference/keyword-patterns.ts`:
  - `splitIntoSentences()` handles "Dr.", "Mr.", "Mrs.", "Ms.", "Prof.", "St.", "Jr.", "Sr.", "Lt.", "Sgt.", "Cpl." abbreviations via placeholder substitution before regex split
  - `buildKeywordRegex()` produces word-boundary anchored, case-insensitive regex from keyword list
  - `runKeywordPatterns()` is sentence-scoped: only creates relation when entity mention span falls within the same sentence as the keyword match
  - Upsert logic: checks existing relation via `db.entityRelations.where('[sourceEntityId+targetEntityId]').equals([...]).filter(...)`, boosts confidence `Math.min(0.95, existing + 0.10)` on repeat evidence
  - `[SELF]` sentinel for implicit self-relationships (single entity + keyword)
- 14 tests, all green

### Task 2: Co-occurrence Tracker (TDD)
- `src/inference/cooccurrence-tracker.ts`:
  - `pairKey()`: lexicographic sort ensures "a:b" == "b:a" symmetry
  - `recordCooccurrence()`: in-memory Map accumulation with evidence snippets
  - `updateCooccurrence()`: sentence-level scanning, skips MISC and DATE entity types
  - `CO_OCCURRENCE_THRESHOLD = 3`: minimum co-occurrences for 'associated' relationship creation
  - `flushCooccurrenceToDexie()`: batch processes all pairs >= threshold, upserts via `db.entityRelations.update()` or `createRelation()` with sourceAttribution='co-occurrence', confidence=0.25
  - `registerCooccurrenceFlushHandlers()`: visibilitychange (primary), pagehide (iOS), beforeunload (belt-and-suspenders); mobile: count threshold 20, no interval; desktop: count threshold 50, 60s interval
  - `getCooccurrenceSnapshot()`, `resetCooccurrenceState()` for testing
- 16 tests, all green

### Task 3: Orchestrator + Integration
- `src/inference/relationship-inference.ts`:
  - `inferRelationshipsForAtom()`: filters for registry mentions → `ensureFlushRegistered()` → `runKeywordPatterns()` → `updateCooccurrence()` → `maybeFlushCooccurrence()`
  - `ensureFlushRegistered()`: one-time PWA handler setup using `navigator.maxTouchPoints` for device detection
  - Full try/catch — never throws, fires-and-forgets
- `src/entity/entity-detector.ts`: calls `inferRelationshipsForAtom()` after `writeEntityMentions()`, completing the Phase 28 lifecycle integration
- 7 integration tests, all green

## Verification Results

```
pnpm test src/inference/ --run
  3 test files, 37 tests, all passed

pnpm build
  ✓ built in 14.41s (no new TypeScript errors)

grep for store imports in src/inference/
  No store imports found (clean pure modules)
```

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

All created files verified present. All task commits verified in git log:
- b1a916d: feat(28-01): keyword pattern engine with sentence-scoped matching
- 5311161: feat(28-01): co-occurrence tracker with in-memory Map and PWA flush
- 2c38891: feat(28-01): relationship inference orchestrator + entity detection integration
