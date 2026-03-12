---
phase: 29-entity-consumers-trained-agent-validation
plan: 03
subsystem: harness
tags: [ablation-testing, pattern-tuning, investment-report, enrichment-quality, orchestration]
dependency_graph:
  requires: [29-01]
  provides: [ablation-engine, auto-tune-patterns, investment-report, enrichment-quality-comparison]
  affects: [run-adversarial, write-reports, score-graph, harness-types]
tech_stack:
  added: []
  patterns: [ablation-testing, cross-persona-pattern-optimization, impact-complexity-matrix, enrichment-quality-comparison, learning-curve-classification]
key_files:
  created:
    - scripts/harness/ablation-engine.ts
    - scripts/harness/auto-tune-patterns.ts
    - scripts/harness/generate-investment-report.ts
  modified:
    - scripts/harness/adversarial-cycle.ts (enrichment quality comparison, enrichmentQualityScore on CycleState)
    - scripts/harness/enrichment-emulator.ts (compareEnrichmentQuality, emulateBaselineEnrichmentSession)
    - scripts/harness/harness-types.ts (enrichmentQualityScore field on CycleState)
    - scripts/harness/score-graph.ts (computeAblationDelta, rankComponents re-exports)
    - scripts/harness/run-adversarial.ts (post-run analysis phase, --skip-ablation, --skip-report flags)
    - scripts/harness/write-reports.ts (ablation section, learning curve classification, classifyLearningCurve export)
decisions:
  - "ablation-engine.ts: reuses pre-generated corpora from full run — no new API calls for corpus generation, only pipeline re-execution"
  - "ablation-engine.ts: selectRepresentativePersonas picks 1 low-complexity + 1 high-complexity persona for cost control (2 of N)"
  - "ablation-engine.ts: 3 cycles instead of 5 for ablation runs — sufficient signal with lower cost"
  - "enrichment-quality comparison sampled on first 3 atoms of cycle 1 only — Sonnet rates 1-5, baseline uses Haiku without entity context"
  - "auto-tune-patterns.ts: precision > 70% boosts confidenceBase +0.05 (capped 0.95), < 40% halves and flags — threshold based on research guidance"
  - "generate-investment-report.ts: 7 report sections synthesized from experiment + ablation + tune result data"
  - "run-adversarial.ts post-run analysis is non-fatal — ablation/tune/report failures are caught and logged, CI pass/fail determined solely by persona F1"
metrics:
  duration: "~10 minutes"
  completed_date: "2026-03-12"
  tasks_completed: 2
  files_changed: 9
---

# Phase 29 Plan 03: Ablation, Auto-Tune, and Investment Report Summary

Ablation testing framework, cross-persona pattern optimization, enrichment quality comparison, and investment report with impact+complexity matrix — transforming raw harness results into actionable intelligence.

## What Was Built

### Task 1: Ablation engine and enrichment quality comparison

**ablation-engine.ts** — Component ablation testing:
- `runAblation()`: Re-runs cycles with one component disabled using pre-generated corpora (no new corpus API calls)
- `runFullAblationSuite()`: Tests 5 components (keyword-patterns, co-occurrence, enrichment-mining, user-corrections, recency-decay) on 2 representative personas (low + high complexity) with 3 cycles
- `selectRepresentativePersonas()`: Picks lowest and highest complexity personas by GT relationship count
- `computeAblationDelta()`: Per-metric delta (entityF1, relationshipF1, privacyScore, overallImpact)
- `rankComponents()`: Sorts by absolute impact score — largest delta = most load-bearing component

**enrichment-emulator.ts additions:**
- `compareEnrichmentQuality()`: Sonnet rates 1-5 how much entity context improved enrichment vs baseline
- `emulateBaselineEnrichmentSession()`: Generates Haiku enrichment answers WITHOUT entity context injected

**adversarial-cycle.ts modifications:**
- Samples 3 atoms from cycle 1 only for quality comparison (cost control)
- Only compares when entity summary is available (entity graph has content)
- `enrichmentQualityScore` (average 1-5) added to CycleState

**harness-types.ts:**
- `enrichmentQualityScore?: number` field added to CycleState interface

**score-graph.ts:**
- `computeAblationDelta()` and `rankComponents()` re-exported for convenience

### Task 2: Auto-tune patterns, investment report, full orchestration

**auto-tune-patterns.ts** — Cross-persona pattern optimization:
- `autoTunePatterns()`: Reads relationship-patterns.json, estimates per-pattern precision from ComponentAttribution data
- Precision > 70% → boost confidenceBase +0.05; Precision < 40% → halve confidence + add `low-precision` flag
- `collectMissedRelationships()`: Aggregates final-cycle gaps across all personas, finds systemic gaps
- `suggestPatternsForGap()`: Sonnet analyzes missed corpus items and suggests new keyword patterns
- Writes `scripts/harness/tuned-patterns.json` (adjusted patterns + `_tuning` metadata block)
- Writes `scripts/harness/pattern-suggestions.json` (new patterns from analysis)

**generate-investment-report.ts** — Actionable investment recommendations:
- `generateInvestmentReport()`: 7-section Markdown report synthesizing all experiment data
- Section 1 (Executive Summary): pass/fail, aggregate metrics, learning curve shape
- Section 2 (Component Attribution): ablation ranking table + source breakdown chart
- Section 3 (Gap Analysis): most commonly missed relationship types + underperforming personas
- Section 4 (Recommendations): ranked InvestmentItem list with expectedAccuracyGain + implementationComplexity
- Section 5 (Pattern Tuning Summary): flagged/boosted patterns, suggested new keywords table
- Section 6 (Cross-Persona Consistency): stdDev analysis, identifies underperformers
- Section 7 (Enrichment Quality): entity context injection value with 1-5 score
- CLI `--dry-run` flag validates schema without API calls

**run-adversarial.ts additions:**
- Post-run analysis phase after all personas complete: (1) ablation suite, (2) auto-tune patterns, (3) investment report
- `--skip-ablation` flag skips ablation for faster runs
- `--skip-report` flag skips investment report generation
- Saves `ablation-results.json` and `tuned-patterns.json` to experiment directory
- All post-run failures are non-fatal — logged but don't affect CI exit code

**write-reports.ts additions:**
- `classifyLearningCurve()`: 'healthy-logarithmic' | 'early-saturation' | 'degradation' based on F1 progression
- `buildAblationSection()`: Component ranking table + ASCII delta chart for RelF1 impact
- Optional `ablation?: AblationSuiteResult` param on `writeExperimentReport()`
- Learning curve labels appended to persona headers in Markdown output

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Duplicate PersonaConfig import in run-adversarial.ts**
- **Found during:** Task 2 TypeScript compilation check
- **Issue:** PersonaConfig was imported twice (line 43 and 63) after adding the new import at the bottom
- **Fix:** Removed the duplicate import at line 63
- **Files modified:** run-adversarial.ts

**2. [Rule 1 - Bug] componentRanking in Pick<> type argument**
- **Found during:** Task 2 TypeScript compilation
- **Issue:** `rankComponents()` accepts `Pick<AblationSuiteResult, 'perComponentResults' | 'fullRunScores'>` but call site was passing `componentRanking: []` in the object (not in the Pick)
- **Fix:** Removed `componentRanking: []` from the call site argument
- **Files modified:** ablation-engine.ts

## Self-Check: PASSED

- All 3 new files exist on disk: ablation-engine.ts, auto-tune-patterns.ts, generate-investment-report.ts
- All 6 modified files updated: adversarial-cycle.ts, enrichment-emulator.ts, harness-types.ts, score-graph.ts, run-adversarial.ts, write-reports.ts
- `npx tsx -e "import { runFullAblationSuite } from './scripts/harness/ablation-engine.js'; console.log('ablation OK')"` → ablation OK
- `npx tsx scripts/harness/generate-investment-report.ts --dry-run` → dry-run PASSED
- All imports resolve: ablation-engine, auto-tune-patterns, generate-investment-report, write-reports
- `grep "runFullAblationSuite" run-adversarial.ts` → found (imported + called)
- `grep "autoTunePatterns" run-adversarial.ts` → found (imported + called)
- Task 1 commit: 98e912a
- Task 2 commit: 14ead15
