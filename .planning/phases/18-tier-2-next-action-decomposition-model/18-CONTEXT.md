# Phase 18: Tier 2 Next Action Decomposition Model - Context

**Gathered:** 2026-03-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Train and deploy an ONNX classifier that decomposes multi-step tasks and decisions into actionable next steps — offline, sub-second, no LLM needed. Uses pattern classification + slot-filled templates: classify the input into a decomposition pattern category, then apply a template with entity slots filled from the original text. User-triggered via "break this down" button.

</domain>

<decisions>
## Implementation Decisions

### Decomposition approach
- Pattern classification + slot-filled templates (same philosophy as Phase 12 template engine — zero LLM, deterministic)
- ONNX MLP classifies task/decision into a decomposition pattern category (e.g., 'plan-event', 'research-purchase', 'organize-space')
- Each pattern category maps to a template with 3-5 steps containing placeholder slots
- Slot extraction uses regex + NER from the existing sanitization worker (Phase 14) to extract entities from the original text
- Slots filled into template steps to produce personalized decomposition (e.g., "Research {topic} options" → "Research venue options")

### Pattern granularity
- Fine-grained categories (~30-50 total)
- Separate categories for tasks vs decisions (e.g., 'plan-party' is a task pattern, 'decide-vendor' is a decision pattern)
- Decision-specific patterns: 'Decide on X' → ['Research options', 'Compare criteria', 'Make decision', 'Communicate decision']

### Trigger & scope
- User-triggered only — "break this down" button, not automatic on triage
- Button visible on ALL task atoms and decision atoms (not gated by project-detection)
- Works on both task and decision atom types
- One level of decomposition only — if a generated step is complex, user can decompose it again manually

### Output & UX
- Uses existing AIQuestionFlow pattern — shows steps one at a time with accept/edit/skip per step
- AI decides the atom type for each generated step (task, decision, etc.) — user can override during the flow
- After decomposition, flow asks "Mark this as a project?" for the parent atom (user decides each time)
- Each decomposed step gets section assignment via the section routing classifier (AI suggests per step, not inherited from parent)

### Training data
- GTD-centric life patterns: plan event, research purchase, organize space, learn skill, complete application, medical/health tasks, home improvement, travel planning, career moves
- Separate decision decomposition patterns alongside task patterns
- 3-5 template steps per pattern category
- 1000 training examples per pattern category (Faker-based generation)
- Same MiniLM + MLP + ONNX architecture as Phase 17 classifiers

### Claude's Discretion
- Exact decomposition pattern categories and their template steps
- MLP hidden layer sizes and training hyperparameters
- Faker template designs for training data generation
- How slot extraction regex patterns are designed
- Worker message protocol additions
- Confidence threshold for pattern classification

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/ai/tier2/tier2-handler.ts`: ONNX classifier orchestration — extend with decomposition task type
- `src/ai/tier2/types.ts`: AITaskType union, GtdClassification interface — add 'decompose' task type
- `src/search/embedding-worker.ts`: ONNX model loading + inference with message protocol — add DECOMPOSE message type
- `scripts/train/20_generate_gtd_data.py`: Faker-based template generation pattern to follow
- `scripts/train/21_train_gtd_classifier.py`: MiniLM + MLP + Platt calibration pipeline to reuse
- Sanitization NER worker (`src/ai/sanitization-worker.ts`): Entity extraction for slot-filling
- AIQuestionFlow component: Existing conversational UI pattern for step-by-step presentation

### Established Patterns
- ONNX models stored in `public/models/classifiers/` with config.json
- Cache API for model persistence — one-time download UX
- Worker message protocol: typed messages with UUID request IDs
- Platt-calibrated probabilities for confidence scoring
- Pure module pattern: no store imports in AI pipeline files

### Integration Points
- `src/ai/tier2/types.ts`: Add 'decompose' to AITaskType
- `src/ai/tier2/tier2-handler.ts`: Extend canHandle() and handle() for decomposition
- Triage card UI: Add "break this down" button on task and decision atoms
- AIQuestionFlow: Wire decomposition results into existing conversational flow
- Section routing classifier: Assign sections to each decomposed step

</code_context>

<specifics>
## Specific Ideas

- Cascade from Phase 17: type classifier runs first, but decomposition is user-triggered not automatic — independent of the GTD cascade
- Slot-filling reuses NER entities (names, places) from sanitization worker — cross-worker communication via main thread relay
- Template steps should feel like GTD "next physical actions" — concrete, verb-first, immediately doable
- Decision decomposition follows a research→compare→decide→communicate pattern
- "Break this down" button should be discoverable but not dominant — secondary action on atom cards

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 18-tier-2-next-action-decomposition-model*
*Context gathered: 2026-03-08*
