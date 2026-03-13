# Phase 37: EII Diagnostic + Consensus Ablation - Research

**Researched:** 2026-03-13
**Domain:** TypeScript metrics layer + harness extension (Node.js/ONNX/Dexie)
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**EII formula and components:**
- Coherence = std-dev of `weightedProbability` across all consensus results in a binder. Higher spread = more decisive = more coherent. NOT AUC (no labeled data in production)
- Stability = mean(`agreementScore`) across all consensus results in a binder
- Impact = harness-only: recall of ground-truth risky atoms flagged by consensus. In production, impact is undefined (2-component EII: coherence + stability only)
- EII aggregation = equal weights: `eii = (coherence + stability + impact) / 3`. No configurable weights
- EII > 0.80 threshold is a diagnostic flag in the report, not a hard gate

**EII architecture:**
- Split module: `computeEII()` core in `src/ai/eii/` computes coherence + stability from live consensus results. Harness wrapper in `scripts/harness/` adds impact from ground truth labels
- Trigger: post-consensus fire-and-forget. After `runConsensusForAtom()` completes, update running EII aggregate
- Storage: new `binderIntelligence` Dexie table keyed by binderId (v11 migration). Latest snapshot only — one row per binder, overwritten on each update. No history

**Consensus ablation method:**
- Extend existing `ablation-engine.ts` with new `excludeSpecialists: string[]` field on AblationConfig
- Post-hoc from stored results: filter stored `specialistContributions[]` from ConsensusResult, re-call `computeConsensus()` with remaining outputs. Zero re-inference cost
- Recompute approach: consensus minus one — for each specialist, run `computeConsensus()` on the remaining 3
- Consensus lift: report BOTH metrics — EII delta (full vs single) and accuracy delta
- Specialist correlation matrix: included
- Ablation trigger: automatic post-harness — runs after all adversarial cycles complete. No separate command needed
- Consensus results stored in `CycleState.consensusResults: ConsensusResult[]`

**Corpus size curve:**
- 5 hardcoded levels: [10%, 25%, 50%, 75%, 100%]
- Flat component flagging: per-component slope analysis. Flag whichever has flattest or most negative slope
- Scope: both per-persona AND aggregate curve
- Chart format: ASCII chart with 4 lines (composite EII + 3 components). Consistent with existing harness report format
- Small personas: include <50 atom personas with caveat warning. Skip below cold-start threshold (report EII as N/A if subset < 15 atoms)
- Impact ground truth base: within subcorpus only

**Harness integration:**
- Full pipeline integration: harness atoms go through complete production pipeline (T2 classifiers → canonical vectors → consensus). Real ONNX inference, not mocked
- ONNX runtime: `onnxruntime-node` directly in harness scripts (not worker-based). All 10 T2 classifiers + 4 specialist models loaded
- Shared utility: `scripts/harness/harness-onnx.ts` wraps onnxruntime-node InferenceSession loading
- Session management: load all 14 model sessions once at harness start, reuse across all atoms/cycles
- Vector computation: pre-compute canonical vectors and pass to consensus (pure function pattern)
- Harness consensus wrapper: `scripts/harness/harness-consensus.ts` calls production consensus but handles harness concerns (storing results in CycleState)
- Schema extension: extend existing CycleState and PersonaAdversarialResult types with EII and consensus data
- Per-cycle EII: computed after each adversarial cycle from all atoms processed so far
- Ground truth risk labels: auto-derived from corpus metadata (deadlines, waiting-for, high-priority) + optional override in persona ground truth files
- Model files: at `public/models/specialists/`, assumed pre-trained before harness run
- Checkpointing: extend existing checkpoint-store.ts to include consensus/EII state

### Claude's Discretion
- EII compute strategy (incremental vs full recompute)
- Coherence formula in harness (same as production or AUC since labels available)
- Subsampling strategy for corpus size curve
- Positive slope definition (monotonic vs trend)
- Correlation matrix type (binary vs continuous)
- Ablation depth (leave-one-out only vs pairs)
- Corpus curve computation cost (post-hoc vs re-run)
- Harness entry point architecture

### Deferred Ideas (OUT OF SCOPE)
- Vector visualization (Phase 38+ UI concern)
- Configurable EII weights per BinderTypeConfig
- Historical EII tracking (timestamped snapshots for UI)
- User action correlation for impact
- Cross-binder EII comparison
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EII-01 | `computeEII(binderId)` returns `{ coherence, stability, impact, eii }` — coherence from consensus AUC, stability from pairwise model agreement, impact from binder-level high-risk recall | Pure function in `src/ai/eii/`, consuming ConsensusResult[] from Dexie `binderIntelligence` table (v11 migration). Production coherence uses std-dev of weightedProbability; harness coherence may use AUC since labels available |
| EII-02 | EII computed after each harness adversarial cycle, stored in harness report with per-persona breakdowns — EII curve across corpus sizes must show positive slope | `harness-consensus.ts` wraps consensus and accumulates ConsensusResult[]; per-cycle EII computed from accumulated results; corpus curve generated post-hoc from 5 subsamples of stored results |
| EII-03 | Ablation engine extended to measure consensus vs each specialist independently — report includes `consensus_lift` metric proving ensemble > any single model | Extend `AblationConfig` with `excludeSpecialists: string[]`; post-hoc re-call `computeConsensus()` on filtered `specialistContributions[]` — zero re-inference cost since SPECIALIST_FEATURE_SLICES are non-overlapping |
| EII-04 | Harness personas with 50+ atoms achieve EII > 0.80 — threshold validates emergent intelligence at realistic corpus sizes | Only alex-jordan (60), dev-kumar (49), and maria-santos (40) have corpora; alex-jordan is the only guaranteed 50+ persona; threshold is diagnostic not a gate |
</phase_requirements>

---

## Summary

Phase 37 adds two measurement systems on top of the Phase 36 consensus layer: the Emergent Intelligence Index (EII) and a consensus ablation engine. Neither requires new model training — both are pure post-processing over ConsensusResult[] records that Phase 36 already generates.

The EII is a 3-component binder-level score: coherence (how decisive the consensus is, measured by std-dev of weightedProbability across all binder atoms), stability (how well specialists agree, measured by mean agreementScore), and impact (harness-only: recall of ground-truth risky atoms). The production module computes coherence + stability from Dexie; the harness wrapper adds impact from ground truth labels. The formula is already validated by `scripts/eii-experiment.py` which proved H1-H3 with synthetic data — this phase makes it real with persona corpora.

The ablation engine extension is straightforward: `computeConsensus()` already accepts a variable-length `SpecialistOutput[]`, so filtering stored `specialistContributions[]` and re-calling it costs zero re-inference. The existing `ablation-engine.ts` patterns (per-component disable + re-score + rank) map cleanly to per-specialist disable + EII/accuracy delta.

**Primary recommendation:** Implement all four new files (`src/ai/eii/index.ts`, `scripts/harness/harness-onnx.ts`, `scripts/harness/harness-consensus.ts`, `scripts/harness/eii-report.ts`) as thin pure-function wrappers over existing production code, extend harness types minimally, add the v11 Dexie migration, and wire everything into `run-adversarial.ts` post-cycle.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.x (existing) | All new modules | Project standard |
| Dexie | 4.x (existing) | `binderIntelligence` v11 table | Project database layer |
| onnxruntime-node | existing in project | Load specialist + T2 ONNX models in harness Node.js context | Harness is Node.js, not browser — no Worker |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `computeConsensus()` (local) | Phase 36 | Pure voter reused for ablation | All ablation re-computation |
| `asciiBar()` (local) | existing | ASCII chart in reports | All 4-line EII curve charts |
| `computeLearningCurve()` (local) | existing | Pattern for EII corpus curve | Model for `computeEIICurve()` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| std-dev for coherence | AUC | AUC requires labels — only valid in harness. Std-dev works in production with no labels. Production uses std-dev; harness may optionally use AUC for richer diagnostics |
| equal-weight EII | configurable weights | Configurable weights deferred — equal weights keep the corpus-size relationship clean and easy to reason about during initial validation |
| post-hoc ablation from stored specialistContributions | full re-inference | Re-inference would need ONNX sessions for all 4 specialists per ablation run. Post-hoc is zero-cost and equally valid since SPECIALIST_FEATURE_SLICES are non-overlapping |

---

## Architecture Patterns

### Recommended Project Structure

New files to create:
```
src/ai/eii/
├── index.ts           # computeEII() + updateBinderEII() — pure, no Dexie in compute path
└── types.ts           # EIIResult, BinderEIISnapshot interfaces

src/storage/migrations/
└── v11.ts             # binderIntelligence table

scripts/harness/
├── harness-onnx.ts    # InferenceSession loader (onnxruntime-node)
├── harness-consensus.ts  # production consensus wrapper — stores ConsensusResult in CycleState
└── eii-report.ts      # buildEIISection(), buildAblationSection() for report
```

Modified files:
```
src/storage/db.ts                          # import + call applyV11Migration
src/storage/migrations/v11.ts              # new — binderIntelligence table
src/ai/consensus/index.ts                  # trigger updateBinderEII after writeConsensusRisk
scripts/harness/harness-types.ts           # extend CycleState + PersonaAdversarialResult
scripts/harness/ablation-engine.ts         # extend AblationConfig with excludeSpecialists
scripts/harness/write-reports.ts           # add EII sections to buildExperimentMarkdown
scripts/harness/checkpoint-store.ts        # extend CycleCheckpointData to persist consensusResults
scripts/harness/run-adversarial.ts         # wire harness-consensus.ts + post-cycle EII compute
```

### Pattern 1: EII as Pure Function Over ConsensusResult[]

The `computeEII()` function receives ConsensusResult[] from the caller — it does NOT query Dexie. The caller (`updateBinderEII()`) queries Dexie and then calls the pure function. This matches the project's established AI pipeline pattern.

```typescript
// src/ai/eii/index.ts
// Source: project pattern — pure modules import NO store

export interface EIIResult {
  coherence: number;  // std-dev of weightedProbability — higher = more decisive
  stability: number;  // mean(agreementScore) — higher = more agreement
  impact: number;     // harness-only: risky-atom recall vs random baseline
  eii: number;        // (coherence + stability + impact) / 3
}

export interface BinderEIISnapshot {
  binderId: string;
  coherence: number;
  stability: number;
  impact: number;     // 0 in production (no labels); set by harness
  eii: number;
  atomCount: number;
  computedAt: number;
}

/**
 * Pure function — caller provides ConsensusResult[].
 * Production: impact=0 (no labels). Harness: caller passes computed impact.
 */
export function computeEII(
  results: ConsensusResult[],
  impact: number = 0,
): EIIResult {
  if (results.length === 0) {
    return { coherence: 0, stability: 0, impact: 0, eii: 0 };
  }

  // Coherence: std-dev of weightedProbability — more spread = more decisive signal
  const probs = results.map(r => r.weightedProbability);
  const mean = probs.reduce((a, b) => a + b, 0) / probs.length;
  const variance = probs.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / probs.length;
  const coherence = Math.sqrt(variance);

  // Stability: mean pairwise agreement across all results
  const stability = results.reduce((sum, r) => sum + r.agreementScore, 0) / results.length;

  // EII: equal-weight average of all three components
  const eii = (coherence + stability + impact) / 3;

  return { coherence, stability, impact, eii };
}
```

**Note on coherence range:** Std-dev of values in [0,1] is bounded [0, 0.5]. The EII formula uses raw std-dev (not normalized) — this means coherence contributes up to 0.5 to EII. The harness report should note this range characteristic. If the EII curve doesn't show expected growth, normalizing coherence (e.g., `coherence * 2`) is dial #1 to adjust.

### Pattern 2: Ablation via specialistContributions Filtering

The `specialistContributions[]` field on every `ConsensusResult` already stores the full per-specialist output. Ablation re-computes consensus by filtering this array and re-calling the pure `computeConsensus()` function:

```typescript
// scripts/harness/ablation-engine.ts extension

export interface SpecialistAblationResult {
  specialistRemoved: string;      // which specialist was excluded
  fullConsensusEII: number;        // EII with all 4 specialists
  ablatedConsensusEII: number;     // EII with this specialist removed
  eiiDelta: number;                // fullEII - ablatedEII (positive = specialist contributed)
  accuracyDelta: number;           // accuracy delta (true positive rate on risky atoms)
  consensusLift: number;           // full consensus AUC - single specialist AUC
}

// Extend AblationConfig:
export interface AblationConfig {
  // ... existing fields ...
  excludeSpecialists?: string[];   // new — names to exclude from consensus
}
```

The re-computation loop:
```typescript
// For each specialist in SPECIALIST_WEIGHTS:
//   Filter stored ConsensusResult[].specialistContributions to exclude that specialist
//   Re-call computeConsensus() on filtered array
//   Compute EII on new ConsensusResult[]
//   Compare to full-specialist EII
```

### Pattern 3: Corpus Size Curve via Subsampling

The corpus curve is computed post-hoc from stored ConsensusResult[] — no re-inference. The decision on subsampling strategy (Claude's Discretion):

**Recommendation: chronological prefix** (take first X% of atoms by corpus order). Rationale:
- Atoms in corpus.json are already in temporal order (generated chronologically per harness)
- Chronological prefix simulates cold-start growth, which is the actual user experience
- Random sampling could include high-information atoms from the "end" of the user's journey, artificially inflating early-corpus EII

For positive slope definition, **recommend linear regression positive slope** (not strict monotonicity). With only 5 data points and noisy real data, strict monotonicity is fragile. A positive trend line with R² > 0.7 is a stronger statistical statement.

### Pattern 4: v11 Dexie Migration

Follow v10 pattern exactly:

```typescript
// src/storage/migrations/v11.ts
export function applyV11Migration(db: BinderDB): void {
  db.version(11).stores({
    binderIntelligence: '&binderId, updatedAt',
  });
}
```

Table schema:
```typescript
export interface BinderIntelligenceEntry {
  binderId: string;
  coherence: number;
  stability: number;
  impact: number;       // 0 in production
  eii: number;
  atomCount: number;
  computedAt: number;   // Unix ms
  updatedAt: number;    // for index
}
```

### Pattern 5: harness-onnx.ts Session Management

Harness loads all 14 models once at startup, reusing sessions across atoms and cycles:

```typescript
// scripts/harness/harness-onnx.ts
import * as ort from 'onnxruntime-node';

export interface HarnessONNXSessions {
  specialists: Record<string, ort.InferenceSession>;  // 4 specialist models
  classifiers: Record<string, ort.InferenceSession>;  // 10 T2 classifiers
}

export async function loadAllSessions(modelsRoot: string): Promise<HarnessONNXSessions> {
  // Load all 14 .onnx files in parallel with Promise.all
  // specialist names: time-pressure-risk, dependency-risk, staleness-risk, energy-context-risk
  // classifier names: from classifiers/ dir
}
```

**Session reuse is critical:** `ort.InferenceSession` creation is expensive (~100ms). Loading once at harness start and passing sessions through the call chain avoids per-atom overhead.

### Pattern 6: CycleState Extension

```typescript
// harness-types.ts extension
export interface CycleState {
  // ... existing fields ...
  consensusResults?: ConsensusResult[];  // per-atom consensus results this cycle
  cycleEII?: EIIResult;                  // EII computed from all atoms so far
}

export interface PersonaAdversarialResult {
  // ... existing fields ...
  eiiProgression?: EIIResult[];          // per-cycle EII for trajectory reporting
}
```

### Anti-Patterns to Avoid

- **Loading ONNX sessions inside per-atom loops:** Creates hundreds of InferenceSession objects, killing performance. Load once, reuse.
- **Storing ConsensusResult[] in checkpoint JSON without serialization review:** ConsensusResult.specialistContributions contains `SpecialistOutput[]` with float arrays — safe to serialize directly.
- **Querying Dexie in computeEII():** The pure function must accept pre-loaded data. The caller does the DB read. This matches every other AI pipeline module in the project.
- **Using worker-based consensus in harness:** The harness runs in Node.js without `Worker`. The `specialist-runner.ts` uses `new Worker(...)` which won't work. `harness-consensus.ts` must call `computeConsensus()` directly after running ONNX via `onnxruntime-node`.
- **Re-running full ONNX inference for ablation:** Stored `specialistContributions[]` make this unnecessary. Filter and re-call `computeConsensus()` only.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Consensus aggregation | Custom ablation aggregator | `computeConsensus()` with filtered `SpecialistOutput[]` | Already pure, handles edge cases (single specialist → agreementScore=1.0) |
| ASCII charts | Custom bar chart | `asciiBar()` from write-reports.ts | Existing, consistent with all other harness reports |
| Statistical slope detection | Custom monotonicity checker | Linear regression via `Array.reduce()` (no library needed, 3-4 lines) | N=5 data points — numpy/math.js is overkill |
| Pairwise agreement | Custom correlation computation | `agreementScore` already computed in `computeConsensus()` | Available on every ConsensusResult |
| ONNX session lifecycle | Custom session pool | `onnxruntime-node` InferenceSession loaded once, passed as parameter | Standard pattern |

**Key insight:** Phase 37 is a measurement phase, not an inference phase. Almost all the hard work (ONNX inference, consensus voting, pairwise agreement) was done in Phase 36. Phase 37 aggregates and reports.

---

## Common Pitfalls

### Pitfall 1: Coherence Std-Dev Range Surprise

**What goes wrong:** Std-dev of values in [0,1] has a maximum of 0.5 (when half values are 0, half are 1). A binder where all atoms score ~0.7 risk has very low coherence despite high risk. This is correct behavior — uniform high risk is "not coherent" in the signal sense — but it surprises reviewers.

**Why it happens:** Coherence measures decisiveness, not magnitude. A binder where the consensus ranges widely (some atoms clearly risky, others clearly safe) is "more coherent" than one where everything scores 0.5.

**How to avoid:** Document the formula clearly in the report. Consider normalizing by `coherence * 2` to scale [0, 0.5] → [0, 1] if the raw EII consistently underperforms the 0.80 threshold. This is dial #1 in the tunable knobs list.

**Warning signs:** EII plateaus around 0.55-0.65 despite good stability and impact. Check raw coherence values.

### Pitfall 2: Corpus Size Curve Not Growing Because Personas Are Too Small

**What goes wrong:** With only 3 personas having corpora (alex-jordan 60 atoms, dev-kumar 49, maria-santos 40), 10% of corpus is 4-6 atoms — below the 15-atom cold-start threshold. EII will be N/A at 10% for small personas.

**Why it happens:** The cold-start guard is 15 atoms. 10% of 40 atoms = 4 items — below threshold. 25% = 10 items — still below threshold.

**How to avoid:** Apply cold-start guard to corpus curve too. Report EII as N/A when the subcorpus slice has fewer than 15 atoms. The first valid curve point may be 25% or 50% for small personas.

**Warning signs:** EII reported as 0 at early corpus fractions instead of N/A — verify cold-start guard is applied during subsampling.

### Pitfall 3: ONNX Session Creation in Harness vs Browser Worker

**What goes wrong:** `specialist-runner.ts` uses `new Worker(...)` and `new URL(...)` — both browser-only APIs. Importing it in the harness will fail at runtime with "Worker is not defined".

**Why it happens:** Production consensus runs in a browser worker. Harness runs in Node.js.

**How to avoid:** `harness-consensus.ts` must NOT import from `specialist-runner.ts`. It imports `computeConsensus()` from `consensus-voter.ts` (pure, no DOM APIs) and runs ONNX inference directly via the HarnessONNXSessions object.

**Warning signs:** `ReferenceError: Worker is not defined` when running harness.

### Pitfall 4: Ablation Result Polarity Confusion

**What goes wrong:** Reporting that removing specialist X "improved" EII when the delta is positive (ablated > full). This would mean the specialist was hurting consensus — possible but unexpected.

**Why it happens:** Delta direction conventions vary. `eiiDelta = fullEII - ablatedEII` (positive = removing it HURT = it was contributing). `eiiDelta = ablatedEII - fullEII` (positive = removing it HELPED = it was hurting).

**How to avoid:** Match the convention used in the existing `computeAblationDelta()` function: `ablatedScore - fullScore` (negative = the component was helping). Apply the same convention to EII delta.

**Warning signs:** All specialists show "positive impact" — verify delta direction.

### Pitfall 5: CycleState.consensusResults Bloat in Checkpoints

**What goes wrong:** Checkpointing a full cycle's ConsensusResult[] (one per atom, with 4 SpecialistOutput per atom) multiplied by 5 cycles × 12 personas = large checkpoint files.

**Why it happens:** ConsensusResult includes `specialistContributions` array. 60 atoms × 4 specialists = 240 SpecialistOutput objects per cycle.

**How to avoid:** The checkpoint already excludes corpus (`// corpus excluded for size`). Apply the same pattern — checkpoint stores `cycleEII` only (4 numbers), not the full `consensusResults[]`. Full ConsensusResult[] lives only in-memory during harness run and is used immediately for EII computation + ablation before the cycle checkpoint is saved.

---

## Code Examples

### EII Computation (production path)

```typescript
// src/ai/eii/index.ts
// Source: project pattern, validated against eii-experiment.py lines 563-573

export function computeEII(
  results: ConsensusResult[],
  impact = 0,
): EIIResult {
  if (results.length === 0) return { coherence: 0, stability: 0, impact: 0, eii: 0 };

  const probs = results.map(r => r.weightedProbability);
  const mean = probs.reduce((a, b) => a + b, 0) / probs.length;
  const variance = probs.reduce((sum, p) => sum + (p - mean) ** 2, 0) / probs.length;
  const coherence = Math.sqrt(variance);  // std-dev in [0, 0.5]

  const stability = results.reduce((sum, r) => sum + r.agreementScore, 0) / results.length;

  const eii = (coherence + stability + impact) / 3;

  return { coherence, stability, impact, eii };
}
```

### Harness Impact Computation (ground truth recall)

```typescript
// scripts/harness/harness-consensus.ts
// Source: eii-experiment.py lines 527-546 (binder_level_impact)

/**
 * Compute impact: fraction of truly risky atoms surfaced by consensus
 * vs random baseline. Matches the formula from eii-experiment.py.
 */
function computeHarnessImpact(
  atomRiskLabels: boolean[],              // ground truth: is each atom risky?
  consensusProbs: number[],               // consensus weightedProbability per atom
  topKPct = 0.3,
): number {
  const n = atomRiskLabels.length;
  if (n === 0) return 0;
  const k = Math.max(1, Math.floor(n * topKPct));

  // Model: surface top-k by predicted risk
  const sortedByRisk = consensusProbs
    .map((p, i) => ({ i, p }))
    .sort((a, b) => b.p - a.p);
  const topKIndices = new Set(sortedByRisk.slice(0, k).map(x => x.i));

  const trueRiskyCount = atomRiskLabels.filter(Boolean).length;
  if (trueRiskyCount === 0) return 0;

  const modelRecall = atomRiskLabels
    .filter((_, i) => topKIndices.has(i))
    .filter(Boolean).length / trueRiskyCount;

  const baselineRecall = trueRiskyCount / n;

  if (modelRecall <= baselineRecall) return 0;
  return Math.min((modelRecall - baselineRecall) / (1 - baselineRecall), 1.0);
}
```

### Specialist Ablation Re-computation

```typescript
// scripts/harness/ablation-engine.ts extension
// Source: computeConsensus() in src/ai/consensus/consensus-voter.ts

function recomputeWithoutSpecialist(
  storedResults: ConsensusResult[],
  excludeName: string,
): ConsensusResult[] {
  return storedResults.map(result => {
    const remaining = result.specialistContributions.filter(s => s.name !== excludeName);
    if (remaining.length === 0) return result; // guard: keep original if nothing remains
    return computeConsensus(remaining);
  });
}
```

### ASCII EII Corpus Curve Report (4 lines)

```typescript
// scripts/harness/eii-report.ts
// Source: write-reports.ts asciiBar() pattern

function buildEIICurveSection(
  curvePoints: Array<{ fraction: number; coherence: number; stability: number; impact: number; eii: number }>,
  personaName: string,
): string {
  const lines: string[] = [];
  lines.push(`### EII Corpus Curve — ${personaName}`);
  lines.push('');
  lines.push('EII, coherence, stability, and impact by corpus fraction:');

  for (const pt of curvePoints) {
    const pct = `${(pt.fraction * 100).toFixed(0)}%`.padStart(4);
    lines.push(`  ${pct}  EII=${asciiBar(pt.eii)}  C=${asciiBar(pt.coherence)}  S=${asciiBar(pt.stability)}  I=${asciiBar(pt.impact)}`);
  }

  // Slope analysis
  const eiValues = curvePoints.map(p => p.eii);
  const slope = linearRegressionSlope(eiValues);
  const verdict = slope > 0 ? 'POSITIVE slope' : 'FLAT/NEGATIVE slope — investigate';
  lines.push('');
  lines.push(`  Slope: ${slope.toFixed(4)} (${verdict})`);

  return lines.join('\n');
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom ablation runner (full re-inference) | Post-hoc filter of stored specialistContributions[] + re-call computeConsensus() | Phase 37 (now) | Zero ONNX re-inference cost for ablation |
| Per-atom EII (impossible — no per-atom binder context) | Per-binder EII aggregated from all atom consensus results | Phase 37 | EII is a binder-level metric, not atom-level |
| AUC coherence (requires labels) | Std-dev of weightedProbability (label-free) | Phase 37 design decision | Production EII works without ground truth |

**Production vs Harness coherence:** The synthetic experiment (`eii-experiment.py`) used AUC as coherence since labels were available. The production formula uses std-dev since production has no labels. In the harness context (where labels ARE available), the coherence formula can optionally switch to AUC for richer diagnostics — this is one of the 9 tunable knobs.

---

## Open Questions

1. **Will the EII > 0.80 threshold be achievable with 3 personas of 40-60 atoms each?**
   - What we know: The synthetic experiment achieved EII > 0.80 at 100% corpus. Real data is noisier. Alex-jordan at 60 atoms is the best candidate.
   - What's unclear: Whether coherence std-dev formula in production reaches comparable levels to AUC-based coherence in the synthetic experiment.
   - Recommendation: Treat EII-04 as a diagnostic target, not a blocking requirement. Report actual values and compare to the synthetic experiment baseline. The tunable knobs (coherence normalization, etc.) exist for this reason.

2. **Should `harness-onnx.ts` also handle the 10 T2 classifiers, or just the 4 specialists?**
   - What we know: CONTEXT.md says "load all 14 model sessions once at harness start". The adversarial cycle currently uses T2 classifiers through the existing harness pipeline.
   - What's unclear: Whether the existing `harness-pipeline.ts` already loads classifiers via `onnxruntime-node` or still uses a different inference path.
   - Recommendation: Verify `harness-pipeline.ts` inference path before Phase 37 planning. If classifiers are already loaded, `harness-onnx.ts` only needs to add the 4 specialist models.

3. **What's the correct "risky atom" threshold for ground truth derivation?**
   - What we know: Ground truth risk labels are "auto-derived from corpus metadata (deadlines, waiting-for, high-priority)". Corpus items have metadata.
   - What's unclear: The exact threshold. Is any item with a deadline "risky"? Or only overdue items?
   - Recommendation: Use a conservative definition matching the specialist training: `has_deadline AND days_to_deadline < 7` OR `is_waiting_for` OR `high_priority`. Document the threshold in the harness report.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None explicitly (project has no test runner config detected) |
| Config file | none — project validates via harness adversarial run |
| Quick run command | `npx tsx scripts/harness/run-harness.ts --persona alex-jordan --dry-run` |
| Full suite command | `npx tsx scripts/harness/run-adversarial.ts --personas alex-jordan --cycles 1` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EII-01 | computeEII() returns correct struct with coherence/stability/impact/eii | unit | `npx tsx -e "import { computeEII } from './src/ai/eii/index.ts'; console.log(computeEII([]))"` | Wave 0 |
| EII-02 | EII in harness report with corpus curve | integration | `npx tsx scripts/harness/run-adversarial.ts --personas alex-jordan --cycles 2` | ❌ Wave 0 |
| EII-03 | Ablation report with consensus_lift metric | integration | `npx tsx scripts/harness/run-adversarial.ts --personas alex-jordan --cycles 1 --skip-report` | ❌ Wave 0 |
| EII-04 | EII > 0.80 for 50+ atom persona | harness validation | `npx tsx scripts/harness/run-adversarial.ts --personas alex-jordan --cycles 5` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx tsx -e "import('./src/ai/eii/index.ts').then(m => console.log(m.computeEII([])))"` — verify EII module loads
- **Per wave merge:** `npx tsx scripts/harness/run-harness.ts --persona alex-jordan --dry-run` — verify harness wiring
- **Phase gate:** Full adversarial run with EII+ablation sections in report before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/ai/eii/index.ts` — computeEII() pure function — covers EII-01
- [ ] `src/ai/eii/types.ts` — EIIResult, BinderEIISnapshot types
- [ ] `src/storage/migrations/v11.ts` — binderIntelligence table
- [ ] `scripts/harness/harness-onnx.ts` — specialist session loader
- [ ] `scripts/harness/harness-consensus.ts` — production consensus wrapper with CycleState storage
- [ ] `scripts/harness/eii-report.ts` — ASCII curve builder + ablation section

*(No new framework install needed — onnxruntime-node already in project)*

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `src/ai/consensus/consensus-voter.ts` — computeConsensus() pure function, exact interface
- Direct code inspection: `src/ai/consensus/types.ts` — ConsensusResult, SpecialistOutput, SPECIALIST_WEIGHTS, SPECIALIST_FEATURE_SLICES
- Direct code inspection: `scripts/harness/ablation-engine.ts` — AblationConfig, runFullAblationSuite(), rankComponents()
- Direct code inspection: `scripts/harness/harness-types.ts` — CycleState, PersonaAdversarialResult, exact fields
- Direct code inspection: `scripts/harness/write-reports.ts` — asciiBar(), buildAblationSection() patterns
- Direct code inspection: `scripts/harness/score-graph.ts` — computeLearningCurve() pattern for EII curve
- Direct code inspection: `scripts/harness/checkpoint-store.ts` — CycleCheckpointData, corpus exclusion pattern
- Direct code inspection: `scripts/harness/run-adversarial.ts` — entry point architecture, existing flags
- Direct code inspection: `src/storage/migrations/v10.ts` — exact migration pattern for v11
- Direct code inspection: `scripts/eii-experiment.py` lines 527-573 — validated EII formula (coherence/stability/impact/binder_level_impact)
- Direct code inspection: `scripts/harness/personas/*/corpus.json` — actual atom counts (alex-jordan=60, dev-kumar=49, maria-santos=40)
- Direct code inspection: `public/models/specialists/` — 4 specialist ONNX files confirmed present

### Secondary (MEDIUM confidence)
- CONTEXT.md locked decisions — all implementation decisions derived from user discussions in /gsd:discuss-phase session

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in project, no new dependencies required
- Architecture: HIGH — all integration points directly verified in source code; no guessing
- Pitfalls: HIGH — coherence range and cold-start issues derived from actual formula inspection + corpus size data
- EII-04 achievability: MEDIUM — depends on how noisy real persona data is vs synthetic experiment

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable domain — no external dependencies changing)
