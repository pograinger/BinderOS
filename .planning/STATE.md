# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-22)

**Core value:** Every piece of stored information must encode predictive value about future actions, decisions, or understanding — if it doesn't change behavior, it's noise, and the system actively manages this boundary.
**Current focus:** v2.0 AI Orchestration — Phase 6 in progress (Plan 1 complete)

## Current Position

Phase: 6 of 7 (Review Pre-Analysis) — IN PROGRESS
Plan: 1 of 3 in Phase 6 (complete — analysis pipeline and atom schema done)
Status: Phase 6 Plan 1 complete — analysis atom type, Dexie v4, briefing pipeline, orb wiring
Last activity: 2026-02-25 — Phase 6 Plan 1 executed; analysis pipeline + store review state complete

Progress: [███████████░] 62% (v1.0 complete; v2.0 Phases 4-5 done; Phase 6 in progress)

## Performance Metrics

**Velocity (from v1.0):**
- Total plans completed: 19
- Average duration: ~12 min
- Total execution time: ~230 min

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

### Pending Todos

None.

### Blockers/Concerns

- [Build]: pnpm build:wasm requires LIB env var set to MSVC + Windows SDK paths on Windows
- [Phase 6]: Dexie schema for branching review session state needs design work before planning
- [Phase 7]: GTD question flow design (specific questions per phase, preventing Get Creative from becoming open-ended chat) needs deliberate design work before planning
- [UI/UX]: AISettingsPanel needs polish pass — user reported "very ugly and not intuitive"
- [AI]: SmolLM2 local LLM cannot produce reliable structured JSON for triage — acceptable limitation, cloud AI is the primary path

## Session Continuity

Last session: 2026-02-25
Stopped at: Completed 06-01-PLAN.md — analysis pipeline, Dexie v4, orb wiring complete
Next: Execute Phase 6 Plan 02 (ReviewBriefingView UI)
Resume file: .planning/phases/06-review-pre-analysis/06-01-SUMMARY.md
