# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-22)

**Core value:** Every piece of stored information must encode predictive value about future actions, decisions, or understanding — if it doesn't change behavior, it's noise, and the system actively manages this boundary.
**Current focus:** v2.0 AI Orchestration — Phase 4: AI Infrastructure

## Current Position

Phase: 4 of 7 (AI Infrastructure)
Plan: 2 of 3 in Phase 4 (complete)
Status: In progress
Last activity: 2026-02-23 — Phase 4 Plan 2 complete (LLM worker, BrowserAdapter, main-thread AI dispatch)

Progress: [████░░░░░░] 36% (v1.0 complete; v2.0 Phase 4 Plan 2/3 done)

## Performance Metrics

**Velocity (from v1.0):**
- Total plans completed: 12
- Average duration: 14 min
- Total execution time: ~169 min

**By Phase (v1.0):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation | 4/4 | 90 min | 23 min |
| 2. Compute Engine | 3/3 | 33 min | 11 min |
| 3. Pages/Nav/Search | 4/4 | 33 min | 8 min |

*v2.0 metrics will populate as phases complete*
| Phase 04 P01 | 7 min | 2 tasks | 7 files |
| Phase 04 P02 | 13 min | 2 tasks | 6 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v2.0]: Tiered LLM — SmolLM2 via Transformers.js for classification; Anthropic cloud API for conversational reviews
- [v2.0]: Dedicated llm-worker.ts separate from BinderCore worker — prevents OOM crashes and unblocks atom mutations during inference
- [v2.0]: GSD-style question flows as core AI interaction pattern (3-4 options + freeform)
- [v2.0]: Floating orb is the single AI entry point; AI mutations are additive, tagged, reversible
- [v2.0]: Phases 6 and 7 flagged for research before planning (review session schema; GTD question flow design)
- [04-01]: NoOpAdapter initialized in worker INIT handler for immediate pipeline verification on startup
- [04-01]: AIRequest.prompt typed as string (not Atom) — privacy boundary enforced at TypeScript compile time
- [04-01]: AI UI setters (setAIEnabled etc.) are pure local store state — settings persistence to Dexie deferred to Phase 5
- [04-02]: AI dispatch moved from BinderCore worker to main thread — BrowserAdapter cannot run in BinderCore worker without Transformers.js contamination
- [04-02]: GeneratorFn callable type alias for pipeline — ReturnType<typeof pipeline> too complex for TypeScript
- [04-02]: BrowserAdapter.onStatusChange optional callback pattern — avoids circular dependency between adapter and store

### Pending Todos

None.

### Blockers/Concerns

- [Build]: pnpm build:wasm requires LIB env var set to MSVC + Windows SDK paths on Windows
- [Phase 6]: Dexie schema for branching review session state needs design work before planning
- [Phase 7]: GTD question flow design (specific questions per phase, preventing Get Creative from becoming open-ended chat) needs deliberate design work before planning

## Session Continuity

Last session: 2026-02-23
Stopped at: Completed .planning/phases/04-ai-infrastructure/04-02-PLAN.md
Resume file: .planning/phases/04-ai-infrastructure/04-03-PLAN.md
