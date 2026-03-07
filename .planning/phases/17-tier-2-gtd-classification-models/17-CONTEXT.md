# Phase 17: Tier 2 GTD Classification Models - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Train and deploy four additional ONNX classifiers that bring GTD intelligence to Tier 2 (offline, sub-second). These classifiers run in the existing embedding worker alongside the type classifier, using the same MiniLM + MLP architecture. Training uses Faker-based synthetic data generation following the established pipeline pattern.

Classifiers: GTD list routing, actionability detection, project vs single-action, context tagging.

</domain>

<decisions>
## Implementation Decisions

### Which classifiers to train
- Four separate ONNX classifiers, each independent:
  1. **GTD list routing** — 4-way: Next Action, Waiting For, Someday/Maybe, Reference
  2. **Actionability detection** — binary: actionable (has concrete next step) vs non-actionable (informational/reference)
  3. **Project vs single-action** — binary: multi-step project vs single atomic action
  4. **Context tagging** — 6-way fixed set: @computer, @phone, @errands, @home, @office, @agenda
- No custom/user-extensible contexts — fixed set of 6 shipped with the model
- Cascade execution: type classifier runs first, then if task → run all 4 GTD classifiers; if fact/insight → skip (always Reference)

### Training data strategy
- Faker-based template generation (no Claude API costs) — same pattern as sanitization NER (14-01)
- Single script with four modes: `python 20_generate_gtd_data.py --classifier gtd-routing --count 1000`
- 1000 examples per label for each classifier
- Include 15-20% ambiguous/borderline examples that test GTD boundaries (e.g., "Maybe call dentist next week" — Next Action or Someday/Maybe?)

### Model architecture & deployment
- MiniLM embeddings (384-dim) + sklearn MLP, exported to ONNX via skl2onnx — same as type classifier
- Separate ONNX model per classifier (~2-5MB each, ~10-20MB total)
- Single training script with four modes: `python 21_train_gtd_classifier.py --classifier gtd-routing`
- Extend existing embedding worker — embed once via MiniLM, run multiple ONNX classifiers on same vector
- No new workers needed — all classification shares the embedding worker

### Confidence & escalation behavior
- Per-classifier confidence thresholds (Platt-calibrated):
  - GTD routing: 0.70 (fuzzier boundaries, ok to escalate)
  - Actionability: 0.80 (binary, should be confident)
  - Project detection: 0.75
  - Context tagging: 0.65 (lower stakes, easy to fix)
- Low-confidence without Tier 3 (mobile offline): show suggestion with "?" indicator (e.g., "Next Action?" instead of "Next Action") — same pattern as ambiguous type classification two-button UX
- Triage card shows all classifications at once: Type (task), GTD List (Next Action), Context (@computer), with project badge if detected
- User corrections logged via existing correction log system (classification-log.ts) — extend JSONL export for retraining data accumulation

### Claude's Discretion
- MLP hidden layer sizes and training hyperparameters
- Exact Faker template designs and diversity patterns
- Worker message protocol additions (CLASSIFY_GTD_ROUTING, etc.)
- How ambiguous examples are distributed across training data
- Validation script test case selection

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/ai/tier2/tier2-handler.ts`: Existing handler with `classifyViaONNX()` pattern — extend with new classifier message types
- `src/ai/tier2/types.ts`: `AITaskType` enum, `CONFIDENCE_THRESHOLDS` map, `TieredResult` type — add new task types
- `src/search/embedding-worker.ts`: Embedding worker with ONNX session loading — add 4 more ONNX sessions
- `scripts/train/03_train_classifier.py`: MiniLM + MLP + ONNX export pattern to follow
- `scripts/train/10_generate_sanitization_data.py`: Faker-based template generation pattern to follow
- `src/storage/classification-log.ts`: Correction logging — extend for GTD classifier corrections

### Established Patterns
- ONNX models stored in `public/models/{classifier-name}/` with config.json and model file
- Cache API for model persistence — one-time download UX
- Worker message protocol: `CLASSIFY_ONNX` → `ONNX_RESULT` / `ONNX_ERROR` with UUID request IDs
- Platt-calibrated probabilities for confidence scoring
- 0.15 confidence spread threshold for ambiguity detection

### Integration Points
- `src/ai/tier2/types.ts`: Add new `AITaskType` entries ('classify-gtd-routing', 'classify-actionability', 'classify-project', 'classify-context')
- `src/ai/tier2/tier2-handler.ts`: Extend `canHandle()` and `handle()` for new task types
- `src/ai/triage.ts`: Wire GTD classifiers into triage pipeline after type classification
- Triage suggestion UI: extend to show GTD routing, context, project badge alongside type

</code_context>

<specifics>
## Specific Ideas

- Cascade pattern: type classifier → if task → GTD classifiers. Non-task atoms skip GTD routing entirely.
- GTD routing uses classic David Allen categories — not simplified or extended variants
- Context tags use @ prefix convention (@computer, @phone, etc.) consistent with GTD literature
- Ambiguous training examples should specifically test GTD decision boundaries (the hard cases users actually face)

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 17-tier-2-gtd-classification-models*
*Context gathered: 2026-03-06*
