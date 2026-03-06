---
phase: 12-template-engine
plan: 02
subsystem: ai
tags: [template-engine, compression, gtd, review-flow, offline]

# Dependency graph
requires:
  - phase: 12-template-engine plan 01
    provides: "templates.ts with generateCompressionExplanation, enrichTriggerQuestion, derivePatternSteps"
provides:
  - "compression.ts fully template-driven (zero AI calls, tiered confidence)"
  - "review-flow.ts GTD trigger prompts enriched with section context via templates"
  - "review-flow.ts pattern surfacing replaced with deterministic derivePatternSteps"
  - "store.ts updated buildGetCreativeSteps call passing atoms and inboxItems"
affects: [phase-13, phase-14, compression-coach-ui, guided-review-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Template-first: all structured text generated from signal data, no AI calls"
    - "Enrichment then template: enrich candidates with signals, then pass to template functions"
    - "Additive signature: new params appended before optional signal to minimize call site impact"

key-files:
  created: []
  modified:
    - src/ai/compression.ts
    - src/ai/review-flow.ts
    - src/ui/signals/store.ts

key-decisions:
  - "compression.ts dead code removed (buildCompressionBatchPrompt, parseCompressionBatchResponse, buildFallbackExplanations, tier1PreFilter) — all replaced by template path"
  - "useTieredPreFilter parameter removed from generateCompressionExplanations — no longer meaningful with no LLM batch"
  - "recentDecisions/recentInsights/phaseSummaries kept in buildGetCreativeSteps signature to minimize store.ts changes"
  - "generatePhaseSummary stays LLM-eligible — intentionally not replaced by templates"
  - "buildSectionContext uses sectionId field (confirmed in atoms.ts BaseAtomFields)"

patterns-established:
  - "Template wiring pattern: import named functions from templates.ts, pass EnrichedCandidate/SectionContext directly"
  - "Keep async on generateCompressionExplanations despite being synchronous — harmless, avoids breaking await at call sites"

requirements-completed: [TMPL-02, TMPL-03]

# Metrics
duration: 10min
completed: 2026-03-06
---

# Phase 12 Plan 02: Template Engine Wiring Summary

**Compression and GTD pattern surfacing replaced with template-driven local generation, completing full offline capability for all three structured output types (briefing, compression, GTD prompts)**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-06T02:23:00Z
- **Completed:** 2026-03-06T02:33:26Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- compression.ts: Removed LLM batch path entirely — all explanations generated via `generateCompressionExplanation`, `recommendCompressionAction`, `assessCompressionConfidence` from templates.ts. Confidence is now tiered (high/medium/low) instead of always 'low'
- review-flow.ts: GTD trigger prompts now enriched with real section names and activity counts via `enrichTriggerQuestion`. AI pattern surfacing try/catch block replaced with deterministic `derivePatternSteps` call
- store.ts: `buildGetCreativeSteps` call updated to pass `state.atoms` and `state.inboxItems` for template context

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire compression explanations to templates** - `e6bd885` (feat)
2. **Task 2: Wire GTD flow prompts to templates and update store call site** - `9f57e54` (feat)

**Plan metadata:** (created in final commit)

## Files Created/Modified

- `src/ai/compression.ts` - Removed 4 dead functions + LLM batch path; wired to templates.ts; removed dispatchAI and dispatchTiered imports; updated JSDoc
- `src/ai/review-flow.ts` - Added buildSectionContext helper; updated buildGetCreativeSteps signature with atoms/inboxItems params; trigger list uses enrichTriggerQuestion; pattern surfacing uses derivePatternSteps
- `src/ui/signals/store.ts` - Updated buildGetCreativeSteps call to pass state.atoms and state.inboxItems

## Decisions Made

- Removed `useTieredPreFilter` parameter from `generateCompressionExplanations` — it was only useful to reduce LLM batch size; with no LLM, it has no purpose
- Kept `recentDecisions`, `recentInsights`, `phaseSummaries` in `buildGetCreativeSteps` signature even though they're now unused in the pattern surfacing block — minimizes store.ts changes and they could serve future enhancements
- `generatePhaseSummary` intentionally left as LLM-eligible — it's a different concern (phase transition summary) that benefits from AI synthesis
- `buildSectionContext` uses `sectionId` field (confirmed from atoms.ts BaseAtomFields) not `sectionItemId` lookup

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. All source TS errors after changes were pre-existing (VoiceCapture.tsx SpeechRecognition types, node_modules type issues).

## Next Phase Readiness

- All three structured output types (briefing, compression, GTD prompts) are now fully template-driven and offline-capable
- Plan 12-03 (if any) can rely on compression.ts and review-flow.ts as clean, template-based modules
- 35 template tests pass confirming template function correctness

## Self-Check: PASSED

- FOUND: src/ai/compression.ts
- FOUND: src/ai/review-flow.ts
- FOUND: src/ui/signals/store.ts
- FOUND: .planning/phases/12-template-engine/12-02-SUMMARY.md
- FOUND commit: e6bd885 (Task 1 - compression template wiring)
- FOUND commit: 9f57e54 (Task 2 - GTD flow template wiring)

---
*Phase: 12-template-engine*
*Completed: 2026-03-06*
