# Phase 25: Iterative Enrichment Deepening - Research

**Researched:** 2026-03-10
**Domain:** Enrichment engine iteration, cognitive signal integration, follow-up question generation
**Confidence:** HIGH

## Summary

Phase 25 transforms the enrichment wizard from a single-pass system into an iterative deepening loop. Currently, `createEnrichmentSession()` in `enrichment-engine.ts` (line 78-82) filters out already-answered categories via `deriveMissingCategories()`, meaning re-enrichment produces zero questions for a fully-answered item. The cognitive signal army (10 ONNX models in `cognitive-signals.ts`) is defined with types and compositor rules but never consumed outside its own module -- no file in `src/` imports it. This phase wires cognitive signals into question selection, adds follow-up question templates that reference prior answers, introduces depth tracking per category, and adds "ask more" / "move on" navigation to the EnrichmentWizard UI.

The key architectural insight is that the enrichment engine is already a pure state machine with immutable updates (`applyAnswer`, `advanceSession`). Adding iteration means extending this state machine with a new depth dimension rather than replacing it. The cognitive signals can influence question priority ordering and follow-up specificity without changing the fundamental session lifecycle.

**Primary recommendation:** Extend `EnrichmentSession` with `enrichmentDepth` per-category tracking and `followUpTemplates` in `gtd-personal.json`; wire cognitive signals into `createEnrichmentSession` to reorder/filter questions by signal relevance; add "Ask more" / "Next topic" buttons to the wizard UI.

## Standard Stack

### Core (Already in project -- no new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SolidJS | existing | Reactive UI for wizard | Project standard |
| Dexie | existing | Persist depth tracking on InboxItem | Project standard |
| ONNX Runtime Web | existing | Cognitive signal inference | Already loaded for 10 models |

### Supporting
No new libraries needed. All changes are internal to existing modules.

## Architecture Patterns

### Recommended Changes by File

```
src/ai/enrichment/
  types.ts                    # Add depth tracking to EnrichmentSession
  enrichment-engine.ts        # Replace category-skip with depth-aware follow-up generation
  maturity.ts                 # Extend to weight depth (not just filled/unfilled)

src/ai/clarification/
  question-templates.ts       # Add generateFollowUpOptions() that takes prior answer as context

src/config/binder-types/
  gtd-personal.json           # Add followUpTemplates per category (depth 2+)

src/ai/tier2/
  cognitive-signals.ts        # Already complete; consumed by enrichment-engine

src/ui/components/
  EnrichmentWizard.tsx        # Add "Ask more on this topic" / "Move to next" navigation
                              # Show prior answers in follow-up context

src/types/atoms.ts            # Add enrichmentDepth to InboxItemSchema
src/storage/migrations/v8.ts  # Add enrichmentDepth field migration
```

### Pattern 1: Depth-Aware Session Creation

**What:** Instead of filtering out answered categories, generate follow-up questions for categories that have depth < maxDepth.
**When to use:** Every time `createEnrichmentSession()` is called on an item with existing enrichments.
**Example:**

```typescript
// Current behavior (WRONG for iterative deepening):
const categoriesToAsk = deriveMissingCategories(allEnrichments)
  .filter(cat => !enrichedDisplayKeys.has(CATEGORY_DISPLAY_KEYS[cat]));
// Result: 0 questions for fully-enriched items

// New behavior:
const categoriesToAsk = ALL_CATEGORIES.map(cat => {
  const displayKey = CATEGORY_DISPLAY_KEYS[cat];
  const priorAnswer = allEnrichments[displayKey];
  const currentDepth = depthMap[cat] ?? 0;

  if (!priorAnswer) {
    // Never answered: generate first-pass question (depth 0)
    return { cat, depth: 0, priorAnswer: null };
  }
  if (currentDepth < MAX_DEPTH) {
    // Answered but can go deeper: generate follow-up (depth+1)
    return { cat, depth: currentDepth + 1, priorAnswer };
  }
  return null; // Maxed out
}).filter(Boolean);
```

### Pattern 2: Cognitive Signal-Guided Question Priority

**What:** Use the 10 cognitive ONNX model signals to reorder and filter enrichment questions by relevance.
**When to use:** During session creation, after generating candidate questions.

```typescript
// Signal-to-category relevance mapping
const SIGNAL_CATEGORY_MAP: Record<CognitiveModelId, MissingInfoCategory[]> = {
  'priority-matrix': ['missing-outcome', 'missing-timeframe'],
  'collaboration-type': ['missing-context', 'missing-reference'],
  'cognitive-load': ['missing-next-action'],
  'gtd-horizon': ['missing-outcome'],
  'time-estimate': ['missing-timeframe'],
  'energy-level': ['missing-context'],
  'knowledge-domain': ['missing-reference'],
  // emotional-valence, information-lifecycle, review-cadence: no direct mapping
};

// Boost relevance score for categories where cognitive signals are low-confidence
// (i.e., the model is uncertain, so asking the user clarifies)
function prioritizeBySignals(
  categories: MissingInfoCategory[],
  signals: SignalVector | null,
): MissingInfoCategory[] {
  if (!signals) return categories; // No signals = default ordering

  // Sort: categories where relevant signal has LOW confidence come first
  // (uncertainty = high value of asking)
  return [...categories].sort((a, b) => {
    const aRelevance = computeSignalRelevance(a, signals);
    const bRelevance = computeSignalRelevance(b, signals);
    return bRelevance - aRelevance; // Higher relevance first
  });
}
```

### Pattern 3: Follow-Up Templates with Prior Answer Context

**What:** Question templates at depth 2+ reference the user's prior answer for that category.
**When to use:** In `gtd-personal.json` and `generateFollowUpOptions()`.

```json
{
  "followUpTemplates": {
    "missing-outcome": {
      "question": "You said the outcome is \"{prior_answer}\". Can you be more specific?",
      "options": {
        "task": [
          "What does 'done' look like for {prior_answer}?",
          "Who needs to approve {prior_answer}?",
          "How will you know {prior_answer} succeeded?",
          "{freeform}"
        ],
        "_default": [
          "What measurable result would confirm {prior_answer}?",
          "What would change once {prior_answer} is done?",
          "What's the first sign {prior_answer} is on track?",
          "{freeform}"
        ]
      }
    }
  }
}
```

### Pattern 4: UI Navigation for Iterative Deepening

**What:** Add two navigation modes after answering a question: "Ask more on this topic" (stay in category, increase depth) and "Move to next area" (advance to next category).
**When to use:** In EnrichmentWizard.tsx, below the answer options.

```typescript
// After each answer, show navigation:
<div class="enrichment-nav">
  <button onClick={() => props.onAskMore(currentCategory)}>
    Ask more about {currentCategoryLabel}
  </button>
  <button onClick={() => props.onMoveNext()}>
    Move to next area
  </button>
</div>

// Prior answer shown as context above follow-up question:
<Show when={priorAnswer()}>
  <div class="prior-answer">
    Previously: {priorAnswer()}
  </div>
</Show>
```

### Anti-Patterns to Avoid
- **Infinite depth without ceiling:** Always cap maxDepth per category (recommend 3). Beyond 3 rounds of follow-up, user gets diminishing returns.
- **Showing all prior answers at once:** Only show the prior answer for the current category being deepened, not all answers. Keeps UI focused.
- **Re-running ONNX inference on every re-enrichment:** Cache the SignalVector for the inbox item. Content hasn't changed between enrichment rounds -- only enrichments appended. Recompute only if `shouldReEvaluate()` returns true.
- **Breaking immutable session pattern:** All new state (depth tracking, signal cache) must follow the existing immutable update pattern used by `applyAnswer()` and `advanceSession()`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Signal-to-category mapping | Complex ML model | Static lookup table | 10 known signals, 5 known categories -- deterministic mapping is sufficient |
| Follow-up question generation | LLM-based question generation | Template slot-filling with `{prior_answer}` | Keeps enrichment fully offline, sub-second; LLM can enhance via Tier 2B later |
| Depth persistence | Custom storage | Extend InboxItem schema with `enrichmentDepth: Record<string, number>` | Already using Dexie maturityScore/maturityFilled pattern |

## Common Pitfalls

### Pitfall 1: Overwriting Prior Answers on Re-enrichment
**What goes wrong:** `appendEnrichment()` appends new key:value lines but the same key can appear multiple times in the enrichment section, leading to ambiguity about which is current.
**Why it happens:** Current `appendEnrichment()` doesn't check for duplicate keys.
**How to avoid:** On follow-up answers for an already-enriched category, REPLACE the existing line rather than appending a duplicate. Or use a numbered depth suffix: `Outcome (depth 1): ...`, `Outcome (depth 2): ...`.
**Warning signs:** `parseEnrichment()` returning the first or last occurrence inconsistently.

### Pitfall 2: Cognitive Signals Not Available Yet
**What goes wrong:** `cognitive-signals.ts` defines types and compositor rules but no code in the app actually runs ONNX inference for these 10 models. The models exist as ONNX files but the inference pipeline isn't wired.
**Why it happens:** Phase 24 committed the signal protocol types (46447a9) but the embedding worker doesn't load/run these models yet.
**How to avoid:** Design the signal integration with a `SignalVector | null` fallback. When signals are null (models not loaded), use default GTD importance ordering. This makes Phase 25 functional without requiring cognitive model inference to be wired first.
**Warning signs:** `signals` parameter always null in production.

### Pitfall 3: EnrichmentSession State Machine Complexity Explosion
**What goes wrong:** Adding depth tracking + cognitive signal priority + navigation modes creates too many state transitions.
**Why it happens:** The current `EnrichmentPhase` type has 6 states. Adding per-category depth creates a much larger state space.
**How to avoid:** Keep the phase state machine unchanged. Depth is orthogonal to phase -- it affects question GENERATION, not session TRANSITIONS. The session still flows: questions -> decompose-offer -> ... -> done. The only change is what questions are generated and how "questions" phase handles navigation within itself.

### Pitfall 4: Maturity Score Semantics Change
**What goes wrong:** Currently maturity is a simple ratio (filled/5). With depth, a category answered at depth 3 should score higher than depth 1.
**Why it happens:** `computeMaturity()` treats all filled categories equally.
**How to avoid:** Extend maturity to be depth-weighted: `sum(min(depth_i, maxDepth) / maxDepth) / numCategories`. A category at depth 3/3 contributes 1.0, at depth 1/3 contributes 0.33. This is backward-compatible: depth 1 (current behavior) with maxDepth=3 gives 0.33 per category, so 5 categories at depth 1 = 1.67/5 = 0.33 total, which is lower than the current 1.0 for all filled. Adjust quality gate thresholds accordingly.

### Pitfall 5: Breaking Existing Single-Pass Users
**What goes wrong:** Users who enriched once and expect their items to be "done" now see them as incomplete.
**Why it happens:** Changing maturity scoring retroactively lowers scores for items that were previously at 1.0.
**How to avoid:** Use `enrichmentDepth` default of 1 for already-enriched categories (migration). Only items enriched AFTER Phase 25 get depth tracking. Or: keep maturity as-is for graduation gating and add a separate "depth score" for the UI indicator.

## Code Examples

### Extending EnrichmentSession Type

```typescript
// In types.ts - add to EnrichmentSession:
export interface EnrichmentSession {
  // ... existing fields ...

  /** Per-category depth tracking. Key = MissingInfoCategory, value = current depth. */
  categoryDepth: Record<string, number>;

  /** Cached cognitive signals for question prioritization (null if not available). */
  cognitiveSignals: SignalVector | null;

  /** Whether "ask more" mode is active for a specific category. */
  activeDeepening: MissingInfoCategory | null;
}
```

### Follow-Up Question Generation

```typescript
// In question-templates.ts - new function:
export function generateFollowUpOptions(
  category: MissingInfoCategory,
  atomType: string,
  priorAnswer: string,
  depth: number,
  slots: Record<string, string>,
  binderType?: string,
): ClarificationQuestion {
  const config = getBinderConfig(binderType);
  const followUpEntry = config.followUpTemplates?.[category];

  if (!followUpEntry) {
    // Fallback: generic follow-up referencing prior answer
    return {
      category,
      questionText: `You said "${priorAnswer}" for ${CATEGORY_LABELS[category]}. Can you elaborate?`,
      options: [`More details about "${priorAnswer}"`, `Actually, let me change this`],
      categoryLabel: CATEGORY_LABELS[category],
    };
  }

  // Slot-fill with prior_answer in addition to standard slots
  const enrichedSlots = { ...slots, prior_answer: priorAnswer };
  const rawOptions = followUpEntry.options[atomType] ?? followUpEntry.options['_default'] ?? [];
  const filledOptions = rawOptions
    .filter(opt => opt !== '{freeform}')
    .map(opt => fillSlots(opt, enrichedSlots));

  return {
    category,
    questionText: fillSlots(followUpEntry.question, enrichedSlots),
    options: filledOptions,
    categoryLabel: CATEGORY_LABELS[category],
  };
}
```

### Dexie v8 Migration

```typescript
// In src/storage/migrations/v8.ts
export function applyV8Migration(db: Dexie): void {
  // enrichmentDepth: per-category depth map, default {}
  // No new indexes needed -- enrichmentDepth is not queried directly
  db.version(8).stores({}).upgrade(tx => {
    return tx.table('inbox').toCollection().modify(item => {
      if (!item.enrichmentDepth) {
        item.enrichmentDepth = {};
        // Backfill: if maturityFilled has entries, set depth=1 for each
        if (item.maturityFilled?.length > 0) {
          for (const cat of item.maturityFilled) {
            item.enrichmentDepth[cat] = 1;
          }
        }
      }
    });
  });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single-pass enrichment (skip answered) | Iterative deepening with follow-ups | Phase 25 | Items grow richer over multiple sessions |
| Static GTD ordering for questions | Signal-guided priority ordering | Phase 25 | Most valuable questions asked first |
| Binary maturity (filled/unfilled) | Depth-weighted maturity | Phase 25 | Finer-grained quality assessment |
| Cognitive signals unused | Signals influence question selection | Phase 25 | ONNX army contributes to enrichment quality |

## Open Questions

1. **Should depth be capped globally or per-category?**
   - What we know: Some categories (outcome, next-action) benefit from deep drilling. Others (timeframe, context) are often one-shot.
   - What's unclear: Optimal per-category max depth.
   - Recommendation: Start with global maxDepth=3, tune per-category later based on usage data. Ship simple, refine.

2. **How to handle re-enrichment content format?**
   - What we know: Current format is `Key: value` after `---` separator. Multiple rounds could produce `Outcome: X` then `Outcome: Y`.
   - What's unclear: Should follow-ups append or replace? Should depth be encoded in the key?
   - Recommendation: Replace the value on re-answer for the same category. Store depth in InboxItem metadata, not in content string. Content stays clean: `Outcome: <latest answer>`.

3. **Cognitive model inference timing**
   - What we know: 10 ONNX models exist as files, types are defined, but no inference code runs them in the embedding worker.
   - What's unclear: Whether cognitive inference will be wired before Phase 25 ships.
   - Recommendation: Design with `SignalVector | null` pattern. Phase 25 works without signals (uses default ordering). Signals enhance when available. This avoids a hard dependency on cognitive inference wiring.

<phase_requirements>
## Phase Requirements

These are proposed requirement IDs for Phase 25 (not yet in REQUIREMENTS.md):

| ID | Description | Research Support |
|----|-------------|-----------------|
| ITER-01 | Re-enrichment generates follow-up questions for already-answered categories instead of skipping them | Pattern 1: Depth-aware session creation; enrichment-engine.ts changes |
| ITER-02 | Per-category enrichment depth tracked on InboxItem and persisted to Dexie | Dexie v8 migration; InboxItemSchema extension |
| ITER-03 | Follow-up question templates reference prior answers with {prior_answer} slot | Pattern 3: followUpTemplates in gtd-personal.json; generateFollowUpOptions() |
| ITER-04 | Cognitive signal army influences enrichment question priority ordering | Pattern 2: Signal-guided priority; cognitive-signals.ts integration |
| ITER-05 | EnrichmentWizard shows prior answers in context when presenting follow-up questions | Pattern 4: UI prior-answer display |
| ITER-06 | "Ask more on this topic" and "Move to next area" navigation buttons in wizard | Pattern 4: UI navigation; EnrichmentWizard.tsx changes |
| ITER-07 | Maturity scoring accounts for enrichment depth (not just filled/unfilled) | Pitfall 4: depth-weighted maturity; maturity.ts extension |
</phase_requirements>

## Sources

### Primary (HIGH confidence)
- `src/ai/enrichment/enrichment-engine.ts` -- current session creation, category skipping logic (lines 78-82)
- `src/ai/enrichment/types.ts` -- EnrichmentSession type definition (lines 76-99)
- `src/ai/enrichment/maturity.ts` -- maturity scoring (simple ratio, lines 57-75)
- `src/ai/clarification/question-templates.ts` -- template generation (lines 50-83)
- `src/ai/clarification/enrichment.ts` -- content enrichment append/parse (lines 35-94)
- `src/ai/tier2/cognitive-signals.ts` -- 10 cognitive model types, compositor rules (full file)
- `src/config/binder-types/gtd-personal.json` -- question templates, no follow-ups yet
- `src/ui/components/EnrichmentWizard.tsx` -- current wizard UI (601 lines)
- `src/ui/signals/store.ts` -- enrichment session state management (lines 597-799)
- `src/types/atoms.ts` -- InboxItemSchema with maturityScore/maturityFilled (lines 156-163)
- `src/storage/migrations/v7.ts` -- current migration adding maturity fields

### Secondary (MEDIUM confidence)
- Project MEMORY.md -- user requirements for iterative enrichment, cognitive signal integration

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all internal, no new dependencies, files inspected directly
- Architecture: HIGH - pure state machine extension, patterns verified against existing code
- Pitfalls: HIGH - identified from direct code analysis (duplicate keys, missing signal inference, maturity semantics)
- Cognitive signal integration: MEDIUM - signals defined but inference not yet wired; design accounts for null fallback

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (stable internal architecture, no external dependency churn)
