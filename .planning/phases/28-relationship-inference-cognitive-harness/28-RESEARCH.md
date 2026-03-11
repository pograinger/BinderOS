# Phase 28: Relationship Inference + Cognitive Harness - Research

**Researched:** 2026-03-11
**Domain:** Entity relationship inference, in-memory co-occurrence tracking, PWA lifecycle data persistence, headless pipeline testing harness
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Keyword pattern bank:**
- JSON config file in binder-type config directory — easy to add/edit patterns without code changes, extensible for future binder types
- Same-sentence scoping — keywords only associate with entities in the same sentence, preventing false positives
- Fuzzy matching — case-insensitive, handles plurals and verb forms. Pattern JSON specifies root keywords, engine handles common variations
- Custom string relationship types allowed — patterns can introduce types beyond RELATIONSHIP_TYPES union (e.g., 'neighbor', 'mentor', 'client')
- Implicit self entity — when a keyword fires with a single PER entity, relationship inferred between that entity and the user. No explicit '[USER]' entity in registry
- Conflicting patterns coexist — "Dr. Pam" triggers healthcare-provider AND "Pam's anniversary" triggers spouse. Both stored independently

**Co-occurrence engine:**
- Sentence-level granularity — two entities in same sentence = 1 co-occurrence
- Entity ID keys — co-occurrence Map keyed by sorted entity UUID pairs
- Device-adaptive flush strategy — must use `beforeunload`, `visibilitychange`, and other PWA lifecycle events. Maximally resilient against mid-interaction shutdowns
- Co-occurrence alone creates relationships — after sufficient co-occurrences, entity pairs get generic 'associated' relationship type
- Minimum co-occurrence threshold >= 2 (from RELI-03)

**Harness architecture:**
- Claude's discretion on runtime — Node.js script, Vitest, or hybrid
- Progressive feeding — atoms fed one at a time, learning curve measured at checkpoints (5, 10, 20, 30 atoms)
- Basic cloud-as-user simulation in Phase 28 — accept/reject triage, simple enrichment answers, entity detection verification
- JSON + Markdown reports — output to scripts/harness/reports/

**Synthetic user profile:**
- Single persona — one realistic GTD user with family, work, health providers
- Ground truth includes entities + relationships + facts
- Lives in scripts/harness/ — profile JSON + pre-generated corpus alongside harness code
- Isolated, not encrypted — plain JSON but pipeline code never reads it
- Pre-generated corpus for Phase 28 — 30-50 inbox items via Anthropic API, stored as JSON. Harness runs deterministic and offline
- 80% natural + 20% edge cases

**Cloud scoring:**
- Privacy score included — measure entity knowledge enabling semantic sanitization: 'Pam' -> '[SPOUSE]' vs '[PERSON]'
- Learning curve visualization — Markdown table with precision/recall at each checkpoint + ASCII line chart

### Claude's Discretion
- Initial confidence per pattern based on keyword specificity
- Exact ~20 pattern definitions and their relationship type mappings
- Fuzzy matching implementation (stemming, regex, or keyword variant lists)
- Exact flush cadence and device-adaptive thresholds
- Co-occurrence threshold for 'associated' relationship creation
- Whether to use requestIdleCallback, navigator.sendBeacon, or other APIs for resilient flushing
- Evidence snippet extraction (how much surrounding text to capture per co-occurrence)
- Harness runtime environment
- Synthetic persona complexity (~15-20 entities recommended)
- Exact scoring methodology (separate entity/dedup/relationship P/R vs composite)
- Pre-generated corpus generation prompt design
- How to mock Dexie / pipeline components for headless execution
- Checkpoint intervals for learning curve

### Deferred Ideas (OUT OF SCOPE)
- Adversarial multi-cycle training loop (Phase 29)
- Full cloud-as-user interaction with enthusiastic acceptance/entity corrections (Phase 29)
- Entity-aware enrichment questions (Phase 29 ENTC-01)
- Entity correction UX (Phase 29 ENTC-02)
- T2 semantic sanitization using entity knowledge (Phase 29)
- Multiple synthetic personas (future)
- Batch feeding mode (future)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RELI-01 | T1 keyword pattern engine with ~20 deterministic patterns mapping keyword + entity co-occurrence to relationship types | JSON config pattern established, sentence splitting, fuzzy matching approach documented |
| RELI-02 | Cross-item co-occurrence accumulation tracking entity pair frequency across atoms with in-memory Map and periodic Dexie flush | In-memory Map with sorted UUID keys, PWA lifecycle flush events, device-adaptive thresholds documented |
| RELI-03 | Evidence-based confidence scoring with sentence-level proximity checks, minimum co-occurrence thresholds (>=2), and source attribution on all edges | EntityRelation schema already has confidence, sourceAttribution, evidence[] — extends cleanly |
| HARN-01 | Headless testing harness exercises full local pipeline (triage → enrichment → entity detection → relationship inference) without UI | Vitest + Node runner hybrid recommended; pure module pattern makes pipeline mockable |
| HARN-02 | Cloud generates coherent inbox items matching synthetic user and scores resulting entity graph against ground truth | Anthropic SDK already in use; scoring methodology via precision/recall on entity graph documented |
| HARN-03 | Harness simulates user interactions (triage acceptance, enrichment Q&A, entity corrections) as the synthetic user would | Cloud-as-user simulation strategy documented using structured Anthropic responses |
</phase_requirements>

---

## Summary

Phase 28 builds two complementary systems: a relationship inference engine that examines already-detected entities and infers typed relationships between them, and a headless cognitive harness that validates the entire local pipeline against a synthetic user profile. Both systems build on the solid foundation from Phases 26-27 (sidecar schema, entity detection, registry dedup).

The relationship inference engine has two independent paths to creating an `EntityRelation` record: (1) keyword pattern matching — a JSON config file maps root keywords to relationship types, and when such a keyword appears in the same sentence as a PER entity, a relationship is inferred between that entity and the implicit user; (2) co-occurrence accumulation — an in-memory Map tracks how often entity pairs appear in the same sentence across atoms, and when a pair crosses the minimum threshold of 2, a generic 'associated' relationship is written. The existing `EntityRelation` Dexie schema (with `confidence`, `sourceAttribution`, `evidence[]`) already accommodates both paths without schema changes.

The cognitive harness is a Node.js script (not a browser test) because it needs to exercise the pure-module pipeline code without a DOM, mock Dexie reads, and call the Anthropic API for corpus generation and scoring. Vitest is used only for the inference engine unit tests. The harness outputs JSON + Markdown reports to `scripts/harness/reports/` consistent with the existing `scripts/train/reports/` pattern.

**Primary recommendation:** Build the keyword pattern engine and co-occurrence tracker as two pure TypeScript modules (`src/inference/keyword-patterns.ts`, `src/inference/cooccurrence-tracker.ts`) with a thin orchestrator (`src/inference/relationship-inference.ts`) that plugs into the Phase 27 entity detection lifecycle. Build the harness as a Node.js script at `scripts/harness/run-harness.ts` that imports pipeline pure modules directly.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Dexie (existing) | ^4.3.0 | Persist inferred EntityRelation records | Already used for entity registry writes; `createRelation()` in entity-helpers.ts is the write path |
| Vitest (existing) | ^4.0.18 | Unit tests for inference engine | Already the project test runner; pure modules are trivially testable |
| @anthropic-ai/sdk (existing) | ^0.78.0 | Corpus generation + cloud-as-user scoring | Already in dependencies; same auth pattern as scripts/train/ |
| onnxruntime-node (existing) | ^1.24.3 | ONNX inference in Node harness (cognitive signals) | Already a devDependency; enables running ONNX models outside the browser |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js built-in `fs/promises` | built-in | Read/write JSON corpus and report files | Harness script only — never in browser code |
| `tsup` or `tsx` | dev tool | Run TypeScript harness scripts directly | `tsx` already available via pnpm for running .ts scripts in Node; use `node --loader tsx` or `npx tsx` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Vitest for harness runner | Jest | Vitest is already installed; project is ESM-first |
| Pure Node.js harness | Playwright/headless browser | Node.js is faster for pipeline logic; no DOM needed since pipeline is pure modules |
| In-memory Map for co-occurrence | Immediate Dexie writes | Map is O(1) and avoids O(n^2) Dexie write pressure; flush is batched |

**No new npm installs required.** All dependencies already present.

---

## Architecture Patterns

### Recommended Project Structure
```
src/inference/
├── keyword-patterns.ts       # Pure: loads JSON config, runs pattern matching
├── cooccurrence-tracker.ts   # Pure: in-memory Map, flush to Dexie
├── relationship-inference.ts # Orchestrator: ties both paths together
└── types.ts                  # Shared inference types

src/config/binder-types/
└── relationship-patterns.json  # ~20 keyword pattern definitions

scripts/harness/
├── run-harness.ts              # Main harness entry point (Node.js)
├── synthetic-user.json         # Synthetic persona ground truth
├── corpus.json                 # Pre-generated 30-50 inbox items
├── generate-corpus.ts          # One-time corpus generation script
├── score-graph.ts              # Entity graph scoring logic
└── reports/                    # JSON + Markdown output
```

### Pattern 1: Keyword Pattern Definition (JSON Config)
**What:** JSON config follows the established `src/config/binder-types/` pattern — loaded at build time for browser, loaded with `fs.readFileSync` for Node harness.
**When to use:** Adding/editing relationship patterns without code changes; extensible for non-GTD binder types.
**Example:**
```typescript
// src/config/binder-types/relationship-patterns.json
{
  "version": 1,
  "patterns": [
    {
      "id": "spouse-anniversary",
      "keywords": ["anniversary", "married", "marriage", "marry", "wedding", "spouse", "husband", "wife"],
      "relationshipType": "spouse",
      "targetEntityType": "PER",
      "confidenceBase": 0.30,
      "scope": "sentence"
    },
    {
      "id": "spouse-direct",
      "keywords": ["wife", "husband", "spouse", "partner"],
      "relationshipType": "spouse",
      "targetEntityType": "PER",
      "confidenceBase": 0.65
    },
    {
      "id": "boss-reports-to",
      "keywords": ["boss", "manager", "supervisor", "reports to", "direct report"],
      "relationshipType": "reports-to",
      "targetEntityType": "PER",
      "confidenceBase": 0.55
    },
    {
      "id": "healthcare-title",
      "keywords": ["Dr.", "Doctor", "dentist", "therapist", "physician", "nurse"],
      "relationshipType": "healthcare-provider",
      "targetEntityType": "PER",
      "confidenceBase": 0.70
    },
    {
      "id": "family-parent",
      "keywords": ["mom", "dad", "mother", "father", "parent", "parents"],
      "relationshipType": "parent",
      "targetEntityType": "PER",
      "confidenceBase": 0.60
    },
    {
      "id": "family-child",
      "keywords": ["son", "daughter", "kid", "child", "children"],
      "relationshipType": "child",
      "targetEntityType": "PER",
      "confidenceBase": 0.60
    },
    {
      "id": "colleague",
      "keywords": ["coworker", "colleague", "teammate", "workmate"],
      "relationshipType": "colleague",
      "targetEntityType": "PER",
      "confidenceBase": 0.45
    },
    {
      "id": "friend",
      "keywords": ["friend", "buddy", "pal", "friend of mine"],
      "relationshipType": "friend",
      "targetEntityType": "PER",
      "confidenceBase": 0.45
    },
    {
      "id": "works-at",
      "keywords": ["works at", "employed at", "job at", "office at", "headquarters"],
      "relationshipType": "works-at",
      "targetEntityType": "ORG",
      "confidenceBase": 0.55
    },
    {
      "id": "lives-at",
      "keywords": ["lives at", "lives in", "home in", "address", "neighborhood", "house in"],
      "relationshipType": "lives-at",
      "targetEntityType": "LOC",
      "confidenceBase": 0.50
    },
    {
      "id": "org-member",
      "keywords": ["joined", "member of", "part of", "belongs to", "on the team"],
      "relationshipType": "org-member",
      "targetEntityType": "ORG",
      "confidenceBase": 0.40
    },
    {
      "id": "mentor",
      "keywords": ["mentor", "mentors me", "taught me", "learned from"],
      "relationshipType": "mentor",
      "targetEntityType": "PER",
      "confidenceBase": 0.55
    },
    {
      "id": "client",
      "keywords": ["client", "customer", "account", "vendor"],
      "relationshipType": "client",
      "targetEntityType": "PER",
      "confidenceBase": 0.50
    },
    {
      "id": "neighbor",
      "keywords": ["neighbor", "next door", "across the street"],
      "relationshipType": "neighbor",
      "targetEntityType": "PER",
      "confidenceBase": 0.55
    }
  ]
}
```

### Pattern 2: Sentence Splitting for Scope
**What:** Split atom content into sentences before running pattern matching. Two entities in different sentences do NOT trigger a pattern.
**When to use:** Always — prevents false positives from long atoms mentioning multiple people.
**Example:**
```typescript
// src/inference/keyword-patterns.ts

/**
 * Split text into sentences using simple regex.
 * Handles: ". ", "! ", "? ", "\n" as boundaries.
 * Not perfect for all edge cases, but sufficient for inbox atom lengths.
 */
function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}
```

### Pattern 3: Fuzzy Keyword Matching
**What:** Case-insensitive regex with word-boundary anchors, covering root + common inflections via a variant list in the pattern definition.
**When to use:** Every pattern match — prevents missing "Married to Sarah" vs "married to Sarah".
**Example:**
```typescript
/**
 * Build a regex that matches any keyword variant, case-insensitive, word-boundary safe.
 * Keyword variants come from the pattern JSON (no runtime stemming needed).
 */
function buildKeywordRegex(keywords: string[]): RegExp {
  const escaped = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`\\b(${escaped.join('|')})\\b`, 'i');
}
```

### Pattern 4: In-Memory Co-occurrence Map
**What:** A `Map<string, number>` keyed by sorted entity UUID pair strings (`"entityA:entityB"` where A < B lexicographically). Updated in-process after each atom's entities are resolved. Flushed to Dexie on threshold hits and PWA lifecycle events.
**When to use:** After every `detectEntitiesForAtom()` call that returns 2+ PER/ORG/LOC entities.
**Example:**
```typescript
// src/inference/cooccurrence-tracker.ts

/** Sorted pair key prevents duplicates: "uuid-a:uuid-b" with a < b */
function pairKey(entityId1: string, entityId2: string): string {
  return entityId1 < entityId2
    ? `${entityId1}:${entityId2}`
    : `${entityId2}:${entityId1}`;
}

// Module-level in-memory state — survives across atom processing calls
const cooccurrenceMap = new Map<string, number>();

/** Increment co-occurrence count for an entity pair */
export function recordCooccurrence(entityId1: string, entityId2: string): void {
  const key = pairKey(entityId1, entityId2);
  cooccurrenceMap.set(key, (cooccurrenceMap.get(key) ?? 0) + 1);
}
```

### Pattern 5: PWA Lifecycle Flush Strategy
**What:** Register flush handlers for `beforeunload`, `visibilitychange` (hidden), and `pagehide` events. Additionally flush on: (a) count threshold (e.g., 50 new co-occurrences), (b) time threshold (e.g., every 30 seconds via `setInterval` on desktop). The flush itself is an async Dexie batch write.
**When to use:** This is the device-adaptive piece. Mobile: lower count threshold (20), no interval flush. Desktop: count threshold 50, interval every 60s.
**Example:**
```typescript
// PWA lifecycle flush registration — call once on app startup
export function registerCooccurrenceFlushHandlers(deviceClass: 'mobile' | 'desktop'): void {
  const threshold = deviceClass === 'mobile' ? 20 : 50;

  // Sync flush attempt on page hide/unload (best-effort)
  const handleHide = () => {
    void flushCooccurrenceToDexie();
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') handleHide();
  });
  window.addEventListener('pagehide', handleHide);
  window.addEventListener('beforeunload', handleHide);

  // Count-based flush: check after each write
  // Time-based flush on desktop only
  if (deviceClass === 'desktop') {
    setInterval(() => void flushCooccurrenceToDexie(), 60_000);
  }
}
```

**Note on `beforeunload` + async:** Async Dexie writes in `beforeunload` are NOT guaranteed to complete. The flush must also be attempted at `visibilitychange` (hidden) which IS async-safe in modern browsers. Use `visibilitychange` as the primary flush trigger; `beforeunload` as belt-and-suspenders.

### Pattern 6: Relationship Inference Orchestrator
**What:** Called after `detectEntitiesForAtom()` resolves. Reads entity mentions from the sidecar, runs keyword patterns, runs co-occurrence updates. Pure function: takes entityMentions + atomId + content, returns actions taken.
**When to use:** Immediately after entity detection completes for an atom.
**Example:**
```typescript
// src/inference/relationship-inference.ts

export async function inferRelationshipsForAtom(params: {
  atomId: string;
  content: string;
  entityMentions: EntityMention[];
}): Promise<void> {
  const { atomId, content, entityMentions } = params;

  // 1. Run keyword pattern matching (sentence-scoped)
  await runKeywordPatterns(atomId, content, entityMentions);

  // 2. Update co-occurrence map for all entity pairs in same sentence
  updateCooccurrence(content, entityMentions);

  // 3. Flush co-occurrence to Dexie if threshold exceeded
  await maybeFlushCooccurrence();
}
```

### Pattern 7: Harness Architecture (Node.js + selective Vitest)
**What:** The harness is a Node.js TypeScript script (`scripts/harness/run-harness.ts`) that imports pure pipeline modules directly. Browser-only modules (worker, SolidJS store) are never imported. Dexie is mocked with a simple in-memory Map store for the harness context.
**When to use:** All harness execution. Vitest is used only for unit tests on inference engine pure modules.
**Example:**
```typescript
// scripts/harness/run-harness.ts
// Run with: npx tsx scripts/harness/run-harness.ts

import corpus from './corpus.json';
import syntheticUser from './synthetic-user.json';
import { scoreEntityGraph } from './score-graph';
import { runHarnessAtom } from './harness-pipeline';

const CHECKPOINTS = [5, 10, 20, 30];
const results: CheckpointResult[] = [];

for (let i = 0; i < corpus.items.length; i++) {
  const item = corpus.items[i];
  await runHarnessAtom(item);

  if (CHECKPOINTS.includes(i + 1)) {
    const score = await scoreEntityGraph(syntheticUser.groundTruth);
    results.push({ atomCount: i + 1, ...score });
    console.log(`Checkpoint ${i + 1}: P=${score.entityPrecision.toFixed(2)} R=${score.entityRecall.toFixed(2)}`);
  }
}

await writeReports(results);
```

### Anti-Patterns to Avoid
- **Importing the SolidJS store in inference modules:** The pure module pattern is established — all inference code is `store: never`. The harness can't import anything that imports the store.
- **Immediate Dexie writes for every co-occurrence:** Creates O(n^2) write pressure on high-entity atoms. Always buffer in Map, flush in batches.
- **Auto-merging conflicting relationships:** Phase 28 stores both (healthcare-provider AND spouse for "Dr. Pam"). Never delete one for the other. User correction in Phase 29 adds precedence.
- **Using `beforeunload` as the only flush mechanism:** It's unreliable on mobile (often skipped). Register `visibilitychange` as the primary trigger.
- **Running the harness in a browser context:** The harness imports Dexie with `dexie` (Node-compatible), not the browser-configured instance. Use a harness-specific in-memory mock, not the real `db.ts` singleton.
- **Sentence splitting based on period alone:** "Dr. Chen" contains a period. Use regex patterns that account for title abbreviations (or use the existing NER output which already handles this).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Entity pair key uniqueness | Custom hash function | Lexicographic sort + colon separator | UUID sort is deterministic, no collision risk, simple to debug |
| Relationship type validation | Runtime type checker | Zod schema already defined (z.string() on relationshipType) | Schema explicitly allows custom strings beyond RELATIONSHIP_TYPES union |
| Dexie mock for Node harness | Full IndexedDB polyfill | Simple in-memory Map with same interface as entityRelations table | Only read/write operations needed; full IDB polyfill adds 200ms startup |
| Confidence decay over time | MunninDB-style decay engine | Phase 28: static confidence. Phase 29 adds ENTC-04 recency decay | Scope locked — don't build decay in Phase 28 |
| NLP sentence boundary detection | NLP library (compromise.js, etc.) | Simple regex split on `.` `!` `?` `\n` | Inbox atoms are short (1-3 sentences typically); NLP overhead not justified |

**Key insight:** The EntityRelation schema (confidence 0-1, sourceAttribution enum, evidence array) already handles everything Phase 28 needs. No schema migration required.

---

## Common Pitfalls

### Pitfall 1: `beforeunload` Async Data Loss
**What goes wrong:** Developer registers only `beforeunload` for flush, calls `flushCooccurrenceToDexie()` as async. Browser cancels all async work immediately after the handler returns. Data written since last flush is lost on tab close.
**Why it happens:** `beforeunload` does not wait for Promises.
**How to avoid:** Primary flush trigger is `visibilitychange` (hidden state), which allows microtask queue to drain. `beforeunload` is secondary belt-and-suspenders. Also flush on count threshold so most data is already persisted by the time the page closes.
**Warning signs:** Co-occurrence counts reset to lower values after app restart.

### Pitfall 2: Entity Pair Key Order Inconsistency
**What goes wrong:** Co-occurrence Map accumulates counts for "uuid-a:uuid-b" separately from "uuid-b:uuid-a", halving effective counts and never crossing the threshold.
**Why it happens:** Forgetting to sort the pair before building the key.
**How to avoid:** Always use the `pairKey()` helper that sorts lexicographically. Test this with a pair of known UUIDs.
**Warning signs:** Co-occurrence thresholds never trigger even after many atoms.

### Pitfall 3: Sentence Split on "Dr." Tokens
**What goes wrong:** "Dr. Chen is my dentist" splits into ["Dr", "Chen is my dentist"], losing the "Dr." title prefix that triggers the healthcare-provider pattern.
**Why it happens:** Naive period-as-sentence-boundary splitting.
**How to avoid:** Use lookbehind for sentence-ending punctuation: `(?<=[.!?])\s+(?=[A-Z])` — split only when the period is followed by whitespace and a capital letter. Or pre-process to handle known title abbreviations (Dr., Mr., Mrs., Ms., Prof.).
**Warning signs:** healthcare-provider relationships never inferred for people with titles.

### Pitfall 4: Harness Importing Browser-Only Code
**What goes wrong:** `run-harness.ts` imports `src/entity/entity-detector.ts` which imports `src/ai/sanitization/sanitizer.ts` which creates a `Worker`. Node.js has no `Worker` (web workers) constructor — runtime crash.
**Why it happens:** The pure module pattern is mostly followed, but sanitizer.ts has worker management at module scope.
**How to avoid:** The harness should NOT call `detectEntitiesForAtom()` as-is. Instead, the harness either (a) uses a headless NER function that bypasses the worker bridge and calls onnxruntime-node directly, or (b) pre-processes the corpus to inject known entity mentions from the synthetic ground truth. For Phase 28, option (b) is simpler: the corpus JSON includes pre-annotated entity mentions that the harness injects directly into the sidecar, bypassing NER. This also makes harness runs deterministic.
**Warning signs:** `ReferenceError: Worker is not defined` on harness startup.

### Pitfall 5: Co-occurrence Between Entities in Different Parts of Long Atoms
**What goes wrong:** A long atom mentioning "Sarah" in the first sentence and "Dr. Chen" in the last sentence gets counted as a co-occurrence, falsely implying a relationship.
**Why it happens:** Atom-level co-occurrence instead of sentence-level.
**How to avoid:** Sentence splitting is a locked decision. Always check that both entity mentions fall within the same sentence span before recording co-occurrence.
**Warning signs:** Entity pairs from unrelated mentions quickly reach threshold.

### Pitfall 6: BinderTypeConfig Missing `relationshipPatterns` Key
**What goes wrong:** `getBinderConfig('gtd-personal')` returns a config without a `relationshipPatterns` key, and the pattern engine crashes with `Cannot read property 'patterns' of undefined`.
**Why it happens:** The relationship patterns JSON is loaded separately (not embedded in gtd-personal.json), but the engine tries to access it via the binder config.
**How to avoid:** Load `relationship-patterns.json` as its own config (not nested in binder type config), or add a nullable `relationshipPatterns` field to `BinderTypeConfig` interface and fall back to the global patterns file.
**Warning signs:** Pattern engine crashes silently (inference is fire-and-forget), no relationships ever created.

---

## Code Examples

Verified patterns from existing codebase:

### Existing createRelation() — ready to use
```typescript
// Source: src/storage/entity-helpers.ts
export async function createRelation(relation: Omit<EntityRelation, 'id'>): Promise<string> {
  const id = crypto.randomUUID();
  const record: EntityRelation = { ...relation, id };
  await db.entityRelations.put(record);
  return id;
}
```

### Existing EntityRelation schema — supports all inference sources
```typescript
// Source: src/types/intelligence.ts
export const EntityRelationSchema = z.object({
  id: z.string(),
  sourceEntityId: z.string(),
  targetEntityId: z.string(),
  relationshipType: z.string(),           // custom strings allowed
  confidence: z.number().min(0).max(1),
  sourceAttribution: z.enum(['keyword', 'co-occurrence', 'user-correction']),
  evidence: z.array(EntityRelationEvidenceSchema),  // atomId + snippet
  version: z.number(),
  deviceId: z.string(),
  updatedAt: z.number(),
});
```

### Existing entity detection lifecycle hook point
```typescript
// Source: src/entity/entity-detector.ts
// After detectEntitiesForAtom() completes, inference can run:
export async function detectEntitiesForAtom(atomId: string, content: string): Promise<void> {
  // ... writes mentions to sidecar ...
  // Phase 28: caller should follow this with:
  //   await inferRelationshipsForAtom({ atomId, content, entityMentions: mentions });
}
```

### Pattern for fire-and-forget inference (matching existing detection pattern)
```typescript
// Inference failures NEVER block atom operations (same pattern as entity detection)
export async function inferRelationshipsForAtom(params: {
  atomId: string;
  content: string;
  entityMentions: EntityMention[];
}): Promise<void> {
  try {
    // ... inference logic ...
  } catch (err) {
    console.warn('[relationship-inference] Inference failed for atom', params.atomId, err);
  }
}
```

### Confidence scoring for keyword patterns
**Recommended initial confidence values by keyword specificity:**
- High specificity (unambiguous): `wife`, `husband`, `spouse` → 0.65
- Medium specificity (strong but contextual): `boss`, `Dr.`, `therapist`, `dentist` → 0.55
- Low specificity (contextual, weak signal): `anniversary`, `colleague`, `friend` → 0.30-0.40
- Confidence boost formula for repeated evidence: `newConfidence = Math.min(0.95, prevConfidence + 0.10 * evidenceCount)`

### Synthetic user profile structure
```json
{
  "personaName": "Alex Jordan",
  "bio": "GTD personal user, software engineer at Acme Corp, lives in Portland OR",
  "groundTruth": {
    "entities": [
      { "canonicalName": "Pam", "type": "PER", "aliases": ["Pamela", "Pam Jordan"] },
      { "canonicalName": "Dr. Chen", "type": "PER", "aliases": ["Chen", "Dr Chen"] },
      { "canonicalName": "Acme Corp", "type": "ORG", "aliases": ["Acme"] },
      { "canonicalName": "Portland", "type": "LOC", "aliases": ["Portland OR"] }
    ],
    "relationships": [
      { "entity": "Pam", "type": "spouse", "confidence": 1.0 },
      { "entity": "Dr. Chen", "type": "healthcare-provider", "confidence": 1.0 },
      { "entity": "Acme Corp", "type": "works-at", "confidence": 1.0 },
      { "entity": "Portland", "type": "lives-at", "confidence": 1.0 }
    ],
    "facts": [
      "lives in Portland, OR",
      "works at Acme Corp as a software engineer",
      "married to Pam",
      "Dr. Chen is their dentist"
    ]
  }
}
```

### Precision/recall scoring methodology
```typescript
// score-graph.ts — compute P/R for entity and relationship detection
interface GraphScore {
  entityPrecision: number;
  entityRecall: number;
  relationshipPrecision: number;
  relationshipRecall: number;
  privacyScore: number;  // % of known entities that can be semantically sanitized
  checkpoint: number;
}

// Privacy score: for each known entity with known relationship type,
// check if entityRelations table has a record linking entity to user.
// If yes, sanitization can use "[SPOUSE]" instead of "[PERSON]".
// privacyScore = matchedRelationships / groundTruthRelationships
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Append enrichment to atom.content | AtomIntelligence sidecar | Phase 26 | Inference reads from sidecar, not content parsing |
| Single entity detection model (sanitize-check) | distilbert-NER-ONNX (PER/LOC/ORG/MISC) | Phase 27 | Richer entity types available for relationship inference |
| No entity persistence | Entities + EntityRelations Dexie tables | Phase 26 | Relationship inference writes directly to EntityRelation records |

**No deprecated patterns for this phase.**

---

## Open Questions

1. **`relationship-patterns.json` placement: separate file vs nested in binder type config?**
   - What we know: `src/config/binder-types/index.ts` has `BinderTypeConfig` interface with specific known fields; JSON import is static (build-time)
   - What's unclear: Whether to extend `BinderTypeConfig` with an optional `relationshipPatterns` field, or keep relationship patterns as a standalone import
   - Recommendation: Keep as a standalone import (`src/config/relationship-patterns.json`) loaded directly by the pattern engine, not via `getBinderConfig()`. This avoids modifying `BinderTypeConfig` interface and is simpler. A separate `getRelationshipPatterns()` function handles binder-type-specific override in the future.

2. **Harness Dexie mock depth: how much of the entity API to mock?**
   - What we know: `createRelation()`, `findOrCreateEntity()`, `db.entityRelations.put()` are the write paths
   - What's unclear: Whether the harness needs `db.entities.where().toArray()` for dedup (needed by `findOrCreateEntity`) or can use a simplified version
   - Recommendation: Create a `HarnessEntityStore` class in `scripts/harness/` with Map-backed in-memory implementations of `entities` and `entityRelations` tables, injected via module-level variable substitution (not DI framework). This is simpler than a full Dexie mock.

3. **Co-occurrence threshold for 'associated' relationship creation**
   - What we know: Minimum >= 2 is locked (RELI-03)
   - What's unclear: Whether threshold 3 or 5 is more appropriate for personal GTD use
   - Recommendation: Use threshold 3. Rationale: personal GTD binders have fewer atoms than corporate knowledge bases; 3 co-occurrences across different atoms represents meaningful signal without requiring heavy usage. Make the threshold configurable (constant in `cooccurrence-tracker.ts`) so it can be tuned based on harness results.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^4.0.18 |
| Config file | none (default Vitest config) |
| Quick run command | `pnpm test --reporter=verbose src/inference/` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RELI-01 | Keyword pattern fires for "Pam's anniversary" → spouse relationship | unit | `pnpm test src/inference/keyword-patterns.test.ts -t "spouse"` | ❌ Wave 0 |
| RELI-01 | Same-sentence scoping prevents false positives | unit | `pnpm test src/inference/keyword-patterns.test.ts -t "sentence scope"` | ❌ Wave 0 |
| RELI-01 | Fuzzy matching catches "married"/"marriage"/"marry" variants | unit | `pnpm test src/inference/keyword-patterns.test.ts -t "fuzzy"` | ❌ Wave 0 |
| RELI-02 | Co-occurrence Map increments correctly, pair key is symmetric | unit | `pnpm test src/inference/cooccurrence-tracker.test.ts` | ❌ Wave 0 |
| RELI-02 | Flush writes EntityRelation records to Dexie mock | unit | `pnpm test src/inference/cooccurrence-tracker.test.ts -t "flush"` | ❌ Wave 0 |
| RELI-03 | Confidence scores reflect keyword specificity | unit | `pnpm test src/inference/keyword-patterns.test.ts -t "confidence"` | ❌ Wave 0 |
| RELI-03 | Minimum 2 co-occurrences required before 'associated' relationship | unit | `pnpm test src/inference/cooccurrence-tracker.test.ts -t "threshold"` | ❌ Wave 0 |
| HARN-01 | Harness runs to completion on corpus.json offline | smoke | `npx tsx scripts/harness/run-harness.ts --dry-run` | ❌ Wave 0 |
| HARN-02 | Scoring produces non-zero precision/recall at checkpoint 30 | integration | `npx tsx scripts/harness/run-harness.ts` | ❌ Wave 0 |
| HARN-03 | Cloud-as-user simulation accepts/rejects atoms deterministically | unit | `pnpm test scripts/harness/cloud-simulator.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test src/inference/ --run`
- **Per wave merge:** `pnpm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/inference/keyword-patterns.test.ts` — covers RELI-01
- [ ] `src/inference/cooccurrence-tracker.test.ts` — covers RELI-02, RELI-03
- [ ] `src/inference/relationship-inference.test.ts` — integration: full orchestrator
- [ ] `scripts/harness/run-harness.ts` — harness entry point (HARN-01, HARN-02, HARN-03)
- [ ] `scripts/harness/corpus.json` — pre-generated corpus (must exist before harness runs)
- [ ] `scripts/harness/synthetic-user.json` — ground truth persona

---

## Sources

### Primary (HIGH confidence)
- `src/types/intelligence.ts` — EntityRelation schema, RELATIONSHIP_TYPES, evidence structure — inspected directly
- `src/storage/entity-helpers.ts` — `createRelation()`, `findOrCreateEntity()` — inspected directly
- `src/entity/entity-detector.ts` — detection lifecycle, fire-and-forget pattern — inspected directly
- `src/config/binder-types/` — established JSON config pattern, `BinderTypeConfig` interface — inspected directly
- `src/storage/db.ts` — `entityRelations` table indexes confirmed — inspected directly
- `src/workers/sanitization-worker.ts` — Worker-only; not importable in Node — inspected directly
- `package.json` — dependency versions, `pnpm test` script — inspected directly
- `.planning/phases/28-relationship-inference-cognitive-harness/28-CONTEXT.md` — locked decisions — read in full

### Secondary (MEDIUM confidence)
- MDN Web Docs knowledge (training): `visibilitychange` event is async-safe; `beforeunload` is sync-only for Promises
- MDN Web Docs knowledge (training): `pagehide` event fires reliably on iOS Safari where `beforeunload` does not

### Tertiary (LOW confidence)
- Anthropic API structured outputs pattern — assumed same format as `scripts/train/01_generate_data.py`; should verify exact API format before corpus generation script

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already installed, no new dependencies
- Architecture: HIGH — pure module pattern, Dexie writes, config JSON all established in codebase
- Pitfalls: HIGH — based on direct code inspection of existing patterns + known browser behavior
- Harness design: MEDIUM — Node.js + tsx approach is standard but Dexie mocking strategy requires implementation validation

**Research date:** 2026-03-11
**Valid until:** 2026-04-10 (stable domain; no fast-moving dependencies)
