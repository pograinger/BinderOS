# Phase 23: Cloud-Tutored Local Model Reinforcement - Context

**Gathered:** 2026-03-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Use the Anthropic API as a GTD guru training oracle to maximize local ONNX classifier intelligence out of the box. The cloud brings deep GTD methodology expertise — contexts, next actions, someday/maybe boundaries, 2-minute rule, horizons of focus, natural planning model — to generate adversarial edge cases, identify model blind spots, and distill Tier 3 knowledge into Tier 2. All training data is synthetic (zero privacy concern). Covers: adversarial data generation, systematic gap analysis, knowledge distillation (Tier 3 → Tier 2), active learning loop for low-confidence predictions. Leverages phase 19 training infrastructure.

</domain>

<decisions>
## Implementation Decisions

### Classifier targeting
- Improve ALL existing ONNX classifiers (type, GTD routing, actionability, project detection, context tagging, decomposition, completeness gate, 5 missing-info classifiers)
- Benchmark first: two-phase approach — run existing test sets (baseline), then generate a cloud "expert exam" test set that stress-tests GTD boundaries the Faker data may not cover
- Allocate more cloud budget to weaker-performing classifiers based on benchmark results
- Include type classifier augmentation from established memory notes: multi-step/compound tasks, ambiguous borderline facts, vague/incomplete events, implicit decisions, negative/frustrated-tone insights

### Cloud oracle strategy — triple role
- **Adversarial generator:** Prompt Claude as a GTD expert to generate deliberately hard/ambiguous examples that expose model weaknesses per classifier
- **Teacher-student distillation:** Feed low-confidence predictions to Claude, get expert labels + reasoning. Claude explains WHY a classification is correct — reasoning distilled into training signal
- **Systematic gap analysis:** Claude identifies categories of GTD knowledge the models lack (e.g., "your model doesn't understand horizons of focus", "missing 2-minute rule boundary cases")
- Deep GTD methodology depth in all prompts — reference specific concepts: 2-minute rule, horizons of focus, natural planning model, weekly review criteria, someday/maybe boundaries, context-dependent next actions
- Model selection configurable per task: Haiku (claude-haiku-4-5) for bulk adversarial generation (quantity), Sonnet (claude-sonnet-4-6) for gap analysis and teacher-student distillation (quality). Script flag to select model.
- User is on $100/month Anthropic plan — no built-in budget caps needed, scripts are manual offline tools

### Data pipeline integration
- Cloud-generated data appended to existing JSONL files in `scripts/training-data/` — augment, don't replace
- Retrain from scratch on combined dataset (Faker + cloud) using existing per-classifier training scripts (03, 11, 21, 31, 41)
- New scripts follow 50_* numbering convention, each with one job:
  - `50_benchmark_models.py` — baseline + cloud expert exam
  - `51_generate_adversarial.py` — adversarial edge case generation
  - `52_gap_analysis.py` — systematic GTD knowledge gap identification
  - `53_distill_labels.py` — teacher-student relabeling of low-confidence examples
- No new unified retrainer — reuse existing train scripts on augmented data
- All generated data committed to repo (training data is already version-controlled)

### Active learning loop
- Primary data source: synthetic examples near decision boundaries (identified from benchmark results) — available immediately
- Secondary data source: classification log JSONL export from real user corrections (when accumulated enough data — future enhancement)
- Fully automated batch mode: benchmark → identify weak spots → generate adversarial data → retrain → re-benchmark
- Human reviews results after the batch completes
- Iterative vs single-pass: Claude's discretion based on what works best for the training pipeline
- Detailed before/after accuracy report: per-classifier accuracy deltas, confidence distribution shifts, weakest categories identified, examples of newly-correct predictions (Markdown output)

### Claude's Discretion
- Exact prompt engineering for adversarial generation, gap analysis, and teacher-student distillation
- Number of examples to generate per classifier per batch
- How to structure the cloud "expert exam" test set
- Iterative loop strategy (single-pass vs multi-round with plateau detection)
- Report format and visualization details
- How classification log export feeds into the secondary active learning source

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/train/03_train_classifier.py`: Type classifier training pipeline — MiniLM + MLP + ONNX export
- `scripts/train/21_train_gtd_classifier.py`: GTD classifier training with --classifier flag
- `scripts/train/31_train_decomposition_classifier.py`: Decomposition model training
- `scripts/train/41_train_clarification_classifier.py`: Clarification model training with --classifier flag
- `scripts/training-data/*.jsonl`: 14 existing training data files to augment
- `src/storage/classification-log.ts`: Correction logging + JSONL export for active learning input
- `src/storage/export.ts`: Data export utilities
- Existing validation scripts (04, 12, 22, 32, 42): Node.js parity validation pattern to reuse for post-retrain verification

### Established Patterns
- MiniLM (384-dim) embeddings + sklearn MLP, exported to ONNX via skl2onnx
- Platt-calibrated probabilities for confidence scoring
- Training script numbering: 01-04 (type), 10-12 (sanitization), 20-22 (GTD), 30-32 (decomposition), 40-42 (clarification)
- Faker-based synthetic data with 15-20% ambiguous/borderline examples
- `python -u` flag for unbuffered output when running from Claude Code
- JSONL format for training data with text + label fields

### Integration Points
- `scripts/training-data/`: Append cloud-generated examples to existing JSONL files
- Existing train scripts: Run unchanged on augmented data to produce improved ONNX models
- Existing validate scripts: Run post-retrain to verify Python/Node parity preserved
- `public/models/classifiers/`: Updated ONNX model files output destination
- Classification log JSONL export: Secondary input source for active learning

</code_context>

<specifics>
## Specific Ideas

- The cloud oracle should embody David Allen's GTD methodology at expert level — not simplified explanations, but nuanced boundary cases that test real-world GTD decision-making
- Type classifier augmentation specifically targets gaps from memory notes: compound tasks ("Call dentist and then update insurance"), ambiguous facts that look like tasks ("The faucet is leaking"), vague events ("Dentist next week"), implicit decisions ("We're going with the new vendor"), frustrated-tone insights ("I always underestimate how long things take")
- The "expert exam" test set should be qualitatively different from Faker data — more natural language, more ambiguity, more real-world messiness
- Gap analysis should identify systematic blind spots (e.g., "model has never seen horizons-of-focus reasoning") not just individual misclassifications

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 23-cloud-tutored-local-model-reinforcement*
*Context gathered: 2026-03-08*
