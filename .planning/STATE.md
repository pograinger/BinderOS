# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-22)

**Core value:** Every piece of stored information must encode predictive value about future actions, decisions, or understanding — if it doesn't change behavior, it's noise, and the system actively manages this boundary.
**Current focus:** v2.0 AI Orchestration — Phase 6 complete (all 3 plans done)

## Current Position

Phase: 6 of 7 (Review Pre-Analysis) — COMPLETE
Plan: 3 of 3 in Phase 6 (complete — WebLLM migration, model selector)
Status: Phase 6 all plans complete — analysis pipeline, review page, WebLLM engine migration
Last activity: 2026-02-26 — Phase 6 Plan 3 executed; WebLLM replaces Transformers.js with structured JSON output + model selector

Progress: [████████████░] 67% (v1.0 complete; v2.0 Phases 4-6 done; Phase 7 remaining)

## Performance Metrics

**Velocity (from v1.0):**
- Total plans completed: 22
- Average duration: ~12 min
- Total execution time: ~240 min

**By Phase (v1.0):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation | 4/4 | 90 min | 23 min |
| 2. Compute Engine | 3/3 | 33 min | 11 min |
| 3. Pages/Nav/Search | 4/4 | 33 min | 8 min |

*v2.0 metrics:*
| Phase 04 P01 | 7 min | 2 tasks | 7 files |
| Phase 04 P02 | 13 min | 2 tasks | 6 files |
| Phase 04 P03 | 30 min | 3 tasks | 9 files |
| Phase 04 P04 | 5 min | 1 task | 2 files |
| Phase 05 P01 | 5 min | 2 tasks | 5 files |
| Phase 05 P02 | 8 min | 2 tasks | 10 files |
| Phase 05 P03 | 7 min | 2 tasks | 3 files |
| Phase 05 P04 | UAT session | 12 bugs fixed | 12 files |
| Phase 06 P01 | 9 min | 2 tasks | 9 files |
| Phase 06 P02 | 6 min | 2 tasks | 6 files |
| Phase 06 P03 | 10 min | 2 tasks | 7 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v2.0]: Tiered LLM — SmolLM2 via Transformers.js for classification; Anthropic cloud API for conversational reviews
- [v2.0]: Dedicated llm-worker.ts separate from BinderCore worker — prevents OOM crashes and unblocks atom mutations during inference
- [v2.0]: GSD-style question flows as core AI interaction pattern (3-4 options + freeform)
- [v2.0]: Floating orb is the single AI entry point; AI mutations are additive, tagged, reversible
- [v2.0]: Phases 6 and 7 flagged for research before planning (review session schema; GTD question flow design)
- [05-04]: showAISettings signal moved from Shell.tsx to store.ts — breaks circular dependency (Shell → AIOrb → AIRadialMenu → Shell)
- [05-04]: Cloud/Browser adapter activation wired via dynamic imports in store.ts — activateCloudAdapter() and activateBrowserLLM() called on toggle, key save, and hydration
- [05-04]: SmolLM2 too small for structured JSON triage output — cloud AI is primary triage path; local LLM suited for simpler tasks
- [05-04]: Model ID must be fully qualified (claude-haiku-4-5-20251001 not claude-haiku-4-5)
- [05-04]: Triage action navigates to inbox before triggering startTriageInbox()
- [06-01]: Analysis atoms excluded from WASM scoring — AI-generated metadata records, not user content to score
- [06-01]: No Dexie index changes for v4 migration — existing type index already covers 'analysis' value
- [06-01]: generateBriefing uses single cloud AI call (max 100 tokens) with fallback template string on failure
- [06-01]: Projects-without-next-action check scoped to sectionItems in the projects section only
- [06-03]: WebLLM uses MLCEngineInterface (not MLCEngine) — CreateWebWorkerMLCEngine returns WebWorkerMLCEngine
- [06-03]: @huggingface/transformers kept alongside @mlc-ai/web-llm — embedding-worker.ts needs it for MiniLM semantic search
- [06-03]: chatCompletion() with stream: false used for typed non-streaming response (not chat.completions.create)
- [06-03]: src/ai/llm-worker.ts is new WebLLM worker path; old src/worker/llm-worker.ts kept for legacy llm-bridge.ts
- [Phase 06-02]: Session hydration loads async after READY (not via worker payload) — keeps worker simple and consistent with other UI-only state
- [Phase 06-02]: AIOrb resume path uses setActivePage only since READY handler already restores state.reviewBriefing+reviewStatus from session

### Pending Todos

None.

### Blockers/Concerns

- [Build]: pnpm build:wasm requires LIB env var set to MSVC + Windows SDK paths on Windows
- [Phase 7]: GTD question flow design (specific questions per phase, preventing Get Creative from becoming open-ended chat) needs deliberate design work before planning
- [Cleanup]: src/worker/llm-worker.ts (Transformers.js based) is now dead code for AI path — should be removed when llm-bridge.ts is retired

## Session Continuity

Last session: 2026-02-26
Stopped at: Completed 06-02-PLAN.md — ReviewBriefingView, session persistence, orb badge dot (previously skipped)
Next: /gsd:plan-phase 7
Resume file: .planning/phases/06-review-pre-analysis/06-02-SUMMARY.md
