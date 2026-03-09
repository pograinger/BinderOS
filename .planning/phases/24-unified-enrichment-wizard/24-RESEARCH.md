# Phase 24: Unified Enrichment Wizard - Research

**Researched:** 2026-03-09
**Domain:** SolidJS UI components, tiered AI pipeline extension, Dexie schema migration, SVG visualization
**Confidence:** HIGH

## Summary

Phase 24 merges the existing DecompositionFlow and ClarificationFlow into a single inline EnrichmentWizard, adds an inbox maturity model with visual indicators, implements a graduation flow (inbox item to atoms), adds model provenance annotations with a 3-Ring stacked ring SVG visualization, introduces a quality gate for atom creation, and wires Tier 2B (WASM LLM) into the tiered pipeline. This is primarily a UI unification phase with a data model extension (provenance bitmask, maturity tracking) and a new tier handler.

The codebase already has strong patterns for all needed work: inline SVG components (AtomTypeIcon), tiered handler registration (TierHandler interface), worker message protocols (typed messages with UUID request IDs), Dexie migration pattern (versioned stores), pure module pattern (no store imports in AI pipelines), and the existing clarification/decomposition code provides reusable backends. The main complexity is the UI unification (replacing two modal flows with one inline flow) and the new graduation concept (multi-atom creation from enrichment results).

**Primary recommendation:** Build incrementally: (1) data model + bitmask provenance, (2) EnrichmentWizard UI replacing both flows, (3) 3-Ring SVG indicator, (4) graduation flow, (5) quality gate, (6) Tier 2B handler. Reuse existing decomposer.ts, question-templates.ts, enrichment.ts, and option-ranking.ts backends.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Single "Enrich" button replaces both "Break this down" and "Clarify this"
- Button always visible on ALL inbox cards (not AI-gated)
- AI auto-detects readiness on capture -- well-specified items start with high maturity, vague items start low
- Wizard always asks questions BEFORE suggesting decomposition
- 4-option menus with easy-to-choose answers (GSD philosophy)
- Category chips at top (outcome, next-action, timeframe, context, reference) show progress -- tappable to jump non-linearly
- Enrichment renders inline on the triage card, replacing the AI suggestion strip area (NOT a modal)
- Each answer applied immediately -- if user leaves mid-flow, everything so far is saved
- Inbox items are raw captures that mature through enrichment (not immediately classified)
- Visual maturity indicator on every card (progress ring/fill)
- Graduation preview shows all proposed atoms as list with remove capability
- Original inbox item becomes parent atom; child atoms skip re-triaging
- Swipe-to-classify still works for any item, any time
- Soft warning when AI thinks item is too raw -- user can always override
- Quality = composite of tier source + completeness + user-provided content
- Quality spectrum visualization on graduation preview (not binary)
- ONNX template steps get vagueness scrutiny; WASM LLM steps moderate quality; Cloud steps high quality
- Soft gate with warning below minimum quality -- user can force-create
- Compact model bitmask stored per atom (16-32 bits)
- Every AI-produced element gets provenance
- 3-Ring stacked ring indicator: inner=T1, middle=T2 (ONNX+WASM as segments), outer=T3
- Always shown on every item (empty rings for unprocessed)
- On tap: ring segments highlight/animate with model name
- Middle ring shows two visual segments: ONNX and WASM LLM
- Tier 2B generates contextual questions, options, and decomposition steps
- Tier 2B falls back to ONNX templates on devices without WASM LLM
- Smart re-evaluation: re-asks if atom content changed significantly since last enrichment

### Claude's Discretion
- Exact bitmask layout and model ID assignments
- Ring rendering implementation (SVG, Canvas, CSS)
- WASM LLM model selection and inference optimization
- Enrichment category detection algorithms
- Graduation threshold calibration
- Migration path from current DecompositionFlow/ClarificationFlow to unified wizard
- Worker architecture for WASM LLM (new worker vs extending existing)

### Deferred Ideas (OUT OF SCOPE)
- Power user batch review mode
- Enrichment history timeline
- Free-form WASM LLM conversation
- Voice input for enrichment
- Proactive enrichment suggestions
- Wolfram computation validation
- Cross-atom enrichment intelligence
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SolidJS | existing | Reactive UI components | Project framework |
| Dexie | existing | IndexedDB persistence | Project ORM |
| Zod/v4 | existing | Schema validation | Project validation layer |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| onnxruntime-web | existing | ONNX inference in worker | Tier 2A classification |
| (No new libraries) | - | All work uses existing stack | - |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SVG for ring indicator | Canvas or CSS | SVG is the established pattern (AtomTypeIcon, PriorityBadge); declarative; accessible; animatable via CSS transitions |
| New WASM LLM worker | Extend embedding worker | Separate worker isolates memory; follows Phase 14 sanitization worker precedent |

**Installation:**
```bash
# No new dependencies required
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  ai/
    enrichment/
      types.ts              # EnrichmentState, MaturityLevel, GraduationPreview, ProvenanceBitmask
      enrichment-engine.ts  # Orchestrates question flow + decomposition sequencing
      maturity.ts           # Maturity scoring from enrichment completeness
      quality-gate.ts       # Quality composite scoring for graduation
      provenance.ts         # Bitmask encoding/decoding, model ID registry
    tier2/
      tier2b-handler.ts     # WASM LLM tier handler (TierHandler interface)
      types.ts              # Extended AITaskType with enrichment tasks
  ui/
    components/
      EnrichmentWizard.tsx  # Replaces DecompositionFlow + ClarificationFlow
      ThreeRingIndicator.tsx # SVG stacked ring visualization
      GraduationPreview.tsx  # Atom list preview before graduation
      MaturityIndicator.tsx  # Progress ring/fill on inbox cards
  storage/
    migrations/v7.ts        # Add provenance bitmask + maturity fields
```

### Pattern 1: Inline Enrichment (Not Modal)
**What:** EnrichmentWizard renders inside the triage card, replacing InboxAISuggestion strip area
**When to use:** Always -- locked decision
**Example:**
```typescript
// In InboxView.tsx, replace the InboxAISuggestion Show block:
<Show when={enrichmentActive() && enrichmentAtomId() === currentItem()!.id}>
  <EnrichmentWizard
    item={currentItem()!}
    onAnswer={handleEnrichmentAnswer}
    onGraduate={handleGraduation}
    onClose={closeEnrichment}
  />
</Show>
<Show when={!enrichmentActive() || enrichmentAtomId() !== currentItem()!.id}>
  {/* Existing InboxAISuggestion strip */}
</Show>
```

### Pattern 2: Provenance Bitmask
**What:** Compact 32-bit integer encoding which AI models contributed to an atom
**When to use:** Stored on every atom/inbox item, updated after each AI operation
**Example:**
```typescript
// Bitmask layout (32 bits total):
// Bits 0-7:   Model IDs that contributed (8 models max)
// Bits 8-15:  Operation types performed
// Bits 16-23: Quality/tier metadata
// Bits 24-31: Reserved

const MODEL_IDS = {
  TYPE_ONNX:        1 << 0,  // Type classification ONNX
  GTD_ROUTING:      1 << 1,  // GTD routing classifier
  DECOMPOSE_ONNX:   1 << 2,  // Decomposition ONNX
  SANITIZE_NER:     1 << 3,  // Sanitization NER
  COMPLETENESS:     1 << 4,  // Completeness gate
  MISSING_INFO:     1 << 5,  // Missing info classifiers
  WASM_LLM:         1 << 6,  // Tier 2B WASM LLM
  CLOUD_LLM:        1 << 7,  // Tier 3 cloud LLM
} as const;

const OPERATION_IDS = {
  CLASSIFY:         1 << 8,
  DECOMPOSE:        1 << 9,
  CLARIFY:          1 << 10,
  ENRICH:           1 << 11,
  SANITIZE:         1 << 12,
  ENTITY_DETECT:    1 << 13,
  GRADUATE:         1 << 14,
} as const;

// Read which tier produced results:
function getTiersUsed(bitmask: number): { t1: boolean; t2a: boolean; t2b: boolean; t3: boolean } {
  return {
    t1: !!(bitmask & (MODEL_IDS.TYPE_ONNX | MODEL_IDS.GTD_ROUTING)),  // deterministic + ONNX are T1/T2A
    t2a: !!(bitmask & (MODEL_IDS.DECOMPOSE_ONNX | MODEL_IDS.COMPLETENESS | MODEL_IDS.MISSING_INFO)),
    t2b: !!(bitmask & MODEL_IDS.WASM_LLM),
    t3: !!(bitmask & MODEL_IDS.CLOUD_LLM),
  };
}
```

### Pattern 3: Maturity Model
**What:** Enrichment completeness as a 0-1 score stored on InboxItem
**When to use:** Updated after each enrichment answer, drives visual indicator
**Example:**
```typescript
// Categories tracked for maturity:
const MATURITY_CATEGORIES = ['outcome', 'next-action', 'timeframe', 'context', 'reference'] as const;

interface MaturityState {
  score: number;         // 0-1 composite
  filled: Set<string>;   // Which categories have been answered
  totalCategories: number;
}

function computeMaturity(enrichments: Record<string, string>): number {
  let filled = 0;
  for (const cat of MATURITY_CATEGORIES) {
    if (enrichments[cat] || enrichments[CATEGORY_DISPLAY_KEYS[cat]]) filled++;
  }
  return filled / MATURITY_CATEGORIES.length;
}
```

### Pattern 4: Tier 2B Handler (follows existing TierHandler interface)
**What:** WASM LLM handler registered between T2A (ONNX) and T3 (Cloud)
**When to use:** On devices with WASM LLM capability (laptops, desktops)
**Example:**
```typescript
// tier2b-handler.ts
import type { TierHandler } from './handler';
import type { AITaskType, TieredRequest, TieredResult } from './types';

const TIER2B_TASKS: AITaskType[] = [
  'enrich-questions',     // Generate contextual questions
  'enrich-options',       // Generate contextual answer options
  'decompose',            // Better decomposition steps
  'synthesize-enrichment' // Post-enrichment summary
];

export function createTier2BHandler(wasmWorker: Worker): TierHandler {
  return {
    tier: 2,  // Same tier as T2A but handles different tasks
    name: 'Tier2B-WASM-LLM',
    canHandle(task: AITaskType): boolean {
      return TIER2B_TASKS.includes(task);
    },
    async handle(request: TieredRequest): Promise<TieredResult> {
      // Send to WASM LLM worker, await result
      // ...
    },
  };
}
```

**Important:** The handler registry sorts by tier number. Since T2B is also tier 2, it will be tried alongside T2A. The `canHandle` method differentiates which tasks each handles. For tasks like `decompose` that both T2A and T2B can handle, register T2B with a sub-tier mechanism or use task-specific routing.

### Pattern 5: Graduation Flow
**What:** Converting enriched inbox item into one or more atoms
**When to use:** After enrichment reaches sufficient maturity
**Example:**
```typescript
interface GraduationProposal {
  parentAtom: {
    type: AtomType;
    content: string;
    enrichments: Record<string, string>;
    quality: number;
    provenance: number;
  };
  childAtoms: Array<{
    type: AtomType;
    content: string;
    suggestedSection: string | null;
    quality: number;
    provenance: number;
    included: boolean;  // User can toggle off
  }>;
}

// Graduation creates atoms via existing commands:
// 1. CLASSIFY_INBOX_ITEM for parent (becomes atom)
// 2. CREATE_INBOX_ITEM + CLASSIFY_INBOX_ITEM for each child (skip triage)
```

### Anti-Patterns to Avoid
- **Modal overlays for enrichment:** Locked decision says inline only. The current DecompositionFlow and ClarificationFlow both use modal backdrops -- the new wizard MUST NOT.
- **Store imports in enrichment engine:** Follow pure module pattern. All state passed by caller.
- **Double-inference on decomposition:** Current decomposer accepts `classifyFn` injection to avoid re-running ONNX. Keep this pattern.
- **Blocking on WASM LLM availability:** T2B is optional enhancement. Enrichment must work fully with T2A templates only.
- **Destroying existing swipe behavior:** Enrichment is additive to triage cards; swipe gestures must still work.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Question templates | New template system | Existing `question-templates.ts` + `gtd-personal.json` | Already has type-aware, category-ordered templates |
| Content enrichment | New enrichment appender | Existing `enrichment.ts` (appendEnrichment, parseEnrichment) | Handles separator, dedup, parsing |
| Option ranking | New ranking logic | Existing `option-ranking.ts` (rankOptions, getSkipPatterns) | Self-learning from classification history |
| Cloud option upgrade | New cloud fetch | Existing `cloud-options.ts` (prefetchCloudOptions) | 2s timeout, graceful fallback |
| Entity graph seeding | New graph code | Existing `entity-graph.ts` (seedEntityRelationship) | Single-direction storage, bidirectional queries |
| Decomposition pipeline | New decomposer | Existing `decomposer.ts` + `categories.ts` | 35 categories, slot extraction, classifyFn injection |
| UUID generation | Custom IDs | `crypto.randomUUID()` | Project standard |
| Tier escalation | Custom routing | Existing `dispatchTiered()` pipeline | Handles confidence thresholds, fallback, abort |

**Key insight:** 80% of the backend logic for enrichment already exists split across clarification and decomposition modules. The wizard primarily needs a new UI shell, a unified state machine, and the graduation concept.

## Common Pitfalls

### Pitfall 1: Inline Enrichment vs Swipe Gesture Conflict
**What goes wrong:** Enrichment UI elements (buttons, chips, input fields) intercept touch events needed by the swipe gesture handler on triage cards.
**Why it happens:** InboxView uses touch event handling for swipe-to-classify. Inline enrichment adds interactive elements within the same touch target.
**How to avoid:** Use `onTouchStart={(e) => e.stopPropagation()}` on all enrichment interactive elements, following the existing pattern on the "Break this down" button (line 415-416 of InboxView.tsx).
**Warning signs:** Tapping enrichment options triggers swipe instead, or swipe stops working on cards with enrichment open.

### Pitfall 2: Tier Handler Registry Collision (T2A vs T2B)
**What goes wrong:** Both T2A (ONNX) and T2B (WASM LLM) are tier 2 handlers. The pipeline sorts by tier number and tries them in order. If both `canHandle` the same task, T2A always wins (registered first).
**Why it happens:** Pipeline iterates handlers sorted by tier, accepts first result above threshold.
**How to avoid:** For tasks both can handle (e.g., `decompose`), either: (a) extend AITaskType with T2B-specific tasks (`decompose-contextual`), or (b) add a sub-tier routing mechanism in the pipeline that checks T2B before T2A for overlapping tasks on capable devices.
**Warning signs:** WASM LLM never gets called despite being registered.

### Pitfall 3: Maturity State Lost on Navigation
**What goes wrong:** User partially enriches an item, navigates away, returns to find enrichment progress lost.
**Why it happens:** If maturity state is only in SolidJS signals (memory), it disappears on navigation.
**How to avoid:** Persist maturity score and filled categories in the InboxItem record in Dexie. Each enrichment answer writes immediately to DB (locked decision: "each answer applied immediately").
**Warning signs:** Enrichment progress resets to zero on page refresh.

### Pitfall 4: Graduation Creates Duplicate Triage
**What goes wrong:** Child atoms created via `CREATE_INBOX_ITEM` enter the triage queue and get AI-classified again, defeating the purpose of enrichment.
**Why it happens:** Normal inbox items go through the triage cascade automatically.
**How to avoid:** Graduation child atoms should be created via `CLASSIFY_INBOX_ITEM` directly (skip inbox), or add a `skipTriage` flag to `CREATE_INBOX_ITEM`. Context says "child atoms go directly to their AI-suggested sections (skip re-triaging)."
**Warning signs:** Graduated atoms appearing in inbox again.

### Pitfall 5: Bitmask Field Not in Dexie Schema
**What goes wrong:** Provenance bitmask not persisted across sessions.
**Why it happens:** Dexie requires explicit table stores definitions. New fields on existing tables need migration.
**How to avoid:** Add v7 migration adding `provenance` field to atoms and inbox tables. Since it's just a number field on existing records, defaulting to 0 is safe (no rings filled = unprocessed).
**Warning signs:** Ring indicator always shows empty after page reload.

### Pitfall 6: WASM LLM Worker Memory Pressure
**What goes wrong:** Loading WASM LLM in a worker alongside embedding worker causes OOM on mid-range devices.
**Why it happens:** Each worker allocates separate WASM memory. Embedding worker (MiniLM) + sanitization worker (NER) + WASM LLM worker = significant memory.
**How to avoid:** Follow Phase 14 precedent: dedicated worker, lazy model loading (only on first enrichment request on capable device), and device capability check before loading.
**Warning signs:** Worker crashes, browser tab OOM.

## Code Examples

### Enrichment State Machine
```typescript
// Pure module -- no store imports
type EnrichmentPhase =
  | 'questions'       // Asking clarification questions
  | 'decompose-offer' // Offering decomposition after questions
  | 'decomposing'     // Stepping through decomposition
  | 'graduate-offer'  // Suggesting graduation
  | 'graduating'      // Reviewing graduation preview
  | 'done';

interface EnrichmentSession {
  inboxItemId: string;
  phase: EnrichmentPhase;
  // Question state (reuses ClarificationAnswer[])
  questions: ClarificationQuestion[];
  currentQuestionIndex: number;
  answers: ClarificationAnswer[];
  // Decomposition state (reuses DecomposedStep[])
  decompositionSteps: DecomposedStep[];
  currentStepIndex: number;
  acceptedSteps: AcceptedStep[];
  // Graduation state
  graduationProposal: GraduationProposal | null;
  // Provenance tracking
  provenance: number;  // Bitmask accumulator
}
```

### 3-Ring SVG Indicator
```typescript
// ThreeRingIndicator.tsx -- inline SVG, follows AtomTypeIcon pattern
interface ThreeRingProps {
  provenance: number;
  size?: number;
  onTap?: () => void;
}

export function ThreeRingIndicator(props: ThreeRingProps) {
  const s = () => props.size ?? 24;
  const cx = () => s() / 2;
  const cy = () => s() / 2;

  // Three concentric rings with gaps
  const rings = () => {
    const p = props.provenance;
    const tiers = getTiersUsed(p);
    return [
      { r: s() * 0.18, active: tiers.t1, color: '#58a6ff', label: 'Tier 1' },        // Inner
      { r: s() * 0.30, active: tiers.t2a, color: '#3fb950', label: 'ONNX' },          // Middle-inner
      { r: s() * 0.34, active: tiers.t2b, color: '#7ee787', label: 'WASM LLM' },      // Middle-outer
      { r: s() * 0.44, active: tiers.t3, color: '#bc8cff', label: 'Cloud' },           // Outer
    ];
  };

  return (
    <svg width={s()} height={s()} viewBox={`0 0 ${s()} ${s()}`} onClick={props.onTap}>
      <For each={rings()}>
        {(ring) => (
          <circle
            cx={cx()} cy={cy()} r={ring.r}
            fill="none"
            stroke={ring.active ? ring.color : 'var(--surface-3)'}
            stroke-width={s() * 0.06}
            opacity={ring.active ? 1 : 0.25}
          />
        )}
      </For>
    </svg>
  );
}
```

### Dexie v7 Migration
```typescript
// src/storage/migrations/v7.ts
import type { BinderDB } from '../db';

export function applyV7Migration(db: BinderDB): void {
  db.version(7).stores({
    // No index changes needed -- provenance and maturity are non-indexed fields
    // Dexie auto-preserves existing indexes when stores definition is null for a table
  });
}
// Fields added to InboxItem/Atom types:
//   provenance: number (default 0)
//   maturityScore: number (default 0, InboxItem only)
//   maturityFilled: string[] (default [], InboxItem only)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Separate Break/Clarify buttons | Unified Enrich button | Phase 24 | Single entry point, question-first flow |
| Modal overlay flows | Inline card enrichment | Phase 24 | Non-blocking, preserves swipe gestures |
| Immediate inbox classification | Maturity-based graduation | Phase 24 | Items evolve before becoming atoms |
| No AI provenance tracking | Bitmask per atom | Phase 24 | Every AI operation recorded |
| Tier 2 = ONNX only | Tier 2A (ONNX) + 2B (WASM LLM) | Phase 24 | Smarter local AI on capable devices |

**Deprecated/outdated:**
- `DecompositionFlow.tsx`: Replaced by EnrichmentWizard (keep backend decomposer.ts)
- `ClarificationFlow.tsx`: Replaced by EnrichmentWizard (keep backend question-templates.ts, enrichment.ts)
- `showDecompositionFlow` signal: Replaced by enrichment state
- `showClarificationFlow` signal: Replaced by enrichment state
- "Break this down" button in InboxView: Replaced by "Enrich" button
- "Clarify this" button in InboxAISuggestion: Replaced by "Enrich" button

## Open Questions

1. **Tier 2B task type registration**
   - What we know: Pipeline sorts handlers by tier, T2A and T2B are both tier 2
   - What's unclear: Best way to route overlapping tasks (decompose) to T2B when available
   - Recommendation: Extend AITaskType with T2B-specific variants (e.g., `decompose-contextual`), and have the enrichment engine dispatch the appropriate variant based on device capability

2. **WASM LLM model selection for T2B**
   - What we know: Phase 15 (DLLM) is not yet implemented; it will establish WASM LLM infrastructure
   - What's unclear: Which model, how to detect capability, worker architecture
   - Recommendation: Design T2B handler interface now but defer actual WASM LLM wiring until Phase 15 completes. Ship with T2B as a no-op that falls through to T2A templates.

3. **Graduation section routing**
   - What we know: Child atoms should "go directly to their AI-suggested sections"
   - What's unclear: Should graduation run the full triage cascade (type + GTD + section routing) on each child, or infer from parent enrichment?
   - Recommendation: Run type classification + section routing on graduation (child content is well-specified), but skip completeness gate (already enriched)

4. **InboxItem schema extension**
   - What we know: Need provenance (number), maturityScore (number), maturityFilled (string[])
   - What's unclear: Whether to add to Zod InboxItemSchema or just Dexie (schemaless fields)
   - Recommendation: Add to Zod schema for type safety; Dexie is schemaless for non-indexed fields so v7 migration is minimal

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (existing) |
| Config file | vitest implied from package.json |
| Quick run command | `pnpm test -- --run` |
| Full suite command | `pnpm test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| N/A-01 | Provenance bitmask encode/decode roundtrip | unit | `pnpm test -- --run src/ai/enrichment/provenance.test.ts` | No - Wave 0 |
| N/A-02 | Maturity score computation from enrichments | unit | `pnpm test -- --run src/ai/enrichment/maturity.test.ts` | No - Wave 0 |
| N/A-03 | Quality gate composite scoring | unit | `pnpm test -- --run src/ai/enrichment/quality-gate.test.ts` | No - Wave 0 |
| N/A-04 | Enrichment state machine transitions | unit | `pnpm test -- --run src/ai/enrichment/enrichment-engine.test.ts` | No - Wave 0 |
| N/A-05 | Graduation proposal generation | unit | `pnpm test -- --run src/ai/enrichment/graduation.test.ts` | No - Wave 0 |
| N/A-06 | EnrichmentWizard renders inline (not modal) | manual-only | Visual inspection | N/A |
| N/A-07 | 3-Ring SVG renders correct ring states | manual-only | Visual inspection | N/A |
| N/A-08 | Swipe gestures still work with enrichment open | manual-only | Touch testing | N/A |

### Sampling Rate
- **Per task commit:** `pnpm test -- --run`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/ai/enrichment/provenance.test.ts` -- bitmask encode/decode
- [ ] `src/ai/enrichment/maturity.test.ts` -- maturity score computation
- [ ] `src/ai/enrichment/quality-gate.test.ts` -- quality composite
- [ ] `src/ai/enrichment/enrichment-engine.test.ts` -- state machine
- [ ] No framework install needed -- vitest already configured

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `src/ai/tier2/` (pipeline, handler, types, tier2-handler) -- tiered architecture patterns
- Codebase analysis: `src/ui/components/DecompositionFlow.tsx` -- current decomposition UI (307 lines)
- Codebase analysis: `src/ui/components/ClarificationFlow.tsx` -- current clarification UI (431 lines)
- Codebase analysis: `src/ui/components/InboxAISuggestion.tsx` -- suggestion strip integration (327 lines)
- Codebase analysis: `src/ai/clarification/` -- question templates, enrichment, option ranking, cloud options
- Codebase analysis: `src/ai/decomposition/` -- decomposer, categories, slot extraction
- Codebase analysis: `src/storage/db.ts` -- Dexie schema, migration pattern (v1-v6)
- Codebase analysis: `src/types/atoms.ts` -- Atom/InboxItem Zod schemas
- Codebase analysis: `src/ui/components/AtomTypeIcon.tsx` -- inline SVG component pattern
- Codebase analysis: `src/storage/entity-graph.ts` -- entity relationship storage

### Secondary (MEDIUM confidence)
- CONTEXT.md user decisions -- all locked decisions from discussion phase

### Tertiary (LOW confidence)
- WASM LLM model selection and performance characteristics (Phase 15 not yet implemented)
- T2B handler actual capabilities (depends on model choice)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all existing libraries, no new dependencies
- Architecture: HIGH -- follows established codebase patterns exactly
- Pitfalls: HIGH -- identified from direct code analysis of integration points
- WASM LLM/T2B: LOW -- Phase 15 not yet implemented, T2B is aspirational in this phase

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable -- all patterns are project-internal)
