# Phase 1: Foundation - Research

**Researched:** 2026-02-21
**Domain:** Vite + SolidJS PWA scaffold, Rust/WASM skeleton, Dexie.js + Zod atom schema, IndexedDB write queue, binder UI shell with mobile layout, storage persistence
**Confidence:** HIGH (stack verified; patterns verified against official docs and community sources)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Atom Graph Model
- Links are typed edges — each link has a relationship type (e.g., "belongs-to", "depends-on", "relates-to")
- Links are directional — A → B is a forward link; B sees A as a backlink
- Relationship types are extensible — start with a minimal built-in set, users can define custom relationship types
- Type-aware link rules — some edge types only make sense between certain atom types (e.g., "blocks" only between Tasks); system enforces valid combinations
- In-memory graph traversal via Rust petgraph in WASM; Dexie.js multi-entry indexes on links for persistence

#### Binder UI Shell
- Mobile-first PWA — responsive design that works on phones first, scales up to desktop
- Full PWA — installable with app icon, splash screen, runs standalone (no browser chrome), service worker for offline
- Dark theme by default — command-center feel inspired by Warp terminal
- Subtle binder hints — clean modern UI with subtle binder-inspired elements (tab shapes, divider lines), not literal skeuomorphic binder
- Distinct colors per atom type — each of the 5 atom types gets a signature color for instant visual identification
- Hybrid density — compact rows by default, expand on click/hover to show detail inline
- Mobile navigation — bottom tab bar for sections (like iOS apps)
- Page tabs — horizontal scrollable strip below header on mobile (Material-style tabs)
- Swipe gestures — swipe left to archive, swipe right to complete on atom rows
- Status bar — bottom status bar (IDE-style) with entropy health + atom count + inbox count + storage used + persistence status
- Entropy in status bar only — no badges anywhere; entropy health communicated through status bar color shifts (green → yellow → red)

#### Inbox & Classify Flow
- Text-based rich content for v1 — Markdown, JSON, code blocks supported; data model designed for future multi-modal content
- Voice capture in v1 — Web Speech API for speech-to-text; mic button inside the capture overlay
- Voice transcripts land as raw text — no smart parsing in v1
- Instant capture mechanism — prioritize speed above all; always accessible
- PWA Share Target — register as share target so text/links from any app land directly in inbox
- Card-by-card triage — show one inbox item at a time, fullscreen-ish; classify, link, then next (Tinder-like swipe on mobile)
- Type-ahead search for linking — during triage, start typing a project/area name, suggestions appear
- System suggests atom type — analyze content and pre-select a type; user confirms or changes with one tap
- Pattern learning — track classification patterns over time to improve suggestions
- No snooze — inbox forces decisions (classify or discard)
- Micro-animation rewards — subtle particle effect or checkmark animation on triage completion
- No badges anywhere — communicate through status bar and contextual UI

#### Storage Trust Signals
- Prominent first-run warning if browser denies persistent storage — full-screen explanation of data risk + how to fix
- Time-bounded undo — full mutation history for 30 days, then compress old changes into snapshots
- Change log as full snapshots — each mutation stores the complete atom state after mutation (simple, debuggable, CRDT-compatible)
- CRDT-compatible event stream — design the change log from day one as a CRDT-compatible event stream (timestamps, causal ordering)
- Manual export + periodic reminders — export button always available
- Empty + hint onboarding — first-run shows empty binder with contextual hints

### Claude's Discretion
- Sidebar item layout (collapsible tree vs flat list vs icon rail)
- Atom detail view pattern (side panel vs modal vs inline expand)
- Page tab ordering and default visibility
- Atom block visual treatment (discrete blocks vs continuous list)
- Exact spacing, typography, component library choices
- Editor type for atom content (plain textarea vs live preview vs WYSIWYG-light)
- Triage card actions (classify + link + done vs quick classify only)
- Export format structure (single JSON dump vs per-section, single MD vs zipped folder)
- Storage size display in status bar (always, when concerning, or settings only)

### Deferred Ideas (OUT OF SCOPE for Phase 1)
- Context-aware notifications
- Photo/video capture
- Voice message storage
- AI-assisted task grouping
- CRDT sync to private cloud server
- AI type suggestion with smart parsing
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DATA-01 | User can create atoms of exactly five types: Task, Fact, Event, Decision, Insight | Zod discriminated union schema; Rust enum in WASM core; five-type TypeScript union |
| DATA-02 | Every atom has an ID, type, created_at, updated_at, links array, and status | Zod schema with these fields; Dexie indexed on id, type, status, updated_at |
| DATA-03 | Atom type is mandatory — system never persists an untyped atom outside the inbox | Zod validation at write boundary; Rust enforces in WASM; inbox atoms have separate schema with optional type |
| DATA-04 | Atom content supports Markdown formatting | Plain string field in schema; no parse required at storage layer; rendering layer handles MD |
| DATA-05 | Atoms are stored in IndexedDB via Dexie.js with enforced schema (Zod validation on all mutations) | Dexie 4.0.x + Zod 4.x; all writes go through Worker → Zod validate → Dexie put |
| DATA-06 | Atom schema evolves only via explicit migrations, not ad-hoc fields | Dexie versioned schema (`db.version(N).stores({...}).upgrade(...)`) — never mutate existing version definitions |
| TRST-01 | System operates fully offline — zero network calls for core read/write operations | Service worker + vite-plugin-pwa caches all assets; IndexedDB is fully offline |
| TRST-02 | User can export all data as JSON and Markdown at any time | dexie-export-import v4.1.4 `db.export()` → Blob → programmatic download link |
| TRST-03 | All atom mutations are logged in an append-only change log | MutationLogEntry in Dexie (separate table); each entry stores full atom snapshot post-mutation |
| TRST-04 | User can undo recent changes (Ctrl+Z at minimum, browse change log optionally) | Change log lookup + re-apply previous snapshot; 30-day time bound |
| TRST-05 | System requests persistent storage at first launch | `navigator.storage.persist()` called on app init; result stored in config signal |
| TRST-06 | Storage persistence grant status is visible in the entropy health indicator | Status bar reads from persistence config signal; color shifts based on grant status |
| TRST-07 | All data is stored locally in IndexedDB/OPFS — never leaves the device unless user explicitly exports | No network calls in core storage layer; export is explicit user gesture |
| ORG-01 | System has four stable sections: Projects, Areas, Resources, Archive | Sections are static enum (not user-deletable); persisted in Dexie as Section records |
| ORG-02 | User can create, rename, and archive items within sections (e.g., specific projects) | Section items (e.g., Project, Area) are mutable Dexie records linked to parent section |
| ORG-09 | UI follows binder metaphor: left sidebar (sections), top tabs (pages), main pane (atom list + detail) | SolidJS layout components with CSS Grid; mobile-first responsive; bottom tab bar on mobile |
</phase_requirements>

---

## Summary

Phase 1 covers three distinct implementation tracks that must be built in strict dependency order: (1) project scaffold with PWA plumbing, (2) the typed atom schema and IndexedDB persistence layer, and (3) the binder UI shell with storage safety signals. The core risk is doing these out of order — specifically, building UI components before the ESLint SolidJS plugin is configured, or building the storage layer before the write-queue architecture is established.

The technology choices are confirmed and stable as of February 2026. Vite 7.3.x + SolidJS 1.9.x + vite-plugin-pwa 1.2.x is the verified PWA stack. The WASM build pipeline (cargo → wasm-bindgen-cli → wasm-opt, no wasm-pack) is mandatory — wasm-pack was archived July 2025. Dexie 4.0.x with the write-queue pattern handles IndexedDB performance. Zod 4.x validates all mutations at the boundary. The mobile-first layout requires `viewport-fit=cover`, `safe-area-inset` CSS, and careful bottom tab bar positioning.

The highest-risk items in Phase 1 are: (a) getting `navigator.storage.persist()` working correctly on Safari/iOS — it requires notification permission on Safari 17+, and (b) the CRDT-compatible change log schema design — getting the causal ordering fields right now costs nothing; retrofitting costs days. Both can be done correctly from the start with the patterns documented here.

**Primary recommendation:** Build in this order within Phase 1: scaffold + ESLint + WASM pipeline skeleton → atom schema + Dexie write queue → binder shell + storage safety UI. Every shortcut in the first two tracks creates expensive rework in the third.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SolidJS | 1.9.x | UI framework | Fine-grained signal reactivity; no VDOM overhead at WASM boundary; 7KB runtime |
| TypeScript | 5.9.x | Type layer | Current stable; Zod 4 requires TS 5.5+ |
| Vite | 7.3.x | Build tool | Current major; best DX for SolidJS + WASM; targets baseline-widely-available |
| vite-plugin-solid | 2.10.x | SolidJS JSX transform | Required for all SolidJS + Vite projects |
| vite-plugin-pwa | 1.2.x | PWA generation | Zero-config; SolidJS-aware; Vite 7 compatible (added in v1.0.1); generates manifest + service worker |
| Dexie.js | 4.0.x | IndexedDB wrapper | Standard IDB abstraction; versioned schema migrations; reactive live queries |
| Zod | 4.x | Schema validation | Runtime atom validation; single schema → TS types + validators; v4 released July 2025 |
| dexie-export-import | 4.1.4 | DB export/import | Official Dexie extension; streaming export to Blob; chunk-wise (doesn't read all to RAM) |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| solid-dexie | 0.0.5 | Reactive Dexie → SolidJS | All atom list queries; `createDexieArrayQuery` makes IDB reads reactive signals |
| eslint-plugin-solid | 0.14.5 | SolidJS ESLint rules | Must be installed before any component is written — catches destructuring + reactivity bugs |
| @solidjs/router | 0.14.x | Client-side routing | Section and page navigation; hash-based SPA mode (no server) |
| vite-plugin-wasm | 3.5.0 | ESM WASM loading | Required for loading Rust-compiled WASM in Vite 7 |
| vite-plugin-top-level-await | latest | Async WASM init | Required alongside vite-plugin-wasm for WASM module initialization |
| solid-gesture | latest | Touch/swipe gestures | Swipe left/right on atom rows (archive/complete actions) |
| wasm-bindgen | 0.2.109 (Cargo) | Rust↔JS bridge | wasm-bindgen-cli version MUST match this exactly |
| wasm-bindgen-cli | 0.2.109 | Post-compile WASM processing | Install via `cargo install wasm-bindgen-cli --version 0.2.109` |
| wasm-opt | latest | WASM binary size optimization | Run after wasm-bindgen-cli; 20–40% size reduction |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| vite-plugin-pwa | Manual service worker | Manual SW is 200+ lines of Workbox config; vite-plugin-pwa generates correctly every time |
| solid-gesture | Raw touchstart/touchend | Raw touch events work but require careful handling of scroll vs swipe disambiguation |
| dexie-export-import | Custom export loop | Custom loop misses exotic types (Date, Blob, ArrayBuffer); streaming at scale breaks |
| Zod 4.x | Zod 3.x | Zod 3 has worse TS inference and is slower; v4 is the correct choice as of July 2025 |

**Installation:**

```bash
# Core
pnpm add solid-js @solidjs/router dexie zod
pnpm add solid-dexie dexie-export-import

# Dev dependencies
pnpm add -D vite vite-plugin-solid vite-plugin-pwa vite-plugin-wasm vite-plugin-top-level-await
pnpm add -D typescript eslint eslint-plugin-solid @typescript-eslint/eslint-plugin @typescript-eslint/parser
pnpm add -D vitest @solidjs/testing-library jsdom

# Gesture library
pnpm add solid-gesture

# Rust toolchain
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.109
cargo install wasm-opt
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── ui/
│   ├── components/        # Reusable UI primitives (AtomCard, TypeBadge, etc.)
│   ├── views/             # Page-level views (InboxView, SectionView, TriageView)
│   ├── layout/            # Shell: bottom tab bar, page tab strip, main pane, status bar
│   └── signals/           # Global SolidJS signal store (read-only projections from Worker)
│
├── worker/
│   ├── worker.ts          # Worker entry point; message dispatch loop
│   ├── bridge.ts          # wasm-bindgen glue wrappers (typed TS wrappers over WASM)
│   └── handlers/          # Command handlers (createAtom, updateAtom, deleteAtom, etc.)
│
├── wasm/                  # Rust source compiled to WASM (Cargo workspace)
│   └── core/              # Atom schema, validation, link graph skeleton (Phase 1 scope)
│
├── storage/
│   ├── db.ts              # Dexie database instance + schema definition
│   ├── write-queue.ts     # Debounced write queue (200–500ms batching)
│   └── migrations/        # Migration upgrade functions per version increment
│
├── types/
│   ├── atoms.ts           # Atom union type, Zod schemas
│   ├── sections.ts        # Section + SectionItem types
│   ├── changelog.ts       # MutationLogEntry type (CRDT-compatible fields)
│   └── messages.ts        # Worker message protocol types (Command union, Response union)
│
└── app.tsx                # Root; mounts Worker, checks storage persistence, renders shell
```

### Pattern 1: Worker-Owned WASM + Signal Projection

**What:** WASM lives entirely inside the Web Worker. Main thread (SolidJS) only sends commands and receives state snapshots. All WASM computation, IndexedDB I/O, and mutation logging happens in the Worker thread.

**When to use:** Every time atoms are created, updated, or queried. This is the foundational pattern — there are no exceptions.

**Why it matters for Phase 1:** The Worker skeleton must be established in 01-01 (scaffold), before any atom operations are wired up in 01-02. Retrofitting a Worker into code that calls WASM directly from components is a near-complete rewrite.

```typescript
// Source: ARCHITECTURE.md + wasm-bindgen official docs
// worker/worker.ts — entry point

import init, { BinderCore } from '../wasm/core/pkg';
import { db } from '../storage/db';

let core: BinderCore | null = null;

self.onmessage = async (event: MessageEvent) => {
  const { type, payload } = event.data;

  if (type === 'INIT') {
    await init(); // WASM module async initialization
    core = BinderCore.new();
    // Hydrate: load atoms from IndexedDB → WASM in-memory store
    const atoms = await db.atoms.toArray();
    core.load_atoms(atoms);
    self.postMessage({ type: 'READY', payload: core.snapshot() });
    return;
  }

  if (type === 'CREATE_ATOM') {
    const result = core!.create_atom(payload); // Validates + creates in WASM
    await db.atoms.put(result.atom);            // Persist to IndexedDB
    await db.changelog.add(result.log_entry);  // Append-only mutation log
    self.postMessage({ type: 'ATOM_CREATED', payload: core!.snapshot() });
  }
};

// ui/signals/store.ts — main thread side
const worker = new Worker(new URL('../worker/worker.ts', import.meta.url), { type: 'module' });
const [state, setState] = createStore<BinderState>(initialState);

worker.onmessage = (event: MessageEvent) => {
  const { type, payload } = event.data;
  if (type === 'READY' || type === 'ATOM_CREATED') {
    setState(reconcile(payload)); // SolidJS reconcile: fine-grained diffs only
  }
};

export function dispatch(command: Command) {
  worker.postMessage(command);
}
```

### Pattern 2: Dexie Write Queue (200–500ms Debounce)

**What:** All IndexedDB writes are buffered in a queue and flushed in a single batched transaction after 200–500ms of inactivity. Never one transaction per write.

**When to use:** Every write path. The write queue is established once in `storage/write-queue.ts` and all writes go through it.

**Why 200–500ms:** This window batches rapid successive writes (typing, swipe gestures, triage actions) without making writes feel laggy. IndexedDB transaction overhead is ~2ms per transaction; avoiding 1,000 individual transactions saves ~2 seconds on bulk operations.

```typescript
// Source: IndexedDB performance analysis (PITFALLS.md) + Dexie.js transaction docs
// storage/write-queue.ts

type WriteOperation = () => Promise<void>;

class WriteQueue {
  private queue: WriteOperation[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private DEBOUNCE_MS = 300;

  enqueue(op: WriteOperation): void {
    this.queue.push(op);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.DEBOUNCE_MS);
  }

  async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    const ops = this.queue.splice(0);
    await db.transaction('rw', db.atoms, db.changelog, db.sections, async () => {
      for (const op of ops) await op();
    });
  }
}

export const writeQueue = new WriteQueue();
```

### Pattern 3: Zod Schema at the Write Boundary

**What:** Zod schemas are the single source of truth for atom types. TypeScript types are inferred from Zod schemas. Validation runs on every write before touching Dexie.

**When to use:** Any time data enters the system (UI form submit, triage action, import, WASM output before persistence).

```typescript
// Source: Zod v4 docs — zod.dev/v4
// types/atoms.ts

import { z } from 'zod';

const AtomStatus = z.enum(['open', 'in-progress', 'waiting', 'done', 'cancelled', 'archived']);
const AtomType = z.enum(['task', 'fact', 'event', 'decision', 'insight']);

const AtomLink = z.object({
  targetId: z.string().uuid(),
  relationshipType: z.string(),   // e.g., "belongs-to", "depends-on", "relates-to"
  direction: z.enum(['forward', 'backward']),
});

const BaseAtom = z.object({
  id: z.string().uuid(),
  type: AtomType,
  content: z.string(),            // Markdown string
  status: AtomStatus,
  links: z.array(AtomLink),
  sectionId: z.string().uuid().optional(),
  sectionItemId: z.string().uuid().optional(),
  created_at: z.number(),         // Unix ms timestamp (CRDT-compatible)
  updated_at: z.number(),
});

// Discriminated union if type-specific fields are needed
const TaskAtom = BaseAtom.extend({ type: z.literal('task'), dueDate: z.number().optional() });
const FactAtom = BaseAtom.extend({ type: z.literal('fact') });
const EventAtom = BaseAtom.extend({ type: z.literal('event'), eventDate: z.number().optional() });
const DecisionAtom = BaseAtom.extend({ type: z.literal('decision') });
const InsightAtom = BaseAtom.extend({ type: z.literal('insight') });

export const AtomSchema = z.discriminatedUnion('type', [
  TaskAtom, FactAtom, EventAtom, DecisionAtom, InsightAtom,
]);
export type Atom = z.infer<typeof AtomSchema>;

// Inbox item — type is optional before classification
export const InboxItemSchema = BaseAtom.extend({
  type: AtomType.optional(),
  isInbox: z.literal(true),
});
export type InboxItem = z.infer<typeof InboxItemSchema>;
```

### Pattern 4: CRDT-Compatible Change Log

**What:** Each mutation appends a `MutationLogEntry` with enough fields to support future CRDT-based sync. The log is append-only — entries are never updated or deleted.

**Critical design decisions:**
- Use Unix milliseconds (not ISO strings) for `timestamp` — CRDT clocks compare numerically
- `lamportClock` is a monotonic counter per device — increment on every mutation
- `deviceId` is generated once at app init (UUID stored in localStorage) — identifies the source
- `before` and `after` snapshots enable both undo and conflict resolution

```typescript
// Source: CRDT design patterns (operation-based CRDTs) + CONTEXT.md decision
// types/changelog.ts

export interface MutationLogEntry {
  id: string;                     // UUID for this log entry
  atomId: string;                 // Which atom was mutated
  operation: 'create' | 'update' | 'delete' | 'archive' | 'link' | 'unlink';
  before: Atom | null;            // Full atom state before mutation (null for create)
  after: Atom | null;             // Full atom state after mutation (null for delete)
  timestamp: number;              // Unix ms — causal ordering
  lamportClock: number;           // Monotonic device counter
  deviceId: string;               // Source device identifier (future: sync peer identity)
}
```

### Pattern 5: navigator.storage.persist() Flow

**What:** Request persistent storage on first launch, show a persistent UI indicator of the grant status, and block the user with a clear warning if denied.

**Safari 17+ critical detail:** Safari requires notification permission to grant persistent storage. The flow must detect Safari and provide context-appropriate instructions.

```typescript
// Source: WebKit Blog storage policy docs + MDN storage API
// app.tsx or storage/persistence.ts

export async function initStoragePersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false; // Unsupported browser

  const alreadyPersisted = await navigator.storage.persisted();
  if (alreadyPersisted) return true;

  const granted = await navigator.storage.persist();
  // On Safari 17+: this returns false unless notification permission was granted first
  // Detection: navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome')

  if (!granted) {
    // Trigger prominent full-screen warning (CONTEXT.md decision)
    // Message: "Your data may be deleted by the browser after 7 days of inactivity.
    // To protect your data: add this app to your Home Screen (iOS/Safari) or
    // allow notifications to enable persistent storage."
    showStoragePersistenceWarning();
  }

  return granted;
}
```

### Pattern 6: PWA Manifest + Share Target

**What:** vite-plugin-pwa generates the manifest and service worker. Share Target is declared in the manifest so the OS registers the PWA as a share receiver.

```typescript
// Source: vite-pwa-org.netlify.app/frameworks/solidjs + MDN share_target docs
// vite.config.ts

import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { VitePWA } from 'vite-plugin-pwa';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  plugins: [
    solid(),
    wasm(),
    topLevelAwait(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'BinderOS',
        short_name: 'BinderOS',
        theme_color: '#0d1117',          // Warp terminal dark
        background_color: '#0d1117',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        share_target: {
          action: '/share-target',
          method: 'GET',
          params: { title: 'title', text: 'text', url: 'url' },
        },
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,wasm,png,svg,ico}'],
        runtimeCaching: [
          { urlPattern: /^https:\/\/fonts\.googleapis\.com/, handler: 'CacheFirst' },
        ],
      },
    }),
  ],
});
```

### Pattern 7: Mobile-First Layout with Safe Area Insets

**What:** Bottom tab bar and status bar must respect iOS safe area (home indicator zone). CSS `env(safe-area-inset-bottom)` handles this. Requires `viewport-fit=cover` in the viewport meta tag.

```html
<!-- index.html -->
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
```

```css
/* layout/layout.css */

.bottom-tab-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: calc(56px + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  background: #0d1117;
  border-top: 1px solid #30363d;
  display: flex;
  align-items: flex-start;  /* tabs align to top, inset padding pushes bar down */
  z-index: 100;
}

.main-content {
  /* Reserve space for bottom tab bar + status bar */
  padding-bottom: calc(56px + 32px + env(safe-area-inset-bottom));
}

.status-bar {
  position: fixed;
  bottom: calc(56px + env(safe-area-inset-bottom));
  left: 0;
  right: 0;
  height: 32px;
  background: #0d1117;
  border-top: 1px solid #30363d;
  font-size: 12px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  gap: 16px;
  color: #8b949e;
  z-index: 99;
}
```

### Pattern 8: ESLint SolidJS Configuration (ESLint v9 flat config)

**What:** eslint-plugin-solid v0.14.5 enforces SolidJS reactivity rules. Must be configured before any component is written. Uses ESLint v9 flat config format.

```typescript
// Source: github.com/solidjs-community/eslint-plugin-solid
// eslint.config.ts

import solid from 'eslint-plugin-solid/configs/typescript';
import tsParser from '@typescript-eslint/parser';

export default [
  {
    files: ['**/*.{ts,tsx}'],
    ...solid,
    languageOptions: {
      parser: tsParser,
      parserOptions: { project: './tsconfig.json' },
    },
  },
];
```

Key rules enforced:
- `solid/reactivity` — prevents destructuring props/signals (the #1 SolidJS mistake)
- `solid/no-destructure` — explicit destructuring prohibition in component args
- `solid/prefer-for` — enforces `<For>` over `.map()` in JSX
- `solid/no-innerhtml` — security: prevents innerHTML usage

### Pattern 9: Dexie Schema Definition

**What:** All tables, indexes, and schema version defined once in `storage/db.ts`. Never mutate an existing version definition — always increment.

```typescript
// Source: Dexie.js official docs — dexie.org/docs/Dexie/Dexie.version()
// storage/db.ts

import Dexie, { type Table } from 'dexie';
import type { Atom, InboxItem } from '../types/atoms';
import type { MutationLogEntry } from '../types/changelog';
import type { Section, SectionItem } from '../types/sections';

class BinderDB extends Dexie {
  atoms!: Table<Atom, string>;
  inbox!: Table<InboxItem, string>;
  changelog!: Table<MutationLogEntry, string>;
  sections!: Table<Section, string>;
  sectionItems!: Table<SectionItem, string>;
  config!: Table<{ key: string; value: unknown }, string>;

  constructor() {
    super('BinderOS');
    this.version(1).stores({
      atoms:        '&id, type, status, sectionId, sectionItemId, updated_at, *links',
      inbox:        '&id, created_at',
      changelog:    '&id, atomId, timestamp, lamportClock',
      sections:     '&id, name',
      sectionItems: '&id, sectionId, name, archived',
      config:       '&key',
    });
  }
}

export const db = new BinderDB();
```

Notes:
- `&id` — unique primary key
- `*links` — multi-entry index on the links array (enables querying atoms by linked target)
- `updated_at` index enables staleness queries (Phase 2)
- `changelog` indexed by `lamportClock` enables CRDT replay ordering (future sync)

### Pattern 10: Export Flow (TRST-02)

**What:** dexie-export-import's `db.export()` returns a Blob. The download is triggered via a programmatic anchor element click — no library needed for the download itself.

```typescript
// Source: dexie-export-import v4.1.4 README
// storage/export.ts

import { exportDB } from 'dexie-export-import';
import { db } from './db';

export async function exportAllData(): Promise<void> {
  const blob = await exportDB(db, {
    progressCallback: ({ totalRows, completedRows }) => {
      // Update export progress UI
      setExportProgress(completedRows / totalRows);
    },
  });

  // Trigger browser download without a library
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `binderos-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importData(file: File): Promise<void> {
  await db.import(file);
}
```

### Anti-Patterns to Avoid

- **Calling WASM directly from SolidJS components:** WASM import in `ui/` code is prohibited. Worker is the only WASM consumer.
- **Writing to IndexedDB from UI components:** All writes go through Worker → WriteQueue → Dexie. Direct IDB calls from UI bypass Zod validation, mutation log, and WASM state sync.
- **Destructuring SolidJS props or store paths:** `const { name } = props` breaks reactivity silently. Use `props.name` always. ESLint plugin must catch this at dev time.
- **One IndexedDB transaction per write:** Never write atoms one at a time in loops. Always use the write queue or explicit batch transactions.
- **Storing priority scores in IndexedDB:** Phase 1 scope does not include scores, but when Phase 2 adds them, never persist computed scores — always recompute from source data. Don't anticipate this by adding computed fields now.
- **Using wasm-pack:** It was archived July 2025. Use the three-step pipeline: cargo → wasm-bindgen-cli → wasm-opt.
- **Skipping `navigator.storage.persist()`:** Even one user losing data on Safari destroys trust. Must ship in Plan 01-03 at the latest.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PWA service worker + manifest | Custom Workbox config | vite-plugin-pwa 1.2.x | Manual SW is 200+ lines; cache strategy bugs are silent until offline; vite-plugin-pwa tested against all edge cases |
| IndexedDB export/import | Custom table serialization loop | dexie-export-import 4.1.4 | Handles exotic types (Date, Blob, ArrayBuffer); streaming avoids OOM on large DBs; import merges cleanly |
| Swipe gesture detection | Raw touchstart/touchend | solid-gesture | Raw touch requires scroll vs swipe disambiguation, velocity thresholds, and pointer cancel handling — all solved by solid-gesture |
| WASM binary optimization | Custom size reduction | wasm-opt (binaryen) | 20–40% size reduction; single command; embedded in build pipeline |
| Atom schema runtime validation | Custom type guards | Zod 4.x | Type guards break on schema evolution; Zod generates both TS types and runtime validators from one definition |
| IndexedDB migration runner | Ad-hoc upgrade scripts | Dexie.version().upgrade() | Dexie handles sequential version application, rollback semantics, and real-data upgrade callbacks correctly |

**Key insight:** The storage safety features (persistence, export, migration) exist exactly because developers hand-roll them and get them wrong. Each listed library solves a class of edge cases that take months to discover in production.

---

## Common Pitfalls

### Pitfall 1: Safari Storage Denial with No Recovery Path

**What goes wrong:** Safari 17+ requires notification permission before `navigator.storage.persist()` returns true. If the app doesn't explain this, users on iOS will see the persistence warning on every launch, eventually ignoring it — and then lose their data.

**Why it happens:** The storage persistence API behavior differs between browsers. Chrome grants on request if the site meets PWA criteria. Safari ties it to notification permission as a security measure.

**How to avoid:** Detect browser type. For Safari, show a two-step flow: (1) explain that persistence requires notification permission, (2) request notification permission, (3) then call `navigator.storage.persist()`. For iOS specifically, document that Home Screen installation gives elevated storage quotas (80% of disk vs 50%).

**Warning signs:** `navigator.storage.persisted()` returns false after a user appears to have granted persistence. Test explicitly in Safari desktop and iOS simulator before shipping Plan 01-03.

---

### Pitfall 2: SolidJS Destructuring in Worker Message Handlers

**What goes wrong:** When the Worker postMessages a state snapshot, the receiving code may destructure the payload: `const { atoms, sections } = event.data.payload`. This creates static values, not reactive signals — UI won't update when subsequent messages arrive.

**Why it happens:** The pattern is natural when coming from React or plain JS. There's no runtime warning.

**How to avoid:** Always feed Worker message payloads into `setState(reconcile(payload))`. Never destructure the payload. The ESLint plugin will catch destructuring in JSX components but not in event listener callbacks — discipline must be applied manually at the Worker bridge layer.

**Warning signs:** UI shows correct data on first load (from INIT message) but doesn't update when atoms are created or modified.

---

### Pitfall 3: vite-plugin-wasm Requires Explicit WASM MIME Type in Dev Server

**What goes wrong:** WASM streaming compilation (`WebAssembly.instantiateStreaming`) requires the server to respond with `Content-Type: application/wasm`. In Vite's dev server, this is configured automatically by vite-plugin-wasm, but only if the plugin is loaded. If vite-plugin-top-level-await is configured before vite-plugin-wasm, load order can cause issues.

**How to avoid:** Load plugins in this order: `[solid(), wasm(), topLevelAwait(), VitePWA(...)]`. Verify in dev mode by checking the Network tab — the `.wasm` file should show `application/wasm` content type.

**Warning signs:** WASM init fails with a TypeError in development but works in production (or vice versa).

---

### Pitfall 4: Web Speech API Unavailable in Firefox and iOS Safari without Home Screen

**What goes wrong:** SpeechRecognition is not supported in Firefox at all. On iOS Safari, it requires user gesture (mic button tap) and does not work in standalone PWA mode without the app being added to the Home Screen. Voice capture silently fails.

**Why it happens:** The Web Speech API is a Chrome-led API that other browsers have implemented partially or not at all.

**How to avoid:** Feature-detect before rendering the mic button: `const hasVoice = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window`. If not available, hide the mic button gracefully — never show a broken state. Show a tooltip "Voice capture not available in this browser" on supported but failing browsers.

Note: Web Speech API is NOT offline-capable — it routes audio to Google's servers on Chrome and Apple's servers on Safari. This is acceptable per CONTEXT.md but must be documented in the UI (small disclaimer near the mic button).

**Warning signs:** Mic button visible in Firefox with no detection; capture overlay shows an error with no explanation.

---

### Pitfall 5: Change Log Schema Designed Without CRDT Fields

**What goes wrong:** If the change log is designed as a simple audit log (just `atomId`, `operation`, `timestamp`, `after`), retrofitting CRDT-compatible causal ordering later requires a migration of potentially thousands of entries — and old entries can't be backfilled with `lamportClock` or `deviceId` because that data was never captured.

**Why it happens:** "We'll add sync later" thinking. The CRDT fields feel unnecessary until they're needed, and by then it's too late.

**How to avoid:** Include `lamportClock`, `deviceId`, and `before` snapshot from day one (see Pattern 4 above). The fields cost nothing at Phase 1 and save a painful migration when Phase SYNC ships.

**Warning signs:** Change log schema has `timestamp` but no `lamportClock` or `deviceId`. Before snapshot is absent, making undo reconstruct from replaying all prior mutations.

---

### Pitfall 6: Dexie `*links` Multi-Entry Index Missing

**What goes wrong:** Without a multi-entry index on the `links` array, finding "all atoms that link to atom X" requires loading every atom and filtering in JS. At 500+ atoms, this is noticeably slow.

**Why it happens:** Developers index the obvious fields (id, type, status) but forget that link queries require multi-entry indexes.

**How to avoid:** The schema in Pattern 9 includes `*links` — this is a multi-entry index on the links array (each element is indexed independently). Dexie supports this with the `*` prefix. Verify the index is correctly defined on first schema creation — adding it later requires a migration.

---

## Code Examples

Verified patterns from official sources:

### WASM Three-Step Build Pipeline

```bash
# Source: Inside Rust Blog (rustwasm sunset), wasm-bindgen-cli docs
# package.json scripts

"build:wasm": "cargo build --target wasm32-unknown-unknown --release && wasm-bindgen --target web ./target/wasm32-unknown-unknown/release/binderos_core.wasm --out-dir ./src/wasm/core/pkg && wasm-opt -Oz ./src/wasm/core/pkg/binderos_core_bg.wasm -o ./src/wasm/core/pkg/binderos_core_bg.wasm"
```

### Minimal Rust Cargo.toml for Phase 1 WASM Skeleton

```toml
# wasm/core/Cargo.toml
[package]
name = "binderos-core"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.2.109"
serde = { version = "1", features = ["derive"] }
serde-wasm-bindgen = "0.6"
js-sys = "0.3"

[profile.release]
opt-level = "s"       # Optimize for size
panic = "abort"       # Deterministic panics (no poisoned module state)
lto = true            # Link-time optimization for smaller output
```

### SolidJS TSConfig for PWA + WASM

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "jsxImportSource": "solid-js",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "types": ["vite-plugin-pwa/solid", "vite/client"],
    "paths": {
      "~/*": ["./src/*"]
    }
  },
  "include": ["src", "vite.config.ts"]
}
```

### Dexie + solid-dexie Reactive Atom List Query

```typescript
// Source: solid-dexie GitHub — faassen/solid-dexie
// ui/views/SectionView.tsx

import { createDexieArrayQuery } from 'solid-dexie';
import { db } from '../../storage/db';

export function SectionView(props: { sectionId: string }) {
  // Reactive: auto-updates when db.atoms changes
  const atoms = createDexieArrayQuery(() =>
    db.atoms
      .where('sectionId').equals(props.sectionId)  // Uses index
      .and(a => a.status !== 'archived')
      .sortBy('updated_at')
  );

  return (
    <For each={atoms()}>
      {(atom) => <AtomCard atom={atom} />}
    </For>
  );
}
```

### Swipe Gesture on Atom Row (solid-gesture)

```typescript
// Source: solid-gesture GitHub — wobsoriano/solid-gesture
// ui/components/AtomCard.tsx

import { createDrag } from 'solid-gesture';

export function AtomCard(props: { atom: Atom }) {
  const [dragStyle, dragHandlers] = createDrag({
    onEnd: ({ movement: [mx], velocity: [vx] }) => {
      if (mx < -80 || vx < -0.5) dispatch({ type: 'ARCHIVE_ATOM', payload: { id: props.atom.id } });
      if (mx > 80 || vx > 0.5) dispatch({ type: 'COMPLETE_ATOM', payload: { id: props.atom.id } });
    },
  });

  return (
    <div
      style={{ transform: `translateX(${dragStyle().x}px)` }}
      {...dragHandlers}
      class="atom-card"
    >
      {/* ... */}
    </div>
  );
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| wasm-pack | cargo → wasm-bindgen-cli → wasm-opt (three-step) | July 2025 (wasm-pack archived) | All new WASM projects must use three-step pipeline; wasm-pack is abandoned |
| Zod 3.x | Zod 4.x | July 2025 | Better TS inference, 2x faster validation, breaking change on some APIs — use v4 |
| vite-plugin-pwa < 1.0 | vite-plugin-pwa 1.2.x | 2025 | v1.0.1 added Vite 7 support; v1.x is the stable line |
| eslint-plugin-solid < 0.14 | 0.14.5 with ESLint v9 flat config | Dec 2024 | Flat config support; approaching v1.0 |
| SolidStart for all SolidJS apps | Plain SolidJS + Vite (browser-only) | Ongoing | SolidStart adds SSR complexity; browser-only PWAs don't need it |

**Deprecated/outdated:**
- wasm-pack: Do not use. Archived July 2025 by rustwasm org.
- SolidJS 2.0 beta: Unstable as of Feb 2026. Use 1.9.x.
- Zod 3.x: Supported via `zod/v3` backward-compat export but no new projects should start on v3.

---

## Open Questions

1. **solid-gesture API stability**
   - What we know: Package exists on GitHub (`wobsoriano/solid-gesture`), is listed as a community SolidJS utility
   - What's unclear: Version, last maintenance date, and whether it handles scroll-vs-swipe disambiguation correctly on iOS
   - Recommendation: At implementation time, verify the package is actively maintained. If abandoned, implement raw touch handler with scroll disambiguation (touchstart → detect direction → if horizontal, call preventDefault on touchmove to prevent scroll conflict)

2. **vite-plugin-pwa Share Target with SolidJS routing**
   - What we know: Share Target is declared in the manifest; the PWA receives shared data via GET params on the `/share-target` route
   - What's unclear: How @solidjs/router handles the `/share-target` route when the PWA is launched from the OS share sheet (the app may not be in memory)
   - Recommendation: Test the Share Target flow on Android Chrome specifically before marking Plan 01-03 complete. The service worker fetch handler must intercept the share-target URL and route to the inbox.

3. **Safari 17+ storage persistence via notification permission**
   - What we know: Safari 17 ties storage persistence to notification permission grant (WebKit blog)
   - What's unclear: Whether this is still the behavior in Safari 18/19 (iOS 18/19) — Apple may have changed this
   - Recommendation: Test on current iOS Safari at implementation time. The warning UI must be tested on a physical iOS device, not just simulator.

4. **Web Speech API in standalone PWA mode on iOS**
   - What we know: SpeechRecognition is available on iOS Safari but has documented issues in standalone/fullscreen mode; may require special handling
   - What's unclear: Whether the behavior has improved in iOS 17/18 for Home Screen installed PWAs
   - Recommendation: Test mic capture in installed PWA mode on iOS before marking voice capture complete. Have a text-only fallback ready in the capture overlay.

---

## Sources

### Primary (HIGH confidence)
- [vite-pwa-org.netlify.app/frameworks/solidjs](https://vite-pwa-org.netlify.app/frameworks/solidjs) — vite-plugin-pwa 1.2.x SolidJS setup, virtual module pattern, TypeScript config
- [github.com/solidjs-community/eslint-plugin-solid](https://github.com/solidjs-community/eslint-plugin-solid) — v0.14.5 current, ESLint v9 flat config support, key rules documented
- [dexie.org/docs/Dexie/Dexie.version()](https://dexie.org/docs/Dexie/Dexie.version()) — versioned schema pattern; upgrade() API
- [dexie.org/docs/ExportImport/dexie-export-import](https://dexie.org/docs/ExportImport/dexie-export-import) — exportDB / importDB API; v4.1.4 current
- [webkit.org/blog/14403/updates-to-storage-policy/](https://webkit.org/blog/14403/updates-to-storage-policy/) — Safari ITP + persistent storage; notification permission requirement
- [github.com/vite-pwa/vite-plugin-pwa](https://github.com/vite-pwa/vite-plugin-pwa) — v1.0.1 added Vite 7 support; v1.2.x current (Jan 2026 release)
- [rustwasm.github.io/docs/wasm-bindgen/examples/wasm-in-web-worker.html](https://rustwasm.github.io/docs/wasm-bindgen/examples/wasm-in-web-worker.html) — WASM in Web Worker official pattern
- [MDN env() CSS safe-area-inset](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/env) — viewport-fit=cover + safe-area-inset-bottom CSS
- [MDN share_target manifest](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/share_target) — Share Target manifest member specification
- [zod.dev/v4](https://zod.dev/v4) — Zod 4.x release notes; migration from v3
- STACK.md / ARCHITECTURE.md / PITFALLS.md — Project ecosystem research (2026-02-21)

### Secondary (MEDIUM confidence)
- [caniuse.com/speech-recognition](https://caniuse.com/speech-recognition) — SpeechRecognition browser support table (Firefox: no support; Safari: partial; iOS: limited)
- [github.com/wobsoriano/solid-gesture](https://github.com/wobsoriano/solid-gesture) — SolidJS gesture library for swipe detection
- [github.com/mardisen/solid-swipe-card](https://github.com/mardisen/solid-swipe-card) — SolidJS swipeable card component (tinder-like, alternative to solid-gesture for triage cards)
- [rxdb.info/slow-indexeddb.html](https://rxdb.info/slow-indexeddb.html) — IndexedDB transaction batching performance benchmarks
- [MDN Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API) — navigator.storage.persist() + navigator.storage.persisted() API

### Tertiary (LOW confidence — verify at implementation)
- solid-gesture npm version and maintenance status — confirm active before use
- Safari 18/19 storage persistence behavior — WebKit blog describes Safari 17; test on current iOS
- solid-swipe-card as alternative to solid-gesture for triage card flow — untested combination

---

## Metadata

**Confidence breakdown:**
- Standard stack (Vite + SolidJS + Dexie + Zod + vite-plugin-pwa): HIGH — all versions confirmed via npm/GitHub as of Feb 2026
- WASM build pipeline (three-step, no wasm-pack): HIGH — confirmed via official Inside Rust Blog announcement July 2025
- ESLint plugin (eslint-plugin-solid 0.14.5): HIGH — GitHub confirmed, ESLint v9 flat config documented
- Storage persistence flow (navigator.storage.persist, Safari behavior): HIGH — WebKit official blog documented
- dexie-export-import API: HIGH — README confirmed, v4.1.4 current
- CRDT change log design: MEDIUM — based on operation-based CRDT patterns; specific field names are design choices not verified against a reference implementation
- solid-gesture library: MEDIUM — GitHub confirmed; version and iOS behavior unverified
- Web Speech API iOS PWA standalone behavior: LOW — known to be inconsistent; must test at implementation

**Research date:** 2026-02-21
**Valid until:** 2026-03-21 (30 days; all stack components stable)

---

*Phase 1 research for: BinderOS — local-first, browser-only personal information management system*
*Plans covered: 01-01 (scaffold), 01-02 (atom schema + persistence), 01-03 (binder UI shell + storage safety)*
