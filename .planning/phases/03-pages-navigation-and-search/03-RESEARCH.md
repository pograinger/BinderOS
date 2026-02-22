# Phase 3: Pages, Navigation, and Search - Research

**Researched:** 2026-02-22
**Domain:** Query pages, full-text search, local vector embeddings, keyboard navigation, command palette, tags/backlinks, saved filters
**Confidence:** HIGH (core stack), MEDIUM (vector embeddings strategy), LOW (solid-command-palette maintenance)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Default Pages — GTD-Aligned Query Views**
- GTD methodology is the framework and lens for deciding what needs attention
- **Today page**: Smart focus list — due today + today's events + top 3-5 highest-priority open tasks surfaced by the compute engine + items at risk of being forgotten (approaching staleness thresholds, upcoming deadlines)
- **This Week page**: Lookahead view — tasks due this week + events this week + items approaching deadlines
- **Active Projects page**: Tasks grouped by project section, GTD-style — each project shows its next action (highest-priority task)
- **Waiting page**: Tasks with "waiting" status — GTD waiting-for list with staleness alerts on long-waiting items
- **Insights page**: All Insight-type atoms sorted by recency
- Layout: Card list pattern (continues the existing AtomCard pattern from Inbox/Review — consistent, already built)
- **Empty states**: Compute-engine-driven contextual prompts, not static messages. Use existing scores, staleness, and cap data to generate GTD-aligned suggestions

**Search Experience — Intelligent, Multi-Signal**
- **Invocation**: Spotlight-style overlay via Cmd/Ctrl+K — floating search box with instant type-ahead results
- **Full-text search**: Required (NAV-01) across all atom types
- **Graph-relationship awareness**: Search results boosted when linked to recent/active atoms — leverages existing atom links array
- **Local vector embeddings**: Ship a small ONNX model via WebAssembly for in-browser semantic search. Keeps local-first promise (zero network calls)
- **Ranking**: Blend text match, graph proximity, semantic similarity, and priority score into a single relevance score (Claude's discretion on exact weights)
- **Filterable inline**: Small filter chips below search input in the overlay for type, status, date range refinement
- **Interaction logging**: Log search queries, filter selections, and result clicks as interaction events — extends the change log pattern

**Keyboard Navigation & Command Palette**
- **Navigation model**: Responsive from the start — keyboard shortcuts for desktop, touch-friendly equivalents for mobile
- **Keyboard shortcuts**: Standard web app conventions (Tab/Shift+Tab, Enter, arrow keys in lists) with common action shortcuts (Ctrl+N new atom, etc.)
- **Discoverability**: Both inline hints (tooltips show shortcuts) + dedicated shortcut reference sheet (? key)
- **Command palette**: Separate from search (search is Spotlight overlay). Claude's discretion on content — actions + recent atoms is recommended
- **Mobile command palette**: Floating action button (FAB) in bottom-right corner (already built in Phase 1)
- **Design directive**: UI should feel like "the AI assistant of the future" — intelligent, anticipatory, sleek

**Tags, Backlinks & Saved Filters**
- **Tag model**: Freeform tags with autocomplete + a special "context" field with GTD-style values (@home, @office, @errands, etc.)
- **Backlinks**: Collapsible "Linked from (N)" section at the bottom of atom detail view. Collapsed by default, expand to see linking atoms as compact cards
- **Saved filters**: Save as named page — user configures filters on any page, clicks "Save as page," and it appears as a new tab alongside default pages
- **Inline linking**: @mention syntax in atom content (type @atomName to create a link with autocomplete showing existing atoms)

**Task Status & Date Fields (ORG-07, ORG-08)**
- Task statuses: open, in-progress, waiting, done, cancelled — maps directly to GTD states
- Tasks support due date and scheduled date
- Events are dated by nature
- These fields power the query pages (Today, This Week, Waiting)

### Claude's Discretion
- Filter bar visibility per page context (always-visible vs toggle-reveal)
- Page switching integration with existing tab bar/sidebar layout
- Command palette content (actions + recent atoms recommended)
- Search result ranking algorithm (blended score recommended)
- Exact keyboard shortcut assignments
- Specific empty state prompt wording per page

### Deferred Ideas (OUT OF SCOPE)
- **Vector embedding learning/adaptation**: v2 AI Orchestration can retrain or fine-tune embeddings based on user interaction patterns
- **Cross-context reasoning**: "You always filter by Tasks on Mondays" — true behavioral learning requires v2 AI
- **ML-based ranking personalization**: v1 uses frequency heuristics, v2 adds proper learning models
- **Full mobile-optimized UX (MOBL-01)**: Phase 3 is responsive from the start, but dedicated mobile UX optimization is v2
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ORG-03 | Pages are query definitions over the atom store, not separate data silos | `createMemo` derived from `state.atoms` — no new DB tables; pure in-memory filter/sort functions. Existing Dexie indexes on `type`, `status`, `updated_at` support efficient slicing |
| ORG-04 | Default pages exist: Today, This Week, Active Projects, Waiting, Insights | Five `createMemo` query functions on existing `state.atoms`; new page tabs in `PageTabStrip`; new `Match` branches in `MainPane` |
| ORG-05 | User can filter atom lists by type, status, date range, section, and priority tier | `createMemo` filter chain; filter state as local `createSignal`; filter chips UI; tier from `state.scores[id].priorityTier` (already computed) |
| ORG-06 | User can sort atom lists by date, priority score, last updated, and staleness | Sort comparators on `created_at`, `state.scores[id].priorityScore`, `updated_at`, `state.scores[id].staleness`; sort state as `createSignal` |
| ORG-07 | Tasks have status: open, in-progress, waiting, done, cancelled | Already in schema (`AtomStatus` enum in `atoms.ts`). Phase 3 adds UI to set/filter by status |
| ORG-08 | Tasks support due date and scheduled date; Events are dated by nature | Already in schema (`dueDate`, `scheduledDate` on `TaskAtom`, `eventDate` on `EventAtom`). Phase 3 adds UI for setting and querying these fields |
| NAV-01 | User can full-text search across all atom types with results ranked by relevance | MiniSearch 7.x in-memory index; rebuild on `STATE_UPDATE`; search in Worker to avoid main-thread blocking |
| NAV-02 | Search supports filtering by type, status, and date range | MiniSearch `filter` option on search call + post-filter on date range |
| NAV-03 | User can navigate the entire system via keyboard (arrow keys, hotkeys for common actions) | Existing `keydown` handler in `app.tsx` extended; roving `tabindex` for list navigation; ARIA `aria-activedescendant` pattern |
| NAV-04 | Command palette is accessible via keyboard shortcut and lists all available actions | Build custom or use `solid-command-palette` (maintenance risk noted) — leaning custom given its simplicity |
| NAV-05 | Backlinks are visible on each atom — user can see all atoms that link to the current one | `state.atoms.filter(a => a.links.some(l => l.targetId === currentAtomId))` — pure derived memo; no new DB structure needed |
| NAV-06 | User can add lightweight tags to atoms for cross-cutting categorization | Add `tags: string[]` + `context: string` fields to Atom schema via Dexie v2 migration |
| NAV-07 | User can create and save custom filter definitions on pages | Save filter config as JSON in Dexie `config` table; render as tabs in `PageTabStrip` |
| CAPT-01 | User can quick-capture an item to the inbox via keyboard shortcut from any view | Already wired: `Ctrl+N`/`Cmd+N` in `app.tsx` opens `CaptureOverlay`. Phase 3 ensures it works from all new pages |
</phase_requirements>

---

## Summary

Phase 3 builds on a mature foundation. Phases 1 and 2 delivered the data model, Dexie storage, WASM scoring engine, and the core UI shell. Phase 3 adds the navigational and discovery layer on top. The good news: **the hardest architectural decisions are already made** — atoms are in IndexedDB, scores live in `state.scores`, and the `activePage`/`MainPane` routing system is already stubbed for expansion.

The central challenge is the **local vector embedding** requirement. Shipping an ONNX model in the browser for semantic search is non-trivial: models are large (~22-90 MB depending on quantization), initial load is slow, and they must run off the main thread. The recommended strategy is to **use Transformers.js v4 in a dedicated Web Worker**, lazy-load on first search, cache the model after first download, and fall back gracefully to pure MiniSearch text ranking if the model is not yet loaded. MiniSearch alone handles NAV-01/NAV-02 completely; vector embeddings are an enhancement, not a blocker.

The **query pages** (ORG-03/04) are pure `createMemo` compositions over `state.atoms`. No new DB tables. The scores (`priorityScore`, `staleness`, `priorityTier`) are already computed by the WASM engine and live in `state.scores`. Today's page selects atoms where `dueDate <= endOfDay || priorityTier === 'Critical'`. Waiting is `status === 'waiting'`. This is filter/sort logic, not architecture.

**Primary recommendation:** Ship MiniSearch for full-text search first (fast, deterministic, offline-safe), then layer vector embeddings behind a worker with graceful degradation. Build query pages as pure derived memos. Build command palette as a custom component (solid-command-palette is unmaintained). Schema migration for tags is a one-line Dexie v2 stores() addition.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SolidJS | 1.9.11 (installed) | Reactive UI, `createMemo` for query pages | Already installed; fine-grained reactivity perfect for filter/sort derived state |
| Dexie.js | 4.3.0 (installed) | IndexedDB storage, schema migration for tags | Already installed; schema evolution via version() |
| MiniSearch | 7.2.0 | Full-text search with fuzzy matching, prefix, field boost | Tiny (~30 kB minzipped), runs in memory, no server, instant results |
| @huggingface/transformers | 4.x (v4 released 2026-02-09) | Local ONNX embedding inference for semantic search | 53% smaller bundle than v3; WASM + WebGPU backends; works offline after first download |
| Zod v4 | 4.3.6 (installed) | Schema validation for new tag/context fields | Already installed; import via `zod/v4` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @solid-primitives/keyboard | latest | `createShortcut` reactive keyboard primitive | Use for declarative shortcut definitions alongside the existing imperative `keydown` handler |
| solid-focus-trap | latest | Trap focus inside overlays (command palette, search overlay) | Required for accessibility compliance in modal/overlay components |
| corvu (Dialog) | latest | Accessible dialog primitives for SolidJS | Use for any new modal/overlay that needs WAI-ARIA compliance — already follows the project's unstyled pattern |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| MiniSearch | FlexSearch | FlexSearch is faster but lacks auto-suggest and has a more complex API; MiniSearch is simpler and well-maintained (7.2.0, weekly downloads ~1M) |
| MiniSearch | Lunr.js | Lunr is older, larger, less actively maintained; MiniSearch is the current community standard |
| @huggingface/transformers | onnxruntime-web directly | Lower-level; requires manual model loading, tokenization, pooling. Transformers.js wraps all this correctly |
| @huggingface/transformers | @xenova/transformers | @xenova is the old package name; v4 is published under `@huggingface/transformers` |
| Custom command palette | solid-command-palette | solid-command-palette (165 stars, no releases published to npm — version 0.x, stale) is not production-ready. Build custom. |

**Installation (new packages only):**
```bash
pnpm add minisearch @huggingface/transformers
pnpm add -D @types/minisearch
```

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── ui/
│   ├── views/
│   │   ├── pages/
│   │   │   ├── TodayPage.tsx         # New: GTD Today query view
│   │   │   ├── ThisWeekPage.tsx      # New: GTD This Week query view
│   │   │   ├── ActiveProjectsPage.tsx # New: Active Projects grouped view
│   │   │   ├── WaitingPage.tsx       # New: Waiting status view
│   │   │   └── InsightsPage.tsx      # New: Insights type view
│   │   ├── SearchOverlay.tsx         # New: Cmd/Ctrl+K spotlight search
│   │   └── AtomDetailView.tsx        # New: Full atom detail with backlinks
│   ├── components/
│   │   ├── CommandPalette.tsx        # New: Cmd/Ctrl+P palette
│   │   ├── FilterBar.tsx             # New: Shared filter/sort controls
│   │   ├── TagInput.tsx              # New: Tag + context field input with autocomplete
│   │   └── BacklinksPanel.tsx        # New: Collapsible backlinks section
│   └── signals/
│       ├── store.ts                  # Extend: add tags/savedFilters/interactionLog
│       └── queries.ts                # New: shared createMemo query functions
├── search/
│   ├── search-index.ts               # New: MiniSearch instance management
│   ├── search-worker.ts              # New: Embedding inference in dedicated worker
│   └── ranking.ts                    # New: Blended relevance score function
└── storage/
    └── migrations/
        └── v2.ts                     # New: Dexie schema v2 — tags, context, savedFilters table
```

### Pattern 1: Query Pages as Pure Derived Memos (ORG-03/ORG-04)

**What:** Each "page" is a `createMemo` that filters and sorts `state.atoms` — no separate storage, no network calls, pure in-memory computation.

**When to use:** Always. Pages are views, not data silos.

**Example:**
```typescript
// Source: SolidJS official docs - createMemo pattern
// src/ui/signals/queries.ts

import { createMemo } from 'solid-js';
import { state } from './store';
import type { Atom } from '../../types/atoms';

const startOfDay = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const endOfDay = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
};

const endOfWeek = () => {
  const d = new Date();
  const day = d.getDay();
  const diff = 7 - day; // days until Sunday
  d.setDate(d.getDate() + diff);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
};

/** Today: due today + events today + critical tasks + atoms near staleness threshold */
export const todayAtoms = createMemo((): Atom[] => {
  const now = Date.now();
  const end = endOfDay();

  return state.atoms.filter((a) => {
    if (a.status === 'done' || a.status === 'cancelled' || a.status === 'archived') return false;

    // Tasks due today or overdue
    if (a.type === 'task' && 'dueDate' in a && a.dueDate != null) {
      if (a.dueDate <= end) return true;
    }

    // Events happening today
    if (a.type === 'event' && 'eventDate' in a && a.eventDate != null) {
      if (a.eventDate >= startOfDay() && a.eventDate <= end) return true;
    }

    // Top priority tasks (Critical tier from compute engine)
    const score = state.scores[a.id];
    if (a.type === 'task' && score?.priorityTier === 'Critical') return true;

    // Atoms approaching staleness (staleness > 0.6 = approaching critical)
    if (score && score.staleness > 0.6) return true;

    return false;
  }).sort((a, b) => {
    // Sort: overdue first, then by priority score desc
    const scoreA = state.scores[a.id]?.priorityScore ?? 0;
    const scoreB = state.scores[b.id]?.priorityScore ?? 0;
    return scoreB - scoreA;
  });
});

/** Waiting: tasks with status='waiting', sorted by updated_at asc (longest waiting first) */
export const waitingAtoms = createMemo((): Atom[] => {
  return state.atoms
    .filter((a) => a.type === 'task' && a.status === 'waiting')
    .sort((a, b) => a.updated_at - b.updated_at);
});

/** Insights: all insight-type atoms, sorted by created_at desc */
export const insightAtoms = createMemo((): Atom[] => {
  return state.atoms
    .filter((a) => a.type === 'insight')
    .sort((a, b) => b.created_at - a.created_at);
});
```

### Pattern 2: MiniSearch Full-Text Index (NAV-01/NAV-02)

**What:** A MiniSearch instance is rebuilt on each `STATE_UPDATE` (in the Worker) and the serialized index is sent to the main thread for fast synchronous queries.

**Alternative approach:** Maintain MiniSearch on the main thread, rebuild in a `createEffect` watching `state.atoms`. This avoids serialization overhead for small datasets (< 10,000 atoms) and is simpler.

**When to use:** Rebuild-on-main-thread approach is fine for BinderOS (capped dataset, small atoms). Worker approach adds complexity without benefit for this scale.

**Example:**
```typescript
// Source: MiniSearch official docs - https://github.com/lucaong/minisearch
// src/search/search-index.ts

import MiniSearch from 'minisearch';
import type { Atom } from '../types/atoms';

export interface SearchResult {
  id: string;
  score: number;
  match: Record<string, string[]>;
  terms: string[];
}

// MiniSearch instance — rebuilt when atoms change
let miniSearch = new MiniSearch<Atom>({
  fields: ['title', 'content'],     // fields to index
  storeFields: ['id', 'type', 'status', 'title', 'updated_at'], // fields to return
  searchOptions: {
    boost: { title: 2 },            // title matches weighted 2x
    fuzzy: 0.2,                     // 20% fuzzy tolerance for typos
    prefix: true,                   // prefix matching for type-ahead
  },
});

export function rebuildIndex(atoms: Atom[]): void {
  miniSearch.removeAll();
  miniSearch.addAll(atoms);
}

export function searchAtoms(
  query: string,
  options?: {
    filter?: (result: SearchResult) => boolean;
    boost?: Record<string, number>;
  }
): SearchResult[] {
  if (!query.trim()) return [];
  return miniSearch.search(query, options) as SearchResult[];
}

export function autoSuggest(query: string): string[] {
  return miniSearch.autoSuggest(query, { fuzzy: 0.2 }).map((s) => s.suggestion);
}
```

### Pattern 3: Local Vector Embeddings (Lazy-Loaded Worker)

**What:** Transformers.js runs in a dedicated Web Worker. The main search thread sends query text and receives embedding vectors. A second worker (or the existing Worker) handles atom embeddings, stored in IndexedDB or in-memory as `Float32Array`.

**When to use:** Only after MiniSearch returns results. Semantic re-ranking is applied as a post-processing step on the top-N text results.

**Key constraint:** `all-MiniLM-L6-v2` quantized (int8) is ~22 MB. The model downloads once and is cached by the browser (Cache API / OPFS). First search after cold start will be slow (~2-5s download, ~500ms inference). Subsequent searches are instant.

**Example:**
```typescript
// Source: Transformers.js v4 docs - https://huggingface.co/docs/transformers.js
// src/search/search-worker.ts (runs as a Web Worker)

import { pipeline, env } from '@huggingface/transformers';

// v4: configure for local-first operation
env.allowRemoteModels = true;  // first load fetches from HuggingFace
env.localModelPath = '/models/'; // cache path after first load

type EmbeddingPipeline = Awaited<ReturnType<typeof pipeline>>;
let extractor: EmbeddingPipeline | null = null;

async function getExtractor(): Promise<EmbeddingPipeline> {
  if (!extractor) {
    // Xenova/all-MiniLM-L6-v2: 384-dim, ~22MB quantized int8
    extractor = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2',
      { quantized: true }  // int8 quantization: ~22MB vs 90MB fp32
    );
  }
  return extractor;
}

self.onmessage = async (e: MessageEvent) => {
  const { type, texts, id } = e.data;

  if (type === 'EMBED') {
    try {
      const model = await getExtractor();
      const output = await model(texts, { pooling: 'mean', normalize: true });
      const vectors = output.tolist() as number[][];
      self.postMessage({ type: 'EMBED_RESULT', id, vectors });
    } catch (err) {
      self.postMessage({ type: 'EMBED_ERROR', id, error: String(err) });
    }
  }
};
```

**Cosine similarity (no library needed):**
```typescript
// Source: standard linear algebra — verified pattern
// Pure TypeScript, no dependencies required
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

### Pattern 4: Blended Relevance Score (NAV-01 ranking)

**What:** A function that combines four signals into one score per result.

**Example:**
```typescript
// src/search/ranking.ts
interface RankingInput {
  textScore: number;         // MiniSearch normalized score (0-1)
  semanticScore: number;     // cosine similarity (0-1), 0 if not yet computed
  graphProximity: number;    // 0-1: 1.0 if linked to recent active atom, 0 otherwise
  priorityScore: number;     // from state.scores[id].priorityScore (0-1)
}

export function blendedScore(input: RankingInput): number {
  // Weights can be tuned; text dominates since it's always available
  return (
    0.50 * input.textScore +
    0.25 * input.semanticScore +
    0.15 * input.graphProximity +
    0.10 * input.priorityScore
  );
}
```

### Pattern 5: Keyboard Navigation with Roving tabindex

**What:** List items in search results, command palette, and query pages use roving `tabindex` for arrow key navigation. The focused item has `tabindex="0"`, all others have `tabindex="-1"`.

**Example:**
```typescript
// Standard ARIA pattern for composite widgets (list navigation)
// Source: WAI-ARIA Authoring Practices 1.2 - Roving tabindex
// https://www.w3.org/WAI/ARIA/apg/patterns/grid/examples/layout-grids/

function SearchResultList(props: { results: Atom[] }) {
  const [focusIndex, setFocusIndex] = createSignal(0);
  let containerRef: HTMLDivElement;

  const handleKeyDown = (e: KeyboardEvent) => {
    const results = props.results;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusIndex(Math.min(focusIndex() + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusIndex(Math.max(focusIndex() - 1, 0));
    } else if (e.key === 'Enter') {
      // Open selected atom
    }
  };

  return (
    <div role="listbox" onKeyDown={handleKeyDown}>
      <For each={props.results}>
        {(atom, index) => (
          <div
            role="option"
            tabindex={focusIndex() === index() ? 0 : -1}
            aria-selected={focusIndex() === index()}
            ref={(el) => focusIndex() === index() && el?.focus()}
          >
            {atom.title}
          </div>
        )}
      </For>
    </div>
  );
}
```

### Pattern 6: Dexie v2 Migration for Tags

**What:** Add `tags` and `context` fields to atoms via a schema migration. Tags are indexed as a multi-entry array for efficient tag-based queries.

**Example:**
```typescript
// src/storage/db.ts — extend schema version
// Source: Dexie.js versioning docs - https://dexie.org/docs/Tutorial/Design#database-versioning
this.version(2).stores({
  atoms: '&id, type, status, sectionId, sectionItemId, updated_at, *links, *tags, context',
  //                                                                          ^     ^
  //                                               multi-entry tags index    |     |
  //                                               context index (GTD)       ------+
});

// v2 migration: add empty tags/context to all existing atoms
this.version(2).upgrade((tx) => {
  return tx.table('atoms').toCollection().modify((atom) => {
    if (!atom.tags) atom.tags = [];
    if (!atom.context) atom.context = null;
  });
});
```

**Atom schema extension (atoms.ts):**
```typescript
// Add to BaseAtomFields:
tags: z.array(z.string()).default([]),
context: z.string().nullable().optional(), // GTD context: @home, @office, etc.
```

### Pattern 7: Saved Filters in Config Table

**What:** Custom filter definitions are JSON-serialized into the existing `config` Dexie table. Each saved filter is loaded on init and rendered as a tab.

**Example:**
```typescript
// Filter definition schema
interface SavedFilter {
  id: string;
  name: string;
  filter: {
    types?: string[];
    statuses?: string[];
    tags?: string[];
    context?: string;
    dateRange?: { from: number; to: number } | null;
    sectionId?: string | null;
    sortBy?: 'date' | 'priority' | 'updated' | 'staleness';
    sortOrder?: 'asc' | 'desc';
  };
}

// Stored in config table under key 'saved-filters' as JSON array
// Pattern: { key: 'saved-filters', value: SavedFilter[] }
```

### Pattern 8: Backlinks Query (NAV-05)

**What:** Backlinks are computed in real-time from `state.atoms` — no separate index needed. Any atom whose `links` array contains the current atom's ID is a backlink.

**Example:**
```typescript
// Source: derived from existing store.ts atomsBySection pattern
// src/ui/signals/queries.ts

export function backlinksFor(targetAtomId: string): () => Atom[] {
  return createMemo(() =>
    state.atoms.filter((a) =>
      a.links.some((link) => link.targetId === targetAtomId)
    )
  );
}
```

### Pattern 9: Interaction Logging

**What:** Log user actions (search queries, filter clicks, result selections) as events in the existing Dexie `config` table or a dedicated `interactions` table, extended in the Dexie v2 migration.

**Key decisions:**
- Store as append-only array (ring buffer: keep last 1,000 events) to control storage growth
- Use `created_at` timestamp for temporal frequency analysis
- v1: frequency count per query term → boost in MiniSearch field boost
- Structure: `{ type: 'search' | 'filter' | 'click', query?: string, atomId?: string, filters?: object, ts: number }`

### Anti-Patterns to Avoid

- **Storing query results in state**: Query pages must NOT store filtered atom subsets in the SolidJS store — this creates stale data. Use `createMemo` only.
- **Running MiniSearch on every keystroke synchronously**: Debounce the search input (150-200ms) to avoid rebuilding search results on every character.
- **Loading the ONNX model on app init**: Lazy-load on first search. The model is ~22 MB and would delay initial app load by 2-5 seconds.
- **Blocking the main thread with embedding inference**: All Transformers.js inference MUST run in a Web Worker, never in a `createEffect` or `createMemo`.
- **Using `@solidjs/router` for page navigation**: The existing `activePage` string signal + `Switch/Match` pattern in `MainPane.tsx` already handles page routing. Do NOT add router — it would require restructuring the entire shell.
- **Destructuring atoms in filter memos**: `const { type, status } = atom` breaks SolidJS reactivity. Always use `atom.type`, `atom.status`.
- **Creating a new Worker for search**: Reuse the existing Worker for search index operations. Add a `SEARCH` command. OR keep MiniSearch on the main thread for simplicity (at BinderOS scale, either works).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Full-text search with fuzzy, prefix, ranking | Custom trie / inverted index | MiniSearch 7.x | Handles tokenization, stop words, fuzzy edit distance, tf-idf, field boosting — complex to get right |
| ONNX model inference in browser | Direct WebAssembly calls to ONNX Runtime | @huggingface/transformers | Handles model loading, tokenization, WASM/WebGPU backend selection, Float32Array output normalization |
| Focus trap in modals/overlays | Custom tab cycling logic | solid-focus-trap | Handles dynamic DOM, shadow DOM, restores focus on close, edge cases with portals |
| Keyboard shortcut declarations | Global `keydown` event listener for all shortcuts | @solid-primitives/keyboard `createShortcut` | Handles modifier key normalization across OS, cleanup on unmount, $mod abstraction (Cmd/Ctrl) |

**Key insight:** Full-text search and semantic search are both established solved problems with mature libraries. The value of Phase 3 is in the **query page logic** and **UX layer** — that's where to invest implementation effort, not in reinventing search algorithms.

---

## Common Pitfalls

### Pitfall 1: MiniSearch Index Becomes Stale
**What goes wrong:** `state.atoms` updates but MiniSearch index is not rebuilt, causing search to return deleted or outdated atoms.
**Why it happens:** MiniSearch is not reactive — it's an external object that must be manually updated.
**How to avoid:** Use a `createEffect` that watches `state.atoms` (via `state.atoms.length` as the dependency trigger) and calls `miniSearch.removeAll(); miniSearch.addAll(state.atoms)` on change. The rebuild is fast (< 5ms for 1,000 atoms).
**Warning signs:** Search returns results for atoms that no longer exist in the UI.

### Pitfall 2: SolidJS Reactivity in createMemo Filter Chains
**What goes wrong:** Using `state.atoms.filter(...)` correctly in `createMemo` but accessing `state.scores[atom.id]` outside the memo — the memo doesn't re-run when scores change.
**Why it happens:** `state.scores` is a separate reactive property; `createMemo` must access it inside the memo body to track its dependency.
**How to avoid:** Access both `state.atoms` AND `state.scores` inside the same `createMemo` body. The existing store pattern (using `state.scores[id].priorityTier`) already demonstrates this correctly.
**Warning signs:** Query page results don't update when scores change (e.g., after 10-minute periodic re-score).

### Pitfall 3: ONNX Model Download Blocks User
**What goes wrong:** User opens search, MiniSearch returns instant results, but then UI "freezes" while the ONNX model downloads and initializes (2-5 seconds on first use).
**Why it happens:** Even with a Worker, the Worker's postMessage callback doesn't fire until the model is ready.
**How to avoid:** (1) Show MiniSearch text results immediately. (2) Display "Enhancing with semantic search..." indicator. (3) When embeddings arrive, smoothly re-sort results without replacing them. Never block the search input.
**Warning signs:** Search overlay becomes unresponsive on first use.

### Pitfall 4: Dexie v2 Migration Not Idempotent
**What goes wrong:** Dexie `upgrade()` callback runs once on first open after version bump. If the migration crashes partway, the DB can be left in an inconsistent state.
**Why it happens:** IndexedDB transactions can abort on error; partial upgrades leave some atoms without `tags: []`.
**How to avoid:** The migration must be a `.modify()` call (single transaction). Always validate: `if (!atom.tags) atom.tags = []` — never assume the field exists.
**Warning signs:** TypeScript errors referencing `atom.tags` being possibly `undefined` in post-migration code.

### Pitfall 5: Filter State Causes Unnecessary Re-renders
**What goes wrong:** Filter dropdowns or sort toggles update a `createSignal`, which triggers the page's `createMemo` to re-run and re-render a large atom list on every filter click.
**Why it happens:** SolidJS `createMemo` re-runs when any dependency changes — including the filter state.
**How to avoid:** This is expected and correct SolidJS behavior. The memo re-runs but SolidJS's fine-grained DOM diffing means only changed items re-render. Use `For` (not `Index`) for the atom list to minimize DOM churn. The issue only arises if the filter signal is stored in the wrong scope — keep it `createSignal` within the page component, not in the global store.
**Warning signs:** Entire atom list re-renders (all DOM nodes replaced) on filter change, causing scroll position loss.

### Pitfall 6: Command Palette Opens on top of Search Overlay
**What goes wrong:** Both Cmd/Ctrl+K (search) and Cmd/Ctrl+P (command palette) can be triggered, and both open as overlays. If both are open, focus management breaks.
**Why it happens:** The global keydown handler in `app.tsx` doesn't check if another overlay is already open.
**How to avoid:** Use a single `overlayState: 'none' | 'search' | 'capture' | 'command-palette'` signal in app-level state. Any shortcut that opens an overlay first closes the current one. Escape always closes whatever is open.
**Warning signs:** Two overlays stack on top of each other, making both unusable.

### Pitfall 7: @mention Autocomplete in Textarea Cursor Position
**What goes wrong:** Implementing @mention autocomplete in a plain `<textarea>` for inline linking is surprisingly hard because you can't position a dropdown relative to the cursor position.
**Why it happens:** `<textarea>` doesn't expose cursor coordinates. You need to measure character position using a hidden `<div>` mirror technique.
**How to avoid:** Use a simpler approach for v1: detect `@` in `onInput`, extract the partial query after `@`, show a floating dropdown anchored to the textarea bottom. Full cursor-tracking is a v2 enhancement.
**Warning signs:** Dropdown appears in wrong position when cursor is mid-text.

---

## Code Examples

Verified patterns from official sources:

### MiniSearch Setup and Search
```typescript
// Source: https://github.com/lucaong/minisearch/blob/master/README.md (v7.2.0)
import MiniSearch from 'minisearch';

const miniSearch = new MiniSearch({
  fields: ['title', 'content'],     // Fields to index
  storeFields: ['id', 'type', 'status', 'title', 'updated_at', 'sectionId'],
  searchOptions: {
    boost: { title: 2 },            // Title matches are 2x more relevant
    fuzzy: 0.2,                     // Typo tolerance
    prefix: true,                   // Prefix matching (as-you-type)
  },
});

// Rebuild index (called on STATE_UPDATE)
miniSearch.removeAll();
miniSearch.addAll(atoms);

// Search with type filter
const results = miniSearch.search('my query', {
  filter: (result) => result.type === 'task',  // Post-filter by atom type
});

// Auto-suggest for type-ahead
const suggestions = miniSearch.autoSuggest('quer', { fuzzy: 0.2 });
// → [{ suggestion: 'query', score: 5, terms: ['query'] }]
```

### SolidJS createMemo for Query Page with Filter State
```typescript
// Source: SolidJS docs - https://docs.solidjs.com/reference/basic-reactivity/create-memo
import { createSignal, createMemo } from 'solid-js';
import { state } from '../signals/store';

// Filter state local to the page component
const [filterStatus, setFilterStatus] = createSignal<string[]>([]);
const [sortBy, setSortBy] = createSignal<'updated' | 'priority' | 'staleness'>('priority');

// Derived atom list — reactive to both state.atoms AND filter state
const filteredAtoms = createMemo(() => {
  const statuses = filterStatus();
  let atoms = state.atoms.filter((a) => {
    if (a.status === 'archived') return false;
    if (statuses.length > 0 && !statuses.includes(a.status)) return false;
    return true;
  });

  const sort = sortBy();
  return [...atoms].sort((a, b) => {
    switch (sort) {
      case 'priority':
        return (state.scores[b.id]?.priorityScore ?? 0) - (state.scores[a.id]?.priorityScore ?? 0);
      case 'staleness':
        return (state.scores[b.id]?.staleness ?? 0) - (state.scores[a.id]?.staleness ?? 0);
      case 'updated':
      default:
        return b.updated_at - a.updated_at;
    }
  });
});
```

### Keyboard Shortcut in app.tsx Extension
```typescript
// Source: existing app.tsx pattern — extend the handleKeyDown function

// Add to handleKeyDown in app.tsx:
// Ctrl+K / Cmd+K: Open search overlay
if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
  e.preventDefault();
  setOverlay('search');
  return;
}

// Ctrl+P / Cmd+P: Open command palette
if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
  e.preventDefault();
  setOverlay('command-palette');
  return;
}

// ?: Open shortcut reference
if (e.key === '?' && !e.ctrlKey && !e.metaKey && !isInputFocused()) {
  e.preventDefault();
  setOverlay('shortcuts');
  return;
}

// Escape: close current overlay
if (e.key === 'Escape') {
  if (overlay() !== 'none') {
    setOverlay('none');
    return;
  }
}
```

### Dexie v2 Migration
```typescript
// Source: Dexie.js documentation - https://dexie.org/docs/Tutorial/Design#database-versioning
// src/storage/migrations/v2.ts

export function applyV2Migration(db: BinderDB): void {
  db.version(2).stores({
    // Add *tags multi-entry index and context index to atoms
    // All other tables unchanged — must re-specify only changed tables
    atoms: '&id, type, status, sectionId, sectionItemId, updated_at, *links, *tags, context',
    // New table for saved filter definitions
    savedFilters: '&id, name',
  }).upgrade((tx) => {
    return tx.table('atoms').toCollection().modify((atom) => {
      if (!atom.tags) atom.tags = [];
      if (atom.context === undefined) atom.context = null;
    });
  });
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Server-side search (Elasticsearch) | In-browser full-text search (MiniSearch) | 2020-2023 | Local-first, instant, no infra |
| Heavy NLP models for semantic search | Quantized ONNX models ~22 MB in browser | 2023-2025 | No server needed for semantic search |
| React for keyboard navigation | SolidJS `createMemo` + fine-grained reactivity | Phase 1 of this project | No VDOM diffing overhead |
| Multiple keydown listeners | Single global handler + `@solid-primitives/keyboard` | 2024-2025 | Cleaner, handles cleanup |
| `@xenova/transformers` npm package | `@huggingface/transformers` v4 npm package | February 2026 | 53% smaller bundle, C++ WebGPU backend |

**Deprecated/outdated:**
- `@xenova/transformers`: Old package name. Use `@huggingface/transformers@^4` for new installations.
- `solid-command-palette`: No published npm releases, 165 GitHub stars, appears unmaintained. Build custom.
- WASM-pack for building WASM: Already deprecated per STATE.md — use three-step pipeline (cargo → wasm-bindgen-cli → wasm-opt).

---

## Open Questions

1. **Model size for vector embeddings**
   - What we know: `Xenova/all-MiniLM-L6-v2` quantized (int8) is approximately 22 MB; unquantized is ~90 MB. Transformers.js v4 supports `{ quantized: true }` option for int8.
   - What's unclear: Exact download size vs memory footprint with v4's new backend. Whether `q4` quantization (further reduction) produces acceptable embedding quality for short atom content.
   - Recommendation: Use `{ quantized: true }` (int8) as default. Test with `{ dtype: 'q4' }` if 22 MB is too large for target users. The v4 default for WASM is int8.

2. **MiniSearch rebuild frequency**
   - What we know: `createEffect` watching `state.atoms` will rebuild on every `STATE_UPDATE`. STATE_UPDATE fires after every mutation AND every 10-minute periodic re-score.
   - What's unclear: Is rebuild too slow at scale (1,000+ atoms)?
   - Recommendation: Benchmark; if slow, watch `state.atoms.length` + `state.atoms.map(a => a.updated_at).join(',')` as a fingerprint. Or use incremental updates: `miniSearch.remove(old); miniSearch.add(new)` per mutation. For v1, full rebuild is fine.

3. **Interaction logging storage strategy**
   - What we know: The CONTEXT.md requires logging search queries, filter clicks, and result clicks as interaction events.
   - What's unclear: Whether to extend the existing `config` table (JSON array) or add a dedicated `interactions` Dexie table in v2 migration.
   - Recommendation: Add dedicated `interactions` table in v2 migration (schema: `'&id, type, ts'`). Ring buffer: keep last 1,000 entries. Much cleaner than growing a JSON array in `config`.

4. **@mention autocomplete positioning**
   - What we know: Plain `<textarea>` doesn't expose cursor coordinates; positioning dropdowns relative to text cursor requires a hidden mirror div technique.
   - What's unclear: Whether BinderOS's atom content editor uses `<textarea>` or a richer editor.
   - Recommendation: For v1, anchor the @mention dropdown to the bottom of the textarea (not cursor-relative). Implement cursor-relative positioning as a v2 polish item.

---

## Sources

### Primary (HIGH confidence)
- Existing codebase (`src/`) — all current patterns, store shape, worker protocol, Dexie schema
- MiniSearch README v7.2.0 (https://github.com/lucaong/minisearch) — API, fuzzy/prefix/boost features
- Transformers.js v4 blog post (https://huggingface.co/blog/transformersjs-v4) — v4 bundle size, WebGPU, offline support
- SolidJS official docs (https://docs.solidjs.com/reference/basic-reactivity/create-memo) — createMemo, createSignal patterns
- Dexie.js official docs (https://dexie.org/docs/) — versioning, where(), multi-entry index, upgrade()

### Secondary (MEDIUM confidence)
- Transformers.js GitHub releases (https://github.com/huggingface/transformers.js/releases) — v4 release date confirmed 2026-02-09
- Xenova/all-MiniLM-L6-v2 Hugging Face model page — ONNX quantized model availability confirmed
- solid-focus-trap npm package (https://www.npmjs.com/package/solid-focus-trap) — SolidJS focus trap utility
- corvu SolidJS dialog (https://corvu.dev/docs/primitives/dialog/) — accessible dialog for overlays
- @solid-primitives/keyboard (https://primitives.solidjs.community/package/keyboard/) — createShortcut primitive
- WAI-ARIA Authoring Practices 1.2 — roving tabindex, composite widget patterns

### Tertiary (LOW confidence, verify before use)
- solid-command-palette (https://github.com/itaditya/solid-command-palette) — AVOID: no published npm releases, maintenance unclear. Build custom instead.
- Model size estimate of ~22 MB for all-MiniLM-L6-v2 int8 quantized — derived from multiple sources (90 MB fp32 / ~4x for int8). Verify by checking actual Xenova model repository files.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — MiniSearch and Transformers.js are well-established; all other packages are already installed
- Architecture: HIGH — query pages as pure memos is idiomatic SolidJS; Dexie migration pattern is proven
- Pitfalls: HIGH — derived from direct codebase inspection and known SolidJS reactivity traps
- Vector embeddings: MEDIUM — strategy is sound but exact model size and v4 WASM backend behavior needs verification at build time

**Research date:** 2026-02-22
**Valid until:** 2026-04-22 (60 days; Transformers.js is fast-moving, re-check v4 API before embedding implementation)
