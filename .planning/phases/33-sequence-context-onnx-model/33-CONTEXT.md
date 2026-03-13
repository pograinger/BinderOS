# Phase 33: Sequence Context ONNX Model - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

A lightweight LSTM sequence model trained on harness persona atom history provides a 128-dim context embedding that is concatenated with MiniLM embeddings before T2 classifier inference — improving classification quality without adding a new worker or exceeding mobile memory limits. Ring buffer management, training pipeline, classifier retraining, and ablation validation across window sizes.

</domain>

<decisions>
## Implementation Decisions

### Ring buffer lifecycle
- **Dexie only**: Store embedding window in `sequenceContext` table (already exists from Phase 30 v10 migration). Embedding worker reads on demand. Survives page refresh. Consistent with sidecar pattern
- **Update triggers**: Atom save AND triage completion — both produce embeddings and both represent meaningful content changes
- **Window size N**: Claude's Discretion — default to 5, ablation tests N=3, N=5, N=7 per SEQ-04

### Training data strategy
- **Training objective**: Claude's Discretion — choose between compressed context vector (end-to-end with classifier loss) or next-embedding prediction (self-supervised). Pick what produces the best 128-dim context signal for downstream T2 classifiers
- **Training corpus**: Harness persona atom histories from `scripts/harness/personas/` — synthetic but realistic GTD sequences with ground truth
- **Export path**: `dynamo=True` with opset 18 — already decided in STATE.md as the only stable PyTorch ONNX export path for LSTM with dynamic sequence length

### Classifier retraining scope
- **All at once**: Single training run produces all 512-dim (384 MiniLM + 128 sequence context) T2 classifiers. Ablation compares full set against existing 384-dim models
- **Production replacement gated on ablation**: Existing 384-dim classifiers only replaced if ablation confirms F1 improvement (SEQ-04). No speculative deployment
- **Training pipeline**: New scripts under `scripts/train/sequence/` following existing numbered convention (60_generate_sequence_data.py, 61_train_sequence_model.py, etc.)

### Cold-start and fallback
- **Zero-pad 128-dim context**: When binder has fewer than N atoms with embeddings, the 128-dim sequence context is all zeros. Classifiers trained to handle zero context gracefully — zero-padded context is a training-time augmentation
- **No dual model maintenance**: Single set of 512-dim classifiers. Zero-pad is the cold-start path, not a separate 384-dim fallback model set
- **Model not loaded fallback**: If sequence ONNX model hasn't been downloaded/loaded yet, also zero-pad. Same code path as cold-start

### Claude's Discretion
- Window size default (5 vs 7) — ablation decides
- Training objective (end-to-end context vs self-supervised next-embedding)
- LSTM hidden size and layer count (must stay under 500KB ONNX)
- Training data augmentation strategy for zero-context robustness
- Script numbering within `scripts/train/sequence/`

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/types/gate.ts`: `SequenceContextEntry` interface already defined — `binderId`, `windowSize`, `embeddings` (Float32Array), `lastUpdated`, `modelVersion`
- `src/storage/db.ts`: `sequenceContext` Dexie table already registered with `&binderId, lastUpdated` index
- `src/search/embedding-worker.ts`: All ONNX inference runs here — message protocol for EMBED, CLASSIFY_ONNX, CLASSIFY_GTD, DECOMPOSE already established
- `src/ai/tier2/types.ts`: `TieredFeatures` type — where `sequenceContext` field would be added for 512-dim input
- `scripts/train/`: Numbered training pipeline convention (01-51) — sequence scripts follow same pattern

### Established Patterns
- Embedding worker message protocol: typed `{ type, id, ... }` messages with `*_RESULT` / `*_ERROR` response pairs
- ONNX Runtime config: `wasm.proxy = false`, `numThreads = 1`, local-only model loading from `/models/`
- Training pipeline: generate data → embed → train → validate (4-step pattern, Python + Node validation)
- Model download: `scripts/download-model.cjs` handles fetching models to `public/models/`

### Integration Points
- `src/search/embedding-worker.ts`: Add ring buffer update on EMBED_RESULT, add SEQUENCE_CONTEXT message type for reading stored context
- `src/ai/tier2/types.ts`: Extend `TieredFeatures` with optional `sequenceContext: Float32Array`
- `src/ai/tier2/index.ts`: Concatenate sequence context before classifier inference in `dispatchTiered()`
- `scripts/train/sequence/`: New training pipeline directory
- `public/models/`: Sequence ONNX model served alongside existing models

</code_context>

<specifics>
## Specific Ideas

- The sequence model runs in the existing embedding worker — NOT a new worker. This avoids a 4th concurrent ORT instance which would OOM on mobile (STATE.md decision)
- Sequence context is the "one HTM concept worth stealing" — atom ordering carries information that individual embeddings miss. A user processing 5 urgent tasks in a row creates a different context than 5 leisurely insights
- Zero-padding as cold-start means one code path, one model set, one ablation comparison. No complexity tax for edge cases

</specifics>

<deferred>
## Deferred Ideas

- **Multi-binder sequence awareness** — cross-binder sequence patterns (work context bleeding into personal). Single-binder for Phase 33
- **Attention head alternative** — if LSTM proves insufficient, a single attention head over the window could be Phase 33.1. LSTM first per STATE.md
- **Online learning / fine-tuning** — adapting the sequence model to individual user patterns. Requires in-browser training which is out of scope (ONNX Runtime Web is inference-only)
- **Sequence-aware enrichment** — feeding sequence context into the predictive enrichment scorer (Phase 32). Natural follow-up but separate concern

</deferred>

---

*Phase: 33-sequence-context-onnx-model*
*Context gathered: 2026-03-13*
