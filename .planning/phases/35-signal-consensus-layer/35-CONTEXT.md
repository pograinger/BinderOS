# Phase 35: Canonical Feature Vectors - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Define and compute structured, sparse, typed feature vectors per atom type (task, person, calendar) from sidecar + metadata + entity data — replacing raw embeddings as the primary input for specialist ONNX models. Vectors are cached in atomIntelligence and invalidated on atom mutation. Vector dimension schemas are declared per BinderTypeConfig for pluggable binder types.

</domain>

<decisions>
## Implementation Decisions

### Vector dimension design
- **GTD lifecycle focused dimensions for task vectors**: Age, staleness, deadline proximity, energy level, cognitive load, context match, dependency count, enrichment depth — dimensions that predict "what should I do next?"
- **Fixed-length vectors per type**: Each atom type has a known dimension count declared in BinderTypeConfig. Zero-fill unused slots for cold-start (same pattern as Phase 33). Downstream ONNX models get static input shapes
- **Normalized 0-1 floats**: Continuous values for all numeric dimensions, preserving gradient information for downstream models. Min-max or sigmoid normalization. One-hot encoding for categorical dimensions (e.g., relationship type)

### Cross-type vector interactions
- **Task vectors incorporate entity data**: `computeTaskVector(atom, sidecar, entities)` already accepts entities in the signature. Tasks delegated to reliable vs unresponsive people produce different vectors. Entity data is predictive signal, not noise
- **Entity aggregation for multi-entity atoms**: Claude's Discretion — pick the aggregation strategy (primary entity, mean pool, etc.) that best preserves predictive value while keeping dimensions fixed
- **Person vectors are entity-only**: No cross-table task aggregation. Person vectors derive from entity registry data only (relationship type, mention count, recency, collaboration frequency). Task-count-per-person belongs in downstream specialist models
- **Calendar vectors ARE entity-aware**: Calendar events involving certain entities (boss, spouse) have different energy/priority profiles. Entity context is baked into the calendar vector, not deferred
- **Person vector dimensions**: Claude's Discretion — pick which entity fields carry predictive value (relationship type one-hot, mention count, recency, collaboration frequency, user correction signals)

### Invalidation & caching strategy
- **Invalidate on meaningful mutation only**: Atom save, triage completion, enrichment answer — same triggers as ring buffer (Phase 33). Skip recompute if only cosmetic metadata changed. Cheap dirty-check on fields that actually feed the vector
- **Synchronous inline recomputation**: computeXVector() is pure math on already-available data — no model inference, no async. Sub-millisecond. Run inline with the triggering action. Vector is immediately fresh
- **All vectors in atomIntelligence**: Person/calendar atoms ARE atoms in BinderOS — they have atomIds. Store all canonical vectors in `atomIntelligence.canonicalVector` as Float32Array snapshots. Unified storage, one invalidation path
- **Simple timestamp versioning**: Store `lastComputed` timestamp alongside the vector. Consumer compares against atom.updatedAt to detect staleness. Matches existing CRDT timestamp patterns

### BinderTypeConfig extensibility
- **Named dimension arrays in config**: `vectorSchema: { task: ['age', 'staleness', 'deadline', ...], person: ['relType', 'mentions', ...] }`. Names are documentation; array order is the contract. JSON-serializable, Zod-validatable
- **Binder type declares supported vector types**: GTD declares task+person+calendar. A research binder might declare source+concept+reference. Vector type names are strings in config. Compute functions registered per type. OS-like extensibility consistent with Phase 30's plugin model
- **Static imports for now**: GTD compute functions are direct imports. Dynamic registry deferred to when third-party binder types exist. Keep Phase 35 focused
- **Runtime assertion on dimension count**: Compute function output length must match schema dimension count. Assert on first compute, log error if mismatch. Catches config/code drift without build-time complexity

### Claude's Discretion
- Exact dimension count per vector type (task, person, calendar)
- Person vector dimension selection from entity registry fields
- Entity aggregation strategy for multi-entity atoms (primary, mean pool, etc.)
- Normalization approach per dimension (min-max vs sigmoid vs custom)
- Which atom fields constitute a "meaningful mutation" for dirty-checking
- Internal organization of compute modules (one file vs per-type files)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/storage/atom-intelligence.ts`: atomIntelligence read/write helpers — add canonicalVector field
- `src/config/binder-types/schema.ts`: BinderTypeConfigSchema (Zod) — extend with vectorSchema
- `src/config/binder-types/index.ts`: getBinderConfig() registry — vector schema accessible here
- `src/types/gate.ts`: GateContext, SequenceContextEntry interfaces — established typed patterns
- `src/storage/entity-helpers.ts`: Entity/relation read helpers — input for person vectors
- `src/ai/tier2/types.ts`: TieredFeatures — may carry canonical vectors to downstream consumers

### Established Patterns
- Pure function pattern: AI pipeline files import NO store — compute functions follow this
- BinderTypeConfig as driver descriptor: column sets, compositor rules, predicate configs (Phase 30)
- Dexie sidecar pattern: atomIntelligence keyed by atomId with nested typed fields (Phase 26)
- CRDT-ready fields: version, deviceId, updatedAt on all intelligence tables
- Zod schema validation: BinderTypeConfigSchema validates on load (Phase 30)
- Invalidation triggers: atom save, triage completion, enrichment — same as ring buffer (Phase 33)

### Integration Points
- `src/storage/atom-intelligence.ts`: Add canonicalVector + lastComputed fields
- `src/config/binder-types/schema.ts`: Extend Zod schema with vectorSchema declaration
- `src/config/binder-types/gtd-personal/`: Add vectors.json with GTD dimension declarations
- `src/ui/signals/store.ts`: Trigger vector recomputation on atom save/triage (inline, synchronous)
- `src/storage/entity-helpers.ts`: Entity data lookups for task and calendar vector computation

</code_context>

<specifics>
## Specific Ideas

- Canonical vectors are the "replace raw embeddings" moment — downstream specialist models (Phase 36) consume structured, interpretable features instead of opaque 384-dim MiniLM vectors
- The EII experiment validated that canonical vectors are more expressive than raw embeddings (+0.030 AUC lift from specialist consensus on structured features)
- Calendar entity-awareness means "meeting with boss" and "meeting with intern" produce measurably different vectors — energy cost and priority dimensions reflect the entity relationship
- Vector type extensibility (binder types declare their own types) is the OS plugin model: GTD has task/person/calendar, a research binder could have source/concept/reference with completely different dimensions

</specifics>

<deferred>
## Deferred Ideas

- **Dynamic compute function registry** — registerVectorComputer() pattern for third-party binder types. Static imports sufficient for now
- **Behavioral pattern dimensions** — completion velocity, deferral count, re-triage frequency. Requires historical aggregation not available in atom+sidecar. Future enhancement
- **Cross-binder vector awareness** — vectors influenced by data from other open binders. Single-binder scope for Phase 35
- **Vector visualization** — showing users which dimensions are driving specialist model predictions. UX concern for Phase 38+

</deferred>

---

*Phase: 35-signal-consensus-layer*
*Context gathered: 2026-03-13*
