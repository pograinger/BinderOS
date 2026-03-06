# Phase 12: Template Engine - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Offline structured text generation for review briefings, compression explanations, and GTD flow prompts — all generated from entropy signals and store data without any LLM call. Templates become the primary path for structured outputs; LLM is reserved for open-ended tasks only.

</domain>

<decisions>
## Implementation Decisions

### Template tone & style
- Data-forward friendly tone: numbers first, but warm — "You have 5 stale tasks — 3 in Projects. Your system is getting noisy."
- Always use the user's actual section/project names when referencing specific items ("Website Redesign has no next action")
- Zero-state: skip empty sections entirely, show positive overall summary only if ALL sections empty ("Your system is clean — nothing needs attention right now.")
- Entropy display: words + numbers — "Needs attention (entropy: 72%)" for power user context

### LLM vs template routing
- Templates first for all structured outputs — always. LLM only for open-ended tasks (analyze-gtd, freeform questions)
- Template-only tasks: review briefings, compression explanations, GTD flow prompts. These NEVER route to LLM.
- No UI distinction between template-generated vs AI-generated content — it's all "the system" to the user

### Briefing summary sentence
- Entropy-driven template variants: 3-4 sentence templates selected by entropy level (healthy / needs-attention / overloaded), filled with real data counts
- Replaces the current AI-generated summary sentence in `analysis.ts` (line 159-168)

### GTD flow prompt depth
- Fully contextual: templates reference real section names and counts — "Health area has 0 active projects — anything to add?"
- Data-driven trigger list prompts: each GTD trigger prompt includes relevant atom counts and section state

### Claude's Discretion
- Exact template string construction (template literals vs Eta.js — whatever is simplest for the template count)
- File organization for templates (single file vs per-domain)
- How to handle edge cases in entropy-level classification thresholds
- Template variant selection logic

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `analysis.ts:generateBriefing()` — Pre-analysis phase is already deterministic (stale items, projects missing next actions, compression candidates). The `fallbackSummary` on line 150 is a prototype template.
- `compression.ts:buildFallbackExplanations()` (line 185-198) — Already generates signal-based explanations. This IS the template pattern, just needs formalization.
- `review-flow.ts:buildGetClearSteps()` — GTD flow step builders already construct steps from store data. Template prompts extend this pattern.
- `review-flow.ts:TRIGGER_PROMPTS` (line 19-27) — Existing trigger list with 7 GTD categories. Templates add data context to these.

### Established Patterns
- Pure modules: AI pipeline files (analysis.ts, compression.ts, review-flow.ts) import NO store — all state passed by caller. Templates must follow this pattern.
- `BriefingResult` interface — already includes `summaryText`, `staleItems`, `projectsMissingNextAction`, `compressionCandidates`. Template engine populates the same interface.
- `CompressionExplanation` interface — templates must produce the same shape as LLM responses.

### Integration Points
- `analysis.ts:generateBriefing()` — Replace the AI summary call (Phase 2) with template selection. Keep pre-analysis (Phase 1) unchanged.
- `compression.ts:generateCompressionExplanations()` — Replace LLM batch call with template generation for all candidates. `buildFallbackExplanations()` becomes the primary path.
- `review-flow.ts` phase builders — Inject store data (atom counts, section names, staleness stats) into step question text.
- `ReviewBriefingView.tsx` — No changes needed; it already renders `BriefingResult` regardless of source.
- `router.ts` / `tier2/` — Task routing needs to recognize template-eligible tasks and skip LLM dispatch entirely.

</code_context>

<specifics>
## Specific Ideas

- The existing `buildFallbackExplanations()` in compression.ts is already 80% of what's needed — formalize and enrich it rather than building from scratch
- Entropy-driven summary variants should feel like a dashboard status indicator, not an AI assistant talking to you
- GTD prompts should make the user feel like the system knows their data — "You haven't touched Finance in 3 weeks" is more valuable than "Any financial tasks?"

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 12-template-engine*
*Context gathered: 2026-03-05*
