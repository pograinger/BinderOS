# Phase 33: Sequence Context ONNX Model - Research

**Researched:** 2026-03-13
**Domain:** LSTM sequence modeling, ONNX export, ring buffer management, T2 classifier retraining
**Confidence:** HIGH (core stack well-understood; LSTM ONNX export path has a documented caveat, addressed below)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Ring buffer storage**: Dexie `sequenceContext` table only. Embedding worker reads on demand. Survives page refresh. Consistent with sidecar pattern.
- **Update triggers**: Atom save AND triage completion — both produce embeddings and both represent meaningful content changes.
- **Training corpus**: Harness persona atom histories from `scripts/harness/personas/` — synthetic but realistic GTD sequences with ground truth.
- **Export path**: `dynamo=True` with opset 18 — already decided in STATE.md as the only stable PyTorch ONNX export path for LSTM with dynamic sequence length.
- **Classifier retraining scope**: All at once — single training run produces all 512-dim (384 MiniLM + 128 sequence context) T2 classifiers.
- **Production replacement gated on ablation**: Existing 384-dim classifiers only replaced if ablation confirms F1 improvement (SEQ-04). No speculative deployment.
- **Training pipeline location**: New scripts under `scripts/train/sequence/` following existing numbered convention.
- **Cold-start fallback**: Zero-pad 128-dim context when fewer than N atoms have embeddings. Single set of 512-dim classifiers. No dual model maintenance.
- **Model runs in existing embedding worker**: NOT a new worker — avoids 4th concurrent ORT instance OOM on mobile.

### Claude's Discretion

- Window size default (5 vs 7) — ablation decides
- Training objective (end-to-end context vs self-supervised next-embedding prediction)
- LSTM hidden size and layer count (must stay under 500KB ONNX)
- Training data augmentation strategy for zero-context robustness
- Script numbering within `scripts/train/sequence/`

### Deferred Ideas (OUT OF SCOPE)

- Multi-binder sequence awareness (cross-binder sequence patterns)
- Attention head alternative — LSTM first, attention head deferred to Phase 33.1 if needed
- Online learning / fine-tuning — ONNX Runtime Web is inference-only
- Sequence-aware enrichment — feeding sequence context into predictive enrichment scorer (Phase 32)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SEQ-01 | Embedding ring buffer maintains last N (default 5, tunable) MiniLM embeddings per binder in the embedding worker — capped memory, updated on atom save/triage completion only | Ring buffer design pattern, Dexie persistence strategy, worker message protocol extension |
| SEQ-02 | Lightweight ONNX sequence model (single-layer LSTM, <500KB) trained offline via Python pipeline on harness persona corpus, exported via PyTorch `dynamo=True` opset 18 | LSTM architecture sizing, ONNX export path (with fallback caveat), training data shape from corpus |
| SEQ-03 | Sequence context embedding (128-dim) concatenated with MiniLM embedding (384-dim) before T2 classifier inference via new `sequenceContext` field on `TieredFeatures` — existing classifiers retrained with 512-dim input | Concatenation point in pipeline, `TieredFeatures` extension, `runClassifierOnEmbedding` signature change, skl2onnx 512-dim export |
| SEQ-04 | Harness ablation compares T2 classifier F1 with and without sequence context across N=3, N=5, N=7 window sizes — production classifiers only replaced after ablation confirms improvement | Ablation framework patterns from existing ablation-engine.ts, F1 measurement approach, per-classifier comparison strategy |
</phase_requirements>

---

## Summary

Phase 33 adds sequence context to T2 classifier inference by maintaining a per-binder ring buffer of recent MiniLM embeddings and running them through a lightweight LSTM to produce a 128-dim context signal. That signal is concatenated with the standard 384-dim MiniLM output to produce a 512-dim input that all T2 MLP classifiers are retrained to consume. The embedding worker is extended (not duplicated) to host the LSTM inference session alongside existing ONNX sessions.

The core architecture is well-suited to the project's existing patterns: the training pipeline follows the established numbered-script convention (`scripts/train/`), the ONNX export follows skl2onnx for classifiers and PyTorch for the LSTM, and the Dexie `sequenceContext` table is already registered in the v10 migration. The main technical risk is the LSTM ONNX export path. The STATE.md decision states `dynamo=True opset 18` as the chosen path, but this combination has a documented limitation: TorchDynamo intentionally graph-breaks on LSTM layers. The safe resolution is to use `dynamo=True, fallback=True` — which the PyTorch docs confirm as the standard recovery path, and this still produces an opset 18 model via the TorchScript-backed exporter path.

**Primary recommendation:** Use a single-layer LSTM with hidden_size=128, sequence_length=N (variable), input_size=384, producing a 128-dim context vector via the final hidden state. Export with `torch.onnx.export(model, dummy_input, dynamo=True, fallback=True, opset_version=18, dynamic_axes={"input": {0: "seq_len"}})`. All T2 classifiers are retrained with 512-dim input using skl2onnx as before (opset 17, `zipmap=False`). Ablation determines whether the improvement justifies swapping production classifiers.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| PyTorch | project .venv (needs install) | LSTM definition + ONNX export | Only credible path for dynamic-length LSTM to ONNX; numpy-backed alternatives don't handle variable seq_len cleanly |
| onnxruntime (Python) | needs install | Python-side validation of sequence-context.onnx | Matches existing pattern in all other training scripts |
| sentence-transformers | needs install | MiniLM embeddings during training data generation | Already used in every training script in scripts/train/ |
| sklearn / skl2onnx | 1.8.0 / 1.20.0 (installed) | MLP training + ONNX export for 512-dim classifiers | Existing stack; skl2onnx 1.20 confirmed installed |
| numpy | 2.4.0 (installed) | Array ops throughout | Already installed |
| onnxruntime-node | ^1.24.3 (devDependency, installed) | Node.js validation script for sequence-context.onnx | Existing validation pattern — all other models use this |

### Missing (Wave 0 install required)
| Library | Install Command | Why Needed |
|---------|----------------|-----------|
| torch | `pip install torch --index-url https://download.pytorch.org/whl/cpu` (CPU-only suffices for a <500KB model) | LSTM definition + export |
| onnxruntime | `pip install onnxruntime` | Python-side ONNX validation |
| sentence-transformers | `pip install sentence-transformers` | MiniLM embedding during training |

**Confirmed installed:** numpy 2.4.0, sklearn 1.8.0, onnx 1.20.1, skl2onnx 1.20.0, faker (for data generation)

**Installation:**
```bash
pip install torch --index-url https://download.pytorch.org/whl/cpu onnxruntime sentence-transformers
```

---

## Architecture Patterns

### Recommended Project Structure
```
scripts/train/sequence/
├── 60_generate_sequence_data.py      # Build sequence training data from harness persona corpus
├── 61_train_sequence_model.py        # Train LSTM + export sequence-context.onnx
├── 62_validate_sequence_model.mjs    # Node.js validation (onnxruntime-node)
├── 63_retrain_classifiers_512.py     # Retrain all T2 classifiers with 512-dim input
├── 64_validate_classifiers_512.mjs   # Node.js validation for 512-dim classifiers
└── 65_ablation_sequence.py           # F1 ablation across N=3,5,7 window sizes

public/models/
└── sequence-context.onnx             # <500KB LSTM model

src/search/
└── embedding-worker.ts               # Extended with ring buffer + SEQUENCE_CONTEXT message

src/ai/tier2/
└── types.ts                          # TieredFeatures.sequenceContext: Float32Array (optional)
```

### Pattern 1: Ring Buffer Management in Worker
**What:** Worker maintains an in-memory ring buffer per binder, flushed to Dexie on update. On startup (or cold hit), reads from Dexie `sequenceContext` table.
**When to use:** On every EMBED result where the caller passes `binderId` + `updateRingBuffer: true`

```typescript
// Conceptual extension to WorkerIncoming in embedding-worker.ts

// New message type (ring buffer update):
// { type: 'UPDATE_RING_BUFFER'; binderId: string; embedding: number[] }
// { type: 'GET_SEQUENCE_CONTEXT'; id: string; binderId: string; windowSize: number }

// New response types:
// { type: 'SEQUENCE_CONTEXT_RESULT'; id: string; context: number[] | null }
// { type: 'SEQUENCE_CONTEXT_ERROR'; id: string; error: string }

// Worker-local ring buffer (not Dexie-direct — Dexie not importable in worker)
const ringBuffers = new Map<string, number[][]>();  // binderId -> last N embeddings

function updateRingBuffer(binderId: string, embedding: number[], windowSize: number): void {
  const buf = ringBuffers.get(binderId) ?? [];
  buf.push(embedding);
  if (buf.length > windowSize) buf.shift();
  ringBuffers.set(binderId, buf);
}
```

**Critical note:** The embedding worker runs in a Web Worker context — it cannot directly import Dexie. Ring buffer persistence to `sequenceContext` table must be handled by the main thread via a postMessage round-trip, or the worker must use IndexedDB APIs directly. The established pattern in this project is that workers communicate with the main thread for storage. The main thread listens for an `UPDATE_RING_BUFFER_RESULT` and writes to Dexie.

Alternative (simpler): the ring buffer is maintained entirely in-memory in the worker. On SEQUENCE_CONTEXT message, worker reads its in-memory buffer and runs LSTM inference. On worker restart, buffer is empty (cold-start path). The `sequenceContext` Dexie table is populated by the main thread from EMBED_RESULT side-effects. The worker is loaded with the buffer on first SEQUENCE_CONTEXT request by the main thread sending the historical embeddings from Dexie.

**Recommended implementation:** Worker holds in-memory buffer, receives `LOAD_RING_BUFFER` message at startup (main thread reads Dexie and hydrates the worker), and sends `RING_BUFFER_UPDATED` back (main thread persists). Cleaner separation of concerns.

### Pattern 2: LSTM Architecture for <500KB
**What:** Single-layer LSTM, input 384-dim (one embedding per time step), hidden 128-dim. Output: final hidden state = 128-dim context vector.
**When to use:** The forward pass takes a sequence of shape `(seq_len, 1, 384)` and returns hidden state `(1, 1, 128)` squeezed to `(128,)`.

```python
# Source: PyTorch LSTM docs + size analysis
import torch
import torch.nn as nn

class SequenceContextModel(nn.Module):
    def __init__(self, input_size=384, hidden_size=128, num_layers=1):
        super().__init__()
        self.lstm = nn.LSTM(
            input_size=input_size,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=False,   # shape: (seq_len, batch, input_size)
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x shape: (seq_len, 1, 384)
        _, (h_n, _) = self.lstm(x)
        # h_n shape: (1, 1, 128) → squeeze to (128,)
        return h_n.squeeze(0).squeeze(0)
```

**Size estimate:** Single-layer LSTM with hidden=128, input=384 has:
- Input-hidden weights: 4 * 128 * (384 + 128) = 262,144 floats = ~1MB at float32
- This exceeds 500KB. Recommended fix: use hidden_size=64 (produces 128-dim via linear projection) or reduce input via linear reduction first.

**Revised architecture for <500KB:**
```python
class SequenceContextModel(nn.Module):
    def __init__(self, input_size=384, hidden_size=64, output_size=128):
        super().__init__()
        self.lstm = nn.LSTM(input_size=input_size, hidden_size=hidden_size, batch_first=False)
        self.proj = nn.Linear(hidden_size, output_size)

    def forward(self, x):
        _, (h_n, _) = self.lstm(x)
        return self.proj(h_n.squeeze(0).squeeze(0))
```
- LSTM weights: 4 * 64 * (384 + 64) = 114,688 floats = ~450KB at float32
- Linear layer: 64 * 128 = 8,192 floats = ~32KB
- Total: ~482KB — fits under 500KB budget

### Pattern 3: ONNX Export with Fallback
**What:** The STATE.md decision is `dynamo=True opset 18`. PyTorch's dynamo exporter graph-breaks on LSTM. Use `fallback=True` to recover.
**When to use:** Training script 61_train_sequence_model.py export step.

```python
# Source: PyTorch torch.onnx.export docs + GitHub issue #118740 resolution
import torch

model = SequenceContextModel()
model.eval()

# Dummy input: seq_len=5, batch=1, input_size=384
dummy = torch.randn(5, 1, 384)

torch.onnx.export(
    model,
    dummy,
    "public/models/sequence-context.onnx",
    dynamo=True,
    fallback=True,          # recover from LSTM graph break
    opset_version=18,
    input_names=["embeddings"],
    output_names=["context"],
    dynamic_axes={"embeddings": {0: "seq_len"}},  # variable-length sequences
)
```

**Important:** When `dynamo=True, fallback=True`, PyTorch falls back to the TorchScript-based exporter but still honors `opset_version=18`. This satisfies the STATE.md decision because the output model uses opset 18; only the export mechanism falls back.

**Validation:** After export, validate immediately with Python `onnxruntime` and `onnx.checker.check_model()` to confirm the fallback path produced a valid model.

### Pattern 4: 512-dim Classifier Retraining with skl2onnx
**What:** All T2 MLP classifiers are retrained with 512-dim input by concatenating sequence context to existing training embeddings.
**When to use:** Script 63_retrain_classifiers_512.py

```python
# Source: skl2onnx 1.20.0 docs — existing pattern in 61_train_cognitive_models.py
from skl2onnx.common.data_types import FloatTensorType

# Change from 384 to 512 for all classifiers
initial_types = [("float_input", FloatTensorType([None, 512]))]

onnx_model = convert_sklearn(
    calibrated_clf,
    initial_types=initial_types,
    target_opset=17,          # classifiers stay at opset 17 (existing convention)
    options={"zipmap": False},
)
```

**Training data for classifiers:** Generate 512-dim training embeddings by:
1. Loading existing training text data (already in `scripts/training-data/*.jsonl`)
2. Embedding with sentence-transformers (384-dim) — same as before
3. Running each training example through the sequence model (appending zero context, simulating cold-start) — OR using pre-generated sequence contexts from harness data
4. Concatenating [384-dim MiniLM, 128-dim sequence context] → 512-dim input

**Cold-start augmentation:** 40-50% of training samples should have zero-padded 128-dim context to train the classifier to handle cold-start gracefully. This is the training-time augmentation for zero-context robustness.

### Pattern 5: Concatenation Point in dispatchTiered
**What:** Sequence context is fetched from the worker and concatenated before calling `runClassifierOnEmbedding`. The call site is in the T2 handlers.
**When to use:** Any handler that calls `runClassifierOnEmbedding`.

```typescript
// In src/ai/tier2/tier2-handler.ts (conceptual)
// After embedding, before classifier inference:
const seqContext = features.sequenceContext ?? new Float32Array(128); // zero-pad fallback
const combined = new Float32Array(384 + 128);
combined.set(vector);
combined.set(seqContext, 384);

// Pass combined to classifier instead of bare vector
const scores = await runClassifierOnEmbedding(config, Array.from(combined));
```

**Type change required:** `runClassifierOnEmbedding` currently hardcodes `[1, 384]` as the tensor shape. Change to accept dimension as parameter: `(config, embedding, dim = 384)`.

```typescript
// Changed signature:
const inputTensor = new ort.Tensor('float32', Float32Array.from(embedding), [1, embedding.length]);
```

### Anti-Patterns to Avoid
- **Creating a new ONNX worker:** The project decision is explicit — sequence model runs in the existing embedding worker. A 4th concurrent ORT instance OOMs on mobile.
- **Storing ring buffer only in Dexie (no in-memory):** Every inference call would need an async Dexie read before LSTM inference. Use in-memory buffer in the worker, persisted to Dexie by the main thread.
- **Dynamic import of Dexie in worker:** Workers in this project don't import from the storage layer. Maintain the separation boundary.
- **Using `dynamo=True` without `fallback=True` for LSTM:** Will fail with `TorchDynamo purposely graph breaks on RNN, GRU, LSTMs`. Always include `fallback=True`.
- **Deploying 512-dim classifiers without ablation gate:** STATE.md decision is explicit — ablation must confirm F1 improvement first.
- **Mixing opset versions:** Classifiers use opset 17 (skl2onnx convention). Sequence model uses opset 18 (PyTorch convention). Both are valid; don't upgrade classifiers to opset 18 unnecessarily.
- **Float64 in training data:** All embeddings must be float32. `model.encode(...).astype(np.float32)` is required — existing scripts already do this.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LSTM training | Custom gradient descent | `torch.nn.LSTM` | Gradient clipping, weight initialization, BPTT — all handled |
| ONNX export | Manual protobuf construction | `torch.onnx.export` | Operator mapping, type inference, opset compatibility |
| MLP training | Custom backprop | `sklearn.MLPClassifier` + `CalibratedClassifierCV` | Existing pattern, Platt calibration already in all other classifiers |
| Probability calibration | Manual sigmoid fit | `CalibratedClassifierCV(method='sigmoid')` | Already in every classifier in this codebase |
| Node.js ONNX validation | Custom inference loop | `onnxruntime-node` | Already a devDependency; all other models validated this way |
| Embedding normalization | Custom L2 normalize | `model.encode(normalize_embeddings=True)` | Exact parity with browser Xenova model already proven across all training scripts |

---

## Common Pitfalls

### Pitfall 1: LSTM ONNX Export Fails with Dynamo
**What goes wrong:** `torch.onnx.dynamo_export` raises `TorchDynamo purposely graph breaks on RNN, GRU, LSTMs`.
**Why it happens:** TorchDynamo intentionally avoids capturing LSTM control flow for graph compilation.
**How to avoid:** Always set `fallback=True` alongside `dynamo=True`. The fallback uses the TorchScript exporter path while still outputting opset 18.
**Warning signs:** The error message is explicit — `torch._dynamo.exc.Unsupported: TorchDynamo purposely graph breaks on RNN, GRU, LSTMs`

### Pitfall 2: LSTM Hidden Size Exceeds 500KB Budget
**What goes wrong:** hidden_size=128 with input_size=384 produces ~1MB model (4 gates × 128 × (384+128) × 4 bytes).
**Why it happens:** LSTM parameter count is 4 × hidden × (input + hidden).
**How to avoid:** Use hidden_size=64 + Linear projection to 128-dim output. Total: ~482KB under budget.
**Warning signs:** Check `onnx_path.stat().st_size / 1024` immediately after export.

### Pitfall 3: Dexie Not Available in Web Worker
**What goes wrong:** Importing `db` from `src/storage/db.ts` inside the embedding worker causes a runtime error.
**Why it happens:** Dexie uses IndexedDB; while IndexedDB is available in workers, the Dexie singleton in `db.ts` may have state initialized on the main thread only.
**How to avoid:** Ring buffer persistence flows through the main thread message bridge. Worker sends `RING_BUFFER_UPDATED` with the full buffer state; main thread writes to Dexie. Worker receives `LOAD_RING_BUFFER` at hydration time.

### Pitfall 4: Float32Array Serialization in Dexie
**What goes wrong:** `Float32Array` stored in Dexie may be deserialized as a plain `Array` or `Uint8Array` depending on the IndexedDB implementation.
**Why it happens:** IndexedDB structured clone handles typed arrays, but retrieval type depends on browser engine.
**How to avoid:** Always cast: `new Float32Array(entry.embeddings)` after reading from Dexie. The `SequenceContextEntry.embeddings` field is typed as `Float32Array` but must be re-wrapped on read.

### Pitfall 5: Variable-Length LSTM Input in ONNX Runtime Web
**What goes wrong:** ORT Web requires explicit tensor shapes; passing variable seq_len without dynamic_axes causes shape mismatch errors.
**Why it happens:** ONNX models have statically-typed inputs unless dynamic axes are declared at export.
**How to avoid:** Export with `dynamic_axes={"embeddings": {0: "seq_len"}}`. The ORT Web tensor shape `[seq_len, 1, 384]` must be created dynamically at inference time.

### Pitfall 6: Cold-Start Missing in Classifier Training
**What goes wrong:** 512-dim classifiers trained only on full-context embeddings perform poorly when given zero-padded context (the cold-start path). F1 drops significantly for new users.
**Why it happens:** The classifier learns to use the context signal strongly; zeros are out-of-distribution.
**How to avoid:** Augment training data: 40-50% of samples use zero-padded 128-dim context concatenated with real 384-dim embeddings. This teaches the classifier to rely on the MiniLM embedding when context is absent.

### Pitfall 7: Ablation Comparison Validity
**What goes wrong:** Ablation F1 comparison is invalid because the 384-dim baseline classifiers were trained on different data than the 512-dim classifiers.
**Why it happens:** Different train/test splits produce incomparable F1 scores.
**How to avoid:** Use identical train/test splits (same seed, same data) for both baseline and 512-dim training runs. The ablation script must hold the test set constant while varying the input dimension.

### Pitfall 8: ORT Sequential Execution Required
**What goes wrong:** Running LSTM session concurrently with type-classifier session causes `Session already started` errors.
**Why it happens:** The embedding worker uses single-threaded WASM backend (`numThreads = 1`).
**How to avoid:** All ONNX inference in the worker is already sequential (established pattern). The LSTM session must be added to the same sequential execution queue — run LSTM inference first, then pass context to classifier inference.

---

## Code Examples

### Ring Buffer Update in Worker (New Message Type)
```typescript
// Addition to WorkerIncoming union in embedding-worker.ts
| { type: 'LOAD_RING_BUFFER'; binderId: string; embeddings: number[][] }
| { type: 'GET_SEQUENCE_CONTEXT'; id: string; binderId: string; windowSize: number }

// Response types:
// { type: 'SEQUENCE_CONTEXT_RESULT'; id: string; context: number[] }
// { type: 'RING_BUFFER_UPDATED'; binderId: string; embeddings: number[][] }
```

### LSTM Inference in Worker
```typescript
// LSTM model runs in the same ORT session pattern as existing classifiers
const SEQUENCE_MODEL: ClassifierConfig = {
  name: 'sequence-context',
  modelPath: 'models/sequence-context.onnx',
  classesPath: '',   // no class map needed — outputs raw 128-dim vector
  session: null, classMap: null, loading: false,
};

async function runSequenceInference(embeddings: number[][]): Promise<number[]> {
  if (!SEQUENCE_MODEL.session) return new Array(128).fill(0);
  // Shape: [seq_len, 1, 384]
  const seq_len = embeddings.length;
  const flat = new Float32Array(seq_len * 1 * 384);
  embeddings.forEach((emb, i) => flat.set(emb, i * 384));
  const inputTensor = new ort.Tensor('float32', flat, [seq_len, 1, 384]);
  const results = await SEQUENCE_MODEL.session.run({ embeddings: inputTensor });
  return Array.from(results['context']!.data as Float32Array);
}
```

### TieredFeatures Extension
```typescript
// In src/ai/tier2/types.ts — add optional field to TieredFeatures
export interface TieredFeatures {
  // ... existing fields ...
  /**
   * 128-dim sequence context embedding from the LSTM model.
   * Concatenated with MiniLM embedding (384-dim) before T2 classifier inference.
   * Absent or undefined → zero-padded 128-dim (cold-start path).
   */
  sequenceContext?: Float32Array;
}
```

### Ablation Script Structure (Python)
```python
# 65_ablation_sequence.py — F1 comparison across window sizes
# Follows existing ablation pattern: pre-generated corpora, no new API calls

WINDOW_SIZES = [3, 5, 7]
MODELS_TO_TEST = [
    "triage-type", "gtd-routing", "actionability",
    "project-detection", "context-tagging",
    # cognitive models...
]

for N in WINDOW_SIZES:
    for model_id in MODELS_TO_TEST:
        f1_with_seq = evaluate_512_model(model_id, N, use_sequence_context=True)
        f1_without_seq = evaluate_384_model(model_id)
        delta = f1_with_seq - f1_without_seq
        report.append({"model": model_id, "N": N, "f1_delta": delta})
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 384-dim MiniLM embedding only | 512-dim (MiniLM + LSTM context) | Phase 33 | Classifiers become sequence-aware; ordering of atoms carries signal |
| skl2onnx with FloatTensorType([None, 384]) | FloatTensorType([None, 512]) | Phase 33 | Simple dimension change — all other patterns unchanged |
| Static input to classifiers | Dynamic context-augmented input | Phase 33 | Requires cold-start augmentation in training data |

**Deprecated/outdated:**
- The existing `runClassifierOnEmbedding` hardcoded tensor shape `[1, 384]` becomes `[1, embedding.length]` — backward compatible since Float32Array.length conveys the right dim.
- Export note: `torch.onnx.dynamo_export()` (deprecated standalone function) is NOT the same as `torch.onnx.export(..., dynamo=True)`. Use the latter.

---

## Open Questions

1. **Training objective: end-to-end vs self-supervised**
   - What we know: Both approaches produce 128-dim context vectors. End-to-end trains LSTM jointly with classifier loss; self-supervised trains LSTM to predict next embedding then uses frozen LSTM as feature extractor.
   - What's unclear: With 12 harness personas × 60 atoms = 720 training sequences, the dataset is small. Self-supervised (next-embedding prediction) generates more training signal (each sequence of length N generates N-1 prediction targets vs 1 classifier label).
   - Recommendation: Use self-supervised next-embedding prediction for LSTM training. More training signal from limited data. Then use frozen LSTM features as input to 512-dim classifier retraining.

2. **Worker hydration on cold restart**
   - What we know: Web Workers don't persist state across restarts. The Dexie `sequenceContext` table holds the ring buffer.
   - What's unclear: The main thread must hydrate the worker's in-memory ring buffer on each worker startup. The current embedding worker has no initialization handshake for this.
   - Recommendation: Add `LOAD_RING_BUFFER` message type. The main thread sends it after MODEL_READY, reading from Dexie for each active binder. The worker populates its Map<binderId, number[][]> accordingly.

3. **Which T2 classifiers to include in ablation**
   - What we know: The existing ablation-engine.ts tests entity graph inference components. SEQ-04 requires T2 classifier F1 ablation — a different measurement domain.
   - What's unclear: Whether to extend the existing AblationSuiteResult type or create a standalone Python ablation script.
   - Recommendation: Create a standalone Python ablation script (65_ablation_sequence.py) in the training pipeline. It's simpler, doesn't require the TypeScript harness infrastructure, and can run as a pure offline comparison using pre-generated test embeddings.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.0.18 |
| Config file | vite.config.ts (no separate vitest.config.ts) |
| Quick run command | `pnpm test` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEQ-01 | Ring buffer updates on atom save/triage; capped at N; cold-start returns zeros | unit | `pnpm test` (ring-buffer.test.ts) | Wave 0 |
| SEQ-02 | LSTM ONNX export produces valid <500KB model, validates against onnxruntime-node | integration | `node scripts/train/sequence/62_validate_sequence_model.mjs` | Wave 0 |
| SEQ-03 | T2 classifiers accept 512-dim input; zero-pad path produces same type as full-context path | unit | `pnpm test` (tier2-512.test.ts) | Wave 0 |
| SEQ-04 | Ablation script runs and produces F1 delta report across N=3,5,7 | integration | `python -u scripts/train/sequence/65_ablation_sequence.py` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test`
- **Per wave merge:** `pnpm test` + `node scripts/train/sequence/62_validate_sequence_model.mjs` + `node scripts/train/sequence/64_validate_classifiers_512.mjs`
- **Phase gate:** All validation scripts green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/search/__tests__/ring-buffer.test.ts` — covers SEQ-01: ring buffer update, cap, cold-start, Dexie persistence via message bridge
- [ ] `src/ai/tier2/__tests__/sequence-concat.test.ts` — covers SEQ-03: 512-dim concatenation, zero-pad fallback, tensor shape check
- [ ] `scripts/train/sequence/` directory — all 6 Python/Node scripts (Wave 0 scaffold, filled in Wave 1+)
- [ ] Python env: `pip install torch onnxruntime sentence-transformers` — needed before any training script runs

---

## Sources

### Primary (HIGH confidence)
- `src/search/embedding-worker.ts` — existing worker message protocol, ORT session pattern, sequential execution constraint
- `src/ai/tier2/types.ts` — `TieredFeatures`, `TieredRequest`, `TieredResponse` interfaces
- `src/types/gate.ts` — `SequenceContextEntry` interface already defined
- `src/storage/db.ts` + `src/storage/migrations/v10.ts` — `sequenceContext` table registered, indexed on `&binderId, lastUpdated`
- `scripts/train/61_train_cognitive_models.py` — skl2onnx pattern, validation artifact generation, FloatTensorType usage
- `scripts/train/04_validate_model.mjs` — Node.js onnxruntime-node validation pattern

### Secondary (MEDIUM confidence)
- [PyTorch ONNX Export Docs](https://docs.pytorch.org/docs/stable/onnx_export.html) — dynamo=True with fallback parameter documented
- [GitHub Issue #118740](https://github.com/pytorch/pytorch/issues/118740) — LSTM dynamo graph break confirmed, closed June 2024 (resolution: fallback=True)
- [skl2onnx 1.20.0 Docs](https://onnx.ai/sklearn-onnx/) — FloatTensorType([None, 512]) confirmed supported for MLPClassifier

### Tertiary (LOW confidence)
- WebSearch findings on LSTM ONNX export with dynamic sequence length — cross-verified with official PyTorch docs and GitHub issue resolution

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — existing project has all patterns proven; only torch/onnxruntime/sentence-transformers need installation
- Architecture: HIGH — ring buffer, ONNX session pattern, skl2onnx export all directly mirror existing code
- LSTM ONNX export path: MEDIUM — `dynamo=True, fallback=True` is verified as the resolution but the issue was closed mid-2024; test with first torch install
- Pitfalls: HIGH — most pitfalls derived directly from existing codebase patterns (sequential ORT, Dexie in worker, float32 requirement)
- Ablation approach: HIGH — existing ablation-engine.ts provides clear structural pattern; standalone Python script is simpler than extending TypeScript harness

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (PyTorch ONNX export path may change; verify on install)
