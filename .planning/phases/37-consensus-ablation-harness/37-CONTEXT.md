# Phase 37: EII Diagnostic + Consensus Ablation - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Compute the Emergent Intelligence Index (EII) per binder as a live diagnostic, and prove via ablation that consensus outperforms individual specialists. The EII curve must show monotonic growth with corpus size, matching the synthetic experiment. This phase builds on Phase 36's consensus layer and Phase 35's canonical vectors.

</domain>

<decisions>
## Implementation Decisions

### EII formula & components
- **Coherence** = standard deviation of weightedProbability across all consensus results in a binder. Higher spread = more decisive = more coherent. NOT AUC (no labeled data in production)
- **Stability** = mean(agreementScore) across all consensus results in a binder. Simple starting point — easily swappable to variance-penalized if ablation suggests it
- **Impact** = harness-only: recall of ground-truth risky atoms flagged by consensus. In production, impact is undefined (2-component EII: coherence + stability only)
- **EII aggregation** = equal weights: `eii = (coherence + stability + impact) / 3`. No configurable weights — keeps the signal clean for proving the corpus-size relationship
- **EII > 0.80 threshold** is a diagnostic flag in the report, not a hard gate. Phase 37 is proving the concept — hard gates come after the curve shape is validated

### EII architecture
- **Split module**: `computeEII()` core in `src/ai/eii/` computes coherence + stability from live consensus results. Harness wrapper in `scripts/harness/` adds impact from ground truth labels
- **Trigger**: Post-consensus fire-and-forget. After `runConsensusForAtom()` completes, update running EII aggregate. Matches Phase 36 pattern
- **Storage**: New `binderIntelligence` Dexie table keyed by binderId (v11 migration). Latest snapshot only — one row per binder, overwritten on each update. No history (harness reports provide historical context)
- **Compute strategy**: Claude's Discretion — choose incremental rolling vs full recompute based on performance analysis

### Consensus ablation method
- **Extend existing `ablation-engine.ts`** with new `excludeSpecialists: string[]` field on AblationConfig
- **Post-hoc from stored results**: filter stored `specialistContributions[]` from ConsensusResult, re-call `computeConsensus()` with remaining outputs. Zero re-inference cost since specialists operate on non-overlapping feature slices
- **Recompute approach**: consensus minus one — for each specialist, run `computeConsensus()` on the remaining 3. Shows marginal contribution
- **Consensus lift**: report BOTH metrics — EII delta (full vs single) and accuracy delta (prediction quality). Two angles on the same proof
- **Specialist correlation matrix**: included. Pairwise specialist agreement rates across all atoms. Claude's Discretion on binary vs continuous correlation
- **Ablation depth**: Claude's Discretion on leave-one-out only vs including pairwise combinations (post-hoc, so cost is negligible either way)
- **Trigger**: automatic post-harness — runs after all adversarial cycles complete. No separate command needed
- **Consensus results storage**: stored in `CycleState.consensusResults: ConsensusResult[]` — populated during adversarial cycles

### Corpus size curve
- **5 hardcoded levels**: [10%, 25%, 50%, 75%, 100%]
- **Subsampling strategy**: Claude's Discretion — chronological prefix or random, whichever best proves corpus-size growth
- **Positive slope definition**: Claude's Discretion — strictly monotonic or positive trend via linear regression
- **Flat component flagging**: per-component slope analysis — separate curves for coherence, stability, impact. Flag whichever has flattest or most negative slope
- **Scope**: both per-persona curves AND aggregate curve
- **Chart format**: ASCII chart with 4 lines (composite EII + 3 components). Consistent with existing harness report format
- **Small personas**: include <50 atom personas with caveat warning. Skip below cold-start threshold (report EII as N/A if subset < 15 atoms)
- **Impact ground truth base**: within subcorpus only (risky atoms present in the sample)
- **Cost**: Claude's Discretion — post-hoc from stored results vs full re-run per level

### Harness integration
- **Full pipeline integration**: harness atoms go through complete production pipeline (T2 classifiers → canonical vectors → consensus). Real ONNX inference, not mocked
- **ONNX runtime**: `onnxruntime-node` directly in harness scripts (not worker-based). All 10 T2 classifiers + 4 specialist models loaded
- **Shared utility**: `scripts/harness/harness-onnx.ts` wraps onnxruntime-node InferenceSession loading. Used by T2 classifiers and specialist runner
- **Session management**: load all 14 model sessions once at harness start, reuse across all atoms/cycles
- **Vector computation**: pre-compute canonical vectors and pass to consensus (pure function pattern). No mock DB reads during vector computation
- **Harness consensus wrapper**: `scripts/harness/harness-consensus.ts` calls production consensus but handles harness concerns (storing results in CycleState)
- **Schema extension**: extend existing CycleState and PersonaAdversarialResult types with EII and consensus data
- **Per-cycle EII**: computed after each adversarial cycle from all atoms processed so far. Shows EII trajectory across the training loop
- **Report format**: per-persona breakdown includes both table (persona, EII, components, atom count) AND full EII curves. All three proof charts as ASCII
- **Ground truth risk labels**: auto-derived from corpus metadata (deadlines, waiting-for, high-priority) + optional override in persona ground truth files
- **Model files**: at `public/models/specialists/`, assumed pre-trained before harness run
- **Checkpointing**: extend existing checkpoint-store.ts to include consensus/EII state
- **Entry point**: Claude's Discretion — extend run-harness.ts or new entry point (follow greenfield principle)

### Claude's Discretion
- EII compute strategy (incremental vs full recompute)
- Coherence formula in harness (same as production or AUC since labels available)
- Subsampling strategy for corpus size curve
- Positive slope definition (monotonic vs trend)
- Correlation matrix type (binary vs continuous)
- Ablation depth (leave-one-out only vs pairs)
- Corpus curve computation cost (post-hoc vs re-run)
- Harness entry point architecture

</decisions>

<specifics>
## Specific Ideas

- **Tunable knobs for emergence search**: User explicitly noted these design choices are complex and wants to remember which knobs could be tested differently if the EII curve doesn't show expected growth. The 9 identified dials:
  1. Coherence formula: confidence spread vs AUC (harness-only)
  2. Stability formula: mean agreement vs variance-penalized
  3. EII weights: equal 1/3 vs configurable per component
  4. Subsampling: chronological prefix vs random
  5. Slope definition: monotonic vs positive trend
  6. Impact scope: within-subcorpus vs against-full-corpus
  7. Correlation type: binary agreement vs continuous Pearson/Spearman
  8. Ablation depth: leave-one-out only vs pairwise combinations
  9. EII compute: incremental rolling vs full recompute
- "We are searching for an emergent phenomenon and I don't necessarily know where it will be found" — the phase should make it easy to iterate on these knobs
- The EII experiment (scripts/eii-experiment.py) validated H1-H3 with synthetic data. Phase 37 makes it real with harness persona data
- Three proof charts from graph ablation experiment memory: EII vs corpus size, consensus ablation, specialist correlation matrix

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/ai/consensus/consensus-voter.ts`: `computeConsensus()` — pure function, handles variable-length specialist arrays. Direct reuse for ablation recomputation
- `src/ai/consensus/types.ts`: `ConsensusResult`, `SpecialistOutput`, `SPECIALIST_WEIGHTS`, `SPECIALIST_FEATURE_SLICES` — all type definitions for specialist consensus
- `src/ai/consensus/specialist-runner.ts`: runs specialist ONNX models on vector slices
- `scripts/harness/ablation-engine.ts`: existing ablation framework with `AblationConfig`, `runAblation()`, `runFullAblationSuite()`, `rankComponents()` — extend with `excludeSpecialists`
- `scripts/harness/harness-types.ts`: `CycleState`, `PersonaAdversarialResult`, `AblationConfig` — extend with consensus/EII fields
- `scripts/harness/write-reports.ts`: `buildMarkdown()`, `asciiBar()` — extend with EII report sections
- `scripts/harness/score-graph.ts`: `GraphScore`, `computeAggregateScore()`, `computeLearningCurve()` — patterns for EII curve computation
- `scripts/harness/checkpoint-store.ts`: existing checkpointing — extend with consensus state
- `src/ai/feature-vectors/`: `computeTaskVector()`, `computePersonVector()`, `computeCalendarVector()` — canonical vector computation (Phase 35)
- `src/storage/db.ts` + `src/storage/migrations/v10.ts`: Dexie migration pattern for v11

### Established Patterns
- Pure function pattern: AI pipeline files import NO store — EII computation follows this
- Post-action fire-and-forget: writeCanonicalVector → consensus (Phase 36). EII follows: consensus → EII update
- Harness wrapper pattern: `harness-inference.ts` wraps entity detection. `harness-consensus.ts` follows same pattern
- ASCII chart reporting: `asciiBar()` in write-reports.ts for learning curves
- Ablation framework: disable components, reuse pre-generated data, rank by impact. Extend for specialist consensus
- Mock DB pattern: `scripts/harness/mock-db.ts` for Dexie operations in harness context
- BinderTypeConfig as plugin descriptor: vector schemas, compositor rules, gate predicates (Phase 30)

### Integration Points
- `src/ai/consensus/index.ts`: trigger EII update after consensus completes
- `scripts/harness/adversarial-cycle.ts`: inject T2 + consensus pipeline step
- `scripts/harness/ablation-engine.ts`: add specialist ablation configs
- `scripts/harness/harness-types.ts`: extend CycleState with consensusResults + EII
- `scripts/harness/write-reports.ts`: add EII diagnostic sections to markdown report
- `src/storage/db.ts`: v11 migration for binderIntelligence table
- `scripts/harness/run-harness.ts` or new entry: orchestrate consensus + EII flow

</code_context>

<deferred>
## Deferred Ideas

- **Vector visualization** — showing users which dimensions are driving specialist model predictions (Phase 38+ UI concern)
- **Configurable EII weights per BinderTypeConfig** — if the equal-weight formula proves too rigid after ablation results
- **Historical EII tracking** — timestamped EII snapshots for charting over time in UI. binderIntelligence stores latest only for now
- **User action correlation for impact** — tracking whether consensus-flagged atoms get acted on (requires action tracking infrastructure)
- **Cross-binder EII comparison** — comparing EII across different binder types to validate the architecture generalizes

</deferred>

---

*Phase: 37-consensus-ablation-harness*
*Context gathered: 2026-03-13*
