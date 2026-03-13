# Phase 36: Specialist Consensus Layer - Research

**Researched:** 2026-03-13
**Domain:** Specialist ONNX risk model training + TypeScript consensus voter + dispatchTiered integration
**Confidence:** HIGH

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CONS-01 | 4+ specialist ONNX risk models trained on non-overlapping canonical vector slices (time-pressure, dependency, staleness, energy-context) — each under 20KB, exported via Python pipeline | EII experiment already exported Staleness (1.6KB) and TimePressure (5.2KB) prototypes via skl2onnx; 4 specialists fit same pattern; feature slices defined in MODEL_DEFS in eii-experiment.py |
| CONS-02 | `computeConsensus()` returns weighted-average probability + pairwise agreement score + majority vote from specialist outputs — pure function, no side effects | EII experiment's `compute_consensus()` is the TypeScript spec; maps 1:1 to a pure TS function; all three aggregation modes already validated |
| CONS-03 | Consensus result stored in `atomIntelligence.consensusRisk` with per-specialist probability contributions for downstream explainability | AtomIntelligenceSchema already has the optional-field extension pattern (predictionMomentum, entityMomentum, canonicalVector all added this way); consensusRisk follows same pattern |
| CONS-04 | Cold-start guard prevents consensus from activating until binder has 15+ atoms with cached canonical vectors — avoids misleading early predictions | PRED-03 (Phase 32) uses an identical 15-atom cold-start guard; exact same pattern reused |
</phase_requirements>

## Summary

Phase 36 is a two-part phase: a Python training pipeline that trains 4 specialist MLP risk models on non-overlapping canonical vector feature slices and exports them as ONNX, then TypeScript wiring that loads those ONNX models (in a dedicated worker or inline with the embedding worker), runs them on demand for each atom with a cached canonical vector, computes a consensus result, and persists it to `atomIntelligence.consensusRisk`.

The EII experiment (`scripts/eii-experiment.py`) already validated the full architecture: 4 specialists (TimePressure, Dependency, Staleness, EnergyContext) in weighted-average consensus achieve +0.030 AUC over the best single specialist, and all three hypotheses (H1/H2/H3) passed. Two ONNX prototypes already exist in `scripts/eii-results/` (staleness_risk.onnx at 1.6KB, timepressure_risk.onnx at 5.2KB). The training path using `skl2onnx` with opset 15 and `FloatTensorType` is proven.

The TypeScript side requires: a new `consensus-worker.ts` (or reuse of the sanitization worker — see architectural decision below), a pure `computeConsensus()` function, an AtomIntelligenceSchema extension for `consensusRisk`, and integration into `dispatchTiered()` as a post-handler fire-and-forget step. The cold-start guard (15+ atoms with canonical vectors) mirrors the PRED-03 guard from Phase 32.

**Primary recommendation:** Dedicated `consensus-worker.ts` for specialist ONNX inference, keeping the embedding worker's ONNX session count at its current level to avoid OOM on mobile. The consensus worker loads 4 small models (~20KB total); this is far lighter than the existing models in the embedding worker (~6 combined sessions). Wire `dispatchTiered()` to fire-and-forget consensus computation after handlers complete for classify-gtd tasks.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| scikit-learn | latest in .venv | MLP training + Platt calibration | Already used in all training scripts (61_train_cognitive_models.py, 21_train_gtd_classifier.py, etc.) |
| skl2onnx | latest in .venv | sklearn → ONNX export | Already used in eii-experiment.py; produces tiny models; opset 15 + FloatTensorType is the proven pattern |
| onnxruntime-web | already bundled | Browser-side ONNX inference | Already in embedding-worker.ts; ort.InferenceSession.create() pattern is established |
| TypeScript (built-in) | 5.9.3 | consensus voter + type definitions | No new deps; pure function |
| Dexie | 4.3.0 | consensusRisk sidecar persistence | Already project-standard; fire-and-forget put() pattern identical to Phase 35 |
| Zod v4 | 4.3.6 | consensusRisk schema | Already used for all AtomIntelligenceSchema extensions |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | 4.0.18 | Unit tests for computeConsensus() | Pure function requires deterministic unit tests |
| numpy/pandas | latest in .venv | Data generation + model evaluation in training script | Identical to eii-experiment.py usage |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Dedicated consensus-worker.ts | Reuse sanitization-worker.ts | Sanitization worker already reused for entity detection (Phase 27 decision); adding 4 more ONNX sessions risks OOM; dedicated worker is cleaner |
| Dedicated consensus-worker.ts | Reuse embedding-worker.ts | Embedding worker already runs MiniLM + type classifier + GTD classifiers + decompose + sequence LSTM (5+ sessions); adding 4 more pushes OOM threshold on mobile |
| skl2onnx opset 15 | PyTorch/ONNX export | Sklearn MLP → skl2onnx is 10-line export; produces smaller models (1-6KB vs 100KB+); no PyTorch dependency for inference-only models |
| Fire-and-forget consensus | Synchronous in-pipeline | Consensus result not needed in <100ms; write to sidecar async; downstream consumers read from sidecar on next render cycle |

**Installation:** No new packages needed in TypeScript. Python training script may require `skl2onnx` and `onnx` in `.venv` — same as used in eii-experiment.py.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── ai/
│   └── consensus/
│       ├── types.ts                  # SpecialistOutput, ConsensusResult, ConsensusRisk interfaces
│       ├── consensus-voter.ts         # computeConsensus() — pure function, CONS-02
│       ├── consensus-voter.test.ts    # Unit tests
│       ├── specialist-runner.ts       # loadSpecialists(), runSpecialists() — ONNX inference
│       └── index.ts                  # re-exports public API
├── workers/
│   └── consensus-worker.ts           # Web Worker: loads 4 specialist ONNX models, handles RUN_SPECIALISTS message
├── types/
│   └── intelligence.ts               # extend AtomIntelligenceSchema with consensusRisk — CONS-03
scripts/
├── train/
│   └── 70_train_specialist_models.py # Training pipeline: generates data, trains 4 MLPs, exports ONNX
public/
└── models/
    └── specialists/
        ├── time-pressure-risk.onnx    # ~5KB (TimePressure specialist)
        ├── dependency-risk.onnx       # ~5KB (Dependency specialist)
        ├── staleness-risk.onnx        # ~2KB (Staleness specialist)
        └── energy-context-risk.onnx   # ~5KB (EnergyContext specialist)
```

### Pattern 1: Specialist Model Training (Python)
**What:** sklearn MLP per specialist, each seeing only its non-overlapping feature slice, exported with skl2onnx.
**When to use:** `scripts/train/70_train_specialist_models.py` — runs once, output models committed to repo.
**Feature slices (from EII experiment, verbatim):**
- **TimePressure:** task dims [has_deadline, days_to_deadline_norm, time_pressure_score] + time_req×4 + FULL calendar vector (34 dims) — total ~42 features
- **Dependency:** task dims [is_waiting_for, has_person_dep, prev_blocked_probability] + FULL person vector (23 dims) — total ~26 features
- **Staleness:** task dims [age_norm, staleness_norm, has_deadline, days_to_deadline_norm, prev_staleness_score] — total 5 features
- **EnergyContext:** task dims [ctx×6, energy×3, time_pressure_score, prev_energy_fit] + calendar energy dims [ecost×3, time_pressure, overrun_risk] — total ~15 features

```python
# Source: scripts/eii-experiment.py — MODEL_DEFS pattern
# Training script: scripts/train/70_train_specialist_models.py
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType

def export_specialist_onnx(model, n_features: int, specialist_name: str) -> bytes:
    initial_types = [('X', FloatTensorType([None, n_features]))]
    onnx_model = convert_sklearn(
        model,
        initial_types=initial_types,
        target_opset=15,
        options={'zipmap': False},  # returns arrays, not dicts
    )
    onnx_path = MODELS_DIR / f'{specialist_name}-risk.onnx'
    with open(onnx_path, 'wb') as f:
        f.write(onnx_model.SerializeToString())
    size_kb = onnx_path.stat().st_size / 1024
    print(f'  {specialist_name}: {size_kb:.1f} KB')
    return onnx_model.SerializeToString()
```

**Architecture:** `MLP(hidden_layers=(16, 8), early_stopping=True)` with StandardScaler in Pipeline. Staleness is only 5 features so `hidden_layers=(8,)` is sufficient (EII experiment used this). No Platt calibration needed here since we read raw probabilities — but consistent with existing training scripts, use CalibratedClassifierCV anyway for better-calibrated probability outputs.

### Pattern 2: Consensus Worker (TypeScript Web Worker)
**What:** Dedicated Web Worker that loads 4 specialist ONNX models and accepts a `RUN_SPECIALISTS` message containing a flat feature vector, returns per-specialist probabilities.
**When to use:** Called from `specialist-runner.ts` after canonical vector is available for an atom.

```typescript
// src/workers/consensus-worker.ts
import * as ort from 'onnxruntime-web';

// Model paths (served from public/models/specialists/)
const SPECIALIST_MODELS = [
  { name: 'time-pressure', path: '/models/specialists/time-pressure-risk.onnx', featureIndices: [...] },
  { name: 'dependency',    path: '/models/specialists/dependency-risk.onnx',    featureIndices: [...] },
  { name: 'staleness',     path: '/models/specialists/staleness-risk.onnx',     featureIndices: [...] },
  { name: 'energy-context',path: '/models/specialists/energy-context-risk.onnx',featureIndices: [...] },
] as const;

// Load all sessions at worker init
let sessions: Map<string, ort.InferenceSession> | null = null;

async function loadSessions(): Promise<void> {
  sessions = new Map();
  for (const spec of SPECIALIST_MODELS) {
    const session = await ort.InferenceSession.create(spec.path, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
    sessions.set(spec.name, session);
  }
}
```

### Pattern 3: computeConsensus() — Pure TypeScript Function
**What:** Aggregates per-specialist probability outputs into weighted-average probability, pairwise agreement score, and majority vote.
**When to use:** Called after specialist outputs are available; returns ConsensusResult.

```typescript
// Source: scripts/eii-experiment.py compute_consensus() — TypeScript translation
// src/ai/consensus/consensus-voter.ts

export interface SpecialistOutput {
  name: string;           // 'time-pressure' | 'dependency' | 'staleness' | 'energy-context'
  probability: number;    // [0, 1] risk probability from ONNX predict_proba
  weight: number;         // specialist weight in consensus (time-pressure: 1.5, dependency: 1.5, others: 1.0)
}

export interface ConsensusResult {
  weightedProbability: number;   // weighted average of specialist probabilities
  majorityVote: boolean;         // true if majority (>=2) specialists vote high-risk (>0.5)
  agreementScore: number;        // pairwise agreement [0, 1]
  specialistContributions: SpecialistOutput[];  // for explainability
  computedAt: number;            // Unix ms
}

export function computeConsensus(outputs: SpecialistOutput[]): ConsensusResult {
  if (outputs.length === 0) throw new Error('No specialist outputs');

  // Weighted average
  const totalWeight = outputs.reduce((s, o) => s + o.weight, 0);
  const weightedProb = outputs.reduce((s, o) => s + o.probability * o.weight, 0) / totalWeight;

  // Majority vote (binary threshold at 0.5)
  const highRiskCount = outputs.filter(o => o.probability >= 0.5).length;
  const majorityVote = highRiskCount >= Math.ceil(outputs.length / 2);

  // Pairwise agreement
  let totalPairs = 0;
  let agreedPairs = 0;
  for (let i = 0; i < outputs.length; i++) {
    for (let j = i + 1; j < outputs.length; j++) {
      const voteI = outputs[i]!.probability >= 0.5;
      const voteJ = outputs[j]!.probability >= 0.5;
      if (voteI === voteJ) agreedPairs++;
      totalPairs++;
    }
  }
  const agreementScore = totalPairs > 0 ? agreedPairs / totalPairs : 1.0;

  return {
    weightedProbability: weightedProb,
    majorityVote,
    agreementScore,
    specialistContributions: outputs,
    computedAt: Date.now(),
  };
}
```

### Pattern 4: AtomIntelligenceSchema Extension (CONS-03)
**What:** Optional `consensusRisk` field on AtomIntelligence following established extension pattern.
**When to use:** Same pattern as `predictionMomentum`, `entityMomentum`, `canonicalVector` — all optional non-indexed fields.

```typescript
// src/types/intelligence.ts — extend AtomIntelligenceSchema
// Phase 36: consensus risk result
consensusRisk: z.object({
  weightedProbability: z.number(),
  majorityVote: z.boolean(),
  agreementScore: z.number(),
  specialistContributions: z.array(z.object({
    name: z.string(),
    probability: z.number(),
    weight: z.number(),
  })),
  computedAt: z.number(),
}).optional(),
```

**No Dexie migration needed** — non-indexed optional field on existing `atomIntelligence` table. Existing rows return `undefined` for `intel.consensusRisk`.

### Pattern 5: Cold-Start Guard (CONS-04)
**What:** Count atoms with cached canonical vectors before computing consensus; skip if fewer than 15.
**When to use:** In the consensus trigger in `dispatchTiered()` or specialist-runner before computing.

```typescript
// Pattern mirrors PRED-03 from Phase 32 (src/ai/predictive-scorer/scorer.ts)
async function hasEnoughVectors(binderId: string): Promise<boolean> {
  // Count atomIntelligence rows with canonicalVector field set for this binder
  const count = await db.atomIntelligence
    .where('atomId')
    .startsWith(binderId + ':')  // or join via atoms table
    .filter(intel => intel.canonicalVector !== undefined)
    .count();
  return count >= 15;
}
```

**Note:** The exact query shape depends on how atoms are keyed. The consensus guard should use a similar approach to the existing `coldStart` check in `predictionMomentum` (see `AtomIntelligenceSchema.predictionMomentum.coldStart`). An efficient approach: count atoms in the binder that have `atomIntelligence` rows with `canonicalVector` set — this is an in-memory filter over a bounded set (binder's atoms), not a full-table scan.

### Pattern 6: dispatchTiered() Integration (CONS-04)
**What:** After classify-gtd task completes (specialist information is available in context), trigger fire-and-forget consensus computation.
**When to use:** In `dispatchTiered()` after the handler loop, when task is `classify-gtd` and an atomId is in context.

```typescript
// In src/ai/tier2/pipeline.ts — after the handler loop
// Fire-and-forget consensus computation (non-blocking)
if (request.task === 'classify-gtd' && request.context.atomId) {
  void computeAndCacheConsensus(request.context.atomId, request.context.binderId);
}

// computeAndCacheConsensus: async, loads canonical vector from sidecar,
// checks cold-start guard, sends RUN_SPECIALISTS to consensus worker,
// calls computeConsensus() on results, persists to atomIntelligence.consensusRisk
```

### Anti-Patterns to Avoid
- **Running consensus synchronously in the dispatch path:** Consensus adds ~10-50ms for 4 ONNX sessions. Must be fire-and-forget; the result is read on next render cycle from sidecar.
- **Adding specialist ONNX sessions to the embedding worker:** That worker already manages MiniLM + type classifier + GTD classifiers + decompose + sequence LSTM. More sessions = OOM on 4GB mobile. Dedicated worker is required.
- **Feature indices hardcoded as magic numbers:** Feature slice indices for each specialist must be derived from `TASK_DIMENSION_NAMES`, `PERSON_DIMENSION_NAMES`, `CALENDAR_DIMENSION_NAMES` — same pattern as task-vector.ts offset constants.
- **Training on raw content text:** These are structural risk models trained on canonical feature vectors (Float32Array), NOT on MiniLM text embeddings. The training data is synthetically generated from the canonical vector distributions, not extracted from atom content.
- **Triggering consensus on every dispatchTiered call:** Only fire consensus after classify-gtd (when GTD classification is available as context for the atom). For other task types, canonical vector may not be fresh.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MLP training + ONNX export | Custom export format | skl2onnx + FloatTensorType | Already proven in eii-experiment.py; 10-line export; produces 2-6KB models |
| Probability calibration | Manual isotonic regression | CalibratedClassifierCV(method='sigmoid') | Already in training pipeline; same as all 10 cognitive models |
| Worker message queuing | Custom request/response map | Existing pattern from embedding-worker.ts | requestMap pattern (Map<string, resolve/reject>) is proven; copy verbatim |
| Consensus math | Custom statistical library | Pure TypeScript arithmetic | 30 lines; no library needed; already specified in eii-experiment.py |
| Feature slice index management | Dynamic lookup at inference time | Named index constants derived from dimension arrays at module load | Same as task-vector.ts; zero runtime cost; type-safe |

**Key insight:** The Python half of this phase is essentially `70_train_specialist_models.py` which is a slight reshaping of `eii-experiment.py` steps 3-3b. The TypeScript half is a reshaping of how the embedding worker handles CLASSIFY_ONNX — the consensus worker is the same pattern with 4 models instead of 1.

## Common Pitfalls

### Pitfall 1: Feature Slice Offset Mismatch Between Python and TypeScript
**What goes wrong:** Python training script slices features using hardcoded indices. TypeScript inference also slices the canonical vector. If they disagree on which indices belong to which specialist, every model gets wrong-shaped input or semantically wrong features.
**Why it happens:** The canonical vector layout (task 27D + person 23D + calendar 34D = 84D total) is the same as eii-experiment.py, but the actual TS implementation may have slightly different dimension ordering if vectors.json was updated after the EII experiment.
**How to avoid:** Define `SPECIALIST_FEATURE_SLICES` as a shared TypeScript constant derived from `TASK_DIMENSION_NAMES`, `PERSON_DIMENSION_NAMES`, `CALENDAR_DIMENSION_NAMES`. Export it. The Python training script must import the same dimension names from `vectors.json` (or a Python equivalent) to slice its feature matrix. Both sides derive indices from the same source of truth.
**Warning signs:** Hardcoded feature index lists like `[2, 3, 23, 18, 19, 20, 21, ...]` in either Python or TypeScript without a reference to the dimension name array.

### Pitfall 2: Consensus Worker ORT Session Count
**What goes wrong:** The consensus worker loads 4 ONNX sessions on init. On mobile devices, each ORT session holds ~5-20MB depending on model size. If this worker is registered too eagerly (e.g., on app boot), it consumes memory even before the user has any atoms.
**Why it happens:** Eager loading pattern from embedding worker (loads models on first message) may not be the right default for a worker that only becomes useful after 15+ atoms exist.
**How to avoid:** Lazy-load consensus worker: instantiate only when the cold-start guard passes for the first time. Or load the worker eagerly but defer session creation until first RUN_SPECIALISTS message.
**Warning signs:** `new Worker('.../consensus-worker.ts')` in app init code rather than in the function that checks the cold-start guard.

### Pitfall 3: skl2onnx ZipMap Default
**What goes wrong:** Without `options={'zipmap': False}`, skl2onnx wraps probability outputs in a ZipMap dict keyed by class name. ORT in the browser returns this as a JS Map, not a Float32Array — the TypeScript inference code must handle both shapes.
**Why it happens:** skl2onnx default is zipmap=True for classifiers. The embedding worker already sets zipmap=False for all its classifiers.
**How to avoid:** Always specify `options={'zipmap': False}` in skl2onnx. The output tensor is then a flat Float32Array with shape `[1, n_classes]` — index 0 = probability of class 0 (low risk), index 1 = probability of class 1 (high risk).
**Warning signs:** `model_output.cpuData` is undefined or `model_output` is an object with string keys instead of a typed array.

### Pitfall 4: Consensus Before Any Specialists Have Results
**What goes wrong:** Some atoms are not tasks — they have no task canonical vector. Calling `computeConsensus([])` with empty outputs throws or produces NaN.
**Why it happens:** `atomIntelligence.canonicalVector.vectorType` may be 'person' or 'calendar' for non-task atoms. Specialists are designed for task atoms only.
**How to avoid:** Guard at the specialist-runner level: only run specialists when `canonicalVector.vectorType === 'task'`. Return early if no task vector available. `computeConsensus()` should also guard against empty input.
**Warning signs:** NaN in `weightedProbability` or empty `specialistContributions` array in sidecar.

### Pitfall 5: Cold-Start Guard Query Efficiency
**What goes wrong:** Counting atoms with canonical vectors via a full `atomIntelligence` table scan takes 100ms+ on large binders.
**Why it happens:** `atomIntelligence` has no index on `canonicalVector`. A where-filter over all rows is O(n).
**How to avoid:** Two options: (a) Track a per-binder counter in memory (e.g., in a module-level Map incremented on each `writeCanonicalVector` call) — reset on page load, rehydrate via a single count query at startup. Or (b) Accept the O(n) query at first trigger only — after that, the counter is in memory. Given binders are bounded in size (<1000 atoms typically), O(n) is acceptable for a one-time check.
**Warning signs:** Cold-start guard query in the hot dispatch path (called on every classify-gtd).

### Pitfall 6: Training Data Distribution Mismatch
**What goes wrong:** EII experiment used synthetic data with a specific ground-truth risk formula. If the training script for Phase 36 uses a different formula or different feature distributions, the resulting models will produce different probability ranges than the EII experiment validated.
**Why it happens:** Inconsistency between the proof-of-concept (eii-experiment.py) and the production training script (70_train_specialist_models.py).
**How to avoid:** `70_train_specialist_models.py` must use the SAME `compute_ground_truth_risk()`, `generate_task_vector()`, `generate_person_vector()`, `generate_calendar_vector()` functions as eii-experiment.py — either import from it or copy verbatim with a comment. The MODEL_DEFS feature slices must also be identical to eii-experiment.py.

## Code Examples

Verified patterns from the codebase:

### Embedding worker ONNX session creation pattern
```typescript
// Source: src/search/embedding-worker.ts — existing ONNX session pattern
// Consensus worker follows the same structure

import * as ort from 'onnxruntime-web';

ort.env.wasm.proxy = false;
ort.env.wasm.numThreads = 1;  // CRITICAL: avoids SharedArrayBuffer requirement

let session: ort.InferenceSession | null = null;

async function loadModel(path: string): Promise<ort.InferenceSession> {
  return await ort.InferenceSession.create(path, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
}
```

### Request map pattern for worker round-trips
```typescript
// Source: src/ai/tier2/tier2-handler.ts — requestMap pattern (established project convention)
const requestMap = new Map<string, { resolve: (v: Result) => void; reject: (e: Error) => void }>();

function sendToWorker(features: Float32Array): Promise<SpecialistResults> {
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    requestMap.set(id, { resolve, reject });
    worker.postMessage({ type: 'RUN_SPECIALISTS', id, features: Array.from(features) });
    setTimeout(() => {
      if (requestMap.has(id)) {
        requestMap.delete(id);
        reject(new Error('Specialist timeout'));
      }
    }, 5000);
  });
}

worker.onmessage = (e) => {
  const { type, id, results, error } = e.data;
  const pending = requestMap.get(id);
  if (!pending) return;
  requestMap.delete(id);
  if (type === 'SPECIALIST_ERROR') pending.reject(new Error(error));
  else pending.resolve(results);
};
```

### Fire-and-forget sidecar persistence pattern
```typescript
// Source: src/storage/atom-intelligence.ts — writePredictionMomentum (established pattern)
// writeConsensusRisk follows same shape

export function writeConsensusRisk(atomId: string, result: ConsensusResult): void {
  (async () => {
    try {
      const intel = await getOrCreateIntelligence(atomId);
      intel.consensusRisk = result;
      intel.version++;
      intel.lastUpdated = Date.now();
      await db.atomIntelligence.put(intel);
    } catch (err) {
      console.warn('[consensus] writeConsensusRisk failed (non-fatal):', err);
    }
  })();
}
```

### EII experiment validated feature slices (ground truth for implementation)
```
TimePressure specialist:
  Task dims: has_deadline(idx 2), days_to_deadline_norm(3), time_pressure_score(20),
             time_lt15(18), time_15_30(19), time_30_60(20), time_gt60(21)
  Calendar dims: ALL 34 dims (CAL_START to CAL_START+34)
  Total: ~41 features  |  MLP: (16, 8)

Dependency specialist:
  Task dims: is_waiting_for(8), has_person_dep(22), prev_blocked_probability(25)
  Person dims: ALL 23 dims (TASK_DIM to TASK_DIM+23)
  Total: ~26 features  |  MLP: (16, 8)

Staleness specialist:
  Task dims: age_norm(0), staleness_norm(1), has_deadline(2),
             days_to_deadline_norm(3), prev_staleness_score(21)
  Total: 5 features  |  MLP: (8,)

EnergyContext specialist:
  Task dims: ctx_home(9), ctx_office(10), ctx_phone(11), ctx_computer(12),
             ctx_errands(13), ctx_anywhere(14), energy_low(15), energy_medium(16),
             energy_high(17), time_pressure_score(20), prev_energy_fit(22)
  Calendar dims: ecost_low, ecost_medium, ecost_high, time_pressure_score, overrun_risk (5 dims)
  Total: ~16 features  |  MLP: (12, 6)

Note: Index numbers above reference eii-experiment.py's TASK_FEATURES ordering.
The TS implementation must re-derive these indices from TASK_DIMENSION_NAMES
(from vectors.json) which IS the authoritative source, not eii-experiment.py's list.
```

### Specialist weights for weighted-average consensus
```typescript
// From eii-experiment.py: TimePressure and Dependency weighted 1.5x (highest-signal rules)
// All others: 1.0
const SPECIALIST_WEIGHTS: Record<string, number> = {
  'time-pressure': 1.5,
  'dependency':    1.5,
  'staleness':     1.0,
  'energy-context': 1.0,
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No risk scoring | Consensus of 4 specialist risk models on canonical vectors | Phase 36 | First structured risk signal available to all downstream consumers |
| Single MLP on full canonical vector | Non-overlapping specialist slices in weighted consensus | EII experiment validated | +0.030 AUC over best single specialist; per-specialist explanations |
| ONNX models on 384-dim MiniLM embeddings | ONNX models on 5-41 dim structured vectors | Phase 35/36 | Models 50-100x smaller (1-6KB vs 1.1MB); feature-interpretable |

**Deprecated/outdated:**
- "Composite" model that sees all features: Used only as a baseline in eii-experiment.py. Never deploy the Composite model — consensus of specialists is the target architecture.

## Open Questions

1. **Feature slice dimensions: EII experiment vs actual vectors.json**
   - What we know: eii-experiment.py uses 27-dim task / 23-dim person / 34-dim calendar. The actual vectors.json uses the same counts (TASK_VECTOR_DIM=27, PERSON_VECTOR_DIM=23, CALENDAR_VECTOR_DIM=34). However the dimension ORDER may differ: eii-experiment.py used a Python-generated list while vectors.json was designed in Phase 35 with slightly different field names.
   - What's unclear: Whether dimension 20 in eii-experiment.py's TASK_FEATURES maps to the same semantic position as index 20 in TASK_DIMENSION_NAMES from vectors.json.
   - Recommendation: The training script (`70_train_specialist_models.py`) must load `vectors.json` and compute slice indices by name lookup, not by position assumption. This is the definitive alignment step.

2. **Worker architecture: dedicated vs sanitization worker reuse**
   - What we know: Phase 27 (entity detection) was wired into the sanitization worker to avoid dual NER OOM. The sanitization worker has a different purpose (regex+ONNX sanitization) from consensus (4 tiny MLP models).
   - What's unclear: Whether the sanitization worker is already at its memory ceiling on mobile.
   - Recommendation: Dedicated `consensus-worker.ts`. The 4 specialist models total ~20KB of ONNX data (vs ~1MB per cognitive model). Memory pressure is negligible. Dedicated worker keeps concerns separated and avoids the sanitization worker becoming a dump for unrelated ONNX models.

3. **Consensus trigger: classify-gtd only vs all task atoms**
   - What we know: Consensus makes most sense after triage (classify-gtd), when the canonical vector is fresh. But triage is not the only event that updates the canonical vector (enrichment also does).
   - What's unclear: Whether consensus should re-run on enrichment updates (when enrichment_depth_norm changes) or only on triage.
   - Recommendation: Trigger from `vector-cache.ts` `writeCanonicalVector()` completion — whenever a task atom's canonical vector is written, fire-and-forget consensus computation. This is cleaner than tying to `dispatchTiered()` task type and covers all canonical vector update paths.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.18 |
| Config file | vite.config.ts (test section) |
| Quick run command | `pnpm test -- --reporter=verbose src/ai/consensus` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONS-01 | Specialist ONNX models exist at expected paths with correct input shapes | smoke | `node -e "const fs = require('fs'); ['time-pressure','dependency','staleness','energy-context'].forEach(n => { const s = fs.statSync('public/models/specialists/'+n+'-risk.onnx').size; console.assert(s < 20480, n+' too large: '+s) })"` | Wave 0 (models must be trained) |
| CONS-02 | computeConsensus returns weighted probability, majority vote, agreement score | unit | `pnpm test -- src/ai/consensus/consensus-voter.test.ts` | Wave 0 |
| CONS-02 | computeConsensus weightedProbability is between 0 and 1 for any specialist outputs | unit | `pnpm test -- src/ai/consensus/consensus-voter.test.ts` | Wave 0 |
| CONS-02 | computeConsensus agreementScore = 1.0 when all specialists agree | unit | `pnpm test -- src/ai/consensus/consensus-voter.test.ts` | Wave 0 |
| CONS-02 | computeConsensus agreementScore < 1.0 when specialists disagree | unit | `pnpm test -- src/ai/consensus/consensus-voter.test.ts` | Wave 0 |
| CONS-03 | writeConsensusRisk persists result to atomIntelligence.consensusRisk | unit | `pnpm test -- src/ai/consensus/consensus-voter.test.ts` | Wave 0 |
| CONS-03 | consensusRisk.specialistContributions has 4 entries with name + probability | unit | `pnpm test -- src/ai/consensus/consensus-voter.test.ts` | Wave 0 |
| CONS-04 | Cold-start guard returns false when fewer than 15 atoms have canonical vectors | unit | `pnpm test -- src/ai/consensus/consensus-voter.test.ts` | Wave 0 |
| CONS-04 | Cold-start guard returns true when 15+ atoms have canonical vectors | unit | `pnpm test -- src/ai/consensus/consensus-voter.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test -- src/ai/consensus`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `public/models/specialists/` — 4 ONNX models must be trained and committed (run `python -u scripts/train/70_train_specialist_models.py`)
- [ ] `src/ai/consensus/consensus-voter.ts` — core pure function module
- [ ] `src/ai/consensus/consensus-voter.test.ts` — unit tests for CONS-02, CONS-03, CONS-04
- [ ] `src/ai/consensus/types.ts` — SpecialistOutput, ConsensusResult, ConsensusRisk interfaces
- [ ] `src/workers/consensus-worker.ts` — Web Worker with specialist ONNX sessions
- [ ] `scripts/train/70_train_specialist_models.py` — production training pipeline (not just eii-experiment.py)

## Sources

### Primary (HIGH confidence)
- `scripts/eii-experiment.py` — authoritative source for specialist feature slices, MODEL_DEFS, consensus math, training architecture (MLP + Pipeline + StandardScaler), ground-truth risk formula, EII-validated results
- `scripts/eii-results/staleness_risk.onnx` (1.6KB) and `timepressure_risk.onnx` (5.2KB) — proof that skl2onnx opset 15 produces <20KB models for these architectures
- `src/search/embedding-worker.ts` — ONNX session creation pattern, requestMap worker communication pattern, ort.env.wasm configuration
- `src/ai/tier2/pipeline.ts` — dispatchTiered() integration point; fire-and-forget post-handler pattern
- `src/storage/atom-intelligence.ts` — writeConsensusRisk fire-and-forget sidecar write pattern
- `src/types/intelligence.ts` — AtomIntelligenceSchema extension pattern (all prior optional fields)
- `src/ai/feature-vectors/types.ts` — TASK_DIMENSION_NAMES, PERSON_DIMENSION_NAMES, CALENDAR_DIMENSION_NAMES — source of truth for feature slice index derivation
- `scripts/train/61_train_cognitive_models.py` — production MLP training + export pattern (CalibratedClassifierCV, skl2onnx opset 17, zipmap=False)

### Secondary (MEDIUM confidence)
- Phase 32 PRED-03 cold-start guard pattern — 15-atom threshold, in-memory counter approach
- `src/ai/tier2/types.ts` — TieredRequest.context.atomId as the hook point for post-dispatch consensus trigger

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all tools are existing project dependencies, training approach is copy-of-validated-experiment
- Architecture: HIGH — specialist worker pattern is direct analog of embedding-worker.ts; consensus math is proven by EII experiment; schema extension is established pattern
- Pitfalls: HIGH — feature slice offset mismatch is the only novel risk; all others are inherited from previous phases with known solutions

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable domain — no external dependencies to go stale; EII experiment results are in-repo)
