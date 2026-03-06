# Phase 12: Template Engine - Research

**Researched:** 2026-03-05
**Domain:** Deterministic text generation from entropy signals — pure TypeScript template functions replacing LLM calls for structured output
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Template tone and style:** Data-forward friendly tone — numbers first, but warm. "You have 5 stale tasks — 3 in Projects. Your system is getting noisy."
- **Actual names always:** Always use the user's actual section/project names when referencing specific items ("Website Redesign has no next action")
- **Zero-state behavior:** Skip empty sections entirely; show positive overall summary only if ALL sections empty ("Your system is clean — nothing needs attention right now.")
- **Entropy display:** Words + numbers — "Needs attention (entropy: 72%)" for power user context
- **LLM vs template routing:** Templates first for all structured outputs — always. LLM only for open-ended tasks (analyze-gtd, freeform questions). Template-only tasks: review briefings, compression explanations, GTD flow prompts. These NEVER route to LLM.
- **No UI distinction:** No UI distinction between template-generated vs AI-generated content — it's all "the system" to the user
- **Briefing summary sentence:** Entropy-driven template variants — 3-4 sentence templates selected by entropy level (healthy / needs-attention / overloaded), filled with real data counts. Replaces the current AI-generated summary sentence in `analysis.ts` (line 159-168).
- **GTD flow prompt depth:** Fully contextual — templates reference real section names and counts. "Health area has 0 active projects — anything to add?" Data-driven trigger list prompts.

### Claude's Discretion
- Exact template string construction (template literals vs Eta.js — whatever is simplest for the template count)
- File organization for templates (single file vs per-domain)
- How to handle edge cases in entropy-level classification thresholds
- Template variant selection logic

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TMPL-01 | User receives weekly review briefings generated from entropy signals without any LLM call | Findings: Remove the `anyAIAvailable()` guard from `startReviewBriefing()`, replace Phase 2 AI summary call in `generateBriefing()` with entropy-level template selection |
| TMPL-02 | User receives compression explanations generated from staleness signals without any LLM call | Findings: `buildFallbackExplanations()` in `compression.ts` already does 80% of this — formalize and enrich it, route `generateCompressionExplanations()` to template path instead of LLM |
| TMPL-03 | GTD flow prompts (Get Clear/Current/Creative) render from computed data without any LLM call | Findings: `buildGetClearSteps()` and `buildGetCurrentSteps()` already have no AI calls — enrich their question text with data context; replace pattern-surfacing AI call in `buildGetCreativeSteps()` with deterministic data patterns |
</phase_requirements>

---

## Summary

Phase 12 is an internal plumbing phase: no new UI surfaces, no new data types, no new dependencies. The work is to replace three LLM call sites with deterministic template functions that consume data already computed upstream. The codebase already has working fallback implementations for all three output types — the task is to formalize and enrich them into primary paths, then remove the AI guards that prevent these flows from running without an adapter.

The key architectural insight is that `generateBriefing()`, `generateCompressionExplanations()`, and `buildGetCreativeSteps()` are all pure functions receiving pre-computed data. Templates slot in as pure data-to-string transforms at specific insertion points. No store changes, no new worker messages, no DB schema changes are required.

The largest single change is in `store.ts`: removing the `anyAIAvailable()` guard from `startReviewBriefing()` (line 1094) and `startGuidedReview()` (line 1268), which currently block the entire review flow when no AI adapter is set.

**Primary recommendation:** Implement as three focused file changes — one new `src/ai/templates.ts` module containing all template functions, then targeted edits to `analysis.ts`, `compression.ts`, `review-flow.ts`, and `store.ts`.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript template literals | Native | String interpolation for template output | Already in use everywhere — zero new dependencies |
| `EntropyScore` type | Existing | Drives template variant selection (green/yellow/red) | Already computed by WASM engine, passed to `generateBriefing()` |
| `BriefingResult` interface | Existing | Output shape — templates must match this exactly | Consumed by `ReviewBriefingView.tsx` without modification |
| `CompressionExplanation` interface | Existing | Output shape — templates must match this exactly | Consumed by staging area / proposal builder in store |

### No New Dependencies

The user decision grants discretion between template literals and Eta.js. The verdict is: **use template literals only**. Eta.js adds 3KB gzip, requires a new import, and is only justified when template count is large enough to benefit from a template file format. With 3-4 summary variants + enrichment functions, template literals are cleaner and match the existing codebase patterns exactly. Every existing fallback in the codebase (e.g., `buildFallbackExplanations()`, `fallbackSummary`, `FALLBACK_QUESTIONS`) uses template literals.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Template literals | Eta.js / Handlebars | Not worth it at this template count; adds a runtime dependency |
| Template literals | Mustache | Same as above — overkill for this use case |
| Single `templates.ts` file | Per-domain files (briefing-templates.ts, etc.) | Single file is simpler at this scale; split later if it grows |

**Installation:**
```bash
# No new packages required
```

## Architecture Patterns

### Recommended Project Structure
```
src/ai/
├── templates.ts          # NEW: all template functions for Phase 12
├── analysis.ts           # EDIT: replace Phase 2 AI call with template
├── compression.ts        # EDIT: formalize buildFallbackExplanations as primary path
├── review-flow.ts        # EDIT: enrich step questions + replace pattern surfacing
└── router.ts             # UNCHANGED
src/ui/signals/
└── store.ts              # EDIT: remove anyAIAvailable() guards from review functions
```

### Pattern 1: Entropy-Level Template Selection

**What:** Select from 3-4 pre-written summary templates based on `EntropyScore.level`, then fill in actual counts.
**When to use:** Replacing the `generateBriefing()` Phase 2 AI call (analysis.ts lines 159-189).

```typescript
// src/ai/templates.ts
// Source: codebase — EntropyScore.level is 'green' | 'yellow' | 'red' (src/types/config.ts:29)

export function generateBriefingSummary(
  entropyScore: EntropyScore | null,
  staleCount: number,
  missingNextActions: number,
  compressionCount: number,
  totalAtoms: number,
): string {
  const level = entropyScore?.level ?? 'yellow';
  const entropyPct = entropyScore ? Math.round(entropyScore.score) : null;
  const entropyLabel = entropyPct != null ? ` (entropy: ${entropyPct}%)` : '';

  if (level === 'green') {
    if (staleCount === 0 && missingNextActions === 0 && compressionCount === 0) {
      return 'Your system is clean — nothing needs attention right now.';
    }
    return `System health is good${entropyLabel}. ${staleCount > 0 ? `${staleCount} item${staleCount === 1 ? '' : 's'} could use a touch. ` : ''}${missingNextActions > 0 ? `${missingNextActions} project${missingNextActions === 1 ? '' : 's'} missing a next action. ` : ''}You're in good shape.`;
  }

  if (level === 'yellow') {
    return `You have ${staleCount} stale item${staleCount === 1 ? '' : 's'} and ${missingNextActions} project${missingNextActions === 1 ? '' : 's'} missing next actions. Needs attention${entropyLabel}.`;
  }

  // 'red' — overloaded
  return `System load is high${entropyLabel}. ${staleCount} stale items, ${missingNextActions} projects with no next action, and ${compressionCount} compression candidates. Your system is getting noisy.`;
}
```

### Pattern 2: Signal-Enriched Compression Explanation

**What:** Formalize and enrich the existing `buildFallbackExplanations()` to be the primary path. Add more specific signals: last-accessed date (formatted), link density description, similarity context.
**When to use:** Replacing the LLM batch call in `generateCompressionExplanations()`.

```typescript
// src/ai/templates.ts
// Source: existing buildFallbackExplanations() pattern in compression.ts lines 185-198

export function generateCompressionExplanation(c: EnrichedCandidate): string {
  const lastAccessed = new Date(c.atom.updated_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  });
  const orphaned = c.linkCount === 0 ? ', with no links to other items' : '';
  const similarity = c.similarAtomTitles.length > 0
    ? ` There ${c.similarAtomTitles.length === 1 ? 'is' : 'are'} ${c.similarAtomTitles.length} similar item${c.similarAtomTitles.length === 1 ? '' : 's'} that may overlap.`
    : '';
  const decision = c.relatedDecisionTitles.length > 0
    ? ` A related decision ("${c.relatedDecisionTitles[0]}") may have superseded this.`
    : '';

  return `Last touched ${lastAccessed} — stale for ${c.staleDays} days${orphaned}.${similarity}${decision}`;
}

export function recommendCompressionAction(c: EnrichedCandidate): CompressionExplanation['recommendedAction'] {
  if (c.staleDays > 60 && c.linkCount === 0) return 'archive';
  if (c.similarAtomTitles.length >= 2) return 'tag-someday';
  if (c.relatedDecisionTitles.length > 0) return 'archive';
  return 'tag-someday';
}

export function assessCompressionConfidence(c: EnrichedCandidate): CompressionExplanation['confidence'] {
  if (c.staleDays > 90 && c.linkCount === 0) return 'high';
  if (c.staleDays > 30 && c.linkCount <= 1) return 'medium';
  return 'low';
}
```

### Pattern 3: Context-Aware GTD Prompt Enrichment

**What:** Inject real counts and section names into the trigger list prompts and area gap steps. Replace pattern-surfacing AI call with a deterministic "patterns derived from atom counts and section load" function.
**When to use:** Enriching `buildGetCreativeSteps()` trigger prompts and replacing the `dispatchAI()` call inside it.

```typescript
// src/ai/templates.ts
// Source: existing TRIGGER_PROMPTS pattern in review-flow.ts lines 19-27

interface SectionContext {
  section: Section;
  activeTaskCount: number;
  activeProjectCount: number;
  daysSinceLastActivity: number;
}

export function enrichTriggerQuestion(
  triggerLabel: string,
  triggerDescription: string,
  relevantSectionCtx: SectionContext | null,
): string {
  if (!relevantSectionCtx) {
    return `${triggerLabel}: ${triggerDescription} — anything to capture?`;
  }

  const { section, activeTaskCount, daysSinceLastActivity } = relevantSectionCtx;
  const notTouched = daysSinceLastActivity > 14
    ? ` You haven't touched ${section.name} in ${daysSinceLastActivity} days.`
    : '';

  if (activeTaskCount === 0) {
    return `${section.name} has no active tasks.${notTouched} Anything to add?`;
  }

  return `${section.name} (${activeTaskCount} active).${notTouched} ${triggerDescription} — anything new to capture?`;
}

export function derivePatternSteps(
  sections: Section[],
  atoms: Atom[],
  inboxCount: number,
): ReviewFlowStep[] {
  // Deterministic patterns from atom load and section state
  const patterns: Array<{ observation: string; suggestion: string }> = [];

  // Pattern: high inbox load
  if (inboxCount > 10) {
    patterns.push({
      observation: `Inbox has ${inboxCount} unprocessed items`,
      suggestion: 'Consider a focused processing session to clear your capture queue',
    });
  }

  // Pattern: sections with zero active projects
  const emptySections = sections.filter(s =>
    s.type !== 'projects' &&
    !atoms.some(a => a.sectionId === s.id && a.status === 'open')
  );
  if (emptySections.length > 0) {
    const names = emptySections.map(s => s.name).join(', ');
    patterns.push({
      observation: `${names} ${emptySections.length === 1 ? 'has' : 'have'} no active items`,
      suggestion: 'Review whether these areas need attention or are intentionally quiet',
    });
  }

  return patterns.slice(0, 3).map(p => ({
    stepId: `get-creative-pattern-${crypto.randomUUID().slice(0, 8)}`,
    phase: 'get-creative' as const,
    question: `Pattern: ${p.observation}`,
    options: [
      {
        id: 'capture',
        label: 'Capture this insight',
        description: p.suggestion,
        stagingAction: { type: 'capture' as const, content: p.suggestion },
      },
      {
        id: 'skip',
        label: 'Skip',
        stagingAction: { type: 'skip' as const },
      },
    ],
    allowFreeform: true,
  }));
}
```

### Anti-Patterns to Avoid

- **Calling templates from inside the store:** Templates must remain pure functions receiving data as parameters (matches existing pure module pattern). Never import `state` from `store.ts` inside `templates.ts`.
- **Changing BriefingResult or CompressionExplanation shape:** `ReviewBriefingView.tsx` and the staging area consume these interfaces. Any shape change would require UI work outside this phase's scope.
- **Adding an `isTemplateGenerated: boolean` flag:** CONTEXT.md explicitly decided there should be no UI distinction between template and LLM output. Don't add provenance tracking to the output types.
- **Leaving the anyAIAvailable() guard on startReviewBriefing:** The guard was only valid when Phase 2 required an AI call. After Phase 12, the briefing pipeline is fully synchronous — the guard must be removed or the whole offline flow fails.
- **Removing the AI path from review-flow.ts buildGetCreativeSteps entirely:** The pattern-surfacing step is replaced with deterministic patterns, but the phase summary call at phase transitions (`generatePhaseSummary`) is NOT in scope — it's for a different task ("analyze-gtd" is LLM-eligible per CONTEXT.md).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Entropy level thresholds | Custom scoring formula | Existing `EntropyScore.level` from WASM engine | Already calibrated; 'green'/'yellow'/'red' is the correct abstraction |
| Staleness date formatting | Custom date diff display | `new Date(atom.updated_at).toLocaleDateString()` | Consistent with existing `ReviewView.tsx` `lastEditDate` (line 239) |
| Compression recommendation logic | Decision tree | Enriched `recommendCompressionAction()` from existing `buildFallbackExplanations()` logic | The heuristic (`staleDays > 60 && linkCount === 0 → archive`) already exists and is correct |
| Section name lookup | New store query | Already passed via `sections` parameter to calling functions | The pure module pattern passes all needed data from caller |

**Key insight:** Every data element needed for templates is already computed and passed as parameters to the three target functions. No new data wiring is required.

## Common Pitfalls

### Pitfall 1: The anyAIAvailable() Guard
**What goes wrong:** After removing the AI call from `generateBriefing()`, the guard at line 1094 of `store.ts` still short-circuits the whole flow and returns an error when no AI adapter is configured. The briefing never runs.
**Why it happens:** The guard was added when Phase 2 (AI summary) was mandatory. It's now dead code that blocks the primary use case.
**How to avoid:** Remove the guard entirely from `startReviewBriefing()`. The function now runs purely on local data. Do the same for `startGuidedReview()` at line 1268 — GTD flow prompts are now template-driven.
**Warning signs:** User on mobile with no AI enabled sees "No AI adapter available" error when starting review.

### Pitfall 2: AbortSignal Threading
**What goes wrong:** `generateCompressionExplanations()` accepts an `AbortSignal` and re-throws `AbortError`. If the template path doesn't check the signal, cancellation stops working.
**Why it happens:** Removing the async AI call also removes the natural abort check point.
**How to avoid:** Keep the `signal?.aborted` check before the template generation loop in `generateCompressionExplanations()`. Template path is synchronous but the function must still honor the abort contract.

### Pitfall 3: Zero-State Template Logic
**What goes wrong:** Template generates "0 stale items, 0 projects..." text even when all values are zero, rather than the clean-state message.
**Why it happens:** Template function has a generic fill-in-the-blanks structure that doesn't branch for the all-zero case.
**How to avoid:** Check for all-zero condition first and return the positive clean-state string. CONTEXT.md locked this: "skip empty sections entirely, show positive overall summary only if ALL sections empty."
**Warning signs:** User with a clean system sees "You have 0 stale tasks..." instead of "Your system is clean."

### Pitfall 4: Compression Confidence Inflation
**What goes wrong:** Template path always returns `confidence: 'low'` (from the existing fallback), making all proposals appear uncertain even for obvious candidates (90+ days stale, zero links).
**Why it happens:** `buildFallbackExplanations()` hard-codes `confidence: 'low' as const` (line 196). This was appropriate as a fallback but not as the primary path.
**How to avoid:** Implement `assessCompressionConfidence()` with the tiered logic shown above. High confidence for very clear-cut cases (>90 days, orphaned).

### Pitfall 5: GTD buildGetCreativeSteps Still Calls dispatchAI
**What goes wrong:** After Phase 12, the Get Creative phase still fires an AI call for pattern surfacing, which means it still requires an AI adapter and can fail offline.
**Why it happens:** The AI call is buried inside `buildGetCreativeSteps()` in a try/catch. The catch currently swallows the error and continues, but it still attempts the dispatch.
**How to avoid:** Replace the entire try/catch AI call block with `derivePatternSteps()`. Remove the `dispatchAI` import from `review-flow.ts` if it's only used there after the change. Check if `generatePhaseSummary()` still uses it — if so, keep the import.
**Warning signs:** Network tab shows requests to AI adapter during Get Creative phase even after Phase 12.

### Pitfall 6: Removing the "AI" Badge from ReviewBriefingView
**What goes wrong:** `ReviewBriefingView.tsx` renders `<span class="analysis-ai-badge">AI</span>` on each briefing section card. CONTEXT.md says no UI distinction — but this badge is currently always shown regardless of source.
**Why it happens:** Temptation to remove the badge as part of "making it non-AI." But the decision is "no UI distinction" meaning the user doesn't need to know whether it came from LLM or templates — the badge can remain.
**How to avoid:** Do NOT change `ReviewBriefingView.tsx`. The badge means "system-generated" to the user, not "LLM." Leave it as-is.

### Pitfall 7: Template Variants Don't Cover 'null' Entropy
**What goes wrong:** `entropyScore` can be `null` (line 63 of `analysis.ts`). Template falls back to 'yellow' level but omits the entropy percentage — which is correct. But if the null case produces a generic string that references a missing number, it crashes.
**Why it happens:** Template string uses `entropyScore.score` without null-checking.
**How to avoid:** Guard `entropyPct` calculation with null check. The pattern `const entropyPct = entropyScore ? Math.round(entropyScore.score) : null` handles this, and `entropyLabel` becomes empty string when null.

## Code Examples

### Integration Point 1: Replacing the AI Summary Call in analysis.ts

```typescript
// analysis.ts — replace lines 159-189 with:
// Source: existing analysis.ts structure, template from templates.ts

import { generateBriefingSummary } from './templates';

// (inside generateBriefing, after Phase 1 pre-analysis)
const openTaskCount = atoms.filter(
  (a) => a.type === 'task' && (a.status === 'open' || a.status === 'in-progress'),
).length;

// Phase 2: Template summary (no AI call)
const summaryText = generateBriefingSummary(
  entropyScore,
  staleItems.length,
  projectsMissing.length,
  compressionCandidates.length,
  atoms.filter(a => a.type !== 'analysis').length,
);

return {
  summaryText,
  staleItems,
  projectsMissingNextAction: projectsMissing,
  compressionCandidates,
  generatedAt: now,
};
// Remove: try/catch dispatchAI block, fallbackSummary variable
// Remove: import { dispatchAI } from './router' (if no longer used)
```

### Integration Point 2: Replacing the LLM Batch Call in compression.ts

```typescript
// compression.ts — replace lines 299-321 with:
// Source: existing generateCompressionExplanations() structure

import { generateCompressionExplanation, recommendCompressionAction, assessCompressionConfidence } from './templates';

// Inside generateCompressionExplanations(), after enrichment:
if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

onProgress?.(enriched.length, enriched.length);
return enriched.map(c => ({
  atomId: c.atomId,
  title: c.atom.title || c.atom.content.slice(0, 60),
  explanation: generateCompressionExplanation(c),
  staleDays: c.staleDays,
  linkCount: c.linkCount,
  similarAtomCount: c.similarAtomTitles.length,
  similarAtomTitles: c.similarAtomTitles,
  decisionContext: c.relatedDecisionTitles[0],
  recommendedAction: recommendCompressionAction(c),
  confidence: assessCompressionConfidence(c),
}));
// Remove: buildCompressionBatchPrompt(), parseCompressionBatchResponse(), try/catch dispatchAI block
// Remove: tier1PreFilter() call (Tier 1 pre-filter was only useful to reduce LLM batch size)
// Keep: enrichCandidates(), buildFallbackExplanations() can be removed or kept as dead code
// Keep: import { dispatchAI } from './router' ONLY if still needed elsewhere in the file
```

### Integration Point 3: store.ts Guard Removal

```typescript
// store.ts — startReviewBriefing(), remove lines 1093-1098:
// Source: store.ts current code

// REMOVE this block:
// if (!anyAIAvailable()) {
//   setState('reviewError', 'No AI adapter available');
//   setState('reviewStatus', 'error');
//   return;
// }

// REMOVE this block from startGuidedReview() at line 1268:
// if (!anyAIAvailable()) return;

// Also remove the setOrbState('thinking') / setOrbState('idle') calls
// from startReviewBriefing() — briefing is now instant, orb animation is misleading.
// The orb state calls for startGuidedReview get-creative phase (line 1526) can remain
// since pattern derivation is still async-structured (though now non-AI).
```

### Integration Point 4: buildGetCreativeSteps() in review-flow.ts

```typescript
// review-flow.ts — replace the try/catch AI block (lines 257-314) with:
// Source: existing review-flow.ts structure

import { derivePatternSteps, enrichTriggerQuestion } from './templates';

// In buildGetCreativeSteps(), replace trigger list block:
for (const trigger of TRIGGER_PROMPTS) {
  const matchingSection = sections.find(s =>
    s.name.toLowerCase().includes(trigger.id) ||
    trigger.id.includes(s.name.toLowerCase())
  );
  const enrichedQuestion = enrichTriggerQuestion(
    trigger.label,
    trigger.description,
    matchingSection ? buildSectionContext(matchingSection, atoms) : null,
  );
  steps.push({
    stepId: `get-creative-trigger-${trigger.id}`,
    phase: 'get-creative',
    question: enrichedQuestion,
    options: [ /* same as before */ ],
    allowFreeform: true,
  });
}

// Replace try/catch AI pattern surfacing block with:
const patternSteps = derivePatternSteps(sections, atoms, inboxItems.length);
steps.push(...patternSteps);

// Note: buildGetCreativeSteps() signature must add `atoms` and `inboxItems` parameters.
// Check all call sites in store.ts to update accordingly.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| AI-required briefing (anyAIAvailable guard) | Template-only briefing, AI guard removed | Phase 12 | Briefing works fully offline; no degraded state |
| LLM batch call for all compression candidates | Template enrichment from signal data | Phase 12 | Zero network requests; instant explanations |
| Pattern surfacing via cloud AI in Get Creative | Deterministic patterns from section/atom load | Phase 12 | Get Creative phase fully offline; no abort-on-no-AI |
| `buildFallbackExplanations()` as error fallback | Formalized primary path in `templates.ts` | Phase 12 | Confidence scoring upgraded from always-low |

**Still LLM-eligible after Phase 12:**
- `analyze-gtd` task type (GTD decision tree in `gtd-analysis.ts`) — open-ended, needs AI
- `generatePhaseSummary()` in `review-flow.ts` — summarizes user actions at phase transitions; LLM-eligible
- Triage classification — stays in Tier 1/2/3 pipeline unchanged

## Open Questions

1. **buildGetCreativeSteps() signature change**
   - What we know: Function currently takes `(sections, recentDecisions, recentInsights, phaseSummaries, signal)`. Adding `atoms` and `inboxItems` is needed for `derivePatternSteps()`.
   - What's unclear: Whether `store.ts` passes these parameters easily or needs a new extraction.
   - Recommendation: Check the `store.ts` call site at line 1528 — `state.atoms` is available there, so adding the parameters is a straightforward two-line change.

2. **Removing dispatchAI import from review-flow.ts**
   - What we know: `generatePhaseSummary()` also uses `dispatchAI`. After Phase 12, `buildGetCreativeSteps()` no longer needs it.
   - What's unclear: Whether `generatePhaseSummary()` stays in scope.
   - Recommendation: Keep the import — `generatePhaseSummary()` is NOT replaced by Phase 12 (it's for LLM-eligible phase transitions). Only the pattern surfacing call is replaced.

3. **Entropy score threshold calibration**
   - What we know: `EntropyScore.level` is 'green'/'yellow'/'red' — computed by WASM. The CONTEXT.md deferred threshold calibration to Claude's discretion.
   - What's unclear: Whether the existing WASM thresholds align with the template variant copy (e.g., does 'red' trigger only when the situation truly warrants "Your system is getting noisy"?).
   - Recommendation: Trust the existing WASM thresholds. If they were wrong, users would have complained before Phase 12. Revisit only if user feedback post-Phase 12 suggests mismatch.

## Sources

### Primary (HIGH confidence)
- Direct codebase read — `src/ai/analysis.ts`, `src/ai/compression.ts`, `src/ai/review-flow.ts`, `src/ai/router.ts`, `src/ai/gtd-analysis.ts`
- Direct codebase read — `src/ui/signals/store.ts` (startReviewBriefing lines 1092-1182, startGuidedReview lines 1266-1340, compression generation lines 1460-1523)
- Direct codebase read — `src/ui/views/ReviewBriefingView.tsx`, `src/ui/views/ReviewView.tsx`
- Direct codebase read — `src/types/atoms.ts`, `src/types/config.ts`, `src/types/review.ts`
- `.planning/phases/12-template-engine/12-CONTEXT.md` — user decisions

### Secondary (MEDIUM confidence)
- None required — all findings from authoritative codebase source

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — confirmed by reading every integration point in the codebase
- Architecture: HIGH — all interfaces, call sites, and data flow verified from source
- Pitfalls: HIGH — derived from direct inspection of current guard logic, null cases, and interface contracts
- Template copy: MEDIUM — specific wording is Claude's discretion; validated against CONTEXT.md tone requirements

**Research date:** 2026-03-05
**Valid until:** 2026-04-05 (stable internal implementation — no external dependencies to expire)
