---
phase: 04-ai-infrastructure
plan: 02
subsystem: ai
tags: [ai, llm, transformers, webgpu, wasm, worker, smollm2, browser-adapter, offline]

# Dependency graph
requires:
  - phase: 04-01
    provides: AIAdapter interface, LLMCommand/LLMResponse types, store AI fields, router

provides:
  - Dedicated LLM Web Worker (llm-worker.ts) running SmolLM2 via Transformers.js
  - WebGPU/WASM tiered model selection (360M Quality vs 135M Fast)
  - Model download progress reporting (LLM_DOWNLOAD_PROGRESS -> store)
  - Main-thread LLM bridge (llm-bridge.ts) with init/dispatch/terminate
  - BrowserAdapter implementing AIAdapter, routing requests through llm-bridge
  - Offline detection utilities (isOnline, registerOnlineListener)
  - dispatchAICommand in store.ts (main-thread AI dispatch, bypasses BinderCore worker)
  - initBrowserAdapter in store.ts (creates adapter, wires onStatusChange -> setState)
  - Cross-origin isolation headers (COOP/COEP) in vite.config.ts for SharedArrayBuffer

affects:
  - Phase 5 (triage/review features will call dispatchAICommand)
  - Phase 6 (cloud adapter will use registerOnlineListener)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Dedicated LLM worker isolated from BinderCore worker (OOM prevention)
    - Main-thread AI dispatch bypasses BinderCore worker (prevents Transformers.js contamination)
    - BrowserAdapter.onStatusChange callback pattern for reactive LLM status in store
    - Worker detection runs inside the dedicated worker (not main thread per RESEARCH.md)
    - GeneratorFn callable type alias to avoid Transformers.js union type complexity

key-files:
  created:
    - src/worker/llm-worker.ts
    - src/worker/llm-bridge.ts
    - src/ai/adapters/browser.ts
  modified:
    - vite.config.ts
    - src/worker/worker.ts
    - src/ui/signals/store.ts

key-decisions:
  - "LLM worker uses GeneratorFn callable type alias — Transformers.js ReturnType<typeof pipeline> is too complex for TypeScript"
  - "AI dispatch moved from BinderCore worker to main thread — BrowserAdapter cannot run in BinderCore worker without Transformers.js contamination"
  - "WebGPU detection uses navigator.gpu directly via type assertion — Transformers.js apis export not re-exported from main types file"
  - "BrowserAdapter.onStatusChange optional callback pattern — avoids circular dependency between adapter and store"

requirements-completed: [AINF-02, AINF-03, AINF-06]

# Metrics
duration: 13min
completed: 2026-02-23
---

# Phase 4 Plan 2: AI Infrastructure Summary

**SmolLM2 LLM worker with WebGPU/WASM tiered selection, model download progress, BrowserAdapter, and main-thread AI dispatch wired into the reactive store.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-02-23T03:13:04Z
- **Completed:** 2026-02-23T03:25:59Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Dedicated `llm-worker.ts` running SmolLM2 via Transformers.js in complete isolation from BinderCore worker
- WebGPU detection inside the worker selects 360M (quality/fp16) or 135M (fast/q8) model automatically
- Download progress flows from worker to main thread to reactive store via LLM_DOWNLOAD_PROGRESS messages
- `BrowserAdapter` implements `AIAdapter`, pending request map keyed by requestId, abort signal support
- `dispatchAICommand` in store.ts dispatches AI directly on main thread — no BinderCore worker involvement
- Vite config updated with COOP/COEP headers for SharedArrayBuffer support in ONNX WASM backend

## Task Commits

Each task was committed atomically:

1. **Task 1: LLM worker, bridge, and Vite config** - `7c9926a` (feat)
2. **Task 2: BrowserAdapter, offline detection, main-thread dispatch** - `1b936ff` (feat)

**Plan metadata:** (pending final commit)

## Files Created/Modified

- `src/worker/llm-worker.ts` - SmolLM2 pipeline, WebGPU detection, model download progress, LLMCommand dispatcher
- `src/worker/llm-bridge.ts` - Main-thread bridge: initLLMWorker, dispatchLLM, onLLMMessage, terminateLLMWorker
- `src/ai/adapters/browser.ts` - BrowserAdapter (AIAdapter impl), isOnline(), registerOnlineListener()
- `vite.config.ts` - Added COOP/COEP cross-origin isolation headers to server and preview sections
- `src/worker/worker.ts` - Removed AI_DISPATCH logic (now main-thread); kept NoOpAdapter init in INIT handler
- `src/ui/signals/store.ts` - Added dispatchAICommand(), initBrowserAdapter() with onStatusChange wiring

## Decisions Made

1. **GeneratorFn type alias for pipeline** — `ReturnType<typeof pipeline>` produces a union type too complex for TypeScript. Used a simple callable type alias `(prompt: string, opts: Record<string, unknown>) => Promise<unknown>` with a single `as unknown as GeneratorFn` cast in `initModel()`. Clean escape hatch.

2. **AI dispatch moved to main thread** — The BinderCore worker cannot use BrowserAdapter because that would pull Transformers.js into the BinderCore WASM process. Plan 01 placed `AI_DISPATCH` in the worker for NoOpAdapter verification; Plan 02 corrects this by adding `dispatchAICommand` to the store and making the `AI_DISPATCH` case in worker.ts a no-op with a comment.

3. **WebGPU detection uses `navigator.gpu` directly** — The `apis` export from `@huggingface/transformers` is not re-exported from the package's main types file. Used the same check as Transformers.js source: `typeof navigator !== 'undefined' && 'gpu' in navigator`, with a typed interface `GPUInterface` for safe casting.

4. **BrowserAdapter.onStatusChange optional callback** — Rather than importing the store into the adapter (circular dependency), the adapter exposes an optional callback that the store sets after construction. The `initBrowserAdapter()` function in store.ts handles this wiring cleanly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed eslint-disable comments for non-existent rule**
- **Found during:** Task 1 (lint check after implementing llm-worker.ts)
- **Issue:** ESLint config doesn't include `@typescript-eslint/no-explicit-any` rule — disable comments caused lint errors
- **Fix:** Replaced `any` type with typed `GeneratorFn` callable alias and proper type assertions
- **Files modified:** src/worker/llm-worker.ts
- **Verification:** `pnpm lint` passes with 0 errors
- **Committed in:** 1b936ff (Task 2 commit)

**2. [Rule 1 - Bug] Replaced direct `env.apis` access with separate detection**
- **Found during:** Task 1 (TypeScript compilation)
- **Issue:** `apis` is a named export from `@huggingface/transformers/types/env` but not re-exported from the main module — `env.apis` doesn't exist on `TransformersEnvironment`
- **Fix:** Implemented WebGPU detection using `navigator.gpu` directly (mirrors Transformers.js `IS_WEBGPU_AVAILABLE` logic)
- **Files modified:** src/worker/llm-worker.ts
- **Verification:** `npx tsc --noEmit` shows no errors in src/ files
- **Committed in:** 1b936ff (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 type/rule bugs)
**Impact on plan:** Both fixes were required for compilation and lint. No scope creep. Architecture as designed.

## Issues Encountered

- Transformers.js `ReturnType<typeof pipeline>` generates a union type too complex for TypeScript's type checker (TS2590). Resolved with a callable type alias — the pipeline instance is callable in JavaScript regardless.

## User Setup Required

None — no external service configuration required. Model downloads happen automatically on first use (browser LLM requires network for initial download, then works offline).

## Next Phase Readiness

- LLM worker complete and isolated from BinderCore worker
- BrowserAdapter ready to receive AI requests via dispatchAICommand()
- Store has llmStatus, llmDevice, llmModelId, llmDownloadProgress reactive fields
- initBrowserAdapter() can be called from App.tsx when browserLLMEnabled becomes true
- Phase 5 (triage/classification) can call dispatchAICommand() directly

## Self-Check: PASSED

Files verified present:
- src/worker/llm-worker.ts: FOUND
- src/worker/llm-bridge.ts: FOUND
- src/ai/adapters/browser.ts: FOUND
- vite.config.ts: FOUND
- src/worker/worker.ts: FOUND
- src/ui/signals/store.ts: FOUND
- .planning/phases/04-ai-infrastructure/04-02-SUMMARY.md: FOUND

Commits verified:
- 7c9926a: feat(04-02): create LLM worker and bridge with WebGPU detection
- 1b936ff: feat(04-02): create BrowserAdapter, offline detection, main-thread AI dispatch

---
*Phase: 04-ai-infrastructure*
*Completed: 2026-02-23*
