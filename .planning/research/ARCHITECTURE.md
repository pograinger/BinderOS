# Architecture Research

**Domain:** Cortical Intelligence Integration — BinderOS v5.5
**Researched:** 2026-03-12
**Confidence:** HIGH (based on full codebase inspection)

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                       Main Thread (SolidJS UI)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────────────┐ │
│  │  Route/View  │  │  AIOrb +     │  │  Context Gate Evaluator     │ │
│  │  (signals    │  │  Enrichment  │  │  NEW: pure function,         │ │
│  │  reactive)   │  │  Wizard      │  │  reads existing signals      │ │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬────────────────┘ │
│         │                 │                        │                  │
│         └─────────────────┴──────────── signals ───┘                  │
│                           │ postMessage bridge                        │
└───────────────────────────┼───────────────────────────────────────────┘
                            │
┌───────────────────────────┼───────────────────────────────────────────┐
│              Embedding Worker  (src/search/embedding-worker.ts)        │
│                                                                        │
│  ┌─────────────────┐  ┌──────────────────┐  ┌──────────────────────┐  │
│  │  MiniLM         │  │  Type / GTD /     │  │  Cognitive Army      │  │
│  │  (embeddings)   │  │  Decomp / Gate    │  │  10 ONNX models +    │  │
│  │                 │  │  classifiers      │  │  NEW: Sequence model  │  │
│  └─────────────────┘  └──────────────────┘  └──────────────────────┘  │
│           shared ORT session pool — single worker, single ORT instance  │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│              Tiered Pipeline  (src/ai/tier2/)                           │
│                                                                         │
│  T1 Handler --> T2 Handler --> T2B Handler --> T3 Handler              │
│  (deterministic) (ONNX)        (LLM-lite)      (WebLLM/Cloud)          │
│                                                                         │
│  NEW: ActivationGate wraps handler iteration in dispatchTiered()       │
│  NEW: TieredFeatures.sequenceContext fed from embedding worker          │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│              Intelligence Layer (Dexie + pure modules)                  │
│                                                                         │
│  atomIntelligence   entity   entityRelation   config                   │
│  (sidecar)          (NER)    (edges)          (BinderTypeConfig JSON)   │
│                                                                         │
│  NEW: sequenceContext table  (ring buffer of last-N embeddings)         │
│  NEW: predictionCache table  (scored prediction results with TTL)       │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│              Headless Harness  (scripts/harness/, Node-only)            │
│                                                                         │
│  adversarial-cycle --> harness-pipeline --> harness-inference           │
│  ablation-engine   --> (reuses corpora, no new API calls)               │
│                                                                         │
│  NEW: harness-binder-type-sdk.ts  (per-type training entry point)       │
│  NEW: scripts/train/sequence/     (LSTM training pipeline)              │
└────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| Context Gate Evaluator | Compute activation predicate for current session context | Pure TS function in `src/ai/context-gate/` — no worker, no store import |
| ActivationGate | Wrap handler iteration in `dispatchTiered()` to filter by session context | Inline filter in `pipeline.ts`; TierHandler interface unchanged |
| Sequence Model (ONNX) | Produce 64-dim context vector from last-N atom embeddings | New `ClassifierConfig` entry in embedding worker; trained offline via Python |
| SequenceContext ring buffer | Persist last-N embeddings per binder to Dexie | New `sequenceContext` table; written after each classification |
| PredictiveEnrichmentScorer | Score entity graph trajectory + composite signals to rank "next need" | Pure async module in `src/ai/prediction/`; reads atomIntelligence + entity tables |
| BinderTypeConfig (extended) | Define agent column set, activation predicate IDs, harness persona paths | Extend existing JSON schema + TypeScript loader in `src/config/binder-types/` |
| Harness SDK | Allow custom binder type training via JSON config + persona | New `scripts/harness/harness-binder-type-sdk.ts` wrapping existing pipeline |

## Recommended Project Structure

```
src/
├── ai/
│   ├── tier2/                    # EXISTING — tiered pipeline
│   │   ├── pipeline.ts           # MODIFY — add ActivationGate filter before handler loop
│   │   ├── types.ts              # MODIFY — add SessionContext + sequenceContext to TieredFeatures
│   │   └── handler.ts            # UNCHANGED — TierHandler interface stays clean
│   ├── context-gate/             # NEW
│   │   ├── types.ts              # ActivationPredicate interface, SessionContext type
│   │   ├── evaluator.ts          # evaluateActivation(handlerName, context) — pure function
│   │   └── predicates/           # Per-dimension predicate implementations
│   │       ├── route-predicate.ts
│   │       ├── time-predicate.ts
│   │       ├── binder-type-predicate.ts
│   │       └── atom-history-predicate.ts
│   ├── prediction/               # NEW
│   │   ├── types.ts              # PredictionResult, ScoredNeed interfaces
│   │   ├── trajectory-scorer.ts  # Entity graph trajectory -> ranked needs
│   │   └── signal-scorer.ts      # Composite signal patterns -> ranked needs
│   └── enrichment/               # EXISTING — minor modification only
│       └── enrichment-engine.ts  # MODIFY — consume prediction output for question ordering
├── config/
│   └── binder-types/             # EXISTING
│       ├── index.ts              # MODIFY — add activationPredicates, modelColumns fields
│       └── gtd-personal.json     # MODIFY — add activation rules, column set, harness personas
├── search/
│   └── embedding-worker.ts       # MODIFY — add SEQUENCE_CONTEXT/SEQUENCE_RESULT message types
├── storage/
│   └── db.ts                     # MODIFY — v10 migration: sequenceContext + predictionCache tables
└── types/
    └── intelligence.ts           # MODIFY — add SequenceContext, PredictionResult types

scripts/
├── harness/                      # EXISTING
│   └── harness-binder-type-sdk.ts  # NEW — SDK entry for custom type training
└── train/
    └── sequence/                 # NEW
        ├── generate-sequence-corpus.py   # (embedding_sequence, next_atom_type) pairs
        ├── train-sequence-model.py       # Train tiny LSTM/attention head
        └── export-sequence-onnx.py       # Export to sequence-context.onnx
```

### Structure Rationale

- **ai/context-gate/:** Isolated new module with zero coupling to existing handlers. Predicates are pure functions receiving a `SessionContext` bag. The `TierHandler` interface requires no changes.
- **ai/prediction/:** Scoring over data already in Dexie — no new ONNX model. Reads `atomIntelligence` and entity tables via pure async Dexie reads.
- **config/binder-types/:** JSON-first approach validated by v5.0. Extending the schema costs one interface change and two JSON keys. Predicate IDs in JSON are resolved to TypeScript functions at module load (keeps JSON serializable).
- **storage/db.ts v10 migration:** New tables follow the established pattern — never mutate a prior version definition. `sequenceContext` capped at N=10 per binder; `predictionCache` has TTL expiry field.
- **scripts/train/sequence/:** Co-located with existing Python training scripts. Sequence model trained on harness corpus, exported to ONNX, served from `public/models/classifiers/`.

## Architectural Patterns

### Pattern 1: Activation Predicate as a Pre-Loop Filter (Context Gating)

**What:** Context gating does not modify `canHandle()` on existing handlers. Instead, `dispatchTiered()` gains a pre-loop filter that evaluates activation predicates before iterating handlers.

**When to use:** Any time a handler's relevance depends on session state (route, binder type, time of day, recent atom history) rather than the task type alone.

**Trade-offs:** Keeps handler implementations pure (they never know about session state). Predicate evaluation adds negligible CPU overhead (pure comparison logic). The downside: predicates must be defined separately from handlers and kept in sync via the BinderTypeConfig registry.

**Integration point:** `dispatchTiered()` gains an optional `context?: SessionContext` field on `TieredRequest`. When present, a pre-loop filter runs. When absent (harness, tests), all handlers remain active — fully backwards-compatible.

```typescript
// In dispatchTiered() — new filter step before the existing handler loop:
const ctx = request.context;
const activeHandlers = ctx
  ? handlers.filter(h => evaluateActivation(h.name, ctx))
  : handlers;
// Then iterate activeHandlers instead of handlers
```

### Pattern 2: Sequence Context as an Additional Input Signal

**What:** The sequence model produces a 64-dim context vector from the last-N atom embeddings. This vector is appended to `TieredFeatures` before `dispatchTiered()` is called. The T2 handler concatenates it with the MiniLM embedding when feeding ONNX classifiers.

**When to use:** Only when sufficient atom history exists (N >= 3 cached embeddings). Falls back to embedding-only when history is absent or the sequence model fails to load — same graceful degradation pattern as all existing ONNX classifiers.

**Trade-offs:** Adds one worker round-trip (SEQUENCE_CONTEXT message) before task dispatch. On mobile this latency matters — the round-trip should be fired speculatively when the user opens the inbox or enrichment wizard, before they trigger a classification action. Model size must stay under 500KB quantized to avoid OOM on mobile.

**Integration point:** New message types in embedding worker:

```typescript
// Main thread sends:
{ type: 'SEQUENCE_CONTEXT'; id: string; recentEmbeddings: number[][] }
// Worker responds:
{ type: 'SEQUENCE_RESULT'; id: string; contextVector: number[] }
```

`TieredFeatures` gains `sequenceContext?: number[]`. T2 handler reads it when present.

### Pattern 3: Predictive Enrichment as a Scoring Function, Not an Agent

**What:** Prediction is a pure async function over data already in Dexie — no new ONNX model, no timer, no background agent. It reads entity graph trajectory (recency, co-occurrence deltas, confidence changes) and cached composite signals from `atomIntelligence`, then returns a ranked list of `ScoredNeed` objects.

**When to use:** Called lazily when the enrichment wizard opens or the AI orb requests a "what next?" nudge. Results cached in `predictionCache` with a 5-minute TTL.

**Trade-offs:** Correctness depends on the entity graph being populated (requires v5.0 NER). Degrades gracefully to signal-only scoring when entity data is sparse. No training required — it's a deterministic scoring heuristic built from existing data.

**Integration point:** `enrichment-engine.ts` already has `computeSignalRelevance()`. The new scorer extends it:

```typescript
// src/ai/prediction/trajectory-scorer.ts
export async function scorePredictedNeeds(
  atomId: string,
  signals: SignalVector,
  entityMentions: EntityMention[],
): Promise<ScoredNeed[]>
```

The enrichment engine calls this and merges results with existing signal-based ordering.

### Pattern 4: BinderTypeConfig as the Column Protocol

**What:** `BinderTypeConfig` already exists and drives question templates and entity context mappings. v5.5 adds `activationPredicates` (string IDs resolved to TypeScript functions at runtime) and `modelColumns` (ONNX classifier IDs that form this type's T2 column set).

**When to use:** Every new binder type defines these fields. The harness SDK reads `modelColumns` to know which training scripts to run.

**Trade-offs:** String-ID resolution keeps JSON serializable while supporting complex TypeScript predicates. The predicate registry in `src/ai/context-gate/predicates/` is the coupling point — new predicate IDs must be registered before they can be referenced in JSON.

**Extension to existing interface:**

```typescript
export interface BinderTypeConfig {
  // ... existing fields (name, purpose, categoryOrdering, etc.) ...
  /** IDs of context predicates that gate agent activation for this binder type */
  activationPredicates?: string[];
  /** ONNX classifier IDs forming this type's T2 column set */
  modelColumns?: string[];
  /** Harness SDK: relative paths to persona config JSON files for this type */
  harnessSdkPersonas?: string[];
}
```

## Data Flow

### Context Gating Flow (New)

```
User navigates to route / atom created
    |
SessionContext assembled in main thread (pure, no async)
  - route: current SolidJS route signal
  - binderType: active binder type from store
  - timeOfDay: Date.now() bucketed (morning / afternoon / evening)
  - recentAtomHistory: last-N atom type labels from store (in-memory)
    |
dispatchTiered(request with context)
    |
ActivationGate filters handler list
  <- evaluateActivation(handlerName, sessionContext)
  <- resolves predicate IDs via BinderTypeConfig.activationPredicates
    |
Active handler subset runs existing escalation logic unchanged
```

### Sequence Learning Flow (New)

```
Atom classified or enriched
    |
Embedding stored to sequenceContext ring buffer in Dexie
(capped at N=10 per binder; oldest evicted when full)
    |
Next classification request triggered:
  main thread sends SEQUENCE_CONTEXT message to embedding worker
  (fires speculatively — does not block user action)
    |
  Embedding worker reads last-N embeddings from message payload
  Sequence ONNX model produces 64-dim context vector
  Worker sends SEQUENCE_RESULT back
    |
  contextVector appended to TieredFeatures.sequenceContext
    |
T2 handler concatenates context vector with MiniLM embedding
before ONNX classifier inference
    |
Classification result returned — sequence context influenced output
```

### Predictive Enrichment Flow (New)

```
User opens enrichment wizard for atom X
    |
enrichment-engine.ts calls scorePredictedNeeds(atomId, signals, mentions)
    |
Check predictionCache (Dexie) — return cached result if TTL not expired
    |
If cache miss:
  trajectory-scorer reads:
    - entity table: entity recency, mention count delta over last K atoms
    - entityRelation table: confidence trajectory changes since last scan
    - atomIntelligence.cognitiveSignals: cached composite signal vector
    |
  Returns ranked ScoredNeed[] — "likely next need: outcome context"
  Result written to predictionCache with 5-minute TTL
    |
Merged with computeSignalRelevance() output in enrichment-engine.ts
    |
Question category ordering updated — highest predicted need surfaces first
```

### Harness SDK Flow (New — Offline Only)

```
Developer authors new-type.json (BinderTypeConfig)
    |
Developer writes persona profile JSON targeting new binder type
    |
node scripts/harness/harness-binder-type-sdk.ts --type new-type
    |
SDK reads BinderTypeConfig.modelColumns + .harnessSdkPersonas
  Runs adversarial-cycle.ts pipeline with custom corpus
  Runs ablation-engine.ts against custom type's column set
    |
Reports written to scripts/harness/personas/{persona}/reports/
Gap analysis highlights which model columns are undertrained
```

### State Management

```
Dexie (IndexedDB) — persistent
  atoms              <- user content (never touched by AI directly)
  atomIntelligence   <- sidecar: enrichment Q&A, entity mentions, cognitive signals
  entity             <- NER registry
  entityRelation     <- typed edges with confidence
  sequenceContext    <- NEW: ring buffer of recent embeddings (per binder, N=10 max)
  predictionCache    <- NEW: scored prediction results with TTL expiry field
  config             <- BinderTypeConfig slug + settings

SolidJS store — ephemeral reactive state
  Route signal       -> contributes to SessionContext.route
  Active binder type -> contributes to SessionContext.binderType
  Last-N atom labels -> contributes to SessionContext.recentAtomHistory
  (SessionContext itself is never written to Dexie — ephemeral only)
```

## Scaling Considerations

This is a local-first single-device application. Scaling means "growing atom count and agent count without degrading UX responsiveness."

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-500 atoms | All features work as specified; sequence context becomes meaningful after ~10 atoms |
| 500-2000 atoms | sequenceContext ring buffer stays capped at N=10 — no growth. predictionCache TTL prevents stale reads. Entity queries remain sub-10ms via Dexie compound indexes |
| 2000+ atoms | Prediction scorer caps entity trajectory reads at 50 most-recent atom IDs. Co-occurrence Map compaction already handled by existing periodic flush mechanism |

### Scaling Priorities

1. **First bottleneck:** Sequence model inference latency on mobile. The 64-dim model must stay under 50ms on a mid-range phone. Achieved by keeping model size under 500KB quantized and firing SEQUENCE_CONTEXT speculatively before the user triggers classification.

2. **Second bottleneck:** Predictive scorer reading too many Dexie rows on large datasets. Mitigated by the 5-minute `predictionCache` TTL so the scorer does not re-run on every wizard open, and by capping the entity trajectory window.

## Anti-Patterns

### Anti-Pattern 1: Context Gating Logic Inside canHandle()

**What people do:** Add binder-type or route checks inside existing `canHandle()` implementations (e.g., GTD classifier returns false when binderType != 'gtd-personal').

**Why it's wrong:** Handlers become coupled to session state, violating the pure-module contract that every handler in the codebase follows. It also breaks the harness, which has no session context and expects all handlers active.

**Do this instead:** Keep `canHandle()` pure (task-type check only). All session-state filtering happens in the `ActivationGate` layer inside `dispatchTiered()`. Harness bypasses the gate by passing no `context` on `TieredRequest`.

### Anti-Pattern 2: Training the Sequence Model in the Browser

**What people do:** Attempt to fine-tune the LSTM online using ONNX Runtime Web as the user creates atoms.

**Why it's wrong:** ONNX Runtime Web is inference-only. In-browser retraining is explicitly out of scope per PROJECT.md constraints. It would also require SharedArrayBuffer + COOP headers that complicate the PWA deployment.

**Do this instead:** Train the sequence model offline via `scripts/train/sequence/` on harness-generated atom history corpora. Export to ONNX. Bundle in `public/models/classifiers/`. The harness adversarial cycle provides the training loop.

### Anti-Pattern 3: Persisting SessionContext to Dexie

**What people do:** Write route, time-of-day, and recent atom history to IndexedDB so the context gate can read it asynchronously.

**Why it's wrong:** SessionContext is ephemeral — meaningful only for the current browser session. Persisting it risks stale reads when the app reopens hours or days later, and adds unnecessary write overhead.

**Do this instead:** Assemble SessionContext inline in the main thread from existing SolidJS reactive signals (current route signal, binder type signal, `Date.now()` for time-of-day buckets, and a shallow signal over the last N atom type labels). Pass it as a plain object in `TieredRequest.context` — never write it to Dexie.

### Anti-Pattern 4: A Centralized Prediction Agent on a Timer

**What people do:** Create a background orchestrator that runs on a `setInterval`, scores all atoms, and writes recommendations to the store proactively.

**Why it's wrong:** Violates the emergent / no-conductor architecture principle from the project memory. A timer-based agent creates I/O contention with NER and enrichment work. It also becomes a maintenance burden as binder types grow.

**Do this instead:** Prediction is called lazily — only when the enrichment wizard opens or the AI orb explicitly requests a "what next?" nudge. Cache results in `predictionCache` with a TTL. The harness EVS (Enrichment Value Score) already provides feedback on prediction quality without requiring a live agent.

### Anti-Pattern 5: A Fourth Worker for Sequence Inference

**What people do:** Add a dedicated sequence worker separate from the embedding worker to avoid touching the complex embedding-worker.ts.

**Why it's wrong:** The embedding worker already manages the ONNX Runtime session pool and all model caching. A fourth worker means two ORT instances, risking OOM on mobile — the exact pitfall that caused the decision to reuse the sanitization worker for NER in v5.0. It also splits the model download/caching logic.

**Do this instead:** Add `SEQUENCE_CONTEXT` / `SEQUENCE_RESULT` as new message types in the existing embedding worker. The sequence model is another `ClassifierConfig` entry in the worker's existing registry, loaded lazily on first use via `fetchWithCache`.

## Integration Points

### New vs Modified Components

| Component | Status | Files |
|-----------|--------|-------|
| Context Gate Evaluator | **NEW** | `src/ai/context-gate/` (new directory) |
| ActivationGate filter in pipeline | **MODIFY** | `src/ai/tier2/pipeline.ts` |
| SessionContext field on TieredRequest | **MODIFY** | `src/ai/tier2/types.ts` |
| sequenceContext field on TieredFeatures | **MODIFY** | `src/ai/tier2/types.ts` |
| SEQUENCE_CONTEXT/RESULT messages | **MODIFY** | `src/search/embedding-worker.ts` |
| Sequence ONNX model (ClassifierConfig) | **MODIFY** | `src/search/embedding-worker.ts` |
| sequenceContext + predictionCache tables | **MODIFY** | `src/storage/db.ts` (v10 migration) |
| SequenceContext + PredictionResult types | **MODIFY** | `src/types/intelligence.ts` |
| PredictiveEnrichmentScorer | **NEW** | `src/ai/prediction/` (new directory) |
| Enrichment engine question ordering | **MODIFY** | `src/ai/enrichment/enrichment-engine.ts` |
| BinderTypeConfig interface + gtd-personal.json | **MODIFY** | `src/config/binder-types/index.ts` + `gtd-personal.json` |
| Harness SDK | **NEW** | `scripts/harness/harness-binder-type-sdk.ts` |
| Sequence training scripts | **NEW** | `scripts/train/sequence/*.py` |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Main thread -> Embedding worker (sequence) | postMessage: SEQUENCE_CONTEXT / SEQUENCE_RESULT | Same pattern as existing CLASSIFY_ONNX / ONNX_RESULT |
| context-gate <-> tier2/pipeline | Direct import: `evaluateActivation(handlerName, context)` | Pure synchronous function — no async, no worker round-trip |
| ai/prediction <-> enrichment-engine | Direct import: `scorePredictedNeeds(atomId, signals, mentions)` | Async Dexie reads; called only when wizard opens |
| BinderTypeConfig <-> context-gate predicates | String ID resolved via predicate registry at module load | Keeps JSON config serializable; predicates are TypeScript functions registered on startup |
| Harness SDK <-> existing harness pipeline | Direct import of `runAdversarialCycle`, `scoreEntityGraph`, `AblationEngine` | No new harness infrastructure needed — SDK is a thin orchestration wrapper |

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| ONNX Runtime Web | Sequence model added as a ClassifierConfig in existing worker | Uses same `fetchWithCache` + lazy load pattern; no new ORT instance created |
| Dexie (IndexedDB) | v10 migration adds 2 new tables | Follow existing migration pattern exactly; never modify prior version definitions |
| Python training pipeline | New `scripts/train/sequence/` scripts | Sequence corpus generated from harness persona atom history; follows existing train/ conventions |

## Suggested Build Order

Dependencies determine order. Each step unblocks the next. Steps 3 and 4 are independent and can proceed in parallel once steps 1 and 2 are complete.

**Step 1 — Schema extension (v10 migration)**
Add Dexie tables `sequenceContext` + `predictionCache`. Extend `intelligence.ts` types. Add `activationPredicates`, `modelColumns`, `harnessSdkPersonas` to `BinderTypeConfig` interface and `gtd-personal.json`. No logic yet — just the schema contracts. Unblocks all subsequent steps.

**Step 2 — Context Gate Evaluator**
Build `src/ai/context-gate/` with the four predicate dimensions (route, time, binder type, atom history). Add `ActivationGate` filter to `pipeline.ts`. Fully unit-testable without ONNX infrastructure. Add `SessionContext` to `TieredRequest`. This is the lowest-risk step and proves the predicate protocol before the sequence model work.

**Step 3 — Predictive Enrichment Scorer** (parallel with step 4)
Build `src/ai/prediction/`. Wire into `enrichment-engine.ts` question ordering. Validates that v5.0 entity and signal data is populated correctly and surfaceable. No new ONNX model needed — pure Dexie reads.

**Step 4 — Sequence Context** (parallel with step 3)
Add `SEQUENCE_CONTEXT` message to embedding worker. Build sequence training pipeline (`scripts/train/sequence/`). Train on harness corpus, export ONNX, serve from `public/models/classifiers/`. Wire `sequenceContext` into `TieredFeatures` and T2 handler concatenation. This is the highest-risk step (new model, new training pipeline) — do it after the lower-risk steps are proven.

**Step 5 — Harness SDK**
Build `scripts/harness/harness-binder-type-sdk.ts` as a thin wrapper over the existing pipeline. Run a hypothetical second binder type through the full adversarial cycle to validate that the BinderTypeConfig protocol is complete. This step doubles as an integration test for everything built in steps 1-4.

## Sources

- `src/ai/tier2/pipeline.ts` — handler registry, `dispatchTiered()`, escalation loop (inspected)
- `src/ai/tier2/handler.ts` — `TierHandler` interface contract (inspected)
- `src/ai/tier2/types.ts` — `TieredFeatures`, `TieredRequest`, `AITaskType` definitions (inspected)
- `src/ai/tier2/cognitive-signals.ts` — `SignalVector`, `CognitiveSignal`, compositor rules (inspected)
- `src/ai/enrichment/enrichment-engine.ts` — `computeSignalRelevance()`, enrichment session state machine (inspected)
- `src/config/binder-types/index.ts` — existing `BinderTypeConfig` interface and JSON loader (inspected)
- `src/search/embedding-worker.ts` — `ClassifierConfig` pattern, `fetchWithCache`, ORT session management (inspected)
- `src/types/intelligence.ts` — `AtomIntelligence`, `Entity`, `EntityRelation` schema (inspected)
- `src/storage/db.ts` — Dexie migration pattern (v1-v9) (inspected)
- `src/inference/relationship-inference.ts` — fire-and-forget pattern, pure module contract (inspected)
- `src/entity/entity-detector.ts` — NER -> registry -> sidecar orchestration pattern (inspected)
- `scripts/harness/harness-types.ts` — `CycleState`, `AblationConfig`, harness pipeline types (inspected)
- `scripts/harness/harness-pipeline.ts` — headless pipeline structure (inspected)
- `scripts/harness/ablation-engine.ts` — ablation framework, `ComponentRanking` types (inspected)

---
*Architecture research for: BinderOS v5.5 Cortical Intelligence*
*Researched: 2026-03-12*
