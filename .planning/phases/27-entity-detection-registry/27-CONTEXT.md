# Phase 27: Entity Detection + Registry - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Detect PER/LOC/ORG/MISC/DATE entities in atom content using a pre-trained NER model (replacing sanitize-check), accumulate PER/LOC/ORG into a deduplicated entity registry with confidence-based matching and alias resolution, store all entity mentions in atomIntelligence sidecar, and show color-coded entity badges on atom detail views. No relationship inference (Phase 28), no entity correction UX (Phase 29), no entity timeline view (Phase 29).

</domain>

<decisions>
## Implementation Decisions

### NER model strategy
- **Replace sanitize-check** with a single pre-trained NER model serving both PII redaction and entity knowledge extraction
- **Research phase picks the model** — evaluate distilbert-NER, mobilebert-NER, and alternatives for dual-use (PII + entity detection)
- Target **<100MB quantized** (q8) for mobile viability — most DistilBERT NER models are 60-80MB
- **Regex fallback for non-NER PII** — keep regex-patterns.ts for FINANCIAL/CONTACT/CREDENTIAL detection. New NER handles PER/LOC/ORG
- **Pre-bundled in build** — model files included in public/models/, no runtime download
- **Keep retrain capability** — ensure the new model can be fine-tuned via existing Python pipeline if quality needs improvement
- **Model swap happens in Phase 27** — first plan task swaps model, validates PII still works, then entity detection builds on top
- **Entity types output: PER/LOC/ORG + MISC + DATE** — five types from NER
- **PER/LOC/ORG get full registry treatment** (Entity table entries with dedup, aliases, mention tracking)
- **MISC/DATE stored in entityMentions only** — no registry entries, searchable but not identity-tracked
- **Sanitization and entity registries stay separate** — pseudonym registry (entity-registry.ts) serves privacy, v5.0 entity registry serves knowledge graph. Different concerns, different tables
- **Aggregation strategy: Claude's discretion** — pick best for entity boundary accuracy
- **Automated PII regression test suite** after model swap — verify names still redacted, regex fallback catches FINANCIAL/CONTACT/CREDENTIAL

### Entity dedup behavior
- **Confidence-based matching** — auto-merge high-confidence matches, surface medium-confidence as inline suggestions for user confirmation, ignore low-confidence
- **Auto-merge threshold: Claude's discretion** — design confidence tiers based on NLP best practices for personal name matching (title stripping, normalized exact, etc.)
- **Merge suggestion UX deferred to Phase 29** (ENTC-02) — Phase 27 builds matching logic and stores candidates, Phase 29 builds inline badge suggestion UX
- **Permanent alias learning** — when user confirms a merge, alias added to Entity.aliases[] permanently. All future mentions auto-resolve
- **Type-specific matcher framework** — pluggable matchers per entity type (PER, LOC, ORG). Phase 27 ships basic normalized matching for all types. Abbreviation/acronym matchers plugged in later
- **Lazy entityMention updates on merge** — don't rewrite sidecar records. Old mentions keep original text. Entity registry tracks canonical + aliases. Lookup by alias resolves to canonical
- **Minimum NER confidence threshold ~0.7** — ignore NER hits below threshold. Configurable for tuning
- **Clean up on atom delete** — remove atomIntelligence row, decrement mentionCount on linked entities. Keep entity if mentionCount=0 (may have relationships)

### Entity badge UX
- **Below-content horizontal chips** — row of colored chips below atom content, same zone as tags
- **Color-coded by type** — PER=blue, ORG=amber, LOC=green, MISC=gray, DATE=purple (though MISC/DATE badges: Claude's discretion on whether to show)
- **Top 5 badges + "+N more"** — sorted by confidence, expandable "+3 more" chip if overflow
- **Detail view only** — no badges on list/grid cards. Keeps cards clean
- **Hidden when empty** — no badge section if no entities detected. Badges appear organically
- **Tap behavior: Claude's discretion** — expand inline card or navigate, pick based on Phase 27 scope
- **Silent badge appearance** — no loading spinner. Detection is fast, badges just appear when ready

### Detection lifecycle
- **Async, post-save** — atom saves immediately, entity detection fires async via worker message, results written to sidecar when complete
- **Full re-scan on edit** — re-run NER on entire content on every save. Replace all entityMentions. NER is ~50ms, cheap enough
- **Sequential queue** — queue DETECT_ENTITIES messages in worker, process one at a time. Same pattern as SANITIZE. Prevents memory spikes on bulk operations
- **All atom types** — tasks, events, facts, insights, decisions all get entity detection. Universal, matches v5.0 vision
- **New atoms only** — no backfill of existing atoms. Entities appear as atoms are created or edited going forward
- **Same sanitization worker** — add DETECT_ENTITIES as new message type to sanitization-worker.ts. Same NER model, same worker thread. Zero new workers
- **Keep worker name** — sanitization-worker.ts stays. Entity detection is additional capability, not a rename
- **User notification on model load failure** — subtle toast or settings indicator if NER unavailable. Entity detection is valuable enough to surface errors
- **Eager model load on app start** — send LOAD_NER on app init so entity detection works from first atom create. Model is pre-bundled, just initialization

### Entity-atom linking
- **entityMentions reference entityId** — each EntityMention gets optional `entityId?: string` pointing to Entity registry entry. Present for PER/LOC/ORG with registry entries, undefined for MISC/DATE
- **Reverse lookup: Claude's discretion** — choose between MultiEntry index on linkedEntityIds array or table scan based on expected scale
- **Increment mentionCount on detect** — when entity detection finds/links an entity, increment Entity.mentionCount and update firstSeen/lastSeen timestamps

### Worker message protocol
- **Worker returns raw NER only** — [{text, type, start, end, confidence}]. Main thread handles dedup, registry lookup, sidecar write. Worker stays stateless (no db access)
- **Extend sanitizer.ts bridge** — add `detectEntities(text: string)` function alongside `sanitizeText()`. Same worker instance, same dispatch pattern
- **Silent degradation with notification** — entity detection fails gracefully, atoms work without entities. User notified NER unavailable

### Entity type schema
- **Entity table: PER|LOC|ORG only** — registry is for entities with identity
- **EntityMention: expand to PER|LOC|ORG|MISC|DATE** — update intelligence.ts union type
- **Optional entityId on EntityMention** — `entityId?: string` nullable reference to registry. Present for registry types, undefined otherwise

### Mobile performance
- **Always run entity detection** — NER model already loaded for sanitization. Zero extra memory. No device-class gating
- **No text length limit** — run NER on full content. BinderOS atoms are typically short
- **Model size target: <100MB quantized** — balance accuracy and mobile storage

### Claude's Discretion
- NER aggregation strategy (simple, first, or max)
- Auto-merge confidence tier design
- Entity badge tap behavior
- MISC/DATE badge display (show or hide)
- Reverse entity-atom lookup strategy (MultiEntry index vs scan)
- Exact badge colors and icon choices
- Error toast design for NER load failure

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/workers/sanitization-worker.ts`: NER worker with lazy pipeline loading, SANITIZE message protocol — extend with DETECT_ENTITIES
- `src/ai/sanitization/sanitizer.ts`: Bridge to sanitization worker — extend with `detectEntities()` function
- `src/ai/sanitization/regex-patterns.ts`: Regex PII patterns — keep as fallback for FINANCIAL/CONTACT/CREDENTIAL
- `src/ai/sanitization/entity-registry.ts`: Pseudonym registry — stays separate from v5.0 entity registry
- `src/storage/entity-helpers.ts`: Phase 26 CRUD stubs (createEntity, findEntityByName, createRelation) — flesh out for full registry
- `src/storage/atom-intelligence.ts`: Sidecar CRUD (getIntelligence, writeEnrichmentRecord, writeCognitiveSignals) — add writeEntityMentions
- `src/types/intelligence.ts`: EntityMention type with PER/LOC/ORG — expand union, add entityId field

### Established Patterns
- Worker message protocol: typed messages with UUID request IDs, async response via postMessage
- Pure module pattern: worker and bridge files import no store — state passed by caller
- Dexie direct writes for sidecar (not WriteQueue) — established in Phase 26
- SolidJS reactive signals for UI state
- Tailwind CSS for component styling

### Integration Points
- `src/workers/sanitization-worker.ts`: Add DETECT_ENTITIES message type and response
- `src/ai/sanitization/sanitizer.ts`: Add detectEntities() bridge function
- `src/storage/atom-intelligence.ts`: Add writeEntityMentions() helper
- `src/storage/entity-helpers.ts`: Expand from stubs to full dedup/matching logic
- `src/types/intelligence.ts`: Expand EntityMention union, add entityId field
- Triage/save lifecycle: trigger entity detection after atom create/update
- Atom detail view component: render entity badge chips

</code_context>

<specifics>
## Specific Ideas

- User wants confidence-based entity matching: "can this be even more intelligent? using all of the above as signals and then asking users for confirmation?" — system should auto-merge high confidence, surface suggestions for medium, ignore low
- Entity dedup should be type-aware: PER (name matching + title stripping), LOC (abbreviation patterns), ORG (acronym expansion). Framework with pluggable matchers, basic implementation now
- Atoms are lightweight — NER on full content is fine, no truncation needed
- Entity detection is valuable enough to notify user if NER model fails to load (not silent degradation)
- Eager model load on startup — entity detection should work from the very first atom the user creates

</specifics>

<deferred>
## Deferred Ideas

- **Entity merge suggestion UX** — inline badge indicator for potential merges. Deferred to Phase 29 (ENTC-02 user correction UX)
- **LOC abbreviation matching** — "NYC" = "New York City" auto-resolve. Framework built in Phase 27, matcher plugged in later
- **ORG acronym expansion** — "IBM" = "International Business Machines". Same framework, later implementation
- **Background backfill scan** — detect entities in all existing atoms. User chose new-atoms-only for now
- **Entity timeline view** — Phase 29 (ENTC-05)
- **Entity context in enrichment** — Phase 29 (ENTC-01)

</deferred>

---

*Phase: 27-entity-detection-registry*
*Context gathered: 2026-03-11*
