# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-22)

**Core value:** Every piece of stored information must encode predictive value about future actions, decisions, or understanding — if it doesn't change behavior, it's noise, and the system actively manages this boundary.
**Current focus:** v2.0 — AI Orchestration (defining requirements)

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-02-22 — Milestone v2.0 started

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity (from v1.0):**
- Total plans completed: 11
- Average duration: 14 min
- Total execution time: ~156 min

**By Phase (v1.0):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation | 4/4 | 90 min | 23 min |
| 2. Compute Engine | 3/3 | 33 min | 11 min |
| 3. Pages/Nav/Search | 4/4 | 33 min | 8 min |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v2.0]: Tiered LLM — small WASM model for classification/tagging, cloud API for conversations/reviews
- [v2.0]: GSD-style question flows as core AI interaction pattern (3-4 options + freeform)
- [v2.0]: Floating orb — context-aware AI trigger + GTD menu, always available
- [v2.0]: AI mutations are additive and tagged — destructive changes require user approval
- [v2.0]: Changelog extended with source field to track AI vs user mutations
- [v2.0]: PARA views, sync, encryption deferred to v3.0+

### Pending Todos

None.

### Blockers/Concerns

- [Build]: pnpm build:wasm requires LIB env var set to MSVC + Windows SDK paths on Windows
- [v2.0]: Browser LLM model selection needs research — Phi-3-mini vs SmolLM vs TinyLlama, WASM vs WebGPU runtime

## Session Continuity

Last session: 2026-02-22
Stopped at: v2.0 milestone initialization — defining requirements
Resume file: .planning/PROJECT.md
