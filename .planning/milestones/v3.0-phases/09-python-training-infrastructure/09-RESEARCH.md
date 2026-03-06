# Phase 9: Python Training Infrastructure - Research

**Researched:** 2026-03-04
**Domain:** Python ML pipeline — synthetic GTD data generation, sklearn classifier training, ONNX export, confidence calibration, browser-runtime validation
**Confidence:** HIGH (Python ML stack well-documented; specific API patterns verified against official docs)

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TRAIN-01 | Developer can generate 300–500 labeled synthetic GTD training examples per atom type via cloud LLM script, writing to `scripts/training-data/type-classification.jsonl` | Anthropic structured-outputs API (`output_config.format`); JSONL loop pattern; diversity prompt strategy documented in pitfalls |
| TRAIN-02 | Developer can fine-tune a classification head on MiniLM embeddings using the synthetic corpus and export a validated `triage-type.onnx` to `public/models/classifiers/` | sentence-transformers 5.2.3 `.encode()` API; sklearn MLPClassifier; skl2onnx 1.20 `convert_sklearn()`; INT8 quantization not possible with skl2onnx — skip quantization for this phase (classifier head is ~200KB unquantized) |
| TRAIN-03 | Browser-runtime validation harness confirms >95% top-1 prediction match between Python inference and ONNX Runtime Web on the same 50+ inputs | onnxruntime-web 1.24.2 `InferenceSession.create()` in a Node.js script using `onnxruntime-web/node` shim; compare Python `ort.InferenceSession` vs Node.js `onnxruntime-web` outputs |
| TRAIN-04 | A new developer can reproduce the entire pipeline using only `scripts/train/` and committed `requirements.txt` | 4-script structure with clear README; `ANTHROPIC_API_KEY` env var via `.env.local` pattern already established; `requirements.txt` covers all Python deps |
| CONF-01 | ONNX model confidence scores are calibrated (Platt/temperature scaling) so escalation thresholds produce correct Tier 2→3 escalation rates | sklearn `CalibratedClassifierCV(method='sigmoid')` wraps the trained MLPClassifier; calibration output is a new sklearn object that exports to ONNX via the same `convert_sklearn()` call; calibrated `predict_proba()` is the output |

</phase_requirements>

---

## Summary

Phase 9 is a pure Python developer toolchain — no TypeScript changes, no browser integration. The goal is a 4-script pipeline in `scripts/train/` that produces a validated `triage-type.onnx` file ready for browser deployment in Phase 10. The pipeline is: (1) generate labeled GTD training examples via Anthropic API, (2) embed them with the same MiniLM model the browser uses, (3) train a lightweight sklearn MLPClassifier on the embeddings, apply Platt calibration, and export to ONNX, (4) validate the exported ONNX against Python inference in a Node.js harness using `onnxruntime-web` to catch WASM/Python numerical divergence before browser integration begins.

The Python stack is well-established: `sentence-transformers` 5.2.3 for MiniLM embedding generation, `scikit-learn` for the MLPClassifier and `CalibratedClassifierCV`, `skl2onnx` 1.20 for ONNX export, and `onnxruntime` for Python-side validation. The Anthropic SDK's `output_config.format` (structured outputs, now GA as of November 2025) eliminates JSON parsing errors when generating labeled training examples. The critical constraint is that Python embeddings MUST use the identical model and pooling settings as the browser: `sentence-transformers/all-MiniLM-L6-v2` with mean pooling and L2 normalization — any deviation produces distribution shift that silently destroys accuracy.

Browser-runtime validation (TRAIN-03) is the acceptance gate: the ONNX file does not ship to Phase 10 until a Node.js script loads it with `onnxruntime-web` (same WASM engine as the browser) and confirms >95% top-1 match against Python inference on 50+ test inputs. The `modelSuggestion` field must also be added to `ClassificationEvent` in Dexie in this phase — schema decisions from STATE.md — because retrofitting it after the Phase 10 classifier ships is costly.

**Primary recommendation:** 4-script pipeline in `scripts/train/` with a committed `requirements.txt`. Use Anthropic structured outputs for data generation, sklearn MLPClassifier + CalibratedClassifierCV for training, skl2onnx for ONNX export, and a Node.js `onnxruntime-web` script for browser-runtime validation.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `sentence-transformers` | 5.2.3 | MiniLM embedding generation in Python training | Same model family as browser; `.encode()` returns mean-pooled normalized 384-dim float32 arrays; parity with browser is the design constraint |
| `scikit-learn` | 1.6.x | MLPClassifier training + CalibratedClassifierCV calibration | Native Python ML; skl2onnx has first-class sklearn support; MLPClassifier verified supported in skl2onnx 1.20 |
| `skl2onnx` | 1.20.0 | Convert sklearn model to ONNX | Official sklearn→ONNX converter; supports MLPClassifier; `target_opset=17` produces WASM-compatible graph |
| `onnxruntime` | 1.20.x | Python-side ONNX validation | Reference runtime for validating export before browser validation step |
| `anthropic` | 0.45.x | Structured data generation via Claude API | `output_config.format` GA since Nov 2025; guarantees JSON schema compliance without retry logic |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `numpy` | 1.26.x | Array operations, embedding storage | Required by sentence-transformers; use for `.npy` intermediate embedding cache |
| `onnx` | 1.17.x | ONNX graph inspection and simplification | Use `onnx.checker.check_model()` to validate graph before running onnxruntime |
| `python-dotenv` | 1.0.x | Load `ANTHROPIC_API_KEY` from `.env.local` | Matches the project's existing `.env.local` pattern |
| `tqdm` | 4.66.x | Progress bar for generation loop | Quality of life for the 1500+ API calls in data generation |

### Node.js validation runtime (already in repo)
| Package | Source | Purpose | When to Use |
|---------|--------|---------|-------------|
| `onnxruntime-web` | `node_modules/` (transitive dep of @huggingface/transformers) | Browser-runtime validation in Node.js | TRAIN-03: load `.onnx` in Node.js with WASM backend, compare predictions to Python `onnxruntime` outputs |

**Note on onnxruntime-web for Node.js validation:** `onnxruntime-web` works in Node.js with the `wasm` execution provider. Use `const ort = require('onnxruntime-web/node')` or ESM import. This is not the same as `onnxruntime-node` (which uses native bindings) — the goal is to test with the WASM backend that browsers use.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| sklearn MLPClassifier | PyTorch MLP | PyTorch is harder to export cleanly to ONNX for small models; skl2onnx + sklearn is the fastest path to a browser-compatible ONNX classifier for this use case |
| sklearn MLPClassifier | LogisticRegression | Logistic regression is faster to train and export but may underfit on 384-dim embedding space with 5 classes; MLP with (256, 128) hidden layers handles the 5-class GTD boundary better |
| CalibratedClassifierCV (Platt) | Temperature scaling | Temperature scaling requires PyTorch access to logits; CalibratedClassifierCV wraps sklearn models natively and exports together via skl2onnx as one pipeline |
| Anthropic structured outputs | JSON-mode prompting | JSON-mode prompting requires retry logic and validation; `output_config.format` with `json_schema` guarantees schema compliance with zero retries |

**Installation:**
```bash
pip install sentence-transformers==5.2.3 scikit-learn skl2onnx==1.20.0 onnxruntime anthropic python-dotenv numpy onnx tqdm
```

---

## Architecture Patterns

### Recommended Project Structure
```
scripts/
├── download-model.cjs          # EXISTING: downloads MiniLM for dev
└── train/
    ├── requirements.txt        # NEW: pinned Python deps
    ├── 01_generate_data.py     # NEW: Anthropic API → JSONL
    ├── 02_embed_data.py        # NEW: MiniLM embed → .npy cache
    ├── 03_train_classifier.py  # NEW: train + calibrate + export ONNX
    ├── 04_validate_model.py    # NEW: Python ort + onnxruntime-web validation
    └── README.md               # NEW: reproduce instructions

scripts/training-data/          # NEW (gitignored? No — commit it)
    type-classification.jsonl   # labeled examples, 300-500 per class

public/models/
    classifiers/                # NEW
        triage-type.onnx        # output of script 03 (committed)

src/storage/
    classification-log.ts       # MODIFIED: add modelSuggestion field + Dexie migration
```

**Gitignore decisions:**
- `scripts/training-data/*.jsonl` — commit these (not large, auditable, required for TRAIN-04 reproducibility)
- `scripts/train/*.npy` — gitignore (derived, reproducible from JSONL + script 02)
- `public/models/classifiers/*.onnx` — commit (small ~200-400KB, required for Phase 10)
- `public/models/` is currently gitignored for the large MiniLM model — update `.gitignore` to exclude `classifiers/` from that ignore rule: `!public/models/classifiers/`

### Pattern 1: Anthropic Structured Data Generation

**What:** Use `client.messages.create()` with `output_config.format` (JSON schema) to generate labeled GTD examples in a loop. One API call per example (or use batch API for cost reduction). Write each example as a JSONL line.

**When to use:** Script 01 — generating `type-classification.jsonl`.

**Example:**
```python
# Source: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
import anthropic, json

client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env

SCHEMA = {
    "type": "object",
    "properties": {
        "text": {"type": "string", "description": "the GTD inbox item text"},
        "label": {"type": "string", "enum": ["task", "fact", "event", "decision", "insight"]},
        "explanation": {"type": "string", "description": "why this label applies"}
    },
    "required": ["text", "label", "explanation"],
    "additionalProperties": False
}

GTD_DEFINITIONS = """
- task: requires a concrete next action; has a clear completion state; starts with an action verb
- fact: reference information; no action required; states something true
- event: time-anchored; describes something that will or did happen
- decision: records a choice already made; may include rationale
- insight: generalizable principle or learning; abstracted from a specific situation
"""

def generate_example(label: str, style: str) -> dict:
    """Generate one labeled GTD example for the given label and style variation."""
    response = client.messages.create(
        model="claude-haiku-4-5",  # Use Haiku for cost efficiency in bulk generation
        max_tokens=256,
        messages=[{
            "role": "user",
            "content": f"""Generate a realistic GTD inbox item that is a '{label}'.
Style: {style}

GTD type definitions:
{GTD_DEFINITIONS}

The item should be {style}. Label must be '{label}'.
Return a realistic inbox item a person might actually write."""
        }],
        output_config={
            "format": {
                "type": "json_schema",
                "schema": SCHEMA
            }
        }
    )
    return json.loads(response.content[0].text)
```

### Pattern 2: Embedding Parity — Python Must Match Browser

**What:** Python embedding must produce the same 384-dim float32 vector as the browser's `Xenova/all-MiniLM-L6-v2` with `{ pooling: 'mean', normalize: true }`. Use the `sentence-transformers` library which implements identical mean pooling + L2 normalization.

**When to use:** Script 02 — embedding the JSONL training data.

**Example:**
```python
# Source: https://sbert.net/docs/quickstart.html
from sentence_transformers import SentenceTransformer
import numpy as np

# CRITICAL: Use the exact same model name as the browser
# Browser: env.localModelPath = '/models/', MODEL_ID = 'Xenova/all-MiniLM-L6-v2'
# Python:  model_name = 'sentence-transformers/all-MiniLM-L6-v2'
# Both are the same model weights; Xenova is a ONNX-converted copy of the same HF model

model = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')
# normalize_embeddings=True matches browser's { normalize: true }
# batch_size=64 for efficient processing
embeddings = model.encode(texts, normalize_embeddings=True, batch_size=64, show_progress_bar=True)
# Output: np.ndarray shape (N, 384), dtype float32

# Cache embeddings to avoid re-running during classifier training iterations
np.save('scripts/train/embeddings_cache.npy', embeddings)
```

**Parity verification (include in script 02):**
```python
# Spot-check: compute a known test sentence and compare output length/dtype
test = model.encode(["Schedule dentist appointment"], normalize_embeddings=True)
assert test.shape == (1, 384), f"Expected (1, 384) got {test.shape}"
assert test.dtype == np.float32
assert abs(np.linalg.norm(test[0]) - 1.0) < 1e-5, "Vector not normalized"
print("Parity check passed: 384-dim normalized float32")
```

### Pattern 3: sklearn MLPClassifier + CalibratedClassifierCV → ONNX

**What:** Train a 2-layer MLP on embedding vectors, wrap in `CalibratedClassifierCV` for Platt scaling, export the whole pipeline to ONNX with `skl2onnx`.

**When to use:** Script 03 — training and exporting.

**Example:**
```python
# Source: https://onnx.ai/sklearn-onnx/ + https://scikit-learn.org/stable/modules/calibration.html
import numpy as np
from sklearn.neural_network import MLPClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType

# Load cached embeddings and labels
X = np.load('scripts/train/embeddings_cache.npy')  # shape (N, 384)
labels = [...]  # list of string labels from JSONL

le = LabelEncoder()
y = le.fit_transform(labels)  # ['decision','event','fact','insight','task'] → [0,1,2,3,4]

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

# Base classifier — small hidden layers appropriate for 384-dim input → 5-class output
base_clf = MLPClassifier(
    hidden_layer_sizes=(256, 128),
    activation='relu',
    max_iter=500,
    random_state=42,
    early_stopping=True,
    validation_fraction=0.1
)

# Platt scaling calibration — wraps the base classifier
# cv=5: 5-fold cross-validation for calibrator fitting
# method='sigmoid': Platt scaling (logistic regression over raw probabilities)
calibrated_clf = CalibratedClassifierCV(estimator=base_clf, method='sigmoid', cv=5)
calibrated_clf.fit(X_train, y_train)

# Evaluate calibrated model
from sklearn.metrics import classification_report
y_pred = calibrated_clf.predict(X_test)
print(classification_report(y_test, y_pred, target_names=le.classes_))

# Export to ONNX — include calibration in the graph
initial_type = [('float_input', FloatTensorType([None, 384]))]
onnx_model = convert_sklearn(
    calibrated_clf,
    initial_types=initial_type,
    target_opset=17,  # ONNX opset 17 — compatible with onnxruntime-web WASM backend
    options={'zipmap': False}  # output probability array, not dict
)

with open('public/models/classifiers/triage-type.onnx', 'wb') as f:
    f.write(onnx_model.SerializeToString())

# Save class mapping for the browser (needed by tier2-handler)
import json
class_map = {i: name for i, name in enumerate(le.classes_)}
with open('public/models/classifiers/triage-type-classes.json', 'w') as f:
    json.dump(class_map, f)

print("Exported:", {i: le.classes_[i] for i in range(len(le.classes_))})
```

**Note on `zipmap: False`:** By default, skl2onnx wraps `predict_proba` output in a `ZipMap` operator that creates a dict. Setting `zipmap: False` outputs a plain float32 probability array — required for `onnxruntime-web` to process correctly.

### Pattern 4: Browser-Runtime Validation with onnxruntime-web in Node.js

**What:** Load the exported `.onnx` file in Node.js using `onnxruntime-web` with the WASM backend (same engine as browsers), run 50+ test inputs through both Python `onnxruntime` and the Node.js `onnxruntime-web`, assert >95% top-1 match.

**When to use:** Script 04 — validation gate before Phase 10 integration.

**Example (Node.js):**
```javascript
// scripts/train/04_validate_model.js (Node.js, ESM)
// Source: https://onnxruntime.ai/docs/tutorials/web/
import * as ort from 'onnxruntime-web/node';  // WASM backend in Node.js
import { readFileSync } from 'fs';

async function validate() {
  const modelPath = 'public/models/classifiers/triage-type.onnx';
  const session = await ort.InferenceSession.create(modelPath, {
    executionProviders: ['wasm']  // Force WASM — same as browser
  });

  // Load test embeddings and Python predictions (written by script 03)
  const testEmbeddings = JSON.parse(readFileSync('scripts/train/test_embeddings.json'));
  const pythonPredictions = JSON.parse(readFileSync('scripts/train/python_predictions.json'));

  let matchCount = 0;
  const maxDiffs = [];

  for (let i = 0; i < testEmbeddings.length; i++) {
    const embedding = testEmbeddings[i];
    const inputTensor = new ort.Tensor('float32', Float32Array.from(embedding), [1, 384]);
    const results = await session.run({ float_input: inputTensor });

    // Output name may be 'output_probability' or 'probabilities' — check with session.outputNames
    const probabilities = Array.from(results[session.outputNames[1]].data);
    const browserTopK = probabilities.indexOf(Math.max(...probabilities));
    const pythonTopK = pythonPredictions[i];

    if (browserTopK === pythonTopK) matchCount++;
    const maxDiff = Math.max(...probabilities.map((p, j) => Math.abs(p - /* python_probs[i][j] */ 0)));
    maxDiffs.push(maxDiff);
  }

  const matchRate = matchCount / testEmbeddings.length;
  console.log(`Top-1 match rate: ${(matchRate * 100).toFixed(1)}% (${matchCount}/${testEmbeddings.length})`);
  console.log(`Max probability diff: ${Math.max(...maxDiffs).toFixed(4)}`);

  if (matchRate < 0.95) {
    console.error('VALIDATION FAILED: match rate below 95% threshold');
    process.exit(1);
  }
  console.log('VALIDATION PASSED: model ready for Phase 10 integration');
}

validate().catch(err => { console.error(err); process.exit(1); });
```

**Note on session output names:** After ONNX export, inspect `session.outputNames` in the validation script — skl2onnx exports two outputs: class labels (`output_label`) and class probabilities (`output_probability`). Use `output_probability` for the softmax-like array.

### Pattern 5: Dexie Schema Migration — Add modelSuggestion Field

**What:** Add `modelSuggestion?: AtomType` to the `ClassificationEvent` interface and update Dexie schema version. STATE.md decision: "modelSuggestion field added to ClassificationEvent schema in Phase 9, before classifier ships in Phase 10."

**When to use:** As part of Phase 9 — the field must exist before the classifier ships.

**Example:**
```typescript
// src/storage/classification-log.ts — add optional field
export interface ClassificationEvent {
  // ... existing fields ...
  tier?: 1 | 2 | 3;
  confidence?: number;
  embedding?: number[];
  /** Model's top suggestion BEFORE user interaction (Phase 9+) */
  modelSuggestion?: AtomType;
}
```

Dexie schema version bump is NOT needed for the config-table JSON storage pattern — `ClassificationEvent` is stored as a JSON blob in the config table (not as indexed records), so existing entries simply have `modelSuggestion: undefined`. No migration script needed.

### Anti-Patterns to Avoid

- **Validating with Python `onnxruntime` only:** WASM and Python CPU backends compute MatMul differently for INT8/float32 mixed graphs. Always validate with `onnxruntime-web` WASM.
- **Using `zipmap: True` (default) in skl2onnx:** Produces a ZipMap output that `onnxruntime-web` cannot process cleanly as a float array. Always set `options={'zipmap': False}`.
- **Training on synthetic examples only and testing on synthetic examples:** The test set must include hand-written real-style fragments (not LLM-generated) to catch distribution shift.
- **Generating all 1500+ examples in a single prompt:** LLM examples cluster on the same phrasings when generated in bulk. Use varied style prompts (see diversity requirements below).
- **Committing the `embeddings_cache.npy` file:** These are large binary files (1500 × 384 × 4 bytes = ~2.3MB); gitignore them and re-generate from the committed JSONL.
- **Using sentence-transformers without `normalize_embeddings=True`:** The browser worker uses `{ normalize: true }` — unnormalized Python embeddings produce a different vector space.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON parsing errors in LLM output | Retry loop + manual JSON validation | Anthropic `output_config.format` with `json_schema` | Schema-guaranteed output; no retries; 100ms grammar compile overhead, cached 24h |
| Confidence calibration | Custom sigmoid post-processing | `sklearn.calibration.CalibratedClassifierCV(method='sigmoid')` | One-liner; exports correctly via skl2onnx as part of the pipeline graph; produces valid `predict_proba()` |
| ONNX export of sklearn models | PyTorch re-implementation | `skl2onnx.convert_sklearn()` with `FloatTensorType` | Official sklearn→ONNX bridge; MLPClassifier verified supported; `target_opset=17` for WASM compat |
| Text embeddings in Python | Custom tokenizer + pooling | `SentenceTransformer.encode(normalize_embeddings=True)` | Handles tokenization, mean pooling, normalization identically to the Xenova model |
| Browser-WASM validation in CI | Puppeteer browser launch | `onnxruntime-web/node` ESM import in Node.js | WASM backend available in Node.js without a browser; same numerical path |

**Key insight:** The entire Python ML stack has first-class ONNX export support. No custom conversion code needed — sklearn → skl2onnx → ONNX is a 5-line export. The only custom code is the data generation loop and the class-label mapping JSON.

---

## Common Pitfalls

### Pitfall 1: Embedding Distribution Shift (Silent Accuracy Loss)

**What goes wrong:** Python training uses `sentence-transformers/all-MiniLM-L6-v2` but with `normalize_embeddings=False`, or uses a different pooling strategy than the browser. The classifier trains on one vector distribution but browsers send vectors from a different distribution. Accuracy drops by 10–30% silently — no error, just bad predictions.

**Why it happens:** The browser worker calls `pipe(texts, { pooling: 'mean', normalize: true })` explicitly. If the Python script calls `model.encode(texts)` without `normalize_embeddings=True`, the embedding space differs.

**How to avoid:** Always call `model.encode(texts, normalize_embeddings=True)`. Include a parity spot-check in script 02: verify the output shape is `(N, 384)`, dtype `float32`, and each vector has L2 norm ≈ 1.0.

**Warning signs:** Unit norm check fails; training accuracy is high (>90%) but browser validation match rate is low (<80%).

### Pitfall 2: skl2onnx ZipMap Output Breaks onnxruntime-web

**What goes wrong:** Default skl2onnx MLPClassifier export wraps probability output in a `ZipMap` operator that creates a dictionary mapping class index → probability. `onnxruntime-web` cannot return this as a simple float32 array — it returns an opaque Map object that requires different access patterns. Code written expecting a Float32Array breaks silently.

**Why it happens:** `skl2onnx` defaults to `options={'zipmap': True}` for classifiers. This is useful for Python but breaks browser-side array indexing.

**How to avoid:** Always pass `options={'zipmap': False}` to `convert_sklearn()`. Verify: inspect `session.outputNames` in the validation script — expect `['output_label', 'output_probability']`. Confirm `output_probability` tensor has shape `[1, 5]` (5 classes) and dtype `float32`.

**Warning signs:** `results['output_probability'].data` is not a Float32Array; output shape is unexpected; `argmax` over output fails.

### Pitfall 3: Decision/Insight Boundary Collapses Under Synthetic Data

**What goes wrong:** The classifier achieves 85%+ accuracy overall but has <60% recall on `decision` and `insight` classes. These two categories are genuinely ambiguous — "Decided to use Tailwind" is both a decision and a fact. LLM-generated examples for these classes are too crisp and the model learns a too-sharp boundary that breaks on real input.

**Why it happens:** Synthetic data forces single-label annotation. The LLM generates unambiguous `decision` examples ("Made the call to...") that don't capture the ambiguity of real user input.

**How to avoid:** Generate explicit cross-category examples in script 01. Prompt variants like: "Generate a borderline GTD item that could be labeled either 'decision' OR 'insight'" with the forced label being one of them. Apply `CalibratedClassifierCV` — Platt scaling reduces overconfidence on these boundaries. If per-class recall for `decision` or `insight` is below 65% on the real-style test set, flag in the validation output and escalate to the Tier 3 path for those classes.

**Warning signs:** Confusion matrix shows `decision` rows mostly predicted as `insight` or vice versa; F1 for decision/insight below 0.65; calibrated confidence on these classes clusters near 0.5.

### Pitfall 4: ONNX opset Incompatibility with onnxruntime-web WASM

**What goes wrong:** Exporting with `target_opset=21` or `target_opset=22` (skl2onnx maximum) produces a graph that uses operators not supported by the `onnxruntime-web` WASM backend. Script 04 validation passes (Python `onnxruntime` supports all ops) but the Phase 10 browser integration crashes.

**Why it happens:** `onnxruntime-web` WASM supports all ONNX operators per official docs, but some higher-opset operators have known issues in the 1.24.x WASM implementation. Opset 17 is the safe, proven-compatible version for WASM deployments per the PITFALLS.md research.

**How to avoid:** Always export with `target_opset=17`. Validate with `onnxruntime-web` in Node.js (WASM backend) in script 04, not just Python `onnxruntime`.

**Warning signs:** Script 04 passes with `onnxruntime` Python but `onnxruntime-web` Node.js throws `Error: Internal: opset 21 not supported in WASM backend`.

### Pitfall 5: Synthetic Data Homogeneity (All Examples Too Clean)

**What goes wrong:** All 1500 generated examples are fluent, well-formed sentences. The classifier achieves >92% on synthetic test set but drops to <70% on real user input (fragments, typos, short items).

**Why it happens:** Claude generates polished examples by default: "Schedule a comprehensive dental checkup appointment for next Tuesday afternoon." Real users write: "dentist tue?". The model has never seen fragmentary input.

**How to avoid:** Vary the style prompt in script 01 explicitly. Use a rotation of styles per label:
- Short fragment (1-4 words)
- Telegram style ("buy milk, pay rent, dentist")
- Typo-ridden ("scehdul meetin with boss")
- Mixed case ("CALL DENTIST before tuesday")
- Genuine ambiguity ("noted: use tailwind" — is this fact or decision?)
Target at least 20% of examples per class being short/fragmentary forms.

**Warning signs:** Mean character length of generated examples is >60 chars; no examples shorter than 10 chars; all examples start with a capital letter.

---

## Code Examples

Verified patterns from official sources:

### Complete JSONL generation loop (script 01)
```python
# scripts/train/01_generate_data.py
# Source: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
import anthropic, json, time
from pathlib import Path

client = anthropic.Anthropic()  # ANTHROPIC_API_KEY from env

LABELS = ['task', 'fact', 'event', 'decision', 'insight']
TARGET_PER_LABEL = 400  # 400 × 5 = 2000 total; filter to 300-500 per label after review

STYLE_VARIANTS = [
    "a short fragment (1-5 words, no punctuation, the way someone types quickly)",
    "a complete sentence a professional might write",
    "abbreviated like a text message or telegram",
    "with a typo or informal capitalization",
    "genuinely ambiguous (could fit multiple GTD types)",
]

SCHEMA = {
    "type": "object",
    "properties": {
        "text": {"type": "string"},
        "label": {"type": "string", "enum": LABELS},
    },
    "required": ["text", "label"],
    "additionalProperties": False
}

output_path = Path("scripts/training-data/type-classification.jsonl")
output_path.parent.mkdir(exist_ok=True)

with open(output_path, 'a', encoding='utf-8') as out:
    for label in LABELS:
        count = 0
        for style in STYLE_VARIANTS * (TARGET_PER_LABEL // len(STYLE_VARIANTS) + 1):
            if count >= TARGET_PER_LABEL:
                break
            try:
                response = client.messages.create(
                    model="claude-haiku-4-5",
                    max_tokens=128,
                    messages=[{
                        "role": "user",
                        "content": f"Generate one GTD inbox item that is clearly a '{label}'. "
                                   f"Style: {style}. "
                                   f"GTD types: task=has action+completion state, "
                                   f"fact=reference info no action, event=time-anchored, "
                                   f"decision=choice already made, insight=generalizable principle."
                    }],
                    output_config={"format": {"type": "json_schema", "schema": SCHEMA}}
                )
                example = json.loads(response.content[0].text)
                if example['label'] == label:  # Only keep correctly-labeled examples
                    out.write(json.dumps(example) + '\n')
                    count += 1
                time.sleep(0.05)  # Avoid rate limits (20 RPM on Haiku for free tier)
            except Exception as e:
                print(f"Error generating {label}/{style}: {e}")

print(f"Generated training data → {output_path}")
```

### Python-side onnxruntime validation (part of script 04)
```python
# scripts/train/04_validate_model.py (Python portion)
# Source: https://onnxruntime.ai/docs/api/python/
import onnxruntime as rt
import numpy as np, json

sess = rt.InferenceSession('public/models/classifiers/triage-type.onnx')
input_name = sess.get_inputs()[0].name
output_names = [o.name for o in sess.get_outputs()]
print("Input:", input_name, sess.get_inputs()[0].shape)
print("Outputs:", output_names)

# Run on test set
test_embeddings = np.load('scripts/train/test_embeddings.npy').astype(np.float32)
predictions = []
for emb in test_embeddings:
    result = sess.run(output_names, {input_name: emb.reshape(1, 384)})
    # output_probability is index 1 (after output_label)
    probs = result[1][0]  # shape (5,)
    predictions.append(int(np.argmax(probs)))

with open('scripts/train/python_predictions.json', 'w') as f:
    json.dump(predictions, f)
print(f"Python predictions saved for {len(predictions)} test inputs")
```

### CalibratedClassifierCV calibration check
```python
# Verify calibration: at threshold 0.78, what fraction of predictions are correct?
# Source: https://scikit-learn.org/stable/modules/calibration.html
from sklearn.calibration import calibration_curve
probs_test = calibrated_clf.predict_proba(X_test)
top_probs = probs_test.max(axis=1)
top_preds = probs_test.argmax(axis=1)
correct = top_preds == y_test

# Check calibration at 0.78 threshold
mask_above_threshold = top_probs >= 0.78
pct_above = mask_above_threshold.mean()
acc_above = correct[mask_above_threshold].mean() if mask_above_threshold.any() else 0
print(f"At confidence ≥0.78: {pct_above:.1%} of predictions, accuracy={acc_above:.1%}")
# Target: acc_above >= 0.85 at threshold 0.78 (from STATE.md: start threshold at 0.78)
# If acc_above < 0.85, raise threshold or retrain with more data
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual JSON parsing with retry loops | Anthropic `output_config.format` with JSON schema | Nov 2025 (GA) | No retries; zero parsing errors; 100ms first-request overhead |
| `sentence-transformers` 3.x | `sentence-transformers` 5.2.3 | Jan–Feb 2026 (v4, v5 releases) | `encode()` migration guide exists; normalize flag behavior unchanged |
| `optimum[onnx]` ORTModelForSequenceClassification | `skl2onnx` for sklearn classifiers | Always | For a classification HEAD (not full transformer), skl2onnx is simpler and produces cleaner ONNX graphs |

**Deprecated/outdated:**
- `optimum-cli export onnx` — correct for full transformer export (DistilBERT, MiniLM full model) but overkill for a lightweight classifier head trained on pre-computed embeddings. Use `skl2onnx` instead.
- `output_format` Anthropic beta parameter — replaced by `output_config.format`; old parameter still works but not recommended.
- `sentence-transformers` 3.x / 4.x — now at 5.2.3; `encode()` migration guide from v4→v5 exists per sbert.net docs. The `normalize_embeddings` parameter is unchanged.

---

## Open Questions

1. **sentence-transformers 5.x encode() API migration**
   - What we know: v5.x has a migration guide from v4.x; `normalize_embeddings=True` flag appears unchanged per HuggingFace docs
   - What's unclear: Whether there are any breaking changes in the `encode()` output shape or dtype in v5
   - Recommendation: Read the migration guide at sbert.net before writing script 02. If v5 is problematic, pin to `sentence-transformers==3.4.1` (last 3.x) and note this in requirements.txt with a comment.

2. **onnxruntime-web version in node_modules vs validation need**
   - What we know: `@huggingface/transformers` 3.8.1 pulls in `onnxruntime-web` as a transitive dep; the exact version in `node_modules` needs to be confirmed
   - What's unclear: Whether the transitive `onnxruntime-web` version is new enough to support the `wasm` execution provider in Node.js without additional setup
   - Recommendation: In script 04, use `require('onnxruntime-web/node')` from the repo's existing `node_modules`. If the import fails, install `onnxruntime-web@1.24.x` explicitly as a devDependency.

3. **ONNX output tensor name from skl2onnx CalibratedClassifierCV**
   - What we know: Standard skl2onnx outputs are `output_label` and `output_probability`; with `zipmap=False`, `output_probability` is a float32 array
   - What's unclear: Whether wrapping in `CalibratedClassifierCV` changes the output tensor names
   - Recommendation: Inspect `session.outputNames` in script 04 immediately after loading and print them. Update the browser-side integration in Phase 10 with the confirmed names.

4. **`modelSuggestion` field Dexie migration approach**
   - What we know: `ClassificationEvent` is stored as JSON in the config table (not a Dexie schema with indices), so no Dexie version bump is needed
   - What's unclear: Whether pre-v3.0 entries (without the field) cause any runtime issues if they're ever iterated
   - Recommendation: Add `modelSuggestion?: AtomType` as optional. No migration needed. Retraining pipeline filters to entries where the field exists (`event.modelSuggestion !== undefined`).

---

## Validation Architecture

> `workflow.nyquist_validation` is not set in `.planning/config.json` (no nyquist_validation key). Skipping validation section.

---

## Diversity Requirements for Training Data (Script 01)

These are acceptance criteria for the generated JSONL — the planner should include a data quality check task:

| Requirement | Target | Why |
|-------------|--------|-----|
| Examples per label | 300–500 per label (TRAIN-01) | Enough for train/test split with stratification |
| Short fragments (<10 chars) | ≥15% of examples per label | Real user input is fragmentary |
| Sentence length < 20 chars | ≥30% of examples per label | Prevents over-clean distribution |
| Cross-boundary ambiguous examples | ≥10 per label | Teaches the model to be uncertain on genuinely ambiguous input |
| Non-English items | Optional (≥5 per label if aiming for global use) | Real inboxes mix languages |
| Typo/informal examples | ≥10% of examples per label | Robustness to real input |

---

## Gitignore Changes Required

The existing `.gitignore` rule `public/models/` excludes the entire `public/models/` directory. The trained classifier files in `public/models/classifiers/` should be committed (they are small, ~200–400KB each, and are the reproducible output of the training pipeline).

Required change to `.gitignore`:
```
# Local ONNX model files (binary, downloaded by pnpm postinstall:models)
# These are large binary files (~22MB) — download via: node scripts/download-model.cjs
public/models/
!public/models/classifiers/    # Trained classifier heads — committed (small files)
```

Also gitignore the Python intermediate artifacts:
```
# Python training intermediates (re-generated from committed JSONL)
scripts/train/__pycache__/
scripts/train/*.npy
scripts/train/*.pyc
```

---

## Sources

### Primary (HIGH confidence)
- [Anthropic Structured Outputs official docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) — `output_config.format`, `json_schema` API, GA since Nov 2025 for Claude Haiku 4.5+
- [sklearn-onnx 1.20.0 documentation](https://onnx.ai/sklearn-onnx/) — `convert_sklearn()` API, MLPClassifier support confirmed (`OnnxSklearnMLPClassifier`), `FloatTensorType`, `zipmap` option
- [scikit-learn calibration documentation](https://scikit-learn.org/stable/modules/calibration.html) — `CalibratedClassifierCV(method='sigmoid')` for multiclass Platt scaling
- [sentence-transformers documentation](https://sbert.net/docs/quickstart.html) — `SentenceTransformer.encode(normalize_embeddings=True)` API; v5.2.3 confirmed current
- [ONNX Runtime Web docs](https://onnxruntime.ai/docs/tutorials/web/) — `InferenceSession.create()`, WASM execution provider, `Tensor` API
- Existing BinderOS codebase — `embedding-worker.ts` (confirmed pooling/normalize settings); `classification-log.ts` (confirmed storage pattern, no Dexie migration needed); `tier2-handler.ts` (confirmed ONNX is consumed via postMessage, not direct import)

### Secondary (MEDIUM confidence)
- [sentence-transformers PyPI](https://pypi.org/project/sentence-transformers/) — confirmed v5.2.3 as latest; v4→v5 migration guide referenced
- [skl2onnx ONNX MLP export example](https://infosys.beckhoff.com/content/1033/tf38x0_tc3_ml_nn_inference_engine/11294065419.html) — MLPClassifier conversion pattern + `predict_proba` output notes
- [onnxruntime-web 1.24.2 npm](https://www.npmjs.com/package/onnxruntime-web) — confirmed latest version; WASM supports all operators per official docs
- Project research files (SUMMARY.md, ARCHITECTURE.md, PITFALLS.md, FEATURES.md) — architecture decisions, confidence threshold strategy, distribution shift pitfall patterns

### Tertiary (LOW confidence, noted)
- [Anthropic Message Batches API](https://github.com/anthropics/anthropic-sdk-python/blob/main/src/anthropic/resources/beta/messages/batches.py) — available for 50% cost reduction if generation is done in large batches (async, 24h processing window); LOW confidence on whether it's compatible with `output_config.format` structured outputs
- sentence-transformers v5 migration guide — existence confirmed but content not inspected; encode() changes noted as "breaking" between v4→v5

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Anthropic API verified against official docs; skl2onnx MLPClassifier confirmed; sentence-transformers encode API confirmed; onnxruntime-web version confirmed
- Architecture: HIGH — 4-script structure derived from project ARCHITECTURE.md; Dexie migration approach confirmed from reading classification-log.ts
- Pitfalls: HIGH — ZipMap pitfall verified from skl2onnx docs; opset 17 recommendation from PITFALLS.md (previously verified); distribution shift from SUMMARY.md research

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (30 days — Python ML stack is stable; Anthropic API may update)
