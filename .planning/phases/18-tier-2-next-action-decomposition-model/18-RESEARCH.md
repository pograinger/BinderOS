# Phase 18: Tier 2 Next Action Decomposition Model - Research

**Researched:** 2026-03-08
**Domain:** ONNX pattern classification + template-based task decomposition
**Confidence:** HIGH

## Summary

Phase 18 adds an ONNX-based decomposition classifier that breaks multi-step tasks and decisions into GTD-style next actions. The approach is pattern classification + slot-filled templates: an MLP classifies input text into one of ~30-50 decomposition pattern categories (e.g., "plan-event", "research-purchase"), then a template engine fills entity slots extracted from the original text to produce personalized steps.

This phase has extremely high alignment with established codebase patterns. The training pipeline (scripts 20/21), ONNX worker infrastructure, classifier registry, and AIQuestionFlow UI all exist and have been proven across Phases 10, 14, and 17. The primary new work is: (1) designing the decomposition pattern categories and their template steps, (2) generating training data, (3) training/deploying the ONNX model, and (4) wiring the "break this down" button through AIQuestionFlow.

**Primary recommendation:** Follow the Phase 17 pattern exactly -- script 30 generates JSONL training data with Faker templates, script 31 trains MLP + Platt + ONNX export, script 32 validates Python/Node parity. The decomposition model uses the same (256, 128) MLP architecture as the multi-class GTD classifiers. Template steps and slot extraction are runtime TypeScript, not trained.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Pattern classification + slot-filled templates (same philosophy as Phase 12 template engine -- zero LLM, deterministic)
- ONNX MLP classifies task/decision into a decomposition pattern category (e.g., 'plan-event', 'research-purchase', 'organize-space')
- Each pattern category maps to a template with 3-5 steps containing placeholder slots
- Slot extraction uses regex + NER from the existing sanitization worker (Phase 14) to extract entities from the original text
- Slots filled into template steps to produce personalized decomposition
- Fine-grained categories (~30-50 total)
- Separate categories for tasks vs decisions
- Decision-specific patterns: 'Decide on X' -> ['Research options', 'Compare criteria', 'Make decision', 'Communicate decision']
- User-triggered only -- "break this down" button, not automatic on triage
- Button visible on ALL task atoms and decision atoms (not gated by project-detection)
- Works on both task and decision atom types
- One level of decomposition only
- Uses existing AIQuestionFlow pattern -- shows steps one at a time with accept/edit/skip per step
- AI decides the atom type for each generated step (task, decision, etc.) -- user can override during the flow
- After decomposition, flow asks "Mark this as a project?" for the parent atom
- Each decomposed step gets section assignment via the section routing classifier
- GTD-centric life patterns: plan event, research purchase, organize space, learn skill, complete application, medical/health tasks, home improvement, travel planning, career moves
- 1000 training examples per pattern category (Faker-based generation)
- Same MiniLM + MLP + ONNX architecture as Phase 17 classifiers

### Claude's Discretion
- Exact decomposition pattern categories and their template steps
- MLP hidden layer sizes and training hyperparameters
- Faker template designs for training data generation
- How slot extraction regex patterns are designed
- Worker message protocol additions
- Confidence threshold for pattern classification

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| sentence-transformers | 3.x | Python embedding (MiniLM-L6-v2) for training | Same as Phase 17 |
| scikit-learn | 1.x | MLPClassifier + CalibratedClassifierCV | Same as Phase 17 |
| skl2onnx | latest | ONNX export with opset 17 | Same as Phase 17 |
| onnxruntime | latest | Python validation of exported model | Same as Phase 17 |
| onnxruntime-web | in-repo | Browser ONNX inference (WASM backend) | Already loaded in embedding worker |
| @huggingface/transformers | in-repo | MiniLM embedding pipeline | Already loaded in embedding worker |
| faker | 33.x | Python synthetic data generation | Same as Phase 17 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| onnxruntime-node | in-repo (devDep) | Node.js parity validation script | Script 32 validation |
| onnx (Python) | latest | Graph validation during export | Training time only |

No new dependencies required. All libraries already in the project.

## Architecture Patterns

### Recommended Project Structure
```
scripts/
  train/
    30_generate_decomposition_data.py   # Faker-based JSONL generation
    31_train_decomposition_classifier.py # MiniLM embed + MLP + Platt + ONNX
    32_validate_decomposition_model.mjs  # Python/Node parity check
  training-data/
    decomposition.jsonl                  # Generated training data

public/
  models/
    classifiers/
      decomposition.onnx                # Trained ONNX model
      decomposition-classes.json         # Index-to-label mapping

src/
  ai/
    decomposition/
      categories.ts          # Pattern category definitions + template steps
      slot-extractor.ts      # Regex + NER entity extraction for slot-filling
      decomposer.ts          # Main decomposition pipeline (classify + fill)
    tier2/
      types.ts               # Add 'decompose' to AITaskType
      tier2-handler.ts       # Extend canHandle/handle for decomposition
  search/
    embedding-worker.ts      # Add CLASSIFY_DECOMPOSE message type
  ui/
    components/
      DecompositionFlow.tsx  # AIQuestionFlow-based step presentation
    views/
      InboxView.tsx          # Add "break this down" button to triage cards
```

### Pattern 1: Classifier Registry Extension
**What:** Add decomposition classifier to the existing ClassifierConfig registry pattern in embedding-worker.ts
**When to use:** Loading the ONNX model lazily on first decomposition request
**Example:**
```typescript
// In embedding-worker.ts -- follows GTD_CLASSIFIERS pattern exactly
const DECOMPOSITION_CLASSIFIER: ClassifierConfig = {
  name: 'decomposition',
  modelPath: 'models/classifiers/decomposition.onnx',
  classesPath: 'models/classifiers/decomposition-classes.json',
  session: null, classMap: null, loading: false,
};
```
Source: Existing `GTD_CLASSIFIERS` array in `src/search/embedding-worker.ts` lines 183-192.

### Pattern 2: Worker Message Protocol Extension
**What:** Add CLASSIFY_DECOMPOSE message type to embedding worker
**When to use:** Classifying text into decomposition pattern category
**Example:**
```typescript
// New incoming message type
| { type: 'CLASSIFY_DECOMPOSE'; id: string; text: string }

// New outgoing message types
| { type: 'DECOMPOSE_RESULT'; id: string; scores: Record<string, number>; vector: number[] }
| { type: 'DECOMPOSE_ERROR'; id: string; error: string }
```
Source: Existing CLASSIFY_GTD / GTD_RESULT pattern in embedding-worker.ts.

### Pattern 3: Template Step Definition
**What:** Static TypeScript objects defining decomposition templates per pattern category
**When to use:** After ONNX classification determines the pattern category
**Example:**
```typescript
interface DecompositionTemplate {
  category: string;           // e.g., 'plan-event'
  applicableTo: ('task' | 'decision')[];
  steps: TemplateStep[];
}

interface TemplateStep {
  template: string;           // e.g., "Research {topic} options"
  defaultType: AtomType;      // AI-suggested atom type for this step
  slots: string[];            // Which slots this step needs: ['topic']
}

// Example category
const PLAN_EVENT: DecompositionTemplate = {
  category: 'plan-event',
  applicableTo: ['task'],
  steps: [
    { template: 'Choose a date for {topic}', defaultType: 'task', slots: ['topic'] },
    { template: 'Research venue options for {topic}', defaultType: 'task', slots: ['topic'] },
    { template: 'Create guest list for {topic}', defaultType: 'task', slots: ['topic'] },
    { template: 'Send invitations for {topic}', defaultType: 'task', slots: ['topic'] },
    { template: 'Confirm final details for {topic}', defaultType: 'task', slots: ['topic'] },
  ],
};
```

### Pattern 4: Slot Extraction Pipeline
**What:** Extract named entities from input text to fill template slots
**When to use:** After classification, before template rendering
**Example:**
```typescript
interface ExtractedSlots {
  topic: string;       // Primary subject extracted from text
  person: string;      // Person name (from NER or regex)
  location: string;    // Place (from NER or regex)
  item: string;        // Object/thing referenced
  event: string;       // Event name
}

// Extraction strategy:
// 1. Use sanitization regex patterns for names, locations
// 2. Use simple noun-phrase extraction for topic/item
// 3. Fall back to full input text as {topic} if no specific entity found
```

### Anti-Patterns to Avoid
- **Do NOT run decomposition during auto-triage:** User-triggered only via button. Adding it to the automatic triage pipeline would slow down card processing and confuse users.
- **Do NOT inherit section from parent atom:** Each decomposed step gets independent section routing via the existing section classifier.
- **Do NOT import store in decomposition modules:** Follow the pure module pattern -- all state passed by caller.
- **Do NOT use Promise.all for multiple ONNX inferences:** WASM backend is single-threaded; concurrent sessions error with "Session already started" (Phase 17 lesson).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ONNX model loading + caching | Custom fetch + cache logic | Existing `fetchWithCache()` + `loadClassifierConfig()` in embedding-worker.ts | Handles Cache API, progress reporting, GitHub Pages base path |
| Training pipeline | New training infrastructure | Extend scripts 20/21/22 pattern (scripts 30/31/32) | Proven MiniLM + MLP + Platt + ONNX pipeline |
| Entity extraction | Custom NER system | Reuse sanitization regex-patterns.ts for names/contacts | Already handles emails, phones, names with high precision |
| Step-by-step UI | Custom modal system | Extend AIQuestionFlow component | Already has option buttons, accept/cancel, keyboard support |
| Confidence calibration | Raw softmax thresholding | Platt calibration (CalibratedClassifierCV) | Produces well-calibrated probabilities for thresholding |

**Key insight:** This phase is primarily a content exercise (designing 30-50 decomposition categories and their template steps) plus wiring into existing infrastructure. The ML pipeline and UI patterns are fully established.

## Common Pitfalls

### Pitfall 1: ONNX Sequential Inference Requirement
**What goes wrong:** Running decomposition + type classification concurrently crashes WASM ONNX backend
**Why it happens:** ONNX Runtime WASM is single-threaded; concurrent InferenceSession.run() calls error
**How to avoid:** Queue decomposition requests after any pending GTD/type classification completes. Use the same sequential execution pattern as CLASSIFY_GTD handler.
**Warning signs:** "Session already started" errors in console

### Pitfall 2: Category Count vs Training Quality Tradeoff
**What goes wrong:** 50 categories with 1000 examples each = 50,000 training examples; MLP may underfit fine-grained categories with similar semantic content
**Why it happens:** Categories like "plan-event" and "organize-gathering" have overlapping semantics in 384-dim embedding space
**How to avoid:** Start with ~30 well-separated categories. Merge semantically overlapping categories. Test confusion matrix during training for inter-category bleed. Aim for >95% accuracy on test set (matching Phase 17 standard).
**Warning signs:** Confusion matrix shows high off-diagonal values between similar categories

### Pitfall 3: Slot Extraction Mismatch
**What goes wrong:** Template expects {person} but input text doesn't contain a recognizable name
**Why it happens:** Not every task mentions a person, location, or specific entity
**How to avoid:** Design templates with a universal {topic} slot that always gets filled (extracted as the noun phrase or full input text). Other slots ({person}, {location}) are optional -- if not found, omit that detail from the step text. Use a graceful fallback: "Research options" instead of "Research {unfilled} options".
**Warning signs:** Template produces text with empty or "{undefined}" placeholders

### Pitfall 4: Embedding Normalization Mismatch
**What goes wrong:** Python sentence-transformers and browser Transformers.js produce different vectors for same text
**Why it happens:** Different normalization settings (normalize_embeddings=True must be set in Python)
**How to avoid:** Already solved in Phase 10/17 -- use `normalize_embeddings=True` in Python training, browser pipeline produces normalized vectors by default.
**Warning signs:** Node.js validation script shows >5% prediction mismatch with Python

### Pitfall 5: AIQuestionFlow Single-Step Limitation
**What goes wrong:** AIQuestionFlow currently shows options for a single question, but decomposition needs to present 3-5 steps sequentially
**Why it happens:** Original component designed for single-choice flows, not multi-step approval
**How to avoid:** Extend AIQuestionFlow or create a DecompositionFlow component that iterates through steps, showing accept/edit/skip for each. The flow state machine needs to track current step index and accumulated accepted steps.
**Warning signs:** All steps shown at once instead of one-at-a-time; no edit capability per step

### Pitfall 6: Decision vs Task Category Overlap
**What goes wrong:** "Research new laptop" could be task pattern or decision pattern
**Why it happens:** Decisions often start with research steps identical to tasks
**How to avoid:** The type classifier runs first and determines if atom is task or decision. Decomposition classifier should have separate category spaces: task categories (plan-*, organize-*, complete-*) and decision categories (decide-*, evaluate-*, choose-*). The atom type filters which categories are valid.
**Warning signs:** Decision atoms getting task decomposition patterns or vice versa

## Code Examples

### Training Data Generation (Script 30)
```python
# Follow exact pattern from 20_generate_gtd_data.py
# Source: scripts/train/20_generate_gtd_data.py

DECOMPOSITION_TEMPLATES = {
    "plan-event": [
        "Plan {person}'s birthday party",
        "Organize a team lunch at {location}",
        "Set up a meeting with {person} about {topic}",
        "Arrange {event} for {date}",
    ],
    "research-purchase": [
        "Buy a new {item}",
        "Find the best {item} for the {room}",
        "Shop for {item} at {store}",
        "Get a replacement {item}",
    ],
    # ... 28-48 more categories
}

# Each category gets 1000 examples via Faker fill_template()
# Output: scripts/training-data/decomposition.jsonl
```

### Classifier Config (Script 31)
```python
# Follow exact pattern from 21_train_gtd_classifier.py
CLASSIFIER_CONFIGS = {
    "decomposition": {
        "hidden_layers": (256, 128),  # Multi-class -> larger architecture
        "confidence_threshold": 0.60, # Lower than type classifier due to more classes
        "input_file": "decomposition.jsonl",
        "output_model": "decomposition.onnx",
        "output_classes": "decomposition-classes.json",
    },
}
```

### Template Category Registry (Runtime TypeScript)
```typescript
// src/ai/decomposition/categories.ts
// Source: Established pattern from Phase 12 template engine

export const DECOMPOSITION_CATEGORIES: Record<string, DecompositionTemplate> = {
  'plan-event': {
    category: 'plan-event',
    applicableTo: ['task'],
    steps: [
      { template: 'Choose a date for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Book a venue for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Create guest list for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Send invitations for {topic}', defaultType: 'task', slots: ['topic'] },
    ],
  },
  'decide-vendor': {
    category: 'decide-vendor',
    applicableTo: ['decision'],
    steps: [
      { template: 'Research {topic} options', defaultType: 'task', slots: ['topic'] },
      { template: 'Define criteria for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Compare top candidates for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Make final decision on {topic}', defaultType: 'decision', slots: ['topic'] },
      { template: 'Communicate {topic} decision to stakeholders', defaultType: 'task', slots: ['topic'] },
    ],
  },
};
```

### Worker Integration
```typescript
// In embedding-worker.ts -- add to WorkerIncoming union and message handler
// Source: CLASSIFY_GTD pattern in embedding-worker.ts lines 483-526

if (msg.type === 'CLASSIFY_DECOMPOSE') {
  try {
    if (!decompositionClassifierLoaded) {
      await loadClassifierConfig(DECOMPOSITION_CLASSIFIER);
      decompositionClassifierLoaded = true;
      self.postMessage({ type: 'DECOMPOSITION_CLASSIFIER_READY' });
    }

    const vectors = await embedTexts([msg.text]);
    const vector = vectors[0] ?? [];
    const scores = await runClassifierOnEmbedding(DECOMPOSITION_CLASSIFIER, vector);

    self.postMessage({ type: 'DECOMPOSE_RESULT', id: msg.id, scores, vector });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    self.postMessage({ type: 'DECOMPOSE_ERROR', id: msg.id, error });
  }
  return;
}
```

### Tier2 Handler Extension
```typescript
// In tier2-handler.ts -- extend canHandle and handle
// Source: classify-gtd pattern in tier2-handler.ts lines 329-364

canHandle(task: AITaskType): boolean {
  // ... existing checks ...
  if (task === 'decompose') return getWorker() !== null;
  return false;
},

async handle(request: TieredRequest): Promise<TieredResult> {
  // ... existing task handlers ...
  if (task === 'decompose') {
    const result = await classifyDecomposeViaWorker(worker, text);
    _lastVector = result.vector;

    // Find top pattern category
    const entries = Object.entries(result.scores).sort((a, b) => b[1] - a[1]);
    const [topCategory, topScore] = entries[0] ?? ['unknown', 0];

    return {
      tier: 2,
      confidence: topScore,
      reasoning: `Decomposition: ${topCategory} (p=${topScore.toFixed(3)})`,
      text: topCategory,  // Reuse text field for category name
    };
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Centroid-only classification | ONNX MLP + Platt calibration | Phase 10/17 | 98%+ accuracy, proper confidence scores |
| Single classifier session | ClassifierConfig registry | Phase 17 | Multiple ONNX models coexist in worker |
| Eager model loading | Lazy loading on first use | Phase 17 | Zero memory until feature is used |
| LLM-based decomposition | Pattern classification + templates | Phase 18 (this) | Zero LLM, deterministic, sub-second |

**Deprecated/outdated:**
- Centroid-based classification: still supported as fallback but ONNX is the primary path for all new classifiers

## Open Questions

1. **Optimal number of decomposition categories**
   - What we know: User specified ~30-50, with separate task vs decision categories
   - What's unclear: The exact sweet spot between granularity and classification accuracy
   - Recommendation: Start with ~35 categories (25 task + 10 decision). Train, check confusion matrix. Merge any categories with >10% mutual confusion. Final count will be data-driven.

2. **Slot extraction complexity**
   - What we know: Sanitization regex handles names, contacts, locations. "Topic" is the hardest slot to extract reliably.
   - What's unclear: How to extract the semantic "topic" from freeform text without NLP
   - Recommendation: Use a simple heuristic -- strip common verbs/prepositions from the input text, remaining noun phrase is the topic. If extraction fails, use the full input text as {topic}. This is sufficient because the user can edit each step.

3. **Confidence threshold for decomposition**
   - What we know: Type classifier uses 0.78, GTD routing uses 0.70
   - What's unclear: With 30-50 classes, expected max probabilities will be lower
   - Recommendation: Start at 0.60 threshold. If classification falls below threshold, show a generic decomposition (the decision-pattern or task-pattern default). Since this is user-triggered (not auto-triage), a lower threshold is acceptable -- the user is already expecting to review steps.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js script (onnxruntime-node) + Python onnxruntime |
| Config file | scripts/train/32_validate_decomposition_model.mjs |
| Quick run command | `node scripts/train/32_validate_decomposition_model.mjs` |
| Full suite command | `node scripts/train/32_validate_decomposition_model.mjs` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| N/A-01 | ONNX model classifies input to correct pattern category | unit | `node scripts/train/32_validate_decomposition_model.mjs` | No - Wave 0 |
| N/A-02 | Python/Node prediction parity >95% | unit | `node scripts/train/32_validate_decomposition_model.mjs` | No - Wave 0 |
| N/A-03 | Template slot-filling produces valid step text | manual-only | Manual verification during step review | N/A |
| N/A-04 | Break-this-down button triggers decomposition flow | manual-only | Manual UI verification | N/A |
| N/A-05 | AIQuestionFlow presents steps one-at-a-time | manual-only | Manual UI verification | N/A |

### Sampling Rate
- **Per task commit:** `node scripts/train/32_validate_decomposition_model.mjs` (after model training)
- **Per wave merge:** Full validation + manual UI check
- **Phase gate:** 95%+ Python/Node parity + manual decomposition flow test

### Wave 0 Gaps
- [ ] `scripts/train/32_validate_decomposition_model.mjs` -- validates ONNX model parity
- [ ] Training data: `scripts/training-data/decomposition.jsonl` -- needs generation via script 30
- [ ] ONNX model: `public/models/classifiers/decomposition.onnx` -- needs training via script 31

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `src/ai/tier2/tier2-handler.ts`, `src/search/embedding-worker.ts` -- established ONNX classifier patterns
- Codebase analysis: `scripts/train/20_generate_gtd_data.py`, `scripts/train/21_train_gtd_classifier.py` -- proven training pipeline
- Codebase analysis: `src/ai/sanitization/sanitizer.ts`, `src/ai/sanitization/regex-patterns.ts` -- entity extraction for slot-filling
- Codebase analysis: `src/ui/components/AIQuestionFlow.tsx` -- UI flow pattern

### Secondary (MEDIUM confidence)
- Phase 17 decisions in STATE.md -- MLP architecture (256,128) confirmed working for multi-class with 98%+ accuracy

### Tertiary (LOW confidence)
- Optimal category count (30-50) -- will be validated empirically during training

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use, zero new dependencies
- Architecture: HIGH -- follows established Phase 17 patterns exactly
- Pitfalls: HIGH -- all pitfalls are from direct Phase 17 experience documented in STATE.md
- Training data design: MEDIUM -- category definitions are discretionary, need empirical validation

**Research date:** 2026-03-08
**Valid until:** 2026-04-08 (stable -- no external dependency changes expected)
