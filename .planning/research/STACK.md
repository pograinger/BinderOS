# Stack Research: v5.5 Cortical Intelligence

**Domain:** Local-first browser AI — context gating, predictive enrichment, sequence learning, pluggable binder-type protocol
**Researched:** 2026-03-12
**Confidence:** HIGH (all recommendations grounded in existing codebase + verified current library versions)

---

## Scope

This STACK.md covers **only what is new or changed** for v5.5. The existing stack (SolidJS 1.9.11, Dexie 4.3.0, onnxruntime-web 1.24.2, @huggingface/transformers 3.8.1, Optuna 4.7.0, sklearn/skl2onnx) is validated and NOT re-examined here.

The four v5.5 features map cleanly to the existing tier architecture:

| Feature | Tier | New Dependency? |
|---------|------|-----------------|
| Context gating | T1 (deterministic, TypeScript) | NO |
| Predictive enrichment | T2 (ONNX + scoring) | NO |
| Sequence learning | Python training + T2 ONNX | YES — PyTorch (training only) |
| Binder-type protocol | TypeScript interface + harness | NO |

**Bottom line:** One new Python training library (PyTorch 2.10.x) is needed. All browser-side (production) code uses the existing ONNX Runtime Web stack.

---

## Recommended Stack

### Core Technologies (Existing — No Changes)

| Technology | Version | Purpose | Status |
|------------|---------|---------|--------|
| onnxruntime-web | 1.24.2 (existing) | Run sequence model + existing classifiers in browser | UNCHANGED — WASM SIMD + WebGPU fallback already in place |
| @huggingface/transformers | 3.8.1 (existing) | MiniLM embedding, NER pipeline | UNCHANGED — embedding worker produces the 384-dim vectors the sequence model consumes |
| Dexie | 4.3.0 (existing) | Persist gate predicates, sequence context window, binder-type config, predictive scores | UNCHANGED — new tables added via migration, not new dependency |
| SolidJS | 1.9.11 (existing) | Reactive UI for context gate state, binder-type switcher | UNCHANGED |
| @solidjs/router | 0.15.4 (existing) | `useLocation()` provides route signal for context gate predicates | UNCHANGED |
| Optuna | 4.7.0 (existing, Python) | Tune sequence model hyperparameters (hidden dim, window N, dropout) | UNCHANGED |
| skl2onnx | 1.20.0 (existing, Python) | Export MLP classifiers to ONNX — still used for non-sequence models | UNCHANGED |

### New Dependency: PyTorch for Sequence Model Training

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| torch | 2.10.0 | Train LSTM sequence model, export to ONNX via `torch.onnx.export()` | skl2onnx cannot export recurrent models. PyTorch's ONNX exporter (dynamo=True mode, opset 18) handles LSTM with dynamic sequence length. The ONNX output runs in the existing onnxruntime-web browser runtime without any browser-side changes. |
| torchaudio | NOT needed | — | Audio processing not relevant here |
| torchvision | NOT needed | — | Image processing not relevant here |

**Why PyTorch, not a smaller alternative:**
- sklearn has no recurrent layer support — skl2onnx cannot convert LSTM or attention heads
- TensorFlow/Keras could work but introduces a second training ecosystem alongside the existing sklearn/PyTorch stack
- PyTorch is already present in the `.venv` (pulled in as a transitive dependency of `sentence-transformers` and `accelerate`, confirmed in codebase grep). `torch` is available without a new install.
- PyTorch `torch.onnx.export(dynamo=True)` is the current recommended path as of 2.7+ — avoids the deprecated TorchScript exporter

**Confidence:** HIGH — PyTorch 2.10.0 is the latest stable release (January 21, 2026), confirmed via PyPI.

### Supporting Libraries (New, Python Training Only)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| torch | 2.10.0 | Define and train LSTM/attention sequence model | New script `70_train_sequence_model.py` only |
| onnx | 1.17.x (pulled by existing deps) | Validate exported ONNX graph correctness | After `torch.onnx.export()` — check with `onnx.checker.check_model()` |
| onnxruntime | 1.24.3 (existing dev dep) | Validate sequence model inference before browser deployment | Run `71_validate_sequence_model.mjs` against Python-exported ONNX |

No new browser-side (production) npm packages are needed.

### Development Tools (Unchanged)

| Tool | Purpose | Notes |
|------|---------|-------|
| scripts/train/.venv | Python virtual environment for training | Add torch if not already resolvable — check `python -c "import torch; print(torch.__version__)"` first |
| onnxruntime-node 1.24.3 (existing) | Node.js validation of exported ONNX models | Used in existing `*_validate_*.mjs` scripts — same pattern for sequence model |
| Optuna 4.7.0 (existing) | Tune sequence model hidden_dim, N (window), dropout | Already integrated in harness's adversarial cycle |

---

## Feature-Specific Integration Points

### 1. Context Gating — Pure TypeScript, No New Dependencies

Context gating is an activation predicate system: each ONNX agent gets a `ContextGate` function that returns `boolean` before the agent is invoked. The gate reads:
- `binderType: string` — from the active binder config (new `BinderTypeConfig` interface)
- `currentRoute: string` — from `@solidjs/router`'s `useLocation().pathname` (reactive signal)
- `hourOfDay: number` — from `Date` (no library needed)
- `recentAtomHistory: SignalVector[]` — from in-memory ring buffer of last N atom signal vectors

**Implementation location:** `src/ai/tier2/context-gate.ts` (new file, no imports from npm beyond existing)

**Dexie table for persistent gate state:**
```typescript
// In v10 migration
gateState: '&binderType, updatedAt'
```

**Why no XState or TypeState:** The gate predicate is a plain `(ctx: GateContext) => boolean` function, not a state machine. State machines add overhead without benefit here — the gate condition is a stateless pure function over observable signals. The SolidJS store already provides reactive context; wrapping it in a state machine library would add 10-15KB for no gain.

### 2. Predictive Enrichment — TypeScript Scoring Function, No New Dependencies

Predictive enrichment is a scoring function over existing signals:
- Inputs: entity graph trajectory (Dexie query), cognitive signal vectors (existing `SignalVector` type), recent atom history
- Output: ranked list of `{ category: string; score: number; rationale: string }` predicting which enrichment the user needs next

**Implementation location:** `src/ai/enrichment/predictive-scoring.ts` (new file)

No new ONNX model is needed. The scoring function is a weighted linear combination of existing signals, tuned by Optuna via the harness. This is exactly T1-level work (deterministic computation over existing data).

**Key data source already available:** `atomIntelligence` sidecar (v5.0 Phase 26) already stores prior enrichment Q&A pairs as structured data. The predictive scorer reads these to detect which categories have been answered and which gaps remain.

**Why not a new ONNX model for prediction:** The prediction signal space is small and structured (10 cognitive dimensions × entity graph topology). A weighted scoring function is interpretable, debuggable, and tunable without a training corpus. An ONNX model would require labeled ground truth for "what the user needed next" — data we don't have. Use the harness to tune weights instead.

### 3. Sequence Learning — New ONNX Model via PyTorch

This is the only feature requiring a genuinely new model artifact and training script.

**Model architecture:**
- Input: last N atom embeddings, shape `[N, 384]` (MiniLM output dimension)
- Architecture: Single-layer LSTM with hidden dim 64, followed by a linear projection to 128-dim context vector
- Output: 128-dim context embedding fed as additional feature to existing T2 classifiers
- Parameter count: ~135K (tiny — runs well within mobile ONNX budget)

**Why single-layer LSTM over attention:**
- Single-layer LSTM exports to ONNX cleanly with dynamic sequence length via `dynamic_axes`
- Multi-head attention has ONNX opset dependencies that vary across onnxruntime-web backends
- LSTM hidden state naturally encodes recency weighting without positional encodings
- The GitHub issue history (pytorch/pytorch#45653, #41774) shows LSTM export is stable when batch_size=1 is fixed at export time and `h0/c0` are model inputs, not constants

**Export configuration:**
```python
# 70_train_sequence_model.py
import torch
model = LSTMContextEncoder(input_dim=384, hidden_dim=64, output_dim=128)
# Export with dynamic sequence length (N varies per call)
torch.onnx.export(
    model,
    args=(dummy_embeddings, h0, c0),  # dummy_embeddings shape: [1, N, 384]
    f="public/models/classifiers/sequence-context.onnx",
    opset_version=18,
    dynamic_axes={
        "embeddings": {1: "seq_len"},  # N is dynamic
        "output": {0: "batch"}
    },
    input_names=["embeddings", "h0", "c0"],
    output_names=["context_embedding", "h_n", "c_n"]
)
```

**Window size N:** Default N=5 (last 5 atoms). Tuned by Optuna. At N=5, input tensor is `[1, 5, 384]` = 7.5KB — negligible memory.

**Integration with existing T2 classifiers:**
- Sequence context (128-dim) is concatenated with the atom's own MiniLM embedding (384-dim) before the ONNX MLP classifiers
- MLP classifiers are retrained with `[384 + 128] = 512`-dim input
- Existing `embedding-worker.ts` maintains a ring buffer of the last N embedding vectors
- Sequence model inference runs in the same embedding worker (avoids IPC overhead)

**Training data:** Generated by the existing adversarial harness. Each synthetic binder session produces ordered atom sequences with ground-truth cognitive signals — ideal training data for sequence context learning.

### 4. Binder-Type Specialization Protocol — Pure TypeScript, No New Dependencies

**Implementation location:** `src/ai/binder-types/` (new directory)

**Core interface:**
```typescript
// src/ai/binder-types/types.ts
export interface BinderTypeConfig {
  /** Unique identifier, e.g., 'gtd', 'solopreneur', 'research' */
  id: string;
  /** Human-readable name */
  displayName: string;
  /** Which ONNX cognitive models are active for this binder type */
  activeModels: CognitiveModelId[];
  /** Context gate predicates for each active model */
  gatePredicates: Partial<Record<CognitiveModelId, ContextGateFn>>;
  /** Enrichment category weighting (influences predictive scoring) */
  enrichmentWeights: Record<string, number>;
  /** Harness persona seed config for training this binder type */
  harnessConfig?: HarnessPersonaConfig;
}
```

**GTD as first implementation:**
```typescript
// src/ai/binder-types/gtd.ts
export const GTD_BINDER_TYPE: BinderTypeConfig = {
  id: 'gtd',
  displayName: 'Getting Things Done',
  activeModels: ['priority-matrix', 'time-estimate', 'energy-level', ...],
  gatePredicates: { /* route-based + time-based predicates */ },
  enrichmentWeights: { 'next-action': 1.5, 'project': 1.2, 'waiting-for': 1.0 },
}
```

**Registry pattern (no external library):**
```typescript
// src/ai/binder-types/registry.ts
const registry = new Map<string, BinderTypeConfig>();
export const registerBinderType = (config: BinderTypeConfig) => registry.set(config.id, config);
export const getBinderType = (id: string) => registry.get(id);
```

**Harness as SDK:** The `scripts/harness/` directory already has the harness infrastructure. The `HarnessPersonaConfig` embedded in `BinderTypeConfig` makes it explicit: each binder type ships with a reference harness config for training and validating its ONNX column set.

---

## Installation

```bash
# Verify torch is already available (likely pulled by sentence-transformers)
cd scripts/train && source .venv/Scripts/activate  # Windows: .venv\Scripts\activate
python -c "import torch; print(torch.__version__)"

# If torch is not present (unlikely):
pip install torch==2.10.0 --index-url https://download.pytorch.org/whl/cpu

# No new npm packages needed
# No new browser-side dependencies
```

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| Single-layer LSTM (PyTorch → ONNX) | Causal attention head (PyTorch → ONNX) | LSTM exports reliably with dynamic seq length. Attention needs positional encodings and has more ONNX opset friction. LSTM is the safer first sequence model. |
| LSTM (PyTorch → ONNX) | Mamba/SSM state space model | Mamba ONNX export is not production-stable in 2026. Stick to battle-tested LSTM until Mamba ONNX stabilizes. |
| LSTM (PyTorch → ONNX) | Extend sklearn MLP with lag features | Concatenating lag features (embed_t-1 || embed_t-2) into MLP input loses temporal ordering signal and grows input quadratically with N. LSTM is the right inductive bias for sequences. |
| Pure TypeScript context gate predicates | XState v5 state machine | Context gate is a stateless predicate, not a multi-state workflow. XState adds 22KB for no benefit here. |
| Pure TypeScript scoring function | New ONNX model for prediction | No ground truth "what user needs next" labels available. Weighted scoring tuned by Optuna is interpretable and sufficient for v5.5. |
| PyTorch (existing transitive dep) | TensorFlow.js for sequence training | TF.js is browser-side inference, not training. Python-side TF adds a second ecosystem when PyTorch is already present. |
| Single embedding worker runs sequence model | Separate sequence worker | Embedding worker already holds all MiniLM embeddings in memory. Sequence model is tiny (135K params). Collocating avoids cross-worker IPC for the embedding ring buffer. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| NuPIC / HTM algorithms | Never found ecosystem traction; SDR math worse than ONNX on practical benchmarks | Apply HTM *organizing principles* only — context gating, prediction, specialization via ONNX |
| torch.jit.script (TorchScript export) | Deprecated in favor of dynamo=True exporter as of PyTorch 2.7+ | `torch.onnx.export(..., dynamo=True)` with opset 18 |
| Multi-layer LSTM | Harder ONNX export, more params, no accuracy benefit at this scale | Single-layer LSTM with hidden_dim=64 |
| XState / TypeState / statecharts | Unnecessary abstraction for stateless gate predicates | Plain TypeScript `(ctx) => boolean` predicate functions |
| d3 / vis.js for graph visualization | Deferred to v6.0 (Programmable Pages) | Do not add — binder-type protocol is data layer only |
| localStorage for ring buffer | Synchronous, size-limited, wrong tool | In-memory ring buffer in embedding worker; flush to Dexie on idle |
| Per-user cloud-trained sequence models | Privacy surface too large, requires backend | Local training via harness + Optuna on synthetic personas |
| dynamo=False (legacy TorchScript path) | Known issues with LSTM dynamic shapes | dynamo=True is the stable path for LSTM with dynamic sequence length |

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| torch 2.10.0 | onnx 1.17.x | ONNX opset 18 is fully supported by torch 2.10.0 |
| skl2onnx 1.20.0 | sklearn 1.8.0 | Existing MLP models continue on this path; sequence model uses PyTorch exporter separately |
| onnxruntime-web 1.24.2 | ONNX opset ≤ 21 | Opset 18 is well within support range |
| onnxruntime-node 1.24.3 | ONNX opset ≤ 21 | Used for `71_validate_sequence_model.mjs` — same opset, compatible |
| sentence-transformers (existing .venv) | torch 2.10.0 | sentence-transformers 3.x supports PyTorch 2.x; no conflict |
| Optuna 4.7.0 | torch 2.10.0 | No known incompatibilities; Optuna is framework-agnostic |

---

## Dexie Migration Needs (v10)

The existing schema is at v9 (post v5.0 Phase 26). v5.5 needs one new migration:

```typescript
// v10 migration additions
.version(10).stores({
  // Context gate state persistence (binder-type-scoped gate counters)
  gateActivationLog: '&id, binderType, modelId, gateResult, timestamp',
  // Sequence model context window (ring buffer overflow to Dexie)
  sequenceContext: '&atomId, binderType, contextVector, updatedAt',
  // Binder type registry (user's active binder type config)
  binderTypeConfig: '&id, isActive, updatedAt',
})
```

No schema changes to existing tables. Migration is additive.

---

## Sequence Model Training Pipeline Location

Follows the established numbering convention in `scripts/train/`:

| Script | Purpose |
|--------|---------|
| `70_generate_sequence_data.py` | Extract ordered atom embedding sequences from harness persona graphs |
| `71_train_sequence_model.py` | Define LSTM, train, export to `public/models/classifiers/sequence-context.onnx` |
| `72_validate_sequence_model.mjs` | Node.js ONNX Runtime validation (follows 22_validate_*.mjs pattern) |
| `73_retrain_mlp_with_context.py` | Retrain existing MLP classifiers with 512-dim input (384 + 128 context) |

The sequence model and retrained MLPs are the only new ONNX artifacts. All existing model files remain valid — MLPs with context are a parallel set, not a replacement. The pipeline should run both variants in the harness and use ablation to confirm context improves F1 before replacing production models.

---

## Sources

- [PyTorch 2.10.0 release — PyPI](https://pypi.org/project/torch/) — HIGH confidence (latest stable, January 21, 2026)
- [torch.onnx.export dynamo=True — PyTorch 2.10 docs](https://docs.pytorch.org/docs/stable/onnx_export.html) — HIGH confidence (official)
- [LSTM ONNX dynamic shape export — pytorch/pytorch #41774](https://github.com/pytorch/pytorch/issues/41774) — MEDIUM confidence (community-verified workaround)
- [skl2onnx 1.20.0 — PyPI](https://pypi.org/project/skl2onnx/) — HIGH confidence (latest stable, opset 22 support)
- [onnxruntime-web WebGPU + WASM SIMD — official docs](https://onnxruntime.ai/docs/tutorials/web/) — HIGH confidence (official)
- [Optuna 4.7.0 — optuna.readthedocs.io](https://optuna.readthedocs.io/) — HIGH confidence (latest stable)
- [useLocation — @solidjs/router docs](https://docs.solidjs.com/solid-router/reference/primitives/use-location) — HIGH confidence (official)
- Existing codebase: `src/ai/tier2/`, `scripts/train/`, `scripts/harness/` — HIGH confidence (direct code review)

---

*Stack research for: BinderOS v5.5 Cortical Intelligence (context gating, predictive enrichment, sequence learning, binder-type protocol)*
*Researched: 2026-03-12*
