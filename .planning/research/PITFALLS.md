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

---

---

# v5.5 Cortical Intelligence Pitfalls

**Domain:** Adding context gating, predictive enrichment, sequence learning, and binder-type specialization to an existing local-first PWA with 10+ ONNX models
**Researched:** 2026-03-12
**Confidence:** HIGH for worker memory explosion (verified: OOM issues documented for ONNX on iOS Safari, existing worker already near limits); HIGH for sequence model overfitting (well-documented LSTM small-data failure mode); HIGH for BinderTypeConfig premature abstraction (Rule of Three is a firmly established principle); MEDIUM for gate threshold calibration (extrapolated from gating mechanism literature); MEDIUM for predictive enrichment trust erosion (supported by human-AI trust research, not directly measured here)

---

## Critical Pitfalls (v5.5)

### Pitfall 13: Sequence Model Added to Existing Embedding Worker Causes OOM on iOS Safari

**What goes wrong:**
The embedding worker already hosts MiniLM-L6-v2 (~23 MB), up to 15 ONNX classifier sessions (type, GTD x4, decomposition, completeness, missing-info x5), and the 10 cognitive signal models. Adding a sequence model (LSTM or attention head, even quantized at 5-15 MB) to this same worker causes peak memory during concurrent inference that crashes iOS Safari. The worker dies silently — no TypeScript exception propagates to the main thread — and the entire T2 pipeline silently falls back to T1 heuristics. The user sees no error. All GTD enrichment stops working.

**Why it happens:**
Each `onnxruntime-web` `InferenceSession` allocates its own segment of the WASM heap. With `numThreads: 1` (required — the codebase already enforces this to avoid SharedArrayBuffer requirements), sessions cannot share memory. On iPhone 13/14/15, the practical per-tab WASM memory ceiling is ~300-500 MB total across all workers. The embedding worker is already holding several hundred MB of model weights; the sequence model pushes it over during the simultaneous inference that happens on atom triage (embedding + type classification + cognitive signals all fire at once).

**How to avoid:**
Create a dedicated `sequence-worker.ts` that holds ONLY the sequence model. This worker accepts pre-computed float32 embedding arrays (produced by the existing embedding worker) via `postMessage` — it does NOT re-embed raw text. This means the sequence model has zero MiniLM dependency and only needs to allocate memory for the small LSTM/attention model itself. Keep both workers under a 150 MB budget each. Instrument memory via `performance.measureUserAgentSpecificMemory()` (Chrome) and worker termination events (both platforms) to catch regressions before mobile testing.

**Warning signs:**
- T2 classification stops completing for triage items after adding sequence model (silent OOM)
- iPhone test device gets hot or unresponsive during a triage batch of 5+ items
- Sequence model loads fine on desktop Chrome but fails silently on Safari iOS
- Worker-terminated events in DevTools with no caught TypeScript exception

**Phase to address:**
Sequence learning phase — separate-worker architecture must be the first design decision, before any LSTM training begins.

---

### Pitfall 14: Context Gate Thresholds Never Measured, Providing No Actual Benefit

**What goes wrong:**
Context gating is implemented with intuitive threshold values ("activate energy-level agent only if hour >= 18", "suppress review-cadence agent if atom count < 5"). These thresholds are never validated against real classification behavior. The result is either over-gating (agents suppressed so often they provide no incremental coverage) or under-gating (every agent activates for every atom, achieving nothing over the current always-on approach). Neither failure is obvious because the system "works" in both cases — atoms get classified, but gating provides zero measurable benefit.

**Why it happens:**
Gating feels like a configuration problem, so developers set values from intuition rather than measurement. The existing harness evaluates entity graph quality (F1 on entity relationships), not gate activation recall or precision. Without a gate-specific metric, there is no feedback signal. The gap between "gating is wired up" and "gating is actually doing something useful" is invisible.

**How to avoid:**
Define a gate activation audit log in the intelligence sidecar (`atomIntelligence.gatingDecisions[]`) BEFORE implementing any predicates. For each classification event, record: which agents were gated out, what the predicate values were, and what the final classification confidence was. After N atoms or a harness simulation day, compute gate suppression rate per agent and correlation between suppression and classification confidence changes. Set initial thresholds loose (suppression rate < 20%) and tighten empirically. The harness must simulate a full synthetic day (morning/afternoon/evening atom patterns) to validate temporal predicates before they ship.

**Warning signs:**
- Gate suppression rate > 80% for any single agent (over-gating — that agent is effectively disabled)
- Gate suppression rate < 5% across ALL agents (under-gating — gating is theater)
- Classification confidence is statistically identical with gating enabled vs disabled after a harness run
- Specific binder types or routes never trigger any specialized agents at all

**Phase to address:**
Context gating phase — log-first, gate-second. The gating audit schema must exist before any predicates are written.

---

### Pitfall 15: Predictive Enrichment Destroys User Trust Before Entity Graph Matures

**What goes wrong:**
Predictive enrichment proactively surfaces questions or suggestions before the user requests them. When the entity graph is sparse (new user with 30-50 atoms and 5-10 entities), the evidence basis for "what will this user need next?" is thin. Predictions are frequently wrong: predicting "health" questions for a work task, predicting delegation questions for a solo item, predicting follow-ups on enrichment that was already completed. Each wrong prediction is a friction event. Users build dismissal habits after 3-5 wrong predictions. Once dismissal is habitual, even accurate predictions are reflexively dismissed. The feature cannot recover without a visible UX redesign.

**Why it happens:**
Developers test predictive enrichment with their own data after months of use. Cold-start failure (first week, sparse data) is never observed during development. The harness generates balanced synthetic persona data that masks the cold-start distribution problem.

**How to avoid:**
Gate predictive enrichment behind a minimum evidence threshold: at least 25 atoms processed through full enrichment, at least 5 entities with 2+ confirmed relations each. Show a progress indicator toward this threshold so users understand why predictions are not yet active. When predictions do start, make the prediction source visible inline ("Based on your work patterns on weekday mornings...") so users can evaluate correctness rather than blindly accept or dismiss. Implement an explicit one-tap "this was wrong" button that decrements confidence for that prediction class. Start predictions in passive-display mode (sidebar strip, not interrupting triage flow) before promoting to active suggestions. Never show predictions that duplicate already-answered enrichment categories on the same atom.

**Warning signs:**
- Dismissal rate for predictive suggestions > 60% in first week
- Users complete enrichment without touching any predictive suggestions
- Predictions repeat enrichment categories already answered on that atom
- Harness simulation shows prediction accuracy < 40% on day-1 data

**Phase to address:**
Predictive enrichment phase — cold-start gating and passive-first mode must be encoded in requirements, not left as implementation choices.

---

### Pitfall 16: LSTM Sequence Model Trained on Synthetic Harness Data Fails on Real Personal Data

**What goes wrong:**
The sequence model is trained on synthetic persona atom sequences from the harness (Alex Jordan, Dev Kumar, Maria Santos, etc.). Real user atom sequences have fundamentally different statistical properties: multi-day runs of similar atom types (users focus on one project for days), irregular gaps (weeks of inactivity during holidays), and idiosyncratic personal vocabulary the synthetic personas do not capture. The model learns the synthetic distribution — it benchmarks well in harness scoring but generalizes poorly to real personal use. This is not detected until real users notice that enrichment suggestions feel "off" in ways they cannot articulate.

**Why it happens:**
The harness generates diverse, balanced atom sequences to cover all classification cases. Real usage is bursty, repetitive, and personal. The gap between synthetic training distribution and personal usage distribution is a known ML pitfall that is easy to overlook when harness numbers look good. The adversarial cycle currently evaluates entity graph quality, not sequence model generalization.

**How to avoid:**
Treat the sequence model as a weak prior, not a strong predictor. Feed its output as a soft additive bias (logit delta) into T2 classifiers, never as a hard override. Cap the maximum influence of the sequence signal to ±0.15 on any single classifier logit — if removing the sequence signal changes the top-1 classification, something is wrong with the cap. Implement sequence signal strength as a tunable constant (`SEQUENCE_SIGNAL_WEIGHT`) in the harness so ablation experiments can quantify its contribution. Before shipping, run an ablation: harness F1 with sequence signal enabled vs disabled. If the improvement is < 2% F1, the model is adding noise. The sequence window must be fixed at N=20 atoms max (sliding, not cumulative) to prevent inference time growth as users accumulate history.

**Warning signs:**
- Sequence model confidence consistently > 0.85 on first 5 atoms from any new user (impossible with sparse context — signals overfit)
- Removing the sequence signal improves harness F1 (it is actively degrading performance)
- Harness F1 with sequence signal is > 5% higher than observed accuracy on real data
- Sequence signal recommendations are identical across different binder types (not learning type-specific patterns)

**Phase to address:**
Sequence learning phase — the weak-prior constraint and the ±0.15 logit cap must be in the model architecture before training, not added after noticing degradation.

---

### Pitfall 17: BinderTypeConfig Interface Is GTD-in-Disguise

**What goes wrong:**
`BinderTypeConfig` is designed with GTD as the sole reference implementation and a hypothetical second binder type in mind. Because there is only one concrete implementation, the interface ends up shaped exactly like GTD: GTD horizon labels (`runway`, `10k-projects`) become required interface fields; GTD agent activation predicates (checking `gtdHorizon` or `nextActionContext`) become the assumed defaults; the harness SDK surface is defined by what the adversarial cycle needs for GTD, not by what a non-GTD binder type would need. When a real second binder type is built (v6.0 or community contribution), the interface must be broken to accommodate it, requiring a migration across all callers.

**Why it happens:**
Designing an abstraction from one implementation is the classic premature abstraction failure. A well-designed plugin interface requires at least two concrete implementations with meaningfully divergent requirements to avoid the interface collapsing into its single implementation's shape. GTD is the only binder type — there is no divergence case to inform what should be generic vs type-specific.

**How to avoid:**
Before shipping `BinderTypeConfig`, mock out a non-functional second binder type (e.g., "Reading List" with atom types: book, author, theme, note) and validate that the base interface accommodates it without any GTD-specific leakage. Specific rules: GTD horizon labels must NOT appear in the base interface — they belong in `GTDBinderTypeConfig extends BinderTypeConfig`. Agent activation predicates in the base interface must be expressible as pure functions on the universal atom schema (`AtomType`, `createdAt`, `content`), not on GTD-specific fields. The harness SDK surface must be defined by what any binder type would need (corpus generation, scoring, persona simulation), not by what the GTD adversarial cycle currently does. Ship NO new binder-type UI in this milestone — `BinderTypeConfig` is internal infrastructure only.

**Warning signs:**
- `BinderTypeConfig` base interface has fields named `gtd*` or referencing GTD-specific concepts
- A stub `ReadingListBinderTypeConfig` requires empty/null values for > 30% of required fields
- Agent activation predicates reference `atom.gtdContext`, `atom.gtdHorizon`, or similar GTD fields
- Harness SDK functions have GTD-specific parameters that non-GTD callers would need to pass as `null`

**Phase to address:**
Binder-type specialization phase — the interface design review must use a concrete second-type mock as a forcing function, even if that type never ships in v5.5.

---

### Pitfall 18: Harness SDK Refactor Silently Breaks Existing Adversarial Tests

**What goes wrong:**
The harness is refactored from adversarial-focused scripts into a general SDK. During refactoring, the function signatures in `adversarial-cycle.ts`, `score-graph.ts`, and `run-adversarial.ts` change to accommodate the more general SDK contract. Existing adversarial cycle tests that validated entity graph quality (the v5.0 investment) silently break — they still compile and run, but evaluate against wrong baselines or skip assertions that relied on old interface shapes. TypeScript structural typing means breaking changes that preserve the call shape (same function name, compatible parameter types) compile without error even if the semantics changed.

**Why it happens:**
The harness is TypeScript scripts, not a proper test framework with explicit assertion contracts. A function that previously returned `{ precision: number; recall: number; f1: number }` now returns `{ score: number; breakdown: Record<string, number> }` — TypeScript compiles both callers cleanly, but the second form cannot reproduce the original assertions. The adversarial cycle is complex enough that a partial API break produces plausible-looking but wrong output rather than a thrown exception.

**How to avoid:**
Before any harness refactoring begins, snapshot the current adversarial cycle output for all existing personas as golden files: `scripts/harness/baselines/{persona-id}/pre-refactor-scores.json`. Any harness change that moves any score by more than 2% must be flagged as a breaking change requiring explicit justification. Keep `run-adversarial.ts` as a thin stable wrapper that calls into the new SDK — do not rewrite it. At SDK boundaries, add TypeScript discriminant union checks (not just structural compatibility) so type changes fail at compile time rather than runtime. The adversarial cycle must run and produce identical output to the golden files within tolerance before any SDK refactor is merged.

**Warning signs:**
- Adversarial cycle completes without errors but all graph scores are 0.0 or 1.0 (degenerate output)
- Entity counts in harness reports drop to zero after refactor (entity store interface broken)
- Score changes > 5% across all personas simultaneously without any model change (systematic interface break, not a real improvement)
- TypeScript compiles clean but `score-graph.ts` returns fields with `undefined` values

**Phase to address:**
Binder-type specialization / harness SDK phase — golden-file baselines must be captured before any refactoring begins.

---

### Pitfall 19: Adding New Cognitive Models Instead of Tuning Existing 10

**What goes wrong:**
The cortical intelligence framing suggests architectural expansion. A new `binder-activity-level` or `sequence-context` cognitive model gets proposed because it "fits the cortical pattern." It gets built and added to the embedding worker. Meanwhile the existing 10 cognitive models have known weaknesses documented in the harness ablation reports (scripts/harness/personas/). The new model adds memory pressure without addressing root classification gaps, the existing models continue underperforming in the same ways, and the worker budget is consumed by redundant measurement.

**Why it happens:**
Building a new model is visibly productive; tuning an existing model requires reading ablation data and writing targeted training examples — less visible as progress. The cortical intelligence framing implicitly suggests new architectural components rather than optimization of what exists.

**How to avoid:**
Establish a standing model budget: the embedding worker + sequence worker combined must stay under 300 MB on mobile (150 MB per worker). Any new model must pass a pre-addition review against three questions: (a) does it address a gap provable from existing harness ablation data? (b) can an existing model be augmented instead of replaced? (c) what model is retired or merged to offset the memory cost? The 10 existing cognitive models cover cognitive-load, emotional-valence, energy-level, gtd-horizon, information-lifecycle, knowledge-domain, priority-matrix, review-cadence, collaboration-type, time-estimate — a new model in any of these semantic areas is almost certainly redundant. New models that correlate > 0.7 with existing models are measuring the same thing twice.

**Warning signs:**
- Total model count across all workers exceeds 13 without a documented retirement
- New model training data overlaps > 60% with an existing model's training data labels
- Harness ablation shows new model signal correlates > 0.7 with an existing signal
- No ablation data cited in the PR description justifying the new model

**Phase to address:**
All phases — establish the 300 MB combined worker memory budget as a standing constraint before sequence model training specifications are written.

---

## Technical Debt Patterns (v5.5)

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hard-code gating thresholds as constants | Ships fast, no audit infrastructure needed | Thresholds never get tuned; gating provides no measurable benefit permanently | Never — use configurable values with audit logging from day one |
| Put sequence model in embedding worker | Avoids new worker architecture | OOM on iOS, silent failure cascade across all T2 classification | Never — memory risk is documented and too high |
| Design BinderTypeConfig from GTD shape alone | Ships the interface fast | Interface is GTD-in-disguise; breaks when real second type arrives | Only if second binder type is explicitly out of scope for 3+ milestones AND interface is clearly annotated `@gtd-specific` in a prominent docstring |
| Use harness synthetic sequences as-is for LSTM training without influence cap | Re-uses existing corpus, no new training data needed | Sequence model overfits synthetic distribution; fails on real personal data without the cap catching it | Acceptable for initial baseline if and only if the ±0.15 logit cap is enforced and ablation is required before ship |
| Skip passive-first mode for predictive enrichment | Simpler UX implementation | Aggressive predictions during cold start destroy user trust before graph matures | Never — passive mode is a single display flag, not a major feature |
| Treat gate audit log as optional | Reduces sidecar write volume | Cannot tune gating without audit data; gating is permanently unmeasurable | Never if gating is a shipped feature claiming to provide benefit |

---

## Integration Gotchas (v5.5)

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Sequence worker → Embedding worker | Pass raw atom text to sequence worker, causing it to load MiniLM internally | Pass pre-computed float32 embedding arrays from embedding worker via `postMessage`; sequence worker never touches MiniLM |
| Gating predicates → Cognitive signal outputs | Evaluate gating predicates by triggering live ONNX inference | Cache last classification's cognitive signals in the intelligence sidecar; predicates read the cache, not live inference |
| Sequence signal → T2 classifier pipeline | Replace T2 classifier output with sequence model prediction | Inject sequence signal as additive logit delta AFTER base classifier produces scores; never substitute or override |
| BinderTypeConfig → GTD agent handlers | Register GTD-specific handlers as the "default" tier handlers | Register GTD handlers explicitly under a GTD binder type ID; default T1 handlers are universal and type-agnostic |
| Harness SDK → existing adversarial cycle | Rewrite `adversarial-cycle.ts` to use new SDK interfaces | SDK wraps the adversarial cycle as a thin adapter; do not rewrite the cycle itself |
| Predictive enrichment → intelligence sidecar | Write predictions into `atomIntelligence.enrichment[]` alongside confirmed user Q&A | Write to a distinct `atomIntelligence.predictions[]` field; confirmed Q&A and speculative predictions must never share the same array |

---

## Performance Traps (v5.5)

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Gating predicate evaluated on main thread per atom | UI jank during rapid inbox triage | All gating logic runs inside the embedding worker (co-located with T2 classifiers); predicates are pure functions of cached signals | Breaks at ~10 atoms/minute if any DOM access occurs |
| Sequence `InferenceSession` re-initialized per inference | 200-400 ms cold-start latency per atom on mobile | Keep session alive as singleton in sequence worker; only terminate on explicit `UNLOAD_SEQUENCE` message | Breaks immediately on first use if session is not persistent |
| Cognitive signal army fires fresh inference for every gate check | 10x ONNX inference overhead per gate evaluation | Gate predicates read from sidecar cache (last classification result); cache invalidates only on new atom classification, not on route changes | Breaks when gate checks are triggered by UI navigation events rather than atom triage events |
| LSTM sequence window grows unbounded | Inference latency increases as user accumulates atoms (doubles every ~50 atoms without windowing) | Fix window at N=20 atoms max; always a sliding window over recent history, never full accumulation | Latency regression becomes user-visible at ~100 atoms |
| IndexedDB writes for gate audit log on every atom | Storage I/O thrashing on iPhone, slow triage | Batch gate audit writes; flush every 10 events or every 30 seconds, whichever comes first | Breaks at ~5 atoms/minute on mobile with slow IndexedDB |

---

## Privacy Mistakes (v5.5)

| Mistake | Risk | Prevention |
|---------|------|------------|
| Sequence context cache (last N embeddings) stored in IndexedDB | Raw embedding vectors are partial content fingerprints that bypass the intelligence sidecar boundary | Store last N embeddings only in sequence worker memory; only classification results (not embedding vectors) go to IndexedDB |
| Predictive enrichment suggestions stored with atom content fragments | Unconfirmed predictions about user intent persist in a queryable table | Predictions store only category labels and confidence scores, never any atom text fragment |
| Binder type ID sent to cloud T3 during enrichment prompts | Binder type reveals usage context (a "Medical Records" binder type signals health issues to cloud) | Binder type config is local-only; cloud T3 never receives binder type, only sanitized atom content |
| Harness SDK corpus contains real user atom data | Developer accidentally ships corpus.json with personal data in the SDK distribution | Harness SDK validates that all corpus items have synthetic persona ID prefixes; real data paths are blocked at SDK boundary with a runtime check |

---

## UX Pitfalls (v5.5)

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Predictive enrichment interrupts triage flow | User is mid-triage; a prediction appears as a modal or inline insert; they lose context | Predictions appear only in a passive sidebar strip; user pulls them into the active flow if interested; never interrupt |
| Context gating makes agents disappear without explanation | User saw "energy level" suggestion yesterday, it's gone today; feels like a bug | When an agent is gated out, its category remains visible but shows a muted "not relevant right now" state; gating is always transparent |
| Sequence learning changes classification results users trusted | Task classified differently than yesterday (sequence context shifted); feels inconsistent and arbitrary | Sequence signal is additive with a ceiling; if it would flip the top-1 classification, show a "similar to recent patterns" indicator rather than silently changing the result |
| Binder type label appears in UI before a second binder type exists | Users click to explore other binder types; nothing exists; disappointment and expectation drift | No binder-type UI ships in this milestone; BinderTypeConfig is internal infrastructure only; GTD remains the implicit default everywhere |
| Predictive enrichment predicts wrong relationship type in cold start | User sees "Your contact John appears to be a manager" when John is their spouse | Cold-start gate prevents predictions until minimum evidence threshold is met; prediction confidence is always displayed; one-tap correction immediately and permanently demotes that prediction class |

---

## "Looks Done But Isn't" Checklist (v5.5)

- [ ] **Context gating:** Gate audit log schema exists in intelligence sidecar AND is being written — verify by checking `atomIntelligence` records after a triage batch contains `gatingDecisions` field
- [ ] **Context gating:** Gating is measurably reducing compute — verify that suppressed agents are NOT running internally and discarding output; they must be skipped entirely
- [ ] **Predictive enrichment:** Cold-start threshold is enforced — verify that a fresh-user session with 0 atoms and 0 confirmed entity relations produces zero prediction events
- [ ] **Predictive enrichment:** Prediction results live in `atomIntelligence.predictions[]`, not mixed into `atomIntelligence.enrichment[]` — verify schema separately from implementation
- [ ] **Sequence learning:** Sequence model is in its own worker — verify by checking DevTools worker list during triage; should show 3 workers (BinderCore, embedding, sequence), not 2
- [ ] **Sequence learning:** Sequence signal is capped at ±0.15 logit — verify ablation: disabling sequence signal changes final classification in < 5% of cases
- [ ] **Binder-type specialization:** Base `BinderTypeConfig` interface has no GTD-specific fields — verify by checking that a stub `ReadingListBinderTypeConfig` compiles with zero `null` hacks for GTD fields
- [ ] **Binder-type specialization:** Harness golden-file baselines captured before any refactoring — verify `scripts/harness/baselines/` contains pre-refactor entity graph scores for all personas
- [ ] **Model budget:** Combined embedding worker + sequence worker memory is measured on mobile Safari — verify via Safari Web Inspector process memory during a 5-atom triage batch; must be < 300 MB combined

---

## Recovery Strategies (v5.5)

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Sequence model in embedding worker causes OOM | HIGH | Migrate to dedicated `sequence-worker.ts`; new postMessage protocol; update all callers; 2-3 day rework minimum |
| Over-gated agents (> 80% suppression) | LOW | Loosen threshold constants; no schema change; deploy same day |
| Under-gated agents (gating is theater) | MEDIUM | Audit gate activation log; identify always-true predicates; redesign predicate logic; 1 day |
| Predictive enrichment dismissal habit formed | HIGH | Cannot un-train dismissal habit; requires distinct visual redesign of prediction UI so users do not associate new appearance with old behavior; 1-2 week rework |
| BinderTypeConfig is GTD-shaped when second type arrives | HIGH | Must break interface; add GTD-specific extension; migrate all callers; rewrite risk proportional to how many consumers have accumulated |
| Harness adversarial tests silently broken by SDK refactor | MEDIUM | Restore golden-file baselines; diff against current output; identify regression source; fix interface; 1-2 days if baselines exist, weeks if not |
| LSTM overfits synthetic corpus | MEDIUM | Reduce model capacity (fewer LSTM units); add dropout; enforce ±0.15 cap; retrain in Python (1-2 hours); no product code changes required |

---

## Pitfall-to-Phase Mapping (v5.5)

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Worker OOM from sequence model (P13) | Sequence learning — architecture decision first | DevTools + Safari Inspector: each worker < 150 MB during 5-atom triage |
| Gate thresholds never measured (P14) | Context gating — audit schema before predicates | Harness reports include gate suppression rate per agent per binder type |
| Predictive enrichment as smart spam (P15) | Predictive enrichment — cold-start gate + passive mode in requirements | Fresh-user session produces zero predictions; dismissal rate < 30% in harness simulation |
| LSTM trained on synthetic, fails on real (P16) | Sequence learning — weak-prior + ±0.15 cap in architecture | Ablation: sequence signal changes top-1 classification in < 5% of harness cases |
| BinderTypeConfig as GTD-in-disguise (P17) | Binder-type specialization — mock second type before interface ships | Stub `ReadingListBinderTypeConfig` compiles with zero null hacks |
| Harness refactor breaks adversarial tests (P18) | Binder-type specialization — golden files before any refactor | All persona scores within 2% of pre-refactor baselines |
| Model proliferation (P19) | All phases — 300 MB combined worker budget as standing constraint | Worker memory < 300 MB combined on iPhone 13; model count < 13 total |

---

## Sources (v5.5)

- ONNX Runtime Web iOS OOM: [Issue #22086](https://github.com/microsoft/onnxruntime/issues/22086)
- ONNX Runtime memory tuning: [official docs](https://onnxruntime.ai/docs/performance/tune-performance/memory.html)
- Gating mechanisms — over/under-gating patterns: [Shadecoder 2025](https://www.shadecoder.com/topics/gating-mechanism-a-comprehensive-guide-for-2025)
- LSTM overfitting on small datasets: [MachineLearningMastery](https://machinelearningmastery.com/diagnose-overfitting-underfitting-lstm-models/), [PyTorch Forums LSTM small dataset](https://discuss.pytorch.org/t/lstm-for-small-dataset/54805)
- Premature abstraction — single implementation trap: [Better Programming](https://betterprogramming.pub/avoiding-premature-software-abstractions-8ba2e990930a), [3d-logic blog](https://blog.3d-logic.com/2024/04/12/the-self-inflicted-pain-of-premature-abstractions/)
- AI prediction trust and dismissal habit: [MIT News](https://news.mit.edu/2022/ai-predictions-human-trust-0119), [Human-AI Trust PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC12561693/)
- Codebase: `src/workers/sanitization-worker.ts`, `src/search/embedding-worker.ts`, `src/ai/tier2/cognitive-signals.ts`, `src/ai/tier2/pipeline.ts`, `scripts/harness/harness-types.ts`, `scripts/harness/adversarial-cycle.ts`

---
*Pitfalls research for: cortical intelligence additions (context gating, predictive enrichment, sequence learning, binder-type specialization) to BinderOS local-first PWA*
*Researched: 2026-03-12*
