# Technology Stack: v5.0 Entity Intelligence & Knowledge Graph

**Project:** BinderOS v5.0
**Researched:** 2026-03-10
**Scope:** Additions/changes needed for entity intelligence features only

## Executive Summary

v5.0 requires NO new package dependencies. The existing stack -- `@huggingface/transformers` (3.8.1), `dexie` (4.3.0), and `onnxruntime-web` (1.24.2) -- already provides everything needed. The primary work is:

1. **A new NER model** (Xenova/bert-base-NER) loaded in a new worker for entity extraction (distinct from the sanitization NER which uses a custom fine-tuned model)
2. **Two new Dexie tables** (Entity + Relation) via a v9 migration
3. **Co-occurrence counting** via in-memory accumulation with Dexie-backed persistence
4. **No new workers required** -- the entity NER pipeline can share the sanitization worker or use a dedicated one

## Recommended Stack Additions

### NER Model for Entity Extraction

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Xenova/bert-base-NER | q8 quantized | Extract PER, LOC, ORG, MISC entities from raw content | Pre-trained on CoNLL-2003, 343K+ monthly downloads, already compatible with `@huggingface/transformers` v3. Quantized ONNX available. Well-tested with `pipeline('token-classification')`. |

**Confidence:** HIGH -- verified on HuggingFace, same `pipeline()` API as existing MiniLM and sanitization models.

**Critical distinction from sanitization NER:**

| Aspect | Sanitization NER (Phase 14) | Entity Intelligence NER (v5.0) |
|--------|----------------------------|-------------------------------|
| Model | `sanitization/sanitize-check` (custom fine-tuned DistilBERT) | `Xenova/bert-base-NER` (pre-trained dslim/bert-base-NER) |
| Purpose | Detect PII to redact before cloud sends | Detect people/places/orgs to build knowledge graph |
| Entity categories | PERSON, LOCATION, FINANCIAL, CONTACT, CREDENTIAL | PER, LOC, ORG, MISC |
| Sees raw content | Yes (local worker) | Yes (local worker, T1 agent) |
| Output destination | Pseudonym maps for sanitization | Entity registry for knowledge accumulation |
| When it runs | Before every cloud AI request | On every new inbox item / atom creation |

**Model download:** Add to existing `scripts/download-model.cjs` script. Files go to `public/models/Xenova/bert-base-NER/`. Quantized q8 variant is ~110MB uncompressed (similar to MiniLM). Cache API persistence follows the established pattern.

**Why NOT a smaller model like NeuroBERT-NER:** NeuroBERT is designed for edge/IoT with reduced accuracy. bert-base-NER is the standard choice -- well-tested, well-documented, and the size (~110MB q8) is comparable to models already loaded (MiniLM is ~90MB). The accuracy difference matters for entity intelligence where false positives/negatives directly degrade the knowledge graph.

### Database Schema: Entity + Relation Tables

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Dexie v9 migration | Dexie 4.3.0 (existing) | Two new tables: `entities` and `entityRelations` | Follows established migration pattern (v1-v8 already exist). No new dependencies. CRDT-friendly schema with Lamport timestamps. |

**v9 Migration schema:**

```typescript
// New table: entities -- canonical entity registry for knowledge graph
// Distinct from entityRegistry (Phase 14) which is for sanitization pseudonyms
entities: '&id, normalizedName, type, *atomIds, updatedAt'

// New table: entityRelations -- typed edges between entities
entityRelations: '&id, [sourceEntityId+targetEntityId], sourceEntityId, targetEntityId, type, confidence, updatedAt'
```

**Entity table design:**

```typescript
export interface KnowledgeEntity {
  /** UUID */
  id: string;
  /** Display name (original casing, e.g., "Pam") */
  displayName: string;
  /** Lowercase trimmed for dedup (e.g., "pam") */
  normalizedName: string;
  /** Entity type from NER: 'person' | 'location' | 'organization' | 'misc' */
  type: 'person' | 'location' | 'organization' | 'misc';
  /** All atom IDs where this entity has been detected -- multi-entry index */
  atomIds: string[];
  /** Total mention count across all atoms */
  mentionCount: number;
  /** User-provided corrections (e.g., { role: 'wife', displayName: 'Pamela' }) */
  userMetadata: Record<string, string>;
  /** Whether user has verified/corrected this entity */
  userVerified: boolean;
  /** For CRDT: Lamport timestamp */
  lamportClock: number;
  createdAt: number;
  updatedAt: number;
}
```

**EntityRelation table design:**

```typescript
export interface EntityRelation {
  /** UUID */
  id: string;
  /** Source entity ID */
  sourceEntityId: string;
  /** Target entity ID (or empty for self-referential metadata like "role: wife") */
  targetEntityId: string;
  /** Relationship type: 'spouse' | 'colleague' | 'family' | 'friend' | 'employer' | 'located-in' | 'member-of' | 'co-occurs' | 'custom' */
  type: string;
  /** User-readable label (e.g., "wife", "boss at Acme Corp") */
  label: string;
  /** Confidence 0-1: keyword inference starts ~0.7, user correction sets to 1.0 */
  confidence: number;
  /** Evidence sources that support this relationship */
  evidence: RelationEvidence[];
  /** 'inferred' | 'user-corrected' | 'co-occurrence' */
  source: 'inferred' | 'user-corrected' | 'co-occurrence';
  /** For CRDT */
  lamportClock: number;
  createdAt: number;
  updatedAt: number;
}

export interface RelationEvidence {
  atomId: string;
  /** The text snippet that triggered this inference */
  snippet: string;
  /** Timestamp of detection */
  detectedAt: number;
}
```

**Why separate from existing `entityRegistry` and `entityGraph`:**

| Existing Table | Purpose | v5.0 Table | Purpose |
|---------------|---------|------------|---------|
| `entityRegistry` (v5 migration) | Sanitization pseudonym mappings (realText -> `<Person 1>`) | `entities` (v9 migration) | Knowledge graph nodes (canonical entity profiles) |
| `entityGraph` (v6 migration) | Atom-to-metadata edges (has-outcome, has-deadline) | `entityRelations` (v9 migration) | Entity-to-entity edges (Pam is-spouse-of User, Pam works-at Acme) |

The existing tables serve atom-centric purposes (sanitization, clarification metadata). The new tables are entity-centric -- they model the user's world (people, places, organizations and their relationships). Different cardinality, different query patterns, different lifecycle.

**Bridge between systems:** When the entity NER detects "Pam" in raw content, it:
1. Creates/updates a `KnowledgeEntity` in the `entities` table (v5.0 new)
2. The sanitization pipeline independently creates/updates an `EntityRegistryEntry` in `entityRegistry` (Phase 14 existing) if "Pam" matches a PII category
3. A linking field (`sanitizationRegistryId?: string`) on `KnowledgeEntity` can cross-reference the two systems

### Co-occurrence Counting

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| In-memory Map + Dexie persistence | N/A (pure TypeScript) | Track entity co-occurrence for relationship inference | IndexedDB is too slow for real-time co-occurrence matrix updates. Accumulate in memory, flush to Dexie on idle/interval. |

**Approach:**

```typescript
// In-memory co-occurrence accumulator
// Key: sorted entity ID pair "entityA|entityB", Value: count + atom evidence
type CoOccurrenceMap = Map<string, {
  count: number;
  atomIds: Set<string>;
  lastSeen: number;
}>;
```

**Why NOT store co-occurrence directly in IndexedDB:** Each atom could mention 3-5 entities, creating O(n^2) pairs per atom. Writing each pair as a separate Dexie transaction on every atom process would be slow. Instead:
- Accumulate in a module-level Map
- Flush to `entityRelations` with `source: 'co-occurrence'` when count crosses a threshold (e.g., >= 3 co-occurrences)
- Flush on `requestIdleCallback` or every 30 seconds

**Why NOT a separate co-occurrence table:** The `entityRelations` table already models this -- a co-occurrence IS a relationship (type: 'co-occurs'). When co-occurrence count is high enough AND keyword patterns match, it gets upgraded to a typed relationship (e.g., 'spouse').

### Keyword Pattern Engine for Relationship Inference

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Pure TypeScript regex/keyword matching | N/A | T1 deterministic relationship classification | No ML model needed. Keyword patterns like "wife", "anniversary", "boss", "works at" are deterministic and high-precision. Fits the T1 tier (deterministic, no model). |

**Pattern structure:**

```typescript
interface RelationshipPattern {
  type: string;           // 'spouse' | 'colleague' | 'family' | etc.
  keywords: string[];     // ['wife', 'husband', 'married', 'anniversary']
  contextWindow: number;  // characters around entity to search for keywords
  confidence: number;     // base confidence for this pattern (e.g., 0.8)
}
```

This is NOT a new dependency -- it's a pure TypeScript module in `src/ai/entity/` using the existing T1 deterministic tier pattern.

### Worker Architecture

| Decision | Recommendation | Rationale |
|----------|---------------|-----------|
| Reuse sanitization worker? | **No** -- create a dedicated entity worker | The sanitization worker uses a different model (`sanitize-check`). Loading two NER models in one worker doubles memory. Better: one worker per model. |
| New dedicated entity worker? | **Yes** -- `entity-worker.ts` in `src/workers/` | Follows established pattern (embedding-worker, sanitization-worker). Lazy-loads Xenova/bert-base-NER on first entity detection request. |
| Run on every atom? | **Yes, but debounced** | Entity detection should run on new inbox items and atom content updates. Debounce to avoid re-running on rapid edits. |

**Worker message protocol (follows existing patterns):**

```typescript
// Incoming
{ type: 'DETECT_ENTITIES'; id: string; text: string }
{ type: 'LOAD_NER' }

// Outgoing
{ type: 'ENTITY_RESULT'; id: string; entities: Array<{
  text: string; type: string; start: number; end: number; score: number
}> }
{ type: 'ENTITY_ERROR'; id: string; error: string }
{ type: 'ENTITY_NER_READY' }
{ type: 'ENTITY_NER_LOADING' }
{ type: 'ENTITY_NER_ERROR'; error: string }
```

## Graph Query Patterns in IndexedDB (Dexie)

IndexedDB is not a graph database. DO NOT attempt to implement graph traversal in Dexie. Instead, use these proven patterns:

### Pattern 1: Direct Lookup (O(1) via index)
```typescript
// "Who is Pam?" -- get entity by normalized name
db.entities.where('normalizedName').equals('pam').first()

// "What entities are in this atom?" -- multi-entry index
db.entities.where('atomIds').equals(atomId).toArray()
```

### Pattern 2: One-Hop Relationships (O(1) via compound index)
```typescript
// "What are Pam's relationships?"
db.entityRelations.where('sourceEntityId').equals(pamId).toArray()
// Plus reverse direction:
db.entityRelations.where('targetEntityId').equals(pamId).toArray()
```

### Pattern 3: Materialized Neighbors (denormalized for speed)
For "friends of friends" or multi-hop queries, DO NOT recursively query IndexedDB. Instead:
- Store a `relatedEntityIds: string[]` field on `KnowledgeEntity`
- Update it when relationships change
- One indexed lookup gets the full neighborhood

### Anti-Pattern: Recursive Graph Traversal
```typescript
// NEVER DO THIS in IndexedDB:
async function findConnected(entityId: string, depth: number): Promise<...> {
  const rels = await db.entityRelations.where('sourceEntityId').equals(entityId).toArray();
  for (const rel of rels) {
    await findConnected(rel.targetEntityId, depth - 1); // N+1 queries, kills perf
  }
}
```

**Why this works for BinderOS:** The knowledge graph is shallow. A personal information manager typically has:
- 50-500 entities (people, places, orgs in someone's life)
- 1-3 hops of relationships that matter
- One-hop queries cover 95% of use cases (enrichment context, GTD processing)

## What NOT to Add

| Technology | Why Not |
|------------|---------|
| Neo4j / any graph DB | User requirement: Dexie only, no server-side databases |
| vis.js / d3-force for graph viz | Deferred to v6.0 (Programmable Pages). v5.0 focuses on data layer. |
| Additional NPM packages | Everything needed is already installed |
| Custom ONNX model for entity linking | Pre-trained bert-base-NER + keyword patterns is sufficient for T1/T2. Entity linking (resolving "Pam" to a canonical entity) is string matching, not ML. |
| spaCy / compromise.js | Server-side (spaCy) or too basic (compromise). Transformers.js + bert-base-NER is the right tool. |
| Wikidata entity linking | v5.0 is about PERSONAL entities (user's people/places), not Wikipedia disambiguation |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| NER model | Xenova/bert-base-NER (q8) | onnx-community/NeuroBERT-NER-ONNX | NeuroBERT is smaller (~30MB) but lower accuracy. For knowledge graph, accuracy matters more than model size -- a missed entity is lost forever. |
| NER model | Xenova/bert-base-NER (q8) | Xenova/bert-base-NER-uncased | Cased version preserves proper noun casing, important for entity dedup ("Pam" vs "pam" normalized separately). |
| Entity storage | Two new Dexie tables | Extend existing entityRegistry + entityGraph | Different concerns: sanitization pseudonyms vs knowledge entities. Mixing them creates coupling between privacy pipeline and intelligence pipeline. |
| Co-occurrence | In-memory Map + flush | Direct Dexie writes per co-occurrence | O(n^2) entity pairs per atom. Dexie transactions are async and have overhead -- batching via in-memory Map is 10-100x faster. |
| Relationship inference | Keyword patterns (T1) | ONNX classifier (T2) | Keyword patterns for relationship types are high-precision and deterministic. ML adds complexity without clear accuracy gain for patterns like "wife", "boss", "works at". T2 ONNX is better for GTD-specific entity reasoning (already planned). |
| Worker architecture | New entity-worker.ts | Share sanitization worker | Different models (sanitize-check vs bert-base-NER). Loading both in one worker would double memory (~220MB). Separate workers allow independent lazy loading. |
| Graph queries | Flat Dexie queries + denormalization | Recursive traversal | IndexedDB has no join operator. Recursive queries cause N+1 performance problems. Denormalize instead. |

## Integration Points with Existing Code

### Embedding Worker (embedding-worker.ts)
- **No changes needed.** Entity worker is separate.
- Embeddings from MiniLM can optionally be used for entity similarity (e.g., "is 'Pam' the same as 'Pamela'?") but this is a stretch goal, not core.

### Sanitization Pipeline (sanitizer.ts)
- **Read-only integration.** When the sanitization pipeline detects a PERSON entity, it can optionally cross-reference the `entities` table to use the knowledge graph's canonical name.
- The sanitization pipeline's `EntityRegistryEntry` and the knowledge graph's `KnowledgeEntity` can share a linking ID, but the two systems remain independent.
- Privacy boundary is preserved: sanitization gates cloud access, entity intelligence enriches local processing.

### Tiered Pipeline (src/ai/tier2/)
- **T1 addition:** Entity detection + keyword relationship inference runs deterministically on raw content.
- **T2 addition:** A new ONNX model for methodology-specific entity reasoning (GTD context from entity relationships). This would be trained via the existing Python pipeline.
- **T3 unchanged:** Cloud LLM still sees sanitized content. Entity context is injected into prompts as structured metadata, not raw names.

### Entity Graph (entity-graph.ts)
- **Coexists.** The existing `entityGraph` table stores atom-to-metadata edges (has-outcome, has-deadline). The new `entityRelations` table stores entity-to-entity edges (is-spouse-of, works-at). Different tables, different purposes, no conflicts.

### Store (store.ts)
- New signals for entity state: `entityCount`, `recentEntities`, `entityForAtom(atomId)`.
- Entity corrections flow through the existing SolidJS store pattern.

## Installation

No new packages to install. Model download only:

```bash
# Add to scripts/download-model.cjs
# Downloads Xenova/bert-base-NER q8 quantized to public/models/Xenova/bert-base-NER/
node scripts/download-model.cjs
```

## Existing Index Gap (Pre-existing Bug)

The `entityGraph` table queries `targetValue` in `getRelationships()` (line 70 of entity-graph.ts) but has NO index on `targetValue` in the v6 migration. This causes a full table scan on every bidirectional relationship lookup. The v9 migration should add `targetValue` to the entityGraph indexes:

```typescript
// Fix in v9 migration:
entityGraph: '&id, sourceAtomId, [sourceAtomId+entityType], entityType, relationship, targetValue'
```

## Sources

- [Xenova/bert-base-NER on HuggingFace](https://huggingface.co/Xenova/bert-base-NER) -- HIGH confidence (official model card)
- [onnx-community/bert-base-NER-ONNX](https://huggingface.co/onnx-community/bert-base-NER-ONNX) -- HIGH confidence (entity categories: PER, LOC, ORG, MISC confirmed)
- [onnx-community/NeuroBERT-NER-ONNX](https://huggingface.co/onnx-community/NeuroBERT-NER-ONNX) -- MEDIUM confidence (alternative considered)
- [Dexie.js Compound Index documentation](https://dexie.org/docs/Compound-Index) -- HIGH confidence (official docs)
- [Dexie.js MultiEntry Index documentation](https://dexie.org/docs/MultiEntry-Index) -- HIGH confidence (official docs)
- Existing codebase: `src/workers/sanitization-worker.ts`, `src/search/embedding-worker.ts`, `src/storage/db.ts`, `src/storage/entity-graph.ts` -- HIGH confidence (direct code review)
