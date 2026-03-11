# Architecture Patterns: v5.0 Entity Intelligence & Knowledge Graph

**Domain:** Entity detection, registry, relationship inference for local-first PWA
**Researched:** 2026-03-10
**Overall confidence:** HIGH (building on well-understood existing architecture)

## Recommended Architecture

### High-Level Overview

v5.0 adds an **Entity Intelligence Layer** between the existing NER/sanitization pipeline and the enrichment/triage consumers. The key insight: the sanitization worker already detects PERSON, LOCATION, ORG entities via DistilBERT NER -- v5.0 repurposes those detections (plus expanded label mapping) to build a persistent entity registry with relationship inference.

```
                        Raw Content
                            |
                    +-------v--------+
                    | Entity Detection|  (T1: expanded NER via existing sanitization worker)
                    | Worker          |  (reuse sanitization-worker.ts, add DETECT_ENTITIES message type)
                    +-------+--------+
                            |
                   DetectedEntity[]
                            |
              +-------------v--------------+
              | Entity Accumulator (T1)     |  NEW: src/ai/entity/accumulator.ts
              | - Dedup, normalize, merge   |
              | - Write to entityRegistry   |
              | - Co-occurrence counting    |
              +-------------+--------------+
                            |
              +-------------v--------------+
              | Relationship Inference (T1) |  NEW: src/ai/entity/relationship-inference.ts
              | - Keyword patterns          |
              | - Co-occurrence evidence    |
              | - Write to entityGraph      |
              +-------------+--------------+
                            |
              +-------------v--------------+
              | Entity Context Provider     |  NEW: src/ai/entity/context-provider.ts
              | - Query entityRegistry      |
              | - Query entityGraph         |
              | - Build context summaries   |
              +----+--------+--------+-----+
                   |        |        |
          +--------v--+ +---v----+ +-v-----------+
          | Enrichment| | Triage | | GTD Reviews |  (existing consumers, modified)
          | Engine    | | Flow   | | & Orb       |
          +-----------+ +--------+ +-------------+
```

### Component Boundaries

| Component | Responsibility | Location | Status | Communicates With |
|-----------|---------------|----------|--------|-------------------|
| **Sanitization Worker** | NER inference (DistilBERT) for PII detection AND entity detection | `src/workers/sanitization-worker.ts` | EXISTS -- extend message protocol | Main thread via postMessage |
| **Entity Detector** | Orchestrate NER calls, merge NER+regex results, map to entity types | `src/ai/entity/detector.ts` | NEW | Sanitization worker, Entity Accumulator |
| **Entity Accumulator** | Dedup entities, persist to entityRegistry, track co-occurrence | `src/ai/entity/accumulator.ts` | NEW | Dexie entityRegistry table, Relationship Inference |
| **Relationship Inference** | Keyword pattern matching, co-occurrence rules, write edges | `src/ai/entity/relationship-inference.ts` | NEW | Entity Accumulator, Dexie entityGraph table |
| **Entity Context Provider** | Query registry + graph, build context summaries for consumers | `src/ai/entity/context-provider.ts` | NEW | Dexie tables, Enrichment Engine, Triage, GTD |
| **Entity Registry** (Dexie) | Persistent entity storage with pseudonym mapping | `src/storage/db.ts` (entityRegistry table) | EXISTS -- extend schema | Entity Accumulator, Context Provider |
| **Entity Graph** (Dexie) | Relationship edges between entities and atoms | `src/storage/db.ts` (entityGraph table) | EXISTS -- extend schema | Relationship Inference, Context Provider |
| **User Correction UI** | Inline entity cards, relationship editing | `src/ui/components/EntityCard.tsx` | NEW | Store, Entity Accumulator |

## Detailed Component Design

### 1. Sanitization Worker Extension (MODIFY EXISTING)

**File:** `src/workers/sanitization-worker.ts`

The sanitization worker already runs DistilBERT NER for PII detection. For v5.0 entity intelligence, we have two options:

**Recommended: Add DETECT_ENTITIES message type to existing sanitization worker.**

The existing worker maps NER labels to PII categories (PERSON, LOCATION, etc.) and discards ORG by mapping it to LOCATION. For entity intelligence, we need the raw NER labels preserved.

```typescript
// NEW message types added to sanitization-worker.ts
type WorkerIncoming =
  | { type: 'SANITIZE'; id: string; text: string }    // existing
  | { type: 'LOAD_NER' }                               // existing
  | { type: 'DETECT_ENTITIES'; id: string; text: string } // NEW: return raw NER entities

// NEW outgoing:
// { type: 'ENTITIES_RESULT'; id: string; entities: RawNEREntity[] }
// { type: 'ENTITIES_ERROR'; id: string; error: string }

interface RawNEREntity {
  text: string;
  label: string;       // raw NER label: PER, LOC, ORG, MISC
  start: number;
  end: number;
  confidence: number;
}
```

**Why reuse the same worker instead of a new one:**
- The NER model is already loaded in memory (~50MB) -- loading a second instance doubles memory for zero benefit
- The existing DistilBERT model (`sanitize-check`) already detects PERSON/LOCATION/ORG -- the same entities v5.0 needs
- Adding a message type is 20 lines of code vs a new worker + model download

**Why NOT use bert-base-NER separately:**
- The project memory mentions `Xenova/bert-base-NER` for entity detection, but the existing `sanitize-check` model already does NER
- If bert-base-NER is specifically needed for better ORG detection or different label granularity, load it in the SAME worker (the worker can manage two pipelines)
- Decision point: benchmark `sanitize-check` vs `bert-base-NER` on entity detection quality before committing to a second model

### 2. Entity Detector (NEW)

**File:** `src/ai/entity/detector.ts`

Thin orchestration layer on the main thread that:
1. Sends content to the sanitization worker via `DETECT_ENTITIES`
2. Receives raw NER entities
3. Maps NER labels to v5.0 entity types (PERSON, PLACE, ORGANIZATION -- distinct from PII categories)
4. Returns typed entities for the accumulator

```typescript
// Entity types for the knowledge graph (distinct from PII EntityCategory)
export type KnowledgeEntityType = 'person' | 'place' | 'organization' | 'date' | 'topic';

export interface KnowledgeEntity {
  text: string;
  normalizedText: string;       // lowercase, trimmed
  type: KnowledgeEntityType;
  confidence: number;
  sourceAtomId?: string;        // which atom/inbox item this came from
  sourceOffset: { start: number; end: number };
}
```

**Pure module pattern** -- no store imports. Same convention as sanitizer.ts.

### 3. Entity Accumulator (NEW)

**File:** `src/ai/entity/accumulator.ts`

Manages the lifecycle of detected entities:

1. **Deduplication:** Normalize text, check `entityRegistry` for existing entry
2. **Merge:** If entity exists, increment `lastSeenAt` and co-occurrence count
3. **Create:** If new, assign ID and persist to `entityRegistry`
4. **Co-occurrence tracking:** When two entities appear in the same atom, record the co-occurrence in a map

**Key design decision: Extend EntityRegistryEntry, don't replace it.**

The existing `EntityRegistryEntry` is designed for sanitization pseudonyms. v5.0 needs additional fields:

```typescript
// Extension to existing EntityRegistryEntry (new Dexie migration v9)
export interface EntityRegistryEntryV2 extends EntityRegistryEntry {
  // NEW fields for entity intelligence
  entityType: KnowledgeEntityType;     // person, place, organization (separate from PII category)
  occurrenceCount: number;             // how many times seen across all atoms
  sourceAtomIds: string[];             // which atoms mentioned this entity
  aliases: string[];                   // alternative spellings/names detected
  userCorrected: boolean;              // whether user has manually edited this entity
  mergedIntoId?: string;               // if this entity was merged into another
}
```

**Important: backward-compatible migration.** Existing entityRegistry entries (from sanitization) get `entityType` derived from their `category` field. New entries get both fields.

### 4. Relationship Inference Engine (NEW)

**File:** `src/ai/entity/relationship-inference.ts`

T1 deterministic relationship inference from two sources:

**Source A: Keyword patterns (high confidence)**

```typescript
const RELATIONSHIP_KEYWORDS: Record<string, { keywords: string[]; relationship: string }[]> = {
  person: [
    { keywords: ['wife', 'husband', 'spouse', 'married', 'partner'], relationship: 'spouse' },
    { keywords: ['mom', 'dad', 'mother', 'father', 'parent'], relationship: 'parent' },
    { keywords: ['son', 'daughter', 'child', 'kid'], relationship: 'child' },
    { keywords: ['boss', 'manager', 'supervisor', 'director'], relationship: 'manager' },
    { keywords: ['coworker', 'colleague', 'teammate'], relationship: 'colleague' },
    { keywords: ['friend', 'buddy', 'pal'], relationship: 'friend' },
    { keywords: ['doctor', 'dentist', 'therapist', 'attorney', 'lawyer', 'accountant'], relationship: 'professional' },
    { keywords: ['anniversary', 'birthday'], relationship: 'personal' },
  ],
};
```

**Source B: Co-occurrence evidence (lower confidence)**

When entities frequently appear together, infer relationship. Example: "Pam" + "anniversary" in same atom = personal relationship evidence.

```typescript
interface RelationshipEvidence {
  entityA: string;           // entity registry ID
  entityB: string;           // entity registry ID or keyword
  evidenceType: 'keyword' | 'co-occurrence' | 'user-corrected';
  relationship: string;
  confidence: number;
  atomIds: string[];         // supporting evidence
}
```

**Writes to existing `entityGraph` table.** The existing `EntityGraphEntry` schema supports this -- uses `entityType: 'person'`, `relationship: 'spouse'`, `targetValue: entityId`.

### 5. Entity Context Provider (NEW)

**File:** `src/ai/entity/context-provider.ts`

Read-only query layer that builds entity context summaries for downstream consumers:

```typescript
export interface EntityContext {
  /** All entities detected in this atom's content */
  mentionedEntities: Array<{
    id: string;
    text: string;
    type: KnowledgeEntityType;
    relationships: Array<{ targetEntity: string; relationship: string; confidence: number }>;
  }>;
  /** Summary string suitable for injection into prompts */
  contextSummary: string;
  /** Count of entity mentions across all user content */
  entityFrequency: Map<string, number>;
}

/**
 * Build entity context for a piece of content.
 * Used by enrichment engine and triage flow.
 */
export async function buildEntityContext(content: string): Promise<EntityContext>;

/**
 * Get all known relationships for a specific entity.
 * Used by entity card UI.
 */
export async function getEntityRelationships(entityId: string): Promise<EntityGraphEntry[]>;

/**
 * Format entity context as a prompt fragment for T3 cloud requests.
 * Uses pseudonyms from sanitization -- never exposes raw names to cloud.
 */
export async function formatEntityContextForCloud(
  context: EntityContext,
  reverseMap: Map<string, string>,
): Promise<string>;
```

### 6. Integration Points with Existing Components

#### 6A. Triage Flow (MODIFY)

**File:** `src/ai/triage.ts`

Current flow: inbox item -> type classification -> section routing -> user approval.

v5.0 addition: After content arrives, run entity detection in parallel with type classification. Entity context injected into T3 triage prompts.

```typescript
// In triage flow, add entity detection step
async function triageWithEntityContext(inboxItem: InboxItem): Promise<TriageResult> {
  // Run in parallel: entity detection + type classification
  const [entityContext, typeResult] = await Promise.all([
    buildEntityContext(inboxItem.content),
    dispatchTiered({ task: 'classify-type', features: { content: inboxItem.content } }),
  ]);

  // Entity context available for enrichment engine downstream
  return { ...typeResult, entityContext };
}
```

#### 6B. Enrichment Engine (MODIFY)

**File:** `src/ai/enrichment/enrichment-engine.ts`

Add entity context to `TieredFeatures` so enrichment questions can reference known entities:

```typescript
// Extend TieredFeatures with entity context
export interface TieredFeatures {
  // ... existing fields ...
  entityContext?: EntityContext;  // NEW: entities detected in this content
}
```

The enrichment question templates can then generate entity-aware questions:
- "You mentioned [Person]. What's their role in this task?"
- "Is [Place] where this needs to happen?"
- "Does [Organization] need to approve this?"

#### 6C. Tiered Pipeline (MODIFY)

**File:** `src/ai/tier2/types.ts`

Add new task types for entity operations:

```typescript
export type AITaskType =
  | 'classify-type'
  | 'detect-entities'          // NEW: replaces old extract-entities (T1 regex only)
  | 'infer-relationships'     // NEW: T1 keyword + co-occurrence
  | 'entity-aware-enrich'     // NEW: entity-context enrichment questions
  // ... existing types ...
```

#### 6D. Store Extensions (MODIFY)

**File:** `src/ui/signals/store.ts`

Add entity-related state to the store:

```typescript
// New store fields
entityDetectionPending: boolean;
entityContext: EntityContext | null;        // cached for current item
entityCorrectionModal: {
  open: boolean;
  entityId: string | null;
  currentRelationship: string | null;
} | null;
```

**SolidJS gotcha reminder:** Do NOT store callback functions in the store. Entity resolution callbacks must use module-level variables (same pattern as cloud approval).

### 7. Database Schema Changes

**New migration v9** (after existing v8):

```typescript
// src/storage/migrations/v9.ts
export function applyV9Migration(db: BinderDB): void {
  db.version(9).stores({
    // ... all existing tables unchanged ...
    // entityRegistry: add new indexes for entity intelligence queries
    entityRegistry: '&id, [normalizedText+category], category, entityType, [entityType+normalizedText]',
    // entityGraph: add targetEntityId index for relationship queries
    entityGraph: '&id, sourceAtomId, [sourceAtomId+entityType], entityType, relationship, targetValue, [entityType+relationship]',
  });
}
```

**Data migration:** Existing entityRegistry entries (from sanitization) need `entityType` backfilled:
- `category: 'PERSON'` -> `entityType: 'person'`
- `category: 'LOCATION'` -> `entityType: 'place'`
- Others -> `entityType: 'organization'` (conservative default)

## Data Flow

### Entity Detection Flow (on inbox item arrival)

```
1. User captures content -> InboxItem created in Dexie
2. Triage triggers (existing flow)
3. NEW: Entity Detector sends content to sanitization worker (DETECT_ENTITIES)
4. Worker returns RawNEREntity[]
5. Entity Detector maps to KnowledgeEntity[]
6. Entity Accumulator deduplicates, persists to entityRegistry
7. Relationship Inference runs keyword patterns + co-occurrence
8. Results written to entityGraph
9. Entity Context Provider builds context for downstream consumers
```

### Entity Context Injection Flow (enrichment)

```
1. Enrichment wizard opens for inbox item
2. Entity Context Provider queries entityRegistry + entityGraph for content entities
3. EntityContext injected into TieredFeatures
4. Enrichment question templates use entity context for personalized questions
5. User answers may correct entity relationships -> fed back to accumulator
```

### Privacy-Preserving Cloud Flow

```
1. T1/T2 see raw entity names (local-only processing)
2. If T3 cloud needed: Entity Context Provider uses sanitization reverseMap
3. Cloud sees "<Person 1> is mentioned in context of <Location 2>"
4. Response de-pseudonymized before display
```

## Patterns to Follow

### Pattern 1: Pure Module with Dexie Direct Access

**What:** Entity modules import `db` directly for reads/writes, never import store.
**When:** All entity intelligence modules (detector, accumulator, inference, context provider).
**Why:** Matches existing sanitization pattern. Entity data is persistence-layer concern, not UI state.

```typescript
// CORRECT: pure module with db import
import { db } from '../../storage/db';

export async function accumulateEntity(entity: KnowledgeEntity): Promise<void> {
  const existing = await db.entityRegistry
    .where('[normalizedText+category]')
    .equals([entity.normalizedText, mapToCategory(entity.type)])
    .first();
  // ...
}
```

### Pattern 2: Parallel Detection via Existing Worker

**What:** Entity detection reuses the sanitization worker's NER pipeline via a new message type.
**When:** Every time content arrives (triage, manual enrichment, import).
**Why:** Avoids loading a second NER model. Worker already manages pipeline lifecycle.

### Pattern 3: Evidence-Based Confidence

**What:** Relationship inference tracks evidence strength, not binary assertions.
**When:** All relationship writes to entityGraph.
**Why:** Enables progressive confidence building. User corrections override with confidence: 1.0.

```typescript
interface RelationshipWrite {
  relationship: string;
  confidence: number;       // 0.3 for single co-occurrence, 0.7 for keyword, 1.0 for user
  evidenceCount: number;    // how many supporting atoms
  source: 'keyword' | 'co-occurrence' | 'user-corrected';
}
```

### Pattern 4: Entity-Aware Question Generation

**What:** Enrichment templates reference detected entities by name.
**When:** During enrichment wizard question generation.
**Why:** "What's Pam's role?" is more useful than "Who is involved?"

## Anti-Patterns to Avoid

### Anti-Pattern 1: Separate NER Worker for Entity Detection

**What:** Creating a new worker that loads bert-base-NER separately from the sanitization worker.
**Why bad:** Doubles memory (~100MB total for two NER models). Both models detect the same entity types.
**Instead:** Extend existing sanitization worker with `DETECT_ENTITIES` message. If bert-base-NER is needed for better quality, swap the model, don't add a second worker.

### Anti-Pattern 2: Entity State in SolidJS Store

**What:** Storing the full entity registry or graph in the reactive store.
**Why bad:** Entity data can grow large (thousands of entries over time). SolidJS proxy overhead on large objects causes performance degradation.
**Instead:** Query Dexie directly from entity modules. Cache only the current item's `EntityContext` in store (small, bounded).

### Anti-Pattern 3: Synchronous Entity Detection Blocking Triage

**What:** Awaiting entity detection before proceeding with type classification.
**Why bad:** NER inference takes 50-200ms per item. Type classification (ONNX) takes 20-50ms. Serial execution doubles latency.
**Instead:** Run entity detection and type classification in parallel. They use different workers (sanitization vs embedding).

### Anti-Pattern 4: Neo4j-Style Graph Database

**What:** Using a full graph database for entity relationships.
**Why bad:** Browser environment, no server. IndexedDB via Dexie is the only option.
**Instead:** Two flat tables (entityRegistry + entityGraph) with indexed compound queries. The existing entityGraph table schema already supports this.

### Anti-Pattern 5: Eager Entity Detection on All Historical Atoms

**What:** On first v5.0 load, scanning all existing atoms for entities.
**Why bad:** Could take minutes on large datasets. Blocks UI.
**Instead:** Detect entities lazily -- when atoms are viewed, triaged, or enriched. Offer optional "Scan Library" action that processes in background batches.

## New vs Modified Components Summary

### New Components (create from scratch)

| Component | File | Purpose |
|-----------|------|---------|
| Entity Detector | `src/ai/entity/detector.ts` | Orchestrate NER calls, map labels |
| Entity Accumulator | `src/ai/entity/accumulator.ts` | Dedup, persist, co-occurrence |
| Relationship Inference | `src/ai/entity/relationship-inference.ts` | Keyword + co-occurrence rules |
| Entity Context Provider | `src/ai/entity/context-provider.ts` | Query layer for consumers |
| Entity Card UI | `src/ui/components/EntityCard.tsx` | User correction interface |
| Entity Panel UI | `src/ui/components/EntityPanel.tsx` | Entity list/browse view |
| DB Migration v9 | `src/storage/migrations/v9.ts` | Schema extensions |
| Entity types | `src/ai/entity/types.ts` | Shared type definitions |

### Modified Components (extend existing)

| Component | File | What Changes |
|-----------|------|-------------|
| Sanitization Worker | `src/workers/sanitization-worker.ts` | Add `DETECT_ENTITIES` message handler |
| Sanitizer | `src/ai/sanitization/sanitizer.ts` | Add `detectEntitiesForKnowledgeGraph()` public API |
| Tier 2 Types | `src/ai/tier2/types.ts` | Add entity-related task types to `AITaskType` |
| Tiered Features | `src/ai/tier2/types.ts` | Add `entityContext` to `TieredFeatures` |
| Tiered Result | `src/ai/tier2/types.ts` | Add entity-related result fields |
| Enrichment Engine | `src/ai/enrichment/enrichment-engine.ts` | Inject entity context into question generation |
| Question Templates | `src/ai/clarification/question-templates.ts` | Entity-aware question variants |
| Store | `src/ui/signals/store.ts` | Entity state fields, correction modal |
| Triage | `src/ai/triage.ts` | Parallel entity detection in triage flow |
| Entity Registry | `src/ai/sanitization/entity-registry.ts` | Add entity intelligence fields |

### Unchanged Components (no modifications needed)

| Component | Why Unchanged |
|-----------|--------------|
| Embedding Worker | Entity detection uses sanitization worker, not embedding worker |
| LLM Worker | Entity detection is T1/T2 only, no LLM calls needed |
| Pipeline (pipeline.ts) | Escalation logic unchanged, new task types auto-routed |
| Cognitive Signals | Entity intelligence is orthogonal to cognitive ONNX models |
| WASM Scoring Engine | Entity intelligence doesn't affect entropy/priority scoring |

## Suggested Build Order

Build order follows dependency chains -- each phase produces something testable.

### Phase 1: Foundation (entity types + DB migration + worker extension)
**Dependencies:** None (builds on existing schema)
**Deliverables:**
1. `src/ai/entity/types.ts` -- KnowledgeEntity, KnowledgeEntityType, EntityContext types
2. `src/storage/migrations/v9.ts` -- schema extensions with new indexes
3. `src/workers/sanitization-worker.ts` -- add `DETECT_ENTITIES` handler (reuse existing NER pipeline)
4. `src/ai/sanitization/sanitizer.ts` -- add `detectEntitiesForKnowledgeGraph()` public API

**Rationale:** Types and DB schema must exist before anything can read/write entities. Worker extension is the data source for everything downstream.

### Phase 2: Entity Accumulator + Detector
**Dependencies:** Phase 1 (types, migration, worker)
**Deliverables:**
1. `src/ai/entity/detector.ts` -- orchestrate worker calls, map NER labels to KnowledgeEntity
2. `src/ai/entity/accumulator.ts` -- dedup, normalize, persist to entityRegistry, co-occurrence tracking

**Rationale:** These two modules form the "write path" -- entities go in. Must work before inference or queries.

### Phase 3: Relationship Inference
**Dependencies:** Phase 2 (accumulator providing entities)
**Deliverables:**
1. `src/ai/entity/relationship-inference.ts` -- keyword pattern matching, co-occurrence rules
2. Wire into accumulator: after entity accumulation, trigger relationship inference

**Rationale:** Relationship inference reads from entityRegistry and writes to entityGraph. Needs accumulated entities to have meaningful data.

### Phase 4: Entity Context Provider + Triage Integration
**Dependencies:** Phase 3 (relationships in graph)
**Deliverables:**
1. `src/ai/entity/context-provider.ts` -- query layer, context building
2. Modify `src/ai/triage.ts` -- parallel entity detection during triage
3. Extend `TieredFeatures` with `entityContext`

**Rationale:** Context provider is the "read path" -- entity intelligence becomes consumable by other systems. Triage is the natural first consumer because every inbox item passes through it.

### Phase 5: Enrichment Integration
**Dependencies:** Phase 4 (entity context available)
**Deliverables:**
1. Modify enrichment-engine.ts -- accept entityContext, pass to question templates
2. Modify question-templates.ts -- entity-aware question variants
3. Entity-aware T2B handlers if applicable

**Rationale:** Enrichment is the highest-value consumer of entity context. "What's Pam's role in this?" vs "Who is involved?"

### Phase 6: User Correction UX
**Dependencies:** Phase 4 (entities visible/queryable)
**Deliverables:**
1. `src/ui/components/EntityCard.tsx` -- inline entity display with edit
2. `src/ui/components/EntityPanel.tsx` -- entity browse/search
3. Store extensions for entity correction modal
4. Correction feedback loop to accumulator (user corrections = confidence: 1.0)

**Rationale:** UX is built last because the entity data pipeline must be working and populated before corrections make sense. User corrections feed back into the accumulator as ground truth.

### Phase 7: Polish + Background Scan
**Dependencies:** All phases
**Deliverables:**
1. Background entity scan for existing atoms (batch processing)
2. Entity count badges/indicators in UI
3. Entity-aware GTD review prompts
4. Performance optimization (batch Dexie reads, caching)

## Scalability Considerations

| Concern | At 100 atoms | At 1K atoms | At 10K atoms |
|---------|-------------|-------------|--------------|
| Entity registry size | ~50 entities, instant queries | ~500 entities, <10ms queries | ~2000 entities, index scan <50ms |
| EntityGraph edges | ~100 edges, trivial | ~2K edges, compound index fine | ~20K edges, may need pagination |
| NER inference per item | 50-200ms, acceptable | Same per-item, background scan batched | Same per-item, lazy detection essential |
| Memory (NER model) | ~50MB (already loaded for sanitization) | Same | Same |
| Co-occurrence matrix | In-memory OK | In-memory OK | Persist to Dexie, query on demand |

## Sources

- Existing codebase analysis (HIGH confidence -- direct code reading)
- `src/workers/sanitization-worker.ts` -- NER worker architecture
- `src/ai/sanitization/` -- entity registry and sanitizer patterns
- `src/storage/entity-graph.ts` -- existing entity graph schema
- `src/ai/tier2/` -- tiered pipeline architecture
- `src/ai/enrichment/` -- enrichment engine integration points
- Project memory MEMORY.md -- v5.0 vision and constraints
