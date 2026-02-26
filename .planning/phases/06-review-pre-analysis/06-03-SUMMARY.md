---
phase: 06-review-pre-analysis
plan: 03
subsystem: ai
tags: [webllm, mlc-ai, webgpu, llm, browser-ai, transformers, model-selector]

# Dependency graph
requires:
  - phase: 05-triage-ai
    provides: BrowserAdapter and LLM worker infrastructure, AI settings panel

provides:
  - WebLLM-based local AI worker using WebWorkerMLCEngineHandler
  - BrowserAdapter powered by @mlc-ai/web-llm with OpenAI-compatible API
  - Structured JSON output support via XGrammar (response_format with schema)
  - Model size selector in AI Settings panel (1B/3B/3.8B) with VRAM guidance
  - WEBLLM_MODELS and DEFAULT_MODEL_ID constants for model configuration
  - Persisted model selection via selectedModelId in AISettings

affects:
  - phase 6 remaining plans (review analysis will use WebLLM for local JSON generation)
  - any future plan adding structured AI output requirements

# Tech tracking
tech-stack:
  added:
    - "@mlc-ai/web-llm@0.2.81 — WebGPU-accelerated LLM inference with XGrammar JSON constraints"
  patterns:
    - "WebWorkerMLCEngineHandler pattern: worker is ~10 lines, all complexity inside WebLLM"
    - "MLCEngineInterface as engine type (not MLCEngine) — CreateWebWorkerMLCEngine returns WebWorkerMLCEngine"
    - "chatCompletion() with stream: false for non-streaming typed response"
    - "response_format: { type: 'json_object', schema: JSON.stringify(schema) } for XGrammar constrained generation"

key-files:
  created:
    - src/ai/llm-worker.ts (new WebLLM worker, replaces src/worker/llm-worker.ts for AI use)
  modified:
    - src/ai/adapters/browser.ts (complete rewrite to WebLLM)
    - src/storage/ai-settings.ts (added selectedModelId field)
    - src/ui/components/AISettingsPanel.tsx (model selector added)
    - src/ui/layout/layout.css (ai-settings-field, ai-settings-hint classes)
    - src/ui/signals/store.ts (setSelectedLLMModel, hydrate selectedModelId on READY)
    - package.json / pnpm-lock.yaml (@mlc-ai/web-llm added)

key-decisions:
  - "WebLLM uses MLCEngineInterface (not MLCEngine) — CreateWebWorkerMLCEngine returns WebWorkerMLCEngine which implements MLCEngineInterface"
  - "chatCompletion() with stream: false used instead of chat.completions.create() to get typed ChatCompletion response"
  - "@huggingface/transformers kept — still required for embedding-worker.ts (semantic search MiniLM embeddings)"
  - "src/ai/llm-worker.ts is the new worker path; old src/worker/llm-worker.ts kept (still used by legacy llm-bridge.ts code)"
  - "Model selection change takes effect on next activate — no live hot-swap (requires re-download for new model)"

patterns-established:
  - "WebLLM worker pattern: import WebWorkerMLCEngineHandler, create handler, wire self.onmessage"
  - "BrowserAdapter constructor accepts modelId string — store reads state.llmModelId or DEFAULT_MODEL_ID"
  - "setSelectedLLMModel() updates both reactive state and persisted settings atomically"

requirements-completed: [AIRV-01, AIRV-02, AIGN-01, AIRV-05]

# Metrics
duration: 10min
completed: 2026-02-26
---

# Phase 6 Plan 03: WebLLM Migration Summary

**@mlc-ai/web-llm replaces Transformers.js+SmolLM2 with Llama-3.2-3B via WebGPU + XGrammar JSON constraints and a 1B/3B/3.8B model selector in AI Settings**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-02-26T01:30:20Z
- **Completed:** 2026-02-26T01:39:55Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Replaced Transformers.js SmolLM2 with @mlc-ai/web-llm 0.2.81, enabling structured JSON via XGrammar constrained generation
- New 10-line LLM worker at src/ai/llm-worker.ts using WebWorkerMLCEngineHandler
- BrowserAdapter fully rewritten to use WebWorkerMLCEngine with OpenAI-compatible chat API
- Model selector dropdown added to AI Settings panel with VRAM guidance (1B ~900MB, 3B ~2.2GB, 3.8B ~3.7GB)
- Model selection persisted across sessions via selectedModelId in AISettings

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace Transformers.js with WebLLM in llm-worker + browser adapter** - `fd29040` (feat)
2. **Task 2: Model selector in AI Settings panel + settings persistence update** - `2a55ad1` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/ai/llm-worker.ts` - New WebLLM worker (WebWorkerMLCEngineHandler, ~10 lines)
- `src/ai/adapters/browser.ts` - Complete rewrite: WebWorkerMLCEngine, WEBLLM_MODELS, DEFAULT_MODEL_ID, response_format support
- `src/storage/ai-settings.ts` - Added selectedModelId?: string field to AISettings
- `src/ui/components/AISettingsPanel.tsx` - Model selector dropdown, removed SmolLM2 references
- `src/ui/layout/layout.css` - Added .ai-settings-field and .ai-settings-hint CSS classes
- `src/ui/signals/store.ts` - Added setSelectedLLMModel(), selectedModelId hydration on READY, activateBrowserLLM passes model ID
- `package.json / pnpm-lock.yaml` - @mlc-ai/web-llm@0.2.81 added; @huggingface/transformers kept for embeddings

## Decisions Made
- Used `MLCEngineInterface` as the engine type (not `MLCEngine`) since `CreateWebWorkerMLCEngine` returns `WebWorkerMLCEngine` which implements the interface
- Used `chatCompletion()` with `stream: false` instead of `chat.completions.create()` to get a typed non-streaming `ChatCompletion` response with predictable `.choices` property
- Kept `@huggingface/transformers` because `src/search/embedding-worker.ts` still uses it for MiniLM semantic search embeddings — only the LLM path migrated
- Old `src/worker/llm-worker.ts` left in place (not deleted) since `llm-bridge.ts` still references it — cleanup deferred to avoid breaking the legacy path

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Kept @huggingface/transformers for embedding-worker.ts**
- **Found during:** Task 1 (install/remove packages)
- **Issue:** Plan said remove @huggingface/transformers, but src/search/embedding-worker.ts uses it for MiniLM semantic search embeddings — removing it would break search
- **Fix:** Re-added @huggingface/transformers after removing it; both packages now coexist
- **Files modified:** package.json, pnpm-lock.yaml
- **Verification:** TypeScript compilation passes, no import errors in embedding-worker.ts
- **Committed in:** fd29040

**2. [Rule 1 - Bug] Fixed WebLLM type mismatch: MLCEngine vs MLCEngineInterface**
- **Found during:** Task 1 (TypeScript verification)
- **Issue:** Plan used `MLCEngine` as type but `CreateWebWorkerMLCEngine` returns `WebWorkerMLCEngine` which only implements `MLCEngineInterface`
- **Fix:** Changed engine type from `MLCEngine` to `MLCEngineInterface`; used `chatCompletion()` instead of `chat.completions.create()` for typed non-streaming response
- **Files modified:** src/ai/adapters/browser.ts
- **Verification:** TypeScript passes, no type errors in browser.ts
- **Committed in:** fd29040

---

**Total deviations:** 2 auto-fixed (1 blocking dependency, 1 type bug)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
- WebLLM's `@mlc-ai/web-tokenizers` and `@mlc-ai/web-runtime` type dependencies produce errors in node_modules `.d.ts` files — these are pre-existing WebLLM library issues, not caused by our code
- Pre-existing `VoiceCapture.tsx` SpeechRecognition type errors unrelated to this plan

## User Setup Required
None - no external service configuration required. WebLLM models download from CDN on first activation.

## Next Phase Readiness
- WebLLM engine ready for structured JSON generation in review analysis (AIRV-01, AIRV-02)
- BrowserAdapter.execute() now accepts `jsonSchema` via AIRequest extension for XGrammar-constrained output
- Model selector allows users to tune VRAM vs accuracy trade-off before triggering review briefing
- NOTE: Old src/worker/llm-worker.ts still exists and references @huggingface/transformers; cleanup needed when llm-bridge.ts is retired

---
*Phase: 06-review-pre-analysis*
*Completed: 2026-02-26*
