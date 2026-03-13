---
phase: 36-consensus-wired-gate-and-enrichment
verified: 2026-03-13T20:30:00Z
status: passed
score: 13/13 must-haves verified
re_verification: false
---

# Phase 36: Consensus Wired Gate and Enrichment Verification Report

**Phase Goal:** Wire specialist consensus layer — define consensus types, train specialist ONNX models, implement consensus voter, wire end-to-end pipeline from canonical vector through specialist inference to sidecar persistence.
**Verified:** 2026-03-13T20:30:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `computeConsensus()` returns weighted probability, majority vote, and agreement score from specialist outputs | VERIFIED | `src/ai/consensus/consensus-voter.ts` L27-86: pure function, all three fields computed and returned |
| 2 | Consensus result is persisted to `atomIntelligence.consensusRisk` via fire-and-forget write | VERIFIED | `src/storage/atom-intelligence.ts` L193-205: `writeConsensusRisk()` exact fire-and-forget pattern |
| 3 | All 4 specialists fully agree → agreement score = 1.0 | VERIFIED | 286-line test file; unanimous case covered with `toBeCloseTo(1.0)` assertion |
| 4 | Empty specialist array throws, does not produce NaN | VERIFIED | `consensus-voter.ts` L28-30: `throw new Error('No specialist outputs')` |
| 5 | 4 specialist ONNX models exist in `public/models/specialists/`, each under 20KB | VERIFIED | time-pressure: 4.7KB, dependency: 4.2KB, staleness: 1.5KB, energy-context: 2.7KB — all well under 20KB |
| 6 | Each model accepts correct feature count as input and outputs 2-class probability array | VERIFIED | Training script validates `output[1].shape == (1,2)` after each export; SUMMARY.md confirms all 4 passed |
| 7 | Training uses the same ground-truth risk formula as `eii-experiment.py` | VERIFIED | `70_train_specialist_models.py` L328-334: `compute_ground_truth_risk()` with comment `# Source: scripts/eii-experiment.py — do not diverge` |
| 8 | Feature slices are derived from `vectors.json` dimension names, not hardcoded indices | VERIFIED | Training script loads `vectors.json` at runtime via `idx(name)` helper; TypeScript types.ts uses `indexByName()` that throws on mismatch |
| 9 | Consensus worker loads 4 specialist ONNX models and returns per-specialist probabilities | VERIFIED | `src/workers/consensus-worker.ts` L45-71: lazy `ensureSessionsLoaded()`, returns `SPECIALIST_RESULTS` array |
| 10 | Cold-start guard prevents consensus when fewer than 15 atoms have canonical vectors | VERIFIED | `src/ai/consensus/specialist-runner.ts` L51: `COLD_START_THRESHOLD = 15`; checked at L157 |
| 11 | Consensus computation fires automatically after canonical vector is written | VERIFIED | `src/ai/feature-vectors/vector-cache.ts` L105-113: dynamic import + `void runConsensusForAtom()` fires after `db.atomIntelligence.put()` |
| 12 | Consensus is fire-and-forget — never blocks the dispatch path | VERIFIED | `specialist-runner.ts` L152: `runConsensusForAtom` wraps everything in `(async () => { ... })()` with catch → console.warn only |
| 13 | Only task atoms trigger consensus (person and calendar atoms are skipped) | VERIFIED | `vector-cache.ts` L105: `if (vectorType === 'task')` guard; `specialist-runner.ts` L166: `cv.vectorType !== 'task'` early return |

**Score:** 13/13 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/ai/consensus/types.ts` | `SpecialistOutput`, `ConsensusResult`, `SPECIALIST_WEIGHTS`, `SPECIALIST_FEATURE_SLICES` | VERIFIED | 209 lines; all 4 exports present; `indexByName()` derives all indices at module load time |
| `src/ai/consensus/consensus-voter.ts` | `computeConsensus` pure function | VERIFIED | 87 lines; pure function, no imports from store or db |
| `src/ai/consensus/consensus-voter.test.ts` | Unit tests for CONS-02 | VERIFIED | 286 lines (min_lines: 50 — well exceeded); covers empty-throws, unanimous, split-vote, weighted bias, contribution tracking |
| `src/ai/consensus/index.ts` | Module barrel | VERIFIED | Re-exports `SpecialistOutput`, `ConsensusResult`, `SpecialistFeatureSlice`, `SPECIALIST_WEIGHTS`, `SPECIALIST_FEATURE_SLICES`, `computeConsensus`, `runConsensusForAtom`, `incrementVectorCount` |
| `src/types/intelligence.ts` | `consensusRisk` optional field on `AtomIntelligenceSchema` | VERIFIED | L138: `consensusRisk: z.object({...}).optional()` with all 5 sub-fields |
| `src/storage/atom-intelligence.ts` | `writeConsensusRisk` fire-and-forget helper | VERIFIED | L193-205: exact pattern match to `writePredictionMomentum`; imports `ConsensusResult` directly from `../ai/consensus/types` (not barrel) |
| `scripts/train/70_train_specialist_models.py` | Production specialist training pipeline | VERIFIED | 594 lines (min_lines: 100 — exceeded); loads vectors.json, derives indices by name, exports ONNX with opset 15 |
| `public/models/specialists/time-pressure-risk.onnx` | TimePressure specialist ONNX model | VERIFIED | 4.7KB — under 20KB |
| `public/models/specialists/dependency-risk.onnx` | Dependency specialist ONNX model | VERIFIED | 4.2KB — under 20KB |
| `public/models/specialists/staleness-risk.onnx` | Staleness specialist ONNX model | VERIFIED | 1.5KB — under 20KB |
| `public/models/specialists/energy-context-risk.onnx` | EnergyContext specialist ONNX model | VERIFIED | 2.7KB — under 20KB |
| `src/workers/consensus-worker.ts` | Web Worker with 4 specialist ONNX sessions | VERIFIED | 156 lines (min_lines: 40 — exceeded); `RUN_SPECIALISTS` handler, lazy session loading, `SPECIALIST_RESULTS` response |
| `src/ai/consensus/specialist-runner.ts` | Main-thread bridge with cold-start guard | VERIFIED | 222 lines; `runConsensusForAtom` and `incrementVectorCount` both exported |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `consensus-voter.ts` | `types.ts` | `import SpecialistOutput` | WIRED | L13: `import type { SpecialistOutput, ConsensusResult } from './types'` |
| `atom-intelligence.ts` | `types/intelligence.ts` | `consensusRisk` field shape | WIRED | L138 in intelligence.ts; L197 `intel.consensusRisk = result` in atom-intelligence.ts |
| `specialist-runner.ts` | `consensus-worker.ts` | `postMessage RUN_SPECIALISTS` | WIRED | L199: `w.postMessage({ type: 'RUN_SPECIALISTS', id: requestId, fullVector, slices })` |
| `specialist-runner.ts` | `atom-intelligence.ts` | `writeConsensusRisk` fire-and-forget | WIRED | L25: `import { writeConsensusRisk }`, L216: `writeConsensusRisk(atomId, consensus)` |
| `vector-cache.ts` | `specialist-runner.ts` | `runConsensusForAtom` after `writeCanonicalVector` | WIRED | L106-109: dynamic import + `void runConsensusForAtom(atomId, effectiveBinderId)` |
| `specialist-runner.ts` | `consensus-voter.ts` | `computeConsensus` on specialist outputs | WIRED | L26: `import { computeConsensus }`, L213: `const consensus = computeConsensus(outputs)` |
| `training script` | `vectors.json` | loads dimension names at runtime | WIRED | L47-70: `json.load(VECTORS_PATH)`, `ALL_DIMS.index(name)` pattern throughout |
| `training script` | `eii-experiment.py` | `compute_ground_truth_risk` formula | WIRED | L328-334: function copied with explicit `# Source: scripts/eii-experiment.py — do not diverge` comment |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CONS-01 | 36-02 | 4+ specialist ONNX risk models trained on non-overlapping canonical vector slices, each under 20KB | SATISFIED | 4 ONNX files in `public/models/specialists/`, largest is 4.7KB; training script uses `vectors.json` for dimension authority |
| CONS-02 | 36-01 | `computeConsensus()` returns weighted-average probability + pairwise agreement score + majority vote — pure function, no side effects | SATISFIED | `consensus-voter.ts` L27-86; 286-line test suite with 28 tests; no db/store imports |
| CONS-03 | 36-01 | Consensus result stored in `atomIntelligence.consensusRisk` with per-specialist probability contributions | SATISFIED | `AtomIntelligenceSchema` extended with `consensusRisk` Zod field; `writeConsensusRisk()` persists `specialistContributions` array |
| CONS-04 | 36-03 | Cold-start guard prevents consensus until binder has 15+ atoms with cached canonical vectors | SATISFIED | `COLD_START_THRESHOLD = 15` in `specialist-runner.ts`; in-memory counter initialized lazily from Dexie; incremented on every task vector write |

All 4 requirements marked `[x]` complete in `.planning/REQUIREMENTS.md`. No orphaned requirements detected.

---

## Anti-Patterns Found

No anti-patterns detected across all phase files.

Scanned: `src/ai/consensus/*.ts`, `src/workers/consensus-worker.ts`, `src/ai/feature-vectors/vector-cache.ts`, `src/storage/atom-intelligence.ts`, `src/types/intelligence.ts`

No TODO/FIXME/PLACEHOLDER comments found. No stub returns (`return null`, `return {}`, `return []`). No console.log-only handlers. All handlers have real implementation.

---

## Human Verification Required

### 1. Consensus pipeline runtime behavior

**Test:** In a dev build, create 15+ task atoms in a binder, save an atom, then inspect `atomIntelligence` in Dexie DevTools.
**Expected:** The `consensusRisk` field is populated on the atom's sidecar row with `weightedProbability`, `majorityVote`, `agreementScore`, and 4 `specialistContributions` entries.
**Why human:** ONNX session loading in a browser Web Worker cannot be verified programmatically — requires a running PWA with the consensus-worker.ts Vite bundle compiled and the specialist ONNX models served from `/models/specialists/`.

### 2. Cold-start suppression at < 15 vectors

**Test:** In a fresh binder with fewer than 15 task atoms, verify that `consensusRisk` is NOT written to any atom's sidecar.
**Expected:** Dexie `atomIntelligence` rows have no `consensusRisk` field until the 15th task vector is written.
**Why human:** The in-memory `vectorCountCache` initialization from Dexie on first call per binder is not exercised by unit tests (no Dexie mock in test suite).

---

## Commit History

All 6 implementation commits present:
- `3353cec` feat(36-01): consensus types, voter function, and unit tests
- `b3b0ad9` feat(36-01): schema extension and sidecar write helper
- `1f2c62e` feat(36-02): train 4 specialist ONNX risk models from canonical feature vectors
- `4757b5d` feat(36-03): consensus worker, specialist runner, and cold-start guard
- `e23eafd` feat(36-03): wire consensus trigger from writeCanonicalVector
- Documentation commits: `eb7feb7`, `0a8768e`, `7ab9109`

---

## Summary

Phase 36 achieved its goal. The specialist consensus layer is fully wired:

- **Types and voter** (Plan 01): `SpecialistOutput`, `ConsensusResult`, `SPECIALIST_WEIGHTS`, `SPECIALIST_FEATURE_SLICES` defined with index derivation from authoritative dimension arrays. `computeConsensus()` is a pure, tested function (28 tests passing). `consensusRisk` added to sidecar schema. `writeConsensusRisk()` follows the established fire-and-forget pattern.

- **Trained models** (Plan 02): 4 specialist ONNX models (1.5–4.7KB each) trained on 629K synthetic samples. Training script loads `vectors.json` at runtime for dimension authority. Ground truth risk formula copied verbatim from `eii-experiment.py` with explicit marker comment. All models validated with onnxruntime before commit.

- **End-to-end wiring** (Plan 03): `consensus-worker.ts` lazily loads 4 ONNX sessions on first request. `specialist-runner.ts` provides cold-start guard (15 task vectors), requestMap-based worker round-trip, and full pipeline: inference → `computeConsensus()` → `writeConsensusRisk()`. `vector-cache.ts` fires the pipeline via dynamic import after every task vector write. No blocking on the dispatch path.

Two items flagged for human verification relate to runtime behavior in a live browser environment (ONNX worker loading and cold-start suppression) which are not verifiable programmatically.

---

_Verified: 2026-03-13T20:30:00Z_
_Verifier: Claude (gsd-verifier)_
