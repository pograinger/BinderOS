---
gsd_state_version: 1.0
milestone: v5.5
milestone_name: Cortical Intelligence
status: planning
stopped_at: Phase 30 context gathered
last_updated: "2026-03-12T23:29:33.095Z"
last_activity: 2026-03-12 — Roadmap created for v5.5
progress:
  total_phases: 9
  completed_phases: 3
  total_plans: 11
  completed_plans: 10
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-12)

**Core value:** Every piece of stored information must encode predictive value about future actions, decisions, or understanding — if it doesn't change behavior, it's noise, and the system actively manages this boundary.
**Current focus:** v5.5 Cortical Intelligence — Phase 30 next

## Current Position

Phase: 30 (not started)
Plan: —
Status: Roadmap ready, awaiting phase planning
Last activity: 2026-03-12 — Roadmap created for v5.5

```
[Phase 30] [Phase 31] [Phase 32] [Phase 33] [Phase 34]
    [ ]         [ ]         [ ]         [ ]         [ ]
  0% ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 0%
```

## Performance Metrics

**Velocity:**
- Total plans completed: 76+ (across v1.0-v5.0)
- v4.0: 32 plans across 14 phases in 5 days
- v5.0: 11 plans across 4 phases in 2 days

**By Milestone:**

| Milestone | Phases | Plans | Duration |
|-----------|--------|-------|----------|
| v1.0 | 3 | 11 | - |
| v2.0 | 4 | 14 | 9 days |
| v3.0 | 3 | 8 | 2 days |
| v4.0 | 14 | 32 | 5 days |
| v5.0 | 4 | 11 | 2 days |
| v5.5 | 5 | TBD | in progress |

## Accumulated Context

### Decisions

Recent decisions affecting future work:
- [v5.0]: atomIntelligence sidecar separates AI knowledge from atom.content
- [v5.0]: Entity dedup via normalized text + alias resolution, not auto-merge by name alone
- [v5.0]: In-memory co-occurrence Map with periodic Dexie flush (avoids O(n^2) writes)
- [v5.0]: Harness-specific inference wrappers instead of DI params on production modules — production code stays clean
- [v5.0]: Enrichment quality scored by cloud (Sonnet rates 1-5 vs Haiku baseline)
- [v5.0]: Ablation reuses pre-generated corpora — no new API calls, only pipeline re-execution
- [v5.0]: Entity context enrichment is post-triage fire-and-forget — non-fatal, does not block triage
- [v5.0]: ONNX contextTag takes precedence; entity-derived tag only fills when ONNX produces none
- [HTM]: Adopt organizing principles (context gating, predictive enrichment, column protocol), NOT HTM algorithms
- [HTM]: Sequence learning is the one HTM concept worth stealing — atom sequence context for classifiers
- [v5.5]: BinderTypeConfig is the dependency unlock — Phase 30 must ship before any other v5.5 phase
- [v5.5]: Pre-loop filter in dispatchTiered() — never add session-state logic inside canHandle(); handlers stay pure
- [v5.5]: Sequence ONNX model runs in existing embedding worker (not a new worker) — avoids 4th concurrent ORT instance OOM on mobile
- [v5.5]: dynamo=True with opset 18 is the only stable PyTorch ONNX export path for LSTM with dynamic sequence length
- [v5.5]: Production MLP classifiers only replaced after harness ablation confirms F1 improvement
- [v5.5]: Prediction is lazy + TTL-cached, never timer-based — no background agents, no conductors

### Pending Todos

- Lightweight local computation validation sidecar (math.js + date-fns)
- Wolfram computation engine integration (local + cloud)
- Confirm PyTorch presence in .venv before Phase 33 begins: `python -c "import torch; print(torch.__version__)"`
- Profile Dexie compound query latency at 2,000+ entity rows before Phase 32 ships on low-end mobile

### Blockers/Concerns

(None currently)

## Session Continuity

Last session: 2026-03-12T23:29:33.093Z
Stopped at: Phase 30 context gathered
Resume file: .planning/phases/30-schema-bindertypeconfig-protocol/30-CONTEXT.md
Next action: `/gsd:plan-phase 30`
