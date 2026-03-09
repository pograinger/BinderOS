# Phase 23: Cloud-Tutored Local Model Reinforcement - Research

**Researched:** 2026-03-08
**Domain:** ML training pipeline augmentation via Anthropic API (knowledge distillation, adversarial data generation, active learning)
**Confidence:** HIGH

## Summary

This phase adds four new Python scripts (50-53 series) to the existing training pipeline that use the Anthropic API as a GTD expert oracle. The scripts benchmark existing classifiers, generate adversarial edge cases, perform systematic gap analysis, and distill teacher labels for low-confidence predictions. All generated data is synthetic JSONL appended to existing training data files, then retrained using the unchanged existing training scripts (03, 21, 31, 41).

The project already has a proven pattern for Anthropic API usage in `01_generate_data.py` -- structured JSON output via `output_config.format`, Haiku model for bulk generation, rate limiting, retry logic, and JSONL output. The new scripts follow this exact pattern but with richer GTD-domain prompts and a two-model strategy (Haiku for quantity, Sonnet for quality). The existing training infrastructure (MiniLM embeddings, sklearn MLP, ONNX export, Node.js validation) is reused without modification.

**Primary recommendation:** Build four focused scripts following the established 01_generate_data.py pattern. The benchmark script (50) is the keystone -- it produces the accuracy baselines and identifies weak spots that drive all downstream scripts. Execute in strict order: benchmark first, then adversarial/gap/distill in parallel on identified weaknesses.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Improve ALL existing ONNX classifiers (type, GTD routing, actionability, project detection, context tagging, decomposition, completeness gate, 5 missing-info classifiers)
- Benchmark first: two-phase approach -- run existing test sets (baseline), then generate a cloud "expert exam" test set that stress-tests GTD boundaries
- Allocate more cloud budget to weaker-performing classifiers based on benchmark results
- Include type classifier augmentation from established memory notes (compound tasks, ambiguous facts, vague events, implicit decisions, frustrated-tone insights)
- Cloud oracle triple role: adversarial generator, teacher-student distillation, systematic gap analysis
- Deep GTD methodology depth in all prompts (2-minute rule, horizons of focus, natural planning model, weekly review criteria, someday/maybe boundaries, context-dependent next actions)
- Model selection configurable per task: Haiku (claude-haiku-4-5) for bulk adversarial generation, Sonnet (claude-sonnet-4-6) for gap analysis and teacher-student distillation. Script flag to select model.
- User is on $100/month Anthropic plan -- no built-in budget caps needed, scripts are manual offline tools
- Cloud-generated data appended to existing JSONL files in `scripts/training-data/` -- augment, don't replace
- Retrain from scratch on combined dataset (Faker + cloud) using existing per-classifier training scripts
- New scripts follow 50_* numbering convention: 50_benchmark_models.py, 51_generate_adversarial.py, 52_gap_analysis.py, 53_distill_labels.py
- No new unified retrainer -- reuse existing train scripts on augmented data
- All generated data committed to repo
- Primary data source: synthetic examples near decision boundaries (available immediately)
- Secondary data source: classification log JSONL export from real user corrections (future enhancement)
- Fully automated batch mode: benchmark -> identify weak spots -> generate adversarial data -> retrain -> re-benchmark
- Human reviews results after the batch completes
- Iterative vs single-pass: Claude's discretion
- Detailed before/after accuracy report: per-classifier accuracy deltas, confidence distribution shifts, weakest categories, examples of newly-correct predictions (Markdown output)

### Claude's Discretion
- Exact prompt engineering for adversarial generation, gap analysis, and teacher-student distillation
- Number of examples to generate per classifier per batch
- How to structure the cloud "expert exam" test set
- Iterative loop strategy (single-pass vs multi-round with plateau detection)
- Report format and visualization details
- How classification log export feeds into the secondary active learning source

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| anthropic | 0.84.0 | Anthropic API client for Claude | Already installed and used in 01_generate_data.py |
| sentence-transformers | 5.2.3 | MiniLM-L6-v2 embeddings (384-dim) | Already used in all training scripts |
| scikit-learn | >=1.6,<1.7 | MLP classifier + Platt calibration | Already used in all training scripts |
| skl2onnx | 1.20.0 | Export sklearn models to ONNX | Already used in all training scripts |
| onnxruntime | >=1.20,<1.22 | ONNX inference for benchmarking | Already used in training pipeline |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| python-dotenv | >=1.0,<2.0 | Load ANTHROPIC_API_KEY from .env.local | All scripts using Anthropic API |
| tqdm | >=4.66,<5.0 | Progress bars for generation loops | Adversarial generation, benchmarking |
| numpy | >=1.26,<2.0 | Array operations for embeddings/predictions | All scripts |
| faker | >=24.0 | Template filling for hybrid generation | Optional: combine Faker templates with cloud for variety |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Per-call Anthropic API | Anthropic Batch API | Batch API would be cheaper (50% discount) but adds complexity with async job polling; not worth it for manual offline scripts |
| Claude structured output | Free-form + parsing | Structured output_config.format already proven in 01_generate_data.py -- zero parse failures |
| Custom embedding model | MiniLM-L6-v2 | Must use MiniLM since all ONNX classifiers are trained on 384-dim MiniLM embeddings |

**Installation:**
```bash
# No new dependencies needed -- all already in requirements.txt
pip install -r scripts/train/requirements.txt
```

## Architecture Patterns

### Recommended Script Structure
```
scripts/train/
├── 50_benchmark_models.py          # Baseline + cloud expert exam
├── 51_generate_adversarial.py      # Adversarial edge case generation
├── 52_gap_analysis.py              # Systematic GTD knowledge gap identification
├── 53_distill_labels.py            # Teacher-student relabeling
├── reports/                        # Markdown reports (gitignored or committed)
│   └── benchmark_YYYYMMDD.md       # Before/after accuracy reports
└── ... (existing 01-42 scripts unchanged)
```

### Pattern 1: Classifier Registry
**What:** Central mapping of all 14 classifiers with their metadata (JSONL path, train script, ONNX model path, label field, class names, architecture).
**When to use:** Every new script needs to iterate over all classifiers.
**Example:**
```python
# All 14 classifiers in a single registry
CLASSIFIER_REGISTRY = {
    "type": {
        "jsonl": "type-classification.jsonl",
        "train_script": "03_train_classifier.py",
        "validate_script": "04_validate_model.mjs",
        "onnx_model": "triage-type.onnx",
        "classes_json": "triage-type-classes.json",
        "label_field": "label",
        "hidden_layers": (256, 128),
        "is_multi_class": True,
        "class_names": ["task", "fact", "event", "decision", "insight"],
    },
    "gtd-routing": {
        "jsonl": "gtd-routing.jsonl",
        "train_script": "21_train_gtd_classifier.py --classifier gtd-routing",
        "validate_script": "22_validate_gtd_models.mjs",
        "onnx_model": "gtd-routing.onnx",
        "classes_json": "gtd-routing-classes.json",
        "label_field": "label",
        "hidden_layers": (256, 128),
        "is_multi_class": True,
        "class_names": ["next-action", "waiting-for", "someday-maybe", "reference"],
    },
    # ... actionability, project-detection, context-tagging, decomposition,
    #     completeness-gate, missing-outcome, missing-next-action,
    #     missing-timeframe, missing-context, missing-reference
}
```

### Pattern 2: Two-Model Strategy with Flag
**What:** Scripts accept `--model haiku` or `--model sonnet` flag to select Claude model.
**When to use:** All Anthropic API calls. Haiku for bulk generation (quantity), Sonnet for analysis and distillation (quality).
**Example:**
```python
MODEL_MAP = {
    "haiku": "claude-haiku-4-5",
    "sonnet": "claude-sonnet-4-6",
}

parser.add_argument("--model", choices=["haiku", "sonnet"], default="haiku",
                    help="Claude model: haiku (bulk/cheap) or sonnet (quality)")
```

### Pattern 3: Structured Output for Batch Generation
**What:** Use Anthropic's `output_config.format` with JSON schema for guaranteed parseable output.
**When to use:** All adversarial generation and distillation calls.
**Example:**
```python
# Already proven in 01_generate_data.py
response = client.messages.create(
    model=model_id,
    max_tokens=512,
    messages=[{"role": "user", "content": prompt}],
    output_config={
        "format": {
            "type": "json_schema",
            "schema": {
                "type": "object",
                "properties": {
                    "text": {"type": "string"},
                    "label": {"type": "string", "enum": valid_labels},
                    "reasoning": {"type": "string"},
                    "difficulty": {"type": "string", "enum": ["easy", "medium", "hard", "adversarial"]},
                },
                "required": ["text", "label"],
                "additionalProperties": False,
            },
        }
    },
)
```

### Pattern 4: Benchmark via sklearn metrics + ONNX Runtime
**What:** Load trained ONNX model, run inference on held-out test set, compute per-class precision/recall/F1.
**When to use:** 50_benchmark_models.py for baseline and post-retrain comparison.
**Example:**
```python
from sklearn.metrics import classification_report, confusion_matrix
import onnxruntime as ort

session = ort.InferenceSession(str(onnx_path))
input_name = session.get_inputs()[0].name
predictions = session.run(None, {input_name: embeddings})[0]
# For MLP classifiers, output is probabilities -- argmax to get predicted label
predicted_labels = predictions.argmax(axis=1)
report = classification_report(true_labels, predicted_labels, target_names=class_names, output_dict=True)
```

### Pattern 5: JSONL Append with Dedup
**What:** Append cloud-generated examples to existing JSONL, checking for near-duplicate text.
**When to use:** All scripts that produce training data.
**Example:**
```python
def append_to_jsonl(path: Path, new_examples: list[dict], existing_texts: set[str]) -> int:
    """Append new examples, skipping duplicates. Returns count appended."""
    added = 0
    with open(path, "a", encoding="utf-8") as f:
        for ex in new_examples:
            if ex["text"].strip().lower() not in existing_texts:
                f.write(json.dumps(ex, ensure_ascii=False) + "\n")
                existing_texts.add(ex["text"].strip().lower())
                added += 1
    return added
```

### Anti-Patterns to Avoid
- **Modifying existing training scripts:** The 03/21/31/41 scripts work correctly. Never modify them -- only augment the JSONL data they consume.
- **Generating too many examples at once:** Cloud-generated examples should be a fraction (10-30%) of the total dataset. Overwhelming the Faker data with cloud data can shift the distribution unhelpfully.
- **Forgetting the `-u` flag:** All Python scripts must be run with `python -u` to avoid output buffering issues when called from Claude Code.
- **Using the same prompt for all classifiers:** Each classifier needs domain-specific GTD prompts. A generic "generate hard examples" prompt will produce low-quality data.
- **Skipping the embedding step:** Cloud-generated JSONL text must be embedded by MiniLM before training. The existing train scripts handle this internally (they embed from JSONL directly for the 21/31/41 series).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Embedding computation | Custom embedding logic | sentence-transformers MiniLM (already in train scripts) | Must match the exact embedding space used by existing models |
| ONNX export | Manual ONNX graph building | skl2onnx (already in train scripts) | Handles opset versions, quantization, input/output naming |
| Model evaluation | Custom accuracy metrics | sklearn.metrics.classification_report | Handles precision, recall, F1, macro/weighted averages, edge cases |
| Structured API output | JSON parsing with try/except | Anthropic output_config.format with json_schema | Guarantees schema compliance at the API level |
| Train/test splitting | Manual array slicing | sklearn.model_selection.train_test_split | Handles stratification, random state, edge cases |
| Confidence calibration | Manual probability scaling | CalibratedClassifierCV (Platt) already in train scripts | Proper sigmoid calibration for probability interpretation |

**Key insight:** This phase produces zero new ML infrastructure. All ML logic lives in existing train/validate scripts. The new scripts are data generators and evaluators only.

## Common Pitfalls

### Pitfall 1: Distribution Shift from Cloud Data
**What goes wrong:** Cloud-generated examples have different linguistic patterns than Faker data (more natural, more verbose). If cloud data dominates, the model learns cloud patterns and loses accuracy on real user input.
**Why it happens:** Claude generates more sophisticated text than Faker templates. The embedding space clusters differently.
**How to avoid:** Keep cloud-generated data to 10-30% of total per classifier. Always retrain on combined dataset. Compare accuracy on BOTH the original Faker test set AND the new cloud expert exam.
**Warning signs:** Accuracy drops on original test set while improving on cloud test set.

### Pitfall 2: Label Leakage in Adversarial Prompts
**What goes wrong:** Prompts that say "generate a hard example of type X" can leak the label into the generated text (e.g., "This is a decision to go with...").
**Why it happens:** Claude embeds the label concept into generated text when the label is prominent in the prompt.
**How to avoid:** Use indirect prompts: describe the scenario, not the label. "Generate a GTD inbox item where someone has already made a choice but phrases it as a statement" instead of "generate a decision".
**Warning signs:** Certain keywords become strongly predictive of labels (e.g., "decide" always maps to "decision").

### Pitfall 3: Expert Exam Difficulty Calibration
**What goes wrong:** Cloud-generated "expert exam" is either too easy (models already ace it) or impossibly hard (even humans would disagree on labels).
**Why it happens:** Without careful prompt engineering, Claude either generates obvious examples or genuinely ambiguous ones where the "correct" label is debatable.
**How to avoid:** Generate in difficulty tiers (easy/medium/hard/adversarial). Validate a sample manually. Use the reasoning field to verify Claude's label logic.
**Warning signs:** Model accuracy on expert exam is either >95% (too easy) or <50% (incoherent labels).

### Pitfall 4: Embedding Cache Staleness
**What goes wrong:** The type classifier pipeline (01-04) uses a shared `embeddings_cache.npy` and `labels_cache.npy` that can get stale if you add data to the JSONL but don't re-embed.
**Why it happens:** The 03_train_classifier.py reads from the cache, not from JSONL directly. The 21/31/41 series embed from JSONL directly.
**How to avoid:** For the type classifier, always run the full pipeline: `01 -> 02 -> 03 -> 04`. For GTD/decomposition/clarification classifiers, the train script handles embedding internally.
**Warning signs:** Type classifier accuracy doesn't improve after adding cloud data (because it's training on stale cache).

### Pitfall 5: Rate Limiting on Bulk Generation
**What goes wrong:** Generating hundreds of examples hits Anthropic rate limits, causing cascading timeouts.
**Why it happens:** Even on $100/month plan, there are per-minute token limits.
**How to avoid:** Use the 0.05s sleep between calls pattern from 01_generate_data.py. Add exponential backoff on RateLimitError. For large batches, use Haiku (higher rate limits than Sonnet).
**Warning signs:** Increasing number of retries in console output.

### Pitfall 6: Decomposition Classifier Scale
**What goes wrong:** The decomposition classifier has 35 classes with 42,168 training examples. Cloud augmentation that adds only a few examples per class has negligible impact.
**Why it happens:** The existing dataset is already large and diverse. Adding 5-10 cloud examples per class for a 35-class problem is noise.
**How to avoid:** For high-class-count classifiers (decomposition, context-tagging), focus cloud budget on the specific classes with lowest F1 scores rather than spreading evenly.
**Warning signs:** Decomposition accuracy is essentially unchanged after augmentation.

## Code Examples

### Existing API Pattern (from 01_generate_data.py)
```python
# Source: scripts/train/01_generate_data.py lines 96-147
client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from .env.local

response = client.messages.create(
    model="claude-haiku-4-5",
    max_tokens=128,
    messages=[{"role": "user", "content": prompt}],
    output_config={
        "format": {
            "type": "json_schema",
            "schema": SCHEMA,
        }
    },
)
example = json.loads(response.content[0].text)
```

### Self-Contained Training Pattern (from 21_train_gtd_classifier.py)
```python
# Source: scripts/train/21_train_gtd_classifier.py
# Each training script:
# 1. Loads JSONL data (text + label)
# 2. Embeds with sentence-transformers MiniLM (384-dim)
# 3. Splits train/test
# 4. Trains MLP with Platt calibration
# 5. Exports to ONNX
# 6. Saves test artifacts for Node.js validation
```

### GTD Domain Prompt Template (for adversarial generation)
```python
GTD_ADVERSARIAL_PROMPT = """You are David Allen, the creator of Getting Things Done.
Generate a realistic GTD inbox capture that is DELIBERATELY AMBIGUOUS between
{class_a} and {class_b}.

The text should be something a real person would type into their GTD inbox.
It should test the BOUNDARY between these two GTD categories:

{class_a_definition}
{class_b_definition}

GTD methodology context:
- The 2-minute rule: if it takes less than 2 minutes, do it now
- Horizons of focus: ground level (actions) to 50,000ft (purpose/principles)
- Natural planning model: purpose, vision, brainstorming, organizing, next actions
- Someday/maybe: incubated items that aren't committed to yet
- Waiting-for: delegated items you're tracking

Make the text feel natural -- messy, short, the way real people type.
The correct classification IS {correct_class}, but it should be HARD to distinguish.
"""
```

### Benchmark Report Structure
```python
# Markdown report format for before/after comparison
REPORT_TEMPLATE = """# Classifier Benchmark Report
**Date:** {date}
**Phase:** Before/After cloud augmentation

## Summary
| Classifier | Before Acc | After Acc | Delta | Weakest Class |
|------------|-----------|-----------|-------|---------------|
{summary_rows}

## Per-Classifier Details

### {classifier_name}
**Classes:** {class_list}
**Test set size:** {n_test}

| Class | Precision | Recall | F1 | Support |
|-------|-----------|--------|-----|---------|
{class_rows}

**Confusion Matrix:**
```
{confusion_matrix}
```

**Low-confidence examples (confidence < threshold):**
{low_confidence_examples}
"""
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Faker-only synthetic data | Faker + cloud-augmented data | This phase | More natural, adversarial examples near decision boundaries |
| Manual accuracy inspection | Automated benchmark pipeline | This phase | Systematic before/after accuracy tracking across all classifiers |
| Single data generation pass | Active learning loop (benchmark->generate->retrain->re-benchmark) | This phase | Iterative improvement targeting weakest spots |

**Existing state:**
- 14 classifiers trained on Faker-generated data (templates + random entities)
- All exceed 95% test accuracy on synthetic data
- Unknown accuracy on natural language (real user input patterns differ from Faker templates)
- Type classifier has 2,000 examples, GTD classifiers 2,400-7,200, decomposition 42,168, clarification 3,400-3,600

## Inventory of Classifiers to Improve

| Classifier | JSONL File | Current Examples | Train Script | Architecture |
|------------|-----------|-----------------|--------------|--------------|
| type | type-classification.jsonl | 2,000 | 03_train_classifier.py | MLP(256,128), 5-class |
| gtd-routing | gtd-routing.jsonl | 4,819 | 21 --classifier gtd-routing | MLP(256,128), 4-class |
| actionability | actionability.jsonl | 2,409 | 21 --classifier actionability | MLP(128,64), binary |
| project-detection | project-detection.jsonl | 2,409 | 21 --classifier project-detection | MLP(128,64), binary |
| context-tagging | context-tagging.jsonl | 7,228 | 21 --classifier context-tagging | MLP(256,128), 6-class |
| decomposition | decomposition.jsonl | 42,168 | 31_train_decomposition_classifier.py | MLP(256,128), 35-class |
| completeness-gate | clarification-completeness.jsonl | 3,600 | 41 --classifier completeness-gate | MLP(128,64), binary |
| missing-outcome | clarification-missing-outcome.jsonl | 3,400 | 41 --classifier missing-outcome | MLP(128,64), binary |
| missing-next-action | clarification-missing-next-action.jsonl | 3,400 | 41 --classifier missing-next-action | MLP(128,64), binary |
| missing-timeframe | clarification-missing-timeframe.jsonl | 3,400 | 41 --classifier missing-timeframe | MLP(128,64), binary |
| missing-context | clarification-missing-context.jsonl | 3,400 | 41 --classifier missing-context | MLP(128,64), binary |
| missing-reference | clarification-missing-reference.jsonl | 3,400 | 41 --classifier missing-reference | MLP(128,64), binary |

**Note:** Sanitization NER classifier (sanitization-ner.jsonl, 4,000 examples) is excluded from this phase -- it uses a different architecture (token-level NER, not sentence-level MLP) and different training pipeline (10/11/12 series with transformers/optimum).

## Open Questions

1. **Optimal cloud data ratio per classifier**
   - What we know: Too much cloud data causes distribution shift; too little has no impact
   - What's unclear: Exact ratio depends on how different cloud text is from Faker text in embedding space
   - Recommendation: Start with 15-20% augmentation (generate ~300-500 examples per classifier), measure, adjust. For decomposition (42k examples), focus on lowest-F1 classes only.

2. **Expert exam test set size**
   - What we know: Needs to be large enough for statistical significance per class
   - What's unclear: How many examples per class for reliable accuracy measurement
   - Recommendation: 50 examples per class minimum (matches MIN_SAMPLES in 04_validate_model.mjs). For binary classifiers, 100 per class. Store separately from training JSONL (e.g., `scripts/training-data/expert-exam/`).

3. **Iterative loop convergence**
   - What we know: Some classifiers may plateau quickly (already near-perfect on Faker data)
   - What's unclear: How many iterations before diminishing returns
   - Recommendation: Implement plateau detection -- if accuracy improvement < 0.5% between rounds, stop. Cap at 3 iterations maximum.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | sklearn + custom benchmark (Python) + Node.js ONNX validation (existing) |
| Config file | scripts/train/requirements.txt |
| Quick run command | `python -u scripts/train/50_benchmark_models.py --classifier type` |
| Full suite command | `python -u scripts/train/50_benchmark_models.py --classifier all` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| (TBD) | Baseline accuracy measured for all classifiers | smoke | `python -u scripts/train/50_benchmark_models.py --classifier all` | Wave 0 |
| (TBD) | Cloud expert exam generated and scored | integration | `python -u scripts/train/50_benchmark_models.py --expert-exam --classifier all` | Wave 0 |
| (TBD) | Adversarial data generated per classifier | smoke | `python -u scripts/train/51_generate_adversarial.py --classifier type --count 50 --dry-run` | Wave 0 |
| (TBD) | Gap analysis produces actionable report | smoke | `python -u scripts/train/52_gap_analysis.py --classifier type` | Wave 0 |
| (TBD) | Teacher-student distillation relabels low-confidence examples | smoke | `python -u scripts/train/53_distill_labels.py --classifier type --count 20` | Wave 0 |
| (TBD) | Post-retrain accuracy >= pre-augmentation (no regression) | integration | Run existing validate scripts (04, 22, 32, 42) | Existing |
| (TBD) | Before/after Markdown report generated | smoke | Check `scripts/train/reports/` for output | Wave 0 |

### Sampling Rate
- **Per task commit:** `python -u scripts/train/50_benchmark_models.py --classifier type` (quick single-classifier check)
- **Per wave merge:** Full benchmark + retrain cycle on one representative classifier
- **Phase gate:** All 14 classifiers benchmarked, augmented, retrained, and validated with no accuracy regression

### Wave 0 Gaps
- [ ] `scripts/train/50_benchmark_models.py` -- benchmark framework for all classifiers
- [ ] `scripts/train/51_generate_adversarial.py` -- adversarial generation with Anthropic API
- [ ] `scripts/train/52_gap_analysis.py` -- systematic gap identification
- [ ] `scripts/train/53_distill_labels.py` -- teacher-student relabeling
- [ ] `scripts/train/reports/` directory -- output location for benchmark reports

## Sources

### Primary (HIGH confidence)
- `scripts/train/01_generate_data.py` -- established Anthropic API usage pattern with structured output
- `scripts/train/03_train_classifier.py` -- type classifier training pipeline
- `scripts/train/21_train_gtd_classifier.py` -- GTD classifier training with --classifier flag pattern
- `scripts/train/31_train_decomposition_classifier.py` -- decomposition model training
- `scripts/train/41_train_clarification_classifier.py` -- clarification model training with --classifier all
- `scripts/train/04_validate_model.mjs` -- Node.js ONNX validation pattern
- `scripts/train/requirements.txt` -- all dependencies already present (anthropic 0.84.0 installed)
- `scripts/training-data/*.jsonl` -- 14 existing training data files, line counts verified
- `src/storage/classification-log.ts` -- JSONL export function for classification history

### Secondary (MEDIUM confidence)
- Anthropic structured outputs: verified working in 01_generate_data.py with `output_config.format` + `json_schema`
- Model names `claude-haiku-4-5` and `claude-sonnet-4-6` -- verified from CONTEXT.md user decisions

### Tertiary (LOW confidence)
- Optimal augmentation ratios (10-30%) -- based on general ML best practice, not project-specific validation
- Plateau detection threshold (0.5% improvement) -- heuristic, needs empirical validation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and used in existing scripts
- Architecture: HIGH -- follows exact patterns from 01/03/21/31/41 series scripts
- Pitfalls: HIGH -- derived from direct code inspection of existing pipeline
- Cloud API patterns: HIGH -- proven in 01_generate_data.py with same SDK version

**Research date:** 2026-03-08
**Valid until:** 2026-04-08 (stable -- no fast-moving dependencies)
