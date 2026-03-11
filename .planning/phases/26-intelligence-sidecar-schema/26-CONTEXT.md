# Phase 26: Intelligence Sidecar + Schema - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Dexie v9 migration that creates the `atomIntelligence` sidecar table, replaces the Phase 19 `entityGraph` with proper `entities` + `entityRelations` tables, adds `smartLinks[]` to atoms, and refactors enrichment from text-appending in atom.content to structured sidecar records. This is schema + plumbing — no new AI behaviors, no entity detection, no relationship inference.

</domain>

<decisions>
## Implementation Decisions

### Enrichment migration strategy
- **Wipe all existing enrichment data** — no migration of prior enrichment answers from atom.content
- Eager v9 migration: strip `\n---\n` enrichment sections from all atom/inbox content
- Reset `maturityScore`, `maturityFilled`, `enrichmentDepth` on all inbox items
- Drop and replace the Phase 19 `entityGraph` table entirely (old graph data not preserved)
- **Delete `appendEnrichment()` and `parseEnrichment()`** from `src/ai/clarification/enrichment.ts` — full sidecar switch
- Enrichment engine writes structured Q&A records to `atomIntelligence.enrichment[]`
- UI renders enrichment from sidecar in the same visual location (below atom content), but reads from sidecar not content parsing

### atomIntelligence table shape
- **One row per atom** with nested arrays — keyed by atomId
- Typed fields for known intelligence types:
  - `enrichment[]` — structured Q&A pairs: {category, question, answer, depth, timestamp, tier}
  - `entityMentions[]` — empty placeholder array for Phase 27 (entity text, type, spans, confidence)
  - `cognitiveSignals[]` — cached outputs from 10 cognitive ONNX models (currently transient, now persisted)
- **Extensible `records[]` bag** — generic `{type: string, data: any, timestamp: number}` for future agent types to write without schema migrations
- CRDT-ready metadata: `version` (Lamport/HLC), `deviceId`, `lastUpdated`, `schemaVersion`
- **Vision:** This is the agent swarm's shared knowledge layer. All local AI agents (across devices, via future CRDT sync) accumulate intelligence here. Each device contributes what it can; CRDT merges the knowledge. The sidecar enriches whichever binder the user has open.

### Smart links field design
- **New `atom.smartLinks[]` field** — separate from existing `atom.links[]` (which holds internal atom-to-atom edges)
- **Typed and extensible** link system with `type` discriminator:
  - `type: 'url'` — standard web link
  - `type: 'ms-graph'` — Office document deep link (future)
  - `type: 'photo-share'` — shared photo reference (future)
  - `type: 'app-deep-link'` — mobile app deep link (future)
- **Minimal stored at creation:** `type`, `uri`, `label?`, `note?` (user annotation for why link matters), `addedAt`
- Agent-resolved metadata (resolvedTitle, summary, thumbnailCacheKey, ogMetadata) goes in atomIntelligence sidecar, not on the atom
- **Phase 26 scope: schema only** — no URL detection, no auto-extraction, no resolution workers

### Entity/relation table schema
- **Replace `entityGraph` table entirely** with new `entities` + `entityRelations` tables
- `entities` table: `id`, `canonicalName`, `type` (PER/LOC/ORG), `aliases: string[]`, `mentionCount`, `firstSeen`, `lastSeen`, `version` (CRDT), `deviceId`, `updatedAt`
- `entityRelations` table: `id`, `sourceEntityId`, `targetEntityId`, `relationshipType` (string), `confidence` (0-1), `sourceAttribution` (keyword/co-occurrence/user-correction), `evidence[]`, `version` (CRDT), `deviceId`, `updatedAt`
- **Normalization:** canonical name + aliases array. Dedup checks canonical + all aliases.
- **Relationship types:** Predefined TypeScript union for ~10 core types (spouse, parent, child, colleague, reports-to, healthcare-provider, friend, org-member, lives-at, works-at) stored as strings so new types can be added without migration
- **CRDT fields included now** — `version`, `deviceId`, `updatedAt` on both tables. Zero runtime cost, ready for v7.0 sync.

### Enrichment wizard UX pattern
- Enrichment wizard should signal confidence/uncertainty like GSD discuss-phase: default to "Next area" when enough context captured, "More questions" when uncertainty is high
- This confidence-adaptive defaulting applies to category navigation in the enrichment flow

### Claude's Discretion
- Exact Dexie index design for atomIntelligence, entities, entityRelations
- Migration ordering and transaction boundaries
- SmartLink Zod schema details and validation
- How cognitiveSignals[] cache interacts with existing transient signal flow
- Entity table compound indexes for efficient lookup patterns
- Which files need refactoring to remove parseEnrichment/appendEnrichment dependencies

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/storage/db.ts`: Dexie v8 schema — add v9 migration here
- `src/storage/migrations/v1-v8.ts`: Migration pattern to follow
- `src/storage/entity-graph.ts`: Being REPLACED — code can inform new entity table helpers
- `src/ai/clarification/enrichment.ts`: `appendEnrichment`/`parseEnrichment` — will be DELETED
- `src/ai/enrichment/enrichment-engine.ts`: Pure module, needs refactoring to write to sidecar
- `src/ai/tier2/cognitive-signals.ts`: 10 ONNX models whose outputs will be cached in sidecar
- `src/storage/write-queue.ts`: Batched write pattern for sidecar writes

### Established Patterns
- Dexie migration pattern: `applyVXMigration(this)` in db.ts constructor
- Pure module pattern: AI pipeline files import NO store
- Worker message protocol: typed messages with UUID request IDs
- Write queue for batched persistence (entity-graph.ts uses this)

### Integration Points
- `src/ui/signals/store.ts` (~line 786-828): enrichment answer handling — currently calls appendEnrichment, needs refactoring to write sidecar
- `src/ui/signals/store.ts` (~line 634): imports parseEnrichment/appendEnrichment — remove these
- `src/ai/enrichment/enrichment-engine.ts` (~line 28): imports parseEnrichment — switch to sidecar read
- `src/types/atoms.ts`: Add smartLinks[] to BaseAtomFields, add Zod schema
- `src/storage/db.ts`: New tables (atomIntelligence, entities, entityRelations), drop entityGraph
- Enrichment UI components: switch from content parsing to sidecar reads

</code_context>

<specifics>
## Specific Ideas

- "I want this database to be the evolving, intelligent, collaborative agent swarm to use this CRDT-based local-first sidecar database to enrich the use of any binder that specific user happens to have open"
- Smart links should be "very smart links" — URLs are just the beginning. MS Graph deep links, document section references, photo shares. The link architecture should abstract all this so new link types can be added in the future.
- "As a device has a binder open, it is enriched as actively as the device allows (event driven, or autonomous enrichment loops finite state machine engine)"
- Per-atom intelligence + cross-atom/binder-level intelligence are two complementary layers: atomIntelligence handles individual atom knowledge, entity tables handle relationship graph that emerges from seeing ALL atoms
- Enrichment wizard should mirror GSD's confidence-adaptive UX — system signals when it has enough vs needs more

</specifics>

<deferred>
## Deferred Ideas

- **Autonomous enrichment loop FSM** — event-driven + autonomous enrichment cycles based on device capability (future phase)
- **Spine cache** — referential potential associations across binders on the user's bookshelf (future)
- **Background WebLLM agents** — continuously deepening intelligence sidecar on capable devices (future)
- **Smart link auto-detection** — regex/NLP URL extraction from atom content (future phase)
- **Smart link resolution workers** — OG metadata fetching, summarization, thumbnail caching (future)
- **MS Graph integration** — Office document deep link support (future)
- **Binder-level intelligence records** — global insights not tied to specific atoms (future, separate table)

</deferred>

---

*Phase: 26-intelligence-sidecar-schema*
*Context gathered: 2026-03-11*
