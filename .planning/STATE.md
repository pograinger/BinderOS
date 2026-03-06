---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: Device-Adaptive AI
status: active
stopped_at: null
last_updated: "2026-03-05"
last_activity: 2026-03-05 — Milestone v4.0 started
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-05)

**Core value:** Every piece of stored information must encode predictive value about future actions, decisions, or understanding — if it doesn't change behavior, it's noise, and the system actively manages this boundary.
**Current focus:** Defining requirements for v4.0 Device-Adaptive AI

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-03-05 — Milestone v4.0 started

## Accumulated Context

### Architecture (post v3.0)
- 28,169 LOC across TS/TSX/Python/CSS
- 3 workers: BinderCore, LLM/WebLLM, Embedding/MiniLM+ONNX
- 3 AI adapters: NoOp, Browser (WebLLM), Cloud (Anthropic)
- Tiered pipeline: Tier 1 deterministic → Tier 2 ONNX classifier → Tier 3 LLM
- Python training pipeline in scripts/train/ (4 scripts, reproducible)
- Cache API for ONNX model persistence

### Blockers/Concerns

- Production COOP/COEP header configuration must be verified against actual hosting environment
- Tier restructure: current Tier 1 (deterministic) → local LLM, current Tier 3 (single provider) → multi-provider

### Pending Todos

None.

## Session Continuity

Last session: 2026-03-05
Stopped at: Milestone v4.0 requirements definition
Resume file: None
