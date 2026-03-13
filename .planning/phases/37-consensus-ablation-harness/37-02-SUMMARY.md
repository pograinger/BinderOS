---
phase: 37-consensus-ablation-harness
plan: "02"
subsystem: ai
tags: [eii, consensus, ablation, harness, onnx, specialist]

# Dependency graph
requires:
  - phase: 37-consensus-ablation-harness
    plan: "01"
    provides: computeEII, HarnessONNXSessions, loadSpecialistSessions, harness-types extensions
provides:
  - runHarnessConsensus() — production consensus wrapper for harness context (harness-consensus.ts)
  - computeHarnessImpact() — recall@k impact formula matching eii-experiment.py
  - deriveRiskLabels() — boolean risk labels from CorpusItem metadata
  - buildEIICurveSection(), buildEIISummaryTable(), buildCorrelationMatrix(), buildSpecialistAblationSection() (eii-report.ts)
  - runSpecialistAblation() — post-hoc leave-one-out specialist ablation (ablation-engine.ts)
  - SpecialistAblationResult interface
  - EIIReportData interface (write-reports.ts)
  - Wired adversarial cycle: per-cycle consensus + EII accumulation (run-adversarial.ts)
  - Post-experiment EII report: corpus curves, ablation, correlation matrix
  - cycleEII in checkpoint data (checkpoint-store.ts)
affects:
  - 38-risk-surface-proactive-alerts (can read EII report artifacts)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Harness consensus: direct computeConsensus() call (no Worker) — Node.js compatible
    - buildMinimalVector(): 84-dim vector from CorpusItem metadata, zero-pad person/calendar
    - Post-hoc ablation: filter specialistContributions, re-call computeConsensus() — zero re-inference
    - EII accumulation: per-cycle ConsensusResult[] stored in CycleState, accumulated in runPersonaAdversarial
    - Global EII: accumulated across all personas for correlation matrix and ablation
    - Cold-start guard: corpus curve subsets < 15 atoms skipped (N/A)
    - Graceful degradation: specialist session load failures skip consensus (non-fatal)

key-files:
  created:
    - scripts/harness/harness-consensus.ts
    - scripts/harness/eii-report.ts
  modified:
    - scripts/harness/ablation-engine.ts
    - scripts/harness/run-adversarial.ts
    - scripts/harness/write-reports.ts
    - scripts/harness/checkpoint-store.ts

key-decisions:
  - "buildMinimalVector() constructs 84-dim vector from CorpusItem metadata — zero-pads person/calendar dims (no per-item person/calendar data in harness corpus)"
  - "runSpecialistAblation() is post-hoc: zero re-inference cost, filters stored specialistContributions and re-calls computeConsensus()"
  - "cycleEII stored in checkpoint (4 numbers), full consensusResults[] lives only in memory — avoids checkpoint bloat (Research pitfall 5)"
  - "EII > 0.80 diagnostic flag applies only to 50+ atom personas — threshold is investigative, not a hard gate"
  - "globalConsensusResults accumulated across all personas for cross-persona correlation matrix and ablation"
  - "Graceful degradation: if ONNX model load fails, consensus pass is skipped per-cycle with warning"

requirements-completed: [EII-02, EII-03, EII-04]

# Metrics
duration: 13min
completed: 2026-03-13
---

# Phase 37 Plan 02: Harness EII Pipeline Summary

**EII measurement pipeline wired into adversarial harness: per-cycle consensus inference, specialist leave-one-out ablation, corpus size curves at 5 levels, and correlation matrix — three proof charts in ASCII**

## Performance

- **Duration:** 13 min
- **Started:** 2026-03-13T22:27:16Z
- **Completed:** 2026-03-13T22:40:30Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- `harness-consensus.ts`: `runHarnessConsensus()` calls specialist ONNX models directly via onnxruntime-node (no Worker). `deriveRiskLabels()` maps CorpusItem metadata (deadline proximity, waiting status, priority) to boolean risk labels. `computeHarnessImpact()` implements recall@k formula matching eii-experiment.py lines 527-546.
- `eii-report.ts`: Four pure ASCII report builders — `buildEIICurveSection()` with linear regression slope analysis and flat-component flagging, `buildEIISummaryTable()` with diagnostic threshold, `buildCorrelationMatrix()` for pairwise specialist agreement, `buildSpecialistAblationSection()` with consensus_lift table and delta chart.
- `ablation-engine.ts`: `SpecialistAblationResult` interface + `runSpecialistAblation()` — post-hoc leave-one-out filtering of stored `specialistContributions[]`. Zero re-inference cost. Computes `eiiDelta` (ablated-full, negative=contributing) and `consensusLift` (full EII - single-specialist EII). Sorted by `|eiiDelta|` descending.
- `run-adversarial.ts`: Loads specialist ONNX sessions once at startup. `buildMinimalVector()` constructs 84-dim canonical vector from CorpusItem metadata. After each adversarial cycle: runs consensus for all atoms, stores `cycleState.consensusResults` and `cycleState.cycleEII`. Post-experiment: computes corpus curves (5 levels, cold-start guard), specialist ablation, correlation matrix, writes `eii-report.json`. Passes `EIIReportData` to `writeExperimentReport`.
- `write-reports.ts`: `EIIReportData` interface added. `buildExperimentMarkdown()` accepts optional EII data and appends EII Summary Table, Corpus Curves, Ablation, Correlation Matrix, and Threshold Diagnostics sections.
- `checkpoint-store.ts`: `cycleEII` (4 numbers) added to `CycleCheckpointData.cycleState`. Full `consensusResults[]` excluded to prevent checkpoint bloat.

## Task Commits

Each task was committed atomically:

1. **Task 1: Harness consensus wrapper and EII report builders** - `2303851` (feat)
2. **Task 2: Specialist ablation engine and run-adversarial.ts integration** - `e136ebe` (feat)

## Files Created/Modified

- `scripts/harness/harness-consensus.ts` — runHarnessConsensus, deriveRiskLabels, computeHarnessImpact
- `scripts/harness/eii-report.ts` — 4 ASCII report builders (curve section, summary table, correlation matrix, ablation section)
- `scripts/harness/ablation-engine.ts` — SpecialistAblationResult + runSpecialistAblation() (post-hoc LOO)
- `scripts/harness/run-adversarial.ts` — session loading, buildMinimalVector(), per-cycle consensus pass, post-experiment EII report
- `scripts/harness/write-reports.ts` — EIIReportData interface, buildExperimentMarkdown EII sections
- `scripts/harness/checkpoint-store.ts` — cycleEII field in CycleCheckpointData

## Decisions Made

- `buildMinimalVector()` zero-pads person and calendar dims — harness corpus doesn't have individual person context or calendar state per item; task dims are derived from CorpusItem metadata (deadline, status, energy, waiting, priority)
- Post-hoc ablation reuses stored `specialistContributions[]` — no re-inference needed, filters and re-calls `computeConsensus()` directly
- Checkpoint stores only 4 numbers for cycleEII — full `ConsensusResult[]` excluded (Research pitfall 5: checkpoint bloat)
- EII > 0.80 is diagnostic for 50+ atom personas — flagged in report, not a hard gate, per EII-04 requirement
- Graceful degradation for ONNX load failures — consensus pass skipped with warning, run continues

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None — all TypeScript compilation errors in the modified files are pre-existing (in unmodified transitive dependencies). Dry-run verification passes cleanly. New code compiles without new errors under bundler moduleResolution.

## Next Phase Readiness

- Phase 38 (Risk Surface + Proactive Alerts) can read `eii-report.json` artifacts from experiment directories
- EII progression data in `PersonaAdversarialResult.eiiProgression` ready for risk surface consumers
- Full consensus results available per-cycle via `CycleState.consensusResults` for future analysis

---
*Phase: 37-consensus-ablation-harness*
*Completed: 2026-03-13*
