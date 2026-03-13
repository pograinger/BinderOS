---
gsd_state_version: 1.0
milestone: v5.5
milestone_name: Cortical Intelligence
status: planning
stopped_at: Completed 33-03-PLAN.md
last_updated: "2026-03-13T08:20:32.415Z"
last_activity: 2026-03-12 — Roadmap created for v5.5
progress:
  total_phases: 13
  completed_phases: 7
  total_plans: 21
  completed_plans: 20
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
| Phase 30-schema-bindertypeconfig-protocol P01 | 30 | 2 tasks | 14 files |
| Phase 30 P03 | 8 | 2 tasks | 11 files |
| Phase 30-schema-bindertypeconfig-protocol P02 | 25 | 2 tasks | 9 files |
| Phase 31-context-gate-evaluator P01 | 9 | 2 tasks | 7 files |
| Phase 31 P02 | 5 | 2 tasks | 4 files |
| Phase 32 P01 | 12 | 2 tasks | 8 files |
| Phase 32 P02 | 14 minutes | 2 tasks | 5 files |
| Phase 33 P01 | 11 | 3 tasks | 9 files |
| Phase 33 P02 | 30 | 2 tasks | 50 files |
| Phase 33-sequence-context-onnx-model P03 | 20 | 2 tasks | 26 files |

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
- [Phase 30]: BinderTypeConfigEntry stores full config as configJson blob string — enables harness injection without rebuild
- [Phase 30]: CompositorRuleConfig uses declarative AND/OR condition DSL — JSON is source of truth for Python training and TypeScript runtime
- [Phase 30]: GTD config split into 7 per-concern JSON files under gtd-personal/ — manifest-driven binder-type-as-plugin architecture
- [Phase 30]: staleDays stale-atom check stubbed as always-allow in historyPredicate — requires atom lastEnrichedAt timestamp in GateContext; deferred to Phase 31 when gate is wired into dispatchTiered()
- [Phase 30]: canActivate() is the single Phase 31 integration point — import from activation-gate.ts, call before handler loop in dispatchTiered() pre-filter
- [Phase 30]: Static imports not virtual module for binder-type JSON merge — Vite natively hot-reloads JSON files, no plugin complexity needed
- [Phase 30]: hydrateCompositorRules(configs) parameter pattern — cognitive-signals.ts never imports from binder-types, one-directional dep preserved
- [Phase 31]: TieredRequest.context is required (not optional) — TypeScript enforces caller migration in Plan 02
- [Phase 31]: isStale defaults false when lastEnrichedAt undefined — conservative, no re-enrichment without timestamp
- [Phase 32]: PER entity maps to missing-context in entityCategoryMap (not missing-delegation which is not in MissingInfoCategory)
- [Phase 32]: ScorerConfig interface separates pure-scorer config from BinderTypeConfig Zod schema — scorer stays pure without importing full schema type
- [Phase Phase 32]: createEnrichmentSession() remains synchronous — caller computes momentum before calling
- [Phase Phase 32]: prediction.json merge added to index.ts — was in manifest but not imported
- [Phase Phase 32]: Re-enrichment call sites use fallback path — momentum ordering set on initial wizard open
- [Phase 33]: Ring buffer module extracted as ring-buffer.ts for testability — embedding-worker.ts imports and delegates
- [Phase 33]: Simpler CLASSIFY_ONNX path: accepts optional binderId, worker concatenates sequence context internally — avoids separate GET_SEQUENCE_CONTEXT round-trip
- [Phase 33]: binderId passed via GateContext.customFields to tier2-handler — avoids changing GateContext interface for execution context data
- [Phase 33]: dynamo=True with fallback=True is stable LSTM ONNX export path — strict=False and strict=True both fail on dynamic axis, TorchScript legacy succeeds
- [Phase 33]: 45% zero-padded context training augmentation ensures cold-start robustness via single 512-dim model set
- [Phase 33]: Ablation result: KEEP 384-dim classifiers — mean F1 delta -0.0020, sequence context does not improve aggregate T2 accuracy
- [Phase 33]: Biggest sequence losers: collaboration-type (-0.0145) and time-estimate (-0.0202) — these rely on per-item semantics not sequence order

### Roadmap Evolution

- Phase 35 reshaped: Canonical Feature Vectors — structured per-atom-type vectors from metadata + sidecar + entities (EII experiment validated canonical vectors as more expressive than raw embeddings)
- Phase 36 reshaped: Specialist Consensus Layer — train specialist risk models on non-overlapping vector slices, consensus voter (EII experiment: +0.030 AUC lift from specialist consensus)
- Phase 37 reshaped: EII Diagnostic + Consensus Ablation — live Emergent Intelligence Index per binder, prove consensus on real harness data
- Phase 38 reshaped: Risk Surface + Proactive Alerts — first user-visible consumer of consensus, risk badges with explanations, staleness prediction
- [Phase 31]: Gate pre-filter: canActivate() before handler loop, blocked returns skip all handlers, gateResult on all responses
- [Phase 31]: triageInbox() gateContext param is optional at function signature, builds required GateContext internally — backwards compat without leaking TieredRequest types into function signature
- [Phase 31]: gateBlocked at classify-type level triggers silent continue in item loop, not onError — gate-blocking is intentional flow control
- [Phase 31]: buildHarnessGateContext() uses fixed timeOfDay=10 — ablation results must be deterministic regardless of wall-clock time

### Pending Todos

- Lightweight local computation validation sidecar (math.js + date-fns)
- Wolfram computation engine integration (local + cloud)
- Confirm PyTorch presence in .venv before Phase 33 begins: `python -c "import torch; print(torch.__version__)"`
- Profile Dexie compound query latency at 2,000+ entity rows before Phase 32 ships on low-end mobile

### Blockers/Concerns

(None currently)

## Session Continuity

Last session: 2026-03-13T08:13:29.005Z
Stopped at: Completed 33-03-PLAN.md
Resume file: None
Next action: `/gsd:plan-phase 30`
