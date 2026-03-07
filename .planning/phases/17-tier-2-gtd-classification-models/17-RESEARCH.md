# Phase 17: Tier 2 GTD Classification Models - Research

**Researched:** 2026-03-06
**Domain:** ONNX classification models for GTD intelligence (training pipeline + browser inference)
**Confidence:** HIGH

## Summary

Phase 17 adds four ONNX classifiers to the existing Tier 2 pipeline: GTD list routing (4-way), actionability detection (binary), project vs single-action (binary), and context tagging (6-way). All four follow the exact same MiniLM embedding + sklearn MLP + Platt calibration + ONNX export pattern established in Phase 9 (`03_train_classifier.py`) and use the Faker-based synthetic data generation pattern from Phase 14 (`10_generate_sanitization_data.py`).

The embedding worker already handles ONNX inference via `CLASSIFY_ONNX` messages. The core extension is: (1) load multiple ONNX sessions instead of one, (2) add new message types per classifier, (3) embed once and run all applicable classifiers on the same 384-dim vector. The training side requires two new Python scripts (data generation + training/export) that handle all four classifiers via `--classifier` flag.

**Primary recommendation:** Follow the existing patterns exactly -- the architecture, training pipeline, worker protocol, and confidence calibration are all proven. The main risk is training data quality for ambiguous GTD boundaries, which should be mitigated by including 15-20% borderline examples per the CONTEXT.md decision.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Four separate ONNX classifiers, each independent:
  1. GTD list routing -- 4-way: Next Action, Waiting For, Someday/Maybe, Reference
  2. Actionability detection -- binary: actionable vs non-actionable
  3. Project vs single-action -- binary: multi-step project vs single atomic action
  4. Context tagging -- 6-way: @computer, @phone, @errands, @home, @office, @agenda
- No custom/user-extensible contexts -- fixed set of 6
- Cascade execution: type classifier first, then if task -> run all 4 GTD classifiers
- Faker-based template generation (no Claude API costs)
- Single script with four modes: `python 20_generate_gtd_data.py --classifier <name> --count 1000`
- 1000 examples per label for each classifier
- 15-20% ambiguous/borderline examples
- MiniLM embeddings (384-dim) + sklearn MLP, exported to ONNX via skl2onnx
- Separate ONNX model per classifier (~2-5MB each)
- Single training script: `python 21_train_gtd_classifier.py --classifier <name>`
- Extend existing embedding worker -- embed once, run multiple ONNX classifiers
- No new workers
- Per-classifier confidence thresholds: GTD routing 0.70, Actionability 0.80, Project 0.75, Context 0.65
- Low-confidence without Tier 3: show "?" indicator
- Triage card shows all classifications at once
- User corrections logged via classification-log.ts
- Extend JSONL export for retraining data accumulation

### Claude's Discretion
- MLP hidden layer sizes and training hyperparameters
- Exact Faker template designs and diversity patterns
- Worker message protocol additions (CLASSIFY_GTD_ROUTING, etc.)
- How ambiguous examples are distributed across training data
- Validation script test case selection

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

Phase 17 has no pre-defined requirement IDs in REQUIREMENTS.md. These are derived from the CONTEXT.md decisions:

| ID | Description | Research Support |
|----|-------------|-----------------|
| GTD-01 | GTD list routing classifier (4-way: Next Action, Waiting For, Someday/Maybe, Reference) | Existing MLP + ONNX pattern from 03_train_classifier.py; Faker template pattern from 10_generate_sanitization_data.py |
| GTD-02 | Actionability detection classifier (binary: actionable vs non-actionable) | Same architecture, simpler label space |
| GTD-03 | Project vs single-action classifier (binary) | Same architecture, simpler label space |
| GTD-04 | Context tagging classifier (6-way: @computer, @phone, @errands, @home, @office, @agenda) | Same architecture, 6-class label space |
| GTD-05 | Cascade execution in embedding worker (type -> GTD classifiers) | Extend embedding-worker.ts message protocol |
| GTD-06 | Per-classifier confidence thresholds with "?" indicator for low confidence | Extend types.ts CONFIDENCE_THRESHOLDS, tier2-handler.ts result handling |
| GTD-07 | Triage card displays all GTD classifications | Extend TriageSuggestion interface, triage card UI |
| GTD-08 | Correction logging for GTD classifiers | Extend classification-log.ts ClassificationEvent |

</phase_requirements>

## Standard Stack

### Core (Training Pipeline)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| sentence-transformers | 5.2.3 | MiniLM embedding generation (parity with browser) | Already pinned in requirements.txt |
| scikit-learn | >=1.6,<1.7 | MLPClassifier + CalibratedClassifierCV | Proven pattern from 03_train_classifier.py |
| skl2onnx | 1.20.0 | sklearn-to-ONNX export (opset=17, zipmap=False) | Already pinned, WASM-compatible |
| onnxruntime | >=1.20,<1.22 | Python-side ONNX validation | Already pinned |
| faker | >=24.0 | Synthetic training data generation | Already pinned, proven in 10_generate_sanitization_data.py |
| numpy | >=1.26,<2.0 | Embedding matrix operations | Already pinned |
| onnx | >=1.17,<1.18 | ONNX model graph validation | Already pinned |

### Core (Browser Runtime)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| onnxruntime-web | (existing) | WASM-based ONNX inference in embedding worker | Already integrated |
| @huggingface/transformers | (existing) | MiniLM embedding pipeline | Already integrated |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| onnxruntime-node | (dev dep) | Node.js validation of ONNX models | Validation script (04-style) |

**Installation:** No new dependencies needed. All libraries already in `scripts/train/requirements.txt` and `package.json`.

## Architecture Patterns

### Training Pipeline Structure
```
scripts/
├── train/
│   ├── 20_generate_gtd_data.py      # Faker-based GTD training data (4 modes)
│   ├── 21_train_gtd_classifier.py   # MLP train + ONNX export (4 modes)
│   ├── 22_validate_gtd_models.mjs   # Node.js ONNX validation (all 4)
│   └── requirements.txt             # Already has all deps
├── training-data/
│   ├── gtd-routing.jsonl            # {"text": "...", "label": "next-action"}
│   ├── actionability.jsonl          # {"text": "...", "label": "actionable"}
│   ├── project-detection.jsonl      # {"text": "...", "label": "project"}
│   └── context-tagging.jsonl        # {"text": "...", "label": "@computer"}
public/
└── models/
    └── classifiers/
        ├── triage-type.onnx         # Existing
        ├── triage-type-classes.json # Existing
        ├── gtd-routing.onnx         # NEW
        ├── gtd-routing-classes.json # NEW
        ├── actionability.onnx       # NEW
        ├── actionability-classes.json
        ├── project-detection.onnx   # NEW
        ├── project-detection-classes.json
        ├── context-tagging.onnx     # NEW
        └── context-tagging-classes.json
```

### Pattern 1: Multi-Classifier Embedding Worker
**What:** Embed once via MiniLM, run N ONNX classifiers on the same 384-dim vector.
**When to use:** When type classifier returns "task" and GTD classifiers should fire.

```typescript
// New message types for embedding-worker.ts
type WorkerIncoming =
  // ... existing types ...
  | { type: 'CLASSIFY_GTD'; id: string; text: string }  // Runs all 4 GTD classifiers

// Single message triggers cascade: embed once, run 4 ONNX sessions
// Returns combined result with all classifications
type GtdClassifyResult = {
  type: 'GTD_RESULT';
  id: string;
  vector: number[];
  routing: { scores: Record<string, number> } | null;   // null if model not loaded
  actionability: { scores: Record<string, number> } | null;
  project: { scores: Record<string, number> } | null;
  context: { scores: Record<string, number> } | null;
};
```

### Pattern 2: Classifier Registry in Worker
**What:** Instead of hardcoding each classifier's session/classMap, use a registry pattern.
**When to use:** When loading and managing multiple ONNX sessions in one worker.

```typescript
// Registry approach -- cleaner than 4 separate session/classMap pairs
interface ClassifierConfig {
  name: string;
  modelPath: string;
  classesPath: string;
  session: ort.InferenceSession | null;
  classMap: Record<string, string> | null;
}

const CLASSIFIER_REGISTRY: ClassifierConfig[] = [
  { name: 'triage-type', modelPath: 'models/classifiers/triage-type.onnx',
    classesPath: 'models/classifiers/triage-type-classes.json', session: null, classMap: null },
  { name: 'gtd-routing', modelPath: 'models/classifiers/gtd-routing.onnx',
    classesPath: 'models/classifiers/gtd-routing-classes.json', session: null, classMap: null },
  // ... etc
];
```

### Pattern 3: Cascade Execution in Triage Pipeline
**What:** Type classification runs first; if result is "task", run GTD classifiers.
**When to use:** During triage -- avoid wasting inference on non-task atoms.

```typescript
// In triage.ts or tier2-handler.ts
if (typeResult.type === 'task') {
  const gtdResult = await classifyGtd(worker, text);
  // Merge GTD results into TriageSuggestion
}
// Non-task atoms skip GTD entirely (always "Reference" for routing)
```

### Pattern 4: Training Script Multi-Mode
**What:** Single Python script handles all 4 classifiers via `--classifier` flag.
**When to use:** Follows the CONTEXT.md decision for script naming.

```python
# 20_generate_gtd_data.py
CLASSIFIERS = {
    'gtd-routing': {
        'labels': ['next-action', 'waiting-for', 'someday-maybe', 'reference'],
        'templates': GTD_ROUTING_TEMPLATES,
        'output': 'gtd-routing.jsonl',
    },
    'actionability': {
        'labels': ['actionable', 'non-actionable'],
        'templates': ACTIONABILITY_TEMPLATES,
        'output': 'actionability.jsonl',
    },
    # ... etc
}

parser.add_argument('--classifier', choices=CLASSIFIERS.keys(), required=True)
parser.add_argument('--count', type=int, default=1000, help='Examples per label')
```

### Anti-Patterns to Avoid
- **Separate embedding per classifier:** Embed once, reuse the 384-dim vector for all ONNX sessions. MiniLM inference is the expensive part (~50-100ms), ONNX MLP inference is cheap (~1-5ms each).
- **Loading all GTD models eagerly at worker init:** Only load GTD models when first GTD classification is requested (lazy loading). The type classifier is used for all atoms; GTD classifiers only for tasks.
- **Single multi-output ONNX model:** The CONTEXT.md locks separate models. Multi-output would complicate retraining individual classifiers.
- **Running GTD classifiers on non-task atoms:** Wastes inference cycles. Facts, events, decisions, and insights should skip GTD and default to "Reference" for routing.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Probability calibration | Custom sigmoid scaling | `CalibratedClassifierCV(method='sigmoid', cv=5)` | Platt calibration is well-studied; sklearn handles edge cases |
| ONNX export | Manual weight serialization | `skl2onnx.convert_sklearn(target_opset=17, options={'zipmap': False})` | zipmap/opset bugs are subtle; proven pattern exists |
| Synthetic data diversity | Manual string concatenation | Faker library with locale-specific generators | Consistent naming, addresses, realistic patterns |
| Embedding parity verification | Eyeball comparison | `02_embed_data.py` L2 norm check pattern | Silent embedding mismatch causes accuracy drops |
| ONNX model caching | localStorage/manual cache | Cache API (`caches.open()`) with streaming download | Already proven in embedding-worker.ts fetchWithCache() |
| Ambiguity detection | Custom threshold logic | Confidence spread (top1 - top2) < 0.15 | Locked decision, proven pattern from type classifier |

## Common Pitfalls

### Pitfall 1: GTD Label Ambiguity in Training Data
**What goes wrong:** Synthetic examples for GTD routing have unclear boundaries. "Maybe I should call the dentist" -- is this Next Action or Someday/Maybe?
**Why it happens:** GTD categories are inherently fuzzy -- the same text can be classified differently depending on user intent.
**How to avoid:** Include 15-20% deliberately ambiguous examples per the CONTEXT.md decision. Label them by the "most GTD-orthodox" interpretation. The model should learn that ambiguity exists and produce lower confidence for these cases.
**Warning signs:** Model produces uniformly high confidence (>0.90) even on borderline examples -- this means calibration is wrong.

### Pitfall 2: Memory Pressure from 5 ONNX Sessions
**What goes wrong:** Loading 5 ONNX models simultaneously (1 type + 4 GTD) exhausts worker memory on mobile devices.
**Why it happens:** Each ONNX session holds model weights in WASM memory. 5 models x 2-5MB = 10-25MB of WASM heap.
**How to avoid:** Lazy-load GTD models on first GTD classification request (not at worker init). The type classifier loads eagerly (used for all atoms); GTD classifiers load on-demand (only for tasks).
**Warning signs:** Worker crashes or OOM on mobile after enabling classification.

### Pitfall 3: ONNX opset=17 and zipmap=False
**What goes wrong:** Higher opset versions or zipmap=True produce models that fail in onnxruntime-web WASM backend.
**Why it happens:** onnxruntime-web WASM has limited opset support. zipmap=True produces a different output format (list of dicts vs plain array).
**How to avoid:** Always export with `target_opset=17` and `options={'zipmap': False}`. This is a locked pattern from Phase 9.
**Warning signs:** Browser console shows "Unrecognized operator" or probability output is wrong shape.

### Pitfall 4: Embedding Parity Between Python and Browser
**What goes wrong:** Python training uses `sentence-transformers/all-MiniLM-L6-v2` but browser uses `Xenova/all-MiniLM-L6-v2`. If pooling/normalization differs, accuracy drops.
**Why it happens:** Different implementations of the same model can produce slightly different embeddings.
**How to avoid:** Always use `normalize_embeddings=True` in Python and `{ pooling: 'mean', normalize: true }` in browser. The validation script (04-style) catches this.
**Warning signs:** >5% accuracy drop between Python test set and Node.js validation.

### Pitfall 5: Context Tag Training Data Bias
**What goes wrong:** @computer gets overrepresented because most training templates are about digital work.
**Why it happens:** Faker generates tech/business-oriented text by default. @errands, @home, @phone get fewer natural examples.
**How to avoid:** Design templates deliberately balanced across all 6 contexts. Use domain-specific verbs and nouns: @errands (pick up, drop off, store, pharmacy), @phone (call, dial, leave message), @home (clean, fix, mow, cook).
**Warning signs:** Per-class F1 scores show >0.15 variance across context labels.

### Pitfall 6: Cache API Version Conflicts
**What goes wrong:** Old cached models from a previous version serve stale ONNX files.
**Why it happens:** The existing `CLASSIFIER_CACHE_NAME = 'onnx-classifier-v1'` caches all models. Adding new models without updating the version could mix old/new.
**How to avoid:** Bump the cache version name when adding new models (e.g., `onnx-classifier-v2`). The existing `cleanOldCaches()` function handles migration.
**Warning signs:** Browser loads old model despite new model being deployed.

## Code Examples

### Training Data Generation Template (Faker-based)
```python
# Source: Pattern from scripts/train/10_generate_sanitization_data.py
# Adapted for GTD routing classifier

GTD_ROUTING_TEMPLATES = [
    # Next Action -- has clear next step
    ("Call {person} about the {topic}", "next-action"),
    ("Buy {item} from {store}", "next-action"),
    ("Email {person} the {document}", "next-action"),
    ("Fix the {problem} in the {location}", "next-action"),

    # Waiting For -- delegated, waiting on external
    ("Waiting for {person} to send {document}", "waiting-for"),
    ("{person} will get back to me about {topic}", "waiting-for"),
    ("Order placed for {item}, tracking {number}", "waiting-for"),

    # Someday/Maybe -- aspirational, no commitment
    ("Maybe learn {skill} someday", "someday-maybe"),
    ("Consider switching to {tool} for {purpose}", "someday-maybe"),
    ("Would be nice to visit {location}", "someday-maybe"),

    # Reference -- informational, no action
    ("{person}'s phone number is {phone}", "reference"),
    ("The {system} password is stored in {tool}", "reference"),
    ("Office hours are {time} to {time}", "reference"),
]

# Ambiguous borderline examples (15-20% of total)
AMBIGUOUS_TEMPLATES = [
    ("Maybe call {person} next week", "someday-maybe"),  # Could be next-action
    ("The {item} is broken", "reference"),  # Could imply action
    ("{person} mentioned they'd send the {document}", "waiting-for"),  # Soft delegation
]
```

### MLP Training with Platt Calibration (Per-Classifier)
```python
# Source: Pattern from scripts/train/03_train_classifier.py
# Adapted for per-classifier thresholds

CLASSIFIER_CONFIGS = {
    'gtd-routing': {
        'hidden_layers': (256, 128),
        'confidence_threshold': 0.70,
        'labels': ['next-action', 'waiting-for', 'someday-maybe', 'reference'],
    },
    'actionability': {
        'hidden_layers': (128, 64),  # Simpler for binary
        'confidence_threshold': 0.80,
        'labels': ['actionable', 'non-actionable'],
    },
    'project-detection': {
        'hidden_layers': (128, 64),  # Simpler for binary
        'confidence_threshold': 0.75,
        'labels': ['project', 'single-action'],
    },
    'context-tagging': {
        'hidden_layers': (256, 128),
        'confidence_threshold': 0.65,
        'labels': ['@computer', '@phone', '@errands', '@home', '@office', '@agenda'],
    },
}
```

### Embedding Worker Multi-Classifier Inference
```typescript
// Source: Pattern from src/search/embedding-worker.ts runClassifierInference()
// Extended for multiple ONNX sessions

async function runGtdClassification(embedding: number[]): Promise<GtdScores> {
  const results: GtdScores = {};

  // Run each loaded GTD classifier on the same embedding vector
  for (const config of GTD_CLASSIFIERS) {
    if (!config.session || !config.classMap) continue;

    const inputTensor = new ort.Tensor('float32', Float32Array.from(embedding), [1, 384]);
    const outputs = await config.session.run({
      [config.session.inputNames[0]!]: inputTensor,
    });

    const probaName = config.session.outputNames.find(n => n.toLowerCase().includes('prob'))
      ?? config.session.outputNames[1] ?? config.session.outputNames[0];
    const probData = Array.from(outputs[probaName!]!.data as Float32Array);

    const scores: Record<string, number> = {};
    for (let i = 0; i < probData.length; i++) {
      const label = config.classMap[String(i)];
      if (label) scores[label] = probData[i] ?? 0;
    }
    results[config.name] = scores;
  }

  return results;
}
```

### Extended TriageSuggestion Interface
```typescript
// Source: src/ai/triage.ts TriageSuggestion
// Extended with GTD classification fields

export interface TriageSuggestion {
  // ... existing fields ...

  /** GTD list routing suggestion (only for tasks) */
  gtdRouting?: string;           // 'next-action' | 'waiting-for' | 'someday-maybe' | 'reference'
  gtdRoutingConfidence?: number;
  /** Actionability assessment */
  actionable?: boolean;
  actionableConfidence?: number;
  /** Project detection */
  isProject?: boolean;
  projectConfidence?: number;
  /** Context tag */
  contextTag?: string;           // '@computer' | '@phone' | '@errands' | '@home' | '@office' | '@agenda'
  contextTagConfidence?: number;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Centroid cosine similarity | ONNX MLP classifier | Phase 9-10 | Centroid is fallback only; ONNX is primary path |
| Claude API for training data | Faker-based synthetic generation | Phase 14 | Zero API costs, reproducible, faster |
| Single ONNX classifier | Multiple ONNX classifiers in one worker | Phase 17 (this) | Embed once, classify N times |
| Type-only classification | Type + GTD intelligence | Phase 17 (this) | Full GTD workflow support at Tier 2 |

## Open Questions

1. **Optimal MLP sizes for binary classifiers**
   - What we know: (256, 128) works well for 5-class type classifier
   - What's unclear: Whether binary classifiers (actionability, project) need the same capacity
   - Recommendation: Use (128, 64) for binary, (256, 128) for multi-class. If accuracy is poor, scale up. This is within Claude's discretion per CONTEXT.md.

2. **Total worker memory with 5 ONNX sessions**
   - What we know: Current type classifier ONNX is ~2.6MB. Each GTD model should be 2-5MB.
   - What's unclear: Exact WASM heap overhead per session on mobile
   - Recommendation: Measure total memory after loading all 5 sessions. If >30MB, consider unloading type classifier's centroid fallback code to compensate. Lazy loading of GTD models mitigates most risk.

3. **Cache API version bump strategy**
   - What we know: Current cache is `onnx-classifier-v1` and cleanOldCaches() exists
   - What's unclear: Whether to use one cache for all classifiers or separate caches
   - Recommendation: Single cache `onnx-classifier-v2` for all models. cleanOldCaches() already handles migration.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js ONNX validation script (onnxruntime-node) + Python sklearn metrics |
| Config file | scripts/train/22_validate_gtd_models.mjs (new -- Wave 0) |
| Quick run command | `node scripts/train/22_validate_gtd_models.mjs --classifier gtd-routing` |
| Full suite command | `node scripts/train/22_validate_gtd_models.mjs --all` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GTD-01 | GTD routing classifier accuracy >90% | validation | `python scripts/train/21_train_gtd_classifier.py --classifier gtd-routing` (prints report) | No -- Wave 0 |
| GTD-02 | Actionability classifier accuracy >90% | validation | `python scripts/train/21_train_gtd_classifier.py --classifier actionability` | No -- Wave 0 |
| GTD-03 | Project detection accuracy >90% | validation | `python scripts/train/21_train_gtd_classifier.py --classifier project-detection` | No -- Wave 0 |
| GTD-04 | Context tagging accuracy >85% | validation | `python scripts/train/21_train_gtd_classifier.py --classifier context-tagging` | No -- Wave 0 |
| GTD-05 | ONNX Python/Node parity >95% | validation | `node scripts/train/22_validate_gtd_models.mjs --all` | No -- Wave 0 |
| GTD-06 | Confidence thresholds applied correctly | manual | Visual inspection of triage cards with "?" indicator | N/A -- manual |
| GTD-07 | Triage card shows GTD classifications | manual | Visual inspection of triage card UI | N/A -- manual |
| GTD-08 | Corrections logged for GTD classifiers | manual | Verify JSONL export includes GTD fields | N/A -- manual |

### Sampling Rate
- **Per task commit:** Training script evaluation report (built into script output)
- **Per wave merge:** `node scripts/train/22_validate_gtd_models.mjs --all`
- **Phase gate:** All 4 models trained, validated (>95% Python/Node parity), and integrated

### Wave 0 Gaps
- [ ] `scripts/train/20_generate_gtd_data.py` -- Faker-based data generation for all 4 classifiers
- [ ] `scripts/train/21_train_gtd_classifier.py` -- MLP training + ONNX export for all 4 classifiers
- [ ] `scripts/train/22_validate_gtd_models.mjs` -- Node.js ONNX validation for all 4 models
- [ ] `scripts/training-data/gtd-routing.jsonl` -- training data output
- [ ] `scripts/training-data/actionability.jsonl` -- training data output
- [ ] `scripts/training-data/project-detection.jsonl` -- training data output
- [ ] `scripts/training-data/context-tagging.jsonl` -- training data output

## Sources

### Primary (HIGH confidence)
- `scripts/train/03_train_classifier.py` -- Existing MLP + Platt + ONNX export pattern (read directly)
- `scripts/train/10_generate_sanitization_data.py` -- Existing Faker template generation pattern (read directly)
- `src/search/embedding-worker.ts` -- Existing ONNX inference and worker protocol (read directly)
- `src/ai/tier2/tier2-handler.ts` -- Existing Tier 2 handler with ONNX and centroid paths (read directly)
- `src/ai/tier2/types.ts` -- AITaskType enum, CONFIDENCE_THRESHOLDS, TieredResult (read directly)
- `src/ai/triage.ts` -- Triage pipeline with tiered dispatch (read directly)
- `src/storage/classification-log.ts` -- Classification event logging (read directly)
- `scripts/train/04_validate_model.mjs` -- Node.js ONNX validation pattern (read directly)
- `scripts/train/02_embed_data.py` -- MiniLM embedding + parity verification (read directly)
- `scripts/train/requirements.txt` -- Pinned Python dependencies (read directly)

### Secondary (MEDIUM confidence)
- CONTEXT.md decisions from user discussion session (read directly, treated as locked)

### Tertiary (LOW confidence)
- None -- all research based on existing codebase patterns with no external lookups needed

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use, versions pinned
- Architecture: HIGH -- extending proven patterns, no new architectural decisions
- Pitfalls: HIGH -- derived from direct experience with existing codebase patterns
- Training data quality: MEDIUM -- Faker template design for GTD boundaries requires careful thought, but the pattern is proven

**Research date:** 2026-03-06
**Valid until:** 2026-04-06 (stable -- no fast-moving dependencies)
