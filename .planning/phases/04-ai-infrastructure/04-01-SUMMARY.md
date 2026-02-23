---
phase: 04-ai-infrastructure
plan: 01
subsystem: ai
tags: [ai, adapter, router, store, worker, types]
dependency_graph:
  requires: []
  provides:
    - AIAdapter interface and AIProviderStatus type
    - NoOpAdapter for round-trip verification
    - dispatchAI/setActiveAdapter router
    - LLMCommand/LLMResponse protocol types
    - AI_DISPATCH command + AI_RESPONSE/AI_STATUS responses
    - BinderState AI fields (10 fields, 3 derived signals, 4 setters)
    - Full AI dispatch pipeline (UI -> worker -> router -> adapter -> store)
  affects:
    - src/types/messages.ts (extended Command and Response unions)
    - src/ui/signals/store.ts (extended BinderState interface)
    - src/worker/worker.ts (INIT handler, AI_DISPATCH case)
tech_stack:
  added: []
  patterns:
    - Discriminated union message protocol (mirrors existing Command/Response)
    - Pluggable adapter pattern with id/status/execute/dispose interface
    - Module-level singleton adapter slot with setActiveAdapter
    - SolidJS createMemo for derived AI status signals
    - Privacy boundary enforced at type level (AIRequest.prompt: string, not Atom)
key_files:
  created:
    - src/types/ai-messages.ts
    - src/ai/adapters/adapter.ts
    - src/ai/adapters/noop.ts
    - src/ai/router.ts
  modified:
    - src/types/messages.ts
    - src/ui/signals/store.ts
    - src/worker/worker.ts
decisions:
  - "NoOpAdapter initialized in worker INIT handler (not lazily) to verify round-trip on startup"
  - "AIRequest.prompt typed as string (not Atom) — enforces privacy boundary at compile time"
  - "Router uses module-level singleton (not class) — matches worker's module-scope pattern"
  - "AI setters are pure UI state (no worker dispatch) — settings persistence deferred to Phase 5"
metrics:
  duration: 7 min
  completed: 2026-02-23
  tasks_completed: 2
  files_created: 4
  files_modified: 3
---

# Phase 4 Plan 1: AI Infrastructure Foundation Summary

**One-liner:** Pluggable AI adapter pipeline with NoOpAdapter, typed message protocol, and 10-field store extension for full round-trip verification before any real LLM connects.

## What Was Built

The complete AI backbone for BinderOS v2.0: a typed adapter interface, a no-op adapter for testing, an adapter router, LLM worker protocol types, and store/worker extensions that wire everything together end-to-end.

### Core Artifacts

**`src/ai/adapters/adapter.ts`** — Defines `AIProviderStatus`, `AIRequest`, `AIResponse`, and `AIAdapter`. The `AIRequest.prompt` field is typed as `string` (not `Atom`) — this is the privacy boundary enforced at the TypeScript level. All cloud adapters built on this interface inherit the constraint.

**`src/ai/adapters/noop.ts`** — `NoOpAdapter` implements `AIAdapter` with `status = 'available'`. Simulates 50ms latency, calls `onChunk?.('[no-op response]')`, returns `{ requestId, text: '[no-op response]', provider: 'noop' }`. Used to prove the full pipeline works in Phase 4.

**`src/ai/router.ts`** — Module-level `activeAdapter` slot with `setActiveAdapter`, `getActiveAdapter`, and `dispatchAI`. Throws `'No AI adapter available'` if no adapter is set or adapter status is not `'available'`. No `setInterval` or autonomous scheduling anywhere (AIST-04).

**`src/types/ai-messages.ts`** — `LLMCommand` and `LLMResponse` discriminated unions for the future dedicated LLM worker (Phase 5). Imports `AIProviderStatus` from `adapter.ts`.

### Protocol Extensions

**`src/types/messages.ts`** extended with:
- `Command` union: `AI_DISPATCH { requestId, prompt, maxTokens? }`
- `Response` union: `AI_RESPONSE { requestId, text, provider, model?, llmStatus?, cloudStatus? }`
- `Response` union: `AI_STATUS { llmStatus?, cloudStatus?, llmModelId?, llmDevice?, llmDownloadProgress?, aiActivity? }`

### Store Extension

**`src/ui/signals/store.ts`** extended with 10 AI fields in `BinderState`:

```
aiEnabled: false          (user master AI toggle)
browserLLMEnabled: false  (SmolLM2 enable)
cloudAPIEnabled: false    (Anthropic API enable)
llmStatus: 'disabled'    (AIProviderStatus)
cloudStatus: 'disabled'  (AIProviderStatus)
llmModelId: null          (model being used)
llmDevice: null           (webgpu | wasm)
llmDownloadProgress: null (0-1 download progress)
aiActivity: null          (current request description)
aiFirstRunComplete: false (onboarding flag)
```

Three derived signals: `llmReady`, `cloudReady`, `anyAIAvailable` (reactive `createMemo`).

Four setters: `setAIEnabled`, `setBrowserLLMEnabled`, `setCloudAPIEnabled`, `setAIFirstRunComplete`.

Two response handlers: `AI_RESPONSE` (clears `aiActivity`, updates provider status), `AI_STATUS` (partial update of any AI state fields).

### Worker Extension

**`src/worker/worker.ts`** extended with:
- Imports `dispatchAI`, `setActiveAdapter`, `NoOpAdapter` at module top
- INIT handler: `setActiveAdapter(new NoOpAdapter())` after WASM init
- `AI_DISPATCH` case: sends `AI_STATUS { aiActivity: 'Processing...' }`, calls `dispatchAI`, sends `AI_RESPONSE`, clears activity with `AI_STATUS { aiActivity: null }`
- TypeScript exhaustiveness check still compiles (AI_DISPATCH case added)

## Round-Trip Verification

Full dispatch path:
1. `sendCommand({ type: 'AI_DISPATCH', payload: { requestId, prompt } })` — UI
2. Worker receives `AI_DISPATCH`, sends `AI_STATUS { aiActivity: 'Processing...' }` to store
3. `dispatchAI(request)` — router delegates to `NoOpAdapter.execute()`
4. `NoOpAdapter` waits 50ms, returns `{ text: '[no-op response]', provider: 'noop' }`
5. Worker sends `AI_RESPONSE` to store, then `AI_STATUS { aiActivity: null }`
6. Store `AI_RESPONSE` handler clears `aiActivity`; `AI_STATUS` handlers update AI fields

## Deviations from Plan

None — plan executed exactly as written.

## Decisions Made

1. **NoOpAdapter initialized in INIT handler** — wires up AI immediately on worker boot so the pipeline is verifiable without any additional setup step.

2. **AIRequest.prompt typed as `string`** — enforces the privacy boundary at compile time. Any future cloud adapter that accidentally passes an `Atom` will fail TypeScript, not at runtime.

3. **Router uses module-level singleton** — consistent with how the worker manages its `core: BinderCore | null` reference. Avoids class instantiation overhead for a singleton.

4. **AI setters are pure UI state** — `setAIEnabled` etc. only update local store state; they don't dispatch to the worker. Settings persistence to Dexie is deferred to Phase 5 when the actual LLM/cloud adapters are built.

## Self-Check: PASSED

Files verified present:
- src/types/ai-messages.ts: FOUND
- src/ai/adapters/adapter.ts: FOUND
- src/ai/adapters/noop.ts: FOUND
- src/ai/router.ts: FOUND

Commits verified:
- ce3ad25: feat(04-01): create AI type system, adapter interface, no-op adapter, and router
- 5ba2052: feat(04-01): extend store, messages, and worker with AI state and AI_DISPATCH
