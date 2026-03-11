# Project Research Summary

**Project:** BinderOS v5.0 Entity Intelligence & Knowledge Graph
**Domain:** Local-first NER-based entity detection, knowledge graph construction, and entity-aware enrichment for a browser-based PWA
**Researched:** 2026-03-10
**Confidence:** MEDIUM-HIGH

## Executive Summary

BinderOS v5.0 adds an entity intelligence layer that transforms the existing atom-based PIM into a system that "knows your world" -- recognizing people, places, and organizations across all content and building relationship knowledge over time. The critical insight from research is that **no new dependencies are needed**. The existing stack (Transformers.js, Dexie, ONNX Runtime Web) provides everything required. The primary work is: (1) reusing the sanitization worker's NER pipeline for entity detection via a new `DETECT_ENTITIES` message type, (2) adding two new Dexie tables (`entities` for canonical entity records, `entityRelations` for entity-to-entity edges) via a v9 migration, and (3) building a T1 deterministic relationship inference engine from keyword patterns and co-occurrence evidence.

The recommended approach follows the existing tiered architecture: T1 handles entity detection (NER) and keyword-based relationship inference deterministically and locally; T2 cognitive signals (knowledge domain, collaboration type) aid entity disambiguation; T3 cloud never sees raw entity names -- entity context is injected into cloud prompts using sanitization pseudonyms only. The architecture adds 4 new pure modules (`detector.ts`, `accumulator.ts`, `relationship-inference.ts`, `context-provider.ts`) in `src/ai/entity/` following the established pure-module pattern (no store imports, direct Dexie access). The entity context provider serves as the read-path API for all downstream consumers (enrichment, triage, GTD processing).

The top risks are: (1) **worker memory contention** -- loading a second NER model alongside the existing sanitization model would push mobile browsers past memory limits, so the sanitization worker must be reused rather than creating a new entity worker; (2) **entity disambiguation** -- "John" appearing in 50 items could be 5 different people, requiring conservative dedup (never auto-merge by name alone, use domain signals, defer to user confirmation); (3) **relationship inference false positives** -- keyword patterns like "anniversary" near a person name can produce incorrect spouse relationships without sentence-level proximity checks and evidence accumulation thresholds. All three risks have clear mitigation strategies documented in the research.

## Key Findings

### Recommended Stack

No new NPM packages required. The existing `@huggingface/transformers` (3.8.1), `dexie` (4.3.0), and `onnxruntime-web` (1.24.2) cover all needs. The only addition is downloading the Xenova/bert-base-NER model (q8 quantized, ~110MB) as a fallback if the existing sanitization NER model proves insufficient for general entity detection quality.

**Core technologies:**
- **Existing sanitization NER (DistilBERT)** -- reuse for entity detection via extended worker protocol; avoids loading a second model
- **Two new Dexie tables (`entities` + `entityRelations`)** -- v9 migration; separate from existing `entityRegistry` (sanitization) and `entityGraph` (atom-metadata edges)
- **In-memory co-occurrence Map with Dexie flush** -- accumulate entity pair counts in memory, persist to `entityRelations` when threshold crossed; avoids O(n^2) IndexedDB writes
- **Pure TypeScript keyword pattern engine** -- T1 deterministic relationship inference; no ML model needed for patterns like "wife", "boss", "works at"

**Critical version note:** Xenova/bert-base-NER should be benchmarked against the existing `sanitize-check` model before committing to a second model. If `sanitize-check` provides adequate PER/LOC/ORG detection, skip the additional download entirely.

### Expected Features

**Must have (table stakes):**
- NER-based entity detection (PER, LOC, ORG, MISC) on all atom lifecycle events
- Persistent entity registry with deduplication and normalization
- Entity-atom linking via `mentions-entity` edges in entity graph
- Entity context visible in atom detail view (chips/badges)
- Privacy boundary maintained: NER runs locally, entities never sent to cloud

**Should have (differentiators):**
- Keyword-based relationship inference (T1 deterministic: "anniversary" -> spouse)
- User correction UX for entity relationships (binary yes/no first, rich editing later)
- Entity-aware enrichment questions ("You mentioned Pam (your wife) -- is this for your anniversary?")
- Cross-item co-occurrence accumulation for relationship evidence
- Entity context in GTD processing (entity relationships inform context tag suggestions)
- Recency-weighted entity relevance (MunninDB-style exponential decay)

**Defer (v5.x+):**
- Entity merge/split UX -- power user feature, defer until entity count creates real duplication
- Entity timeline view -- valuable but not core to the intelligence layer
- T2 ONNX methodology-specific entity reasoning -- requires training data from v5.0 user corrections
- Entity-aware GTD routing -- needs validated entity-to-context mappings first

### Architecture Approach

v5.0 adds an Entity Intelligence Layer as a pipeline between the existing NER/sanitization system and the enrichment/triage consumers. Four new pure modules handle the entity lifecycle: detection, accumulation, relationship inference, and context provision. The sanitization worker is extended (not replaced) with a `DETECT_ENTITIES` message type. Entity data lives in Dexie (not the SolidJS store) to avoid reactivity cascades. Only the current item's bounded `EntityContext` object is cached in the store.

**Major components:**
1. **Entity Detector** (`src/ai/entity/detector.ts`) -- orchestrates NER calls via sanitization worker, maps labels to knowledge entity types
2. **Entity Accumulator** (`src/ai/entity/accumulator.ts`) -- deduplicates, normalizes, persists to `entities` table, tracks co-occurrence in memory
3. **Relationship Inference** (`src/ai/entity/relationship-inference.ts`) -- keyword pattern matching at sentence level with proximity checks, co-occurrence rules with evidence accumulation
4. **Entity Context Provider** (`src/ai/entity/context-provider.ts`) -- read-only query layer that builds context summaries for enrichment, triage, and GTD consumers
5. **User Correction UI** (`src/ui/components/EntityCard.tsx`) -- inline entity cards with binary correction interface

### Critical Pitfalls

1. **Dual NER models cause OOM on mobile** -- share the sanitization worker; never load two NER models in separate workers simultaneously. Budget worker memory explicitly and lazy-load the entity NER pipeline.
2. **Entity disambiguation without context creates noise** -- never auto-merge by name alone. Use cognitive domain signals for disambiguation. Implement merge suggestions, not auto-merges. Cluster by co-occurrence context, not by name string.
3. **IndexedDB graph traversal is O(N)** -- build an in-memory adjacency index on app load (~10KB for 3,000 relationships). Cap traversal to 2 hops max. Add missing `entityValue` index to the entityGraph schema. Denormalize entity counts.
4. **Entity context bloats enrichment prompts** -- budget entity context to 150 tokens max. Select 2-3 most relevant entities using cognitive signals. Only inject entity context for people/place-related enrichment categories.
5. **Keyword relationship inference false positives** -- use sentence-level co-occurrence (not item-level), require 5-token proximity between entity and keyword, start all keyword-inferred relationships at confidence 0.3, require 2+ co-occurrences before creating typed relationship edges.

## Implications for Roadmap

Based on research, suggested phase structure (7 phases):

### Phase 1: Foundation -- Types, Schema, Worker Extension
**Rationale:** Everything downstream depends on entity types, database tables, and the NER data source. Schema decisions (separate `entities` table vs extending `entityRegistry`, CRDT fields, indexes) must be locked before any entity data is stored. The worker extension is minimal code (~20 lines) with high leverage.
**Delivers:** `src/ai/entity/types.ts`, Dexie v9 migration with `entities` + `entityRelations` tables, `DETECT_ENTITIES` handler in sanitization worker, `detectEntitiesForKnowledgeGraph()` API on sanitizer.
**Addresses:** Entity registry (table stakes), privacy boundary (table stakes)
**Avoids:** Pitfall 5 (registry naming confusion), Pitfall 11 (missing CRDT fields), Pitfall 12 (insufficient schema)

### Phase 2: Entity Detection + Accumulation
**Rationale:** The "write path" -- entities must flow into the registry before anything can query them. Deduplication and normalization logic is the most design-sensitive code; getting it wrong creates cascading data quality problems.
**Delivers:** Entity Detector module, Entity Accumulator with dedup/normalization, entity-atom linking in entity graph, entity detection wired to atom CRUD lifecycle (on commit, not keystroke).
**Addresses:** NER entity detection (table stakes), entity dedup (table stakes), entity-atom linking (table stakes)
**Avoids:** Pitfall 1 (dual NER OOM -- reuses sanitization worker), Pitfall 2 (John disambiguation), Pitfall 6 (boundary noise), Pitfall 10 (keystroke inference)

### Phase 3: Relationship Inference
**Rationale:** Depends on Phase 2 providing accumulated entities. Relationship inference is the bridge between raw entity detection and useful entity intelligence. Evidence-based confidence model must be established here.
**Delivers:** Keyword pattern engine, co-occurrence accumulator (in-memory Map with Dexie flush), evidence-based confidence scoring, sentence-level proximity checks.
**Addresses:** Keyword relationship inference (differentiator), co-occurrence accumulation (differentiator)
**Avoids:** Pitfall 7 (keyword false positives -- sentence-level, proximity, evidence accumulation)

### Phase 4: Entity Context Provider + Triage Integration
**Rationale:** The "read path" -- makes entity intelligence consumable by existing systems. Triage is the natural first consumer since every inbox item passes through it. This phase also addresses the in-memory adjacency index for graph query performance.
**Delivers:** Entity Context Provider module, parallel entity detection in triage flow, `entityContext` in `TieredFeatures`, in-memory adjacency index for graph queries.
**Addresses:** Entity context visible in atom view (table stakes), entity lifecycle detection (table stakes)
**Avoids:** Pitfall 3 (IndexedDB traversal performance), Pitfall 8 (SolidJS reactivity cascade -- entity data stays in Dexie, not store)

### Phase 5: Entity-Aware Enrichment
**Rationale:** This is the highest-value consumer of entity context -- where entity intelligence becomes tangible to users. "What's Pam's role in this?" vs "Who is involved?" Depends on Phase 4's context provider.
**Delivers:** Entity context injection into enrichment engine, entity-aware question templates, entity summary caching (one-line per entity), 150-token context budget enforcement.
**Addresses:** Entity-aware enrichment questions (differentiator), entity context in GTD (differentiator)
**Avoids:** Pitfall 4 (prompt bloat -- strict token budget, cognitive signal selection)

### Phase 6: User Correction UX
**Rationale:** Built after entity data pipeline is working and populated. User corrections are the ground truth feedback loop that improves all inference. Ship correction alongside inference -- never ship inference without correction capability.
**Delivers:** EntityCard component with inline binary corrections, EntityPanel for browse/search, correction feedback to accumulator (confidence: 1.0), store extensions for correction modal.
**Addresses:** User correction UX (differentiator), entity merge suggestions
**Avoids:** Pitfall 9 (complexity vs willingness -- binary yes/no first, track engagement)

### Phase 7: Polish + Background Scan
**Rationale:** Optimization and catch-up phase. Background entity scan for existing atoms, recency-weighted relevance, entity count badges, performance tuning.
**Delivers:** Background batch scan for historical atoms, recency decay scoring, entity badges in UI, Dexie read batching and caching optimizations.
**Addresses:** Recency-weighted relevance (differentiator), entity timeline view (deferred differentiator)

### Phase Ordering Rationale

- **Phases 1-2 are strictly sequential** -- schema and types must exist before detection/accumulation can write data.
- **Phase 3 depends on Phase 2** -- relationship inference needs accumulated entities to be meaningful.
- **Phases 4-5 form the "read path"** -- they consume entity data produced by Phases 2-3. Phase 5 depends on Phase 4's context provider.
- **Phase 6 is intentionally late** -- correction UX needs populated entity data to be testable. But it MUST ship in v5.0, not v5.x, because inference without correction erodes trust.
- **Phase 7 is polish** -- background scan, recency decay, and performance are optimizations on a working system.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2:** Entity dedup/normalization strategy needs careful design. How aggressive should substring containment matching be? What cognitive signals best disambiguate entities? Benchmark `sanitize-check` vs `bert-base-NER` for entity detection quality.
- **Phase 3:** Keyword pattern bank quality determines usefulness. Need to define the initial ~20 keyword patterns and their confidence weights. Sentence splitting heuristics need testing.
- **Phase 5:** Entity-aware enrichment is novel integration with no direct prior art in browser PIM tools. Question template design needs iteration.

Phases with standard patterns (skip research-phase):
- **Phase 1:** Well-documented Dexie migration, straightforward worker message extension. Established patterns in codebase.
- **Phase 4:** Context provider is a read-only query layer following existing patterns. Triage integration follows established parallel dispatch.
- **Phase 6:** Standard UI component work. SolidJS patterns well understood. Binary correction UX is simple.
- **Phase 7:** Background processing and caching are standard optimization patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | No new dependencies. Existing Transformers.js, Dexie, ONNX Runtime cover all needs. NER model verified on HuggingFace. |
| Features | MEDIUM-HIGH | Table stakes are clear. Entity-aware enrichment is novel (no direct prior art in browser PIM) but builds on proven enrichment engine. |
| Architecture | HIGH | Builds directly on existing worker, tiered pipeline, and Dexie patterns. All components follow established pure-module convention. |
| Pitfalls | HIGH | Worker memory, IndexedDB limitations, and NER disambiguation are well-documented problems with clear mitigations. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **sanitize-check vs bert-base-NER quality:** The existing sanitization model may or may not be adequate for general entity detection. A benchmark comparison is needed before Phase 2 implementation commits to one model or the other. If `sanitize-check` is insufficient, `bert-base-NER` should replace it (not supplement it) in the same worker.
- **Keyword pattern bank completeness:** The initial set of ~20 relationship keyword patterns will cover common Western English cases. Cultural variation in relationship terms (different languages, naming conventions) will create gaps. User corrections are the designed mitigation, but initial pattern quality matters.
- **Co-occurrence threshold tuning:** How many co-occurrences constitute meaningful evidence for a relationship? Research suggests minimum 2-3, but the optimal threshold depends on the user's data volume and entity density. Will need empirical tuning after Phase 3 ships.
- **Entity count scaling:** Research assumes <2,000 entities at 10K atoms. If entity density is higher (e.g., business users with many contacts), the in-memory adjacency index and co-occurrence Map may need size-bounded eviction policies.
- **STACK.md vs ARCHITECTURE.md model disagreement:** STACK.md recommends a new dedicated entity worker with bert-base-NER. ARCHITECTURE.md recommends reusing the sanitization worker with its existing DistilBERT model. This summary sides with ARCHITECTURE.md (reuse sanitization worker) because it avoids the dual-model OOM risk identified as the top critical pitfall. Benchmark first, decide model second.

## Sources

### Primary (HIGH confidence)
- [Xenova/bert-base-NER on HuggingFace](https://huggingface.co/Xenova/bert-base-NER) -- model capabilities, ONNX format, entity types
- [dslim/bert-base-NER on HuggingFace](https://huggingface.co/dslim/bert-base-NER) -- 91.3% F1, BIO tagging, CoNLL-2003 training
- [Dexie.js Compound Index documentation](https://dexie.org/docs/Compound-Index) -- index design for entity queries
- [Dexie.js MultiEntry Index documentation](https://dexie.org/docs/MultiEntry-Index) -- multi-entry index for atomIds arrays
- [Dexie.js Main Limitations of IndexedDB](https://dexie.org/docs/The-Main-Limitations-of-IndexedDB) -- graph query limitations
- Existing codebase: sanitization-worker.ts, embedding-worker.ts, entity-graph.ts, db.ts, tier2/, enrichment/ -- direct code review

### Secondary (MEDIUM confidence)
- [ONNX Runtime Web: Large Models](https://onnxruntime.ai/docs/tutorials/web/large-models.html) -- WASM memory limits
- [Knowledge Graph Construction (MDPI)](https://www.mdpi.com/2076-3417/15/7/3727) -- NER as first stage of KG construction
- [Entity Co-occurrence Networks (Springer)](https://link.springer.com/chapter/10.1007/978-3-031-77792-9_5) -- co-occurrence relationship inference
- [Entity Resolution (Towards Data Science)](https://towardsdatascience.com/an-introduction-to-entity-resolution-needs-and-challenges-97fba052dde5/) -- disambiguation complexity
- [Transformers.js documentation](https://huggingface.co/docs/transformers.js/en/index) -- token classification pipeline API
- [ONNX Runtime: Memory Consumption](https://onnxruntime.ai/docs/performance/tune-performance/memory.html) -- memory tuning for multiple models

### Tertiary (LOW confidence)
- [Tana Knowledge Graph](https://tana.inc/knowledge-graph) -- design inspiration only (marketing page)
- [Obsidian Graph View](https://www.aitechgirl.com/posts/2025/05/obsidian/) -- graph visualization reference (deferred to v6.0)

---
*Research completed: 2026-03-10*
*Ready for roadmap: yes*
