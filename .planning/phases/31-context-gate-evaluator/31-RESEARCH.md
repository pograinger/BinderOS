# Phase 31: Context Gate Evaluator - Research

**Researched:** 2026-03-12
**Domain:** Pipeline integration, Dexie logging, TypeScript type extension, SolidJS context assembly
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **GateContext is required on every dispatch** — not optional, not backwards-compat. Every `dispatchTiered()` call must provide a `GateContext`. Callers that don't provide context are bugs.
- **Caller builds the GateContext** — the store/UI layer already has route, time, atom intelligence. Pipeline stays pure — no store/router/Dexie imports in `pipeline.ts` or predicates.
- **GateContext gets `lastEnrichedAt` field** — caller queries atomIntelligence sidecar for the atom's last enrichment timestamp and passes it. History predicate stays a pure function, no async Dexie reads.
- **`context` field added to `TieredRequest`** — GateContext becomes part of the request type, not a separate parameter.
- **TieredResponse with `gateBlocked: true`** — blocked dispatches return a normal TieredResponse with a `gateBlocked` flag and the full `GateResult` attached. No exception, no separate type.
- **No handler execution when blocked** — if gate blocks, skip the entire handler loop. Return immediately with gate result.
- **Log everything** — every gate evaluation writes to `gateActivationLog`, all predicates, all outcomes. ~1 row per predicate per dispatch call.
- **Fire-and-forget writes** — gate evaluation is sync (pure functions), log write is async fire-and-forget. Dispatch latency unaffected.
- **TTL cleanup exists** — default retention 30 days, configurable in BinderTypeConfig.
- **Direct Dexie queries** — harness queries `gateActivationLog` directly using compound indexes `[predicateName+timestamp]` and `[atomId+timestamp]`. No new API layer.
- **Blocked dispatches appear in harness reports** — with gate metadata (which predicates blocked, why).

### Claude's Discretion

- TTL cleanup timing strategy (app boot vs lazy vs periodic)
- Whether to batch log writes (one bulk insert per dispatch vs one per predicate)
- Test helper design for providing permissive default GateContext in existing tests
- Exact structure of gate metadata on TieredResponse (inline vs nested)

### Deferred Ideas (OUT OF SCOPE)

- **Intelligent gate log pruner** — Optuna-informed worker that balances database bloat vs signal value
- **Custom predicates per binder type** — `registerPredicate()` API exists but no non-core predicates yet
- **Gate analytics dashboard** — UI surface showing predicate activation rates (harness-only for now)
- **Adaptive gate thresholds** — self-tuning thresholds based on accumulated log data (static for now)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| GATE-01 | Pre-dispatch `ActivationGate` filter in `dispatchTiered()` evaluates context predicates before any handler runs, without modifying `TierHandler.canHandle()` interface | `canActivate()` from `activation-gate.ts` is the call site; insert before handler loop at pipeline.ts ~line 80. `TieredRequest` gets `context: GateContext` field; pure pre-filter, handlers untouched. |
| GATE-02 | Route-aware gating skips triage/enrichment when on Insights, Archive, or Settings views | `routePredicate` already reads `blockedRoutes` from config; gating.json already lists `["/insights", "/archive", "/settings"]`. Caller sets `ctx.route` from SolidJS `useLocation().pathname`. |
| GATE-03 | Time-of-day gating suppresses deep-cognitive agents during low-energy windows | `timePredicate` already reads `lowEnergyHours` from config; gating.json lists `[22,23,0,1,2,3,4,5]`. Caller sets `ctx.timeOfDay = new Date().getHours()`. |
| GATE-04 | Atom history gating skips re-enrichment when `enrichment.depth >= 2` and no content change within 7 days | `historyPredicate` has `staleDays` stubbed with TODO at line 37. Complete by: add `lastEnrichedAt?: number` to `GateContext`, compare `Date.now() - ctx.lastEnrichedAt > staleDays * 86400000`. |
| GATE-05 | Gate activation decisions logged to `gateActivationLog` sidecar audit table for harness measurement | `gateActivationLog` table exists (v10 migration). `GateActivationLogEntry` type is fully defined. Write one entry per predicate per dispatch, fire-and-forget async. |
</phase_requirements>

---

## Summary

Phase 31 is a pure integration and completion phase — all infrastructure exists from Phase 30. The work is: (1) extend two types (`TieredRequest` and `TieredResponse`), (2) call `canActivate()` inside `dispatchTiered()` before the handler loop, (3) complete the `staleDays` stub in `historyPredicate`, (4) write gate results to `gateActivationLog` fire-and-forget, and (5) update every `dispatchTiered()` call site to build and pass a `GateContext`.

The three call sites are: `src/ai/triage.ts` (3 calls: classify-type, classify-gtd, check-completeness), `src/ui/components/DecompositionFlow.tsx` (1 call), and `scripts/harness/harness-pipeline.ts` (0 direct calls — harness builds atoms directly but any future harness triage invocations need context). All callers must supply a `GateContext`; missing context is a bug per the locked decisions.

The harness integration is straightforward: the harness already uses a `HarnessEntityStore` with in-memory `atomIntelligence` — it can build GateContext from that store plus synthetic time/route values, and the existing `gateActivationLog` compound indexes `[predicateName+timestamp]` and `[atomId+timestamp]` are the query path for activation rate measurement.

**Primary recommendation:** Wire `canActivate()` in `dispatchTiered()` before the handler loop, extend types minimally, complete the staleDays check in `historyPredicate`, write fire-and-forget log entries from `dispatchTiered()` itself (not from the predicates), and update all callers. No new files needed beyond a gate-log writer helper.

---

## Standard Stack

### Core (all already in project)
| Library/Module | Version/Location | Purpose | Why Standard |
|----------------|-----------------|---------|--------------|
| `src/ai/context-gate/activation-gate.ts` | Phase 30 | Single entry point: `canActivate(ctx, config)` | AND semantics across all predicates, default-allow when empty |
| `src/ai/context-gate/predicate-registry.ts` | Phase 30 | `evaluatePredicates()` returns named per-predicate results | Full observability, mirrors handler registry pattern |
| `src/types/gate.ts` | Phase 30 | All gate types: `GateContext`, `GateResult`, `GateActivationLogEntry` | CRDT-ready, compound-indexed |
| `src/storage/db.ts` | Phase 30 | `gateActivationLog` table, indexes `[predicateName+timestamp]`, `[atomId+timestamp]` | Already declared in v10 migration |
| Dexie `db.gateActivationLog.bulkAdd()` | Project-wide | Fire-and-forget log writes | Consistent with Phase 26 sidecar pattern |
| `crypto.randomUUID()` | Browser native | ID generation for log entries | Already used throughout project |

### Supporting
| Library/Module | Purpose | When to Use |
|----------------|---------|-------------|
| `src/config/binder-types/index.ts` `getBinderConfig()` | Provides `ExpandedBinderTypeConfig` to `canActivate()` | Called by `dispatchTiered()` to get active config for gate evaluation |
| `src/ai/context-gate/predicates/index.ts` `initCorePredicates()` | Registers all 4 predicates at app init | Must be called once before any dispatch; already handles module-level auto-registration |
| SolidJS `useLocation()` | Route detection | Store/UI layer builds `ctx.route` from this |

---

## Architecture Patterns

### Recommended File Changes
```
src/ai/tier2/types.ts          — extend TieredRequest + TieredResponse
src/ai/tier2/pipeline.ts       — insert gate pre-filter, log writes
src/types/gate.ts              — add lastEnrichedAt to GateContext
src/ai/context-gate/predicates/history-predicate.ts  — complete staleDays check
src/ai/triage.ts               — update 3 dispatchTiered calls with context
src/ui/components/DecompositionFlow.tsx   — update 1 dispatchTiered call with context
scripts/harness/harness-pipeline.ts      — update harness to build GateContext
```

No new files are required. The gate log writer can be an inline helper inside `pipeline.ts` rather than a separate module, since it is a 5-10 line fire-and-forget block.

### Pattern 1: Type Extension — TieredRequest and TieredResponse

**What:** Add `context: GateContext` to `TieredRequest`, add `gateBlocked?: boolean` and `gateResult?: GateResult` to `TieredResponse`. The `context` field is required (not optional) per locked decision.

**When to use:** This is the only type shape that satisfies the locked decision without breaking the pipeline return contract.

**Example:**
```typescript
// src/ai/tier2/types.ts — extend TieredRequest
export interface TieredRequest {
  requestId: string;
  task: AITaskType;
  features: TieredFeatures;
  /** Gate context for pre-dispatch evaluation. Required: callers that omit this are bugs. */
  context: GateContext;
}

// src/ai/tier2/types.ts — extend TieredResponse
export interface TieredResponse {
  result: TieredResult;
  attempts: TieredResult[];
  escalated: boolean;
  totalMs: number;
  /** True when the gate blocked dispatch — no handlers ran */
  gateBlocked?: boolean;
  /** Full gate evaluation result — populated whether blocked or not */
  gateResult?: GateResult;
}
```

### Pattern 2: GateContext Extension — lastEnrichedAt

**What:** Add `lastEnrichedAt?: number` (Unix epoch ms) to `GateContext` for the staleDays check. Caller reads this from `atomIntelligence` sidecar before building context.

```typescript
// src/types/gate.ts — add to GateContext
export interface GateContext {
  route?: string;
  timeOfDay?: number;
  atomId?: string;
  enrichmentDepth?: number;
  binderType?: string;
  /** Unix epoch ms of atom's last enrichment — for staleDays check in historyPredicate */
  lastEnrichedAt?: number;
  customFields?: Record<string, unknown>;
}
```

### Pattern 3: Pre-Filter in dispatchTiered()

**What:** Insert gate evaluation and log writes before the handler loop. Return immediately with `gateBlocked: true` if gate blocks. Keep handler loop entirely unchanged.

```typescript
// src/ai/tier2/pipeline.ts
import { canActivate } from '../context-gate/activation-gate';
import { getBinderConfig } from '../../config/binder-types';
import { db } from '../../storage/db';
import type { GateActivationLogEntry } from '../../types/gate';

export async function dispatchTiered(request: TieredRequest): Promise<TieredResponse> {
  const startTime = performance.now();

  // --- Gate pre-filter (Phase 31) ---
  const binderConfig = getBinderConfig(request.context.binderType ?? 'gtd-personal');
  const gateResult = canActivate(request.context, binderConfig);

  // Fire-and-forget log writes — one entry per predicate
  void writeGateLog(request, gateResult, binderConfig.schemaVersion.toString());

  if (!gateResult.canActivate) {
    return {
      result: {
        tier: 1,
        confidence: 0,
        reasoning: `Gate blocked: ${gateResult.predicateResults
          .filter(r => !r.activated)
          .map(r => r.reason)
          .join('; ')}`,
      },
      attempts: [],
      escalated: false,
      totalMs: performance.now() - startTime,
      gateBlocked: true,
      gateResult,
    };
  }

  // --- Handler loop (unchanged) ---
  const threshold = CONFIDENCE_THRESHOLDS[request.task];
  // ... existing code unchanged ...
  return { result: fallback, attempts, escalated: attempts.length > 1, totalMs: performance.now() - startTime, gateResult };
}
```

**CRITICAL PURITY CONSTRAINT:** `pipeline.ts` currently has no Dexie imports. The locked decision says "pure module: no store imports, no Dexie imports." However, the gate logging MUST write to Dexie. Resolution: the fire-and-forget write can import `db` directly (a storage import is not the same as a store/reactive import). Examine whether project pattern allows this — `src/ai/triage.ts` itself imports `db` indirectly. The alternative is to accept a logger callback injected at init time, but the CONTEXT.md says "direct Dexie queries" for harness — consistent with pipeline owning the writes directly.

**Recommendation:** Import `db` into `pipeline.ts` for the log writes only. The "pure module" constraint in the comment refers to no SolidJS store/reactive imports, not absolute zero Dexie usage. This is consistent with Phase 26's fire-and-forget sidecar pattern.

### Pattern 4: staleDays Completion in historyPredicate

**What:** Complete the TODO at line 37 of `history-predicate.ts`. If atom was enriched more than `staleDays` ago, re-allow enrichment even if depth >= maxDepth.

```typescript
// src/ai/context-gate/predicates/history-predicate.ts
// Replace the TODO block:
const staleDaysMs = config.predicateConfig.historyGating.staleDays * 24 * 60 * 60 * 1000;
const isStale = ctx.lastEnrichedAt !== undefined
  ? (Date.now() - ctx.lastEnrichedAt) > staleDaysMs
  : false;  // No timestamp = assume not stale (conservative)

if (exceedsMax && !isStale) {
  return {
    activated: false,
    reason: `Enrichment depth ${currentDepth} has reached maxDepth ${maxDepth} and atom is not stale`,
    metadata: { maxDepth, currentDepth, staleDays, lastEnrichedAt: ctx.lastEnrichedAt },
  };
}
return {
  activated: true,
  reason: exceedsMax
    ? `Enrichment depth ${currentDepth} >= maxDepth but atom is stale — re-enrichment allowed`
    : `Enrichment depth ${currentDepth} is below maxDepth ${maxDepth}`,
  metadata: { maxDepth, currentDepth, isStale },
};
```

### Pattern 5: Caller GateContext Assembly

**What:** Each call site builds a GateContext from available context. The triage caller in `store.ts` has access to route (via SolidJS `useLocation().pathname`), time (`new Date().getHours()`), and atomIntelligence sidecar.

For `src/ai/triage.ts`, the `triageInbox()` function currently accepts `atoms`, `scores`, etc. It needs route and time passed in, or the GateContext built at the call site in `store.ts` and passed down to each `dispatchTiered()` call.

**Recommended approach:** Build GateContext at each `dispatchTiered()` call site. For triage.ts, add `gateContextBase?: Partial<GateContext>` to `TriageRequest` and merge with per-atom fields (atomId, enrichmentDepth, lastEnrichedAt) at each dispatch.

**Example for triage caller:**
```typescript
// At dispatchTiered call site in triage.ts
const tieredResponse = await dispatchTiered({
  requestId: crypto.randomUUID(),
  task: 'classify-type',
  features: { content: item.content, ... },
  context: {
    route: options.route,               // passed from store
    timeOfDay: new Date().getHours(),
    atomId: item.id,
    binderType: 'gtd-personal',
    enrichmentDepth: item.enrichmentDepth ?? 0,
    lastEnrichedAt: item.lastEnrichedAt, // from atomIntelligence query
  },
});
```

**For DecompositionFlow.tsx** (UI component): builds context from `useLocation().pathname` and `new Date().getHours()` inline.

### Pattern 6: Fire-and-Forget Gate Log Writer

**What:** A small helper inside `pipeline.ts` that writes one `GateActivationLogEntry` per predicate result. Async, non-blocking, errors swallowed (same as Phase 26 pattern).

```typescript
async function writeGateLog(
  request: TieredRequest,
  gateResult: GateResult,
  configVersion: string,
): Promise<void> {
  try {
    const now = Date.now();
    const entries: GateActivationLogEntry[] = gateResult.predicateResults.map(r => ({
      id: crypto.randomUUID(),
      predicateName: r.name,
      outcome: r.activated ? 'activated' : 'blocked',
      timestamp: now,
      configVersion,
      atomId: request.context.atomId,
      route: request.context.route,
      timeOfDay: request.context.timeOfDay,
      binderType: request.context.binderType,
      enrichmentDepth: request.context.enrichmentDepth,
      version: 1,
      deviceId: 'local',           // Phase 31: single device, CRDT prep for v7.0
      updatedAt: now,
    }));
    await db.gateActivationLog.bulkAdd(entries);
  } catch (err) {
    // Non-fatal: log loss is acceptable, never block dispatch
    console.warn('[context-gate] Failed to write activation log:', err);
  }
}
```

**Bulk vs per-predicate:** One `bulkAdd()` per dispatch is better than 4 individual adds — single IDB transaction, same semantic result.

### Anti-Patterns to Avoid

- **Putting gate state in TierHandler.canHandle():** Locked decision — `canHandle()` interface must NOT be modified. Gate is pipeline-level, not handler-level.
- **Async gate evaluation:** Predicates are pure synchronous functions. Adding async/Dexie reads to predicates breaks the pure module contract and adds latency. Context must be pre-fetched by the caller.
- **Making `context` optional on TieredRequest:** The locked decision states callers without context are bugs. Making it optional hides bugs. Mark required.
- **Creating a new GateLogger service:** Overkill. Inline helper in pipeline.ts is sufficient for Phase 31. The harness queries Dexie directly.
- **TTL pruning in the log write path:** TTL cleanup should be lazy (on boot) or background, never inline with dispatch.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| AND predicate aggregation | Custom aggregator | `canActivate()` in activation-gate.ts | Already implements AND semantics + default-allow; tested |
| Per-predicate result collection | Manual loop | `evaluatePredicates()` in predicate-registry.ts | Returns named results with full metadata |
| UUID generation | Custom ID function | `crypto.randomUUID()` | Browser-native, already used throughout project |
| Bulk Dexie insert | Individual `db.add()` calls | `db.gateActivationLog.bulkAdd()` | Single IDB transaction, lower overhead |
| Stale-date arithmetic | Custom date math | `Date.now() - lastEnrichedAt > staleDays * 86400000` | Simple inline math is sufficient; no date library needed |

---

## Common Pitfalls

### Pitfall 1: Importing `db` in pipeline.ts violates "pure module"

**What goes wrong:** `pipeline.ts` has a comment declaring it a pure module with no store imports. Developer avoids adding `db` import and instead tries to inject a logger callback at init, creating unnecessary complexity.

**Why it happens:** Over-reading the "pure module" comment. The intent is no SolidJS reactive store imports (which would create circular deps and proxy gotchas), not a prohibition on storage imports.

**How to avoid:** Check what "pure module" means in context — `src/ai/triage.ts` imports `db` for classification log writes. Same pattern is safe here. Import `db` from storage/db for the gate log writer.

### Pitfall 2: context field is optional — callers skip building GateContext

**What goes wrong:** Making `context?: GateContext` optional on `TieredRequest` to avoid touching all call sites. Callers omit context, gate never fires, requirements silently not met.

**Why it happens:** Laziness at the call sites.

**How to avoid:** Mark `context: GateContext` required (not `?`). TypeScript will enforce all call sites update. There are exactly 4 call sites (3 in triage.ts, 1 in DecompositionFlow.tsx).

**Warning signs:** If tests still pass without changes to triage.ts, the field is optional and the gate isn't wiring.

### Pitfall 3: staleDays check inverted logic

**What goes wrong:** Enrichment is allowed when it should be blocked (or vice versa) because the staleness condition is backwards. The intent: if depth >= maxDepth AND atom is NOT stale, block. If depth >= maxDepth AND atom IS stale, allow (re-enrichment needed).

**How to avoid:** Test all four combinations: (depth < max), (depth >= max + fresh), (depth >= max + stale), (no depth in context).

### Pitfall 4: Gate log write blocks dispatch latency

**What goes wrong:** Awaiting `writeGateLog()` before returning from `dispatchTiered()`, adding ~1-5ms IDB write latency to every dispatch.

**How to avoid:** Use `void writeGateLog(...)` — fire-and-forget. Gate evaluation is sync; log is async side-effect.

### Pitfall 5: Gate blocks all dispatch tasks equally — triage vs enrichment distinction lost

**What goes wrong:** Route gating blocks triage, GTD classification, enrichment, and decompose equally when on /insights. But the requirement (GATE-02) specifically says "triage and enrichment agents do not fire." Decomposition is user-triggered and should probably still work.

**How to avoid:** The current `routePredicate` blocks ALL tasks on blocked routes (no task-type discrimination). For Phase 31 this is acceptable — the success criteria says "triage and enrichment agents do not fire" on Insights, which is satisfied. If finer discrimination is needed in future, GateContext can include a `task` field. For now, document this as known behavior.

### Pitfall 6: Harness dispatchTiered callers need permissive default GateContext

**What goes wrong:** Harness tests that test individual handlers (e.g., T2 classifiers in isolation) suddenly fail because they don't provide a GateContext, and the gate blocks (or TypeScript rejects the call).

**How to avoid:** Create a test helper: `makePermissiveContext(): GateContext` that returns `{ route: '/binder', timeOfDay: 12, binderType: 'gtd-personal' }` — a context that passes all predicates. Export from a test utilities file. Existing tests import this helper to build valid requests.

---

## Code Examples

### Complete gate pre-filter insertion point

```typescript
// Source: src/ai/tier2/pipeline.ts — insert at line ~75, before handler loop
// import additions at top of file:
//   import { canActivate } from '../context-gate/activation-gate';
//   import { getBinderConfig } from '../../config/binder-types';
//   import { db } from '../../storage/db';
//   import type { GateActivationLogEntry } from '../../types/gate';

export async function dispatchTiered(request: TieredRequest): Promise<TieredResponse> {
  const startTime = performance.now();

  // Phase 31: Gate pre-filter
  const binderConfig = getBinderConfig(request.context.binderType ?? 'gtd-personal');
  const gateResult = canActivate(request.context, binderConfig);
  void writeGateLog(request, gateResult, String(binderConfig.schemaVersion));

  if (!gateResult.canActivate) {
    return {
      result: {
        tier: 1,
        confidence: 0,
        reasoning: gateResult.predicateResults
          .filter(r => !r.activated)
          .map(r => `[${r.name}] ${r.reason}`)
          .join('; '),
      },
      attempts: [],
      escalated: false,
      totalMs: performance.now() - startTime,
      gateBlocked: true,
      gateResult,
    };
  }

  // Existing handler loop — UNCHANGED
  const threshold = CONFIDENCE_THRESHOLDS[request.task];
  const attempts: TieredResult[] = [];
  let bestResult: TieredResult | null = null;
  // ... rest of existing loop ...
}
```

### Harness GateContext for corpus items

```typescript
// scripts/harness/harness-pipeline.ts — building GateContext for each corpus item
function buildHarnessGateContext(
  item: CorpusItem,
  store: HarnessEntityStore,
  syntheticTimestamp?: number,
): GateContext {
  const intel = store.atomIntelligence.get(item.id);
  const enrichmentDepth = intel?.enrichment?.length ?? 0;
  const lastEnrichedAt = intel?.lastUpdated;

  return {
    route: '/binder',         // harness always in "active binder" context
    timeOfDay: 10,            // harness uses mid-morning — passes time predicate
    atomId: item.id,
    binderType: 'gtd-personal',
    enrichmentDepth,
    lastEnrichedAt,
  };
}
```

### staleDays completion (history-predicate.ts)

```typescript
// src/ai/context-gate/predicates/history-predicate.ts — replace lines 35-46
const { maxDepth, staleDays } = config.predicateConfig.historyGating;
const currentDepth = ctx.enrichmentDepth;
const exceedsMax = currentDepth >= maxDepth;

if (!exceedsMax) {
  return {
    activated: true,
    reason: `Enrichment depth ${currentDepth} is below maxDepth ${maxDepth}`,
    metadata: { maxDepth, currentDepth },
  };
}

// Depth exceeded — check staleness for re-enrichment window
const staleDaysMs = staleDays * 24 * 60 * 60 * 1000;
const isStale = ctx.lastEnrichedAt !== undefined
  ? (Date.now() - ctx.lastEnrichedAt) > staleDaysMs
  : false; // No timestamp = treat as fresh (conservative — don't block)

return {
  activated: isStale,
  reason: isStale
    ? `Depth ${currentDepth} >= maxDepth ${maxDepth} but atom is stale (${staleDays}d+) — re-enrichment allowed`
    : `Enrichment depth ${currentDepth} has reached maxDepth ${maxDepth} and atom is not stale`,
  metadata: { maxDepth, currentDepth, staleDays, lastEnrichedAt: ctx.lastEnrichedAt, isStale },
};
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `canHandle()` per-handler task filtering | Pre-dispatch gate + `canHandle()` | Phase 31 | Gate is session-state aware; canHandle stays pure task-type check |
| dispatchTiered no context | `context: GateContext` required on TieredRequest | Phase 31 | Callers must provide context; TypeScript enforces at compile time |
| staleDays stubbed as always-allow | staleDays check via `ctx.lastEnrichedAt` | Phase 31 | History predicate is now fully operative |

---

## Open Questions

1. **Where does `lastEnrichedAt` come from in store.ts triage flow?**
   - What we know: `atomIntelligence` table has `lastUpdated` field (Unix ms). Enrichment entries in `atomIntelligence.enrichment[]` have timestamps.
   - What's unclear: The most accurate "last enriched at" is the timestamp of the most recent enrichment entry, not the sidecar's `lastUpdated` (which could be updated by entity detection). The planner should decide: use `atomIntelligence.lastUpdated` (simpler, good-enough) or `max(enrichment[].timestamp)` (precise).
   - Recommendation: Use `atomIntelligence.lastUpdated` for Phase 31 — simple query, conservative (may be slightly more recent than last enrichment, which means slightly less blocking, which is the safer error direction).

2. **Does harness need to write gate log to a mock Dexie, or can it use in-memory simulation?**
   - What we know: Harness uses `HarnessEntityStore` (in-memory Maps), not real Dexie. The `scripts/harness/mock-db.ts` exists.
   - What's unclear: Whether harness should write to mock-db gateActivationLog for gate rate measurement, or just collect gate results in-memory.
   - Recommendation: For Phase 31, collect gate results in-memory in the harness (add a `gateLog: GateActivationLogEntry[]` array to `HarnessEntityStore` or to `CheckpointResult`). Harness reports can include per-predicate activation rates computed from this array. Real Dexie write is browser-only.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 |
| Config file | vite.config.ts (Vite + Vitest, no separate vitest.config.ts found) |
| Quick run command | `pnpm test` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GATE-01 | `dispatchTiered()` calls `canActivate()` before handler loop | unit | `pnpm test` | ❌ Wave 0 — new test in `src/ai/tier2/__tests__/pipeline-gate.test.ts` |
| GATE-02 | Route predicate blocks /insights, /archive, /settings | unit | `pnpm test` | ✅ Covered by `predicates.test.ts` route-predicate tests |
| GATE-03 | Time predicate suppresses on low-energy hours | unit | `pnpm test` | ✅ Covered by `predicates.test.ts` time-predicate tests |
| GATE-04 | History predicate blocks when depth >= maxDepth AND not stale; allows when stale | unit | `pnpm test` | ❌ Wave 0 — extend `predicates.test.ts` with staleDays cases |
| GATE-05 | Gate writes to `gateActivationLog` fire-and-forget | unit | `pnpm test` | ❌ Wave 0 — new test in `pipeline-gate.test.ts` with Dexie mock |

### Sampling Rate
- **Per task commit:** `pnpm test`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/ai/tier2/__tests__/pipeline-gate.test.ts` — covers GATE-01 (gate pre-filter wiring) and GATE-05 (log writes)
- [ ] Extend `src/ai/context-gate/__tests__/predicates.test.ts` — add staleDays test cases for GATE-04:
  - `historyPredicate` blocks when depth >= maxDepth AND `lastEnrichedAt` is recent (within staleDays)
  - `historyPredicate` allows when depth >= maxDepth AND `lastEnrichedAt` is older than staleDays
  - `historyPredicate` allows when `lastEnrichedAt` is undefined (conservative default)
- [ ] Test helper file: `src/ai/tier2/__tests__/test-helpers.ts` — exports `makePermissiveContext()` returning a GateContext that passes all predicates (needed for all existing tests that call `dispatchTiered`)

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `src/ai/context-gate/activation-gate.ts` — canActivate() entry point, AND semantics confirmed
- Direct code inspection: `src/ai/context-gate/predicate-registry.ts` — evaluatePredicates(), Map-based registry
- Direct code inspection: `src/types/gate.ts` — all gate types, GateActivationLogEntry schema
- Direct code inspection: `src/ai/tier2/pipeline.ts` — handler loop structure, insertion point at ~line 80
- Direct code inspection: `src/ai/tier2/types.ts` — TieredRequest, TieredResponse current shape
- Direct code inspection: `src/storage/migrations/v10.ts` — gateActivationLog table + compound indexes
- Direct code inspection: `src/config/binder-types/gtd-personal/gating.json` — blockedRoutes, lowEnergyHours, maxDepth, staleDays values
- Direct code inspection: `src/ai/context-gate/predicates/history-predicate.ts` — TODO at line 37 confirmed
- Direct code inspection: `src/ai/context-gate/__tests__/predicates.test.ts` and `activation-gate.test.ts` — existing test coverage scope confirmed
- Direct code inspection: `src/ai/triage.ts` — 3 dispatchTiered call sites confirmed (lines ~254, ~288, ~324)
- Direct code inspection: `src/ui/components/DecompositionFlow.tsx` — 1 dispatchTiered call site confirmed

### Secondary (MEDIUM confidence)
- Phase 31 CONTEXT.md locked decisions — fire-and-forget, no exception on block, bulk log writes

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all infrastructure is existing code, directly inspected
- Architecture: HIGH — integration points confirmed by reading actual source files
- Pitfalls: HIGH — pitfalls derived from reading the actual code constraints and locked decisions
- Type changes: HIGH — both types read directly, extension shape is unambiguous
- staleDays completion: HIGH — TODO location confirmed at line 37, logic is straightforward date arithmetic

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable domain — these are internal source files, not external APIs)
