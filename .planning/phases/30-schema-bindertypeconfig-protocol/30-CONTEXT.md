# Phase 30: Schema + BinderTypeConfig Protocol - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Dexie v10 migration adds three new tables (gateActivationLog, sequenceContext, binderTypeConfig) and the `BinderTypeConfig` interface is expanded from its current enrichment-focused 7-field shape into the authoritative OS-like driver descriptor for all binder-type concerns — ONNX column set, compositor rules, enrichment templates, relationship patterns, entity types, gate predicates, and graduation criteria. GTD is refactored as the first full implementation. A predicate registry scaffold at `src/ai/context-gate/` is created with typed config-reading stubs and an evaluator interface. No new AI behaviors — this is schema, types, and consolidation.

</domain>

<decisions>
## Implementation Decisions

### BinderTypeConfig expansion
- **Declare active ONNX models per binder type** — column set lists which of the 10 cognitive model IDs are relevant. Only those run. A ProjectBinder might skip gtd-horizon and review-cadence. Saves compute on mobile
- **Config owns full compositor rules** — BinderTypeConfig declares signal combinations, thresholds, and composite names. A new binder type defines its own composites. JSON is the source of truth; Python training scripts read compositor rules FROM the binder-type JSON
- **Declarative gate predicate config** — JSON-serializable predicate configurations: `{ routeGating: { blockedRoutes: [...] }, timeGating: { lowEnergyHours: [...] }, historyGating: { maxDepth, staleDays } }`. OS-like extensibility — easy to add new predicate dimensions as data, not code
- **Binder-type owned relationship patterns** — relationship-patterns.json moves INTO BinderTypeConfig. GTD defines spouse/colleague/healthcare-provider. A ProjectBinder would define client/vendor/stakeholder. Each binder type brings its own relationship vocabulary
- **Entity type priority per binder type** — `entityTypePriority: ['PER', 'LOC', 'ORG']` with ordering. Detection finds all types, but enrichment/suggestions prioritize per config
- **Configurable graduation criteria** — BinderTypeConfig declares maturityThresholds and maxEnrichmentDepth. GTD might graduate at depth 2, a research binder at depth 4
- **Versioned configs** — each binder-type config has a `schemaVersion`. Harness checks if config version changed since last training run. Enables auto-retrain on config evolution

### GTD constant consolidation
- **Split JSON files per concern** — `src/config/binder-types/gtd-personal/enrichment.json`, `columns.json`, `relationships.json`, `gating.json`, etc. Merged at build time via Vite plugin
- **Manifest file per binder type** — `manifest.json` declares all config files + metadata (name, version, slug, description, icon, category, author, minAppVersion). SDK-ready for third-party binder types
- **Rich metadata** — name, slug, version, description, icon (emoji or SVG path), category ('productivity', 'research', 'creative'), author, minAppVersion. Ready for a binder-type marketplace/picker
- **Declarative directory-based registration** — drop a folder in `src/config/binder-types/{slug}/` with the right files → auto-discovered at build time. Zero code changes to register. OS-like plugin model
- **Codegen generates both** — Python codegen produces `cognitive-signals.ts` (shared types) AND a binder-type column set snippet. Codegen validates that binder-type JSON references only valid model IDs from the training pipeline. CI catches mismatches
- **Delete old locations immediately** — clean break. `relationship-patterns.json` and scattered GTD constants removed. All consumers updated in Phase 30 to read from BinderTypeConfig. Consistent with Phase 26's clean-break migration approach

### New Dexie tables (v10 migration)
- **One v10 migration** — single `applyV10Migration()` that adds all three tables. Consistent with v1-v9 pattern. Atomic
- **All tables CRDT-ready** — version, deviceId, updatedAt on all three new tables. Consistent with Phase 26 pattern. Zero runtime cost
- **gateActivationLog: rich context snapshot** — each entry: predicateName, outcome (activated/blocked), atomId, route, timeOfDay, binderType, enrichmentDepth, timestamp, configVersion. Harness can fully replay why a gate fired
- **gateActivationLog: query-optimized indexes** — compound indexes: [predicateName+timestamp] for per-predicate rate queries, [atomId+timestamp] for per-atom gate history
- **gateActivationLog: simple TTL retention** — auto-delete entries older than N days (configurable, default 30). Cleanup pass on app boot. Prevents unbounded growth before the intelligent pruner arrives
- **sequenceContext: full schema now** — binderId, windowSize, embeddings (Float32Array stored as typed array blobs in IndexedDB), lastUpdated, modelVersion. Phase 33 fills it. Avoids another migration
- **binderTypeConfig table** — Claude's discretion on full config blob vs slug+metadata based on harness SDK injection needs

### Config loading & validation
- **Build-time merge via Vite** — Vite plugin reads manifest.json, merges all JSON files into a single config per binder type. Runtime gets pre-merged object. Fast boot, tree-shakeable
- **Warn and fall back** — log validation errors, fall back to gtd-personal as default. App always boots. Bad config surfaced in dev console
- **Zod validated** — full Zod schema for BinderTypeConfig. Validates on load. Type inference from schema. Consistent with existing atom types pattern
- **Async fire-and-forget Dexie sync** — boot reads from JSON imports (instant). Dexie write happens in background. Harness reads from Dexie. No boot delay

### Harness config injection
- **Override API** — harness calls `setActiveBinderConfig(config)` which sets an in-memory override. All `getBinderConfig()` calls return the override. Clean, testable, no Dexie dependency in harness tests
- **Sequential binder types only** — one binder type per harness run. `--binder-type` flag switches. Matches 'one binder open at a time' production model
- **Skip missing models with warning** — log which models are missing, run with available models only. Reports which columns are undertrained. Enables testing partial binder-type configs before full training

### Type registry API
- **Full registry API** — `getBinderConfig(slug)`, `listBinderTypes()` → `BinderTypeMeta[]`, `getActiveBinderType()` → slug, `setActiveBinderType(slug)`
- **Binder type fixed at creation** — set when binder is created, can't change later. Agents/models are tuned to the type. Switching would invalidate accumulated intelligence

### Predicate registry scaffold
- **One file per predicate dimension** — `route-predicate.ts`, `time-predicate.ts`, `history-predicate.ts`, `binder-type-predicate.ts` in `src/ai/context-gate/predicates/`. OS-like module loading
- **Rich result objects** — predicates return `{ activated: boolean, reason: string, metadata?: Record<string, unknown> }`. Gate log captures WHY a predicate blocked. Harness gets richer data for threshold tuning
- **Dynamic registration** — `registerPredicate('custom-predicate', fn)` so binder types can add custom gate predicates beyond the four core dimensions. Registry pattern matches handler registration in dispatchTiered()
- **Evaluator stub included** — `src/ai/context-gate/activation-gate.ts` with typed interface + no-op implementation. Single `canActivate(context: GateContext)` entry point. Phase 31 fills it in
- **Structured typed GateContext** — `GateContext { route?: string, timeOfDay?: number, atomId?: string, enrichmentDepth?: number, binderType?: string, customFields?: Record<string, unknown> }`. Type-safe, self-documenting
- **Config-reading stubs** — stubs read BinderTypeConfig predicate config (e.g., blockedRoutes) and return meaningful results even before Phase 31 wires them into dispatchTiered(). More testable

### Claude's Discretion
- Nested sub-config structure vs flat interface shape (optimize for extensibility + simplicity)
- Predicate evaluation ordering (priority with short-circuit vs evaluate-all-and-AND for harness observability)
- binderTypeConfig Dexie table schema (full blob vs slug+metadata based on harness SDK needs)
- Vite plugin implementation details for build-time config merging
- Exact Zod schema shape for the expanded BinderTypeConfig
- Migration transaction boundaries and index design details

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/config/binder-types/index.ts`: Current BinderTypeConfig interface (7 fields) + getBinderConfig() registry. **Expanding** this substantially
- `src/config/binder-types/gtd-personal.json`: Current 322-line GTD config. **Splitting** into per-concern JSON files in gtd-personal/ directory
- `src/config/relationship-patterns.json`: 30+ keyword patterns. **Moving** into BinderTypeConfig (relationships.json)
- `src/storage/db.ts`: Dexie v9 schema with v1-v9 migration chain. Adding v10
- `src/storage/migrations/`: Established migration pattern (applyVXMigration). Following same pattern for v10
- `src/ai/tier2/cognitive-signals.ts`: Auto-generated signal protocol types. Codegen expanding to validate binder-type column sets
- `scripts/train/62_signal_compositor.py`: COMPOSITOR_RULES source. Will read from binder-type JSON instead
- `src/entity/entity-context-suggestions.ts`: Already reads BinderTypeConfig.entityContextMappings — pattern established

### Established Patterns
- Dexie migration pattern: `applyVXMigration(this)` in db.ts constructor
- CRDT-ready fields: version, deviceId, updatedAt on intelligence tables (Phase 26)
- Pure module pattern: AI pipeline files import NO store
- JSON config import: Vite JSON imports for binder-type configs
- Handler registration: `registerHandler()` in dispatchTiered pipeline — predicate registry follows same pattern
- Zod schema validation: types/atoms.ts uses Zod for runtime validation

### Integration Points
- `src/ai/tier2/pipeline.ts`: dispatchTiered() — Phase 31 wires ActivationGate here as pre-dispatch filter
- `src/ai/tier2/cognitive-signals.ts`: Column set model IDs referenced by BinderTypeConfig
- `src/inference/keyword-patterns.ts`: Currently reads relationship-patterns.json — switches to BinderTypeConfig
- `scripts/harness/`: Override API for config injection during adversarial cycles
- `src/storage/db.ts`: v10 migration adds 3 new tables

</code_context>

<specifics>
## Specific Ideas

- User wants this to feel like an "Operating System" — easy to extend, scale, and grow intelligence features. BinderTypeConfig is the driver descriptor, binder types are plugins
- Declarative directory-based registration is the OS-like plugin model — drop a folder, auto-discovered
- Manifest file makes this SDK-ready for third-party binder types
- JSON as source of truth for compositor rules means training and runtime always agree
- Rich gate log context enables future Optuna-informed intelligent pruner that balances database bloat vs signal value
- Config-reading predicate stubs mean Phase 31 only needs to wire the evaluator — more of the work is done in Phase 30

</specifics>

<deferred>
## Deferred Ideas

- **Intelligent gate log pruner** — Optuna-informed worker that balances database bloat vs signal value in gateActivationLog retention. Current TTL is a placeholder until harness data reveals optimal retention windows
- **Runtime binder-type switching** — currently fixed at creation. Future UX could allow switching with intelligence sidecar re-processing
- **Binder-type marketplace** — rich metadata (icon, category, author) enables a future picker/store UI
- **User-authored binder types** — Dexie table storage enables configs created in-app without rebuilds
- **Autonomous enrichment loop FSM** — per-device enrichment scheduling based on binder type config (from Phase 26 deferred)

</deferred>

---

*Phase: 30-schema-bindertypeconfig-protocol*
*Context gathered: 2026-03-12*
