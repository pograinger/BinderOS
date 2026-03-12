# Phase 30: Schema + BinderTypeConfig Protocol - Research

**Researched:** 2026-03-12
**Domain:** Dexie v10 schema migration, TypeScript interface design, Vite plugin architecture, Zod schema validation
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**BinderTypeConfig expansion:**
- Declare active ONNX models per binder type — column set lists which of the 10 cognitive model IDs are relevant. Only those run.
- Config owns full compositor rules — BinderTypeConfig declares signal combinations, thresholds, and composite names. JSON is the source of truth; Python training scripts read compositor rules FROM the binder-type JSON
- Declarative gate predicate config — JSON-serializable predicate configurations: `{ routeGating: { blockedRoutes: [...] }, timeGating: { lowEnergyHours: [...] }, historyGating: { maxDepth, staleDays } }`
- Binder-type owned relationship patterns — relationship-patterns.json moves INTO BinderTypeConfig
- Entity type priority per binder type — `entityTypePriority: ['PER', 'LOC', 'ORG']` ordering
- Configurable graduation criteria — BinderTypeConfig declares maturityThresholds and maxEnrichmentDepth
- Versioned configs — each binder-type config has a `schemaVersion`. Harness checks if config version changed since last training run

**GTD constant consolidation:**
- Split JSON files per concern — `src/config/binder-types/gtd-personal/enrichment.json`, `columns.json`, `relationships.json`, `gating.json`, etc. Merged at build time via Vite plugin
- Manifest file per binder type — `manifest.json` declares all config files + metadata (name, version, slug, description, icon, category, author, minAppVersion)
- Declarative directory-based registration — drop a folder in `src/config/binder-types/{slug}/` → auto-discovered at build time
- Codegen generates both `cognitive-signals.ts` (shared types) AND a binder-type column set snippet. CI validates binder-type JSON references only valid model IDs
- Delete old locations immediately — clean break. `relationship-patterns.json` and scattered GTD constants removed. All consumers updated in Phase 30

**New Dexie tables (v10 migration):**
- One v10 migration — single `applyV10Migration()`. Atomic
- All tables CRDT-ready — version, deviceId, updatedAt on all three new tables
- gateActivationLog: predicateName, outcome (activated/blocked), atomId, route, timeOfDay, binderType, enrichmentDepth, timestamp, configVersion
- gateActivationLog: compound indexes: [predicateName+timestamp], [atomId+timestamp]
- gateActivationLog: simple TTL retention — auto-delete entries older than N days (configurable, default 30). Cleanup pass on app boot
- sequenceContext: full schema now — binderId, windowSize, embeddings (Float32Array stored as typed array blobs), lastUpdated, modelVersion. Phase 33 fills it
- binderTypeConfig table — Claude's discretion on full config blob vs slug+metadata

**Config loading & validation:**
- Build-time merge via Vite — Vite plugin reads manifest.json, merges all JSON files into a single config per binder type
- Warn and fall back — log validation errors, fall back to gtd-personal as default
- Zod validated — full Zod schema for BinderTypeConfig. Validates on load
- Async fire-and-forget Dexie sync — boot reads from JSON imports (instant). Dexie write happens in background

**Harness config injection:**
- Override API — harness calls `setActiveBinderConfig(config)` which sets an in-memory override
- Sequential binder types only — one binder type per harness run. `--binder-type` flag
- Skip missing models with warning

**Type registry API:**
- `getBinderConfig(slug)`, `listBinderTypes()` → `BinderTypeMeta[]`, `getActiveBinderType()` → slug, `setActiveBinderType(slug)`
- Binder type fixed at creation — can't change later

**Predicate registry scaffold:**
- One file per predicate dimension — `route-predicate.ts`, `time-predicate.ts`, `history-predicate.ts`, `binder-type-predicate.ts` in `src/ai/context-gate/predicates/`
- Rich result objects — predicates return `{ activated: boolean, reason: string, metadata?: Record<string, unknown> }`
- Dynamic registration — `registerPredicate('custom-predicate', fn)`
- Evaluator stub included — `src/ai/context-gate/activation-gate.ts` with `canActivate(context: GateContext)` entry point
- Structured typed GateContext — `GateContext { route?, timeOfDay?, atomId?, enrichmentDepth?, binderType?, customFields? }`
- Config-reading stubs — stubs read BinderTypeConfig predicate config and return meaningful results

### Claude's Discretion
- Nested sub-config structure vs flat interface shape (optimize for extensibility + simplicity)
- Predicate evaluation ordering (priority with short-circuit vs evaluate-all-and-AND for harness observability)
- binderTypeConfig Dexie table schema (full blob vs slug+metadata based on harness SDK needs)
- Vite plugin implementation details for build-time config merging
- Exact Zod schema shape for the expanded BinderTypeConfig
- Migration transaction boundaries and index design details

### Deferred Ideas (OUT OF SCOPE)
- Intelligent gate log pruner (Optuna-informed)
- Runtime binder-type switching
- Binder-type marketplace
- User-authored binder types
- Autonomous enrichment loop FSM
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SCHM-01 | Dexie v10 migration adds `gateActivationLog`, `sequenceContext`, and `binderTypeConfig` tables — fully additive, no mutations to v1-v9 tables | v9 migration pattern (applyV9Migration) is the direct template; CRDT-ready field pattern from Phase 26 applies to all three tables |
| BTYPE-01 | `BinderTypeConfig` interface formalized with column set (ONNX model IDs), compositor rules, enrichment categories, relationship patterns, entity types, and context gate predicates — GTD updated as first implementation | Current 7-field interface in `src/config/binder-types/index.ts` must expand; existing Zod pattern from `types/intelligence.ts` guides validation; existing consumer `entity-context-suggestions.ts` shows the read pattern that all new consumers will follow |
</phase_requirements>

---

## Summary

Phase 30 is a foundational schema and interface consolidation with zero new AI behaviors. The two deliverables are: (1) a Dexie v10 migration that adds three CRDT-ready tables following the exact v1-v9 pattern already in `src/storage/migrations/`, and (2) an expanded `BinderTypeConfig` interface that graduates from a 7-field enrichment helper into the authoritative OS-level binder-type descriptor, with GTD refactored as its first full implementation.

The existing codebase provides clear, battle-tested templates for both work streams. The v9 migration (`applyV9Migration`) shows exactly how to add tables, set up compound indexes, and (when needed) do data transforms. The v1-v9 chain demonstrates the non-breaking additive-only rule. For the interface expansion, `src/types/intelligence.ts` shows the project's Zod-first type pattern, and `entity-context-suggestions.ts` shows how consumers accept `BinderTypeConfig` as a parameter rather than importing it as a global.

The Vite plugin for build-time JSON merging is the largest novel piece — Vite's plugin system is well-documented and the `transform` + `resolveId` hooks needed for this are standard. The pattern is: intercept virtual module imports, read and merge JSON files from the binder-type directory, return the merged object as a JSON module.

**Primary recommendation:** Follow the v9 migration pattern exactly for SCHM-01. For BTYPE-01, expand the interface sub-section by sub-section using Zod objects for each concern area, keeping the registry API module-level functions (not SolidJS store state).

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Dexie | 4.x (^4.3.0) | IndexedDB ORM — v10 migration | Already the project DB layer; v4 migration pattern is established |
| Zod | v4 (^4.3.6) | Runtime type validation + type inference | Project uses `zod/v4` for intelligence types; apply same pattern to BinderTypeConfig |
| Vite | 7.x (^7.3.1) | Build-time JSON merge plugin | Already the bundler; plugin API stable in v7 |
| TypeScript | Project standard | Interface definitions, type safety | All source is TypeScript; `as const` arrays for model ID unions |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vite-plugin-solid` | Existing | SolidJS JSX — no changes | Not directly relevant to Phase 30 |
| Node `fs`/`path` | Built-in | Vite plugin reads manifest.json + sibling JSON files | Used only inside Vite plugin, never in runtime code |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vite build-time merge | Runtime fetch + merge | Runtime approach delays boot and can fail; build-time merge is zero-latency and tree-shakeable |
| Zod schema for BinderTypeConfig | Manual `interface` + runtime assertions | Zod gives type inference for free and validates at load time with specific error messages |
| Per-concern JSON files merged at build | Single monolithic JSON per binder type | Per-concern files allow focused editing and validation by concern; monolith was what we had and became unmanageable at 322 lines |

**Installation:** No new packages needed. All dependencies already present.

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── config/binder-types/
│   ├── index.ts                     # Registry API + BinderTypeConfig interface (expanded)
│   ├── schema.ts                    # Zod schema for BinderTypeConfig validation
│   └── gtd-personal/
│       ├── manifest.json            # name, slug, version, description, icon, etc.
│       ├── columns.json             # columnSet: CognitiveModelId[]
│       ├── compositor.json          # compositorRules: CompositorRuleConfig[]
│       ├── enrichment.json          # categoryOrdering, questionTemplates, followUpTemplates
│       ├── relationships.json       # patterns: RelationshipPattern[] (migrated from relationship-patterns.json)
│       ├── gating.json              # predicateConfig: GatePredicateConfig
│       └── entities.json            # entityTypePriority, entityContextMappings, graduation config
├── ai/
│   ├── tier2/
│   │   └── cognitive-signals.ts     # (existing) model IDs + compositor types — no change in Phase 30
│   └── context-gate/
│       ├── activation-gate.ts       # Evaluator stub: canActivate(GateContext) → GateResult
│       ├── types.ts                 # GateContext, GateResult, PredicateFn interfaces
│       ├── predicate-registry.ts    # registerPredicate(), evaluatePredicates()
│       └── predicates/
│           ├── route-predicate.ts   # Stub: reads gating.routeGating.blockedRoutes
│           ├── time-predicate.ts    # Stub: reads gating.timeGating.lowEnergyHours
│           ├── history-predicate.ts # Stub: reads gating.historyGating.maxDepth/staleDays
│           └── binder-type-predicate.ts # Stub: checks binderType field
└── storage/
    └── migrations/
        └── v10.ts                   # applyV10Migration() — adds 3 tables
```

### Pattern 1: Dexie Additive Migration
**What:** Add new tables in a new version number without touching existing table definitions
**When to use:** Every time new IndexedDB tables are needed. NEVER modify an existing version's store definitions.
**Example:**
```typescript
// src/storage/migrations/v10.ts
// Source: Mirrors applyV9Migration pattern exactly
export function applyV10Migration(db: BinderDB): void {
  db.version(10).stores({
    gateActivationLog: '&id, [predicateName+timestamp], [atomId+timestamp], timestamp',
    sequenceContext:   '&binderId, lastUpdated',
    binderTypeConfig:  '&slug, updatedAt',
  });
  // No .upgrade() needed — these are new empty tables
}
```
Note: v10 requires NO `.upgrade()` callback because the tables are new and empty. The v9 migration's upgrade was needed to strip enrichment text from existing rows. Adding empty tables never needs an upgrade transform.

### Pattern 2: Zod-First Interface Expansion
**What:** Define the TypeScript type as inferred from Zod schema, not hand-written interface
**When to use:** Any type that needs runtime validation (config loaded from JSON, user data)
**Example:**
```typescript
// src/config/binder-types/schema.ts
import { z } from 'zod/v4';
import type { CognitiveModelId } from '../ai/tier2/cognitive-signals';
import { COGNITIVE_MODEL_IDS } from '../ai/tier2/cognitive-signals';

export const BinderTypeConfigSchema = z.object({
  // Metadata (from manifest.json)
  slug: z.string(),
  name: z.string(),
  schemaVersion: z.number(),
  // ... other fields ...
  // Column set
  columnSet: z.array(z.enum(COGNITIVE_MODEL_IDS as [CognitiveModelId, ...CognitiveModelId[]])),
  // Gate predicate config (JSON-serializable)
  predicateConfig: z.object({
    routeGating: z.object({ blockedRoutes: z.array(z.string()) }),
    timeGating: z.object({ lowEnergyHours: z.array(z.number()) }),
    historyGating: z.object({ maxDepth: z.number(), staleDays: z.number() }),
  }),
  // ... remaining fields ...
});

export type BinderTypeConfig = z.infer<typeof BinderTypeConfigSchema>;
```

### Pattern 3: Vite Build-Time Config Merge Plugin
**What:** A Vite plugin that intercepts virtual module imports and returns the merged JSON
**When to use:** To aggregate per-concern JSON files into a single config object at build time
**Example:**
```typescript
// vite-plugins/binder-type-plugin.ts
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

export function binderTypePlugin() {
  return {
    name: 'binder-type-merger',
    resolveId(id: string) {
      if (id.startsWith('virtual:binder-type/')) return '\0' + id;
    },
    load(id: string) {
      if (!id.startsWith('\0virtual:binder-type/')) return;
      const slug = id.replace('\0virtual:binder-type/', '');
      const dir = join(process.cwd(), 'src/config/binder-types', slug);
      // Read manifest + all declared JSON files, merge into one object
      const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf-8'));
      const merged = { slug, ...manifest };
      for (const file of manifest.configFiles) {
        const data = JSON.parse(readFileSync(join(dir, file), 'utf-8'));
        Object.assign(merged, data);
      }
      return `export default ${JSON.stringify(merged)};`;
    },
  };
}
```
In practice, the simpler approach given Vite's JSON import support is to use static imports and merge at the registry initialization site — this avoids virtual module complexity while still giving build-time resolution.

### Pattern 4: Module-Level Override API (not SolidJS store)
**What:** In-memory override variable for harness injection — never stored in SolidJS reactive state
**When to use:** Any config that needs to be overridable by the harness without touching Dexie
**Example:**
```typescript
// src/config/binder-types/index.ts
let _activeOverride: BinderTypeConfig | null = null;

export function setActiveBinderConfig(config: BinderTypeConfig): void {
  _activeOverride = config;
}

export function getBinderConfig(slug?: string): BinderTypeConfig {
  if (_activeOverride) return _activeOverride;
  // ... normal registry lookup ...
}
```
This follows the project's established pattern for `_pendingCloudResolve` / `resolvePendingCloudRequest()` in `store.ts` (documented in project memory as the fix for SolidJS proxy breaking function callbacks).

### Pattern 5: Predicate Registry (Mirrors Handler Registry)
**What:** Dynamic predicate registration matching the existing `registerHandler()` pattern in `pipeline.ts`
**When to use:** Any extensible registry that binder types or harness tests need to populate
**Example:**
```typescript
// src/ai/context-gate/predicate-registry.ts
export type PredicateFn = (ctx: GateContext, config: BinderTypeConfig) => GatePredicateResult;

const _predicates = new Map<string, PredicateFn>();

export function registerPredicate(name: string, fn: PredicateFn): void {
  _predicates.set(name, fn);
}

export function evaluatePredicates(
  ctx: GateContext,
  config: BinderTypeConfig
): GatePredicateResult[] {
  return Array.from(_predicates.values()).map(fn => fn(ctx, config));
}
```

### Anti-Patterns to Avoid
- **Modifying existing version() definitions in db.ts:** Dexie processes migration versions by number; changing an existing version's stores definition silently corrupts the schema for users whose DB is already at that version.
- **Storing BinderTypeConfig in SolidJS createStore:** The SolidJS proxy wraps the object and breaks function references inside it (documented in project memory). Keep registry state in plain module-level variables.
- **Circular imports between schema.ts and cognitive-signals.ts:** The Zod schema needs `COGNITIVE_MODEL_IDS` from cognitive-signals.ts. `cognitive-signals.ts` must NOT import from binder-types. Keep the dependency one-directional.
- **Virtual binder-type modules with wildcard discovery:** Auto-discovering ALL subdirectories in the plugin is brittle; use an explicit manifest list or an index file at `src/config/binder-types/registry.ts` that enumerates known slugs. Auto-discovery causes build failures when test fixtures end up in the directory.
- **Writing full config blob to binderTypeConfig Dexie table:** The table is for harness SDK injection. Store slug + serialized JSON config (not the live TypeScript object). The runtime always reads from merged JSON imports for speed; Dexie is for harness reads.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON schema validation with type inference | Manual `if (typeof x === 'string')` guards | `zod/v4` `.parse()` or `.safeParse()` | Already in the project; gives free TypeScript types; error messages include field paths |
| IndexedDB compound index queries | Raw `IDBKeyRange` | Dexie `.where('[field1+field2]')` | Already used for `[sourceEntityId+targetEntityId]` in entityRelations; same pattern for `[predicateName+timestamp]` |
| Config file watching during dev | Custom `fs.watch` in plugin | Vite's `addWatchFile()` plugin hook | Vite handles HMR and dev server reloads; call `this.addWatchFile(manifestPath)` in the plugin's `load` hook |
| Registry singleton management | Static class with `getInstance()` | Module-level variable + exported functions | Project uses this pattern consistently (`BINDER_CONFIGS`, `handlers` array in pipeline.ts) |

**Key insight:** The project has consistent patterns for all sub-problems. Deviating from them creates inconsistency without benefit.

---

## Common Pitfalls

### Pitfall 1: Dexie Version Gaps Break Migrations
**What goes wrong:** If a user has v9 data and the code jumps to v11 (skipping v10), Dexie will apply all intermediary version handlers in order. Skipping numbers is fine, but the `version(N).stores()` call for any version BETWEEN 9 and the new one must still be present. In this project, v1-v9 are all defined — adding v10 simply appends to the chain.
**Why it happens:** Developers sometimes "clean up" old migration code, removing older version definitions.
**How to avoid:** Never remove existing `db.version(N).stores()` calls. Only ADD new ones.
**Warning signs:** "VersionError" or blank DB on devices that had v9 data after deployment.

### Pitfall 2: Zod v4 Import Path
**What goes wrong:** `import { z } from 'zod'` resolves to Zod v3 entry point with `zod@4.x` installed. The project uses `import { z } from 'zod/v4'` throughout (`intelligence.ts` lines 1, 18).
**Why it happens:** Zod 4 changed its main entry to expose v3-compat shims by default; the v4 API requires the `/v4` subpath.
**How to avoid:** Use `import { z } from 'zod/v4'` in every new file. Check existing files — all use `/v4`.
**Warning signs:** TypeScript type errors on `.object()`, `.enum()`, etc. that look like version mismatches.

### Pitfall 3: Float32Array Not Directly Serializable in Dexie
**What goes wrong:** `sequenceContext.embeddings` is specified as `Float32Array`. Dexie 4 stores TypedArrays as binary blobs via the structured clone algorithm, which is correct behavior — but reading them back gives a `Float32Array`, not a plain number array. Code that does `JSON.stringify(record)` on a sequenceContext row (e.g., in harness checkpoint) will produce `{}` for the embeddings field.
**Why it happens:** Structured clone stores typed arrays correctly, but JSON serialization drops them.
**How to avoid:** In the harness checkpoint serialization, convert `Float32Array` to `Array.from(embeddings)` before JSON serialization and back to `new Float32Array(arr)` on restore.
**Warning signs:** Harness reports zero-length embedding vectors after checkpoint restore.

### Pitfall 4: Vite Plugin `transform` vs `load` Hook Confusion
**What goes wrong:** Using the `transform` hook to merge JSON files causes the plugin to run on every file, including ones it doesn't own. Using `load` (which only fires for IDs that `resolveId` returned) is the correct scope.
**Why it happens:** `transform` is the most familiar Vite plugin hook; `load` is less commonly used.
**How to avoid:** Use the `resolveId` + `load` pair for virtual modules. For real JSON files with side imports, the simpler approach is static `import` statements in the registry init code rather than a virtual module.
**Warning signs:** Build times increase significantly; unrelated `.json` imports break.

### Pitfall 5: BinderTypeConfig Circular Dependency with cognitive-signals.ts
**What goes wrong:** `BinderTypeConfig.columnSet` type-checks against `CognitiveModelId`, which comes from `cognitive-signals.ts`. If `cognitive-signals.ts` ever imports from binder-types (e.g., to check active column set), you get a circular dependency that TypeScript allows at compile time but Node/Vite resolves incorrectly at runtime.
**Why it happens:** The column set is a shared concern between config and signals.
**How to avoid:** `cognitive-signals.ts` must never import from binder-types. The `CognitiveModelId` type flows one way: signals → config. Config reads signal model IDs; signals never read config.
**Warning signs:** `Cannot read property 'X' of undefined` at runtime even though TypeScript compiles cleanly.

### Pitfall 6: GTD Constants Scattered Across Files After "Clean Break"
**What goes wrong:** The CONTEXT.md decision says delete old locations immediately. If refactoring is partial (relationship-patterns.json moved but `keyword-patterns.ts` still imports the old path), the TypeScript compiler will catch it — but only if you run a full type-check, not just the file you edited.
**Why it happens:** Large refactors with many consumers are easy to miss partial updates in.
**How to avoid:** After moving `relationship-patterns.json` into the binder-type directory, run `tsc --noEmit` before committing. The import of `'../config/relationship-patterns.json'` in `keyword-patterns.ts` line 27 will fail to resolve and surface immediately.
**Warning signs:** TypeScript errors on `../config/relationship-patterns.json` import.

---

## Code Examples

### v10 Migration (Additive, No Upgrade Needed)
```typescript
// src/storage/migrations/v10.ts
import type { BinderDB } from '../db';

export function applyV10Migration(db: BinderDB): void {
  db.version(10).stores({
    // Audit log for context gate predicate decisions
    // Compound indexes enable per-predicate rate queries and per-atom history
    gateActivationLog: '&id, [predicateName+timestamp], [atomId+timestamp], timestamp',
    // Embedding ring buffer per binder — Phase 33 fills the data
    sequenceContext:   '&binderId, lastUpdated',
    // Binder-type config store for harness SDK injection
    binderTypeConfig:  '&slug, updatedAt',
  });
  // No .upgrade() — these are new empty tables; no existing data to transform
}
```

### New BinderDB Table Declarations
```typescript
// Additions to src/storage/db.ts
import type { GateActivationLogEntry, SequenceContextEntry, BinderTypeConfigEntry } from '../types/gate';

// In BinderDB class body:
gateActivationLog!: Table<GateActivationLogEntry, string>;
sequenceContext!: Table<SequenceContextEntry, string>;
binderTypeConfig!: Table<BinderTypeConfigEntry, string>;
```

### GateContext and GateResult Types
```typescript
// src/ai/context-gate/types.ts
export interface GateContext {
  route?: string;           // Current SolidJS pathname
  timeOfDay?: number;       // Hour of day (0-23)
  atomId?: string;          // For history-based gating
  enrichmentDepth?: number; // From atomIntelligence sidecar
  binderType?: string;      // Active binder slug
  customFields?: Record<string, unknown>; // Extensibility for custom predicates
}

export interface GatePredicateResult {
  activated: boolean;
  reason: string;
  metadata?: Record<string, unknown>;
}

export interface GateResult {
  canActivate: boolean;
  predicateResults: Array<{ name: string } & GatePredicateResult>;
}
```

### GateActivationLog Row Type
```typescript
// src/types/gate.ts
export interface GateActivationLogEntry {
  id: string;           // UUID
  predicateName: string;
  outcome: 'activated' | 'blocked';
  atomId?: string;
  route?: string;
  timeOfDay?: number;
  binderType?: string;
  enrichmentDepth?: number;
  timestamp: number;    // Date.now()
  configVersion: string; // BinderTypeConfig.schemaVersion as string
  // CRDT metadata
  version: number;
  deviceId: string;
  updatedAt: number;
}

export interface SequenceContextEntry {
  binderId: string;             // Primary key
  windowSize: number;
  embeddings: Float32Array;     // Stored as binary blob via structured clone
  lastUpdated: number;
  modelVersion: string;
  // CRDT metadata
  version: number;
  deviceId: string;
  updatedAt: number;
}

export interface BinderTypeConfigEntry {
  slug: string;                // Primary key
  configJson: string;          // JSON.stringify() of full BinderTypeConfig
  updatedAt: number;
  // CRDT metadata
  version: number;
  deviceId: string;
}
```

### Expanded BinderTypeConfig Interface (Key Fields)
```typescript
// Core shape after expansion — enforced by Zod schema in schema.ts
export interface BinderTypeConfig {
  // Metadata (from manifest.json)
  slug: string;
  name: string;
  schemaVersion: number;
  description?: string;
  icon?: string;         // Emoji or SVG path
  category?: 'productivity' | 'research' | 'creative';
  author?: string;
  minAppVersion?: string;

  // Existing fields (preserved for backward compat)
  purpose: string;
  categoryOrdering: string[];
  supportedAtomTypes: string[];
  questionTemplates: Record<string, { question: string; options: Record<string, string[]> }>;
  followUpTemplates?: Record<string, { tiers: Array<{ question: string; options: Record<string, string[]> }> }>;
  backgroundCloudEnrichment: boolean;
  entityContextMappings?: Record<string, string>;

  // Phase 30 additions
  columnSet: CognitiveModelId[];                      // Active ONNX models for this binder type
  compositorRules: CompositorRuleConfig[];            // JSON-serializable (no evaluate fn)
  relationshipPatterns: RelationshipPattern[];        // Moved from relationship-patterns.json
  entityTypePriority: Array<'PER' | 'LOC' | 'ORG'>; // Detection/enrichment priority order
  predicateConfig: GatePredicateConfig;              // JSON gate predicate config
  maturityThresholds: { graduationDepth: number; maxEnrichmentDepth: number };
}
```

### CompositorRuleConfig (JSON-Serializable, No fn)
```typescript
// The existing CompositorRule has an `evaluate` function — not JSON-serializable.
// The config form stores the rule spec; runtime loads it and builds evaluate() from the spec.
export interface CompositorRuleConfig {
  name: string;
  inputs: CognitiveModelId[];
  outputSignal: CompositeSignalName;
  // JSON-serializable condition spec — runtime interprets this into an evaluate() function
  condition: {
    operator: 'AND' | 'OR';
    clauses: Array<{
      modelId: CognitiveModelId;
      label: string;
      op: '==' | 'in' | '!=';
      value: string | string[];
    }>;
  };
  outputValue?: string; // Optional fixed value (e.g., "high", "suggest-monthly")
}
```

### Config-Reading Predicate Stub
```typescript
// src/ai/context-gate/predicates/route-predicate.ts
import type { GateContext, GatePredicateResult } from '../types';
import type { BinderTypeConfig } from '../../config/binder-types/index';

export function routePredicate(ctx: GateContext, config: BinderTypeConfig): GatePredicateResult {
  if (!ctx.route) {
    return { activated: true, reason: 'No route in context — allow by default' };
  }
  const { blockedRoutes } = config.predicateConfig.routeGating;
  const isBlocked = blockedRoutes.some(blocked => ctx.route!.startsWith(blocked));
  return {
    activated: !isBlocked,
    reason: isBlocked
      ? `Route ${ctx.route} is in blockedRoutes for ${config.slug}`
      : `Route ${ctx.route} is not blocked`,
    metadata: { blockedRoutes, checkedRoute: ctx.route },
  };
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single monolithic `gtd-personal.json` (322 lines) | Per-concern JSON files merged at build time | Phase 30 | Smaller focused files, each validatable by concern, harness can override individual concerns |
| `relationship-patterns.json` as standalone root-level config | `relationships.json` inside `binder-types/gtd-personal/` | Phase 30 | Relationship patterns are now binder-type-owned; a ProjectBinder can have different patterns |
| 7-field `BinderTypeConfig` (enrichment only) | Full OS-level binder-type descriptor (12+ fields) | Phase 30 | Single source of truth for everything agents need to know about a binder type |
| No context gate infrastructure | `src/ai/context-gate/` with typed stubs | Phase 30 | Phase 31 can implement `canActivate()` without architectural decisions |
| Compositor rules hardcoded in `cognitive-signals.ts` | Compositor rule configs in `binder-types/gtd-personal/compositor.json`, runtime hydration | Phase 30 | Training scripts (62_signal_compositor.py) read the same config as runtime — no drift |

**Deprecated/outdated:**
- `src/config/relationship-patterns.json`: deleted in Phase 30; all consumers switch to `getBinderConfig().relationshipPatterns`
- Hardcoded `COMPOSITOR_RULES` array in `cognitive-signals.ts`: moved to binder-type JSON; `cognitive-signals.ts` exports the types and interfaces but not the rule instances

---

## Open Questions

1. **CompositorRuleConfig → evaluate() hydration**
   - What we know: The current `CompositorRule` has an `evaluate` function (not JSON-serializable). The CONTEXT.md decision says JSON is source of truth.
   - What's unclear: Phase 30 must define the `CompositorRuleConfig` JSON shape AND a hydration function that turns a `CompositorRuleConfig` into a `CompositorRule.evaluate`. The exact condition evaluation DSL (the `clauses` format) needs to be defined.
   - Recommendation: Define a minimal condition DSL (operator + clauses as shown in Code Examples above). The hydration function `hydrateCompositorRules(configs)` lives in `cognitive-signals.ts` alongside the existing `evaluateComposites`. Keep the existing `COMPOSITOR_RULES` array as the GTD default until the JSON migration is complete.

2. **binderTypeConfig Dexie table: full blob vs slug+metadata**
   - What we know: CONTEXT.md marks this as Claude's discretion. The harness needs to inject a config and read it back. The runtime uses JSON imports, not Dexie.
   - What's unclear: Does the harness need to read individual config fields from Dexie, or just the full config blob?
   - Recommendation: Store `{ slug, configJson: JSON.stringify(fullConfig), updatedAt, version, deviceId }`. The harness reads `configJson`, parses it, and uses it. This is simpler than a relational schema and the blob is small (<10KB per binder type).

3. **Keyword-patterns.ts consumer migration**
   - What we know: `src/inference/keyword-patterns.ts` line 27 imports `'../config/relationship-patterns.json'` and compiles all patterns at module init.
   - What's unclear: After the move, the patterns are on `getBinderConfig().relationshipPatterns` — but `keyword-patterns.ts` is a pure module (no store imports). It will need to accept patterns as a parameter OR call `getBinderConfig()` (acceptable since that's not a store, it's a pure registry function).
   - Recommendation: Add a `getPatterns(binderType?: string): RelationshipPattern[]` export to the registry, then update `keyword-patterns.ts` to call it at module init (not per-call). This preserves the regex pre-compilation optimization.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (detected from package.json scripts) |
| Config file | See Wave 0 — no vitest.config found, likely `vite.config.ts` serves as config |
| Quick run command | `pnpm test --run` |
| Full suite command | `pnpm test --run --reporter=verbose` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCHM-01 | v10 migration adds 3 tables without corrupting v9 data | unit | `pnpm test --run src/storage/migrations/v10.test.ts` | Wave 0 |
| SCHM-01 | gateActivationLog has compound indexes [predicateName+timestamp] and [atomId+timestamp] | unit | `pnpm test --run src/storage/migrations/v10.test.ts` | Wave 0 |
| BTYPE-01 | BinderTypeConfig Zod schema validates GTD config without errors | unit | `pnpm test --run src/config/binder-types/schema.test.ts` | Wave 0 |
| BTYPE-01 | getBinderConfig('gtd-personal') returns all new fields (columnSet, predicateConfig, etc.) | unit | `pnpm test --run src/config/binder-types/schema.test.ts` | Wave 0 |
| BTYPE-01 | setActiveBinderConfig override is returned by getBinderConfig() | unit | `pnpm test --run src/config/binder-types/schema.test.ts` | Wave 0 |
| BTYPE-01 | Predicate stubs compile and return GatePredicateResult shape | unit | `pnpm test --run src/ai/context-gate/predicates/*.test.ts` | Wave 0 |
| BTYPE-01 | canActivate() stub in activation-gate.ts returns GateResult shape | unit | `pnpm test --run src/ai/context-gate/activation-gate.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test --run`
- **Per wave merge:** `pnpm test --run --reporter=verbose`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/storage/migrations/v10.test.ts` — covers SCHM-01 migration correctness
- [ ] `src/config/binder-types/schema.test.ts` — covers BTYPE-01 Zod validation + registry API
- [ ] `src/ai/context-gate/activation-gate.test.ts` — covers predicate stub compilation and GateResult shape
- [ ] `src/ai/context-gate/predicates/route-predicate.test.ts` — covers config-reading stub behavior

---

## Sources

### Primary (HIGH confidence)
- Direct codebase reading — `src/storage/db.ts`, `src/storage/migrations/v9.ts` (lines 1-70): Dexie migration pattern
- Direct codebase reading — `src/config/binder-types/index.ts` (lines 1-47): current BinderTypeConfig interface
- Direct codebase reading — `src/types/intelligence.ts` (lines 1-165): Zod v4 pattern, CRDT fields
- Direct codebase reading — `src/ai/tier2/pipeline.ts` (lines 1-134): handler registry pattern (mirrors predicate registry)
- Direct codebase reading — `src/ai/tier2/cognitive-signals.ts` (lines 1-380): COGNITIVE_MODEL_IDS, CompositorRule types
- Direct codebase reading — `src/inference/keyword-patterns.ts` (line 27): current relationship-patterns.json import
- Direct codebase reading — `vite.config.ts`: existing Vite plugin setup (solid, wasm, VitePWA)
- Direct codebase reading — `scripts/harness/harness-types.ts`: harness data model (informs binderTypeConfig table design)

### Secondary (MEDIUM confidence)
- Dexie 4.x documentation pattern: additive-only migrations with `.stores()` + optional `.upgrade()` — consistent with v1-v9 pattern observed in codebase
- Zod v4 subpath import `zod/v4` — confirmed by existing usage in `intelligence.ts` line 18
- Vite plugin `resolveId` + `load` hook pattern — standard Vite plugin API for virtual modules

### Tertiary (LOW confidence)
- None — all findings backed by codebase or established framework patterns

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in use; no new dependencies
- Architecture patterns: HIGH — all patterns derived from existing codebase code, not speculation
- Pitfalls: HIGH for Dexie/Zod pitfalls (directly observable in codebase); MEDIUM for Vite plugin pitfall (derived from Vite docs knowledge)
- Open questions: MEDIUM — these are design choices within known constraints, not unknown unknowns

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable dependencies; Dexie and Zod v4 are not in rapid flux)
