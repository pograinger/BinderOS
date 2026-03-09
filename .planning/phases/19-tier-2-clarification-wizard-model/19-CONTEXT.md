# Phase 19: Tier 2 Clarification Wizard Model - Context

**Gathered:** 2026-03-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Train and deploy ONNX classifiers that detect vague/incomplete atoms and guide users through targeted clarifying questions to enrich atom content — offline, sub-second, user-triggered. Includes a completeness gate (runs in triage), 5 binary missing-info classifiers (run on tap), a ClarificationFlow UI, tier-adaptive option generation (templates offline, cloud-enhanced when available), self-learning via correction log, graph seed table for entity-relationship storage, and binder type extensibility architecture.

</domain>

<decisions>
## Implementation Decisions

### Trigger & flow behavior
- User-triggered "Clarify this" button on triage cards — not automatic
- Completeness gate runs in triage cascade (after type classification) — flags atoms as needing clarification
- 5 binary missing-info classifiers + question flow only run when user taps "Clarify this"
- Philosophy: high confidence = show best result and move on; any ambiguity = shortest path to clearing assumptions
- One question at a time, consistent with AIQuestionFlow pattern
- Each question is skippable — atom updates with whatever was answered
- Partial answers applied on abandon (user closes flow after answering 1 of 3 questions → those answers merge in)
- "Clarify this" button appears alongside other triage actions (Accept, Dismiss, Break this down) — does not replace them
- After clarification: auto re-triage the full cascade on enriched text (completeness gate included — if still vague, valid to clarify again)
- Atoms always flow to the most accurate prediction with easy override
- Subtle "clarified" indicator on triage cards post-enrichment

### Missing-info categories (GTD-aligned)
- 5 categories, each maps to a binary classifier and a set of clarifying questions:
  1. **missing-outcome** — "What's the desired outcome?"
  2. **missing-next-action** — "What's the concrete next step?"
  3. **missing-timeframe** — "By when?"
  4. **missing-context** — "Where/who/what tool?"
  5. **missing-reference** — "What project or area does this belong to?"
- Question ordering follows GTD importance: outcome first (gateway question), then next-action, timeframe, context, reference
- Question ordering is defined in the binder type config — extensible for non-GTD binder types

### Model architecture
- **Completeness gate**: 1 binary ONNX classifier — detects well-specified vs incomplete atoms
- **5 binary missing-info classifiers**: separate ONNX model per category — independent retrainability
- Consensus required: completeness gate says "incomplete" AND at least one binary says "missing" → show "Clarify this"
- All models run in the embedding worker (not a dedicated worker) — reuses existing MiniLM embedding vector from type classification (embed once, classify many)
- Completeness gate loads lazily on first ambiguity detection; 5 binary models load lazily when user taps "Clarify"
- Gate threshold: 0.75 (moderate)
- Binary classifier thresholds: Claude's discretion based on precision/recall curves during training
- (128,64) MLP architecture for all binary classifiers — same as Phase 17 binary models; Claude may adjust if training results warrant
- Individual Cache API entries per model (6 separate ONNX files)
- Completeness gate runs after type classification in the triage cascade

### Training pipeline
- Faker-based synthetic data generation — same pattern as Phases 17-18
- 2000 examples per category (both "missing" and "not-missing" labels) — 20,000+ total
- Training data covers all 5 atom types (tasks, events, facts, decisions, insights)
- 3 numbered scripts: generate (30_generate_clarification_data.py), train (31_train_clarification_classifier.py --classifier flag), validate (32_validate_clarification.js — all 6 models in one run)
- Single training script with --classifier flag for individual model training
- Node.js validation checks parity across all 6 models in one run
- >95% accuracy target per classifier
- >95% Python/Node parity requirement

### Question generation & option presentation
- 3-4 pre-built answer options + freeform escape hatch per question (matches GSD/AIQuestionFlow pattern)
- Tier-adaptive option generation:
  - **Offline (Tier 2)**: Category + atom-type template options from JSON config, slot-filled with entities from NER/regex
  - **Cloud (Tier 3)**: Cloud generates atom-specific custom options via sanitized prompt including user patterns + binder purpose. Multi-turn background reasoning hidden from user.
  - **Fallback**: Cloud first (2s timeout), template fallback if cloud unavailable or slow
- Smart prefetch: when cloud is idle AND atom has high vagueness score, prefetch cloud options in background during triage. Don't prefetch for borderline atoms.
- NER for slot-filling when sanitization worker is loaded; regex fallback when not loaded. Disagreement between NER and regex logged for continuous improvement.
- Subtle category indicator next to each question (e.g., "outcome", "timeframe") — conversational but transparent

### Self-learning from corrections
- Every clarification interaction logged in existing classification-log table (extended with 'clarification' event type)
- Log captures: atomText, detectedCategory, optionsShown, optionSelected, wasFreeform, freeformText
- Frequency-based option ranking: most-selected options float to top over time. Cold start uses default template order.
- Freeform-to-option promotion via manual retraining step (included in correction JSONL export)
- Category skip patterns tracked: categories users consistently skip get lower presentation priority

### Atom enrichment
- Clarified details appended as structured key:value lines to atom content: `\n---\nOutcome: Get car inspected\nDeadline: This week\nContext: @errands`
- Original text stays intact; enrichment is additive
- Structured lines visible to user in atom view (transparent, editable)
- Summary shown before modal closes: "Added: Outcome, Deadline, Context" with enriched content preview

### ClarificationFlow UX
- Modal overlay (consistent with DecompositionFlow pattern)
- Original atom title/content pinned at top of modal for reference
- One ClarificationFlow component for all atom types — questions vary based on detected type + missing categories
- Text input only for freeform (voice input deferred)
- Summary screen before close, then auto re-triage

### Graph seeding (entity_graph table)
- New Dexie `entity_graph` table: { id, sourceAtomId, entityType, entityValue, relationship, targetValue, createdAt }
- Compound index [sourceAtomId+entityType] for efficient querying
- Broad relationship types — wires ALL existing sources:
  - Clarification answers: has-outcome, has-deadline, has-context, has-reference, involves-person
  - Decomposition (Phase 18): parent-of / child-of relationships
  - Triage similarity (Phase 5): related-to relationships
  - GTD context (Phase 17): tagged-with relationships
- Separate plan for graph table schema + wiring all sources
- Separate export mechanism from correction log
- Graph direction and query helpers: Claude's discretion
- CRDT-friendly design: individual records per relationship for clean multi-device sync

### Binder type extensibility architecture
- Unified binder type config (JSON) at `src/config/binder-types/`
- Config defines: name, purpose, category ordering, supported atom types, question templates, background cloud enrichment flag
- Build-time import via Vite (bundled, not runtime-fetched)
- Phase 19 ships with default GTD Personal binder config only — extensibility proven by architecture
- Background cloud enrichment configurable per binder (default off for privacy)
- Open-source contributors can create new binder types by adding a JSON config file

### Claude's Discretion
- Binary classifier confidence thresholds (based on P/R curves during training)
- MLP hidden layer sizes if (128,64) doesn't perform
- Faker template designs and diversity patterns
- Graph table direction handling (single-direction + helper vs bidirectional)
- Worker message protocol additions
- Exact scoring mechanism for tier-optimal option generation
- How cloud multi-turn reasoning is structured for option generation

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/ai/tier2/tier2-handler.ts`: ONNX classifier orchestration — extend with completeness + clarification task types
- `src/ai/tier2/types.ts`: AITaskType union, confidence thresholds — add 'check-completeness' and 'classify-missing-info'
- `src/search/embedding-worker.ts`: ONNX model loading + inference — add 6 more ONNX sessions (1 gate + 5 binary)
- `src/ai/triage.ts`: Triage cascade pipeline — insert completeness gate after type classification
- `src/ui/components/InboxAISuggestion.tsx`: Triage card UI — add "Clarify this" button alongside Accept/Dismiss
- `src/ui/components/DecompositionFlow.tsx`: Modal step-by-step flow — pattern to follow for ClarificationFlow
- `src/storage/classification-log.ts`: Correction logging — extend with 'clarification' event type
- `src/ai/sanitization-worker.ts`: NER entity extraction for slot-filling
- `scripts/train/20_generate_gtd_data.py`: Faker-based generation pattern to follow
- `scripts/train/21_train_gtd_classifier.py`: MiniLM + MLP + ONNX export pipeline to reuse

### Established Patterns
- ONNX models stored in `public/models/classifiers/` with config.json
- Cache API for model persistence — one-time download UX per model
- Worker message protocol: typed messages with UUID request IDs
- Platt-calibrated probabilities for confidence scoring
- Pure module pattern: no store imports in AI pipeline files
- AIQuestionFlow: 3-4 options + freeform input pattern
- Classifier registry pattern (Phase 17): ClassifierConfig for multiple ONNX sessions

### Integration Points
- `src/ai/tier2/types.ts`: Add new AITaskType entries ('check-completeness', 'classify-missing-info')
- `src/ai/tier2/tier2-handler.ts`: Extend canHandle() and handle() for completeness + clarification
- `src/ai/triage.ts`: Insert completeness gate after type classification, before GTD cascade
- `src/ui/views/InboxView.tsx`: Wire "Clarify this" button to ClarificationFlow modal
- `src/storage/db.ts`: Add entity_graph Dexie table + schema migration
- `src/storage/classification-log.ts`: Add clarification event type
- Decomposition (Phase 18): Add graph seeding at step-creation point
- Triage similarity (Phase 5): Add graph seeding at related-atom point
- GTD context (Phase 17): Add graph seeding at context-tag point

</code_context>

<specifics>
## Specific Ideas

- Philosophy mirrors GSD itself: offer a spectrum of pre-built answers (not open-ended text fields), with freeform as escape hatch
- The system should "constantly seek to fill in missing gaps" — every interaction is a learning opportunity
- Options should feel "almost magical in their accuracy over time" — frequency ranking + cloud enhancement + user pattern signaling
- Keep complexity hidden from the user — sophisticated multi-turn cloud reasoning behind a simple "here are your choices" UX
- "Not intrusive or creepy" — learning is helpful, transparent (subtle indicators), and user-controlled
- Architecture must be extensible to future binder types with different purposes (not just GTD)
- Graph seeding is foundational for v5.0 knowledge graph — broad schema now, rich data accumulation starts immediately

</specifics>

<deferred>
## Deferred Ideas

- **Knowledge graph engine** — Full graph traversal, relationship inference, entity resolution (v5.0)
- **Cross-atom learning** — "User usually means X when they say Y" patterns from accumulated graph data (v5.0)
- **Background cloud graph enrichment** — Cloud in constant structured contact enriching the binder graph based on purpose and context (v5.0+)
- **Location awareness** — On-device location context for anticipating upcoming context and prioritizing gaps (future PWA enhancement)
- **Calendar/API drivers** — Binders that see Microsoft Graph, calendar APIs, and other personal info touchpoints (future)
- **Proactive gap detection** — System anticipates upcoming context and triggers background cloud research (future)
- **Voice input for clarification** — Wire VoiceCapture into freeform clarification answers (future)
- **Alternate binder types** — Research Notebook, Project Management, etc. as proof-of-extensibility examples (future)
- **Automatic freeform-to-option promotion** — Semi-automatic with user confirmation (future enhancement to manual retraining)

</deferred>

---

*Phase: 19-tier-2-clarification-wizard-model*
*Context gathered: 2026-03-08*
