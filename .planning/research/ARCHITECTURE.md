# Architecture Research

**Domain:** AI orchestration integration into existing local-first browser PIM (BinderOS v2.0)
**Researched:** 2026-02-22
**Confidence:** HIGH (existing architecture verified from codebase; integration patterns verified against official docs and WebLLM/Transformers.js documentation)

---

## Standard Architecture

### System Overview — v2.0 (AI Orchestration)

```
┌────────────────────────────────────────────────────────────────────────────┐
│                       MAIN THREAD (SolidJS)                                │
│                                                                             │
│  ┌──────────────┐  ┌─────────────────┐  ┌──────────────────────────────┐  │
│  │  Existing UI │  │  Floating Orb   │  │  AI Suggestion Tray          │  │
│  │  (Shell,     │  │  (NEW — Portal) │  │  (NEW — approve/reject UI)   │  │
│  │   Pages,     │  │                 │  │                              │  │
│  │   Views)     │  │  reads: state   │  │  reads: state.aiSuggestions  │  │
│  └──────┬───────┘  │  .activePage    │  │  dispatches: AI_APPLY,       │  │
│         │          │  .selectedAtom  │  │  AI_REJECT commands          │  │
│         │          └────────┬────────┘  └──────────────┬───────────────┘  │
│         └──────────────────┼──────────────────────────┘                   │
│                             │                                               │
│              ┌──────────────▼──────────────────┐                           │
│              │   SolidJS Store (store.ts)       │                           │
│              │   EXTEND: add aiState slice      │                           │
│              │   - aiSuggestions[]              │                           │
│              │   - conversationHistory[]        │                           │
│              │   - aiStatus                     │                           │
│              └──────────────┬──────────────────┘                           │
│                             │  dispatch()/onMessage()                       │
│                             │  EXISTING bridge.ts (unchanged)              │
├─────────────────────────────┼──────────────────────────────────────────────┤
│                       WORKER THREAD (existing worker.ts)                    │
│                             │                                               │
│                  ┌──────────▼──────────────┐                               │
│                  │   worker.ts (EXTEND)     │                               │
│                  │   Add AI command cases:  │                               │
│                  │   AI_TRIAGE_INBOX        │                               │
│                  │   AI_SUGGEST_COMPRESSION │                               │
│                  │   AI_APPLY_SUGGESTION    │                               │
│                  │   AI_REJECT_SUGGESTION   │                               │
│                  │   Routes to AI Adapter   │                               │
│                  └──────┬──────────────────┘                               │
│                         │                                                   │
│          ┌──────────────┼────────────────────┐                             │
│          │              │                    │                             │
│   ┌──────▼───────┐  ┌───▼────────┐  ┌────────▼──────┐                     │
│   │  BinderCore  │  │  Dexie.js  │  │  AI Adapter   │                     │
│   │  WASM        │  │  (storage) │  │  interface     │                     │
│   │  (unchanged) │  │            │  │  (NEW in       │                     │
│   └──────────────┘  └────────────┘  │   worker/)    │                     │
│                                     └───────┬────────┘                     │
│                                             │                              │
│                          ┌──────────────────┼────────────────┐             │
│                          │                  │                │             │
│                   ┌──────▼──────┐  ┌────────▼───────┐  ┌────▼──────┐      │
│                   │  Cloud API  │  │  Browser LLM   │  │  No-op    │      │
│                   │  Adapter    │  │  Adapter       │  │  Adapter  │      │
│                   │  (fetch in  │  │  (postMessage  │  │           │      │
│                   │   worker)   │  │   to LLM       │  │           │      │
│                   │             │  │   worker)      │  │           │      │
│                   └──────┬──────┘  └────────┬───────┘  └───────────┘      │
├──────────────────────────│──────────────────│────────────────────────────── │
│                  CLOUD   │   LLM WORKER THREAD (NEW — separate worker)     │
│                  APIs    │                  │                               │
│                  (fetch  │         ┌────────▼───────────────────┐           │
│                   exits  │         │  llm-worker.ts             │           │
│                   worker)│         │  - @huggingface/transformers│           │
│                          │         │  - WebGPU or WASM backend   │           │
│                          │         │  - Small model inference     │           │
│                          │         │    (SmolLM2-360M or similar) │           │
│                          │         │  - postMessage protocol       │           │
│                          │         │    INFER / INFER_RESULT       │           │
│                          │         └────────────────────────────┘           │
└────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Status | Responsibility | Key Constraint |
|-----------|--------|----------------|----------------|
| SolidJS UI (Shell, Pages, Views) | Existing, unchanged | Render atom lists, pages, overlays | No new dependencies; read from extended store |
| Floating Orb | NEW | Context-aware AI entry point; reads `state.activePage` + `state.selectedAtomId` reactively; dispatches AI commands | Rendered via SolidJS `<Portal>` to avoid z-index conflicts; always visible |
| AI Suggestion Tray | NEW | Display AI-generated suggestions with approve/reject; visual distinction from user atoms | Additive only — never auto-applies; tagged as AI-origin in UI |
| SolidJS Store (`store.ts`) | EXTEND | Add `aiState` slice: suggestions, conversation history, AI status | Do NOT restructure existing state; add new fields only |
| Worker (`worker.ts`) | EXTEND | Route new AI commands to AI Adapter; apply approved suggestions via existing mutation handlers | AI commands must go through same write queue + changelog as user commands |
| AI Adapter Interface | NEW (in `src/worker/ai/`) | Abstract interface for browser LLM, cloud API, no-op | Lives in worker thread, not main thread; all AI I/O stays off main thread |
| Cloud API Adapter | NEW | `fetch()` calls to OpenAI/Anthropic; streaming responses via ReadableStream | Fetch works from worker thread; OpenAI needs a CORS-enabling proxy for direct browser use; Anthropic supports direct browser CORS |
| Browser LLM Adapter | NEW | Delegates inference to LLM Worker via postMessage | Cannot call LLM Worker directly; sends typed message, awaits response |
| LLM Worker (`llm-worker.ts`) | NEW | `@huggingface/transformers` inference; ONNX or WebGPU backend | Separate from existing embedding worker; different model, different purpose |
| BinderCore WASM | Existing, unchanged | Scoring, entropy, compression candidates | Not involved in AI; AI reads its output (scores, candidates) but doesn't modify it |
| Dexie.js / Write Queue | Existing, extend schema | Persist AI suggestions, conversation history; extend changelog `source` field | AI mutations MUST use the write queue; add `source: 'ai' | 'user'` to changelog |

---

## Answering the Six Integration Questions

### Q1: Where Does Browser LLM Inference Run?

**Answer: A new, dedicated LLM Worker — not the existing `worker.ts`.**

The existing `worker.ts` owns BinderCore WASM + Dexie + scoring. Adding a large ONNX model there would:
- Inflate the existing worker's memory footprint significantly (360M SmolLM2 = ~180-720 MB RAM)
- Risk crashing the worker (taking down all data access with it) if the model OOMs
- Complicate initialization sequencing (WASM + model both loading simultaneously)

The existing `embedding-worker.ts` pattern (already used for all-MiniLM-L6-v2) is the exact model to follow. Create `llm-worker.ts` as an independent worker using `@huggingface/transformers`.

**Why not the existing embedding worker?** Different lifecycle. The embedding worker is for semantic search (already exists, owns `all-MiniLM-L6-v2`). The LLM worker is for generation (new, owns a small generative model like SmolLM2-360M-Instruct). Separate workers = separate failure domains, separate memory, separate loading.

**WASM vs WebGPU backend:** Use Transformers.js with the WASM backend by default (`dtype: 'q8'`), falling back gracefully if WebGPU is unavailable. WebGPU is available in `navigator.gpu` from dedicated workers (MDN confirmed), but:
- WebGPU requires COOP/COEP headers (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`) for SharedArrayBuffer, which may not be set in all hosting environments
- WASM backend works everywhere without those headers
- Recommendation: attempt WebGPU, fall back to WASM, never block on GPU availability

**Model selection:** SmolLM2-360M-Instruct is the recommended starting point:
- ~180 MB at q8 quantization (acceptable for optional feature)
- Sufficient for classification, tagging, and short-form suggestions
- Available as ONNX for Transformers.js
- 4-bit quantization (q4) degrades quality at this size — use q8 minimum

For conversational reviews requiring more nuanced reasoning, escalate to cloud API.

### Q2: Where Do Cloud API Calls Go?

**Answer: Cloud API calls (`fetch`) run inside the existing `worker.ts` (or the AI Adapter called from it) — not on the main thread.**

Web Workers can call `fetch()` without any CORS issues for cross-origin requests, assuming the target API sets `Access-Control-Allow-Origin`. Workers operate in a structured origin context and make outbound HTTP requests just like the main thread.

**Anthropic (Claude):** Supports direct browser/worker CORS via the `anthropic-dangerous-direct-browser-access: true` header. The recommended pattern for a local-first app is **Bring Your Own Key** — user provides their API key, stored in `localStorage` on the main thread, passed to the worker on init. This eliminates any server proxy requirement.

**OpenAI:** Does NOT support direct browser/worker CORS as of 2026. Direct `fetch` calls from a browser context return CORS errors. If OpenAI support is needed, options are:
1. A lightweight CORS proxy (simple nginx or Cloudflare Worker)
2. LM Studio local proxy (user runs locally, no CORS issue)
3. Skip OpenAI, support only Anthropic + local model

**Recommendation:** Support Anthropic direct (CORS-enabled) + LM Studio local proxy as the cloud tier. This covers all use cases without requiring users to run any server infrastructure.

**Streaming:** Use `ReadableStream` / `response.body.getReader()` in the worker. Stream tokens back to main thread via `postMessage` with `{ type: 'AI_TOKEN', token: '...' }` messages. Store completed responses in the AI suggestion buffer.

### Q3: How Does Conversational State Work?

**Answer: Extend `BinderState` with a dedicated `aiState` slice — do NOT create a separate store.**

The existing store pattern (single `BinderState` in `store.ts`) is the correct home for all UI-relevant state. A separate store would break the existing reconcile pattern and require additional wiring.

**Add to `BinderState`:**
```typescript
// Extend BinderState in store.ts
aiStatus: 'idle' | 'thinking' | 'streaming' | 'error';
aiSuggestions: AISuggestion[];    // pending suggestions (approve/reject queue)
conversationTurn: ConversationTurn | null;  // active question flow (null when no flow active)
aiError: string | null;
```

**Conversational turns are ephemeral UI state** — they live in `conversationTurn` in the store and are cleared when the user answers or dismisses. They do NOT need to be persisted to Dexie between sessions (the orb resets to idle on page reload).

**Multi-turn flows:** Each question flow is a sequence of `ConversationTurn` objects. The orb renders the current turn's question and options. When the user selects an option, the turn resolves and the orb either shows the next turn or produces a suggestion.

```typescript
interface ConversationTurn {
  id: string;
  question: string;
  options: Array<{ label: string; value: string }>;
  allowFreeform: boolean;
  context: {
    trigger: 'orb_opened' | 'review_started' | 'inbox_triage' | 'entropy_alert';
    atomId?: string;
    pageId?: string;
  };
}

interface AISuggestion {
  id: string;
  type: 'tag' | 'classify' | 'merge' | 'archive' | 'update_field' | 'priority_change';
  atomId: string;
  proposedChange: Partial<Atom>;
  explanation: string;
  source: 'browser_llm' | 'cloud_api';
  status: 'pending' | 'applied' | 'rejected';
  createdAt: number;
}
```

**AI suggestions are stored per-session** in `state.aiSuggestions`. When applied, they flow through the normal mutation path (new worker command `AI_APPLY_SUGGESTION` → existing handlers → write queue → changelog with `source: 'ai'`). Rejected suggestions are simply removed from the array.

### Q4: How Does the AI Suggestion Pipeline Flow Through the Command/Response Protocol?

**Answer: Add new AI command types to `messages.ts`; route them in `worker.ts`; apply approved suggestions through existing mutation handlers.**

The existing Command/Response protocol is the correct integration point. The pattern is:

```
User triggers AI (orb click / review start)
    ↓
dispatch({ type: 'AI_TRIAGE_INBOX' })  [main thread → worker]
    ↓
Worker: collect context (atoms, scores, inboxItems from Dexie)
    ↓
Worker: call AI Adapter (browser LLM or cloud API)
    ↓ (streaming)
Worker: postMessage({ type: 'AI_SUGGESTION', payload: suggestion })  [multiple]
    ↓
Store: append to state.aiSuggestions[]
    ↓
Orb/Tray: renders suggestion with approve/reject buttons
    ↓ (user approves)
dispatch({ type: 'AI_APPLY_SUGGESTION', payload: { suggestionId } })
    ↓
Worker: look up suggestion, call existing handler (UPDATE_ATOM, etc.)
    ↓
Worker: writeQueue → Dexie → changelog (source: 'ai')
    ↓
flushAndSendState() → STATE_UPDATE (clears suggestion from pending)
```

**New command types to add to `messages.ts`:**
```typescript
| { type: 'AI_TRIAGE_INBOX' }
| { type: 'AI_START_REVIEW'; payload: { mode: 'weekly' | 'daily' | 'compression' } }
| { type: 'AI_ANSWER_TURN'; payload: { turnId: string; value: string } }
| { type: 'AI_APPLY_SUGGESTION'; payload: { suggestionId: string } }
| { type: 'AI_REJECT_SUGGESTION'; payload: { suggestionId: string } }
| { type: 'AI_CANCEL' }
```

**New response types to add to `messages.ts`:**
```typescript
| { type: 'AI_TURN'; payload: ConversationTurn }          // next question to display
| { type: 'AI_SUGGESTION'; payload: AISuggestion }        // new suggestion to queue
| { type: 'AI_TOKEN'; payload: { token: string } }        // streaming token
| { type: 'AI_DONE'; payload: { reason: string } }        // flow complete
| { type: 'AI_ERROR'; payload: { message: string } }      // recoverable AI error
```

**Critical invariant:** `AI_APPLY_SUGGESTION` in the worker calls the SAME handlers used by user commands (`handleUpdateAtom`, `handleClassifyInboxItem`, etc.). AI suggestions are not a special write path — they are regular mutations with a `source: 'ai'` tag added to the changelog entry. This is what makes them reversible via UNDO.

**Changelog extension:** Add `source: 'user' | 'ai'` to `MutationLogEntry` in `types/changelog.ts`. Existing entries default to `'user'`. The UNDO handler works identically regardless of source — the mutation log entry contains the full before/after snapshot.

### Q5: How Does the Floating Orb Read UI Context Reactively?

**Answer: The orb is a SolidJS component that reads directly from the existing reactive store — `state.activePage` and `state.selectedAtomId` are already there.**

The orb does NOT need a new context system or prop drilling. The existing SolidJS store already exposes the two pieces of context the orb needs:

```typescript
// FloatingOrb.tsx — reads store directly, same as any other component
import { state } from '../signals/store';
import { selectedAtom } from '../signals/store';  // already a createMemo

// These are reactive — the orb re-renders when page or atom selection changes
const currentPage = () => state.activePage;          // string: 'inbox', 'today', etc.
const focusedAtom = () => selectedAtom();            // Atom | null — existing memo
const entropyLevel = () => state.entropyScore?.level;  // 'green'|'yellow'|'red'
const aiStatus = () => state.aiStatus;               // 'idle'|'thinking'|'streaming'

// Derive the orb's suggested action contextually
const primaryAction = createMemo(() => {
  if (focusedAtom()) return { label: 'Analyze this atom', command: 'AI_ANALYZE_ATOM' };
  if (currentPage() === 'inbox') return { label: 'Triage inbox with AI', command: 'AI_TRIAGE_INBOX' };
  if (entropyLevel() === 'red') return { label: 'Start compression review', command: 'AI_START_REVIEW' };
  return { label: 'Weekly review', command: 'AI_START_REVIEW' };
});
```

**Orb placement:** Render via SolidJS `<Portal mount={document.body}>` inside `App` (same level as `CapEnforcementModal`). This gives it a fixed stacking context above all page content. Position with `position: fixed; bottom: 80px; right: 16px` (above the existing FAB capture button — adjust FAB position accordingly).

**Overlay integration:** The orb's question flow overlay uses the existing `overlayState` signal in `app.tsx`. Add `'ai-orb'` as a new overlay state value. This ensures the orb never conflicts with capture, search, or command-palette overlays.

**The orb does NOT need its own data fetching.** All the data it needs (`state.atoms`, `state.scores`, `state.entropyScore`, `state.inboxItems`) is already in the reactive store, kept fresh by the existing Worker STATE_UPDATE flow.

### Q6: Suggested Build Order

**Based on dependencies — violating this order causes rework:**

```
Step 1: Extend message protocol and store (zero breakage risk)
   - Add AI command/response types to types/messages.ts
   - Add aiState slice to BinderState in store.ts
   - Add source field to changelog.ts
   → Existing functionality is completely unaffected

Step 2: AI Adapter interface + no-op implementation
   - src/worker/ai/interface.ts — AIProvider interface
   - src/worker/ai/noop.ts — returns empty suggestions immediately
   - Wire into worker.ts (handle AI commands, call no-op adapter)
   → End-to-end message flow exists; nothing breaks; no real AI yet

Step 3: LLM Worker + Browser LLM Adapter
   - src/worker/llm-worker.ts — Transformers.js, SmolLM2-360M-Instruct
   - src/worker/ai/browser-llm.ts — postMessage bridge to LLM worker
   - Replace no-op adapter with browser LLM adapter in worker.ts
   → First real AI inference; test with simple classify request

Step 4: Cloud API Adapter (Anthropic)
   - src/worker/ai/cloud-api.ts — fetch to Anthropic with BYOK pattern
   - API key management: main thread stores in localStorage, passes to worker on init
   - Streaming: ReadableStream → AI_TOKEN messages
   → Tiered escalation now works (browser LLM → cloud API for complex tasks)

Step 5: Floating Orb component (pure UI, reads existing store)
   - src/ui/components/FloatingOrb.tsx
   - src/ui/components/ConversationTurnCard.tsx (GSD-style question flow)
   - Add 'ai-orb' to overlayState in app.tsx
   - Register in App.tsx alongside existing overlays
   → Orb is visible and dispatches commands; Step 2's no-op adapter shows it working

Step 6: AI Suggestion Tray (approve/reject UI)
   - src/ui/components/AISuggestionTray.tsx
   - Reads state.aiSuggestions; dispatches AI_APPLY/AI_REJECT
   - Visual distinction: different background, AI badge, source label
   → Full approve/reject pipeline functional

Step 7: Feature-specific AI flows
   - Inbox triage flow (AI_TRIAGE_INBOX handler in worker)
   - Compression review AI (AI_START_REVIEW handler)
   - Weekly review guided flow
   - Smart tagging on atom creation
   → Each flow is independent; build in order of user value
```

---

## Recommended Project Structure

```
src/
├── types/
│   ├── messages.ts           # EXTEND: add AI command/response types
│   └── changelog.ts          # EXTEND: add source: 'user' | 'ai' field
│
├── worker/
│   ├── worker.ts             # EXTEND: add AI command cases, route to adapter
│   ├── bridge.ts             # UNCHANGED — postMessage protocol unchanged
│   ├── handlers/             # UNCHANGED — existing handlers called by AI_APPLY
│   └── ai/                   # NEW: AI integration layer (lives in worker scope)
│       ├── interface.ts      # AIProvider interface definition
│       ├── noop.ts           # No-op adapter (always-safe default)
│       ├── browser-llm.ts    # Delegates to llm-worker.ts via postMessage
│       └── cloud-api.ts      # fetch() to Anthropic (BYOK pattern)
│
├── worker/
│   └── llm-worker.ts         # NEW: dedicated LLM inference worker
│                             # @huggingface/transformers, SmolLM2-360M-Instruct
│                             # Protocol: INFER / INFER_RESULT / INFER_ERROR
│
├── ui/
│   ├── signals/
│   │   └── store.ts          # EXTEND: add aiState fields to BinderState
│   ├── components/
│   │   ├── FloatingOrb.tsx   # NEW: context-aware AI trigger, Portal-rendered
│   │   ├── ConversationTurnCard.tsx  # NEW: GSD-style question flow card
│   │   └── AISuggestionTray.tsx     # NEW: approve/reject queue UI
│   └── views/
│       └── (existing views)  # UNCHANGED — orb overlays existing pages
│
├── search/
│   └── embedding-worker.ts   # UNCHANGED — separate from LLM worker
│
└── app.tsx                   # EXTEND: add FloatingOrb, extend overlayState
```

### Structure Rationale

- **`worker/ai/`:** All AI adapters live in the worker scope, not the UI scope. The UI never calls AI directly — it dispatches commands and renders state. This enforces the "AI as advisor" constraint.
- **`llm-worker.ts` at `worker/` level:** Separate from `worker.ts` (the main data worker) and `search/embedding-worker.ts` (the embedding worker). Three distinct workers, three distinct responsibilities, three independent failure domains.
- **No changes to `bridge.ts`:** The existing `dispatch()` / `onMessage()` bridge handles all new AI commands transparently. The protocol extension is purely additive (new types in the discriminated union).
- **`worker/ai/interface.ts`:** Interface-first design means the system works without any AI (no-op) and AI backends are swappable without touching any other layer.

---

## Architectural Patterns

### Pattern 1: Additive AI Suggestions, Never Direct Mutation

**What:** AI suggestions are staged in `state.aiSuggestions`. The system applies them ONLY when the user approves. Approved suggestions route through the exact same worker handlers as user commands. Rejected suggestions are discarded. Nothing is ever auto-applied.

**When to use:** Every AI-generated change. No exceptions. "Additive and tagged" is the invariant.

**Trade-offs:** More user interaction required than a fully autonomous AI. Benefit: user retains full control, trust is earned incrementally, all changes are reversible via existing UNDO.

**Example:**
```typescript
// In worker.ts — AI_APPLY_SUGGESTION case
case 'AI_APPLY_SUGGESTION': {
  const suggestion = pendingSuggestions.get(msg.payload.suggestionId);
  if (!suggestion) break;

  // Inject AI source into the changelog context
  setCurrentMutationSource('ai');  // thread-local flag checked by appendMutation()

  // Call the SAME handler a user command would call
  if (suggestion.type === 'classify') {
    await handleClassifyInboxItem(suggestion.proposedChange);
  } else if (suggestion.type === 'update_field') {
    await handleUpdateAtom(suggestion.proposedChange);
  }
  // etc.

  setCurrentMutationSource('user');  // reset
  pendingSuggestions.delete(msg.payload.suggestionId);
  await flushAndSendState();
  break;
}
```

### Pattern 2: LLM Worker as Inference Endpoint

**What:** `llm-worker.ts` owns the generative model. The AI Adapter (`browser-llm.ts`, running in `worker.ts`) communicates with it via a typed postMessage protocol. The browser LLM adapter maintains a pending promise map keyed by request ID, resolving when `INFER_RESULT` arrives.

**When to use:** Any time the browser LLM adapter needs inference. The adapter waits for the result before returning to the caller.

**Trade-offs:** Two worker threads instead of one. Benefit: LLM crashes (OOM, GPU error) don't take down data storage. Memory separation means IndexedDB access continues even if the model fails to load.

**Example:**
```typescript
// src/worker/ai/browser-llm.ts

let llmWorker: Worker | null = null;
const pending = new Map<string, { resolve: (s: string) => void; reject: (e: Error) => void }>();

function getLLMWorker(): Worker {
  if (!llmWorker) {
    llmWorker = new Worker(new URL('../llm-worker.ts', import.meta.url), { type: 'module' });
    llmWorker.onmessage = (e) => {
      const { type, id, result, error } = e.data;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (type === 'INFER_RESULT') p.resolve(result);
      else if (type === 'INFER_ERROR') p.reject(new Error(error));
    };
  }
  return llmWorker;
}

export async function infer(prompt: string, options?: InferOptions): Promise<string> {
  const id = crypto.randomUUID();
  const worker = getLLMWorker();
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ type: 'INFER', id, prompt, options });
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error('LLM inference timeout'));
      }
    }, 30_000);
  });
}
```

### Pattern 3: Cloud API with Bring-Your-Own-Key

**What:** User provides their own Anthropic API key via a settings UI. The key is stored in `localStorage` on the main thread and passed to the worker during initialization via the existing `INIT` command payload extension. The cloud adapter uses it for all API calls.

**When to use:** Any time the browser LLM is insufficient (conversational depth, nuanced reasoning, weekly review synthesis).

**Trade-offs:** Requires the user to have an API key. Benefit: no server required, no key exposure in code, cost stays with the user, API key never leaves the device.

**Example:**
```typescript
// Main thread (app.tsx) — pass key during worker init
const apiKey = localStorage.getItem('anthropic-api-key');
await initWorker({ anthropicApiKey: apiKey ?? undefined });

// worker.ts — store for use by cloud adapter
let anthropicApiKey: string | undefined;
// In INIT case: anthropicApiKey = msg.payload.anthropicApiKey;

// src/worker/ai/cloud-api.ts
export async function callClaude(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',  // required for CORS
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',  // fast + cheap for suggestions
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await response.json();
  return data.content[0].text;
}
```

### Pattern 4: Context-Aware Orb via Reactive Store

**What:** The Floating Orb reads `state.activePage`, `selectedAtom()`, `state.entropyScore`, and `state.aiStatus` directly from the SolidJS reactive store. The orb's primary action is a `createMemo` that derives the most contextually relevant AI action based on current state.

**When to use:** The orb's content should update automatically as the user navigates without any explicit event handling.

**Trade-offs:** Requires the store to be the single source of truth for UI context (which it already is). Benefit: zero wiring — the orb "just works" as the user navigates because SolidJS reactivity handles updates automatically.

**Example:**
```typescript
// FloatingOrb.tsx
function FloatingOrb() {
  const primaryAction = createMemo(() => {
    const atom = selectedAtom();
    const page = state.activePage;
    const entropy = state.entropyScore?.level;

    if (state.aiStatus !== 'idle') {
      return { label: 'Working...', disabled: true };
    }
    if (atom) {
      return { label: `Suggest for "${atom.title?.slice(0, 20)}..."`, command: 'AI_ANALYZE_ATOM' };
    }
    if (page === 'inbox' && state.inboxItems.length > 3) {
      return { label: 'AI triage inbox', command: 'AI_TRIAGE_INBOX' };
    }
    if (entropy === 'red') {
      return { label: 'Compression review', command: 'AI_START_REVIEW' };
    }
    return { label: 'Weekly review', command: 'AI_START_REVIEW' };
  });

  return (
    <Portal mount={document.body}>
      <div class="floating-orb" style={{ position: 'fixed', bottom: '80px', right: '16px' }}>
        <button
          disabled={primaryAction().disabled}
          onClick={() => sendCommand({ type: primaryAction().command })}
        >
          {primaryAction().label}
        </button>
        {/* GTD menu below primary action */}
      </div>
    </Portal>
  );
}
```

---

## Data Flow

### AI Suggestion Flow (Full Pipeline)

```
User clicks "AI triage inbox" on Floating Orb
    ↓
sendCommand({ type: 'AI_TRIAGE_INBOX' })      [main thread]
    ↓
dispatch() → postMessage → worker.ts           [main thread → worker]
    ↓
Worker: postMessage({ type: 'AI_STATUS', payload: 'thinking' })
    ↓ (store sets state.aiStatus = 'thinking')
Worker: collect context (state.inboxItems from Dexie, state.atoms, state.scores)
    ↓
Worker: call aiAdapter.triageInbox(items, scores)
    ↓
AI Adapter: format prompt → call browser LLM or cloud API
    ↓ (for each item)
AI Adapter: parse response → yield AISuggestion objects
    ↓
Worker: postMessage({ type: 'AI_SUGGESTION', payload: suggestion })  [per item]
    ↓
Store: append to state.aiSuggestions[]
    ↓
AISuggestionTray: renders new card — "Classify as Task → Next Action"
    ↓ (user taps Approve)
sendCommand({ type: 'AI_APPLY_SUGGESTION', payload: { suggestionId } })
    ↓
Worker: call handleClassifyInboxItem with suggestion.proposedChange
    ↓ (with source: 'ai' in changelog)
writeQueue.enqueue() → Dexie write → changelog entry (source: 'ai')
    ↓
flushAndSendState() → STATE_UPDATE (suggestion removed from pending)
    ↓
Store: reconcile atoms, inboxItems, savedFilters
    ↓
AISuggestionTray: card slides out (suggestion no longer in state.aiSuggestions)
```

### Conversational Turn Flow (Question Flows)

```
User initiates "Weekly review" via orb
    ↓
sendCommand({ type: 'AI_START_REVIEW', payload: { mode: 'weekly' } })
    ↓
Worker: build first ConversationTurn (most stale atom review, etc.)
    ↓
postMessage({ type: 'AI_TURN', payload: turn })
    ↓
Store: state.conversationTurn = turn
    ↓
FloatingOrb: expands to show ConversationTurnCard (question + options)
    ↓ (user selects option)
sendCommand({ type: 'AI_ANSWER_TURN', payload: { turnId, value: 'archive' } })
    ↓
Worker: process answer → possibly generate suggestion, possibly build next turn
    ↓
postMessage({ type: 'AI_SUGGESTION' | 'AI_TURN' | 'AI_DONE' })
    ↓
State updates accordingly; orb shows next turn or closes
```

### Changelog Extension (AI Mutation Tracking)

```typescript
// types/changelog.ts — EXTEND MutationLogEntry
interface MutationLogEntry {
  id: string;
  atomId: string;
  operation: 'create' | 'update' | 'delete';
  before: Atom | null;
  after: Atom | null;
  timestamp: number;
  lamportClock: number;
  source: 'user' | 'ai';  // NEW field (default: 'user' for existing entries)
}
```

---

## Component Boundaries

| Boundary | Communication | Direction | Notes |
|----------|---------------|-----------|-------|
| UI ↔ Worker (AI commands) | postMessage via existing bridge.ts | Bidirectional | No change to bridge.ts; new message types in messages.ts only |
| Worker ↔ AI Adapter | Direct TypeScript function call | Worker calls adapter | Adapter lives in worker scope; no postMessage |
| AI Adapter ↔ LLM Worker | postMessage (typed protocol) | Bidirectional | Browser LLM adapter spawns and owns llm-worker.ts |
| AI Adapter ↔ Cloud API | fetch() | One-way outbound | Worker can fetch; Anthropic has CORS; OpenAI needs proxy |
| Worker ↔ Existing Handlers | Direct function call (UNCHANGED) | Worker calls handlers | AI_APPLY_SUGGESTION calls same handlers as user commands |
| Floating Orb ↔ Store | SolidJS reactive store reads | One-way read | Orb dispatches commands; reads state reactively |
| Floating Orb ↔ App overlayState | Shared signal in app.tsx | Bidirectional | Orb closes when other overlay opens; orb opening closes others |

---

## Integration Points with Existing Architecture

### Points That Require Modification

| Existing File | Change Type | What Changes |
|---------------|-------------|--------------|
| `src/types/messages.ts` | EXTEND | Add AI command/response types to discriminated unions |
| `src/types/changelog.ts` | EXTEND | Add `source: 'user' \| 'ai'` to MutationLogEntry |
| `src/ui/signals/store.ts` | EXTEND | Add aiState fields to BinderState; handle new response types in onMessage |
| `src/worker/worker.ts` | EXTEND | Add AI command cases; instantiate AI adapter; route to handlers |
| `src/app.tsx` | EXTEND | Add FloatingOrb component; extend overlayState type; pass API key to initWorker |
| `src/storage/db.ts` | EXTEND (optional) | Add `aiSuggestions` table if session persistence of suggestions is desired |

### Points That Remain Unchanged

| Existing File | Why Unchanged |
|---------------|---------------|
| `src/worker/bridge.ts` | Message protocol extension is additive; dispatch/onMessage work unchanged |
| `src/worker/handlers/*.ts` | AI_APPLY_SUGGESTION calls these same handlers; they don't need to know about AI |
| `src/storage/write-queue.ts` | AI mutations enqueue through same write queue; no changes needed |
| `src/search/embedding-worker.ts` | LLM worker is a separate worker; embedding worker is unaffected |
| `src/wasm/pkg/` | BinderCore WASM is unchanged; AI reads its outputs but doesn't modify it |
| All existing UI components | Floating Orb and Suggestion Tray are additive overlays; no existing component changes |

---

## Anti-Patterns

### Anti-Pattern 1: AI Mutations Bypassing the Write Queue

**What people do:** Apply an AI suggestion directly to Dexie in the AI adapter, bypassing `writeQueue` and `appendMutation()`.

**Why it's wrong:** The mutation log won't have an entry for the change. The UNDO command won't be able to reverse it. The `source: 'ai'` field won't be populated. The system's audit trail — the entire basis for user trust in AI — is broken.

**Do this instead:** `AI_APPLY_SUGGESTION` in the worker calls `handleUpdateAtom` / `handleClassifyInboxItem` / etc. (same handlers user commands call). These handlers write through the write queue and append to the changelog with `source: 'ai'`.

### Anti-Pattern 2: Running the Generative LLM in the Existing Data Worker

**What people do:** Add `@huggingface/transformers` for a generative model to `worker.ts` alongside BinderCore WASM and Dexie.

**Why it's wrong:** If the model causes an OOM or GPU crash, the entire worker process dies — taking down Dexie (data access), BinderCore (scoring), and the write queue with it. Data corruption risk during unclean worker termination.

**Do this instead:** Dedicated `llm-worker.ts`. Two separate failure domains. Data worker can't crash from LLM issues. LLM worker resets without data impact.

### Anti-Pattern 3: Storing AI Suggestions in Dexie Without Changelog Integration

**What people do:** Persist AI suggestions in a Dexie table (to survive page reload) but don't integrate them into the mutation log until they're approved.

**Why it's wrong:** Not wrong in itself, but creates confusion about what "approved" means. If a suggestion was persisted to Dexie but not yet applied, the user may not remember whether they approved it. Suggestions should be ephemeral until applied.

**Do this instead:** Keep suggestions in `state.aiSuggestions` (in-memory only). If session persistence matters, store them in `sessionStorage` (tab-scoped) not `localStorage` or Dexie. Clear on page reload — stale suggestions confuse users.

### Anti-Pattern 4: Blocking the Worker Waiting for LLM Response

**What people do:** Call `await infer(prompt)` synchronously inside a worker message handler, blocking the entire worker event loop while waiting for the LLM.

**Why it's wrong:** The main data worker is now blocked. If a user triggers a mutation during LLM inference (e.g., captures an inbox item), the mutation handler can't run until inference completes. UI feels frozen.

**Do this instead:** Stream AI responses. Use the existing message protocol to send back `AI_TOKEN` messages as tokens arrive. The worker's `onmessage` handler is free to process other commands while streaming. Long-running AI requests should be cancellable via `AI_CANCEL`.

### Anti-Pattern 5: Hardcoding OpenAI as the Cloud Provider

**What people do:** Import the OpenAI SDK directly in the cloud adapter and reference `api.openai.com` throughout the code.

**Why it's wrong:** OpenAI doesn't support direct browser/worker CORS. Users with Anthropic keys can't use the feature. Cloud provider is not swappable.

**Do this instead:** Define the cloud adapter as an implementation of the `AIProvider` interface. Start with Anthropic (supports CORS). Add OpenAI with a documented requirement for a CORS proxy. Make the configured provider a user setting, not a code constant.

### Anti-Pattern 6: Floating Orb Reading Props Instead of Store

**What people do:** Pass `currentPage` and `selectedAtom` as props from a parent component down to the orb.

**Why it's wrong:** The orb is rendered via `<Portal>` at `document.body` level — above the component tree that would provide those props. Props can't cross the portal boundary without a context provider.

**Do this instead:** The orb reads directly from the global SolidJS store. It already has everything it needs: `state.activePage`, `selectedAtom()` (already a `createMemo`), `state.entropyScore`, `state.aiStatus`. No prop drilling, no context provider needed.

---

## Scaling Considerations

This is a single-user, local-first, personal tool. Scaling is about capability, not traffic.

| Concern | At v2.0 Launch | If Heavily Used |
|---------|---------------|-----------------|
| LLM model size | SmolLM2-360M at q8 ~180MB RAM, ~90MB download | Cache in browser (Cache API); user pays once |
| Cloud API cost | User's own key; cost is theirs | BYOK eliminates this concern |
| Suggestion queue depth | In-memory; user processes before next session | Add `maxSuggestions` cap (like inbox cap); reject oldest if exceeded |
| Conversation history | Ephemeral per-session; not persisted | If persistence needed, cap at last 10 turns in Dexie |
| Worker message throughput | Low (AI suggestions are low-frequency events) | Not a concern at personal scale |

---

## Sources

- [WebLLM architecture docs — worker patterns](https://webllm.mlc.ai/docs/user/advanced_usage.html) — HIGH confidence, official docs
- [WebLLM + WASM + WebWorkers — Mozilla blog](https://blog.mozilla.ai/3w-for-in-browser-ai-webllm-wasm-webworkers/) — MEDIUM confidence
- [Anthropic CORS support for direct browser access](https://simonwillison.net/2024/Aug/23/anthropic-dangerous-direct-browser-access/) — HIGH confidence, verified implementation
- [MDN WorkerNavigator.gpu — WebGPU in workers](https://developer.mozilla.org/en-US/docs/Web/API/WorkerNavigator/gpu) — HIGH confidence, official docs
- [SmolLM2 on HuggingFace — model sizes and quantization](https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct) — MEDIUM confidence
- [Transformers.js v3 WebGPU support blog](https://huggingface.co/blog/transformersjs-v3) — MEDIUM confidence
- [OpenAI CORS community thread — does not support direct browser](https://community.openai.com/t/cross-origin-resource-sharing-cors/28905) — MEDIUM confidence (community, but consistent across multiple sources)
- Existing BinderOS codebase (verified directly): `src/worker/worker.ts`, `src/worker/bridge.ts`, `src/ui/signals/store.ts`, `src/types/messages.ts`, `src/search/embedding-worker.ts` — HIGH confidence, ground truth

---

*Architecture research for: BinderOS v2.0 — AI Orchestration integration*
*Researched: 2026-02-22*
