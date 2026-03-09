# Phase 19: Tier 2 Clarification Wizard Model - Research

**Researched:** 2026-03-08
**Domain:** ONNX binary classifiers, question-flow UX, entity graph schema, binder extensibility
**Confidence:** HIGH

## Summary

Phase 19 builds six ONNX binary classifiers (1 completeness gate + 5 missing-info detectors), a ClarificationFlow UI component, tier-adaptive option generation, self-learning from corrections, a new `entity_graph` Dexie table for graph seeding, and a binder type extensibility architecture. The phase follows well-established patterns from Phases 17-18: Faker-based synthetic data generation, MiniLM embedding + MLP training with Platt calibration, ONNX export, Cache API persistence, lazy-loading in the embedding worker, and modal step-by-step UX. The main novel elements are: (a) consensus logic between the completeness gate and binary classifiers, (b) tier-adaptive option generation with cloud timeout/fallback, (c) a new Dexie table with graph seeding from multiple sources, and (d) a JSON-based binder type config architecture.

This phase is large but modular. Each concern (training pipeline, worker integration, triage cascade, UX flow, graph schema, binder config) can be planned and implemented independently. The training pipeline follows Phase 17/18 patterns almost exactly. The UX follows the DecompositionFlow pattern. The main risk is managing the number of ONNX sessions in the embedding worker (now potentially 12+ total), which requires careful sequential execution.

**Primary recommendation:** Split into 5+ plans: training pipeline (scripts 30-32), worker/tier2 integration, triage cascade + ClarificationFlow UX, graph table + seeding, binder type config architecture. Follow Phase 18 patterns exactly for training and worker integration.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- User-triggered "Clarify this" button on triage cards -- not automatic
- Completeness gate runs in triage cascade (after type classification) -- flags atoms as needing clarification
- 5 binary missing-info classifiers + question flow only run when user taps "Clarify this"
- One question at a time, consistent with AIQuestionFlow pattern
- Each question is skippable -- atom updates with whatever was answered
- Partial answers applied on abandon
- "Clarify this" button appears alongside other triage actions (Accept, Dismiss, Break this down)
- After clarification: auto re-triage the full cascade on enriched text
- Subtle "clarified" indicator on triage cards post-enrichment
- 5 categories: missing-outcome, missing-next-action, missing-timeframe, missing-context, missing-reference
- Question ordering follows GTD importance: outcome, next-action, timeframe, context, reference
- Question ordering defined in binder type config -- extensible
- Completeness gate: 1 binary ONNX classifier (0.75 threshold)
- 5 binary missing-info classifiers: separate ONNX model per category
- Consensus required: gate says "incomplete" AND at least one binary says "missing"
- All models run in embedding worker, reuse MiniLM embedding vector
- Completeness gate loads lazily on first ambiguity detection; 5 binary models load lazily on user tap
- (128,64) MLP architecture for all binary classifiers
- Individual Cache API entries per model (6 separate ONNX files)
- Faker-based synthetic data: 2000 examples per category, 20,000+ total
- 3 numbered scripts: generate (30), train (31 with --classifier flag), validate (32 -- all 6 models)
- >95% accuracy target per classifier, >95% Python/Node parity
- 3-4 pre-built answer options + freeform escape hatch per question
- Tier-adaptive: offline templates, cloud custom options (2s timeout), fallback to templates
- Smart prefetch: cloud options prefetched when idle + high vagueness score
- NER for slot-filling when sanitization worker loaded; regex fallback
- Classification log extended with 'clarification' event type
- Frequency-based option ranking: most-selected options float to top
- Freeform-to-option promotion via manual retraining step
- Category skip patterns tracked
- Enrichment appended as structured key:value lines below `\n---\n`
- Summary shown before modal closes with enriched content preview
- Modal overlay consistent with DecompositionFlow pattern
- Original atom title/content pinned at top of modal
- One ClarificationFlow component for all atom types
- Text input only for freeform (voice deferred)
- New Dexie `entity_graph` table with compound index [sourceAtomId+entityType]
- Graph seeds from: clarification, decomposition, triage similarity, GTD context
- CRDT-friendly design: individual records per relationship
- Unified binder type config (JSON) at `src/config/binder-types/`
- Build-time import via Vite (bundled, not runtime-fetched)
- Phase 19 ships with default GTD Personal binder config only

### Claude's Discretion
- Binary classifier confidence thresholds (based on P/R curves during training)
- MLP hidden layer sizes if (128,64) doesn't perform
- Faker template designs and diversity patterns
- Graph table direction handling (single-direction + helper vs bidirectional)
- Worker message protocol additions
- Exact scoring mechanism for tier-optimal option generation
- How cloud multi-turn reasoning is structured for option generation

### Deferred Ideas (OUT OF SCOPE)
- Knowledge graph engine (full traversal, inference, entity resolution) -- v5.0
- Cross-atom learning ("user usually means X when they say Y") -- v5.0
- Background cloud graph enrichment -- v5.0+
- Location awareness -- future PWA enhancement
- Calendar/API drivers -- future
- Proactive gap detection -- future
- Voice input for clarification -- future
- Alternate binder types (Research Notebook, Project Management) -- future
- Automatic freeform-to-option promotion -- future enhancement
</user_constraints>

<phase_requirements>
## Phase Requirements

Phase 19 has no formal requirement IDs in REQUIREMENTS.md (it was added to the roadmap after initial requirements were defined). Requirements are derived from CONTEXT.md decisions:

| ID | Description | Research Support |
|----|-------------|-----------------|
| CLAR-01 | Completeness gate ONNX classifier detects well-specified vs incomplete atoms | Training pipeline (scripts 30-32), embedding worker integration, (128,64) MLP pattern |
| CLAR-02 | 5 binary missing-info ONNX classifiers detect specific gaps per category | Same training pipeline with --classifier flag, individual ONNX files per category |
| CLAR-03 | Completeness gate runs in triage cascade after type classification | Triage cascade insertion point (triage.ts), consensus logic with binary classifiers |
| CLAR-04 | ClarificationFlow modal presents one question at a time with skip/partial-answer | DecompositionFlow pattern, AIQuestionFlow option pattern |
| CLAR-05 | Tier-adaptive option generation (templates offline, cloud-enhanced with 2s timeout) | Binder type config templates, cloud adapter integration, prefetch logic |
| CLAR-06 | Self-learning via correction log (frequency ranking, skip patterns) | Classification-log extension, option ranking algorithm |
| CLAR-07 | Atom enrichment appends structured key:value lines, triggers re-triage | Content mutation pattern, triage re-run integration |
| CLAR-08 | Entity graph Dexie table seeded from clarification + decomposition + similarity + GTD | v6 Dexie migration, graph seeding from 4 sources |
| CLAR-09 | Binder type extensibility architecture via JSON config at src/config/binder-types/ | Config schema, Vite build-time import, default GTD Personal config |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| onnxruntime-web | (existing) | ONNX inference in embedding worker | Already used for 7 classifiers; proven pattern |
| sentence-transformers | (existing) | MiniLM embeddings for training | Same as Phases 9-18 training pipeline |
| sklearn MLPClassifier | (existing) | Binary classifier training with Platt calibration | Phase 17/18 proven (128,64) MLP pattern |
| Faker | (existing) | Synthetic training data generation | Phases 14-18 pattern |
| Dexie | (existing) | IndexedDB for entity_graph table | All DB tables use Dexie |
| SolidJS | (existing) | ClarificationFlow component | Project UI framework |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| skl2onnx | (existing) | Export sklearn MLP to ONNX format | Training script 31 |
| @huggingface/transformers | (existing) | MiniLM pipeline in embedding worker | Embed text once, classify many |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| 6 separate ONNX models | Single multi-output model | Separate = independent retrainability (user decision: locked) |
| (128,64) MLP | Larger (256,128) | Binary classifiers are simpler; (128,64) should suffice. Adjust only if accuracy < 95% |

**Installation:** No new dependencies needed -- all libraries already in project.

## Architecture Patterns

### Recommended Project Structure
```
scripts/train/
  30_generate_clarification_data.py    # Faker-based synthetic data (20k+ examples)
  31_train_clarification_classifier.py # Train with --classifier flag per model
  32_validate_clarification.mjs        # Node.js validation of all 6 models
scripts/training-data/
  clarification-completeness.jsonl     # Completeness gate data
  clarification-missing-outcome.jsonl  # Per-category data
  clarification-missing-next-action.jsonl
  clarification-missing-timeframe.jsonl
  clarification-missing-context.jsonl
  clarification-missing-reference.jsonl
public/models/classifiers/
  completeness-gate.onnx + -classes.json
  missing-outcome.onnx + -classes.json
  missing-next-action.onnx + -classes.json
  missing-timeframe.onnx + -classes.json
  missing-context.onnx + -classes.json
  missing-reference.onnx + -classes.json
src/config/binder-types/
  index.ts                    # Build-time config aggregator
  gtd-personal.json           # Default binder type config
src/ai/clarification/
  types.ts                    # ClarificationResult, MissingInfoCategory, etc.
  question-templates.ts       # Template option generation from binder config
  enrichment.ts               # Append structured key:value to atom content
  cloud-options.ts            # Cloud option generation + prefetch
src/storage/
  migrations/v6.ts            # entity_graph table
  entity-graph.ts             # Graph seeding helpers
src/ui/components/
  ClarificationFlow.tsx       # Modal overlay component
```

### Pattern 1: Training Script with --classifier Flag
**What:** Single training script that trains any of the 6 classifiers based on a CLI flag, reusing the same MLP + Platt + ONNX export pipeline.
**When to use:** Training or retraining any individual classifier.
**Example:**
```python
# Train completeness gate
python -u scripts/train/31_train_clarification_classifier.py --classifier completeness-gate

# Train specific binary classifier
python -u scripts/train/31_train_clarification_classifier.py --classifier missing-outcome

# Config per classifier
CLASSIFIERS = {
    "completeness-gate": {
        "input_file": "clarification-completeness.jsonl",
        "output_model": "completeness-gate.onnx",
        "output_classes": "completeness-gate-classes.json",
        "hidden_layers": (128, 64),
    },
    "missing-outcome": { ... },
    # ... etc
}
```

### Pattern 2: Lazy-Loading Classifier Groups in Embedding Worker
**What:** Completeness gate loads lazily on first triage ambiguity; 5 binary classifiers load lazily on user tap "Clarify this".
**When to use:** Extending the embedding worker ClassifierConfig registry pattern.
**Example:**
```typescript
// In embedding-worker.ts
const COMPLETENESS_GATE: ClassifierConfig = {
  name: 'completeness-gate',
  modelPath: 'models/classifiers/completeness-gate.onnx',
  classesPath: 'models/classifiers/completeness-gate-classes.json',
  session: null, classMap: null, loading: false,
};

const MISSING_INFO_CLASSIFIERS: ClassifierConfig[] = [
  { name: 'missing-outcome', modelPath: 'models/classifiers/missing-outcome.onnx', ... },
  { name: 'missing-next-action', ... },
  { name: 'missing-timeframe', ... },
  { name: 'missing-context', ... },
  { name: 'missing-reference', ... },
];

// New message types
| { type: 'CHECK_COMPLETENESS'; id: string; text: string }
| { type: 'CLASSIFY_MISSING_INFO'; id: string; text: string }
```

### Pattern 3: Consensus Logic (Gate + Binary)
**What:** Completeness gate returns `incomplete` confidence. If above 0.75, run 5 binary classifiers. Only show "Clarify this" if gate says incomplete AND at least one binary says missing.
**When to use:** Triage cascade, after type classification.
**Example:**
```typescript
// In triage.ts, after type classification succeeds:
const completenessResult = await dispatchTiered({
  requestId: crypto.randomUUID(),
  task: 'check-completeness',
  features: { content: item.content, title: item.title },
});

if (completenessResult.result.confidence >= 0.75) {
  suggestion.needsClarification = true;
  suggestion.completenessScore = completenessResult.result.confidence;
}
```

### Pattern 4: ClarificationFlow (Modal Overlay)
**What:** Same pattern as DecompositionFlow -- module-level signals, modal overlay, one question at a time.
**When to use:** When user taps "Clarify this" on a triage card.
**Key differences from DecompositionFlow:**
- Questions come from binder type config + binary classifier results (not ONNX category templates)
- 3-4 answer options per question + freeform input
- Cloud option enhancement with 2s timeout
- Summary screen shows enriched content preview
- Auto re-triage after close

### Pattern 5: Entity Graph Seeding
**What:** New Dexie table for entity-relationship storage, seeded from multiple sources.
**When to use:** Every time structured data is captured (clarification answers, decomposition steps, triage similarity, GTD context tags).
**Example:**
```typescript
// entity_graph table schema
interface EntityGraphEntry {
  id: string;                     // UUID
  sourceAtomId: string;           // Which atom this relationship belongs to
  entityType: string;             // 'outcome' | 'deadline' | 'context' | 'reference' | 'person' | 'parent' | 'related' | 'context-tag'
  entityValue: string;            // The extracted value
  relationship: string;           // 'has-outcome' | 'has-deadline' | 'has-context' | 'has-reference' | 'involves-person' | 'parent-of' | 'child-of' | 'related-to' | 'tagged-with'
  targetValue: string;            // Optional target (e.g., child atom ID for parent-of)
  createdAt: number;              // Timestamp
}

// Dexie v6 migration
db.version(6).stores({
  ...existingStores,
  entityGraph: '&id, sourceAtomId, [sourceAtomId+entityType], entityType, relationship',
});
```

### Anti-Patterns to Avoid
- **Loading all 6 models eagerly:** Memory waste -- lazy-load gate on first triage, binary classifiers on user tap only
- **Running ONNX sessions concurrently:** WASM single-threaded backend errors with "Session already started" -- MUST run sequentially (established Phase 17 lesson)
- **Importing store in clarification modules:** Pure module pattern -- all state passed by caller
- **Auto-triggering clarification without user consent:** User decision: always user-triggered via button
- **Building custom option generation for each atom type:** Use binder type config templates -- extensible, not hardcoded

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ONNX model loading | Custom fetch + session init | `loadClassifierConfig()` from embedding-worker.ts | Already handles Cache API, progress, WASM config |
| MLP training + ONNX export | Custom training loop | sklearn MLPClassifier + skl2onnx pattern from scripts 21/31 | Platt calibration, proven export pipeline |
| Step-by-step modal UX | New modal system | DecompositionFlow pattern (module-level signals, backdrop, keyboard) | Consistent UX, proven SolidJS pattern |
| Entity extraction for slot-filling | New NER system | Existing `detectWithRegex` from slot-extractor.ts + sanitization NER | Phase 18 established: regex for PERSON/LOCATION |
| Question option display | Custom option UI | AIQuestionFlow option pattern (3-4 buttons + freeform) | Established UX pattern |
| Dexie schema migration | Manual IndexedDB upgrade | applyV6Migration pattern following v5.ts | Clean version chaining |

**Key insight:** Phase 19's novelty is in the orchestration (consensus logic, tier-adaptive options, graph seeding) -- the building blocks are all established patterns from Phases 14-18.

## Common Pitfalls

### Pitfall 1: ONNX Session Concurrency in Embedding Worker
**What goes wrong:** Running multiple ONNX inference sessions concurrently causes "Session already started" errors in WASM backend.
**Why it happens:** ONNX Runtime Web's single-threaded WASM backend cannot handle concurrent sessions.
**How to avoid:** Run all 5 binary classifiers sequentially (same pattern as GTD classifiers in Phase 17). The completeness gate also runs sequentially with the existing type classifier.
**Warning signs:** Sporadic inference failures in worker, especially on fast consecutive triage items.

### Pitfall 2: Training Data Imbalance for Binary Classifiers
**What goes wrong:** Binary classifiers (missing vs not-missing) can be biased if positive/negative ratio isn't balanced.
**Why it happens:** Real-world atoms are more often "not missing" for each individual category.
**How to avoid:** Generate balanced datasets (equal "missing" and "not-missing" counts per category, as specified: 2000 per category means 1000 positive + 1000 negative). Use stratified train/test split.
**Warning signs:** High accuracy but low recall on one class; classifier always predicts majority class.

### Pitfall 3: Script Numbering Collision
**What goes wrong:** Phase 19 scripts named 30_generate, 31_train, 32_validate collide with Phase 18 decomposition scripts.
**Why it happens:** CONTEXT.md specifies "30_generate" but Phase 18 already uses 30-32.
**How to avoid:** Use 40_generate_clarification_data.py, 41_train_clarification_classifier.py, 42_validate_clarification.mjs. The CONTEXT.md decision says "3 numbered scripts: generate (30), train (31), validate (32)" but this must be interpreted as the NEXT available slot (40, 41, 42) to avoid collision.
**Warning signs:** Overwriting existing Phase 18 scripts.

### Pitfall 4: Cloud Option Timeout Racing with Modal Close
**What goes wrong:** Cloud option prefetch or 2s timeout fires after user has already closed the modal or moved to next question.
**Why it happens:** Async cloud call outlasts UX interaction.
**How to avoid:** Use AbortController per question; abort on question advance or modal close. Guard against state updates on unmounted signals.
**Warning signs:** Stale option updates appearing after user has advanced.

### Pitfall 5: Re-Triage Infinite Loop
**What goes wrong:** After clarification enriches atom text, auto re-triage runs completeness gate again, which might still flag "incomplete," causing the user to see "Clarify this" repeatedly.
**Why it happens:** Enriched text with structured key:value lines may still trigger the completeness gate if the model isn't trained on enriched formats.
**How to avoid:** Include examples of enriched text (with `\n---\nOutcome: ...` sections) in the "complete/well-specified" training data. Alternatively, strip enrichment lines before completeness gate inference.
**Warning signs:** "Clarify this" button re-appears after user just completed clarification.

### Pitfall 6: Dexie Version Mismatch
**What goes wrong:** New v6 migration collides or skips if v5 migration wasn't applied.
**Why it happens:** Dexie requires sequential version numbers.
**How to avoid:** Verify current max version (v5), create v6 next. Follow applyV5Migration pattern exactly.
**Warning signs:** "Version upgrade failed" errors on app load.

### Pitfall 7: Embedding Worker Memory Pressure
**What goes wrong:** Loading 12+ ONNX sessions (1 type + 4 GTD + 1 decomposition + 1 gate + 5 binary) exhausts worker memory.
**Why it happens:** Each ONNX session allocates WASM memory.
**How to avoid:** Binary (128,64) models are small (~200KB each). Gate + 5 binary = ~1.2MB total ONNX. MiniLM embedding model is the heavy one (~23MB). Monitor total worker memory. Consider session disposal for rarely-used models if needed.
**Warning signs:** Worker crashes or OOM on mobile devices.

## Code Examples

### Extending Tier2 Types for Completeness + Clarification
```typescript
// In src/ai/tier2/types.ts
export type AITaskType =
  | 'classify-type'
  | 'classify-gtd'
  | 'route-section'
  | 'extract-entities'
  | 'assess-staleness'
  | 'summarize'
  | 'analyze-gtd'
  | 'decompose'
  | 'check-completeness'      // NEW: completeness gate
  | 'classify-missing-info';   // NEW: 5 binary classifiers

export const CONFIDENCE_THRESHOLDS: Record<AITaskType, number> = {
  // ... existing entries ...
  'check-completeness': 0.75,       // Moderate gate threshold
  'classify-missing-info': 0.50,    // Claude's discretion based on P/R curves
};
```

### TriageSuggestion Extension
```typescript
// In src/ai/triage.ts - add to TriageSuggestion interface
export interface TriageSuggestion {
  // ... existing fields ...
  /** Whether completeness gate flagged this atom as needing clarification */
  needsClarification?: boolean;
  /** Completeness gate confidence score */
  completenessScore?: number;
  /** Which categories were detected as missing (only populated after user taps Clarify) */
  missingCategories?: string[];
  /** Whether this atom was enriched via clarification */
  wasClarified?: boolean;
}
```

### Binder Type Config Schema
```typescript
// src/config/binder-types/gtd-personal.json
{
  "name": "GTD Personal",
  "purpose": "Getting Things Done personal productivity",
  "categoryOrdering": [
    "missing-outcome",
    "missing-next-action",
    "missing-timeframe",
    "missing-context",
    "missing-reference"
  ],
  "supportedAtomTypes": ["task", "fact", "event", "decision", "insight"],
  "questionTemplates": {
    "missing-outcome": {
      "question": "What's the desired outcome?",
      "options": {
        "task": [
          "Complete {topic}",
          "Resolve {topic} issue",
          "Get {topic} approved",
          "{freeform}"
        ],
        "decision": [
          "Choose between options for {topic}",
          "Finalize {topic} decision",
          "{freeform}"
        ]
      }
    },
    "missing-timeframe": {
      "question": "By when?",
      "options": {
        "_default": [
          "Today",
          "This week",
          "This month",
          "No deadline",
          "{freeform}"
        ]
      }
    }
  },
  "backgroundCloudEnrichment": false
}
```

### Classification Log Extension for Clarification Events
```typescript
// Extend ClassificationEvent or add new interface
interface ClarificationEvent {
  type: 'clarification';
  atomId: string;
  atomText: string;
  detectedCategory: string;
  optionsShown: string[];
  optionSelected: string | null;
  wasFreeform: boolean;
  freeformText: string | null;
  timestamp: number;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Centroid classification | ONNX MLP classifiers | Phase 10 | Sub-second, higher accuracy |
| Single type classifier | Registry pattern (ClassifierConfig) | Phase 17 | Extensible multi-model support |
| Hardcoded GTD logic | ONNX classifiers per concern | Phase 17 | Trainable, data-driven |
| No decomposition | ONNX pattern classification + templates | Phase 18 | Structured breakdown |
| No completeness detection | Binary ONNX gate + 5 classifiers | Phase 19 (this) | Gap detection + guided enrichment |

**Note on training pipeline evolution:** Each phase (9, 14, 17, 18) has refined the training pattern. Phase 19 inherits the mature version: Faker generation -> MiniLM embedding -> sklearn MLP -> Platt calibration -> ONNX export -> Node.js validation. The --classifier flag pattern (single script, multiple models) is new but follows naturally from Phase 17's 4-model training.

## Open Questions

1. **Script Numbering**
   - What we know: CONTEXT.md says "30_generate, 31_train, 32_validate" but Phase 18 already uses 30-32
   - What's unclear: Whether user intended these exact numbers or just the pattern
   - Recommendation: Use 40, 41, 42 to avoid collision. Clarify with user if needed, but collision is clearly unintentional.

2. **Entity Graph Direction Handling (Claude's Discretion)**
   - What we know: CRDT-friendly design requires individual records per relationship
   - What's unclear: Store bidirectional (parent-of + child-of as separate records) vs single-direction + query helper
   - Recommendation: Single-direction storage + helper function `getRelationships(atomId)` that queries both `sourceAtomId` and `targetValue` columns. Fewer records, simpler conflict resolution, bidirectional query via helper.

3. **Cloud Multi-Turn Reasoning Structure (Claude's Discretion)**
   - What we know: Cloud generates atom-specific custom options via sanitized prompt
   - What's unclear: Exact prompt structure for multi-turn option generation
   - Recommendation: Single cloud request with system prompt including binder purpose + user patterns from correction log + atom context. Response format: JSON array of 3-4 option strings. Multi-turn hidden = the prompt itself contains reasoning context, not actual multi-turn API calls.

4. **Worker Memory Budget with 12+ ONNX Sessions**
   - What we know: Each (128,64) binary model is ~200KB ONNX file
   - What's unclear: Actual WASM memory overhead per session on mobile
   - Recommendation: Monitor during implementation. Gate + 5 binary = ~1.2MB model files, WASM session overhead likely adds 2-3x. Total ~4MB for Phase 19 models is well within budget alongside existing models.

## Validation Architecture

> nyquist_validation key absent from config.json -- treating as enabled.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Python unittest (training) + Node.js validation scripts |
| Config file | None -- scripts are self-contained |
| Quick run command | `node scripts/train/42_validate_clarification.mjs` |
| Full suite command | `python -u scripts/train/41_train_clarification_classifier.py --classifier all && node scripts/train/42_validate_clarification.mjs` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CLAR-01 | Completeness gate >95% accuracy | unit (training) | `python -u scripts/train/41_train_clarification_classifier.py --classifier completeness-gate` | Wave 0 |
| CLAR-02 | 5 binary classifiers >95% accuracy each | unit (training) | `python -u scripts/train/41_train_clarification_classifier.py --classifier all` | Wave 0 |
| CLAR-02 | >95% Python/Node parity | integration | `node scripts/train/42_validate_clarification.mjs` | Wave 0 |
| CLAR-03 | Completeness gate in triage cascade | manual-only | Triage inbox item and verify "Clarify this" appears for vague items | N/A |
| CLAR-04 | ClarificationFlow modal UX | manual-only | Tap "Clarify this", walk through questions, verify partial answers | N/A |
| CLAR-05 | Tier-adaptive options | manual-only | Test with cloud disabled (templates) and enabled (cloud + timeout) | N/A |
| CLAR-06 | Self-learning corrections | manual-only | Run clarification multiple times, verify option ranking changes | N/A |
| CLAR-07 | Atom enrichment + re-triage | manual-only | Complete clarification, verify enriched text and re-triage result | N/A |
| CLAR-08 | Entity graph table + seeding | smoke | Verify Dexie migration succeeds, records created on clarification | N/A |
| CLAR-09 | Binder type config loading | unit | Verify gtd-personal.json loads at build time, categories resolve | N/A |

### Sampling Rate
- **Per task commit:** `node scripts/train/42_validate_clarification.mjs` (when training artifacts change)
- **Per wave merge:** Full training + validation pipeline
- **Phase gate:** All 6 models >95% accuracy + parity, manual UX walkthrough

### Wave 0 Gaps
- [ ] `scripts/train/40_generate_clarification_data.py` -- synthetic data generator
- [ ] `scripts/train/41_train_clarification_classifier.py` -- training script with --classifier flag
- [ ] `scripts/train/42_validate_clarification.mjs` -- Node.js parity validation
- [ ] `scripts/training-data/clarification-*.jsonl` -- 6 training data files
- [ ] `src/storage/migrations/v6.ts` -- entity_graph table migration

## Sources

### Primary (HIGH confidence)
- Existing codebase: `src/ai/tier2/tier2-handler.ts`, `src/search/embedding-worker.ts` -- established ONNX patterns
- Existing codebase: `src/ui/components/DecompositionFlow.tsx` -- modal UX pattern
- Existing codebase: `scripts/train/31_train_decomposition_classifier.py` -- MLP + ONNX training pattern
- Existing codebase: `src/storage/classification-log.ts` -- correction logging pattern
- Existing codebase: `src/storage/db.ts` + `migrations/v5.ts` -- Dexie migration pattern

### Secondary (MEDIUM confidence)
- CONTEXT.md decisions -- user-provided specifications for all major architecture choices

### Tertiary (LOW confidence)
- Worker memory estimates (~200KB per (128,64) model, ~4MB total for 6 models) -- needs validation during implementation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in project, no new dependencies
- Architecture: HIGH -- follows proven Phases 17-18 patterns for training, worker, UX
- Pitfalls: HIGH -- derived from actual bugs encountered in Phases 17-18 (ONNX concurrency, WASM paths, Dexie versions)
- Training pipeline: HIGH -- exact same pattern used 4 times previously
- Graph schema: MEDIUM -- new table design, but follows Dexie patterns; direction handling is Claude's discretion
- Binder config: MEDIUM -- new architecture concern; straightforward JSON config but no prior art in this codebase

**Research date:** 2026-03-08
**Valid until:** 2026-04-08 (stable -- no external dependencies changing)
