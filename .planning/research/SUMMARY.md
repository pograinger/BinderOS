# Project Research Summary

**Project:** BinderOS v5.5 — Cortical Intelligence
**Domain:** Local-first browser AI — context gating, predictive enrichment, sequence learning, pluggable binder-type protocol
**Researched:** 2026-03-12
**Confidence:** HIGH (all four research files grounded in direct codebase inspection + verified library versions)

## Executive Summary

BinderOS v5.5 adds a cortical intelligence layer to an existing, fully operational ONNX agent stack. This is not a greenfield project — ten cognitive ONNX classifiers, a headless adversarial harness, an entity registry with relationship inference, and an enrichment sidecar are already running. The v5.5 milestone applies four organizing principles from Hawkins HTM theory — context gating, predictive enrichment, sequence learning, and binder-type specialization — implemented entirely through the existing ONNX Runtime Web infrastructure. The only genuinely new artifact is a single LSTM sequence model (~135K parameters, <500KB ONNX) trained offline via PyTorch and the existing harness corpus. Every other feature is TypeScript logic over data already in Dexie.

The recommended approach is strictly additive and ordered by dependency. `BinderTypeConfig` is the unlock: context gating, harness SDK, and pluggable enrichment categories all require the interface first, so it ships in Phase 1. Context gating (a pre-dispatch predicate filter in `dispatchTiered()`) and predictive enrichment (a scoring function replacing `computeSignalRelevance()`) follow in Phases 2 and 3 respectively. The LSTM sequence model — the highest-risk, highest-reward piece — is deliberately deferred to Phase 4 after the lower-risk phases are validated by harness scoring metrics. This ordering ensures that each phase delivers measurable value independently and that the harness can prove quality improvements before the next phase begins.

The primary risks are memory contention on mobile (multiple NER workers triggering OOM) and entity disambiguation false positives corrupting the knowledge graph. Both are already architecturally mitigated: entity NER shares the sanitization worker (decided in v5.0), and entity dedup is conservative-by-design (no auto-merge by name alone). The remaining risk is sequence model ONNX export stability with dynamic sequence length — mitigated by using PyTorch 2.10.0's `dynamo=True` exporter with opset 18, which is the documented stable path for LSTM with dynamic axes. Harness ablation before replacing production classifiers provides the safety net.

---

## Key Findings

### Recommended Stack

The v5.5 stack requires exactly one new dependency: `torch==2.10.0` for offline sequence model training. PyTorch is already present as a transitive dependency of `sentence-transformers` in the training `.venv`, so this is likely a verification step rather than a new install. All browser-side (production) code runs on the existing `onnxruntime-web 1.24.2` + `@huggingface/transformers 3.8.1` stack. No new npm packages are needed.

**Core technologies:**
- `onnxruntime-web 1.24.2` (existing): Runs sequence LSTM + all existing classifiers in browser — WASM SIMD + WebGPU fallback already in place; sequence model is another `ClassifierConfig` entry in the existing embedding worker
- `torch 2.10.0` (training-only, Python): Train single-layer LSTM, export via `torch.onnx.export(dynamo=True, opset_version=18)` — the only stable path for LSTM with dynamic sequence length
- `Dexie 4.3.0` (existing): v10 migration adds three new tables (`gateActivationLog`, `sequenceContext`, `binderTypeConfig`) plus `predictionCache` — fully additive, no schema mutations to prior versions
- `SolidJS 1.9.11` + `@solidjs/router 0.15.4` (existing): Route signals feed context gate predicates; `useLocation().pathname` is already a reactive signal
- `Optuna 4.7.0` (existing, Python): Tunes sequence model hyperparameters (`hidden_dim`, window N, dropout) via the adversarial harness cycle

**Critical version note:** PyTorch `dynamo=False` (legacy TorchScript) must NOT be used for LSTM export — known instability with dynamic sequence lengths documented in pytorch/pytorch #41774 and #45653. Use `dynamo=True` with opset 18 exclusively.

### Expected Features

**Must have (table stakes — v5.5 milestone fails without these):**
- `BinderTypeConfig` interface with GTD as first implementation — unlocks every other feature; currently GTD is hardcoded constants scattered across `COMPOSITOR_RULES`, enrichment categories, and classifier configs
- Context gating predicate system (`shouldActivate(context: GateContext): boolean`) wired as pre-loop filter in `dispatchTiered()` — without this, the "efficient cortex" premise is not realized at all
- Sequence context signal reaching T2 classifiers — the stated functional goal of sequence learning; if the signal never reaches T2, the feature does not exist
- Predictive enrichment scoring function replacing `computeSignalRelevance()` — shifts from "what's missing on this atom?" to "what will the user need next given recent context?"

**Should have (competitive differentiators):**
- Time-of-day aware gating — deep-cognitive agents suppress in low-energy evening windows; reads `Date.now()` only, no new model needed
- Route-aware gating — triage agents skip Insights/Archive/Settings views; SolidJS route signal already reactive
- Recent atom history gating — skip re-enrichment when `atomIntelligence.enrichment.depth >= 2` and `lastUpdated < 7 days`; reads sidecar, no new model
- Cognitive signal delta trends as prediction features — rising `stress-risk` composite over last-N atoms influences enrichment priority ordering
- Harness as SDK — parameterize `run-harness.ts` on `BinderTypeConfig`; corporate/third-party binder types train via existing pipeline framework

**Defer (Phase 4 — after Phase 1-3 harness-validated):**
- LSTM sequence ONNX model — highest complexity (Python training + ONNX export + worker integration + MLP retrain); defer until gating and prediction prove measurable F1 improvement via harness metrics
- Entity graph trajectory as prediction feature — depends on entity graph quality stabilizing; Phase 29 is actively tuning entity dedup and F1; premature to rely on trajectory scoring before quality stabilizes

**Anti-features (do not build):**
- Centralized context orchestrator agent — violates emergent/no-conductor architecture; `COMPOSITOR_RULES` already handles multi-signal synthesis without a conductor
- Per-user personalized sequence model — privacy surface too large without backend; shared model trained on synthetic personas via harness is the correct approach
- Real-time sequence embedding on every keystroke — 50-100ms per NER call on mobile; trigger only on atom save/triage completion
- NuPIC / SDR algorithms — never found production traction; apply HTM as organizing principle (gating, prediction, specialization) via ONNX, not SDR math

### Architecture Approach

The architecture is strictly additive and layered around two integration points. First: a new `ActivationGate` filter wraps the existing `dispatchTiered()` handler loop as a pre-loop predicate check, without touching any `TierHandler` interface (handlers remain pure). Second: a new `PredictiveEnrichmentScorer` is a pure async function over existing Dexie tables that plugs into `enrichment-engine.ts` as a drop-in replacement for `computeSignalRelevance()`. The sequence ONNX model is a new `ClassifierConfig` entry in the existing embedding worker — collocated to share the single ORT session pool and avoid a fourth worker causing mobile OOM. The `BinderTypeConfig` interface is extended with three optional fields (`activationPredicates`, `modelColumns`, `harnessSdkPersonas`) using string IDs resolved to TypeScript functions at module load, keeping JSON config serializable.

**Major components:**
1. `src/ai/context-gate/` (NEW) — Pure TypeScript predicate evaluator; four predicate dimensions (route, time-of-day, binder type, atom history); zero coupling to existing handlers; harness bypasses it by passing no `context` on `TieredRequest` — fully backwards-compatible
2. `src/ai/prediction/` (NEW) — `scorePredictedNeeds()` reads entity trajectory + composite signal history window from Dexie; results cached in `predictionCache` with 5-minute TTL; called lazily on wizard open, never on a timer or in the background
3. `src/search/embedding-worker.ts` (MODIFY) — Add `SEQUENCE_CONTEXT`/`SEQUENCE_RESULT` message types; sequence LSTM is another lazy-loaded `ClassifierConfig` entry; ring buffer of last-N embeddings maintained in-worker, capped at N=10 per binder
4. `scripts/train/sequence/` (NEW) — Four-script Python pipeline: corpus generation from harness persona atom history, LSTM training, ONNX export, Node.js validation; output is `sequence-context.onnx` in `public/models/classifiers/`
5. `scripts/harness/harness-binder-type-sdk.ts` (NEW) — Thin orchestration wrapper over existing `runAdversarialCycle` + `AblationEngine`; reads `BinderTypeConfig.modelColumns` + `.harnessSdkPersonas` to drive custom binder type training

**Key patterns:**
- Pre-loop filter in `dispatchTiered()` — never add session-state logic inside `canHandle()`; handlers must stay pure and harness-compatible
- Sequence context fires speculatively before user action — do not block classification on the SEQUENCE_RESULT round-trip
- Prediction is lazy + TTL-cached, never timer-based — no background agents, no conductors
- `SessionContext` is ephemeral; never write it to Dexie — assembled inline from SolidJS signals per request

### Critical Pitfalls

1. **Dual NER workers cause OOM on mobile** — Architecturally mitigated in v5.0: entity detection NER shares the sanitization worker via `DETECT_ENTITIES` message type. Do NOT create a fourth worker for sequence inference either — add it as a `ClassifierConfig` in the existing embedding worker. Three concurrent ORT instances is the safe practical maximum on mobile.

2. **Entity name disambiguation without context creates noise** — "John" across 50 items may be 5 different people. Never auto-merge by name alone; require exact full-name match plus contextual domain similarity. Use the `knowledge-domain` cognitive signal as a disambiguation feature. Surface merge suggestions for user confirmation; never auto-merge.

3. **IndexedDB is not a graph database — naive multi-hop traversal becomes O(N) full table scans** — Build an in-memory adjacency index (`Map<entityValue, Set<sourceAtomId>>`) loaded at startup (~10KB for 3,000 relationships). Cap graph traversal at 2 hops. Add a missing `entityValue` index to the `entityGraph` schema. Store `mentionCount` and `lastMentioned` on the `Entity` record to avoid count queries.

4. **Entity context injection bloats enrichment prompts past token limits** — Budget entity context to 150 tokens maximum. Select 2-3 most relevant entities by enrichment category; summarize each in one line. Only inject entity context for questions about delegation, references, or next actions — not for outcome or complexity questions. Cache entity summaries on the `Entity` record.

5. **Keyword relationship inference false positives from co-occurrence noise** — Use sentence-level co-occurrence (not item-level), require entity-keyword proximity within 5 tokens, start all keyword-inferred relationships at confidence 0.3, require 2+ co-occurrences before creating a typed relationship edge. Track evidence records separately from confirmed relationships.

6. **SolidJS store reactivity cascade from entity data updates** — Keep entity data outside the main `createStore`; use `createResource` for async Dexie lookups. Use `batch()` for all entity updates from a single triage operation. Never store graph traversal results in the store — compute in `createMemo` on demand.

---

## Implications for Roadmap

The dependency graph is unambiguous and drives the phase order. `BinderTypeConfig` and the Dexie v10 schema are the unlock for everything else. Context gating is lower-risk than predictive enrichment (pure predicates, no Dexie query performance concerns). Sequence learning is highest-risk and highest-reward — deferred until gating and prediction phases prove independent value through harness ablation metrics.

### Phase 1: Schema + BinderTypeConfig Protocol
**Rationale:** Every other feature depends on either the v10 Dexie schema or the `BinderTypeConfig` interface. This phase has zero ONNX risk, is fully unit-testable without models running, and unblocks all subsequent phases. The schema contracts must be locked before any implementation writes data.
**Delivers:** v10 migration (`sequenceContext`, `predictionCache`, `gateActivationLog`, `binderTypeConfig` tables); `BinderTypeConfig` interface extended with `activationPredicates`, `modelColumns`, `harnessSdkPersonas` optional fields; GTD updated as first implementation of the extended interface; predicate registry scaffolded in `src/ai/context-gate/predicates/`
**Features addressed:** BinderTypeConfig interface (P1 table stakes), binder-type protocol foundation (P2 differentiator seed)
**Avoids:** Naming collision between sanitization `entityRegistry` and knowledge graph `entities` tables (Pitfall 5); schema decisions made before any entity data is written
**Research flag:** No deeper research needed — established Dexie additive migration pattern; v9 migration is the direct template

### Phase 2: Context Gate Evaluator
**Rationale:** Lowest-risk new feature; pure TypeScript predicate logic with zero ONNX dependency. Proves the pre-loop filter pattern in `dispatchTiered()` works correctly before adding more complex features. The harness can immediately measure agent activation rate reduction, providing the first v5.5 quality metric.
**Delivers:** `src/ai/context-gate/` directory with four predicate implementations (route, time-of-day, binder type, atom history); `ActivationGate` filter integrated into `pipeline.ts`; `SessionContext` optional field on `TieredRequest`; harness passes no `context` field (backwards-compatible, all handlers remain active in test runs)
**Features addressed:** Context gating — route-aware (P1 differentiator), time-of-day (P1 differentiator), recent atom history (P1 differentiator)
**Avoids:** Session-state logic inside `canHandle()` which breaks harness (Architecture Anti-Pattern 1); persisting `SessionContext` to Dexie creating stale reads (Architecture Anti-Pattern 3)
**Research flag:** No deeper research needed — standard pre-dispatch filter; SolidJS `useLocation()` is already reactive out of the box

### Phase 3: Predictive Enrichment Scorer
**Rationale:** No new ONNX model required. Pure Dexie reads over data already populated by v5.0 Phases 26-29. Can run in parallel with Phase 4 once Phase 1+2 are complete. Validates that entity graph and cognitive signal sidecar data is correctly queryable as prediction inputs — a prerequisite before the sequence model phase relies on data quality.
**Delivers:** `src/ai/prediction/trajectory-scorer.ts` (entity recency + mention count delta queries) and `signal-scorer.ts` (composite signal delta trends); `predictionCache` table with 5-minute TTL writes; `enrichment-engine.ts` consuming `scorePredictedNeeds()` for question ordering; windowed `CachedCognitiveSignal` query with delta computation
**Features addressed:** Predictive enrichment scoring function (P2 core differentiator), cognitive signal delta trends (P2 differentiator)
**Avoids:** Timer-based prediction agent (Architecture Anti-Pattern 4); entity context prompt bloat enforced here with 150-token budget (Pitfall 4); graph traversal O(N) scans via in-memory adjacency index and query caps (Pitfall 3)
**Research flag:** Shallow check recommended on Dexie compound query performance at 2,000+ entity rows before Phase 3 ships. The in-memory adjacency index from Pitfall 3 must be implemented here, not deferred.

### Phase 4: Sequence Context ONNX Model
**Rationale:** Highest complexity, highest reward. Deferred until Phases 1-3 are harness-validated so the Python training pipeline investment is made on a proven foundation. The LSTM model improves T2 classifier quality but is additive — existing production classifiers remain active until ablation confirms F1 improvement, at which point retrained 512-dim MLPs replace them.
**Delivers:** Four-script Python training pipeline in `scripts/train/sequence/` (corpus extraction, LSTM training, ONNX export with `dynamo=True` opset 18, Node.js validation); `sequence-context.onnx` in `public/models/classifiers/`; `SEQUENCE_CONTEXT`/`SEQUENCE_RESULT` message types in embedding worker; `sequenceContext?: number[]` field on `TieredFeatures`; retrained MLP classifiers with 512-dim input (384 MiniLM + 128 context); harness ablation report comparing F1 before and after context injection
**Features addressed:** Sequence learning ONNX model (P3), sequence context signal reaching T2 classifiers (P1 table stakes — completion)
**Avoids:** In-browser ONNX training attempt (Architecture Anti-Pattern 2); fourth worker for sequence inference causing mobile OOM (Architecture Anti-Pattern 5 / Pitfall 1); `dynamo=False` TorchScript export path with known LSTM dynamic-shape instability
**Research flag:** Validate ONNX export with `72_validate_sequence_model.mjs` against onnxruntime-node BEFORE wiring into browser. Run full harness ablation comparing F1 metrics before swapping any production MLP classifiers. This is the one phase with genuine technical risk.

### Phase 5: Harness SDK + Second Binder Type Validation
**Rationale:** After Phases 1-4 are complete, the harness SDK is a thin orchestration wrapper over existing infrastructure. Running a hypothetical second binder type through the full adversarial cycle validates that the entire `BinderTypeConfig` protocol is complete, the context gate predicates are correctly parameterized, and the harness framework is genuinely pluggable — serving as an integration test for all four prior phases.
**Delivers:** `scripts/harness/harness-binder-type-sdk.ts` thin wrapper; a non-GTD `BinderTypeConfig` exercised through `runAdversarialCycle` + `AblationEngine`; ablation reports tagged by binder type; gap analysis identifying which model columns are undertrained for the new type
**Features addressed:** Harness as SDK (P2 differentiator), binder-type specialization protocol
**Avoids:** GTD-specific constants leaking into the generic pipeline; validates that the protocol is actually pluggable, not just nominally so
**Research flag:** No deeper research needed — existing harness pipeline is well-understood from Phases 28-29; this is orchestration and parameterization work with clear templates

### Phase Ordering Rationale

- Schema migration always comes first — no implementation can proceed without locked Dexie contracts and type definitions
- `BinderTypeConfig` is the dependency unlock — context gating reads `binderType`, prediction reads enrichment weights, harness SDK reads `modelColumns`; all three are blocked without the interface
- Context gating before predictive enrichment — gating is synchronous pure-predicate logic with zero async risk; prediction requires verified Dexie query performance at scale
- Sequence model last among core features — Python training pipeline is the only genuinely novel engineering work; entity graph quality (tuned in Phase 29) and gating infrastructure (Phase 2) must be proven before investing in it
- Harness SDK last — it integrates and validates everything; its success is the final confidence signal for the entire milestone

### Research Flags

**Phases needing attention during implementation:**
- **Phase 4 (Sequence model):** LSTM ONNX export with dynamic sequence length via `dynamo=True` is the one known technical risk in the entire milestone. Validate with `onnxruntime-node` before browser deployment. Run harness ablation across N=3, N=5, N=7 window sizes. Do not swap production MLP classifiers until ablation confirms F1 improvement.
- **Phase 3 (Predictive scorer):** In-memory adjacency index for entity graph queries must be implemented in this phase (not deferred). Profile Dexie compound query latency at representative data volumes before enabling on low-end mobile.

**Phases with well-established patterns (skip deeper research):**
- **Phase 1 (Schema migration):** Dexie additive migration is a solved pattern with 9 prior versions as templates
- **Phase 2 (Context gating):** Pre-dispatch filter + SolidJS reactive signals are standard patterns with no architectural unknowns
- **Phase 5 (Harness SDK):** Wrapping existing `runAdversarialCycle` requires no new infrastructure; the adversarial cycle and ablation engine are mature

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All recommendations grounded in existing codebase + verified PyPI versions. PyTorch presence in `.venv` should be confirmed before Phase 4 begins, but fallback install path is documented. No new npm packages. |
| Features | HIGH | Feature set derived from direct codebase inspection of `pipeline.ts`, `enrichment-engine.ts`, `cognitive-signals.ts`, `TieredFeatures`, and `PROJECT.md` active requirements. Dependency graph between features is precisely mapped. |
| Architecture | HIGH | All integration points, message types, new directories, and anti-patterns are grounded in codebase inspection of 14 source files, not inference. Build order derived from actual code dependencies. |
| Pitfalls | HIGH (critical), MEDIUM (moderate) | Critical pitfalls (OOM, entity disambiguation, IndexedDB traversal, prompt bloat) are verified against codebase and library documentation. Moderate pitfalls (reactivity cascades, relationship false positives) are extrapolated from existing patterns with high confidence. User correction UX adoption rates (Pitfall 9) are LOW confidence — no direct evidence. |

**Overall confidence:** HIGH

### Gaps to Address

- **Entity graph quality stability for trajectory prediction:** Phase 3's prediction scorer uses entity graph trajectory as a signal. Phase 29 is actively tuning entity dedup and F1 — the scorer must degrade gracefully when entity data is sparse or low-confidence. Design a confidence floor check before using entity trajectory features; fall back to signal-only scoring when entity quality is below threshold.
- **Sequence model window size N tuning:** Research recommends N=5 as default, tunable by Optuna. The harness must run ablation across N=3, N=5, N=7 before locking the default. Window size affects both training corpus batching and mobile memory footprint directly.
- **Mobile ORT session memory ceiling variance:** The practical per-tab memory limit varies across iOS Safari versions and Android Chrome releases. Research documents 256-512MB as the practical range. Add `performance.measureUserAgentSpecificMemory()` logging to the embedding worker's model-load path to warn before OOM, not after.
- **PyTorch transitive dependency confirmation:** Research notes PyTorch is "likely" already in `.venv` as a transitive dep of `sentence-transformers`. Confirm with `python -c "import torch; print(torch.__version__)"` at the start of Phase 4 planning — do not assume it is present.

---

## Sources

### Primary (HIGH confidence)
- Codebase: `src/ai/tier2/pipeline.ts`, `handler.ts`, `types.ts`, `cognitive-signals.ts` — tiered pipeline internals, TierHandler interface, TieredFeatures schema
- Codebase: `src/ai/enrichment/enrichment-engine.ts` — `computeSignalRelevance()` predecessor, enrichment session state machine
- Codebase: `src/search/embedding-worker.ts` — ClassifierConfig pattern, fetchWithCache, ORT session management, existing message types
- Codebase: `src/config/binder-types/index.ts`, `gtd-personal.json` — existing BinderTypeConfig interface and GTD implementation
- Codebase: `src/types/intelligence.ts`, `src/storage/db.ts` — AtomIntelligence, Entity, EntityRelation schema; Dexie v1-v9 migration pattern
- Codebase: `scripts/harness/harness-types.ts`, `harness-pipeline.ts`, `ablation-engine.ts` — headless harness infrastructure
- Codebase: `src/inference/relationship-inference.ts`, `src/entity/entity-detector.ts` — pure module contract, NER-to-registry orchestration
- PyTorch 2.10.0 — PyPI (latest stable, January 21, 2026)
- `torch.onnx.export` dynamo=True — PyTorch 2.10 official documentation
- onnxruntime-web WebGPU + WASM SIMD — official onnxruntime.ai documentation
- `useLocation` — @solidjs/router official documentation

### Secondary (MEDIUM confidence)
- pytorch/pytorch #41774, #45653 — LSTM ONNX dynamic shape export; community-verified workaround using `batch_size=1` fixed at export time with `h0/c0` as model inputs
- Dexie documentation — IndexedDB query limitations, compound index behavior, MultiEntry index patterns
- Project memory files: `project_htm_cortical_vision.md`, `project_os_architecture_vision.md` — HTM principles mapping, mobile feasibility assessment, LSTM vs attention recommendation

### Tertiary (LOW confidence)
- Mobile browser per-tab memory limits (256-512MB range) — documented variability across iOS Safari versions; treat as approximate guideline for budgeting, not a hard ceiling
- User correction UX adoption rates in PIM tools — extrapolated from PIM literature; no direct measurement for BinderOS usage patterns

---
*Research completed: 2026-03-12*
*Ready for roadmap: yes*
