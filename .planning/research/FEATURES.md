# Feature Landscape

**Domain:** Entity Intelligence & Knowledge Graph for local-first personal information management (BinderOS v5.0)
**Researched:** 2026-03-10
**Confidence:** MEDIUM-HIGH -- NER model capabilities verified via official HuggingFace docs; relationship inference patterns well-documented in academic literature; entity-aware enrichment is novel integration but builds on proven existing systems; user correction UX has limited prior art in browser-based PIM tools.

---

## Context

This research targets BinderOS **v5.0: Entity Intelligence & Knowledge Graph**. The existing system (v4.0, shipped 2026-03-10) provides:

- **Atom system:** 5 types (task, fact, event, decision, insight) + analysis, full CRUD, Dexie persistence
- **Tiered AI pipeline:** T1 deterministic (regex entity extraction, keyword heuristics) -> T2 ONNX (10 cognitive models, type/GTD classifiers, 6 binary clarification classifiers) -> T3 LLM (cloud/local)
- **Sanitization pipeline:** DistilBERT fine-tuned NER in dedicated worker, entity registry (Dexie `entityRegistry` table), pseudonym mapping, branded `SanitizedPrompt` type
- **Enrichment wizard:** Iterative deepening with cognitive signal priority, question bank, maturity scoring, graduation synthesis
- **Entity graph (Phase 19):** Dexie `entityGraph` table exists with `EntityGraphEntry` type -- currently stores clarification-sourced relationships only (has-outcome, has-deadline, has-context, has-reference, has-next-action)
- **Existing T1 entity extraction:** Regex-based, extracts `context` (@-tags), `energy`, `date`, and `tag` (#-tags) -- does NOT extract people, places, or organizations
- **Privacy architecture:** T1/T2 run locally on raw content; T3 cloud sees sanitized text through `SanitizedPrompt` branded type

**What v5.0 changes:**

| Area | Current State | v5.0 Target |
|------|--------------|-------------|
| Entity detection | Regex: @context, #tags, dates, energy levels only | NER: people, places, organizations via Xenova/bert-base-NER |
| Entity registry | Sanitization-only: pseudonym mappings for PII masking | Dual-purpose: PII pseudonyms + entity knowledge with relationships |
| Relationship graph | Clarification-sourced edges only (5 types) | Cross-item evidence: co-occurrence, keyword patterns, NER-detected entities linked across atoms |
| Entity knowledge | None -- system has no concept of "who is Pam" | Entity cards with typed relationships, confidence scores, user corrections |
| Enrichment context | Questions driven by missing-info classifiers + cognitive signals | Entity context injected: "This mentions Pam (your wife) -- is this related to your anniversary planning?" |
| GTD processing | No entity awareness | Entity relationships inform GTD routing: "Meeting with Dr. Chen" -> @health context |
| User corrections | N/A | Inline entity relationship editing with immediate graph updates |

**Scope boundary:** Features new to v5.0 only. Existing triage, enrichment wizard mechanics, ONNX classifiers, sanitization pipeline, and all v4.0 patterns are baseline.

---

## Table Stakes

Features users expect from an "entity intelligence" milestone. Missing these = the milestone fails to deliver its core promise.

| Feature | Why Expected | Complexity | Dependency on Existing System |
|---------|--------------|------------|-------------------------------|
| **NER-based entity detection (people, places, orgs)** | The milestone promises "entity detection across all Binder types." Without NER, entities remain limited to regex @-tags and #-tags. Users entering "Meeting with Sarah at Google HQ" expect the system to recognize Sarah (person), Google (org), Google HQ (location). | MEDIUM | Xenova/bert-base-NER via Transformers.js (already in project for MiniLM embeddings). Runs in embedding worker or new entity worker. Model detects 4 entity types: PER, LOC, ORG, MISC with 91.3% F1. Reuses Cache API persistence pattern. |
| **Entity registry with typed entries** | Detected entities must persist across sessions. "Sarah" mentioned in 3 atoms should resolve to one entity, not three unlinked strings. The registry is the canonical "who/what/where" knowledge store. | MEDIUM | Existing `entityRegistry` table in Dexie stores sanitization pseudonyms. Must extend (or create parallel table) for entity knowledge: entity name, type (person/place/org), aliases, first-seen/last-seen timestamps, mention count, user-confirmed flag. Schema must be CRDT-friendly (additive fields, LWW timestamps) for future v7.0 sync. |
| **Entity deduplication and normalization** | "Sarah", "Sarah Chen", "Dr. Chen", "Dr. Sarah Chen" should all resolve to the same entity. Without dedup, the entity registry fills with noise. | MEDIUM | String normalization (lowercase, trim) + fuzzy matching on normalized text. Existing `normalizedText` field on `EntityRegistryEntry` provides the pattern. Extend with alias tracking: when NER detects "Dr. Chen" and "Sarah Chen" in the same atom, create alias link. |
| **Relationship edges between entities and atoms** | Entities detected in atoms must be linked back to those atoms. "Sarah" mentioned in task "Buy anniversary gift for Sarah" creates an edge: atom -> mentions -> Sarah entity. This is the bridge between the atom system and the entity graph. | LOW-MEDIUM | Existing `entityGraph` table with `EntityGraphEntry` type. Add new relationship type `mentions-entity` alongside existing `has-outcome`, `has-deadline`, etc. `sourceAtomId` = atom ID, `entityValue` = entity display name, `targetValue` = entity registry ID. |
| **Entity detection on all atom lifecycle events** | Entities must be detected when atoms are created (inbox capture), when atoms are updated (content edits), and when atoms are triaged (type classification). Running NER only at creation misses edits. | LOW | Hook into existing atom CRUD lifecycle in BinderCore worker. NER runs asynchronously after atom write completes -- same pattern as existing ONNX classification which runs post-triage. |
| **Entity context visible in atom detail view** | When viewing an atom, users should see which entities were detected: "People: Sarah, Dr. Chen | Places: Google HQ | Orgs: Google." This surfaces the intelligence layer. | LOW | UI component reading from `entityGraph` table where `sourceAtomId` matches current atom. Display as chips/badges in atom detail. Existing `getRelationships()` and `getRelationshipsByType()` functions provide the query API. |
| **Privacy boundary: NER runs locally, entities never sent to cloud** | The system's privacy promise requires entity detection to run in T1/T2 (local-only). Entity names, relationships, and corrections must never appear in T3 cloud requests. Cloud sees sanitized pseudonyms ("Person 1"), not real entity names. | LOW | Already enforced architecturally: sanitization pipeline replaces real names with pseudonyms before `SanitizedPrompt` creation. Entity detection runs in embedding worker (local). No new privacy work needed -- just maintain the existing boundary. |

---

## Differentiators

Features that set BinderOS v5.0 apart from note-taking tools with basic tagging. These create the "the system knows my world" experience.

| Feature | Value Proposition | Complexity | Dependency on Existing System |
|---------|-------------------|------------|-------------------------------|
| **Deterministic relationship inference from keyword patterns** | When an atom says "Buy anniversary gift for Sarah," the system infers Sarah is likely a spouse/partner based on the keyword "anniversary." Pattern: keyword co-occurrence with entity -> relationship type mapping. "Boss" + person -> manager relationship. "Dr." + person -> doctor/health relationship. This is T1 (deterministic, instant, no model needed). | MEDIUM | New module `src/ai/entity/relationship-patterns.ts`. Pattern bank: { keyword: RegExp, relationship: string, confidence: number }. Runs after NER detection. Creates edges in `entityGraph` with source='keyword-pattern'. Example patterns: anniversary/wedding/spouse/wife/husband -> 'spouse-of', boss/manager/supervisor -> 'reports-to', Dr./doctor/dentist -> 'healthcare-provider'. |
| **Cross-item entity co-occurrence accumulation** | If "Sarah" appears in 5 task atoms about home renovation and 2 atoms about school pickup, the system accumulates evidence: Sarah is likely a household member involved in home projects and childcare. Co-occurrence counting builds entity context over time without requiring explicit relationship declarations. | HIGH | New `src/ai/entity/co-occurrence.ts`. Maintain per-entity co-occurrence vectors: { entityId, coEntityId, count, contexts[] }. Update on every NER pass. Compute relationship confidence from co-occurrence frequency. Periodic batch recomputation (not real-time) to avoid write amplification. Uses existing `entityGraph` table with new relationship type 'co-occurs-with'. |
| **User correction UX for entity relationships** | "Pam is my wife, not my coworker." Users must be able to correct entity relationships with a single interaction. Corrections are ground truth -- they override all inferred relationships for that entity pair. The correction immediately updates the entity graph and influences future inferences. | MEDIUM | New UI component: entity card with editable relationship dropdown. Correction writes to `entityGraph` with source='user-correction' (highest confidence). Store correction as a distinct entry that supersedes inferred entries. Corrections also feed back into keyword pattern confidence: if users frequently correct "anniversary" -> not-spouse, reduce pattern confidence. |
| **Entity-aware enrichment questions** | The enrichment wizard currently asks generic questions based on missing-info categories. With entity context, questions become personal: "You mentioned Sarah -- is she the one handling the contractor quotes for the kitchen remodel?" Entity context makes enrichment feel like a conversation with someone who knows your life. | MEDIUM | Extend `enrichment-engine.ts` to accept entity context in `TieredFeatures`. New question template category: 'entity-context'. When an atom mentions known entities, generate entity-specific follow-up questions. T2B handler can produce entity-aware options. |
| **Entity context in GTD processing** | "Meeting with Dr. Chen" should auto-suggest @health context tag. "Email from AWS support" should suggest @tech context. Entity relationships inform GTD routing without explicit user tagging. | MEDIUM | Extend `classify-gtd` pipeline to accept entity context. New T1 rule: if atom mentions entity with known context mapping (Dr. Chen -> healthcare -> @health), inject context suggestion into GTD classification result. Add `entityContext` field to `TieredFeatures`. |
| **Entity timeline view** | Show all atoms mentioning a specific entity, ordered chronologically. "When did I last interact with Sarah?" becomes answerable. This is the relationship-map feature hinted at in `AnalysisAtom.analysisKind: 'relationship-map'`. | MEDIUM | New query: `db.entityGraph.where('entityValue').equals(entityName)` -> collect sourceAtomIds -> batch fetch atoms -> sort by date. UI: entity detail page with timeline. Leverages existing `getRelationships()` bidirectional query. |
| **Recency-weighted entity relevance (MunninDB-style)** | Entities mentioned recently are more relevant than entities from 6 months ago. Apply exponential decay to entity mention counts so the system prioritizes current relationships over stale ones. "Sarah" mentioned 20 times last year but not in 3 months should rank lower than "Mike" mentioned 3 times this week. | LOW-MEDIUM | Add `lastMentionedAt` timestamp and `decayedScore` computed field to entity entries. Recency decay function: `score * exp(-lambda * daysSinceLastMention)`. Lambda calibrated so entities decay to 50% relevance after ~30 days of no mentions. Update on each NER pass. |
| **Entity merge/split UX** | Sometimes NER creates two entities that are actually the same person ("Sarah" and "Sarah Chen"). Sometimes it merges two different people named "Mike." Users need merge (combine two entities into one) and split (separate one entity into two) operations. | HIGH | Merge: reassign all `entityGraph` edges from source entity to target entity, delete source. Split: create new entity, let user reassign specific edges. Both require Dexie transactions. CRDT implications: merge/split must be representable as additive operations for future v7.0 sync. |

---

## Anti-Features

Features commonly requested or seemingly obvious that should NOT be built.

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|--------------|---------------|-----------------|-------------|
| **Neo4j or dedicated graph database** | "A real knowledge graph needs a real graph database" | BinderOS is browser-only. Neo4j requires a server. Any graph DB adds a server dependency that breaks the local-first, browser-only constraint. IndexedDB with compound indexes handles the entity graph query patterns (entity-by-atom, atom-by-entity, co-occurrence lookups) adequately at personal scale (<100K entities). | Two Dexie tables (Entity + entityGraph) with compound indexes. Existing `[sourceAtomId+entityType]` index pattern is sufficient. Add indexes for entity lookups. |
| **LLM-based entity extraction replacing NER** | "Use the local LLM to extract entities -- it understands context better" | Local LLMs (1B-3B) are slower (500ms+ vs 50ms for ONNX NER), less reliable for structured extraction, and produce inconsistent output formats. NER models are purpose-built for entity extraction with consistent BIO-tagged output. LLM extraction also requires the LLM worker to be loaded, which may not be the case on mobile. | NER for entity extraction (consistent, fast, always available). LLM for relationship reasoning only when explicitly needed (T3 escalation for ambiguous relationships). |
| **Automatic entity relationship creation without evidence** | "If two people appear in the same atom, they must be related" | Co-occurrence in a single atom is weak evidence. "Call Sarah and also pick up dry cleaning" does not mean Sarah is related to dry cleaning. Relationship inference requires pattern repetition (co-occurrence across multiple atoms) or keyword evidence. Single-mention co-occurrence creates noisy, misleading relationships. | Require minimum 2 co-occurrences across different atoms, OR keyword pattern match, before creating a relationship edge. Single-atom co-occurrence logged but not surfaced as a relationship. |
| **Real-time entity detection during typing** | "Detect entities as the user types for instant feedback" | NER inference takes 30-100ms per call. Running on every keystroke creates input lag. The embedding worker would be saturated with inference requests during active typing, starving other ONNX tasks. | Run NER on atom save/create (debounced). Show entity badges after save, not during typing. Same pattern as existing ONNX type classification which runs post-submission. |
| **Entity-based search replacing text search** | "Search by entity instead of keywords" | Entity search is complementary, not a replacement. Users still need full-text search for content that doesn't contain named entities. Replacing text search breaks muscle memory and removes functionality. | Add entity search as a filter dimension alongside existing text search. "Show atoms mentioning Sarah" as a filter chip, composable with text search and other filters. |
| **Cloud-powered entity resolution** | "Send entities to a cloud API for better disambiguation" | Sending entity names (real people, places the user interacts with) to a cloud service violates the privacy architecture. Entity names are PII -- the sanitization pipeline exists specifically to prevent their transmission. | All entity resolution runs locally. T1 keyword patterns + T2 co-occurrence analysis. Accept lower disambiguation accuracy as the price of privacy. User corrections fill the gap. |
| **Ontology-driven entity typing** | "Define a formal ontology (schema.org, FOAF) for entity relationships" | Formal ontologies add schema complexity without proportional value for a personal PIM tool. Users don't think in ontology terms. A simple relationship type string ('spouse-of', 'reports-to', 'healthcare-provider') is more maintainable and user-comprehensible than formal RDF triples. | Flat relationship type strings with a small controlled vocabulary. New types added as keyword patterns reveal them. No schema.org, no RDF, no OWL. |
| **Entity-based notifications/alerts** | "Notify me when an entity hasn't been mentioned in a while" | BinderOS is not a CRM. Notification fatigue from entity staleness alerts would overwhelm users. The entropy engine already surfaces stale atoms -- adding entity-level staleness doubles the noise. | Entity recency decay influences ranking in entity views. Stale entities naturally sort to the bottom. No push notifications. |

---

## Feature Dependencies

```
[NER Entity Detection (Xenova/bert-base-NER)]
    |-- requires --> [Transformers.js token-classification pipeline]
    |-- runs-in --> [Embedding worker OR new entity worker]
    |-- uses --> [Cache API for model persistence (existing pattern)]
    |-- produces --> [DetectedEntity[] with PER/LOC/ORG/MISC labels]
    |-- feeds --> [Entity Registry]
    |-- feeds --> [Entity Graph (relationship edges)]

[Entity Registry (Dexie)]
    |-- extends --> [Existing entityRegistry table OR new entity table]
    |-- stores --> [Entity name, type, aliases, mention count, timestamps]
    |-- indexed-by --> [normalizedText for dedup lookups]
    |-- queried-by --> [Entity detail view, enrichment engine, GTD classifier]
    |-- CRDT-friendly --> [Additive fields, LWW timestamps for v7.0]

[Entity Graph Extensions]
    |-- extends --> [Existing entityGraph table with new relationship types]
    |-- new-types --> [mentions-entity, co-occurs-with, keyword-inferred, user-corrected]
    |-- queried-by --> [getRelationships(), getRelationshipsByType() (existing)]
    |-- feeds --> [Entity timeline view]

[Relationship Inference]
    |-- requires --> [NER Entity Detection] (must know entities first)
    |-- requires --> [Entity Registry] (must resolve entity identity)
    |-- T1-path --> [Keyword pattern matching (deterministic)]
    |-- T2-path --> [Co-occurrence accumulation (statistical)]
    |-- stores --> [Entity Graph edges with source and confidence]

[User Correction UX]
    |-- requires --> [Entity Registry] (must have entities to correct)
    |-- requires --> [Entity Graph] (must have relationships to correct)
    |-- writes --> [Entity Graph with source='user-correction']
    |-- influences --> [Keyword pattern confidence (feedback loop)]

[Entity-Aware Enrichment]
    |-- requires --> [Entity Registry] (read entity knowledge)
    |-- requires --> [Entity Graph] (read relationships)
    |-- extends --> [enrichment-engine.ts TieredFeatures]
    |-- extends --> [question-bank.ts templates]
    |-- produces --> [Entity-context enrichment questions]

[Entity-Aware GTD Processing]
    |-- requires --> [Entity Registry] (entity-to-context mapping)
    |-- extends --> [classify-gtd pipeline in tier1-handler.ts]
    |-- produces --> [Context tag suggestions from entity relationships]

[Entity Timeline View]
    |-- requires --> [Entity Graph] (atom-entity edges)
    |-- requires --> [Entity Registry] (entity metadata)
    |-- queries --> [atoms table via entityGraph sourceAtomIds]
    |-- UI-component --> [New EntityDetail page/panel]

[Entity Merge/Split]
    |-- requires --> [Entity Registry] (entity records)
    |-- requires --> [Entity Graph] (edge reassignment)
    |-- requires --> [User Correction UX] (manual trigger)
    |-- CRDT-concern --> [Must be representable as additive ops]
```

### Dependency Notes

- **NER detection is the foundation.** Without NER, there are no entities to register, link, or infer relationships for. NER must ship first, before any downstream feature.
- **Entity registry must be designed for dual use.** The existing `entityRegistry` table serves sanitization (pseudonym mapping). v5.0 entity knowledge must either extend this table or create a parallel table. Extending is preferred (single entity identity source) but requires careful schema design to avoid breaking sanitization.
- **Relationship inference depends on entity accumulation.** Co-occurrence analysis is only meaningful after enough atoms have been processed. Keyword pattern inference works from the first atom. Ship keyword patterns first; co-occurrence builds value over time.
- **User correction UX is critical for trust.** If the system infers "Sarah is your coworker" and gets it wrong, users lose trust in the entire entity intelligence layer. Correction UX must ship alongside inference -- never ship inference without correction.
- **Entity-aware enrichment is the payoff feature.** Users may not notice entity detection happening in the background. They WILL notice when the enrichment wizard asks a question that demonstrates knowledge of their relationships. This is where entity intelligence becomes tangible.
- **Entity merge/split is complex and deferrable.** Most users will have <50 active entities. Manual merge/split is a power-user feature that can ship after core entity intelligence proves its value.

---

## MVP Recommendation

### Ship in v5.0 Core

Prioritize in this order (each builds on the previous):

1. **NER entity detection** -- Xenova/bert-base-NER in embedding worker. Detect PER, LOC, ORG, MISC from atom content. Run on atom create/update lifecycle.
2. **Entity registry** -- Dexie table for entity knowledge (extend or parallel to sanitization registry). Deduplication via normalized text. Alias tracking.
3. **Entity-atom linking** -- Write `mentions-entity` edges to existing `entityGraph` table on every NER pass. Surface detected entities in atom detail view.
4. **Keyword relationship inference** -- T1 deterministic patterns: "wife/husband/anniversary" -> spouse, "boss/manager" -> reports-to, "Dr." -> healthcare-provider. Create relationship edges with source='keyword-pattern'.
5. **User correction UX** -- Inline entity relationship editing. Corrections override inferred relationships. Store with source='user-correction'.
6. **Entity-aware enrichment** -- Inject entity context into enrichment questions. "You mentioned Sarah (your wife) -- is this for your anniversary?"
7. **Entity context in atom detail** -- Chips/badges showing detected entities and their known relationships.

### Defer to v5.x

- **Co-occurrence accumulation** -- Requires data to accumulate over time. Ship the counting infrastructure in v5.0 but don't surface co-occurrence-based relationships until confidence thresholds are met. Enable in v5.1 after 2-4 weeks of entity data accumulation.
- **Entity timeline view** -- Valuable but not core. Ship after entity detection and registry prove useful.
- **Recency-weighted relevance** -- Optimization on top of working entity system. Add after core entity features stabilize.
- **Entity-aware GTD routing** -- Context tag suggestions from entity relationships. Ship after user corrections validate that entity-to-context mappings are accurate.

### Future Consideration (v5.x+)

- **Entity merge/split UX** -- Power user feature. Defer until entity count is large enough to create real duplication problems.
- **T2 ONNX methodology-specific entity reasoning** -- Train ONNX model on entity-GTD patterns. Requires training data from v5.0 user corrections.

---

## Interaction with Existing Systems

### NER Model vs Sanitization NER

The sanitization pipeline already runs a fine-tuned DistilBERT NER for PII detection (PERSON, LOCATION, FINANCIAL, CONTACT, CREDENTIAL categories). The v5.0 entity detection NER (bert-base-NER: PER, LOC, ORG, MISC) overlaps on person and location detection.

**Key design decision:** Do NOT run two separate NER models. Instead:

- **Option A (recommended):** Extend the existing sanitization NER worker to also produce entity intelligence output. One NER pass, two consumers: sanitization pipeline gets `DetectedEntity[]` for pseudonymization, entity intelligence gets the same entities for registry/graph population.
- **Option B:** Run bert-base-NER as a separate model in the embedding worker alongside MiniLM. Downside: two NER models loaded in memory (~120MB combined), redundant inference.

Option A avoids double inference and double memory. The sanitization NER already detects PERSON and LOCATION -- extend its output to feed the entity registry.

### Enrichment Engine Integration

The enrichment engine (`enrichment-engine.ts`) already accepts `TieredFeatures` with content and cognitive signals. Add:

```
TieredFeatures.entityContext?: Array<{
  name: string;
  type: 'person' | 'place' | 'org';
  relationships: Array<{ type: string; target: string; confidence: number }>;
}>
```

The question bank (`question-bank.ts`) gains a new template category for entity-context questions. The semantic selector (`semantic-selector.ts`) can prioritize entity-related questions when entities with low relationship confidence are detected.

### Entity Graph Table Reuse

The existing `entityGraph` table and `EntityGraphEntry` type are well-designed for extension:

- `entityType` field: add 'person', 'place', 'org' alongside existing 'outcome', 'deadline', etc.
- `relationship` field: add 'mentions-entity', 'co-occurs-with', 'keyword-inferred', 'user-corrected'
- `targetValue` field: already supports entity registry IDs
- Compound index `[sourceAtomId+entityType]` enables efficient per-atom entity lookups

No schema migration needed if the new types fit the existing string-typed fields.

### What Does NOT Change

- Tiered pipeline dispatch logic -- NER results feed into features, not into the escalation path
- ONNX classifier models (type, GTD, clarification) -- unchanged
- Sanitization pipeline flow -- extended to share NER output, not replaced
- Atom schema -- no new fields on atoms; entity knowledge lives in separate tables
- Approval modal and cloud request flow -- entity data is local-only, never touches cloud path
- Classification log format -- unchanged

---

## Sources

- [Xenova/bert-base-NER -- HuggingFace](https://huggingface.co/Xenova/bert-base-NER) -- ONNX model for Transformers.js token classification; HIGH confidence
- [dslim/bert-base-NER -- HuggingFace](https://huggingface.co/dslim/bert-base-NER) -- Base model: 91.3% F1, 4 entity types (PER, LOC, ORG, MISC), BIO tagging; HIGH confidence
- [Transformers.js documentation](https://huggingface.co/docs/transformers.js/en/index) -- Token classification pipeline API, ONNX Runtime Web integration; HIGH confidence
- [From PyTorch to Browser: ONNX and Transformers.js](https://bandarra.me/posts/from-pytorch-to-browser-a-full-client-side-solution-with-onnx-and-transformers-js) -- End-to-end browser NER implementation pattern; MEDIUM confidence
- [Knowledge Graph Construction: Extraction, Learning, and Evaluation](https://www.mdpi.com/2076-3417/15/7/3727) -- NER as first stage of KG construction; MEDIUM confidence
- [Entity Co-occurrence Networks for Social Media Analysis](https://link.springer.com/chapter/10.1007/978-3-031-77792-9_5) -- Co-occurrence-based relationship inference patterns; MEDIUM confidence
- [Tana Knowledge Graph](https://tana.inc/knowledge-graph) -- PIM tool with entity-aware knowledge graph for design inspiration; LOW confidence (marketing page)
- [Building a Knowledge Graph End-to-End Guide](https://medium.com/@brian-curry-research/building-a-knowledge-graph-a-comprehensive-end-to-end-guide-using-modern-tools-e06fe8f3b368) -- Entity extraction -> registry -> relationship patterns; MEDIUM confidence
- [Obsidian Graph View patterns](https://www.aitechgirl.com/posts/2025/05/obsidian/) -- Note-based graph visualization design reference; LOW confidence

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| NER model (bert-base-NER) | HIGH | 91.3% F1 verified on official HuggingFace model card. Transformers.js token-classification pipeline well-documented. Model already in ONNX format. |
| Entity registry design | MEDIUM-HIGH | Dexie table pattern proven in existing entityRegistry and entityGraph. CRDT-friendly schema requires additive-only design -- achievable but needs careful thought. |
| Relationship inference (keyword) | MEDIUM | Pattern is straightforward but keyword bank quality determines usefulness. Initial set of ~20 keyword patterns covers common cases. Edge cases (cultural variation in relationship terms) need user corrections. |
| Relationship inference (co-occurrence) | MEDIUM | Well-documented in academic literature. Challenge is setting thresholds: how many co-occurrences = meaningful relationship? Requires tuning after data accumulates. |
| Entity-aware enrichment | MEDIUM | Novel integration -- no direct prior art for entity-injected enrichment questions in browser PIM tools. Builds on proven enrichment engine architecture. Risk: entity context may produce irrelevant questions if entity resolution is wrong. |
| User correction UX | MEDIUM | Simple UI pattern (dropdown + save). Challenge is making corrections feel effortless -- if correction requires more than 2 clicks, users won't bother. |
| Privacy boundary | HIGH | Already enforced by existing `SanitizedPrompt` branded type and sanitization pipeline. NER runs locally. No architectural changes needed. |
| NER + sanitization NER unification | MEDIUM | Logical to share NER output between sanitization and entity intelligence. Implementation depends on whether sanitization worker output can be extended without breaking existing flow. |

---

*Feature research for: Entity Intelligence & Knowledge Graph -- BinderOS v5.0*
*Researched: 2026-03-10*
