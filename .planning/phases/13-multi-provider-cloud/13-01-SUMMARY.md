---
phase: 13-multi-provider-cloud
plan: "01"
subsystem: ai-infrastructure
tags: [cloud-ai, multi-provider, openai-compatible, key-vault, adapter-pattern]
dependency_graph:
  requires: []
  provides:
    - ProviderId type and PROVIDER_REGISTRY (4 providers)
    - OpenAICompatibleAdapter for OpenAI, Grok, custom endpoints
    - Per-provider key vault with v1-to-v2 migration
    - AnthropicCloudAdapter (renamed CloudAdapter)
    - Provider factory in store.activateCloudAdapter()
  affects:
    - src/ai/adapters/ (all cloud adapters)
    - src/ui/signals/store.ts (activateCloudAdapter factory)
    - src/ui/layout/Shell.tsx (duck-typing for approval handler)
tech_stack:
  added:
    - openai@6.27.0 (OpenAI SDK for OpenAI-compatible API)
  patterns:
    - OpenAI-compatible adapter pattern (single class handles 3 providers)
    - Per-provider encrypted key storage with v2 format migration
    - Duck-typing for setPreSendApprovalHandler (avoids import coupling)
    - Provider factory pattern in store for zero-restart provider switching
key_files:
  created:
    - src/ai/provider-registry.ts
    - src/ai/adapters/cloud-openai.ts
  modified:
    - src/ai/adapters/adapter.ts
    - src/ai/key-vault.ts
    - src/ai/adapters/cloud.ts
    - src/storage/ai-settings.ts
    - src/ui/signals/store.ts
    - src/types/messages.ts
    - src/ui/layout/Shell.tsx
decisions:
  - "OpenAI SDK used for OpenAI-compatible providers (not raw fetch) for streaming support"
  - "v2 key storage format uses per-provider encrypted entries; v1 migrated on first decryptAllFromStore call"
  - "AIAdapter.id and AIResponse.provider widened to string to avoid core interface churn"
  - "Duck-typing replaces CloudAdapter type-cast in Shell.tsx to support both adapter classes"
  - "activateCloudAdapter() reads activeCloudProvider from store state — zero-restart switching"
metrics:
  duration: "12 minutes"
  completed: "2026-03-06"
  tasks_completed: 2
  files_modified: 9
---

# Phase 13 Plan 01: Multi-Provider Cloud Adapter Infrastructure Summary

Multi-provider cloud AI backbone: OpenAI-compatible adapter, provider registry with 4 providers, per-provider encrypted key vault, and store factory for zero-restart provider switching.

## What Was Built

### Task 1: Provider Registry, Adapter Types, Key Vault, and Adapters

**`src/ai/provider-registry.ts`** (NEW)
- `ProviderId` type: `'anthropic' | 'openai' | 'grok' | 'custom'`
- `ProviderConfig` interface with `id`, `displayName`, `baseURL`, `defaultModel`, `apiKeyPrefix`
- `PROVIDER_REGISTRY` map with 4 entries: Anthropic (SDK default), OpenAI (`api.openai.com/v1`, `gpt-4o-mini`), Grok xAI (`api.x.ai/v1`, `grok-3-mini`), Custom (user-supplied)
- `normalizeBaseURL()` strips trailing slashes
- `validateProviderKey()` with Anthropic SDK path and fetch-based path for OpenAI-compatible providers; Grok fallback to chat completions POST if GET /models fails

**`src/ai/adapters/adapter.ts`** (modified)
- `AIAdapter.id` widened from union to `string`
- `AIResponse.provider` widened from union to `string`
- JSDoc updated to list all providers

**`src/ai/key-vault.ts`** (rewritten)
- `memoryKeys: Partial<Record<ProviderId, string>>` replaces single `memoryKey`
- `setMemoryKeyForProvider`, `getMemoryKeyForProvider`, `hasMemoryKeyForProvider`, `clearMemoryKeyForProvider`, `clearAllMemoryKeys` exports
- Backward-compat shims: `setMemoryKey/getMemoryKey/clearMemoryKey` delegate to `'anthropic'` slot
- `encryptAndStoreForProvider`: reads existing v2 blob, updates provider entry, writes back
- `decryptAllFromStore`: decrypts all providers, auto-migrates v1 (single Anthropic key) to in-memory map
- `encryptAndStore/decryptFromStore` backward-compat shims wrapping `'anthropic'` slot
- `CloudRequestLogEntry` extended with optional `baseURL` field for custom endpoint display

**`src/ai/adapters/cloud-openai.ts`** (NEW)
- `OpenAICompatibleAdapter` implements `AIAdapter`
- Constructor takes `{ id, displayName, apiKey, baseURL, model }` — single class handles OpenAI, Grok, custom
- All 4 safety gates: initialized, online, sessionConsent, pre-send approval
- Streaming via `client.chat.completions.create({ stream: true })` with `for await` loop
- `setPreSendApprovalHandler` method for Shell.tsx wiring
- `dispose()` nulls client and sets status disabled
- Pure module — no store imports

**`src/ai/adapters/cloud.ts`** (modified)
- `CloudAdapter` class renamed to `AnthropicCloudAdapter`
- `readonly displayName = 'Anthropic'` added
- `getMemoryKey()` replaced with `getMemoryKeyForProvider('anthropic')` in `initialize()`
- `provider` field in log entry and response changed from `'cloud'` to `'Anthropic'`
- Backward-compat export: `export { AnthropicCloudAdapter as CloudAdapter }`

### Task 2: Store Factory, AI Settings, and Shell Wiring

**`src/storage/ai-settings.ts`** (modified)
- New fields on `AISettings`: `activeCloudProvider?: string`, `providerModels?: Record<string, string>`, `customEndpointConfig?: { label, baseURL, model } | null`

**`src/ui/signals/store.ts`** (modified)
- `BinderState` extended with `activeCloudProvider`, `providerModels`, `customEndpointConfig`
- Defaults: `'anthropic'`, `{}`, `null`
- READY handler hydrates all 3 fields from `aiSettings` payload
- `setActiveCloudProvider()`: updates state + persists + re-activates adapter if cloud enabled
- `setProviderModel()`: updates per-provider model override + persists
- `setCustomEndpointConfig()`: updates custom config + persists
- `activateCloudAdapter()` refactored into provider factory:
  - Reads `state.activeCloudProvider`
  - For `'anthropic'`: creates `AnthropicCloudAdapter` and calls `initialize()`
  - For others: creates `OpenAICompatibleAdapter` with correct `baseURL`, `model`, `displayName`
  - Returns early with `cloudStatus: 'unavailable'` if no key in memory vault

**`src/types/messages.ts`** (modified)
- `AI_RESPONSE.provider` widened from `'noop' | 'browser' | 'cloud'` to `string`

**`src/ui/layout/Shell.tsx`** (modified)
- Removed `import type { CloudAdapter } from '../../ai/adapters/cloud'`
- Added `import type { CloudRequestLogEntry } from '../../ai/key-vault'`
- `createEffect` replaced type-cast (`adapter as CloudAdapter`) with duck-typing (`'setPreSendApprovalHandler' in adapter`)

## Deviations from Plan

None — plan executed exactly as written, with one minor auto-fix:

**[Rule 2 - Missing] Widen AI_RESPONSE.provider in messages.ts**
- Found during: Task 2 verification
- Issue: `AI_RESPONSE` payload still had `provider: 'noop' | 'browser' | 'cloud'` — would reject `'Anthropic'` string from new adapters
- Fix: widened to `string` matching the pattern from adapter.ts
- Files modified: `src/types/messages.ts`
- Commit: bc02351

## Verification

- TypeScript: passes (excluding pre-existing VoiceCapture/vite.config errors)
- `pnpm build`: succeeds — `cloud-openai` chunk confirms openai SDK bundled correctly
- All 4 providers in PROVIDER_REGISTRY verified
- All backward-compat shims verified (CloudAdapter alias, getMemoryKey/setMemoryKey, encryptAndStore/decryptFromStore)
- Duck-typing in Shell.tsx verified — no CloudAdapter import
- Provider factory verified — reads activeCloudProvider, instantiates correct adapter class

## Self-Check

Files created/exist:
- src/ai/provider-registry.ts: FOUND
- src/ai/adapters/cloud-openai.ts: FOUND

Commits:
- 5384447: feat(13-01): provider registry, multi-provider key vault, and OpenAI adapter — FOUND
- bc02351: feat(13-01): store factory, AI settings persistence, and Shell duck-typing — FOUND
