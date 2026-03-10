# Phase 24: Unified Enrichment Wizard + Model Annotations - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Merge decomposition and clarification into one unified enrichment wizard that treats inbox items as raw captures maturing through guided questioning into well-formed atoms. Add model provenance annotations (3-ring visualization) showing which AI tier/model produced each result. Implement a tier-aware quality gate for atom creation. Wire Tier 2B (WASM LLM) into the tiered pipeline for contextual question/option generation on capable devices.

This phase replaces the current separate "Break this down" and "Clarify this" flows with a single "Enrich" button and a new inbox maturity model where items evolve over multiple sessions until ready to graduate into atoms.

</domain>

<decisions>
## Implementation Decisions

### Wizard trigger & entry point
- Single "Enrich" button replaces both "Break this down" and "Clarify this"
- Button always visible on ALL inbox cards (not AI-gated)
- AI auto-detects readiness on capture — well-specified items start with high maturity, vague items start low
- Simple items like "Buy milk" are auto-detected as ready, can be swipe-classified immediately

### Wizard flow: question-first always
- Wizard always asks questions to understand the atom BEFORE suggesting decomposition
- 4-option menus with easy-to-choose answers (GSD philosophy — spectrum of pre-built answers, freeform as escape hatch)
- Category chips at top (outcome, next-action, timeframe, context, reference) show progress — tappable to jump to any question non-linearly
- Chips show filled/unfilled state — user answers what they know first
- After clarifying questions complete, wizard auto-offers decomposition if atom looks multi-step
- Decomposition starts with simple GSD-style one-at-a-time questioning; architecture supports future power-user batch review mode

### Answer option generation across tiers
- Tier 2A (ONNX): generates template options from atom category (baseline, works on all devices)
- Tier 2B (WASM LLM, laptop only): generates contextual questions AND options AND better decomposition steps — smarter local AI
- Tier 3 (Cloud): silently replaces/enhances options when available — user doesn't know which tier produced them
- User-provided content always gets the strongest quality signal

### Inline enrichment (not modal)
- Enrichment renders inline on the triage card, replacing the AI suggestion strip area
- NOT a modal overlay — user can still swipe to accept/dismiss during enrichment
- Each answer applied to atom immediately (inline enrichment) — if user leaves mid-flow, everything so far is saved
- Smart re-evaluation: wizard checks existing enrichment BUT re-asks if atom content changed significantly since last enrichment session

### Inbox maturity model
- Inbox items are raw captures that mature through enrichment — NOT immediately classified into atoms
- Visual maturity indicator on every card (progress ring/fill showing enrichment completeness)
- Items evolve over multiple sessions — user sees them getting richer over time
- Current state shown (filled category chips) — no enrichment history timeline needed
- User can park captures knowing they're secure and can be processed incrementally

### Graduation (inbox item → atoms)
- AI suggests graduation when enough categories filled — user confirms
- Graduation preview shows all proposed atoms as a list: "This will create: 1 Project, 3 Tasks, 1 Decision"
- User can remove individual items from the batch before confirming
- Original inbox item becomes the parent atom (AI suggests type — could be project, task, decision, etc.)
- Child atoms go directly to their AI-suggested sections (skip re-triaging — they're already well-specified)

### Fast path preserved
- Swipe-to-classify still works for any item, any time
- If AI thinks item is too raw, shows soft warning: "This item might need more context. Classify anyway?"
- User can always override — autonomy respected

### Quality gate for atom creation (tier-aware)
- Quality = composite of: tier source + completeness categories filled + user-provided content (strongest signal)
- Quality spectrum visualization on each proposed atom in graduation preview (not just binary)
- ONNX template steps get vagueness scrutiny; WASM LLM steps pass at moderate quality; Cloud-generated steps high quality by default
- When proposed atom flagged as vague: AI auto-enriches from parent context first, then asks user to confirm/refine
- Soft gate with warning below minimum quality — user can always force-create with acknowledgment

### Model annotations & provenance (3-Ring visualization)
- Compact model bitmask stored per atom (16-32 bits) — ultra-compact, no bloat
- Every AI-produced element gets provenance — type classification, GTD routing, decomposition, sanitization, etc.
- Annotations are subtle but immediately obvious which models engaged meaningfully
- Specific model visibility (not just tier): type-onnx, gtd-routing, decompose, sanitize, entity-detection, completeness, etc.

### 3-Ring stacked ring indicator
- Mirrors the 3-Ring Binder architecture as visual metaphor
- Inner ring = Tier 1 (deterministic), middle ring = Tier 2 (ONNX + WASM LLM as distinct segments), outer ring = Tier 3 (cloud)
- Always shown on every item (empty rings for unprocessed items — shows "potential")
- Rings fill in as models engage — visual progression of AI processing
- On tap: ring segments highlight/animate with model name appearing — playful, reinforces metaphor
- Middle ring shows two visual segments: ONNX classifiers and WASM LLM — user can see both contributed

### Tier 2B (WASM LLM) role
- Fills the gap between ONNX templates and cloud intelligence — "binder feels smarter on laptops"
- Generates contextual questions based on actual atom content (not just category templates)
- Generates contextual answer options (not generic GTD templates)
- Produces higher-quality, content-tailored decomposition steps
- Performs post-enrichment synthesis (summaries, graduation suggestions)
- Visible in ring indicator as distinct segment within Tier 2
- On devices without WASM LLM capability, gracefully falls back to ONNX templates (existing behavior)

### Claude's Discretion
- Exact bitmask layout and model ID assignments
- Ring rendering implementation (SVG, Canvas, CSS)
- WASM LLM model selection and inference optimization
- Enrichment category detection algorithms
- Graduation threshold calibration
- Migration path from current DecompositionFlow/ClarificationFlow to unified wizard
- Worker architecture for WASM LLM (new worker vs extending existing)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/ui/components/DecompositionFlow.tsx`: Current decomposition UI — will be replaced/merged into EnrichmentWizard
- `src/ui/components/ClarificationFlow.tsx`: Current clarification UI — will be replaced/merged into EnrichmentWizard
- `src/ui/components/InboxAISuggestion.tsx`: Suggestion strip that enrichment wizard replaces inline
- `src/ai/decomposition/decomposer.ts`: Template + slot-filling pipeline — reusable as T2A decomposition backend
- `src/ai/decomposition/categories.ts`: 35 decomposition categories with templates — reusable
- `src/ai/decomposition/slot-extractor.ts`: Entity slot extraction — reusable
- `src/ai/clarification/`: Question templates, option ranking, cloud options — all reusable
- `src/ai/tier2/pipeline.ts`: Tiered escalation pipeline — extend with T2B handler
- `src/ai/tier2/tier2-handler.ts`: ONNX handler — model for T2B handler pattern
- `src/storage/classification-log.ts`: Learning from corrections — extend with enrichment events
- `src/storage/entity-graph.ts`: Entity relationship storage — extend with provenance relationships

### Established Patterns
- Pure module pattern: no store imports in AI pipeline files
- Worker message protocol: typed messages with UUID request IDs
- Platt-calibrated probabilities for confidence scoring
- Classifier registry pattern for multiple ONNX sessions
- Binder type config at `src/config/binder-types/` for extensible question ordering

### Integration Points
- `src/ui/views/InboxView.tsx`: Replace Break This Down + Clarify This buttons with single Enrich button; add maturity indicator
- `src/ui/components/InboxAISuggestion.tsx`: Enrichment wizard replaces suggestion strip area when active
- `src/ai/tier2/types.ts`: Add T2B handler type, extend AITaskType for enrichment tasks
- `src/ai/tier2/pipeline.ts`: Register T2B handler between T2A and T3
- `src/storage/db.ts`: Add provenance bitmask field to atom schema; migration
- `src/ui/signals/store.ts`: Enrichment state management, graduation flow, maturity tracking

</code_context>

<specifics>
## Specific Ideas

- "The user should visually see inbox items evolve over time as they are enriched giving them a sense of the fullness of context needed"
- "User will park things in their brain this way, knowing that is captured, secure, and can be accessed and thought through more at any time until it is ready to evolve into various types of atoms"
- 3-Ring stacked rings visualization maps directly to the 3-Ring Binder architecture — the product metaphor IS the provenance UI
- WASM LLM should feel like "the binder is even smarter at tier 2" — not a separate mode, just better results on capable devices
- Model annotations should be "subtle and unobtrusive, and yet immediately obvious which models engaged meaningfully"
- Start with simple GSD-style questioning that is iterative; architecture supports power-user batch review in the future
- "Be very graceful about interruptions — always capture whatever enrichment interactions happen and allow the user to pick back up in a painless way like GSD"
- **Enrichment = atomization, not storage:** The binder is NOT a storage space for external content. When shared links/emails arrive in inbox, enrichment should atomize the content — summarize emails as text strings, create persistent reference links, retain enough intelligent signals that the atom serves its purpose in the binder. Enrichment transforms raw external content into binder-native intelligence, not just adds metadata.
- Architecture should support future share-intent inbox items where the first enrichment step is content atomization (summarize, extract signals, create reference link)

</specifics>

<deferred>
## Deferred Ideas

- **Power user batch review mode** — batch approve/edit all decomposition steps at once (future enhancement after simple mode proves out)
- **Enrichment history timeline** — expandable timeline showing when each enrichment happened (current state only for now)
- **Free-form WASM LLM conversation** — mini-conversation with local LLM about the atom beyond structured questions (future T2B enhancement)
- **Voice input for enrichment** — wire VoiceCapture into freeform enrichment answers (future)
- **Proactive enrichment suggestions** — system suggests "these 3 items could use enrichment" based on staleness/incompleteness (future)
- **Wolfram computation validation** — correctness checking tier visible in ring annotations (future integration)
- **Cross-atom enrichment intelligence** — wizard considers related atoms when generating questions/options (v5.0 knowledge graph)

</deferred>

---

*Phase: 24-unified-enrichment-wizard*
*Context gathered: 2026-03-09*
