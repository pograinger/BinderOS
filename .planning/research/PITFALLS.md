# Domain Pitfalls

**Domain:** Adding entity intelligence, NER-based entity detection, entity registry with relationship inference, and entity-aware enrichment to an existing browser-based PIM with IndexedDB storage
**Researched:** 2026-03-10
**Confidence:** HIGH for worker memory contention (verified against existing codebase: 3 workers already running, WASM 4GB limit per module documented by ONNX Runtime); HIGH for entity disambiguation false positives (well-documented NER limitation, verified against fuzzy matching literature); HIGH for IndexedDB graph traversal performance (verified against Dexie docs on query limitations); MEDIUM for entity context prompt bloat (extrapolated from existing enrichment patterns); MEDIUM for sanitization-vs-detection NER model coexistence (inferred from codebase architecture, two separate workers already exist); LOW for user correction UX adoption rates (no direct evidence, extrapolated from PIM literature)

---

## Critical Pitfalls

Mistakes that cause rewrites, data corruption, or fundamental architecture problems.

### Pitfall 1: Dual NER Models Competing for Worker Memory Causes OOM on Mobile Devices

**What goes wrong:** The v5.0 entity detection NER (Xenova/bert-base-NER, ~110MB quantized q8) needs to run alongside the existing sanitization NER (sanitize-check, a fine-tuned DistilBERT). Both are loaded via Transformers.js `pipeline()` which holds the full model in WASM memory. The embedding worker already holds MiniLM-L6-v2 (~23MB) plus up to 15 ONNX classifier sessions (type, 4 GTD, decomposition, completeness, 5 missing-info, plus the 10 cognitive models). Adding bert-base-NER in a third worker pushes total WASM memory usage past what mobile browsers will tolerate.

**Why it happens:** Each Web Worker gets its own WASM memory space (up to 4GB theoretical, but mobile browsers impose much lower practical limits -- often 256-512MB per tab total). The existing embedding worker already loads MiniLM + up to 15 ONNX sessions. The sanitization worker loads DistilBERT. Adding a third NER worker for entity detection means three concurrent Transformers.js instances, each with their own ONNX Runtime WASM instantiation.

**Consequences:**
- Tab crash on mobile Safari (iOS imposes ~300MB per-tab memory limit)
- Silent model load failures that degrade to no entity detection without user awareness
- Android Chrome may kill the tab under memory pressure with no error callback

**Prevention:**
- **Share the sanitization worker for entity detection NER.** The sanitization worker already loads a token-classification pipeline. Add a `DETECT_ENTITIES` message type that runs the same pipeline but returns full NER output (PER, LOC, ORG, MISC) instead of filtering to just PII categories. If the sanitization model's NER quality is insufficient for entity detection (it was fine-tuned for PII, not general entity recognition), replace it with bert-base-NER and use it for both purposes.
- **Never run both NER models simultaneously.** If you must use two different models (one for sanitization, one for entity detection), ensure they share a single worker that loads/unloads models based on the current task. Transformers.js pipelines can be nulled and garbage collected.
- **Budget worker memory explicitly.** Set a memory ceiling per worker and monitor via `performance.measureUserAgentSpecificMemory()` (Chrome 89+). Log warnings when approaching limits.
- **Lazy-load entity detection NER.** The existing pattern of lazy-loading ONNX classifiers on first use (see embedding-worker.ts lines 384-400) is correct. Apply the same pattern: entity NER loads only when first item needs entity detection, not at app startup.

**Detection:**
- Memory usage spikes in browser DevTools Performance tab
- Worker `onerror` events with no meaningful error message (OOM manifests as generic failures)
- Model load timeouts (the existing 50ms polling loop in `loadNER()` at sanitization-worker.ts line 92 will spin indefinitely if the model silently fails to load)

**Phase to address:** Phase 1 (architecture) -- worker memory budget must be decided before any model loading code is written.

---

### Pitfall 2: "John" in 50 Items Could Be 5 Different Johns -- Entity Disambiguation Without Context Is Worse Than No Disambiguation

**What goes wrong:** NER extracts named entities (PERSON: "John", "John Smith", "John") from raw content across many items. Without disambiguation, the system treats all "John" mentions as the same entity. The entity registry accumulates false relationships: "John" is connected to "dentist appointment", "Q4 budget review", and "birthday party" -- but these are three different Johns (your son, your colleague, your uncle). The relationship graph becomes noise, and entity-aware enrichment prompts inject misleading context.

**Why it happens:** Pre-trained NER models like bert-base-NER perform token classification -- they identify that "John" IS a person, but they have zero ability to determine WHICH John. Entity resolution (determining whether two mentions refer to the same real-world entity) is a separate, much harder problem that typically requires:
1. Contextual features (co-occurring entities, surrounding text)
2. Coreference resolution (linking pronouns to antecedents within a document)
3. Cross-document entity linking (matching across items)

None of these come for free from a pre-trained NER model.

**Consequences:**
- Entity relationship graph fills with false edges, making it useless for enrichment context
- Users see wrong entity cards ("John: dentist, budget review, birthday" when these are different people)
- Trust erosion: one bad entity merge teaches users the system "doesn't understand" them
- Difficult to repair: once entities are merged, splitting them requires user to manually untangle

**Prevention:**
- **Never auto-merge entities by name alone.** Two mentions of "John" across different items should create two separate entity candidates, not one merged entity. Use conservative matching: exact full name match + contextual similarity (e.g., both mention the same project/domain) before suggesting they might be the same person.
- **Use the existing knowledge-domain cognitive signal as a disambiguation feature.** If one "John" appears in items classified as `work` domain and another in `personal` domain, they are likely different people. The 10 cognitive ONNX models (cognitive-signals.ts) already produce domain classification -- use it.
- **Cluster by co-occurrence, not by name.** "John" + "budget" + "Q4" appearing together in 3 items suggests one entity. "John" + "school" + "homework" in 4 other items suggests a different entity. Build entity clusters from co-occurring entity pairs, not from name matching.
- **Implement merge suggestions, not auto-merges.** When the system suspects two entity clusters might be the same person, surface it as a user correction opportunity: "Is 'John' from your work items the same as 'John' from your family items?" This is the user correction UX the project already plans.
- **Store canonical entity ID + alias list.** The EntityRegistryEntry already has `normalizedText` for dedup -- extend with an `aliases: string[]` field and a `clusterId` for grouping confirmed-same entities.

**Detection:**
- Entity count growing much faster than unique real-world people the user knows
- Multiple entity cards for what is obviously the same person (e.g., "John Smith" and "John S.")
- Enrichment prompts that reference contradictory entity relationships

**Phase to address:** Phase 2 (entity detection and registry design) -- the entity schema and dedup strategy must be designed before any entities are stored.

---

### Pitfall 3: IndexedDB Is Not a Graph Database -- Naive Relationship Traversal Becomes O(N) Full Table Scans

**What goes wrong:** The entity graph grows as every item gets entity-analyzed. A user with 500 items, each mentioning 2-3 entities with 1-2 relationships, creates 2,000-3,000 entityGraph rows. Queries like "find all items related to entity X" or "find entities connected to entity Y through any path" require multiple IndexedDB lookups per hop. Two-hop traversals (entities related to entities related to a given item) become N+1 query patterns that freeze the UI.

**Why it happens:** IndexedDB is a key-value store with secondary indexes, not a graph database. The existing entityGraph table (migration v6) has indexes on `sourceAtomId`, `[sourceAtomId+entityType]`, `entityType`, and `relationship`. These support direct lookups ("what entities does atom X have?") but NOT graph traversals ("what atoms share entities with atom X?" or "what is the shortest path between entity A and entity B?").

The current `getRelationships()` function (entity-graph.ts line 67) already does two parallel queries (outgoing + incoming), which works for single-hop lookups. But entity intelligence requires multi-hop: "John works with Sarah, Sarah is on Project Alpha, Project Alpha has a deadline" -- this is 3 hops, requiring 6+ IndexedDB transactions.

**Consequences:**
- Enrichment prompt generation blocks on slow graph queries (>100ms per hop on mobile)
- Multi-hop relationship inference silently makes the triage pipeline slow
- Users experience "thinking..." delays that grow linearly with entity graph size
- No way to efficiently answer "most connected entities" or "entity clusters" without loading the entire table

**Prevention:**
- **Build an in-memory adjacency index on app load.** Load the entityGraph table once into a `Map<entityValue, Set<sourceAtomId>>` and `Map<sourceAtomId, Set<entityValue>>`. This is ~10KB for 3,000 relationships and makes multi-hop traversal O(1) per hop. The existing architecture already uses in-memory state (the Rust petgraph for atom links, the SolidJS store for reactive state).
- **Cap graph query depth to 2 hops maximum.** Three-hop and deeper traversals produce mostly noise in a personal knowledge graph. Two hops is sufficient for "related through shared entity" queries.
- **Batch entity graph updates.** Use the existing writeQueue pattern (entity-graph.ts line 48 already uses `writeQueue.enqueue()`). When processing multiple items, buffer entity graph writes and flush in a single transaction.
- **Index by entityValue.** The current schema indexes on `sourceAtomId` but NOT on `entityValue`. To answer "what atoms mention John?", you need a full table scan filtered by `entityValue`. Add an index: `entityGraph: '&id, sourceAtomId, [sourceAtomId+entityType], entityType, relationship, entityValue'`.
- **Denormalize entity counts.** Store a `mentionCount` and `lastMentioned` timestamp on the Entity record itself. This avoids counting entityGraph rows for display purposes.

**Detection:**
- DevTools Performance tab shows long IndexedDB transaction times during enrichment
- `getRelationships()` calls exceeding 50ms
- Entity-related UI components causing SolidJS reactivity cascades (the store triggers re-renders for every entity lookup)

**Phase to address:** Phase 1 (architecture) for index design, Phase 2 (entity registry) for in-memory index implementation.

---

### Pitfall 4: Entity Context Injection Bloats Enrichment Prompts Past Token Limits

**What goes wrong:** The enrichment wizard already generates structured prompts with question templates, prior answers, and cognitive signals. Adding entity context ("This item mentions John (your colleague, works on Project Alpha, mentioned in 12 items), Sarah (your manager, mentioned in 8 items)...") can easily add 200-500 tokens per entity. An item mentioning 5 entities adds 1,000-2,500 tokens of entity context before the actual enrichment question is even asked. This pushes prompts past the effective context window for local models (Tier 2 ONNX models have no prompt input) and wastes cloud tokens for Tier 3.

**Why it happens:** Entity context is genuinely useful -- knowing that "John" is "your colleague on Project Alpha" helps generate better follow-up questions. But the impulse is to dump all known entity relationships into the prompt. The enrichment engine currently builds prompts from question templates + prior answers (enrichment-engine.ts). Adding entity context multiplicatively increases prompt size because each entity has its own relationship subgraph.

**Consequences:**
- Cloud API costs spike (Anthropic charges per token)
- Local LLM (WebLLM Tier 3) context window exceeded, causing truncation or hallucination
- Enrichment quality actually decreases because the model attends to entity context noise instead of the actual question
- Longer inference latency for both local and cloud paths

**Prevention:**
- **Budget entity context to a fixed token count (150 tokens max).** Select the 2-3 most relevant entities (by relationship to the current enrichment question category) and summarize each in one line: "John: colleague, Project Alpha". Not full relationship dumps.
- **Use cognitive signals to select relevant entities.** If the enrichment question is about timeframes, inject entities that have deadline relationships. If about delegation, inject entities with collaboration-type signals. The cognitive model army already classifies items by domain, collaboration type, etc.
- **Lazy-inject entity context only when the enrichment category relates to people/places.** For enrichment questions about "What's the desired outcome?" or "How complex is this?", entity context adds nothing. Only inject for questions about delegation, context, references, or next actions.
- **Cache entity summaries.** Generate a one-line summary per entity once and cache it in the Entity record. Do not re-traverse the relationship graph for every enrichment prompt.

**Detection:**
- Enrichment prompt length exceeding 2,000 tokens (monitor in dispatchAI or dispatchTiered)
- Cloud API responses referencing entity relationships that were not asked about (model is distracted by injected context)
- Enrichment latency regression after enabling entity context injection

**Phase to address:** Phase 4 (entity-aware enrichment) -- but the entity summary format should be designed in Phase 2.

---

## Moderate Pitfalls

Mistakes that cause significant rework or poor user experience but do not require full architecture changes.

### Pitfall 5: Sanitization Entity Registry and Knowledge Graph Entity Registry Are Two Different Concepts Sharing Similar Names

**What goes wrong:** The codebase already has an `entityRegistry` Dexie table (Phase 14, v5 migration) used by the sanitization pipeline to map real names to pseudonyms (`<Person 1>`). The v5.0 knowledge graph needs a different kind of entity registry: one that tracks canonical entities (people, places, orgs) with relationships, aliases, metadata, and user corrections. Developers conflate these two registries, either extending the sanitization registry with knowledge graph fields (wrong -- different lifecycle, different access patterns) or creating a confusing naming collision.

**Why it happens:** Both systems deal with "entities" detected by NER. The sanitization registry maps `realText -> pseudonymTag` for privacy. The knowledge graph registry maps `entityMention -> canonicalEntity -> relationships` for intelligence. They even share upstream NER output. The temptation to "just add fields" to `EntityRegistryEntry` is strong.

**Prevention:**
- **Keep them separate.** The sanitization `entityRegistry` table is a privacy mechanism with a clear contract: normalized text + category -> pseudonym ID. The knowledge graph needs a new `entities` table (canonical entity records) and the existing `entityGraph` table (relationship edges). These serve fundamentally different purposes.
- **Feed the knowledge graph FROM sanitization detections.** When the sanitization pipeline detects "John Smith" as PERSON, it creates a pseudonym mapping. Separately, the entity detection pipeline should create or update a canonical entity record in the knowledge graph. The sanitization registry is the privacy gateway; the knowledge graph is the intelligence layer.
- **Name them distinctly.** Use `entityRegistry` for sanitization (already exists), `entities` for the knowledge graph canonical records (new table), and `entityGraph` for relationships (already exists). Never call the knowledge graph table "entityRegistry2" or similar.
- **Document the boundary.** The privacy moat matters: `entityRegistry` data is used for cloud prompt sanitization and MUST NOT leak raw text. Knowledge graph `entities` data contains raw unsanitized entity names because it is local-only (T1/T2 access only, never sent to cloud).

**Phase to address:** Phase 1 (architecture) -- naming and schema decisions before any code is written.

---

### Pitfall 6: NER Entity Boundaries Are Noisy -- "Dr. John Smith Jr." vs "John Smith" vs "John" vs "Smith" Creates Duplicate Entities

**What goes wrong:** Pre-trained NER models produce inconsistent entity boundaries across different input texts. The same person may be detected as "John Smith" in one item, "John" in another, "Dr. Smith" in a third, and "Mr. John Smith Jr." in a fourth. Each of these becomes a separate entity in the registry. The knowledge graph fractures into multiple nodes for the same real person, diluting relationship evidence.

**Why it happens:** NER models classify tokens, not entities. The `aggregation_strategy: 'simple'` used in the sanitization worker (line 110) merges adjacent tokens with the same label, but this is text-span-level merging, not semantic entity resolution. "Dr." may or may not be included in the PERSON span depending on surrounding text. First-name-only mentions are extremely common in personal notes ("Call John about the thing").

**Consequences:**
- Entity graph has 4 nodes for one person, each with partial relationship evidence
- Co-occurrence analysis underestimates connections because mentions are split across fragments
- User correction UX becomes tedious: user must manually merge 4 entity variants
- Enrichment context for "John" misses relationships attributed to "John Smith"

**Prevention:**
- **Normalize entity text before registry lookup.** Strip titles (Dr., Mr., Mrs., Ms., Prof.), suffixes (Jr., Sr., III), and trim whitespace. Apply case-insensitive matching (the sanitization registry already does this via `normalizedText`).
- **Implement substring containment matching.** If "John" is detected and "John Smith" already exists in the registry, consider "John" a likely mention of the same entity (with lower confidence). Use the item's domain context (cognitive signals) to disambiguate.
- **Store all surface forms as aliases.** The canonical entity should have a `displayName` (user-confirmed preferred name) and an `aliases: string[]` of all detected surface forms. Lookup should check against all aliases.
- **Defer auto-merging to user confirmation.** When a new mention "John" could match existing entity "John Smith", create a pending merge suggestion rather than auto-merging. Display in the entity card: "Is 'John' the same as 'John Smith'?"

**Phase to address:** Phase 2 (entity detection and registry) -- normalization rules must be in place before first entity is stored.

---

### Pitfall 7: Relationship Inference False Positives from Keyword Patterns Erode Trust

**What goes wrong:** T1 deterministic relationship inference uses keyword patterns ("anniversary" -> spouse, "boss" -> manager, "deadline" -> work). But context matters enormously: "I forgot my boss's anniversary" doesn't mean the entity is your spouse. "The project deadline is my wife's birthday" creates two relationships (work deadline + spouse birthday) from one sentence, but naive pattern matching might assign "deadline" to the wife entity or "wife" to the project entity.

**Why it happens:** Keyword-based relationship inference operates on co-occurrence within the same text, not on grammatical structure. When multiple entities and multiple relationship keywords appear in the same item, the combinatorial explosion of possible entity-relationship-entity triples creates false positives. Without dependency parsing (which is too expensive for browser-side local inference), there is no reliable way to determine which keyword modifies which entity.

**Consequences:**
- Entity relationship graph accumulates incorrect edges ("Project Alpha is spouse_of John")
- Enrichment context injection references wrong relationships, making AI suggestions unhelpful
- Users lose trust in entity intelligence and stop engaging with correction UX
- Bad relationships compound: future inference builds on incorrect prior relationships

**Prevention:**
- **Use sentence-level co-occurrence, not item-level.** Split item content into sentences (simple period/newline splitting is sufficient). Only infer relationships between entities and keywords that appear in the same sentence.
- **Require entity + keyword proximity.** Only fire a keyword pattern if the keyword appears within 5 tokens of the entity mention. "My wife Pam has a dentist appointment" -> (Pam, spouse) is valid. "Pam emailed about the Q4 report, and my wife reminded me about dinner" -> (Pam, spouse) is a false positive.
- **Assign confidence scores to keyword-inferred relationships.** Start all keyword-inferred relationships at confidence 0.3. Boost by 0.1 for each additional co-occurrence. Only surface relationships above 0.5 in entity cards. Only inject into enrichment prompts above 0.7.
- **Never infer relationship TYPE from a single mention.** Require at least 2 co-occurrences of entity + relationship-suggesting keyword before creating a typed relationship edge. A single mention of "boss" near "Sarah" should create an evidence record, not a confirmed "manager" relationship.
- **Track evidence, not conclusions.** Store individual co-occurrence evidence records (item ID, sentence, entity pair, keyword, timestamp) separately from confirmed relationships. Let evidence accumulate before graduating to a relationship.

**Detection:**
- User corrections (entity card edits) concentrated on relationship types rather than entity identity
- Relationship graph has more edges than the user would expect for their data volume
- Enrichment prompts reference relationships the user has never explicitly stated

**Phase to address:** Phase 3 (relationship inference) -- evidence accumulation design must precede any relationship creation.

---

### Pitfall 8: SolidJS Store Reactivity Cascade from Entity Data Updates

**What goes wrong:** The SolidJS store (~1,500+ lines) drives all UI reactivity. Adding entity data (entity cards, relationship badges, entity-aware search results) to the store creates new reactive dependencies. When entity detection runs on item triage and updates entity counts/relationships in the store, every component subscribed to any entity data re-renders. On a triage batch of 10 items, this means 10 entity updates triggering cascading re-renders of entity cards, relationship badges, and entity-context sections.

**Why it happens:** SolidJS fine-grained reactivity is efficient for isolated signals but creates performance problems when deeply nested store objects change frequently. The known gotcha (from MEMORY.md) about function callbacks in createStore is one symptom; the broader issue is that entity data changes frequently (every item triage adds/updates entities) while the UI shows entity data in multiple places simultaneously.

**Consequences:**
- UI jank during triage batches (the user sees flickering entity cards)
- Main thread blocked by reactive propagation while workers are doing useful inference
- Memory leaks from orphaned reactive subscriptions on entity components that mount/unmount

**Prevention:**
- **Keep entity data outside the main store.** Use a separate `createSignal` or lightweight signal map for entity state, not nested objects in the main createStore. This isolates entity reactivity from the rest of the UI.
- **Batch entity store updates.** Use SolidJS `batch()` to group all entity updates from a single triage operation into one reactive flush. Do not update the store per-entity; collect all entity changes and apply them in one batch.
- **Use `createResource` for entity lookups.** Entity data fetched from Dexie should use SolidJS `createResource` which handles async data loading with built-in Suspense support, rather than manually setting store properties from async callbacks.
- **Never store entity graph traversal results in the store.** Compute relationship summaries on-demand (in component `createMemo`) rather than storing pre-computed relationship data that goes stale.

**Detection:**
- SolidJS DevTools showing excessive reactive updates during triage
- `performance.mark()` measurements showing >16ms between triage entity updates
- Entity-related components appearing in React/Solid profiler as frequent re-renderers

**Phase to address:** Phase 2 (entity registry) for data architecture, Phase 4 (entity-aware enrichment) for UI integration.

---

## Minor Pitfalls

Issues that cause friction or suboptimal behavior but have straightforward fixes.

### Pitfall 9: User Correction UX Complexity vs. User Willingness to Correct

**What goes wrong:** The system offers rich entity correction UX: edit entity names, merge entities, change relationship types, confirm/deny suggested relationships. But users of personal information tools rarely engage with correction UX. They want the system to "just work" and will tolerate imperfect entity detection rather than spend time correcting it. Over-investing in correction UX that nobody uses wastes development effort.

**Prevention:**
- **Start with binary corrections only.** "Is this right? Yes / No" is the maximum cognitive load for entity corrections. Save multi-field editing for a later phase.
- **Inline corrections in existing flows.** Don't create a separate "Entity Management" page. Show entity corrections inline in entity cards that appear during triage or enrichment.
- **Track correction engagement rates.** If <5% of shown corrections get user input after 2 weeks, the UX is too complex. Simplify.

**Phase to address:** Phase 5 (user correction UX) -- but keep it simple in Phase 2 by designing for binary input first.

---

### Pitfall 10: Entity Detection Running on Every Keystroke During Capture

**What goes wrong:** If entity detection is wired to run on content changes (like the existing type classification), it will fire NER inference on every keystroke during inbox capture. NER is much slower than classification (~50-200ms per inference vs ~5ms for ONNX classifiers), causing visible lag during typing.

**Prevention:**
- **Run entity detection on item commit, not on text change.** Trigger NER only when an item is saved/triaged, not during editing. The sanitization pipeline already follows this pattern (sanitizeText is called before cloud dispatch, not during typing).
- **Debounce with a minimum of 1 second if running during editing.** If live entity detection is desired for preview purposes, debounce aggressively and show results as non-blocking suggestions.

**Phase to address:** Phase 2 (entity detection pipeline wiring).

---

### Pitfall 11: CRDT-Friendly Schema Design Forgotten Until v7.0 Makes It Expensive

**What goes wrong:** The entity and relationship tables are designed for single-device use. When v7.0 CRDT sync arrives, entity merges, relationship conflicts, and pseudonym ID collisions across devices create intractable merge problems. Retrofitting CRDT-friendly schemas onto existing data is a migration nightmare.

**Prevention:**
- **Use UUIDs for all entity IDs (already happening via crypto.randomUUID()).** Never use auto-incrementing IDs that will collide across devices.
- **Add a `deviceId` field to entity and relationship records now.** This costs nothing in v5.0 but saves a migration in v7.0.
- **Design merge semantics for entities early.** Two devices detecting "John Smith" should merge cleanly. Two devices creating conflicting relationship types for the same entity pair need a resolution rule. Document these rules even if v7.0 is far away.
- **Use Lamport timestamps on entity/relationship records.** The existing changelog already uses `lamportClock`. Extend this pattern to entity tables.

**Phase to address:** Phase 1 (architecture) -- schema design should include CRDT fields even if sync is deferred.

---

### Pitfall 12: Existing entityGraph Table Schema Insufficient for Knowledge Graph Needs

**What goes wrong:** The current entityGraph table (Phase 19, v6 migration) was designed for clarification-derived relationships (has-outcome, has-deadline, etc.). It stores `sourceAtomId -> entityType + entityValue + relationship + targetValue`. But knowledge graph entities need: canonical entity records with metadata, bidirectional entity-to-entity relationships (not just atom-to-entity), confidence scores, evidence provenance, and user confirmation status. Trying to overload the existing entityGraph schema for these purposes creates an impedance mismatch.

**Prevention:**
- **Add a new `entities` table for canonical entity records.** Fields: id, displayName, type (person/place/org), aliases[], mentionCount, firstSeen, lastSeen, userConfirmed, deviceId, lamportClock. This is separate from entityGraph which stores edges.
- **Extend entityGraph with confidence and provenance.** Add `confidence: number` (0-1), `source: 'ner' | 'keyword' | 'cooccurrence' | 'user'`, and `confirmed: boolean` fields. This allows the system to distinguish high-confidence user-confirmed relationships from low-confidence auto-inferred ones.
- **Add entityId foreign key to entityGraph.** Currently entityGraph uses `entityValue` (raw string). It should reference the canonical entity record by ID so that entity merges propagate to all relationships.

**Phase to address:** Phase 1 (architecture) -- Dexie schema migration must be planned before any entity data is stored.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Architecture / Schema Design | Pitfall 5 (registry naming confusion), Pitfall 12 (insufficient schema), Pitfall 11 (missing CRDT fields) | Design all three tables (entityRegistry for sanitization, entities for knowledge graph, entityGraph for relationships) with clear separation and CRDT-ready fields before writing any code |
| Entity Detection Pipeline | Pitfall 1 (dual NER OOM), Pitfall 10 (keystroke inference), Pitfall 6 (boundary noise) | Share NER worker, trigger on commit not keystroke, normalize entity text before lookup |
| Entity Registry & Dedup | Pitfall 2 (John disambiguation), Pitfall 6 (surface form fragmentation) | Never auto-merge by name alone, use domain signals for disambiguation, store aliases |
| Relationship Inference | Pitfall 7 (keyword false positives) | Sentence-level co-occurrence, proximity requirement, evidence accumulation before relationship creation |
| Entity-Aware Enrichment | Pitfall 4 (prompt bloat), Pitfall 8 (reactivity cascade) | 150-token entity context budget, batch store updates, compute summaries on-demand |
| User Correction UX | Pitfall 9 (complexity vs willingness) | Binary yes/no corrections first, inline in existing flows, track engagement |
| Graph Queries | Pitfall 3 (IndexedDB traversal performance) | In-memory adjacency index, 2-hop max depth, add entityValue index to schema |

## Sources

- [ONNX Runtime Web: Working with Large Models](https://onnxruntime.ai/docs/tutorials/web/large-models.html) -- 4GB WASM memory limit, quantization strategies
- [ONNX Runtime: Memory Consumption](https://onnxruntime.ai/docs/performance/tune-performance/memory.html) -- memory tuning for multiple models
- [Dexie.js: Main Limitations of IndexedDB](https://dexie.org/docs/The-Main-Limitations-of-IndexedDB) -- poor query methods, no join support
- [Named Entity Recognition Complete Guide (Kairntech)](https://kairntech.com/blog/articles/the-complete-guide-to-named-entity-recognition-ner/) -- NER disambiguation challenges
- [Entity Resolution: Needs and Challenges (Towards Data Science)](https://towardsdatascience.com/an-introduction-to-entity-resolution-needs-and-challenges-97fba052dde5/) -- entity deduplication complexity
- [Handling Nicknames and Variants in Data Matching (Data Ladder)](https://dataladder.com/managing-nicknames-abbreviations-variants-in-entity-matching/) -- name normalization patterns
- [Fuzzy Matching Guide (WinPure)](https://winpure.com/fuzzy-matching-guide/) -- fuzzy matching limitations for entity resolution
- Existing codebase: `src/workers/sanitization-worker.ts`, `src/search/embedding-worker.ts`, `src/storage/entity-graph.ts`, `src/ai/sanitization/`, `src/ai/tier2/cognitive-signals.ts`
