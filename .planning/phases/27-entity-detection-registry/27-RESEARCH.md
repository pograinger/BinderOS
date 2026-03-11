# Phase 27: Entity Detection + Registry - Research

**Researched:** 2026-03-11
**Domain:** NER model swap, entity detection pipeline, entity registry dedup, SolidJS badge UI
**Confidence:** HIGH

## Summary

Phase 27 replaces the custom-trained `sanitize-check` NER model with `dslim/distilbert-NER` (via `onnx-community/distilbert-NER-ONNX`) to gain PER/LOC/ORG/MISC entity detection while maintaining PII sanitization through regex fallback for FINANCIAL/CONTACT/CREDENTIAL categories. The model swap is architecturally clean: both are DistilBERT (`DistilBertForTokenClassification`), both use the same tokenizer class, and the quantized sizes are nearly identical (65.6MB current vs 65.8MB replacement). The worker extension adds a `DETECT_ENTITIES` message type alongside the existing `SANITIZE` message, sharing the same loaded model instance.

Entity registry dedup uses normalized text matching with a type-specific matcher framework. The dedup logic lives in `entity-helpers.ts` (already stubbed in Phase 26). Entity mentions are written to `atomIntelligence.entityMentions` sidecar records with an optional `entityId` linking to the canonical registry entry.

**Primary recommendation:** Swap the model first with PII regression tests, then build entity detection pipeline, then registry dedup, then badge UI. Sequential dependency chain.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Replace sanitize-check with a researched pre-trained NER model (<100MB, dual-use PII+entity)
- Regex fallback for FINANCIAL/CONTACT/CREDENTIAL PII categories (keep regex-patterns.ts)
- 5 entity types: PER/LOC/ORG (full registry) + MISC/DATE (mentions only)
- Confidence-based entity dedup with type-specific matcher framework
- Async post-save detection, full re-scan on edit, sequential worker queue
- Same sanitization worker (DETECT_ENTITIES message type), eager model load
- Below-content color-coded entity badge chips, detail view only
- Automated PII regression test suite after model swap
- Pre-bundled model in build (public/models/)
- Worker returns raw NER only; main thread handles dedup/registry/sidecar write
- Minimum NER confidence threshold ~0.7, configurable
- Entity table: PER|LOC|ORG only; EntityMention: PER|LOC|ORG|MISC|DATE
- Clean up on atom delete: remove atomIntelligence, decrement mentionCount
- New atoms only (no backfill), all atom types get entity detection

### Claude's Discretion
- NER aggregation strategy (simple, first, or max)
- Auto-merge confidence tier design
- Entity badge tap behavior
- MISC/DATE badge display (show or hide)
- Reverse entity-atom lookup strategy (MultiEntry index vs scan)
- Exact badge colors and icon choices
- Error toast design for NER load failure

### Deferred Ideas (OUT OF SCOPE)
- Entity merge suggestion UX (Phase 29)
- LOC abbreviation matching ("NYC" = "New York City")
- ORG acronym expansion ("IBM" = "International Business Machines")
- Background backfill scan of existing atoms
- Entity timeline view (Phase 29)
- Entity context in enrichment (Phase 29)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ENTD-01 | Sanitization worker extended with DETECT_ENTITIES message type, reusing NER for entity extraction | Model swap research confirms `onnx-community/distilbert-NER-ONNX` outputs PER/LOC/ORG/MISC via same Transformers.js pipeline. Worker message protocol extension pattern documented. |
| ENTD-02 | Entity detection runs asynchronously on atom create, update, and triage | Triage lifecycle integration points identified in store.ts and triage.ts. Same async post-save pattern as ONNX classification. |
| ENTD-03 | NER results written to atomIntelligence.entityMentions as structured records | Sidecar CRUD pattern established in atom-intelligence.ts. EntityMention schema needs MISC/DATE union expansion and entityId field. |
| ENTR-03 | Entity-atom linking via mentions-entity edges connecting atoms to their detected entities | EntityMention.entityId optional field links to Entity registry. MultiEntry index on atomIntelligence not needed at personal scale; table scan sufficient. |
| ENTR-04 | Entity deduplication via normalized text matching with alias resolution | Type-specific matcher framework with normalized exact match, title stripping (PER), case-insensitive (all types). Confidence tiers documented. |
| ENTR-05 | Entity badges/chips visible in atom detail view showing detected entities | AtomDetailView.tsx integration point identified. SolidJS reactive pattern for sidecar data loading. Tailwind chip styling. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @huggingface/transformers | ^3.8.1 | NER pipeline (token-classification) | Already in project, runs ONNX models in browser |
| onnxruntime-web | ^1.24.2 | ONNX inference runtime | Already in project, WASM backend for NER |
| dslim/distilbert-NER (via onnx-community/distilbert-NER-ONNX) | quantized q8 | Pre-trained NER model | 65.8MB q8, PER/LOC/ORG/MISC, F1=0.9217, DistilBERT architecture matches current model |
| dexie | existing | Entity registry + sidecar persistence | Already in project, IndexedDB wrapper |
| solid-js | existing | Reactive badge UI | Already in project, reactive primitives |
| zod/v4 | existing | Schema validation | Already used for intelligence types |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tailwindcss | existing | Badge chip styling | Color-coded entity type chips |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| onnx-community/distilbert-NER-ONNX (65.8MB q8) | Xenova/bert-base-NER (108MB q8) | bert-base is ~40% larger for marginal accuracy gain; DistilBERT matches current architecture |
| Regex for DATE detection | NER model with DATE support | No standard small NER model includes DATE; regex is reliable for structured date patterns |

## Architecture Patterns

### Model Swap Strategy
```
Current:  sanitize-check (custom) -> PERSON, LOCATION, FINANCIAL, CONTACT, CREDENTIAL
New:      distilbert-NER (pre-trained) -> PER, LOC, ORG, MISC
Fallback: regex-patterns.ts -> FINANCIAL, CONTACT, CREDENTIAL (unchanged)
New:      date-regex patterns -> DATE (new addition to regex-patterns.ts)
```

**Critical insight:** The model swap changes the label namespace. Current labels are full words (`PERSON`, `LOCATION`). New labels are abbreviations (`PER`, `LOC`, `ORG`, `MISC`). The `mapEntityCategory()` function in the worker already handles both formats via its mapping table -- it just needs updating to pass through `PER`/`LOC`/`ORG`/`MISC` for entity detection instead of mapping everything to sanitization categories.

### Worker Message Flow
```
Main Thread                    Sanitization Worker
    |                                |
    |-- LOAD_NER ------------------>|  (eager, on app init)
    |<--- NER_READY ----------------|
    |                                |
    |-- SANITIZE {id, text} ------->|  (PII detection for cloud)
    |<--- SANITIZE_RESULT {id, entities} |  (PERSON, LOCATION mapped for pseudonymization)
    |                                |
    |-- DETECT_ENTITIES {id, text}->|  (entity detection for knowledge graph)
    |<--- ENTITIES_RESULT {id, entities} |  (PER, LOC, ORG, MISC with raw labels)
```

Both messages use the SAME NER pipeline instance. The difference is:
- `SANITIZE`: Maps NER output to sanitization categories (PERSON, LOCATION) + merges with regex
- `DETECT_ENTITIES`: Returns raw NER output with original labels (PER, LOC, ORG, MISC) + DATE regex

### Entity Detection Lifecycle
```
Atom Create/Update
    |
    v
Save to Dexie (immediate)
    |
    v
Trigger detectEntitiesForAtom(atomId, content)  [async, non-blocking]
    |
    v
sanitizer.ts: detectEntitiesForKnowledgeGraph(text)
    |
    +-- Worker: NER pipeline -> [{text, type, start, end, confidence}]
    +-- Regex: DATE patterns -> [{text, type:'DATE', start, end, confidence:1.0}]
    |
    v
Filter by confidence >= 0.7
    |
    v
For each entity mention:
    +-- If PER/LOC/ORG: findOrCreateEntity() in registry -> get entityId
    +-- If MISC/DATE: entityId = undefined (mentions only)
    |
    v
Write entityMentions[] to atomIntelligence sidecar
Update Entity.mentionCount, firstSeen, lastSeen
```

### Entity Registry Dedup Architecture
```typescript
// Type-specific matcher framework
interface EntityMatcher {
  type: 'PER' | 'LOC' | 'ORG';
  normalize(text: string): string;
  matchScore(a: string, b: string): number; // 0-1
}

// Phase 27 ships basic matchers:
// PER: lowercase, strip titles (Dr., Mr., Mrs., Prof.), trim
// LOC: lowercase, trim
// ORG: lowercase, trim, strip common suffixes (Inc., Ltd., Corp.)

// Confidence tiers for auto-merge:
// HIGH (>= 0.9): normalized exact match -> auto-merge silently
// MEDIUM (0.7-0.9): partial match (subset, prefix) -> store as merge candidate (Phase 29 UX)
// LOW (< 0.7): no match -> create new entity
```

### Recommended Project Structure
```
src/
├── ai/
│   └── sanitization/
│       ├── sanitizer.ts              # Extend: detectEntitiesForKnowledgeGraph()
│       ├── regex-patterns.ts         # Extend: DATE patterns
│       └── types.ts                  # No change (sanitization types stay separate)
├── entity/
│   ├── entity-matcher.ts            # NEW: type-specific matcher framework
│   ├── entity-detector.ts           # NEW: orchestrates detection -> registry -> sidecar
│   └── types.ts                     # NEW: EntityDetectionResult, MatcherResult types
├── storage/
│   ├── entity-helpers.ts            # Expand stubs: findOrCreate, dedup, merge candidates
│   └── atom-intelligence.ts         # Extend: writeEntityMentions()
├── types/
│   └── intelligence.ts              # Extend: EntityMention union + entityId field
├── workers/
│   └── sanitization-worker.ts       # Extend: DETECT_ENTITIES message handler
└── ui/
    ├── components/
    │   └── EntityBadges.tsx          # NEW: color-coded entity chips
    └── views/
        └── AtomDetailView.tsx        # Extend: render EntityBadges below content
```

### Anti-Patterns to Avoid
- **Do NOT create a separate entity worker:** The NER model is already loaded in the sanitization worker. A second worker loading the same model would double memory usage (~130MB).
- **Do NOT import db in entity-detector.ts orchestrator:** Keep the detection orchestrator pure. Pass sidecar/registry write functions as parameters or import only from storage layer.
- **Do NOT rewrite entityMention records on entity merge:** Lazy update strategy -- old mentions keep original text, Entity.aliases[] tracks all known forms. Lookup by alias resolves to canonical.
- **Do NOT use SolidJS store for entity badge data:** Load sidecar data with createResource/createEffect tied to selectedAtomId signal. Avoid putting entity data into the main store.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| NER inference | Custom token classifier | @huggingface/transformers pipeline('token-classification') | Handles tokenization, subword aggregation, IOB decoding |
| Subword token merging | Custom BPE reassembly | transformers.js `aggregation_strategy: 'simple'` | Correctly merges B-/I- prefixed IOB tokens into entity spans |
| ONNX quantized model serving | Custom ONNX loading | transformers.js pipeline with dtype:'q8' | Handles model loading, session creation, quantization selection |
| Name normalization for dedup | Custom Unicode normalization | `String.prototype.normalize('NFC')` + lowercase + trim | Standard Unicode normalization handles accents, ligatures |

**Key insight:** The `aggregation_strategy` parameter in Transformers.js is critical. Use `'simple'` (not `'first'` or `'max'`) for best entity boundary accuracy -- it averages confidence across sub-tokens rather than taking only the first or maximum. This is the same strategy the current sanitize-check model uses.

## Common Pitfalls

### Pitfall 1: Label Namespace Collision
**What goes wrong:** The sanitization pipeline expects labels like `PERSON`/`LOCATION` but the new model outputs `PER`/`LOC`/`ORG`/`MISC`. If the `mapEntityCategory` function is updated for entities without preserving sanitization mappings, PII redaction breaks.
**Why it happens:** Two consumers of the same NER output with different label expectations.
**How to avoid:** Keep `mapEntityCategory` for SANITIZE messages (maps PER->PERSON, LOC->LOCATION). Add a separate mapping path for DETECT_ENTITIES that preserves raw PER/LOC/ORG/MISC labels. Two different response handlers in the worker, same pipeline call.
**Warning signs:** Sanitization tests fail after model swap.

### Pitfall 2: Missing FINANCIAL/CONTACT/CREDENTIAL After Model Swap
**What goes wrong:** The new model does not detect FINANCIAL, CONTACT, or CREDENTIAL entities. If the sanitization merge logic assumes NER covers these categories, PII leaks to cloud.
**Why it happens:** `sanitize-check` was custom-trained on these categories. `distilbert-NER` is trained on CoNLL-2003 (PER/LOC/ORG/MISC only).
**How to avoid:** The merge logic in `sanitizer.ts` already runs regex in parallel with NER. After the swap, NER will no longer produce FINANCIAL/CONTACT/CREDENTIAL hits -- regex alone handles them. This is the intended design. Validate with PII regression tests.
**Warning signs:** Regex-only tests must pass for all FINANCIAL/CONTACT/CREDENTIAL patterns.

### Pitfall 3: Entity Mention Count Drift
**What goes wrong:** mentionCount on Entity records drifts from reality because of concurrent creates, edits without corresponding decrements, or atom deletions without cleanup.
**Why it happens:** Multiple async operations modifying the same counter.
**How to avoid:** On edit (full re-scan), decrement counts for old mentions before incrementing for new ones. Use a Dexie transaction for atomicity. On atom delete, decrement all linked entity mentionCounts.
**Warning signs:** Entity with mentionCount=50 but only 3 atoms reference it.

### Pitfall 4: SolidJS Reactivity for Sidecar Data
**What goes wrong:** Entity badges don't update when detection completes because the sidecar data isn't in the reactive graph.
**Why it happens:** atomIntelligence is loaded from Dexie asynchronously -- SolidJS createStore doesn't track Dexie reads.
**How to avoid:** Use `createResource` keyed on `selectedAtomId` to load sidecar data. Or create a signal that the detection orchestrator updates after writing to the sidecar.
**Warning signs:** Badges appear only after navigating away and back.

### Pitfall 5: ORG Mapped to LOCATION in Current sanitize-check
**What goes wrong:** The current `mapEntityCategory` maps `ORG`/`ORGANIZATION` to `LOCATION` (line 74 of sanitization-worker.ts). This was acceptable for sanitization (both are PII), but means entity detection would misclassify organizations as locations.
**Why it happens:** Sanitization doesn't distinguish ORG from LOC -- both get pseudonymized the same way.
**How to avoid:** The DETECT_ENTITIES path must NOT use the existing `mapEntityCategory`. It should pass through raw labels directly.
**Warning signs:** All organizations show up as location entities.

### Pitfall 6: DATE Entity Detection Quality
**What goes wrong:** The NER model does not detect DATE entities. Regex patterns for dates miss informal forms like "next Tuesday", "end of March", "last week".
**Why it happens:** CoNLL-2003 models are not trained on temporal expressions.
**How to avoid:** Accept that DATE detection via regex will be limited to structured patterns (ISO dates, "January 15, 2026", "3/15/2026"). Natural language dates ("next week") are out of scope for regex. Document this limitation. MISC may occasionally catch some date-like entities.
**Warning signs:** Users expect "meeting next Thursday" to produce a DATE mention -- it won't.

## Code Examples

### Worker DETECT_ENTITIES Handler
```typescript
// In sanitization-worker.ts - new message handler
if (msg.type === 'DETECT_ENTITIES') {
  try {
    const pipe = await loadNER();
    const rawEntities = await pipe(msg.text);

    // Return raw NER output with original labels (PER/LOC/ORG/MISC)
    // No category mapping -- main thread handles entity type resolution
    const entities = rawEntities
      .filter((e) => (e.score ?? 0) >= 0.7) // Confidence threshold
      .map((e) => {
        const label = (e.entity_group ?? e.entity ?? '').replace(/^[BI]-/, '').toUpperCase();
        return {
          text: e.word,
          type: label, // PER, LOC, ORG, MISC
          start: e.start,
          end: e.end,
          confidence: e.score,
        };
      })
      .filter((e) => ['PER', 'LOC', 'ORG', 'MISC'].includes(e.type));

    self.postMessage({ type: 'ENTITIES_RESULT', id: msg.id, entities });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    self.postMessage({ type: 'ENTITIES_ERROR', id: msg.id, error });
  }
}
```

### Sanitizer Bridge Extension
```typescript
// In sanitizer.ts - new bridge function
export function detectEntitiesForKnowledgeGraph(text: string): Promise<RawEntityMention[]> {
  return new Promise((resolve, reject) => {
    if (!worker || workerFailed) {
      resolve([]); // Graceful degradation
      return;
    }
    const id = `ent-${++requestCounter}`;
    pendingRequests.set(id, { resolve, reject });
    worker.postMessage({ type: 'DETECT_ENTITIES', id, text });
  });
}
```

### Entity Matcher Framework
```typescript
// src/entity/entity-matcher.ts
export interface EntityMatcher {
  normalize(text: string): string;
  matchScore(candidateName: string, existingEntity: { canonicalName: string; aliases: string[] }): number;
}

const PER_TITLES = /^(dr\.?|mr\.?|mrs\.?|ms\.?|prof\.?|sir|dame)\s+/i;

export const personMatcher: EntityMatcher = {
  normalize(text: string): string {
    return text.normalize('NFC').replace(PER_TITLES, '').trim().toLowerCase();
  },
  matchScore(candidate, existing) {
    const normCandidate = this.normalize(candidate);
    const normCanonical = this.normalize(existing.canonicalName);
    // Exact normalized match
    if (normCandidate === normCanonical) return 1.0;
    // Check aliases
    for (const alias of existing.aliases) {
      if (this.normalize(alias) === normCandidate) return 1.0;
    }
    // Substring match (e.g., "Sarah" matches "Sarah Chen")
    if (normCanonical.includes(normCandidate) || normCandidate.includes(normCanonical)) {
      return 0.8;
    }
    return 0;
  },
};

export const locationMatcher: EntityMatcher = {
  normalize(text: string): string {
    return text.normalize('NFC').trim().toLowerCase();
  },
  matchScore(candidate, existing) {
    const normCandidate = this.normalize(candidate);
    if (this.normalize(existing.canonicalName) === normCandidate) return 1.0;
    for (const alias of existing.aliases) {
      if (this.normalize(alias) === normCandidate) return 1.0;
    }
    return 0;
  },
};

export const orgMatcher: EntityMatcher = {
  normalize(text: string): string {
    return text.normalize('NFC')
      .replace(/\s*(inc\.?|ltd\.?|corp\.?|llc|co\.?|plc)\s*$/i, '')
      .trim().toLowerCase();
  },
  matchScore(candidate, existing) {
    const normCandidate = this.normalize(candidate);
    if (this.normalize(existing.canonicalName) === normCandidate) return 1.0;
    for (const alias of existing.aliases) {
      if (this.normalize(alias) === normCandidate) return 1.0;
    }
    return 0;
  },
};

export function getMatcherForType(type: 'PER' | 'LOC' | 'ORG'): EntityMatcher {
  switch (type) {
    case 'PER': return personMatcher;
    case 'LOC': return locationMatcher;
    case 'ORG': return orgMatcher;
  }
}
```

### Entity Badge Component
```tsx
// src/ui/components/EntityBadges.tsx
import { Show, For } from 'solid-js';
import type { EntityMention } from '../../types/intelligence';

const TYPE_COLORS: Record<string, string> = {
  PER: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  ORG: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  LOC: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  MISC: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  DATE: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
};

interface EntityBadgesProps {
  mentions: EntityMention[];
  maxVisible?: number;
}

export function EntityBadges(props: EntityBadgesProps) {
  const maxVisible = () => props.maxVisible ?? 5;
  const sorted = () => [...props.mentions]
    .sort((a, b) => b.confidence - a.confidence)
    .filter((m, i, arr) =>
      arr.findIndex((x) => x.entityText.toLowerCase() === m.entityText.toLowerCase()) === i
    );
  const visible = () => sorted().slice(0, maxVisible());
  const overflow = () => Math.max(0, sorted().length - maxVisible());

  return (
    <Show when={sorted().length > 0}>
      <div class="flex flex-wrap gap-1.5 mt-2">
        <For each={visible()}>
          {(mention) => (
            <span class={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[mention.entityType] ?? TYPE_COLORS.MISC}`}>
              {mention.entityText}
            </span>
          )}
        </For>
        <Show when={overflow() > 0}>
          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
            +{overflow()} more
          </span>
        </Show>
      </div>
    </Show>
  );
}
```

### DATE Regex Patterns
```typescript
// Addition to regex-patterns.ts or separate date-patterns.ts
const DATE_PATTERNS = [
  // ISO format: 2026-03-11
  /\b\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b/,
  // US format: 03/11/2026 or 3/11/2026
  /\b(?:0?[1-9]|1[0-2])\/(?:0?[1-9]|[12]\d|3[01])\/\d{4}\b/,
  // Named month: March 11, 2026 or Mar 11 2026
  /\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{4}\b/i,
  // Day Month Year: 11 March 2026
  /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{4}\b/i,
  // Month and day without year: March 11, January 1st
  /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?\b/i,
];
```

### writeEntityMentions Sidecar Helper
```typescript
// Addition to atom-intelligence.ts
export async function writeEntityMentions(
  atomId: string,
  mentions: EntityMention[],
): Promise<void> {
  const intel = await getOrCreateIntelligence(atomId);
  intel.entityMentions = mentions; // Full replace on re-scan
  intel.version++;
  intel.lastUpdated = Date.now();
  await db.atomIntelligence.put(intel);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom-trained sanitize-check (5 PII categories) | Pre-trained distilbert-NER (4 entity types) + regex PII | Phase 27 | Gains ORG/MISC detection; regex covers FINANCIAL/CONTACT/CREDENTIAL |
| All entity labels mapped to sanitization categories | Dual-path: SANITIZE maps to PII categories, DETECT_ENTITIES preserves raw NER labels | Phase 27 | Same model, different output interpretation per message type |
| No entity registry | Dexie entities table with dedup + alias tracking | Phase 26/27 | Entity identity persistence across atoms |

**Model comparison (decisive factor for selection):**

| Property | sanitize-check (current) | distilbert-NER (replacement) |
|----------|-------------------------|------------------------------|
| Architecture | DistilBertForTokenClassification | DistilBertForTokenClassification |
| Tokenizer | DistilBertTokenizer (cased) | DistilBertTokenizer (cased) |
| Quantized size (q8) | 65.6 MB | 65.8 MB |
| Entity labels | PERSON, LOCATION, FINANCIAL, CONTACT, CREDENTIAL | PER, LOC, ORG, MISC |
| Training data | Custom synthetic PII | CoNLL-2003 (standard NER benchmark) |
| F1 score | Unknown (custom) | 0.9217 (published) |
| Vocab size | 28996 | 28996 |

## Open Questions

1. **Sanitization accuracy after model swap**
   - What we know: The new model detects PER and LOC (maps to PERSON and LOCATION for sanitization). Regex handles FINANCIAL/CONTACT/CREDENTIAL.
   - What's unclear: Will the new model's PER/LOC detection be as good or better than the custom-trained sanitize-check for PII names? CoNLL-2003 training should be strong for names and locations.
   - Recommendation: PII regression test suite (locked decision) will validate this. If accuracy drops, the custom model can be kept alongside or the new model fine-tuned.

2. **MISC entity value**
   - What we know: MISC in CoNLL-2003 includes nationalities ("Italian"), software ("Java"), events ("World Cup"), and similar.
   - What's unclear: How useful are MISC entities for a personal information manager? They may be noisy.
   - Recommendation: Store MISC mentions in sidecar (mentions-only, no registry). Show MISC badges with lower visual weight (gray). Users will reveal whether they're valuable.

3. **DATE regex coverage gap**
   - What we know: Regex catches structured dates but NOT natural language dates ("next Tuesday", "end of month").
   - What's unclear: How often BinderOS atoms contain natural language temporal references.
   - Recommendation: Accept the limitation. DATE mentions are mentions-only (no registry). If temporal extraction becomes important, a dedicated temporal NER model could be added later (out of scope).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (inferred from project patterns) |
| Config file | vitest.config.ts (if exists) or vite.config.ts |
| Quick run command | `pnpm test` |
| Full suite command | `pnpm test -- --run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ENTD-01 | Worker handles DETECT_ENTITIES message and returns PER/LOC/ORG/MISC entities | unit | `pnpm test -- --run src/workers/sanitization-worker.test.ts` | Wave 0 |
| ENTD-01 | PII regression: names still redacted after model swap | integration | `pnpm test -- --run src/ai/sanitization/pii-regression.test.ts` | Wave 0 |
| ENTD-02 | Entity detection fires on atom create/update | integration | `pnpm test -- --run src/entity/entity-detector.test.ts` | Wave 0 |
| ENTD-03 | NER results written to atomIntelligence.entityMentions | unit | `pnpm test -- --run src/storage/atom-intelligence.test.ts` | Wave 0 |
| ENTR-03 | EntityMention.entityId links to Entity registry entry | unit | `pnpm test -- --run src/storage/entity-helpers.test.ts` | Wave 0 |
| ENTR-04 | Entity dedup normalizes names, strips titles, resolves aliases | unit | `pnpm test -- --run src/entity/entity-matcher.test.ts` | Wave 0 |
| ENTR-05 | EntityBadges renders color-coded chips from mentions | unit | `pnpm test -- --run src/ui/components/EntityBadges.test.tsx` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test -- --run`
- **Per wave merge:** `pnpm test -- --run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/ai/sanitization/pii-regression.test.ts` -- PII regression suite validating names/locations still redacted after model swap, regex fallback for FINANCIAL/CONTACT/CREDENTIAL
- [ ] `src/entity/entity-matcher.test.ts` -- entity dedup matcher tests (normalize, title stripping, alias resolution)
- [ ] `src/entity/entity-detector.test.ts` -- detection orchestrator tests (NER -> registry -> sidecar pipeline)
- [ ] Download and bundle `onnx-community/distilbert-NER-ONNX` model files to `public/models/` (model_quantized.onnx + config.json + tokenizer files)

## Sources

### Primary (HIGH confidence)
- [onnx-community/distilbert-NER-ONNX](https://huggingface.co/onnx-community/distilbert-NER-ONNX) - ONNX model files, sizes (65.8MB q8), quantization options
- [dslim/distilbert-NER](https://huggingface.co/dslim/distilbert-NER) - Model card: 66M params, F1=0.9217, PER/LOC/ORG/MISC labels, CoNLL-2003 training data
- [Xenova/bert-base-NER](https://huggingface.co/Xenova/bert-base-NER) - Alternative model reference: 108MB q8, same entity types
- Local codebase analysis: sanitization-worker.ts, sanitizer.ts, intelligence.ts, entity-helpers.ts, atom-intelligence.ts, db.ts (v9 migration)

### Secondary (MEDIUM confidence)
- [CoNLL-2003 dataset](https://www.clips.uantwerpen.be/conll2003/ner/) - MISC entity type definition: "names of miscellaneous entities that do not belong to PER/ORG/LOC"
- [@huggingface/transformers docs](https://huggingface.co/docs/transformers.js/en/index) - Pipeline API, dtype options, aggregation_strategy

### Tertiary (LOW confidence)
- DATE regex patterns: general regex date extraction patterns from web search, not validated against BinderOS content patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - model files verified on HuggingFace, architecture matches current model exactly, sizes confirmed
- Architecture: HIGH - based on existing codebase patterns (worker protocol, sidecar CRUD, SolidJS components)
- Pitfalls: HIGH - label namespace collision identified directly from code analysis (mapEntityCategory maps ORG->LOCATION currently)
- Entity dedup: MEDIUM - matcher framework design is sound but confidence thresholds need tuning with real data

**Research date:** 2026-03-11
**Valid until:** 2026-04-11 (stable domain, models don't change frequently)
