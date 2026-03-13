# Phase 32: Predictive Enrichment Scorer - Research

**Researched:** 2026-03-13
**Domain:** TypeScript enrichment pipeline, exponential momentum scoring, IndexedDB windowed queries
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Signal momentum architecture**
- Hybrid window: last-N atoms OR last-T hours, whichever is smaller. `predictionConfig.windowSize` and `predictionConfig.maxWindowHours` in BinderTypeConfig
- Exponentially-weighted momentum per signal label — continuously alive, naturally decaying, recency-biased. No binary trend detection; relative ranking by momentum magnitude
- Frequency + strength tracked separately: `Record<string, number>` for both dimensions per label
- All labels across all 10 models tracked — dense `Record<string, number>`, ~80 entries total
- Momentum as multiplier on current atom's own cognitive signals (self-signal provides base relevance; momentum boosts/dampens categories)
- Per-binder scoped with `binderId` filter parameter; designed for future `binderId[]` or `'all'`
- BinderTypeConfig column set filters which models contribute momentum
- Depth-aware filtering: categories with depth >= max in depthMap excluded
- `SIGNAL_CATEGORY_MAP` moves to BinderTypeConfig as `signalCategoryMap`
- `predictionConfig.momentumHalfLife` configurable per binder type; harness Optuna-optimized

**Scorer API and implementation**
- Delete and rewrite `computeSignalRelevance()` — predictive scorer replaces it entirely
- Pure function: `predictEnrichmentOrder(atomSignals, momentumVector, entityScores, depthMap, config) → CategoryRanking[]`
- Explanation field on each `CategoryRanking`: `{ category, score, explanation: string }`
- File location: `src/ai/enrichment/predictive-scorer.ts`
- Score fusion approach: Claude's Discretion
- Absolute vs relative momentum: Claude's Discretion

**Entity trajectory influence**
- Same exponential momentum approach for entities — unified momentum concept
- Window-scoped entities, filtered to current atom's detected entities only
- Both category promotion (structural) AND entity-specific questions (contextual)
- Cap at 2 entity questions per enrichment session
- Entity question generation: Claude's Discretion
- `entityCategoryMap` in BinderTypeConfig: PER → ['missing-context', 'missing-delegation'], etc.
- Entity momentum multiplied by type priority weight from `entityTypePriority`
- Prior entity data from atomIntelligence sidecar only — no async dependency
- Separate `atomIntelligence.entityMomentum` field from `signalMomentum`
- Entity IDs in production, names in harness
- User corrections (`sourceAttribution: 'user-correction'`) boost entity momentum
- Entity-relationship influence deferred to future phase

**Cold-start behavior**
- Threshold counts atoms WITH `CachedCognitiveSignal[]` in atomIntelligence
- `predictionConfig.coldStartThreshold` (default 15) in BinderTypeConfig
- Independent `predictionConfig.entityColdStartThreshold` — entity trajectory activates separately/earlier
- Check every wizard open — no latching; self-healing
- Always compute + snapshot momentum; below threshold returns static ordering but stores snapshot
- `predictionMomentum.coldStart: boolean` field in snapshot
- Transition behavior: Claude's Discretion
- No user-visible cold-start indicator

**Prediction cache**
- In-memory `Map<binderId, { result, timestamp }>` — lost on page refresh, lazy recompute
- Per-binder cache key; per-atom differences handled by self-signal + entity filtering on top
- `predictionConfig.cacheTtlMs` (default 300000 = 5 min) in BinderTypeConfig
- Lazy recompute on invalidation
- Track invalidation reasons for harness debugging
- Shared momentum cache for concurrent atoms in same binder
- Export `invalidateCache(binderId)` and `getCacheState(binderId)` for harness hooks
- Invalidation event set: Claude's Discretion

**Sidecar storage**
- New `predictionMomentum` field: `{ signalFrequency: Record<string, number>, signalStrength: Record<string, number>, categoryOrdering: CategoryRanking[], coldStart: boolean, computedAt: number }`
- Separate `entityMomentum` field: `{ scores: Record<entityId, number>, computedAt: number }`
- Snapshot includes both momentum + resulting category ordering

### Claude's Discretion
- Score fusion approach (signal × entity multiplier combination)
- Absolute vs relative momentum normalization
- Entity question generation method (template-driven vs scorer-generated)
- Cold-start transition behavior (hard switch vs gradual ramp)
- Cache invalidation event set
- Momentum decay formula constants
- Harness report formatting for momentum data

### Deferred Ideas (OUT OF SCOPE)
- Multi-binder momentum awareness (cross-binder signal trends)
- Relationship-aware entity trajectory
- Momentum visualization (user-facing dashboard)
- Per-session window overrides ("deep prediction mode")
- Compositor composite momentum bonus multipliers
- People substrate integration (OS-level people permissions)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PRED-01 | Predictive scoring function replaces static `computeSignalRelevance()` with dynamic scoring over entity graph trajectory (recency, mention count deltas) and cognitive signal history window (composite signal trends over last-N atoms) | `src/entity/recency-decay.ts` provides the exponential decay formula; `CachedCognitiveSignal[]` in sidecar is the signal history source; `createEnrichmentSession()` is the integration call site |
| PRED-02 | Cognitive signal delta trends computed from windowed query over last-N `CachedCognitiveSignal` records — rising `stress-risk` or `urgent-important` composites influence enrichment question priority ordering | Windowed Dexie query over `atomIntelligence` table by binderId; exponentially-weighted momentum over label frequency and confidence; `COGNITIVE_MODEL_IDS` (10 models, ~80 labels total) |
| PRED-03 | Cold-start gate prevents predictions from activating until minimum evidence threshold is met (15+ atoms with cognitive signals cached) — avoids wrong predictions eroding user trust in early usage | Count of `atomIntelligence` rows with non-empty `cognitiveSignals[]`; separate signal/entity thresholds; always compute for harness snapshot |
</phase_requirements>

## Summary

Phase 32 replaces `computeSignalRelevance()` in `enrichment-engine.ts` with a predictive scorer that synthesizes two momentum streams — cognitive signal history (10 ONNX models, frequency + strength) and entity trajectory (recency × mention count delta) — into a ranked `CategoryRanking[]` that reorders enrichment wizard questions dynamically. The core math follows the exponential decay formula already established in `src/entity/recency-decay.ts`, extended to a dense label-level vector. The scorer is a pure function that receives its inputs and outputs a ranking with explanations; all async work (Dexie queries, sidecar writes) is handled externally in the call site, preserving the project-wide pure module invariant.

The design is deliberately conservative in three ways: a cold-start guard prevents the scorer from activating until 15 atoms have signals (preventing trust erosion from premature predictions); a 5-minute in-memory TTL cache prevents repeated Dexie queries within a single enrichment session window; and momentum near 1.0 naturally acts as a no-op, so a fresh binder with sparse signals produces ordering barely distinguishable from static. The entity trajectory dimension uses the same exponential decay formula but adds entity-type priority weights from `BinderTypeConfig`, capped at 2 entity-specific questions per session to prevent entity trajectory from dominating the wizard.

**Primary recommendation:** Write `predictive-scorer.ts` as a pure function accepting pre-fetched data; write a `computeMomentumVector()` helper that performs the Dexie windowed query and returns the dense vector; wire both through a cache-aware coordinator in `enrichment-engine.ts`. Extend `BinderTypeConfigSchema` with a `predictionConfig` object and the `signalCategoryMap`/`entityCategoryMap` fields before implementing the scorer.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.x (project) | Pure function implementation | Project language |
| Dexie | 4.x (project) | Windowed query over atomIntelligence | Established project ORM |
| Zod v4 | project | Schema extension for predictionConfig | All sidecar types use Zod v4 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `src/entity/recency-decay.ts` | local | Exponential decay formula | Reuse `computeEntityRelevance()` pattern verbatim for both signal and entity momentum |
| `src/ai/tier2/cognitive-signals.ts` | local | `COGNITIVE_MODEL_IDS`, `CognitiveSignal` types | Signal label iteration |
| `src/storage/atom-intelligence.ts` | local | `getIntelligence()` for sidecar reads | Windowed query base |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| In-memory TTL Map | Dexie `predictionCache` table | Dexie overhead for a 5-minute cache is unnecessary; Map is correct for session-scoped data |
| Dense `Record<string, number>` | Typed per-model interfaces | Dense record enables uniform momentum iteration without per-model branching |
| Separate file `predictive-scorer.ts` | Extending `enrichment-engine.ts` in place | Scorer is self-contained; separate file makes harness mocking and future ablation clean |

**Installation:** No new packages. All required tools are present in the project.

## Architecture Patterns

### Recommended Project Structure
```
src/ai/enrichment/
├── enrichment-engine.ts     # Updated: calls predictEnrichmentOrder(), manages cache
├── predictive-scorer.ts     # NEW: pure scoring function
├── momentum-builder.ts      # NEW: Dexie windowed query → MomentumVector
└── types.ts                 # Updated: CategoryRanking type added

src/config/binder-types/gtd-personal/
└── prediction.json          # NEW: predictionConfig + signalCategoryMap + entityCategoryMap

src/types/intelligence.ts    # Updated: predictionMomentum + entityMomentum fields on AtomIntelligence
src/config/binder-types/schema.ts  # Updated: predictionConfig + maps added to BinderTypeConfigSchema
```

### Pattern 1: Exponential Momentum Formula
**What:** Weight each signal label observation by an exponential decay factor based on atom position in the window. More recent = higher weight. Same formula as `computeEntityRelevance()`.
**When to use:** Any calculation over a sequence of ONNX outputs where recency matters.
**Example:**
```typescript
// Source: src/entity/recency-decay.ts (verbatim pattern)
// Momentum decay formula (adapt from computeEntityRelevance):
//   weight(i) = exp(-(LN2 / halfLife) * positionFromRecent)
// where positionFromRecent is atom index from end of window (0 = most recent)
//
// For signal momentum:
//   frequencyMomentum[label] += weight(i)      // 1 if label is top for atom i
//   strengthMomentum[label]  += weight(i) * confidence  // weighted by confidence

function computeWindowWeight(positionFromRecent: number, halfLife: number): number {
  return Math.exp(-(Math.LN2 / halfLife) * positionFromRecent);
}
```

### Pattern 2: Multiplier Fusion (Recommended for Claude's Discretion)
**What:** Current atom's self-signal relevance provides the base score; momentum vector acts as a multiplicative boost. Score = selfRelevance × (1 + momentumBoost). Near-zero momentum → multiplier near 1.0 → effectively no change.
**When to use:** Fusion of local (per-atom) and historical (window) signals where neither should completely dominate.
**Example:**
```typescript
// Score fusion (self-signal × momentum multiplier):
function fuseCategoryScore(
  selfRelevance: number,    // from current atom's cognitive signals (0-1)
  frequencyMomentum: number, // normalized momentum for this category (0-1)
  strengthMomentum: number,  // normalized strength momentum (0-1)
  entityBoost: number,       // entity trajectory contribution (0-1)
): number {
  const signalMultiplier = 1 + (frequencyMomentum * 0.5 + strengthMomentum * 0.5);
  const entityMultiplier = 1 + entityBoost;
  return selfRelevance * signalMultiplier * entityMultiplier;
}
// Near-1.0 momentum → multiplier ≈ 1.0 → score ≈ selfRelevance (no-op for cold binders)
```

### Pattern 3: Windowed Dexie Query
**What:** Fetch recent `atomIntelligence` rows by binderId, filtered to atoms WITH cognitive signals, sorted by lastUpdated descending. Respect both N-atom and T-hours constraints.
**When to use:** Building the momentum vector from stored sidecar data.
**Example:**
```typescript
// Windowed query pattern (in momentum-builder.ts):
async function fetchSignalWindow(
  binderId: string,
  windowSize: number,
  maxWindowHours: number,
): Promise<CachedCognitiveSignal[][]> {
  const cutoffMs = Date.now() - maxWindowHours * 60 * 60 * 1000;
  // Dexie does not have compound binderId+lastUpdated index on atomIntelligence.
  // Use .where('atomId') only if atoms table provides binderId join.
  // Strategy: fetch all atomIntelligence rows, filter by binderId via atoms table join,
  // then sort + truncate. This is acceptable at <2000 atoms per binder.
  // NOTE: See Pitfall 2 below for indexing consideration.
  const records = await db.atomIntelligence
    .filter((r) => r.cognitiveSignals.length > 0 && r.lastUpdated >= cutoffMs)
    .limit(windowSize)
    .toArray();
  return records.map((r) => r.cognitiveSignals);
}
```

### Pattern 4: Cache Coordinator (in enrichment-engine.ts)
**What:** Check TTL cache before Dexie query; invalidate on triage completion.
**When to use:** Any caller of `predictEnrichmentOrder()` in the enrichment wizard path.
**Example:**
```typescript
// Cache module (exported from predictive-scorer.ts or a cache.ts):
const _predictionCache = new Map<string, { result: MomentumVector; timestamp: number }>();

export function getCacheState(binderId: string) {
  return _predictionCache.get(binderId);
}
export function invalidateCache(binderId: string, reason?: string) {
  _predictionCache.delete(binderId);
  // Log reason for harness debugging
}
```

### Pattern 5: Pure Scorer Function Signature
**What:** The scorer is a pure function receiving all inputs; no imports from store or db.
**When to use:** Follows the established project pure module pattern (triage.ts, compression.ts, analysis.ts).
**Example:**
```typescript
// src/ai/enrichment/predictive-scorer.ts
export interface MomentumVector {
  signalFrequency: Record<string, number>;  // model_label → momentum score
  signalStrength: Record<string, number>;   // model_label → strength momentum
  entityScores: Record<string, number>;     // entityId → trajectory score
  coldStart: boolean;
  atomCount: number;  // atoms with signals used in computation
}

export interface CategoryRanking {
  category: MissingInfoCategory;
  score: number;
  explanation: string;
}

export function predictEnrichmentOrder(
  atomSignals: SignalVector | null,
  momentum: MomentumVector,
  entityScores: Record<string, number>,  // entityId → score, pre-filtered to current atom
  depthMap: Record<string, number>,
  config: PredictionConfig,              // signalCategoryMap, entityCategoryMap, etc.
): CategoryRanking[] {
  // cold-start: return static ordering (but computation already done by caller)
  if (momentum.coldStart) {
    return buildStaticRanking(depthMap);
  }
  // ... momentum × self-signal fusion per category ...
}
```

### Pattern 6: BinderTypeConfig Extension (New JSON File)
**What:** Add `prediction.json` to the GTD config manifest. Extend `BinderTypeConfigSchema` with optional `predictionConfig` and `signalCategoryMap`/`entityCategoryMap` fields.
**When to use:** Any Phase 32 config that needs to be Optuna-tunable from the harness.
**Example:**
```json
// src/config/binder-types/gtd-personal/prediction.json
{
  "predictionConfig": {
    "windowSize": 20,
    "maxWindowHours": 48,
    "momentumHalfLife": 5,
    "coldStartThreshold": 15,
    "entityColdStartThreshold": 10,
    "cacheTtlMs": 300000
  },
  "signalCategoryMap": {
    "priority-matrix": ["missing-outcome", "missing-timeframe"],
    "collaboration-type": ["missing-context", "missing-reference"],
    "cognitive-load": ["missing-next-action"],
    "gtd-horizon": ["missing-outcome"],
    "time-estimate": ["missing-timeframe"],
    "energy-level": ["missing-context"],
    "knowledge-domain": ["missing-reference"]
  },
  "entityCategoryMap": {
    "PER": ["missing-context", "missing-delegation"],
    "LOC": ["missing-context"],
    "ORG": ["missing-context", "missing-reference"]
  }
}
```
**CONFIRMED GAP:** `missing-delegation` does NOT exist in `MissingInfoCategory` (verified: only 5 categories in `src/ai/clarification/types.ts`). Planner must decide: add as 6th category, or replace with `missing-context` in `entityCategoryMap`. See Open Questions.

### Anti-Patterns to Avoid
- **Async inside pure scorer:** `predictEnrichmentOrder()` must be synchronous. All Dexie queries happen before calling it in `momentum-builder.ts`.
- **Hardcoding `SIGNAL_CATEGORY_MAP` in scorer:** The map must come from `BinderTypeConfig.signalCategoryMap` (config-driven). The static const in `enrichment-engine.ts` is being deleted.
- **Timer-based momentum refresh:** Momentum is lazy + TTL-cached. No `setInterval`, no background workers.
- **Index-less Dexie queries at scale:** A full table scan on `atomIntelligence` at 2,000+ rows can exceed 100ms on mobile. See Pitfall 2.
- **Storing momentum in the enrichment session object:** Momentum is binder-level, not session-level. The session only receives the final `CategoryRanking[]`.
- **Using `canHandle()` for cold-start logic:** Cold-start is not a gate predicate. It lives inside the scorer path, not in `dispatchTiered()`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Exponential decay weighting | Custom decay math | Pattern from `computeEntityRelevance()` in `recency-decay.ts` | Already proven, tested, formula is `mentionCount * exp(-(LN2/halfLife) * t)` |
| Category ranking tie-breaking | Custom sort comparators | Stable sort with explicit secondary key (category index in static ordering) | Prevents non-deterministic reorderings |
| Entity sidecar reads | Re-querying from sanitization worker | `atomIntelligence.entityMentions[]` already written by prior triage | Worker is async; scorer needs synchronous prior data only |
| User correction detection | Scanning relation evidence text | `EntityRelation.sourceAttribution === 'user-correction'` field already exists | Field is set correctly in Phase 29's `correctRelationship()` |

**Key insight:** The momentum math is straightforward; the hard part is the Dexie query design (binderId scoping, window size, cold-start count). Get the query right before touching the scorer.

## Common Pitfalls

### Pitfall 1: `atomIntelligence` Has No binderId Index
**What goes wrong:** The `atomIntelligence` table is keyed by `atomId` with no `binderId` index. A windowed query by binder requires joining with the `atoms` table or pre-filtering.
**Why it happens:** Phase 26 designed `atomIntelligence` for per-atom access patterns; binder-level aggregation was not anticipated.
**How to avoid:** Two options: (a) join in JavaScript — fetch atom IDs for the binder from `db.atoms.where('binderId')`, then batch-get `atomIntelligence` rows; or (b) add a `binderId` field + index to `atomIntelligence` via a v11 migration. Option (a) avoids a migration but has O(n) reads; option (b) is cleaner at scale. STATE.md notes: "Profile Dexie compound query latency at 2,000+ entity rows before Phase 32 ships on low-end mobile" — this is the primary concern.
**Warning signs:** Window query taking >50ms on a binder with 200+ atoms.

### Pitfall 2: BinderTypeConfig Schema Extension Breaks Zod Validation
**What goes wrong:** Adding `predictionConfig`, `signalCategoryMap`, and `entityCategoryMap` to `BinderTypeConfigSchema` without matching JSON files causes Zod parse to fail on load, falling back to gtd-personal defaults with a console warning — silently breaking prediction.
**Why it happens:** `BinderTypeConfigSchema` is strict (no `.passthrough()`). All required fields must be present in the merged JSON.
**How to avoid:** Add new fields as `.optional()` in the Zod schema first, then add the JSON file, then make required if needed. The manifest `configFiles` list must include `"prediction.json"` before any merge attempt.
**Warning signs:** Console warning "BinderTypeConfig validation failed, falling back to gtd-personal defaults."

### Pitfall 3: Cold-Start Count Includes Atoms Without Real Signals
**What goes wrong:** Counting `atomIntelligence` rows with any `cognitiveSignals` array (including empty arrays from un-triaged atoms) inflates the count above the threshold, activating prediction prematurely.
**Why it happens:** `createEmptyIntelligence()` initializes `cognitiveSignals: []` — so all atoms have the field, just empty.
**How to avoid:** Cold-start count MUST be `cognitiveSignals.length > 0`, not just existence of the sidecar row. Lock this in the `computeColdStart()` helper.
**Warning signs:** Prediction activating in a brand-new binder with fewer than 15 enriched atoms.

### Pitfall 4: Momentum Snapshot Written Before Cold-Start Check
**What goes wrong:** Writing `predictionMomentum` to the sidecar BEFORE determining cold-start causes the snapshot's `coldStart: false` to be stale if atoms were deleted between computation and write.
**Why it happens:** The check and write are async operations that can interleave.
**How to avoid:** Compute cold-start flag as part of the momentum computation (synchronous), include it in the `MomentumVector` result, and write the snapshot atomically with the flag already set.
**Warning signs:** Harness showing `coldStart: false` for binders with atom count < threshold.

### Pitfall 5: Entity Questions Exceeding the 2-Question Cap
**What goes wrong:** Multiple high-trajectory entities each generate a question, producing more than 2 entity-specific questions appended to the wizard.
**Why it happens:** The cap is applied at session level, not per entity. If the caller loops over entities without tracking a session counter, the cap is ignored.
**How to avoid:** The cap logic belongs in `predictEnrichmentOrder()` — after building entity-specific questions, slice to 2 before returning `CategoryRanking[]`. Document the cap in the function's JSDoc.
**Warning signs:** Test scenario with 3 high-trajectory PER entities showing 3 entity questions in the wizard.

### Pitfall 6: Self-Signal Returns 0 for All Categories (No Signals on Atom)
**What goes wrong:** A new inbox item with no cognitive signals yet produces `selfRelevance = 0` for all categories. Multiplying by momentum gives `0 * multiplier = 0` — all categories score equally at zero, and ordering is non-deterministic.
**Why it happens:** The multiplier fusion formula assumes non-zero self-signal as a base.
**How to avoid:** When `atomSignals` is null/empty, use a uniform base relevance (e.g., 1.0 per category) before applying momentum. This ensures momentum still produces a meaningful ordering even when the current atom has no signals.
**Warning signs:** Enrichment wizard ordering appears random for first-triage atoms in a binder with warm momentum.

## Code Examples

Verified patterns from existing codebase:

### Existing Decay Formula (verbatim from recency-decay.ts)
```typescript
// Source: src/entity/recency-decay.ts
export function computeEntityRelevance(
  mentionCount: number,
  lastSeenMs: number,
  nowMs?: number,
): number {
  const now = nowMs ?? Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const daysSince = Math.max(0, (now - lastSeenMs) / DAY_MS);
  const decayRate = Math.LN2 / HALF_LIFE_DAYS;
  return mentionCount * Math.exp(-decayRate * daysSince);
}
// Adapt: replace daysSince with positionFromRecent (atom index), HALF_LIFE_DAYS with momentumHalfLife
```

### Current computeSignalRelevance() (being deleted)
```typescript
// Source: src/ai/enrichment/enrichment-engine.ts line 48
// This function is DELETED and replaced by predictEnrichmentOrder()
function computeSignalRelevance(category: MissingInfoCategory, signals: SignalVector): number {
  let relevance = 0;
  for (const [modelId, categories] of Object.entries(SIGNAL_CATEGORY_MAP)) {
    if (categories.includes(category)) {
      const signal = signals.signals[modelId as CognitiveModelId];
      if (signal) relevance += 1 - signal.confidence;
    }
  }
  return relevance;
}
```

### CachedCognitiveSignal Shape (source data for windowed query)
```typescript
// Source: src/types/intelligence.ts
export interface CachedCognitiveSignal {
  modelId: string;       // e.g., 'priority-matrix'
  label: string;         // e.g., 'urgent-important' — this is the topLabel
  confidence: number;    // 0-1
  timestamp: number;     // epoch ms when signal was recorded
}
// Note: CachedCognitiveSignal stores ONE signal (the winner). For momentum,
// topLabel → frequencyMomentum[modelId_label] += weight
// confidence → strengthMomentum[modelId_label] += weight * confidence
```

### Entity User-Correction Detection
```typescript
// Source: src/types/intelligence.ts
// Boost momentum for entities where a user-correction relation exists:
const isUserCorrected = relation.sourceAttribution === 'user-correction'; // EntityRelation field
// boost factor: apply 2x weight to entity momentum score when isUserCorrected
```

### Enrichment Session Integration Point
```typescript
// Source: src/ai/enrichment/enrichment-engine.ts line 156-163
// Current call site that calls computeSignalRelevance() via sort:
if (cognitiveSignals) {
  questions.sort((a, b) => {
    const relevanceA = computeSignalRelevance(a.category, cognitiveSignals);
    const relevanceB = computeSignalRelevance(b.category, cognitiveSignals);
    if (relevanceA !== relevanceB) return relevanceB - relevanceA;
    return 0;
  });
}
// Phase 32: replace this block with:
// const ranking = predictEnrichmentOrder(atomSignals, momentum, entityScores, depthMap, config);
// questions.sort((a, b) => rankingScore(b.category, ranking) - rankingScore(a.category, ranking));
```

### Harness Cache Hook Pattern (from Phase 30 setActiveBinderConfig precedent)
```typescript
// Pattern: export testability hooks from module-level in-memory state
// Source pattern: Phase 30's setActiveBinderConfig() in-memory override
export function invalidateCache(binderId: string, reason?: string): void {
  _predictionCache.delete(binderId);
  // optionally log to invalidation event list for harness
}
export function getCacheState(binderId: string): { result: MomentumVector; timestamp: number } | undefined {
  return _predictionCache.get(binderId);
}
```

### AtomIntelligence Sidecar Write (fire-and-forget pattern)
```typescript
// Source: Phase 26 established pattern in atom-intelligence.ts
// Snapshot writes are fire-and-forget — do NOT await in the enrichment path:
void writePredictionMomentum(atomId, {
  signalFrequency: momentum.signalFrequency,
  signalStrength: momentum.signalStrength,
  categoryOrdering: ranking,
  coldStart: momentum.coldStart,
  computedAt: Date.now(),
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Static `computeSignalRelevance()` — current atom signals only | Dynamic momentum vector over N-atom window + entity trajectory | Phase 32 | Enrichment wizard question ordering reflects user's recent work patterns, not just current atom signals |
| `SIGNAL_CATEGORY_MAP` hardcoded constant in enrichment-engine.ts | Config-driven `signalCategoryMap` in BinderTypeConfig JSON | Phase 32 | Different binder types can map signals to different enrichment categories |
| No cold-start protection | Explicit threshold gate + harness snapshot | Phase 32 | Trust is not eroded by premature predictions in new binders |

**Deprecated/outdated:**
- `computeSignalRelevance()` in `enrichment-engine.ts`: Deleted entirely. Do not add similar static-map functions.
- `SIGNAL_CATEGORY_MAP` module-level const in `enrichment-engine.ts`: Moved to `BinderTypeConfig.signalCategoryMap`.

## Open Questions

1. **`missing-delegation` does not exist as a MissingInfoCategory (CONFIRMED)**
   - What we know: `MissingInfoCategory` has exactly 5 values (verified from `src/ai/clarification/types.ts`): `missing-outcome`, `missing-next-action`, `missing-timeframe`, `missing-context`, `missing-reference`. `missing-delegation` is not one of them.
   - What's unclear: Whether the planner should (a) add `missing-delegation` as a 6th category — requires updating `MissingInfoCategory`, `ALL_CATEGORIES`, `CATEGORY_DISPLAY_KEYS`, and `CATEGORY_DISPLAY_KEYS` in enrichment-engine.ts + new question templates — or (b) treat PER entity trajectory as promoting `missing-context` only (simpler, avoids new category).
   - Recommendation: Option (b) is lower risk for Phase 32. The CONTEXT.md spec for `entityCategoryMap` used `missing-delegation` as an example; the planner should map PER → ['missing-context'] for now. If `missing-delegation` is a genuine new category, that is a separate task with template work.

2. **binderId scoping in atomIntelligence query**
   - What we know: `atomIntelligence` table has no `binderId` index; atoms table has `binderId` but atomIntelligence joins via atomId
   - What's unclear: Whether a JavaScript join (fetch atom IDs from atoms table, then batch-get atomIntelligence) is fast enough at 200+ atoms, or whether a v11 migration adding `binderId` to `atomIntelligence` is needed
   - Recommendation: Implement the JavaScript join first; add a profiling call with console.time in the harness. If >50ms at 500 atoms, add the migration. STATE.md already flags this concern.

3. **Entity-specific question text generation**
   - What we know: CONTEXT.md marks this as Claude's Discretion (template vs scorer-generated)
   - What's unclear: Whether entity-specific questions can be generated from existing `questionTemplates` in the binder config or require new templates
   - Recommendation: Use template-driven generation. Add an optional `entityQuestionTemplates` section to `prediction.json` with one template per entity type (e.g., PER → "Who is [entity] and how does this relate to your work?"). Avoids dynamic string generation and keeps questions auditable.

4. **Normalization strategy for momentum (absolute vs relative)**
   - What we know: CONTEXT.md marks this as Claude's Discretion
   - What's unclear: Whether momentum scores should be normalized to [0,1] per category before fusion (relative: divides by max score in vector) or used as absolute accumulated values
   - Recommendation: Use relative normalization (divide each dimension by the max value in that dimension before fusion). This makes the multiplier effect bounded regardless of window size, and prevents large windows from producing unbounded multipliers. Edge case: if max = 0 (no signal seen for any label), use 1.0 (no-op multiplier).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (project standard) |
| Config file | `vite.config.ts` (vitest config inline) or `vitest.config.ts` |
| Quick run command | `pnpm test --run src/ai/enrichment/predictive-scorer.test.ts` |
| Full suite command | `pnpm test --run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PRED-01 | `predictEnrichmentOrder()` reorders categories based on entity trajectory + signal momentum | unit | `pnpm test --run src/ai/enrichment/predictive-scorer.test.ts` | Wave 0 |
| PRED-02 | Rising `urgent-important` momentum promotes `missing-timeframe`/`missing-outcome` to top | unit | `pnpm test --run src/ai/enrichment/predictive-scorer.test.ts` | Wave 0 |
| PRED-03 | Binder with < coldStartThreshold atoms returns static ordering from `predictEnrichmentOrder()` | unit | `pnpm test --run src/ai/enrichment/predictive-scorer.test.ts` | Wave 0 |
| PRED-03 | Cache TTL — second call within 5 min returns cached result; invalidation triggers fresh computation | unit | `pnpm test --run src/ai/enrichment/momentum-builder.test.ts` | Wave 0 |
| PRED-01+02 | Success criteria 1: budget atoms → deadline + delegation questions lead | integration | manual (harness) | N/A (harness) |

### Sampling Rate
- **Per task commit:** `pnpm test --run src/ai/enrichment/predictive-scorer.test.ts`
- **Per wave merge:** `pnpm test --run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/ai/enrichment/predictive-scorer.test.ts` — covers PRED-01, PRED-02, PRED-03 (static vs dynamic ordering, cold-start threshold, entity boost, zero-signal base)
- [ ] `src/ai/enrichment/momentum-builder.test.ts` — covers cache TTL, cache invalidation, windowed query logic (with mocked Dexie)

## Sources

### Primary (HIGH confidence)
- `src/entity/recency-decay.ts` — Exponential decay formula, proven pattern for momentum math
- `src/ai/enrichment/enrichment-engine.ts` — `computeSignalRelevance()` to delete, `createEnrichmentSession()` integration point, `SIGNAL_CATEGORY_MAP` to migrate
- `src/ai/tier2/cognitive-signals.ts` — `COGNITIVE_MODEL_IDS` (10 models), `CachedCognitiveSignal` shape, `SignalVector` type
- `src/types/intelligence.ts` — `AtomIntelligence` schema (fields to extend), `CachedCognitiveSignal` type, `EntityRelation.sourceAttribution`
- `src/config/binder-types/schema.ts` — `BinderTypeConfigSchema` (Zod schema to extend), `ExpandedBinderTypeConfig` type
- `src/config/binder-types/gtd-personal/*.json` — Existing config file pattern; manifest lists `configFiles[]`
- `src/storage/db.ts` — No new tables; v10 is current migration; v11 may be needed for binderId index
- `.planning/phases/32-predictive-enrichment-scorer/32-CONTEXT.md` — All architecture decisions
- `.planning/REQUIREMENTS.md` — PRED-01, PRED-02, PRED-03 requirement text

### Secondary (MEDIUM confidence)
- `src/ai/clarification/option-ranking.ts` — Skip-pattern learning precedent; cold-start threshold pattern (>5 events before learning activates)
- `src/storage/atom-intelligence.ts` — `getIntelligence()` / `getOrCreateIntelligence()` patterns; fire-and-forget write pattern
- `scripts/harness/ablation-engine.ts` — Harness hook export pattern; `AblationConfig` for future momentum ablation
- `.planning/STATE.md` — "Profile Dexie compound query latency at 2,000+ entity rows before Phase 32 ships" pending todo

### Tertiary (LOW confidence)
- None — all findings verified from project source files

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all tools are existing project dependencies, no new installs
- Architecture: HIGH — pure function pattern, Dexie query strategy, cache design all have direct precedents in the codebase
- Pitfalls: HIGH — all pitfalls derived from reading actual source code (schema constraints, missing indexes, type shapes)
- Open questions: HIGH (confirmed) — `missing-delegation` verified absent from `MissingInfoCategory` (read `src/ai/clarification/types.ts`); binderId query latency is a known concern from STATE.md (not yet profiled)

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable TypeScript/Dexie stack; GTD config shape is actively evolving — re-verify if binder config schema changes before planning)
