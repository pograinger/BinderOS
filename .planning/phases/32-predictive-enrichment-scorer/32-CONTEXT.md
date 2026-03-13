# Phase 32: Predictive Enrichment Scorer - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the static `computeSignalRelevance()` in `enrichment-engine.ts` with a dynamic predictive scorer that uses exponentially-weighted momentum over entity graph trajectory and cognitive signal delta trends to predict what enrichment questions the user needs next. Includes a cold-start guard preventing premature predictions and a TTL-cached prediction cache. No new UI — prediction is purely internal, influencing enrichment question ordering only.

</domain>

<decisions>
## Implementation Decisions

### Signal momentum architecture
- **Hybrid window**: Last-N atoms OR last-T hours, whichever is smaller. Default values (N, T) configurable in BinderTypeConfig (`predictionConfig.windowSize`, `predictionConfig.maxWindowHours`)
- **Exponentially-weighted momentum** per signal label — continuously alive, naturally decaying, recency-biased. No binary trend detection — relative ranking by momentum magnitude
- **Frequency + strength tracked separately**: Two momentum dimensions per label — frequency momentum (how often a label appears) and strength momentum (how confident the model is). Enables distinguishing "lots of quick tasks" from "fewer but increasingly complex items"
- **All labels per model tracked**: Dense `Record<string, number>` for both frequency and strength. ~80 entries total across 10 models. Memory is trivial at this scale
- **Momentum as multiplier on self-signal**: Current atom's own cognitive signals provide the base relevance score. Momentum from the window acts as a multiplier — high-momentum categories get boosted, low-momentum categories get dampened. Always applied (no fallback path), near-1.0 momentum is naturally a no-op
- **Per-binder scoped**: Momentum computed from atoms in the current binder only. The computation takes a `binderId` filter parameter, designed for future multi-binder awareness (accept `binderId[]` or `'all'`)
- **BinderTypeConfig column set filters models**: Only models listed in the binder type's column set contribute momentum. Consistent with Phase 30's "only relevant models run" design
- **Depth-aware filtering**: Categories with depth ≥ max in the depthMap are excluded from prediction ordering. No point predicting already-answered questions
- **SIGNAL_CATEGORY_MAP moves to BinderTypeConfig**: Signal-to-enrichment-category mapping becomes config-driven. Different binder types map signals to different categories
- **Momentum decay parameters in BinderTypeConfig**: `predictionConfig.momentumHalfLife` configurable per binder type. Harness can Optuna-optimize
- **BinderTypeConfig-only window control**: No per-session overrides on window size or max hours

### Scorer API and implementation
- **Delete and rewrite `computeSignalRelevance()`**: New predictive scorer replaces it entirely — both self-signal and momentum in one unified pure function
- **Pure function**: `predictEnrichmentOrder(atomSignals, momentumVector, entityScores, depthMap, config) → CategoryRanking[]`. Consistent with existing pure module pattern. Caching handled externally
- **Explanation field on output**: Each `CategoryRanking` includes `{ category, score, explanation: string }`. Not shown in UI but available for harness reports and future trust-building features
- **File location**: `src/ai/enrichment/predictive-scorer.ts` alongside enrichment-engine.ts
- **Score fusion approach (signal × entity)**: Claude's Discretion — picks the fusion method that produces the most natural reordering behavior
- **Absolute vs relative momentum**: Claude's Discretion — picks what works best with the multiplier fusion approach

### Entity trajectory influence
- **Entity momentum mirrors signal momentum**: Same exponential momentum approach applied to entities. Unified momentum concept across both signal and entity dimensions
- **Window-scoped entities, filtered to current atom**: Compute momentum for all entities in the hybrid window, but only apply to entities detected in the current atom being enriched
- **Both category promotion AND entity-specific questions**: Entity types promote associated enrichment categories (structural), AND high-trajectory entities generate entity-specific enrichment questions (contextual)
- **Cap at 2 entity questions per session**: At most 2 entity-specific questions per enrichment session to prevent entity trajectory from dominating the wizard
- **Entity question generation approach**: Claude's Discretion — template-driven vs scorer-generated text
- **BinderTypeConfig entity-category map**: `entityCategoryMap` alongside `signalCategoryMap` in unified config. PER → ['missing-context', 'missing-delegation'], etc.
- **Config-driven entity type weighting**: Entity momentum multiplied by type priority weight from BinderTypeConfig's `entityTypePriority`. GTD prioritizes PER > LOC > ORG
- **Prior entity data only**: Scorer reads entity mentions from atomIntelligence sidecar (written during prior triage). No waiting for sanitization worker. No async dependency
- **Separate entityMomentum sidecar field**: `atomIntelligence.entityMomentum` stored separately from `signalMomentum`. Two fields, not unified
- **Entity IDs in production, names in harness**: Sidecar stores entity IDs only (privacy-safe). Harness pipeline joins to canonical names for reports
- **User corrections boost trajectory**: Entity corrections (`sourceAttribution: 'user-correction'` in Relation table) boost that entity's momentum — user cared enough to correct, so high-salience
- **Entity-relationship influence deferred**: Phase 32 scores on entity trajectory alone. Relationship-aware prediction is a future concern

### Cold-start behavior
- **Atoms with cognitive signals threshold**: Count atoms that have `CachedCognitiveSignal[]` in atomIntelligence. Raw atoms without signals don't count
- **BinderTypeConfig threshold**: `predictionConfig.coldStartThreshold` (default 15) configurable per binder type
- **Independent entity threshold**: Entity trajectory has separate `predictionConfig.entityColdStartThreshold` in BinderTypeConfig. Entity trajectory can activate earlier than signal momentum
- **Check every wizard open**: No latching. If atoms with signals drops below threshold (e.g., user deletes atoms), prediction deactivates. Self-healing
- **Compute + snapshot even when cold-started**: Always compute momentum regardless of threshold. Below threshold: snapshot for harness but return static ordering. Harness sees "what predictions WOULD have been"
- **coldStart flag in snapshot**: `predictionMomentum.coldStart: boolean` enables harness to filter reports by cold-start state
- **Transition behavior (hard vs gradual)**: Claude's Discretion
- **No user-visible indicator**: User never knows prediction is inactive during cold start

### Prediction cache
- **In-memory Map**: `Map<binderId, { result, timestamp }>`. Lost on page refresh, recomputed lazily. No Dexie overhead for a 5-minute cache
- **Per-binder cache key**: One cached momentum vector per binder. All atoms share the same binder-level momentum context. Per-atom differences handled by self-signal + entity filtering on top of cached momentum
- **BinderTypeConfig TTL**: `predictionConfig.cacheTtlMs` (default 300000 = 5 min) configurable per binder type
- **Lazy recompute**: Invalidation clears the cache entry. Next wizard open triggers fresh computation. No background computation
- **Track invalidation reasons**: Cache invalidation events logged for harness debugging. Enables "why did the prediction change between these two wizard opens?" analysis
- **Shared momentum for concurrent opens**: Multiple atoms in same binder share the same momentum cache. No concurrency issue
- **Harness hooks**: Export `invalidateCache(binderId)` and `getCacheState(binderId)` for harness to force fresh computation between adversarial rounds
- **Invalidation event set**: Claude's Discretion — picks the right balance of responsiveness vs cache hit rate

### Sidecar storage
- **New field on atomIntelligence**: `predictionMomentum` field with `{ signalFrequency: Record<string, number>, signalStrength: Record<string, number>, categoryOrdering: CategoryRanking[], coldStart: boolean, computedAt: number }`
- **Separate entityMomentum field**: `entityMomentum: { scores: Record<entityId, number>, computedAt: number }`
- **Snapshot includes both momentum + resulting category ordering**: Harness can compare "what the scorer saw" vs "what it decided"

### Claude's Discretion
- Score fusion approach (signal × entity multiplier combination)
- Absolute vs relative momentum normalization
- Entity question generation method (template-driven vs scorer-generated)
- Cold-start transition behavior (hard switch vs gradual ramp)
- Cache invalidation event set
- Momentum decay formula constants
- Harness report formatting for momentum data

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/ai/enrichment/enrichment-engine.ts`: Current `computeSignalRelevance()` at line 48 — being replaced. `SIGNAL_CATEGORY_MAP` at line 34 — moving to BinderTypeConfig. `createEnrichmentSession()` accepts optional `cognitiveSignals` and `depthMap` — interface points for the new scorer
- `src/entity/recency-decay.ts`: `computeEntityRelevance()` with 30-day half-life decay — pattern for entity momentum decay formula
- `src/ai/clarification/option-ranking.ts`: `rankOptions()` and `shouldDeprioritizeCategory()` — existing learning-from-history pattern (operates on ClassificationEvent history)
- `src/ai/tier2/cognitive-signals.ts`: `CognitiveSignal`, `SignalVector`, `CompositeSignal`, `COGNITIVE_MODEL_IDS` (10 models), `COGNITIVE_THRESHOLDS` — all signal types the momentum vector tracks
- `src/types/intelligence.ts`: `CachedCognitiveSignal[]` stored per atom in atomIntelligence sidecar — the source data for windowed momentum queries
- `src/storage/entity-helpers.ts`: `findEntityByName()`, entity CRUD — used for entity trajectory data access
- `src/types/gate.ts`: `GateContext` — prediction scorer has access to gate context on every dispatch

### Established Patterns
- Pure module pattern: AI pipeline files import NO store — scorer must follow same pattern
- Fire-and-forget Dexie writes: Phase 26 established async sidecar writes — momentum snapshots follow same pattern
- Harness override API: Phase 30's `setActiveBinderConfig()` in-memory override pattern — prediction cache harness hooks follow same pattern
- BinderTypeConfig as source of truth: Phase 30 established JSON-driven config — signal-category map and prediction params follow same pattern
- Lazy + TTL-cached: v5.5 decision that prediction is never timer-based — cache follows this exactly

### Integration Points
- `src/ai/enrichment/enrichment-engine.ts`: Replace `computeSignalRelevance()` call with `predictEnrichmentOrder()` from new scorer
- `src/config/binder-types/gtd-personal/`: Add `signalCategoryMap`, `entityCategoryMap`, and `predictionConfig` sections to GTD binder type config
- `src/types/intelligence.ts`: Add `predictionMomentum` and `entityMomentum` fields to `AtomIntelligence` type
- `src/storage/db.ts`: No new tables needed — fields added to existing atomIntelligence
- `scripts/harness/`: Prediction cache harness hooks for adversarial cycle integration

</code_context>

<specifics>
## Specific Ideas

- chat13.txt frames the predictive scorer as a "skill" in the BinderOS ontology — a narrow cognitive capability operating on sparse, structured feature vectors (the SDR-like momentum vector). Each ONNX agent learns patterns; the scorer synthesizes their signals into prediction
- The momentum concept makes the system feel "alive" — no binary trend detection, just continuously-updating momentum scores that rise and decay naturally. The enrichment wizard gets smarter without any visible mechanism change
- People (PER entities) are structurally as important as calendars per chat13.txt — the People substrate vision reinforces why entity trajectory matters for prediction, even before OS-level people permissions exist
- The sidecar snapshot design enables future harness ablation: "what would predictions have been with a different momentum half-life?" by replaying snapshots with different decay parameters
- Frequency + strength separation enables the scorer to distinguish "the user is suddenly processing lots of quick tasks" from "the user is processing fewer but increasingly complex items" — different enrichment priorities for each pattern

</specifics>

<deferred>
## Deferred Ideas

- **Multi-binder momentum awareness** — cross-binder signal trends (e.g., work stress spilling into personal). Architecture supports via binderId[] parameter, not implemented in Phase 32
- **Relationship-aware entity trajectory** — entity relationships influencing prediction scoring. Phase 32 uses entity trajectory alone
- **Momentum visualization** — user-facing dashboard or debug surface showing live momentum scores. Phase 32 is purely internal
- **Per-session window overrides** — ability to request "deep prediction mode" for complex atoms. Phase 32 uses BinderTypeConfig-only window control
- **Compositor composite momentum** — compositor rules (stress-risk, quick-win) getting bonus multipliers beyond individual signal momentum
- **People substrate integration** — OS-level people permissions feeding into entity trajectory (from chat13.txt vision)

</deferred>

---

*Phase: 32-predictive-enrichment-scorer*
*Context gathered: 2026-03-13*
