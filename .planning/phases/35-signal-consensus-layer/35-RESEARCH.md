# Phase 35: Canonical Feature Vectors - Research

**Researched:** 2026-03-13
**Domain:** Feature vector engineering — pure TypeScript compute functions, Dexie sidecar extension, BinderTypeConfig schema extension
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Vector dimension design:**
- GTD lifecycle focused dimensions for task vectors: Age, staleness, deadline proximity, energy level, cognitive load, context match, dependency count, enrichment depth
- Fixed-length vectors per type: Each atom type has a known dimension count declared in BinderTypeConfig. Zero-fill unused slots for cold-start. Downstream ONNX models get static input shapes
- Normalized 0-1 floats: Continuous values for all numeric dimensions. Min-max or sigmoid normalization. One-hot encoding for categorical dimensions

**Cross-type vector interactions:**
- Task vectors incorporate entity data: `computeTaskVector(atom, sidecar, entities)` already accepts entities. Entity data is predictive signal
- Person vectors are entity-only: No cross-table task aggregation. Derive from entity registry data only (relationship type, mention count, recency, collaboration frequency)
- Calendar vectors ARE entity-aware: Entity context baked into the calendar vector

**Invalidation & caching strategy:**
- Invalidate on meaningful mutation only: Atom save, triage completion, enrichment answer
- Synchronous inline recomputation: Sub-millisecond, run inline with the triggering action
- All vectors in atomIntelligence: Store in `atomIntelligence.canonicalVector` as Float32Array snapshots
- Simple timestamp versioning: Store `lastComputed` timestamp alongside vector

**BinderTypeConfig extensibility:**
- Named dimension arrays in config: `vectorSchema: { task: ['age', 'staleness', ...], person: [...] }`
- Binder type declares supported vector types (strings in config)
- Static imports for now — no dynamic registry
- Runtime assertion on dimension count

### Claude's Discretion
- Exact dimension count per vector type (task, person, calendar)
- Person vector dimension selection from entity registry fields
- Entity aggregation strategy for multi-entity atoms (primary, mean pool, etc.)
- Normalization approach per dimension (min-max vs sigmoid vs custom)
- Which atom fields constitute a "meaningful mutation" for dirty-checking
- Internal organization of compute modules (one file vs per-type files)

### Deferred Ideas (OUT OF SCOPE)
- Dynamic compute function registry — registerVectorComputer() for third-party binder types
- Behavioral pattern dimensions — completion velocity, deferral count, re-triage frequency
- Cross-binder vector awareness
- Vector visualization
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CFVEC-01 | `computeTaskVector()` derives a typed Float32Array from atom metadata (age, staleness, deadline, context, energy, dependencies) and sidecar data — pure function, no model inference, deterministic | EII experiment defines 27-dim task vector; see dimensions section; atom fields: created_at, updated_at, dueDate, energy, context, links[]; sidecar: cognitiveSignals, entityMentions, enrichment |
| CFVEC-02 | `computePersonVector()` derives a typed vector from entity registry data (relationship type, responsiveness, reliability, collaboration frequency) — sparse one-hot + normalized floats | Entity type has: mentionCount, firstSeen, lastSeen, aliases; EntityRelation has: relationshipType, confidence, sourceAttribution; RELATIONSHIP_TYPES const is the one-hot domain |
| CFVEC-03 | `computeCalendarVector()` derives a typed vector from derived calendar atom fields (time pressure, slack windows, energy cost, overrun risk) | EventAtom has: eventDate, energy, context, status; calendar vector is 34-dim in EII experiment; entity-awareness via EntityMention lookup |
| CFVEC-04 | Canonical vectors cached in `atomIntelligence.canonicalVector` as Float32Array snapshots, invalidated on atom save/triage/enrichment — vector dimension schemas defined per `BinderTypeConfig` | AtomIntelligenceSchema needs new optional field; BinderTypeConfigSchema needs vectorSchema extension; invalidation hooks already exist in store.ts |
</phase_requirements>

## Summary

Phase 35 is a pure TypeScript engineering phase with no external dependencies, no model inference, and no async work. The three compute functions (`computeTaskVector`, `computePersonVector`, `computeCalendarVector`) derive structured Float32Array feature vectors from data already present in Dexie — atom fields, atomIntelligence sidecar, and entity registry. The EII experiment (`scripts/eii-experiment.py`) already validated the exact dimension definitions (task=27, person=23, calendar=34) and proved they yield +0.030 AUC lift over raw embeddings for downstream specialist risk models.

The two schema changes — extending `AtomIntelligenceSchema` with a `canonicalVector` field and extending `BinderTypeConfigSchema` with a `vectorSchema` field — are purely additive. No migration is needed for `canonicalVector` (new optional field on existing sidecar row). The `vectorSchema` addition to `BinderTypeConfig` requires a new `vectors.json` file in `gtd-personal/` plus updates to the Zod schema and `index.ts` merge. Invalidation is synchronous and hooks into existing atom save / triage / enrichment call sites in `store.ts` — same pattern as ring buffer updates in Phase 33.

**Primary recommendation:** Three per-type files (`task-vector.ts`, `person-vector.ts`, `calendar-vector.ts`) under `src/ai/feature-vectors/`, one index that exports all three, one schema file that defines the TypeScript interfaces. Pure functions following the established AI pipeline pattern (import NO store, all state passed by caller).

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript (built-in) | 5.9.3 | Vector compute functions | No new deps needed — pure math |
| Dexie | 4.3.0 | Sidecar persistence | Already project-standard IndexedDB layer |
| Zod v4 | 4.3.6 | Schema validation for vectorSchema | Already used in schema.ts |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | 4.0.18 | Unit tests for compute functions | All new pure functions need test coverage |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Per-type files | Single vectors.ts | Single file becomes large; per-type mirrors established pattern (triage.ts, compression.ts, etc.) |
| Float32Array directly | number[] | Float32Array is the spec-mandated format for ONNX input; number[] would require conversion downstream |

**Installation:** No new packages needed.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── ai/
│   └── feature-vectors/
│       ├── types.ts            # CanonicalVector, VectorSchema, VectorDimensions interfaces
│       ├── task-vector.ts      # computeTaskVector() — CFVEC-01
│       ├── person-vector.ts    # computePersonVector() — CFVEC-02
│       ├── calendar-vector.ts  # computeCalendarVector() — CFVEC-03
│       ├── vector-cache.ts     # writeCanonicalVector(), invalidateVector() — CFVEC-04
│       └── index.ts            # re-exports all public API
├── config/
│   └── binder-types/
│       └── gtd-personal/
│           └── vectors.json    # GTD dimension name arrays for vectorSchema
└── types/
    └── intelligence.ts         # extend AtomIntelligenceSchema with canonicalVector
```

### Pattern 1: Pure Compute Function
**What:** Deterministic Float32Array from plain data inputs. No async, no DB access.
**When to use:** All three computeXVector() functions.
**Example:**
```typescript
// Mirrors the pure function pattern from src/ai/triage.ts, src/ai/compression.ts
// All state passed by caller — no store imports

import type { TaskAtom } from '../../types/atoms';
import type { AtomIntelligence } from '../../types/intelligence';
import type { Entity, EntityRelation } from '../../types/intelligence';

export function computeTaskVector(
  atom: TaskAtom,
  sidecar: AtomIntelligence | undefined,
  entities: Entity[],
  relations: EntityRelation[],
  schemaVersion: number,
): Float32Array {
  const dims = new Float32Array(TASK_VECTOR_DIM); // 27 floats
  // ... fill dims ...
  // Runtime assertion: schema dimension count must match
  if (dims.length !== TASK_VECTOR_DIM) {
    console.error('[task-vector] dimension mismatch', dims.length, TASK_VECTOR_DIM);
  }
  return dims;
}
```

### Pattern 2: Sidecar Write Helper (fire-and-forget)
**What:** Async write of computed vector to atomIntelligence row. Non-blocking.
**When to use:** `writeCanonicalVector()` called from store.ts invalidation triggers.
**Example:**
```typescript
// Matches writePredictionMomentum() pattern from src/storage/atom-intelligence.ts
export function writeCanonicalVector(
  atomId: string,
  vectorType: 'task' | 'person' | 'calendar',
  vector: Float32Array,
): void {
  (async () => {
    try {
      const intel = await getOrCreateIntelligence(atomId);
      intel.canonicalVector = { vectorType, data: vector, lastComputed: Date.now() };
      intel.version++;
      intel.lastUpdated = Date.now();
      await db.atomIntelligence.put(intel);
    } catch (err) {
      console.warn('[vector-cache] writeCanonicalVector failed (non-fatal):', err);
    }
  })();
}
```

### Pattern 3: BinderTypeConfig Extension
**What:** New `vectorSchema` field on ExpandedBinderTypeConfig. Named dimension arrays.
**When to use:** Declaring dimension count + names per vector type per binder type.
**Example:**
```typescript
// In schema.ts: add to BinderTypeConfigSchema
vectorSchema: z.object({
  task: z.array(z.string()).optional(),
  person: z.array(z.string()).optional(),
  calendar: z.array(z.string()).optional(),
}).optional(),
```

```json
// gtd-personal/vectors.json
{
  "vectorSchema": {
    "task": ["age_norm", "staleness_norm", "has_deadline", "days_to_deadline_norm",
             "status_open", "status_done", "status_dropped",
             "has_project", "is_waiting_for",
             "ctx_home", "ctx_office", "ctx_phone", "ctx_computer", "ctx_errands", "ctx_anywhere",
             "energy_low", "energy_medium", "energy_high",
             "enrichment_depth_norm", "has_person_dep", "time_pressure_score",
             "prev_staleness_score", "prev_energy_fit", "entity_reliability",
             "entity_resp_fast", "entity_resp_slow", "entity_resp_unknown"],
    "person": ["rel_spouse", "rel_parent", "rel_child", "rel_colleague", "rel_reports_to",
               "rel_healthcare", "rel_friend", "rel_org_member", "rel_unknown",
               "mention_count_norm", "recency_norm", "days_since_seen_norm",
               "has_user_correction", "confidence_norm",
               "collab_low", "collab_medium", "collab_high",
               "reliability_score", "alias_count_norm",
               "resp_fast", "resp_normal", "resp_slow", "resp_unknown"],
    "calendar": ["start_tod_norm", "dow_mon", "dow_tue", "dow_wed", "dow_thu", "dow_fri", "dow_sat", "dow_sun",
                 "dur_lt30", "dur_30_60", "dur_60_120", "dur_gt120",
                 "energy_low", "energy_medium", "energy_high",
                 "has_deadline", "days_to_event_norm",
                 "time_pressure_score", "overrun_risk",
                 "slack_before_none", "slack_before_short", "slack_before_medium", "slack_before_long",
                 "entity_is_high_priority", "entity_reliability",
                 "mobility_required", "is_recurring",
                 "prep_none", "prep_short", "prep_medium", "prep_long",
                 "has_person_entity", "has_org_entity", "has_loc_entity", "evt_focus_block"]
  }
}
```

### Pattern 4: One-Hot Encoding for Categorical Dimensions
**What:** Sparse binary representation for enum-valued fields.
**When to use:** context tags, energy level, relationship type, day-of-week, duration buckets.
**Example:**
```typescript
// Context tag one-hot (6 slots)
const CTX_ORDER = ['@home', '@office', '@phone', '@computer', '@errands', null] as const;
const ctxIdx = CTX_ORDER.indexOf(atom.context ?? null);
for (let i = 0; i < CTX_ORDER.length; i++) {
  dims[offset + i] = i === ctxIdx ? 1.0 : 0.0;
}
```

### Pattern 5: Temporal Normalization
**What:** Map time-delta values to [0,1] range using a known maximum.
**When to use:** age_days, days_to_deadline, recency_norm, days_since_seen.
**Example:**
```typescript
// Age normalization: cap at 365 days
const ageMs = Date.now() - atom.created_at;
const ageDays = ageMs / 86_400_000;
dims[0] = Math.min(ageDays / 365, 1.0);

// Deadline proximity: negative means overdue; clip to [-1,1] then remap to [0,1]
const daysToDeadline = atom.dueDate
  ? (atom.dueDate - Date.now()) / 86_400_000
  : null;
dims[3] = daysToDeadline !== null
  ? Math.max(0, Math.min(daysToDeadline / 30, 1.0))  // 30-day horizon
  : 0.0;  // no deadline = 0 (zero-fill, not missing marker)
```

### Pattern 6: Entity Aggregation for Multi-Entity Atoms
**What:** Single-entity atoms pass the primary entity directly. Multi-entity atoms use mean pooling across entity vector contributions.
**When to use:** Task vectors with entity signals; calendar vectors with entity context.
**Example:**
```typescript
// Primary entity: highest-confidence relation among atom's entityMentions
function pickPrimaryEntity(mentions: EntityMention[], relations: EntityRelation[]): EntityRelation | null {
  // Filter to user-corrections first, then highest confidence
  const mentionIds = new Set(mentions.filter(m => m.entityId).map(m => m.entityId!));
  const relevant = relations.filter(r =>
    mentionIds.has(r.sourceEntityId) || mentionIds.has(r.targetEntityId)
  );
  if (!relevant.length) return null;
  return relevant.sort((a, b) => {
    const aCorr = a.sourceAttribution === 'user-correction' ? 1 : 0;
    const bCorr = b.sourceAttribution === 'user-correction' ? 1 : 0;
    if (aCorr !== bCorr) return bCorr - aCorr;
    return b.confidence - a.confidence;
  })[0] ?? null;
}
```

### Anti-Patterns to Avoid
- **Async compute functions:** computeXVector() must be synchronous. If you need Dexie data, the caller loads it and passes it in.
- **Importing from store.ts:** Pure module pattern — never import from UI signals. All state passed by caller.
- **Sparse Float32Array with holes:** Zero-fill unused slots explicitly; never leave undefined values in typed arrays.
- **Magic dimension indices:** Always reference dims by named offset constants, not raw numbers. Catches config/code drift.
- **Storing Float32Array directly in Zod schema:** Zod can't validate typed arrays directly; store as `{ data: number[], vectorType: string, lastComputed: number }` in Zod schema, convert to Float32Array on read.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Float32Array serialization to IndexedDB | Custom serializer | Dexie stores TypedArrays natively as blobs | Dexie handles IndexedDB typed array storage transparently |
| Schema validation of vectorSchema config | Manual type checks | Zod in schema.ts (already used) | Type safety + harness injection safety |
| Temporal bucketing math | Custom bucketing | Simple Math.min/max normalization | Linear normalization is sufficient; buckets add complexity for no benefit |
| One-hot utility function | Custom loop | Inline in each compute function | Function is 3 lines; a utility adds indirection for no reuse benefit at this scale |

**Key insight:** This phase is entirely about organizing plain math — no external libraries are needed or beneficial.

## Common Pitfalls

### Pitfall 1: Float32Array in Zod Schema
**What goes wrong:** Zod v4 cannot validate TypedArray instances directly. If you put `Float32Array` in an AtomIntelligenceSchema field, Zod will fail to serialize/deserialize.
**Why it happens:** Zod operates on JSON-serializable types. Float32Array is not JSON-serializable.
**How to avoid:** Store vector as `{ vectorType: string, data: number[], lastComputed: number }` in the Zod schema. Convert `number[]` → `Float32Array` at the read boundary.
**Warning signs:** `z.instanceof(Float32Array)` in schema — this will fail harness JSON round-trips.

### Pitfall 2: Dimension Count Drift Between Schema and Code
**What goes wrong:** `vectors.json` declares 27 task dimensions, but `task-vector.ts` fills 28 slots. Runtime assertion fires silently; downstream model receives wrong-shaped input.
**Why it happens:** Schema names array (documentation) and code constant (contract) are defined separately.
**How to avoid:** Define `TASK_VECTOR_DIM = TASK_DIMENSION_NAMES.length` where `TASK_DIMENSION_NAMES` is imported from the vectors.json. The constant is derived from the names array — they cannot drift.
**Warning signs:** Hardcoded dimension constants like `const TASK_VECTOR_DIM = 27` instead of `= TASK_DIMENSION_NAMES.length`.

### Pitfall 3: Invalidation on Cosmetic Mutations
**What goes wrong:** Every atom title edit triggers vector recomputation. Vectors are pure math, sub-millisecond — but dirty-checking prevents unnecessary sidecar writes.
**Why it happens:** Invalidation hooks in store.ts fire on `atom.updated_at` which changes on any edit.
**How to avoid:** Dirty-check only the fields that feed the vector. Task vector fields: `created_at`, `updated_at` (staleness proxy), `dueDate`, `status`, `energy`, `context`, `links.length`. If none changed, skip recompute.
**Warning signs:** Vector recompute inside the debounced content-edit handler — content changes don't affect task vectors.

### Pitfall 4: Entity Lookup Cost at Invalidation Time
**What goes wrong:** computeTaskVector() needs entity data. Caller must load entities from Dexie before calling the pure function. If entity load is triggered on every atom save, it adds Dexie round-trips.
**Why it happens:** Pure function signature requires caller to pass entities.
**How to avoid:** Load entities only when the task vector invalidation dirty-check confirms recompute is needed. Sequence: dirty-check → if stale → load entities → compute → write.
**Warning signs:** Entity Dexie query inside the dirty-check path (before stale confirmation).

### Pitfall 5: Calendar Vectors for Non-Calendar Atom Types
**What goes wrong:** computeCalendarVector() is called on a task atom. EventAtom has `eventDate`; TaskAtom has `dueDate`. Using wrong field silently produces zero vectors.
**Why it happens:** TypeScript discriminated union means the calendar compute function should only accept `EventAtom`.
**How to avoid:** Type the function signatures as their specific atom types (`atom: TaskAtom`, `atom: EventAtom`), not the base `Atom` union.
**Warning signs:** Function signature accepting `Atom` with an internal `if (atom.type === 'event')` guard.

### Pitfall 6: Missing Dexie v11 Migration
**What goes wrong:** `atomIntelligence.canonicalVector` is a new field on an existing table. No migration is needed for the field itself (Dexie doesn't enforce field-level schema), but if any index is needed on `lastComputed`, a migration is required.
**Why it happens:** Dexie v10 defined `atomIntelligence` without a `canonicalVector` field; existing rows simply won't have it.
**How to avoid:** No migration needed for a non-indexed field — Dexie allows adding fields to existing rows. Do NOT add an index on `canonicalVector.lastComputed` (no query pattern requires it). Existing rows without the field return `undefined` for `intel.canonicalVector`, which the consumer handles as "not yet computed."
**Warning signs:** A v11 migration file that only adds `canonicalVector` — unnecessary.

## Code Examples

Verified patterns from the existing codebase:

### Existing AtomIntelligence sidecar extension pattern
```typescript
// From src/types/intelligence.ts — how Phase 32 extended AtomIntelligenceSchema
// predictionMomentum and entityMomentum are both optional fields added without migration

predictionMomentum: z.object({
  signalFrequency: z.record(z.string(), z.number()),
  // ...
}).optional(),

// Phase 35: same pattern for canonicalVector
canonicalVector: z.object({
  vectorType: z.enum(['task', 'person', 'calendar']),
  data: z.array(z.number()),          // Float32Array serialized as number[]
  lastComputed: z.number(),           // Unix epoch ms
  schemaVersion: z.number(),          // dimension schema version, for invalidation on schema change
}).optional(),
```

### Existing fire-and-forget sidecar write pattern
```typescript
// From src/storage/atom-intelligence.ts — writePredictionMomentum()
// Phase 35: writeCanonicalVector() follows identical pattern
export function writePredictionMomentum(atomId: string, snapshot: {...}): void {
  (async () => {
    try {
      const intel = await getOrCreateIntelligence(atomId);
      intel.predictionMomentum = snapshot;
      intel.version++;
      intel.lastUpdated = Date.now();
      await db.atomIntelligence.put(intel);
    } catch (err) {
      console.warn('[atom-intelligence] writePredictionMomentum failed (non-fatal):', err);
    }
  })();
}
```

### Existing BinderTypeConfig extension pattern
```typescript
// From src/config/binder-types/schema.ts — how predictionConfig was added
// Phase 35: vectorSchema added in same location

// --- Phase 32: Predictive enrichment scorer config ---
predictionConfig: PredictionConfigSchema.optional(),
signalCategoryMap: z.record(z.string(), z.array(z.string())).optional(),

// --- Phase 35: Canonical vector schema ---
vectorSchema: z.object({
  task: z.array(z.string()).optional(),
  person: z.array(z.string()).optional(),
  calendar: z.array(z.string()).optional(),
}).optional(),
```

### Existing binder-types/index.ts merge pattern
```typescript
// From src/config/binder-types/index.ts
import prediction from './gtd-personal/prediction.json';
// Phase 35: add parallel import
import vectors from './gtd-personal/vectors.json';

// In mergeGtdPersonalConfig():
vectorSchema: vectors.vectorSchema,
```

### EII-validated dimension definitions (from scripts/eii-experiment.py)
```
Task (27 dims):    age_days, days_since_touched, has_deadline, days_to_deadline,
                   status×3, has_project, is_waiting_for, ctx×6, energy×3,
                   enrichment_depth, has_person_dep, time_pressure, prev_staleness,
                   blocked_prob, energy_fit

Person (23 dims):  rel_type×5, tz_offset_norm, availability×4, channels×4,
                   responsiveness×4, dependency_reliability, collab×3, social_load

Calendar (34 dims): start_tod, dow×7, duration×4, event_type×5, mobility,
                    energy_cost×3, time_pressure, overrun_risk, slack_before×4,
                    slack_after×4, prep_time×4
```
Note: GTD version of person vector uses RELATIONSHIP_TYPES (10 values from intelligence.ts) for the rel_type one-hot, expanding from the EII experiment's 5-class approximation.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw MiniLM embeddings (384-dim opaque) as ONNX classifier input | Canonical feature vectors (structured, typed, interpretable) as specialist model input | EII experiment 2026-03 | +0.030 AUC lift; each dimension is human-readable |
| Single classifier on full content | Specialist models on non-overlapping vector slices | Phase 36 (next) | Ensemble consensus; explainability per dimension |

**Deprecated/outdated:**
- Raw embedding as sole ONNX input: Still used for type classification (Phase 21 MLP); canonical vectors are the new input for risk specialist models (Phase 36), not a replacement for existing classifiers.

## Open Questions

1. **Person vector for entities with no relations**
   - What we know: An entity may exist in the registry with `mentionCount > 0` but no EntityRelation rows yet
   - What's unclear: Should the person vector return a zero-filled "unknown" vector or be undefined?
   - Recommendation: Return zero-filled vector with `rel_unknown = 1.0` and all other relation dimensions = 0. Downstream models must handle the zero case; undefined would require null-checking everywhere.

2. **Calendar entity-awareness without a calendar atom type**
   - What we know: Calendar atoms are EventAtom instances (`type: 'event'`). The existing `EventAtom` schema has `eventDate` and base fields including `energy` and `context`
   - What's unclear: There is no dedicated CalendarAtom type; "calendar" is a semantic category of EventAtom
   - Recommendation: computeCalendarVector() accepts EventAtom specifically. The function name reflects intent, not a new atom type. Document this clearly.

3. **vectorSchema field presence in existing gtd-personal configs**
   - What we know: manifest.json lists `configFiles` without vectors.json; index.ts merge function must be updated
   - What's unclear: Whether a missing vectors.json causes a Zod validation error or a graceful fallback
   - Recommendation: `vectorSchema` is optional in Zod schema; fallback to empty object when not present. Compute functions use their own bundled dimension constants as the source of truth — vectorSchema names are documentation only.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 |
| Config file | vite.config.ts (test section inferred — no standalone vitest.config.ts exists) |
| Quick run command | `pnpm test -- --reporter=verbose src/ai/feature-vectors` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CFVEC-01 | computeTaskVector returns Float32Array of correct dimension from task atom + sidecar | unit | `pnpm test -- src/ai/feature-vectors/task-vector.test.ts` | Wave 0 |
| CFVEC-01 | computeTaskVector output is deterministic for same input | unit | `pnpm test -- src/ai/feature-vectors/task-vector.test.ts` | Wave 0 |
| CFVEC-01 | computeTaskVector zero-fills when sidecar is undefined (cold-start) | unit | `pnpm test -- src/ai/feature-vectors/task-vector.test.ts` | Wave 0 |
| CFVEC-02 | computePersonVector returns Float32Array from entity + relations | unit | `pnpm test -- src/ai/feature-vectors/person-vector.test.ts` | Wave 0 |
| CFVEC-02 | computePersonVector produces rel_unknown=1.0 when no relations | unit | `pnpm test -- src/ai/feature-vectors/person-vector.test.ts` | Wave 0 |
| CFVEC-03 | computeCalendarVector returns correct dimension Float32Array from EventAtom | unit | `pnpm test -- src/ai/feature-vectors/calendar-vector.test.ts` | Wave 0 |
| CFVEC-04 | vectorSchema extension on BinderTypeConfigSchema validates correctly | unit | `pnpm test -- src/config/binder-types/schema.test.ts` | Exists — extend |
| CFVEC-04 | writeCanonicalVector persists vector to atomIntelligence | unit | `pnpm test -- src/ai/feature-vectors/vector-cache.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test -- src/ai/feature-vectors`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/ai/feature-vectors/task-vector.test.ts` — covers CFVEC-01
- [ ] `src/ai/feature-vectors/person-vector.test.ts` — covers CFVEC-02
- [ ] `src/ai/feature-vectors/calendar-vector.test.ts` — covers CFVEC-03
- [ ] `src/ai/feature-vectors/vector-cache.test.ts` — covers CFVEC-04 persistence path

`src/config/binder-types/schema.test.ts` already exists and will be extended to cover `vectorSchema` validation.

## Sources

### Primary (HIGH confidence)
- `scripts/eii-experiment.py` — authoritative source for validated dimension definitions (task=27, person=23, calendar=34) and their EII-proven predictive value
- `src/types/intelligence.ts` — AtomIntelligenceSchema current shape; extension point for canonicalVector
- `src/config/binder-types/schema.ts` — BinderTypeConfigSchema; extension point for vectorSchema
- `src/storage/atom-intelligence.ts` — fire-and-forget write pattern (writePredictionMomentum)
- `src/config/binder-types/index.ts` — merge function; needs vectors.json import added
- `src/types/atoms.ts` — TaskAtom, EventAtom field definitions for compute function inputs
- `src/storage/entity-helpers.ts` — Entity/EntityRelation access patterns for person vector inputs

### Secondary (MEDIUM confidence)
- `src/storage/migrations/v10.ts` — confirms no migration needed for non-indexed atomIntelligence fields
- `src/search/__tests__/ring-buffer.test.ts` — test style/pattern for pure function unit tests

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries are existing project dependencies; no new installs
- Architecture: HIGH — dimension definitions validated by EII experiment; patterns directly mirror existing code
- Pitfalls: HIGH — derived from direct inspection of existing types (Zod/Float32Array incompatibility, dimension drift pattern)

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable domain — no external dependencies to go stale)
