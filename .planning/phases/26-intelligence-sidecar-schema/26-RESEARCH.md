# Phase 26: Intelligence Sidecar + Schema - Research

**Researched:** 2026-03-11
**Domain:** Dexie schema migration, IndexedDB sidecar architecture, enrichment refactoring
**Confidence:** HIGH

## Summary

Phase 26 is a schema + plumbing phase with no new AI behaviors. The core work involves: (1) creating a Dexie v9 migration that adds the `atomIntelligence` sidecar table, `entities` table, and `entityRelations` table while dropping the Phase 19 `entityGraph` table; (2) refactoring the enrichment pipeline from text-appending in `atom.content` to structured sidecar records; (3) adding a `smartLinks[]` field to the atom schema; and (4) stripping all existing enrichment text from atom/inbox content (wipe, no migration).

The project uses Dexie 4.3.0 with Zod 4.3.6 for schema validation. There are 8 existing migration files (v1-v8) following a well-established pattern: each version gets its own file in `src/storage/migrations/`, called from the `BinderDB` constructor. The enrichment system currently writes Q&A pairs as `\n---\n`-separated text lines in `atom.content` via `appendEnrichment()` and reads them back via `parseEnrichment()`. Six files reference these functions and all must be refactored.

**Primary recommendation:** Execute in three logical waves: (1) v9 schema migration with table creation, data wipe, and entityGraph drop; (2) sidecar read/write helpers and enrichment engine refactoring; (3) UI component updates and smartLinks schema addition.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Wipe all existing enrichment data** -- no migration of prior enrichment answers from atom.content
- Eager v9 migration: strip `\n---\n` enrichment sections from all atom/inbox content
- Reset `maturityScore`, `maturityFilled`, `enrichmentDepth` on all inbox items
- Drop and replace the Phase 19 `entityGraph` table entirely (old graph data not preserved)
- **Delete `appendEnrichment()` and `parseEnrichment()`** from `src/ai/clarification/enrichment.ts` -- full sidecar switch
- Enrichment engine writes structured Q&A records to `atomIntelligence.enrichment[]`
- UI renders enrichment from sidecar in the same visual location (below atom content), but reads from sidecar not content parsing
- **atomIntelligence table**: one row per atom with nested arrays keyed by atomId; typed fields for `enrichment[]`, `entityMentions[]`, `cognitiveSignals[]`; extensible `records[]` bag; CRDT-ready metadata (`version`, `deviceId`, `lastUpdated`, `schemaVersion`)
- **Smart links**: new `atom.smartLinks[]` field (separate from existing `atom.links[]`); typed with `type` discriminator (url, ms-graph, photo-share, app-deep-link); minimal at creation (type, uri, label?, note?, addedAt); agent-resolved metadata goes in sidecar
- **Phase 26 scope: schema only for smartLinks** -- no URL detection, no auto-extraction, no resolution workers
- **Entity tables**: replace `entityGraph` with `entities` + `entityRelations` tables; entities has `id`, `canonicalName`, `type` (PER/LOC/ORG), `aliases: string[]`, `mentionCount`, `firstSeen`, `lastSeen`, `version`, `deviceId`, `updatedAt`; entityRelations has typed edges with `confidence`, `sourceAttribution`, `evidence[]`, CRDT fields
- **Relationship types**: ~10 core predefined TypeScript union (spouse, parent, child, colleague, reports-to, healthcare-provider, friend, org-member, lives-at, works-at) stored as strings

### Claude's Discretion
- Exact Dexie index design for atomIntelligence, entities, entityRelations
- Migration ordering and transaction boundaries
- SmartLink Zod schema details and validation
- How cognitiveSignals[] cache interacts with existing transient signal flow
- Entity table compound indexes for efficient lookup patterns
- Which files need refactoring to remove parseEnrichment/appendEnrichment dependencies

### Deferred Ideas (OUT OF SCOPE)
- Autonomous enrichment loop FSM
- Spine cache (cross-binder referential potential)
- Background WebLLM agents
- Smart link auto-detection (regex/NLP URL extraction)
- Smart link resolution workers (OG metadata, summarization, thumbnail caching)
- MS Graph integration
- Binder-level intelligence records
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SIDE-01 | `atomIntelligence` Dexie table stores all AI-generated knowledge per atom separately from atom.content | v9 migration creates table with proper indexes; TypeScript interface defines shape; sidecar CRUD helpers provide read/write API |
| SIDE-02 | Existing enrichment answers migrated from atom.content text to structured sidecar records | v9 migration wipes enrichment text from content (user decision: no data migration); strips `\n---\n` sections; resets maturity fields |
| SIDE-03 | Enrichment engine writes structured Q&A to sidecar; UI renders from sidecar not content | enrichment-engine.ts refactored to return sidecar records; store.ts writes to atomIntelligence table; UI reads sidecar |
| SIDE-04 | Atom schema gains structured `links[]` field for smart links | New `smartLinks[]` field on BaseAtomFields with Zod schema; typed discriminator for future extensibility |
| ENTR-01 | `entities` Dexie table with dedup, normalization, alias tracking, CRDT fields | v9 migration creates table with compound indexes; TypeScript interface with Zod validation |
| ENTR-02 | `entityRelations` Dexie table with typed edges, source attribution, confidence | v9 migration creates table; relationship type union; evidence array for provenance tracking |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Dexie | ^4.3.0 | IndexedDB wrapper, schema migrations | Already in use; handles version upgrades, compound indexes, transactions |
| Zod | ^4.3.6 (v4 import) | Schema validation for new types | Already in use via `zod/v4`; single source of truth for atom types |
| SolidJS | existing | Reactive UI rendering | Already the UI framework; enrichment UI reads reactive sidecar data |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| crypto.randomUUID() | Web API | ID generation for new table rows | Same pattern used by entity-graph.ts |
| WriteQueue | internal | Batched Dexie writes | For sidecar writes that need debouncing |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Nested arrays in one row | Separate tables per intelligence type | Separate tables = more joins, more CRDT complexity; one row per atom is simpler for Phase 27-29 reads |
| String relationship types | Enum-only types | Strings allow adding new types without migration; TypeScript union provides compile-time safety |

## Architecture Patterns

### Recommended Project Structure
```
src/
  storage/
    db.ts                          # Add v9 migration call, new table types
    migrations/
      v9.ts                        # NEW: sidecar + entity tables, content wipe
    entity-graph.ts                # DELETE (replaced by new entity helpers)
    atom-intelligence.ts           # NEW: sidecar CRUD helpers
    entity-helpers.ts              # NEW: entity + relation CRUD (placeholder for Phase 27)
  types/
    atoms.ts                       # Add smartLinks[] to BaseAtomFields
    intelligence.ts                # NEW: AtomIntelligence, Entity, EntityRelation types + Zod schemas
  ai/
    clarification/
      enrichment.ts                # DELETE appendEnrichment + parseEnrichment
    enrichment/
      enrichment-engine.ts         # Refactor: remove parseEnrichment dependency
      graduation.ts                # Refactor: remove appendEnrichment dependency
  ui/
    signals/
      store.ts                     # Refactor: write to sidecar instead of content
    components/
      ClarificationFlow.tsx        # Refactor: remove appendEnrichment import
      EnrichmentWizard.tsx         # Refactor: read from sidecar for display
```

### Pattern 1: Dexie Migration with Table Drop
**What:** Drop the old `entityGraph` table and create new tables in a single v9 migration
**When to use:** When replacing a table entirely with incompatible schema
**Example:**
```typescript
// src/storage/migrations/v9.ts
import type { BinderDB } from '../db';

export function applyV9Migration(db: BinderDB): void {
  db.version(9).stores({
    // Drop entityGraph by setting to null
    entityGraph: null,
    // New tables
    atomIntelligence: '&atomId, lastUpdated',
    entities: '&id, canonicalName, type, [type+canonicalName], updatedAt',
    entityRelations: '&id, sourceEntityId, targetEntityId, [sourceEntityId+relationshipType], updatedAt',
  }).upgrade((tx) => {
    // Strip enrichment text from all atoms
    tx.table('atoms').toCollection().modify((atom: Record<string, unknown>) => {
      const content = atom.content as string;
      if (typeof content === 'string') {
        const sepIdx = content.indexOf('\n---\n');
        if (sepIdx !== -1) {
          atom.content = content.slice(0, sepIdx);
        }
      }
    });
    // Strip enrichment text from inbox + reset maturity
    tx.table('inbox').toCollection().modify((item: Record<string, unknown>) => {
      const content = item.content as string;
      if (typeof content === 'string') {
        const sepIdx = content.indexOf('\n---\n');
        if (sepIdx !== -1) {
          item.content = content.slice(0, sepIdx);
        }
      }
      item.maturityScore = 0;
      item.maturityFilled = [];
      item.enrichmentDepth = {};
    });
  });
}
```
**Source:** Dexie docs (setting store schema to `null` deletes the table), verified against existing v6 migration pattern in this project.

### Pattern 2: Sidecar One-Row-Per-Atom
**What:** Each atom gets exactly one row in `atomIntelligence`, keyed by `atomId`. All intelligence types are nested arrays within that row.
**When to use:** When multiple agent types write intelligence for the same atom and consumers need to read all intelligence in one lookup.
**Key design:**
```typescript
// src/types/intelligence.ts
export interface AtomIntelligence {
  atomId: string;                    // Primary key, matches atom.id
  enrichment: EnrichmentRecord[];    // Q&A pairs from enrichment wizard
  entityMentions: EntityMention[];   // Placeholder for Phase 27
  cognitiveSignals: CachedCognitiveSignal[]; // Persisted ONNX outputs
  records: GenericIntelligenceRecord[]; // Extensible bag for future agents
  // CRDT metadata
  version: number;                   // Lamport/HLC clock
  deviceId: string;                  // Device that last wrote
  lastUpdated: number;               // Timestamp
  schemaVersion: number;             // For future record format evolution
}

export interface EnrichmentRecord {
  category: string;                  // MissingInfoCategory value
  question: string;                  // The question that was asked
  answer: string;                    // User's answer
  depth: number;                     // Iterative deepening level (0 = first pass)
  timestamp: number;                 // When answered
  tier: string;                      // T1/T2/T3 source
}
```

### Pattern 3: SmartLink Typed Discriminator
**What:** Smart links use a `type` field to discriminate between URL links, document links, etc.
**When to use:** On atoms where users provide external references.
**Example:**
```typescript
// In src/types/atoms.ts (added to BaseAtomFields)
export const SmartLinkSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['url', 'ms-graph', 'photo-share', 'app-deep-link']),
  uri: z.string(),
  label: z.string().optional(),
  note: z.string().optional(),      // User annotation for why link matters
  addedAt: z.number(),
});
export type SmartLink = z.infer<typeof SmartLinkSchema>;

// Add to BaseAtomFields:
// smartLinks: z.array(SmartLinkSchema).default([]),
```

### Anti-Patterns to Avoid
- **Writing sidecar data inside atom.content:** The entire point of this phase is to stop doing this. No enrichment text in content.
- **Separate Dexie table per intelligence type:** Would require multi-table joins for "get all intelligence for atom X." One row per atom is correct.
- **Auto-creating atomIntelligence rows eagerly:** Only create a sidecar row when the first piece of intelligence is written. Not every atom needs one.
- **Indexing array fields in atomIntelligence:** Dexie multi-entry indexes on nested arrays are expensive. The `atomId` primary key is sufficient; filter in-memory after lookup.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| UUID generation | Custom ID generator | `crypto.randomUUID()` | Browser API, already used throughout project |
| Debounced writes | Custom setTimeout logic | `WriteQueue` from `src/storage/write-queue.ts` | Existing batched write pattern, handles transaction boundaries |
| Schema validation | Manual type checks | Zod schemas | Already the project standard, catches invalid data at boundaries |
| Content separator parsing | Custom regex | Delete it entirely | The `\n---\n` parser is what we're eliminating; don't create a new one |

## Common Pitfalls

### Pitfall 1: Dexie Table Drop Order
**What goes wrong:** Setting a table to `null` in the same version where you need to read from it in the `upgrade()` function causes the table to be inaccessible.
**Why it happens:** Dexie processes table deletions before upgrade callbacks in some edge cases.
**How to avoid:** The `entityGraph` table has no data worth preserving (user decision: wipe), so the drop and upgrade are safe in the same version. If data migration were needed, you'd need separate version bumps.
**Warning signs:** `upgrade()` callback fails silently when accessing a dropped table.

### Pitfall 2: WriteQueue Transaction Scope
**What goes wrong:** The existing `WriteQueue.flush()` only includes `[db.atoms, db.changelog, db.inbox, db.sections, db.sectionItems, db.config]` in its transaction scope. Writing to `atomIntelligence` through WriteQueue will fail.
**Why it happens:** Transaction table list is hardcoded in `write-queue.ts` line 52-53.
**How to avoid:** Update the WriteQueue transaction scope to include new tables (`atomIntelligence`, `entities`, `entityRelations`), OR create sidecar writes as direct `db.atomIntelligence.put()` calls outside the WriteQueue (simpler, since enrichment writes are infrequent and don't need batching).
**Warning signs:** `TransactionInactiveError` or silently dropped writes.

### Pitfall 3: SolidJS Store Proxy with Sidecar Data
**What goes wrong:** Storing atomIntelligence records in the SolidJS `createStore` can cause proxy issues with nested arrays and function callbacks (documented bug from Phase 25).
**Why it happens:** SolidJS proxies deeply nested objects, breaking plain object identity and function references.
**How to avoid:** Keep sidecar data outside the main reactive store. Use a separate `createSignal<AtomIntelligence | null>()` for the currently-viewed atom's intelligence, or read directly from Dexie with `useLiveQuery` patterns.
**Warning signs:** Enrichment answers disappearing, stale reads, silent failures when writing back to Dexie.

### Pitfall 4: Enrichment Content Stripping Edge Cases
**What goes wrong:** The `\n---\n` separator might appear in user-authored content (e.g., Markdown horizontal rules).
**Why it happens:** Users can type `---` in their content naturally.
**How to avoid:** The wipe is intentionally aggressive (user decision). Strip from the FIRST occurrence of `\n---\n`. If a user had a Markdown `---` before any enrichment, that content after it will be lost. This is an acceptable tradeoff since: (a) it's a one-time migration, (b) enrichment was always below the separator, (c) the user decided to wipe.
**Warning signs:** User content truncated after migration. Could add a console.log count of affected atoms for visibility.

### Pitfall 5: Import Graph After Deleting enrichment.ts Functions
**What goes wrong:** Removing `appendEnrichment` and `parseEnrichment` breaks 6 files that import them.
**Why it happens:** These functions are referenced in: store.ts, enrichment-engine.ts, maturity.ts (comment only), graduation.ts, ClarificationFlow.tsx, and the source file itself.
**How to avoid:** Refactor all consumers BEFORE deleting the functions. The refactoring order matters: (1) create sidecar write helpers, (2) update store.ts to write sidecar, (3) update enrichment-engine.ts to not parse content, (4) update graduation.ts to build parent content without appendEnrichment, (5) update ClarificationFlow.tsx, (6) delete enrichment.ts functions.
**Warning signs:** TypeScript build errors from unresolved imports.

### Pitfall 6: Entity Table Over-Indexing
**What goes wrong:** Creating too many indexes on entity tables slows down writes without benefiting reads.
**Why it happens:** Anticipating Phase 27-29 query patterns that don't exist yet.
**How to avoid:** Start minimal. Entities: `&id`, `canonicalName`, `type`, `[type+canonicalName]`. Relations: `&id`, `sourceEntityId`, `targetEntityId`, `[sourceEntityId+relationshipType]`. Add indexes in later phases when query patterns are proven.
**Warning signs:** Entity creation taking >10ms per record (should be <2ms).

## Code Examples

### Sidecar Write Helper
```typescript
// src/storage/atom-intelligence.ts
import { db } from './db';
import type { AtomIntelligence, EnrichmentRecord } from '../types/intelligence';

/**
 * Get or create the intelligence sidecar for an atom.
 */
export async function getOrCreateIntelligence(atomId: string): Promise<AtomIntelligence> {
  const existing = await db.atomIntelligence.get(atomId);
  if (existing) return existing;

  const fresh: AtomIntelligence = {
    atomId,
    enrichment: [],
    entityMentions: [],
    cognitiveSignals: [],
    records: [],
    version: 0,
    deviceId: '',  // Set by CRDT layer in v7.0
    lastUpdated: Date.now(),
    schemaVersion: 1,
  };
  await db.atomIntelligence.put(fresh);
  return fresh;
}

/**
 * Append an enrichment record to the sidecar.
 * Creates the sidecar row if it doesn't exist.
 */
export async function writeEnrichmentRecord(
  atomId: string,
  record: EnrichmentRecord,
): Promise<void> {
  const intel = await getOrCreateIntelligence(atomId);
  // Replace existing record for same category+depth, or append
  const idx = intel.enrichment.findIndex(
    (r) => r.category === record.category && r.depth === record.depth
  );
  if (idx >= 0) {
    intel.enrichment[idx] = record;
  } else {
    intel.enrichment.push(record);
  }
  intel.lastUpdated = Date.now();
  intel.version += 1;
  await db.atomIntelligence.put(intel);
}
```

### Refactored Store Answer Handler (sketch)
```typescript
// In store.ts handleEnrichmentAnswer, replace the content-appending block:

// OLD: const enrichedContent = appendEnrichment(original, updated.answers);
// NEW: write structured record to sidecar
const record: EnrichmentRecord = {
  category: answer.category,
  question: currentQuestion.question,
  answer: answer.wasFreeform ? answer.freeformText! : answer.selectedOption!,
  depth: updated.categoryDepth[answer.category] ?? 0,
  timestamp: Date.now(),
  tier: 'T1', // or derive from session
};
await writeEnrichmentRecord(session.inboxItemId, record);
// No longer modify item.content
```

### Enrichment UI Reading from Sidecar
```typescript
// In EnrichmentWizard.tsx or atom detail view:
import { db } from '../../storage/db';

// Read enrichment records for display
const intel = await db.atomIntelligence.get(atomId);
const enrichmentPairs = (intel?.enrichment ?? [])
  .filter(r => r.answer)
  .map(r => ({ category: r.category, question: r.question, answer: r.answer, depth: r.depth }));
// Render these pairs in the same visual location as before
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Text-appended enrichment in atom.content | Structured sidecar records in atomIntelligence | Phase 26 (this phase) | Clean separation of user content from AI knowledge |
| entityGraph flat table | Normalized entities + entityRelations tables | Phase 26 (this phase) | Proper entity dedup, alias tracking, typed relationships |
| No smart link support | smartLinks[] typed array on atoms | Phase 26 (this phase) | Foundation for future link resolution and deep links |

**Deprecated/outdated:**
- `appendEnrichment()` / `parseEnrichment()`: Being deleted entirely. Not deprecated -- removed.
- `entityGraph` table: Being dropped. Replaced by `entities` + `entityRelations`.
- `entity-graph.ts`: Being deleted. Replaced by `atom-intelligence.ts` + `entity-helpers.ts`.

## Open Questions

1. **CognitiveSignals cache invalidation**
   - What we know: 10 ONNX model outputs are currently transient (computed on triage, discarded). Phase 26 persists them in `atomIntelligence.cognitiveSignals[]`.
   - What's unclear: When should cached signals be invalidated? On content edit? On re-triage?
   - Recommendation: Cache on first computation, invalidate on content change (`updated_at` bump). Simple timestamp comparison: if atom.updated_at > signal.timestamp, recompute. This is a lightweight check.

2. **WriteQueue scope expansion vs direct writes**
   - What we know: WriteQueue hardcodes its transaction table list. Sidecar writes need atomIntelligence access.
   - What's unclear: Whether to expand WriteQueue or bypass it for sidecar writes.
   - Recommendation: Use direct `db.atomIntelligence.put()` for sidecar writes. Enrichment answers are user-paced (seconds apart), not rapid-fire like typing. No batching needed. This avoids touching the WriteQueue's transaction scope, which could have subtle side effects on existing write paths.

3. **Graduation flow parent content**
   - What we know: `graduation.ts` currently uses `appendEnrichment()` to build the parent atom's content.
   - What's unclear: With sidecar enrichment, should graduated atoms still have enrichment text in their content?
   - Recommendation: No. Graduated atoms get clean content (no enrichment text). The enrichment intelligence persists in the sidecar and follows the atom. The graduation flow reads sidecar records to inform parent type/quality decisions but does not embed them in content.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected -- no test runner configured |
| Config file | none -- see Wave 0 |
| Quick run command | `npx tsc --noEmit` (type checking only) |
| Full suite command | `npx tsc --noEmit && pnpm build` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SIDE-01 | atomIntelligence table created with correct schema | manual | Open DevTools > Application > IndexedDB > BinderOS | No |
| SIDE-02 | Enrichment text stripped from existing atoms/inbox on upgrade | manual | Check atom content in DevTools after v9 migration runs | No |
| SIDE-03 | Enrichment engine writes to sidecar, UI reads from sidecar | manual | Enrich an inbox item, verify atomIntelligence row created | No |
| SIDE-04 | smartLinks[] field exists on atoms with Zod validation | smoke | `npx tsc --noEmit` (type-level validation) | No |
| ENTR-01 | entities table created with proper indexes | manual | Check IndexedDB schema in DevTools | No |
| ENTR-02 | entityRelations table created with proper indexes | manual | Check IndexedDB schema in DevTools | No |

### Sampling Rate
- **Per task commit:** `npx tsc --noEmit` (catches type errors from refactoring)
- **Per wave merge:** `pnpm build` (full Vite build catches import/bundle issues)
- **Phase gate:** Manual IndexedDB inspection + enrichment flow walkthrough

### Wave 0 Gaps
- No test framework installed (no vitest, no jest). This is consistent with the project's entire history -- all 25 prior phases shipped without unit tests. The project relies on TypeScript type checking and manual verification.
- No automated migration testing is possible without a test DB setup (Dexie + fake-indexeddb). Given project conventions, this phase should follow the same manual verification pattern.

## Sources

### Primary (HIGH confidence)
- Project source code: `src/storage/db.ts`, `src/storage/migrations/v6.ts` through `v8.ts` -- migration patterns
- Project source code: `src/ai/clarification/enrichment.ts` -- functions being deleted
- Project source code: `src/ai/enrichment/enrichment-engine.ts` -- consumer being refactored
- Project source code: `src/ui/signals/store.ts` lines 625-834 -- enrichment answer handling
- Project source code: `src/storage/entity-graph.ts` -- table being replaced
- Project source code: `src/types/atoms.ts` -- current atom schema
- Project source code: `src/storage/write-queue.ts` -- transaction scope limitation
- [Dexie table deletion docs](https://github.com/dfahlander/Dexie.js/issues/275) -- set store to `null` to drop table
- [Dexie table drop + migration interaction](https://github.com/dfahlander/Dexie.js/issues/742) -- drop and upgrade in same version

### Secondary (MEDIUM confidence)
- Dexie migration documentation -- version upgrade sequential processing

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use, patterns well-established in 8 prior migrations
- Architecture: HIGH -- sidecar design is locked by user decisions, implementation follows existing Dexie patterns exactly
- Pitfalls: HIGH -- identified from direct code analysis (WriteQueue scope, import graph, SolidJS proxy) with specific line references
- Index design: MEDIUM -- recommended indexes are reasonable but may need adjustment in Phase 27 when actual query patterns emerge

**Research date:** 2026-03-11
**Valid until:** 2026-04-11 (stable -- Dexie 4.x and project patterns are well-established)

**Files with parseEnrichment/appendEnrichment dependencies (complete list):**
1. `src/ai/clarification/enrichment.ts` -- source file (DELETE both functions)
2. `src/ui/signals/store.ts` -- line 634 import, line 806-807 usage
3. `src/ai/enrichment/enrichment-engine.ts` -- line 28 import, line 117 usage
4. `src/ai/enrichment/graduation.ts` -- line 23 import, line 79 usage
5. `src/ui/components/ClarificationFlow.tsx` -- line 17 import, line 178 usage
6. `src/ai/enrichment/maturity.ts` -- line 59 comment reference only (no code change needed)
