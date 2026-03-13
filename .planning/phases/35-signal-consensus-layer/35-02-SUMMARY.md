---
phase: 35-signal-consensus-layer
plan: "02"
subsystem: ai/feature-vectors
tags:
  - canonical-vectors
  - vector-cache
  - invalidation
  - tdd
  - store-wiring

dependency_graph:
  requires:
    - src/ai/feature-vectors/types.ts (CanonicalVector type)
    - src/ai/feature-vectors/task-vector.ts (computeTaskVector)
    - src/ai/feature-vectors/calendar-vector.ts (computeCalendarVector)
    - src/ai/feature-vectors/person-vector.ts (computePersonVector)
    - src/storage/atom-intelligence.ts (getOrCreateIntelligence pattern)
    - src/storage/db.ts (Dexie atomIntelligence table)
    - src/ui/signals/store.ts (three invalidation sites)
  provides:
    - src/ai/feature-vectors/vector-cache.ts (writeCanonicalVector, shouldRecomputeVector, dirtyCheckTaskFields, recomputeAndCacheVector, recomputePersonVector)
    - src/ai/feature-vectors/index.ts (updated barrel with cache exports)
  affects:
    - Phase 36 specialist ONNX models (consume cached canonical vectors)
    - store.ts enrichment answer handler (fires vector recompute)
    - store.ts triage completion handler (fires vector recompute)
    - store.ts applyGTDRecommendation (fires vector recompute on vector-feeding field changes)

tech_stack:
  added:
    - Dynamic import pattern for vector-cache (fire-and-forget, bundle-lean)
  patterns:
    - Fire-and-forget async wrapper (same as writePredictionMomentum)
    - shouldRecomputeVector dirty-check via updated_at vs lastComputed
    - dirtyCheckTaskFields field-level diff (only vector-feeding fields: status, energy, context, dueDate, links.length)
    - Dynamic import at invalidation sites to keep vector-cache off critical render path
    - try/finally db.put restoration pattern in tests to prevent module state leakage

key_files:
  created:
    - src/ai/feature-vectors/vector-cache.ts
    - src/ai/feature-vectors/vector-cache.test.ts
  modified:
    - src/ai/feature-vectors/index.ts (added cache helper exports)
    - src/ui/signals/store.ts (three invalidation site wirings)

decisions:
  - "dirtyCheckTaskFields accepts Partial<TaskAtom> as prev — callers without full prev state can pass only the fields they tracked"
  - "recomputeAndCacheVector uses dynamic import() for task-vector and calendar-vector — lazy load avoids adding vector compute to main bundle critical path"
  - "applyGTDRecommendation is the canonical atom save site in store.ts — only fires recompute when vector-feeding keys are present in changes"
  - "Triage completion recomputes vectors for ALL inbox items with type task/event — safe because fire-and-forget never blocks UX"
  - "db.atomIntelligence.put mock restoration via try/finally prevents test state leakage across test files"

metrics:
  duration: "18 minutes"
  completed: "2026-03-13"
  tasks_completed: 1
  files_created: 2
  files_modified: 2
  tests_added: 17
  test_results: "17 new tests pass (shouldRecomputeVector x4, dirtyCheckTaskFields x9, writeCanonicalVector x4)"
---

# Phase 35 Plan 02: Vector Cache and Invalidation Wiring Summary

**One-liner:** Fire-and-forget vector cache module (shouldRecomputeVector + writeCanonicalVector + recomputeAndCacheVector) wired into store.ts at enrichment answer, triage completion, and atom save sites via dynamic import.

## What Was Built

### Vector Cache Module (`src/ai/feature-vectors/vector-cache.ts`)

**`shouldRecomputeVector(atom, cached)`**
- Returns true when `cached` is undefined (cold start)
- Returns true when `atom.updated_at > cached.lastComputed` (atom mutated since last compute)
- Returns false when cached vector is fresh (cosmetic edit scenario)

**`dirtyCheckTaskFields(prev, next)`**
- Compares vector-feeding fields only: `dueDate`, `status`, `energy`, `context`, `links.length`
- Returns false for cosmetic changes (title, content)
- Accepts `Partial<TaskAtom>` as prev — callers can pass only the fields they tracked

**`writeCanonicalVector(atomId, vectorType, vector)`**
- Fire-and-forget async wrapper (same IIFE pattern as `writePredictionMomentum`)
- Converts `Float32Array` to `number[]` via `Array.from(vector)` for JSON-safe serialization
- Writes `{ vectorType, data, lastComputed: Date.now(), schemaVersion: 1 }` to `atomIntelligence.canonicalVector`
- Catches all errors, logs `console.warn('[vector-cache]...')`, never throws

**`recomputeAndCacheVector(atom, sidecar, entities, relations)`**
- Type-routes: `task` → `computeTaskVector`, `event` → `computeCalendarVector`, others → no-op
- Uses dynamic `import('./task-vector')` / `import('./calendar-vector')` to avoid bundle bloat
- Synchronous dispatch + async fire-and-forget write

**`recomputePersonVector(entity, relations)`**
- Uses `entity:${entity.id}` as synthetic sidecar key (entities don't have 1:1 atom mapping)
- Dynamic `import('./person-vector')` pattern

### Index Barrel (`src/ai/feature-vectors/index.ts`)
Added exports: `writeCanonicalVector`, `shouldRecomputeVector`, `dirtyCheckTaskFields`, `recomputeAndCacheVector`, `recomputePersonVector`

### store.ts Wiring (three invalidation sites)

**Site 1 — Enrichment answer** (inside `handleEnrichmentAnswer` try block):
After `writeEnrichmentRecord()`, fires `recomputeAndCacheVector` for inbox items with type `task` or `event`. Enrichment depth is a vector dimension — enriching deepens the vector.

**Site 2 — Triage completion** (after `invalidateCache` call):
After triage batch completes, fires recompute for all inbox items with type `task` or `event`. Iterates `state.inboxItems`, loads sidecar lazily per item.

**Site 3 — Atom save via `applyGTDRecommendation`**:
Checks if any key in `changes` is a vector-feeding field (`status`, `energy`, `context`, `dueDate`, `links`). If yes, loads sidecar and fires recompute with changes merged into the current atom state (pre-worker approximation).

All three sites use:
- `getIntelligence(id).then(...)` — async sidecar load
- `import('../../ai/feature-vectors/vector-cache').then(...)` — lazy module load
- `.catch(() => {})` — non-fatal failure suppression

## Test Coverage (17 tests)

`vector-cache.test.ts`:
- `shouldRecomputeVector` (4 tests): cold start, stale, fresh, equal timestamps
- `dirtyCheckTaskFields` (9 tests): each vector-feeding field change, title-only cosmetic, content-only cosmetic, no-change baseline, dueDate undefined→defined
- `writeCanonicalVector` (4 tests): getOrCreateIntelligence called with correct atomId, canonicalVector shape persisted correctly, console.warn on Dexie failure, Float32Array→number[] conversion

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test fixture used string dates for dueDate field**
- **Found during:** Task 1 TDD GREEN phase — TS compilation
- **Issue:** Test used `dueDate: '2026-04-01'` (string) but `TaskAtom.dueDate` is `number` (Unix ms). Caused TS errors.
- **Fix:** Replaced string date literals with numeric epoch constants (`DUE_APRIL = NOW + 19 * 86_400_000`)
- **Files modified:** `src/ai/feature-vectors/vector-cache.test.ts`
- **Commit:** 7a2378d (same task commit)

**2. [Rule 1 - Bug] Test used wrong AtomLink shape for links field**
- **Found during:** Task 1 TDD GREEN phase — TS compilation
- **Issue:** Test used `{ id, url, title, addedAt }` shape but `AtomLink` is `{ targetId, relationshipType, direction }`. Caused TS type error.
- **Fix:** Updated test fixture to use correct AtomLink shape with uuid targetId and direction enum
- **Files modified:** `src/ai/feature-vectors/vector-cache.test.ts`
- **Commit:** 7a2378d (same task commit)

**3. [Rule 1 - Bug] db.atomIntelligence.put replacement leaked across test files**
- **Found during:** Full test run — task-vector.test.ts determinism failure when run together with vector-cache.test.ts
- **Issue:** `(db.atomIntelligence as any).put = putCapture` permanently mutated the shared module instance, breaking task-vector tests that rely on the original put behavior.
- **Fix:** Added try/finally blocks to restore the original put function after each test that mutates it.
- **Files modified:** `src/ai/feature-vectors/vector-cache.test.ts`
- **Commit:** 7a2378d (same task commit)

## Self-Check: PASSED

Files exist:
- src/ai/feature-vectors/vector-cache.ts — FOUND
- src/ai/feature-vectors/vector-cache.test.ts — FOUND
- src/ai/feature-vectors/index.ts — FOUND (with cache exports)

Commits:
- 7a2378d feat(35-02): vector cache module with dirty-check and store.ts invalidation wiring
