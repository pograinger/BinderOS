# Phase 14: Sanitization Classifier - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning

<domain>
## Phase Boundary

ONNX NER classifier detects sensitive entities in atom content before cloud dispatch, pseudonymizes them with stable typed IDs, and shows users a redaction diff in the pre-send approval modal. Python training pipeline produces the sanitization model. Branded SanitizedPrompt type enforces sanitization-before-cloud at compile time. Cloud responses are auto-de-pseudonymized before display.

</domain>

<decisions>
## Implementation Decisions

### Redaction display
- Pseudonymized entity references with typed + numbered IDs: `<Person 12>`, `<Location 3>`, `<Financial 1>`
- Each real entity gets a stable ID — same person always maps to the same pseudonym across requests and sessions
- Pre-send modal shows the pseudonymized text (what the cloud will see)
- Expandable mapping table collapsed by default — power users can expand to see `<Person 12> = John Smith` for verification
- Cloud responses auto-de-pseudonymized before showing to user — seamless round-trip, user never sees pseudonyms in AI suggestions

### Entity registry
- Persistent entity registry in IndexedDB — maps real entities to stable pseudonym IDs
- Registry survives across sessions so cloud builds consistent entity awareness over time
- User's per-entity restore preferences (un-redact decisions) are remembered across requests

### Entity categories
- Five NER categories for v1: PERSON, LOCATION, FINANCIAL, CONTACT, CREDENTIAL
- Hybrid detection: NER model handles fuzzy entities (names, locations, financial references); regex patterns handle structured formats (emails, phone numbers, API key prefixes, credit card patterns, URLs)
- Union of NER + regex — entity flagged if either detector catches it
- Architecture designed for extensibility — future methodology modules can add category sets (GTD: PROJECT/CONTEXT, Research: CITATION/CONCEPT, Writing: CHARACTER/SETTING) via retraining with the same pipeline

### User control & overrides
- Sanitization is always-on when cloud is active — no toggle to disable
- Per-entity restore in pre-send modal — user can click individual entities in the mapping table to toggle them back to real values
- Restore preferences are remembered — if user always restores a specific entity, it auto-restores in future requests
- Each pre-send modal still shows the full entity map so user can review and change restore decisions

### Sanitization vs existing privacy levels
- NER sanitization applies at 'full' privacy level only — abstract (counts/scores) and structured (metadata) already strip content, no entities to redact
- Default privacy level changes from 'abstract' to 'full' — NER pseudonymization makes full level safe by default, giving users better AI quality out of the box
- Users can still manually select abstract or structured for maximum privacy
- Structured level does NOT get NER on titles — users at that level accepted titles are shared

### Training pipeline
- Synthetic data generation following v3.0 pattern — templates + Faker-style data produce labeled atom text with PII entities
- Python pipeline at scripts/train/ produces sanitization ONNX model
- Recall >= 0.85 gate on soft-PII test set (from ROADMAP.md success criteria)
- FP16/Q8 quantization (INT8 collapses recall 30-40% per v4.0 research)

### Claude's Discretion
- NER model architecture (token classification vs sequence labeling vs span extraction)
- Worker placement — embedding worker vs dedicated sanitization worker (memory budget measurement needed)
- SanitizedPrompt branded type implementation details
- Entity registry IndexedDB schema design
- Regex pattern library for structured entity detection
- De-pseudonymization implementation in response pipeline
- Synthetic corpus size and distribution across entity categories

</decisions>

<specifics>
## Specific Ideas

- Entity pseudonymization inspired by the user's methodology module vision: sanitization should be entity-aware, not blind pattern matching. Each binder type could eventually define its own entity types and sanitization rules.
- The entity registry is a stepping stone toward the Tier-2 Methodology Module Interface described in the user's design doc — entity resolution, entity similarity, entity merge policy all build on having a persistent entity registry.
- "The cloud sees the structure, not the identity" — the pseudonymization preserves relational information (<Person 12> mentioned <Location 3> twice) while hiding real identities.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `privacy-proxy.ts`: Has `SanitizationLevel` type and `sanitizeForCloud()` passthrough — ready to be wired to real NER sanitization at 'full' level
- `CloudRequestPreview.tsx`: Pre-send modal already shows `sanitizedPrompt` field — needs entity map expansion and restore toggles
- `embedding-worker.ts`: ONNX Runtime Web already configured (wasm backend, single-threaded), Cache API fetch with progress, classifier loading pattern — reusable for sanitization model
- `key-vault.ts`: `CloudRequestLogEntry` has `sanitizedPrompt: string` field — sanitization output flows naturally into existing log
- Existing type classifier pipeline (`scripts/train/`) — pattern for synthetic data generation, ONNX export, browser validation

### Established Patterns
- Pure modules: AI pipeline files import no store — sanitization module must follow this
- Worker message protocol: typed `WorkerIncoming` union with `{type, id, ...}` pattern — new SANITIZE message type follows same convention
- Cache API for model persistence with version-keyed cache names — sanitization model uses same approach
- Platt-calibrated confidence from v3.0 — may inform sanitization confidence thresholds

### Integration Points
- `privacy-proxy.ts:sanitizeForCloud()` — currently a passthrough, becomes the entry point for NER sanitization at 'full' level
- `CloudRequestPreview.tsx` — needs entity mapping table UI with restore toggles
- `embedding-worker.ts` or new sanitization worker — hosts the ONNX NER model
- `store.ts` — needs entity registry signals, sanitization state management
- Cloud adapter response pipeline — de-pseudonymization hook before results reach UI

</code_context>

<deferred>
## Deferred Ideas

- **Tier-2 Methodology Module Interface** — The user's design doc describes a full module system where each binder type (GTD, Research, Writing) implements entity models, sanitization rules, structural validation, ambiguity detection, and routing policies. The Phase 14 entity registry and extensible NER categories are foundational pieces, but the full module interface is a future milestone.
- **Methodology-specific entity types** — GTD (PROJECT, CONTEXT), Research (CITATION, CONCEPT), Writing (CHARACTER, SETTING) — supported by extensible architecture but not trained in v1 model.
- **Entity similarity and merge policy** — The methodology doc describes entity_similarity() and entity_merge_policy for deduplication. The persistent registry enables this in the future.

</deferred>

---

*Phase: 14-sanitization-classifier*
*Context gathered: 2026-03-06*
