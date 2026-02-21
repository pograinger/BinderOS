# Architecture Research

**Domain:** Local-first, browser-only personal information management (PIM) with Rust/WASM core
**Researched:** 2026-02-21
**Confidence:** MEDIUM (stack is established; specific SolidJS+WASM integration patterns are community-emerging)

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          PRESENTATION LAYER (Main Thread)                    │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  Section Nav │  │  Page Tabs   │  │  Atom List   │  │ Atom Detail  │   │
│  │  (SolidJS)   │  │  (SolidJS)   │  │  (SolidJS)   │  │  (SolidJS)   │   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘   │
│         └─────────────────┴──────────────────┴──────────────────┘           │
│                                    │                                         │
│                          ┌─────────▼─────────┐                              │
│                          │   Signal Store     │                              │
│                          │  (SolidJS signals) │                              │
│                          └─────────┬─────────┘                              │
│                                    │ postMessage / Comlink                   │
├────────────────────────────────────┼────────────────────────────────────────┤
│                          WORKER LAYER (Web Worker Thread)                    │
│                                    │                                         │
│                          ┌─────────▼─────────┐                              │
│                          │   WASM Bridge      │                              │
│                          │ (wasm-bindgen JS   │                              │
│                          │  glue code)        │                              │
│                          └─────────┬─────────┘                              │
│                                    │                                         │
│  ┌──────────────┐  ┌──────────────┬┴─────────────┐  ┌──────────────────┐  │
│  │ Entropy      │  │  Priority    │              │  │  IronCalc WASM   │  │
│  │ Engine       │  │  Scorer      │  Core Store  │  │  (embedded       │  │
│  │ (Rust→WASM)  │  │  (Rust→WASM) │  (Rust→WASM) │  │   spreadsheets)  │  │
│  └──────────────┘  └──────────────┘              └  └──────────────────┘  │
├────────────────────────────────────────────────────────────────────────────┤
│                          STORAGE LAYER (Browser APIs)                       │
│                                                                              │
│  ┌──────────────────────────┐         ┌───────────────────────────────┐    │
│  │       IndexedDB           │         │    OPFS (future: large blobs) │    │
│  │  (atoms, sections, pages  │         │    (file attachments,         │    │
│  │   mutation log, config)   │         │     embedded content cache)   │    │
│  └──────────────────────────┘         └───────────────────────────────┘    │
├────────────────────────────────────────────────────────────────────────────┤
│                          AI ADAPTER LAYER (Pluggable, Optional)             │
│                                                                              │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐                │
│  │  Cloud API     │  │  Local LLM     │  │   Disabled     │                │
│  │  Adapter       │  │  Adapter       │  │   (no-op)      │                │
│  │ (OpenAI, etc.) │  │ (WebLLM/       │  │                │                │
│  │                │  │  LM Studio)    │  │                │                │
│  └────────────────┘  └────────────────┘  └────────────────┘                │
└────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Implementation Notes |
|-----------|----------------|----------------------|
| SolidJS UI Components | Render atom lists, section nav, page tabs, forms, entropy indicators | Fine-grained reactive components; signals for local state |
| Signal Store | Bridge between UI and Worker; holds read-only projections of WASM state | `createSignal` / `createStore`; updated via Worker messages |
| WASM Bridge (Worker) | Dispatch commands to WASM core; relay state snapshots back to main thread | wasm-bindgen glue; lives in dedicated Web Worker |
| Entropy Engine (WASM) | Compute entropy health (open loops, stale items, link density, budget pressure) | Pure Rust logic, no I/O — receives atom graph, returns scores |
| Priority Scorer (WASM) | Compute `P = f(deadline, importance, recency, dependencies, energy)` per atom | Deterministic function; must be fast enough to run on every mutation |
| Core Store (WASM) | Atom CRUD, validation, type enforcement, link graph, mutation log | Authoritative business logic; persists via callbacks to IndexedDB |
| IronCalc WASM | Embedded spreadsheet engine for Atom content payloads | Separate WASM module loaded on demand; Rust-native |
| IndexedDB | Persistent structured storage for all atoms, config, mutation history | Primary storage; supports indexed range queries for page views |
| OPFS | Binary/large-blob storage for file attachments, embedded content cache | Secondary storage; only viable with synchronous access via Web Worker |
| AI Adapter (interface) | Pluggable LLM interface: summarization, compression suggestions, prioritization advice | Defined TypeScript interface; cloud, local-LLM, or no-op implementations |

## Recommended Project Structure

```
src/
├── ui/                       # SolidJS presentation layer
│   ├── components/           # Reusable UI primitives (AtomCard, EntropyBadge, etc.)
│   ├── views/                # Page-level components (Today, InboxView, ProjectView)
│   ├── layout/               # Shell: sidebar, tab bar, main pane
│   └── signals/              # Global SolidJS signal store (read-only projections)
│
├── worker/                   # Web Worker thread
│   ├── worker.ts             # Worker entry point; message dispatch loop
│   ├── bridge.ts             # wasm-bindgen JS glue wrappers (typed)
│   └── handlers/             # Command handlers (createAtom, updateAtom, etc.)
│
├── wasm/                     # Rust crates compiled to WASM
│   ├── core/                 # Atom schema, validation, mutation log, link graph
│   ├── entropy/              # Entropy scoring, staleness decay, health metrics
│   ├── priority/             # Priority scoring function
│   └── ironcalc/             # IronCalc integration shim (or loaded separately)
│
├── storage/                  # Storage adapters
│   ├── indexeddb/            # IndexedDB read/write with typed schema
│   ├── opfs/                 # OPFS blob storage (phase 2+)
│   └── migrations/           # Schema migration runner
│
├── ai/                       # AI adapter layer
│   ├── interface.ts          # AIProvider interface definition
│   ├── openai.ts             # OpenAI adapter
│   ├── webllm.ts             # WebLLM (in-browser) adapter
│   └── noop.ts               # Disabled adapter (no-op returns)
│
├── types/                    # Shared TypeScript types across all layers
│   ├── atoms.ts              # Atom union type (Task | Fact | Event | Decision | Insight)
│   ├── sections.ts           # Section and Page schema
│   └── messages.ts           # Worker message protocol types
│
└── app.tsx                   # SolidJS root; mounts worker, initializes storage
```

### Structure Rationale

- **ui/signals/:** Keeps UI reactive layer separate from worker communication; signals are the only mutable UI state
- **worker/:** All WASM calls happen off the main thread — this folder is the only code that touches WASM directly
- **wasm/:** Cargo workspace with separate crates per concern; built as distinct WASM modules or a single module with feature flags
- **storage/:** Storage is called only from the worker thread (never from UI) — prevents race conditions
- **ai/:** Interface-first design ensures AI is optional and swappable without touching other layers
- **types/:** Shared types imported by both UI and Worker; this is the contract boundary

## Architectural Patterns

### Pattern 1: Worker-Owned WASM, Signal-Projected UI

**What:** The WASM module lives entirely inside a Web Worker. The main thread (SolidJS UI) never touches WASM directly. All state flows from Worker → main thread as serialized snapshots, stored in SolidJS signals.

**When to use:** Always. This is the foundational pattern for this system. WASM initialization, compute, and storage I/O must not block the UI thread.

**Trade-offs:** Slight latency added by message passing (postMessage). For this app's scale (personal data, thousands of atoms not millions), this overhead is negligible. Gain: fully responsive UI regardless of compute.

**Example:**
```typescript
// worker/worker.ts
import init, { BinderCore } from '../wasm/core/pkg';

let core: BinderCore;

self.onmessage = async (event) => {
  const { type, payload } = event.data;

  if (type === 'INIT') {
    await init();
    core = BinderCore.new();
    const snapshot = core.snapshot(); // Returns serialized state
    self.postMessage({ type: 'STATE_SNAPSHOT', payload: snapshot });
    return;
  }

  if (type === 'CREATE_ATOM') {
    const result = core.create_atom(payload);
    // Persist to IndexedDB
    await db.atoms.put(result.atom);
    await db.mutations.add(result.mutation_log_entry);
    // Broadcast updated snapshot
    self.postMessage({ type: 'ATOM_CREATED', payload: core.snapshot() });
  }
};

// ui/signals/store.ts
const worker = new Worker(new URL('../worker/worker.ts', import.meta.url));
const [state, setState] = createStore<BinderState>(initialState);

worker.onmessage = (event) => {
  const { type, payload } = event.data;
  if (type === 'STATE_SNAPSHOT' || type === 'ATOM_CREATED') {
    setState(reconcile(payload)); // SolidJS reconcile for fine-grained diffs
  }
};
```

### Pattern 2: Command Pattern with Mutation Log

**What:** All writes to the atom store are expressed as typed commands. Every command is logged as an immutable entry before executing. The WASM core stores and enforces the command-log invariant.

**When to use:** Every time any atom is created, updated, archived, or deleted. The mutation log is how reversibility, audit trail, and future sync work.

**Trade-offs:** Slightly more verbose than direct property mutation. Massive benefit: full history, undo/redo, and forensic recovery of any state.

**Example:**
```typescript
// types/messages.ts — Worker message protocol
type Command =
  | { type: 'CREATE_ATOM'; payload: CreateAtomPayload }
  | { type: 'UPDATE_ATOM'; payload: UpdateAtomPayload }
  | { type: 'ARCHIVE_ATOM'; payload: { id: string } }
  | { type: 'LINK_ATOMS'; payload: { from: string; to: string } };

// wasm/core/src/lib.rs — Rust side enforces log invariant
pub fn create_atom(&mut self, payload: CreateAtomPayload) -> CommandResult {
    let atom = Atom::new(payload);
    let entry = MutationLogEntry::new(&atom);
    self.mutation_log.push(entry.clone());
    self.atoms.insert(atom.id.clone(), atom.clone());
    CommandResult { atom, mutation_log_entry: entry }
}
```

### Pattern 3: Pages as Queries, Never Storage

**What:** Pages (Today, This Week, Active Projects, Waiting, Insights) are defined as query specifications over the atom store. They have no independent data storage. Rendering a page = executing a query against the WASM core.

**When to use:** Every new view. Never store atoms in two places.

**Trade-offs:** Slightly more compute per view render. Massive benefit: no sync problem between pages and the atom store.

**Example:**
```typescript
// types/sections.ts
interface Page {
  id: string;
  name: string;
  query: AtomQuery; // Serializable query spec sent to WASM
}

interface AtomQuery {
  types?: AtomType[];
  status?: AtomStatus[];
  sectionId?: string;
  maxStalenessScore?: number;
  sortBy: 'priority' | 'created_at' | 'updated_at';
  limit?: number;
}

// Worker: execute query against WASM core
self.onmessage = async (event) => {
  if (event.data.type === 'QUERY_ATOMS') {
    const results = core.query(event.data.payload as AtomQuery);
    self.postMessage({ type: 'QUERY_RESULTS', payload: results });
  }
};
```

### Pattern 4: AI Adapter Interface

**What:** The AI layer is defined as a TypeScript interface. The system works without any AI (no-op adapter). Cloud and local-LLM adapters implement the same interface.

**When to use:** All AI interactions must go through this interface — never call an LLM API directly from a component.

**Trade-offs:** Extra indirection. Benefit: user can swap AI backend, disable AI entirely, or run local models without changing any other code.

**Example:**
```typescript
// ai/interface.ts
interface AIProvider {
  isAvailable(): Promise<boolean>;
  suggestCompression(atoms: Atom[]): Promise<CompressionSuggestion[]>;
  prioritize(atoms: Atom[], context: string): Promise<PrioritySuggestion[]>;
  summarize(atoms: Atom[]): Promise<string>;
}

// ai/noop.ts — always-safe fallback
export const NoopAIProvider: AIProvider = {
  isAvailable: async () => false,
  suggestCompression: async () => [],
  prioritize: async (atoms) => atoms.map(a => ({ id: a.id, score: a.priority })),
  summarize: async () => '',
};
```

## Data Flow

### Write Flow (User Creates an Atom)

```
User fills form (SolidJS component)
    ↓
dispatch({ type: 'CREATE_ATOM', payload })  [main thread]
    ↓
postMessage → Web Worker
    ↓
WASM Core validates schema, creates Atom, appends MutationLogEntry
    ↓
Worker writes Atom + MutationLogEntry to IndexedDB
    ↓
WASM Entropy Engine recalculates health scores
    ↓
Worker postMessage back → { type: 'ATOM_CREATED', payload: fullSnapshot }
    ↓
SolidJS setState(reconcile(snapshot))  [main thread]
    ↓
Only affected components re-render (fine-grained reactivity)
```

### Read Flow (User Navigates to a Page)

```
User clicks page tab
    ↓
SolidJS reads Page.query from signal store
    ↓
dispatch({ type: 'QUERY_ATOMS', payload: page.query })
    ↓
postMessage → Web Worker
    ↓
WASM Core executes query against in-memory atom graph
    ↓
Returns sorted, filtered atom list + priority scores
    ↓
Worker postMessage → { type: 'QUERY_RESULTS', payload }
    ↓
SolidJS updates atom list signal
    ↓
AtomList component re-renders with new results
```

### Startup / Hydration Flow

```
App loads (app.tsx)
    ↓
Worker spawned
    ↓
Worker: init() WASM module
    ↓
Worker: read all atoms from IndexedDB
    ↓
Worker: load atoms into WASM Core in-memory store
    ↓
Worker: compute initial entropy scores
    ↓
Worker: postMessage INITIAL_SNAPSHOT to main thread
    ↓
SolidJS signals populated → UI renders
```

### AI Suggestion Flow (Async, Non-Blocking)

```
Background effect (SolidJS createEffect) detects high entropy score
    ↓
AI adapter called (runs on main thread, non-blocking)
    ↓
Cloud API call OR local WebLLM inference
    ↓
Suggestions returned as read-only hints (never auto-mutate atoms)
    ↓
User sees compression/merge/archive suggestions in UI
    ↓
User approves → dispatches command → Write Flow
```

### State Management Model

```
IndexedDB (source of truth — persisted)
    ↓ (hydration at startup)
WASM Core In-Memory Store (operational truth)
    ↑ (all writes go here first, then persisted back to IndexedDB)
    ↓ (query results + snapshots via postMessage)
SolidJS Signal Store (UI projection — read-only)
    ↓ (reactive subscriptions)
SolidJS Components (render from signals only)
```

## Component Boundaries

| Boundary | Communication | Allowed Direction | Notes |
|----------|---------------|-------------------|-------|
| UI ↔ Worker | postMessage / Comlink | Bidirectional | Typed message protocol in `types/messages.ts` |
| Worker ↔ WASM Core | wasm-bindgen function calls | Worker calls WASM | WASM is synchronous from Worker's perspective |
| Worker ↔ IndexedDB | idb / native IndexedDB API | Worker reads/writes | Only Worker touches storage — never UI directly |
| Worker ↔ IronCalc | WASM function calls (separate module) | On-demand | Loaded only when atom has spreadsheet content type |
| UI ↔ AI Adapter | TypeScript async function call | Main thread only | AI suggestions are hints, never commands |
| AI Adapter ↔ WASM Core | Never directly | — | AI suggestions route through normal command dispatch |

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| OpenAI API | HTTP fetch from main thread via AI adapter | User provides API key; stored in localStorage/config only |
| WebLLM (in-browser) | WebWorker + WebGPU (separate worker) | Large download; loaded on demand |
| LM Studio (local) | HTTP fetch to localhost via AI adapter | Requires user to run LM Studio separately |
| IronCalc WASM | Loaded as separate WASM module in Worker | ironcalc npm package; loaded on demand when needed |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `ui/` ↔ `worker/` | Structured message protocol only | No shared mutable state across this boundary |
| `worker/` ↔ `wasm/` | wasm-bindgen generated bindings | Rust types serialized via serde/wasm-bindgen |
| `wasm/core` ↔ `wasm/entropy` | Rust function calls within the same WASM module (or inter-module) | Can be one Cargo workspace compiled to one WASM binary |
| `storage/` ↔ rest of system | Called only from `worker/handlers/` | Enforces single-writer invariant |

## Suggested Build Order (Phase Dependencies)

Building this system has a strict dependency chain. Violating this order causes rework:

```
1. Types & Message Protocol
   (atoms.ts, messages.ts — the contract everything else depends on)
       ↓
2. WASM Core (Rust)
   (atom schema, validation, mutation log — pure Rust, no browser APIs)
       ↓
3. IndexedDB Storage Layer
   (schema, migrations, typed read/write — can be tested independently)
       ↓
4. Web Worker Bridge
   (wires WASM Core to IndexedDB; message dispatch loop)
       ↓
5. SolidJS Signal Store
   (receives Worker messages; exposes reactive signals to UI)
       ↓
6. SolidJS UI Shell
   (layout: sidebar, tabs, main pane — render from signals)
       ↓
7. Entropy Engine (Rust/WASM)
   (depends on Core atom graph being stable before scoring is meaningful)
       ↓
8. Priority Scorer (Rust/WASM)
   (same dependency as Entropy Engine)
       ↓
9. Page Query System
   (depends on Core + Scorer; defines how views are computed)
       ↓
10. AI Adapter Layer
    (can be added any time after UI Shell; no-op adapter first)
       ↓
11. IronCalc Integration
    (last, because it's embedded content — atom system must exist first)
```

## Anti-Patterns

### Anti-Pattern 1: Calling WASM from the Main Thread

**What people do:** Import and call WASM functions directly in SolidJS components or effects for "convenience."

**Why it's wrong:** WASM instantiation is slow (can be 100ms+). Any synchronous WASM call on the main thread that exceeds ~16ms causes visible frame drops. Storage I/O from WASM in the main thread is entirely async and creates complex lifecycle issues.

**Do this instead:** All WASM calls happen in the dedicated Web Worker. UI sends commands, receives state projections. WASM is never imported in `ui/` code.

### Anti-Pattern 2: Storing Atoms in Page-Specific State

**What people do:** Create a separate `todayAtoms` signal, `projectAtoms` array, and `inboxAtoms` list — one per view — each populated independently.

**Why it's wrong:** Creates sync problems immediately. When an atom changes status, it must be updated in every view that holds a copy. This is a guaranteed source of stale UI bugs.

**Do this instead:** One atom store in the WASM Core. Pages are queries. Every view re-queries when the atom store changes. SolidJS's fine-grained reactivity makes this efficient.

### Anti-Pattern 3: Writing to IndexedDB from UI Components

**What people do:** Call IndexedDB directly from a SolidJS effect or event handler to "skip the Worker round trip."

**Why it's wrong:** Creates a dual-write scenario. The WASM in-memory store and IndexedDB can diverge. Validation bypassed. Mutation log not populated. Entropy scores stale.

**Do this instead:** All writes go through the Worker via command messages. Worker writes to both WASM Core (in-memory) and IndexedDB atomically. This is the only path.

### Anti-Pattern 4: Hard-Coding the AI Provider

**What people do:** Import `openai` directly in a component and call it with a hardcoded key, because it's the only AI they plan to support "right now."

**Why it's wrong:** Creates coupling that is expensive to extract later. Users who want no AI or local AI are second-class. API key management becomes ad-hoc.

**Do this instead:** Define the `AIProvider` interface from the start. The no-op adapter is the default. OpenAI adapter is one implementation. This costs 30 minutes upfront and saves days later.

### Anti-Pattern 5: OPFS as Primary Storage

**What people do:** Use OPFS from the beginning because it sounds more "file-system like" and seems more powerful.

**Why it's wrong:** IndexedDB is faster for typical structured data (atoms are JSON, 1KB–10KB each). OPFS only wins for datasets >10K documents or for large binary blobs. OPFS requires the synchronous `createSyncAccessHandle()` API which is only available in Web Workers, adding complexity. Replicating indexing in OPFS requires months of engineering.

**Do this instead:** IndexedDB for all atom data. OPFS for phase 2+ only, when/if file attachments or large embedded content blobs are needed.

## Scaling Considerations

This is a single-user, local-first, personal tool. Scale means "how many atoms can one person accumulate."

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0–1K atoms | IndexedDB native queries are instant. No optimization needed. WASM in-memory store holds all atoms comfortably. |
| 1K–10K atoms | Add IndexedDB indexes on `type`, `status`, `updated_at`, `section_id`. WASM store still fine in-memory. Consider lazy loading atoms not in active page query. |
| 10K–50K atoms | The system's hard caps (inbox cap, open task cap) should prevent this in practice. If reached: load only active atoms into WASM, archive rest to IndexedDB-only. Priority/entropy computed on-demand not eagerly. |
| 50K+ atoms | User has broken the system's information hygiene model. Archive/export tooling more important than query optimization. OPFS for bulk export becomes relevant. |

### Scaling Priorities

1. **First concern:** WASM module load time — mitigate by streaming compilation (`WebAssembly.instantiateStreaming`) and caching compiled module in IndexedDB or cache API.
2. **Second concern:** Initial hydration of atom graph from IndexedDB into WASM — mitigate by loading only non-archived atoms at startup, deferring archive hydration.
3. **Not a concern at personal scale:** Multi-user, concurrent writes, server latency. The out-of-scope decision to be local-first eliminates these categories.

## Sources

- [wasm-bindgen: WASM in Web Worker pattern](https://wasm-bindgen.netlify.app/examples/wasm-in-web-worker.html) — HIGH confidence, official docs
- [RxDB: LocalStorage vs IndexedDB vs OPFS comparison](https://rxdb.info/articles/localstorage-indexeddb-cookies-opfs-sqlite-wasm.html) — MEDIUM confidence, well-sourced benchmark article
- [LogRocket: Offline-first frontend apps 2025](https://blog.logrocket.com/offline-first-frontend-apps-2025-indexeddb-sqlite/) — MEDIUM confidence, verified with IndexedDB MDN docs
- [SolidJS: State Management docs](https://docs.solidjs.com/guides/state-management) — HIGH confidence, official docs
- [SolidJS: createResource docs](https://docs.solidjs.com/reference/basic-reactivity/create-resource) — HIGH confidence, official docs
- [wasm-mt: Multithreading library for Rust/WASM](https://github.com/w3reality/wasm-mt) — MEDIUM confidence, GitHub
- [Tweag: Threads and messages with Rust and WebAssembly](https://www.tweag.io/blog/2022-11-24-wasm-threads-and-messages/) — MEDIUM confidence (2022, patterns still valid)
- [IronCalc: Open-source Rust spreadsheet engine](https://github.com/ironcalc/IronCalc) — MEDIUM confidence, GitHub (WASM binding specifics not fully documented)
- [WebLLM: In-browser LLM inference](https://webllm.mlc.ai/) — MEDIUM confidence, official site
- [MDN: Origin Private File System](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system) — HIGH confidence, official docs

---
*Architecture research for: BinderOS — local-first browser PIM with Rust/WASM*
*Researched: 2026-02-21*
