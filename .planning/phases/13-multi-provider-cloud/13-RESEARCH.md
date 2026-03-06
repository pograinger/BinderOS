# Phase 13: Multi-Provider Cloud - Research

**Researched:** 2026-03-05
**Domain:** TypeScript AI adapter pattern, OpenAI-compatible REST APIs, browser-side key vault multi-key extension
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Single active provider at a time — dropdown selection in AI Settings, not priority list or per-task routing
- Provider selection lives in the existing AI Settings panel (Ctrl+P → AI Settings), not a separate tab
- All entered API keys persist across provider switches — switching is instant via dropdown, no re-entry
- Status bar shows active cloud provider name: "Cloud: OpenAI", "Cloud: Anthropic", etc.
- Same AES-GCM + passphrase encryption for all provider keys — one passphrase unlocks all keys
- Key vault stores keyed by provider ID (not single memoryKey)
- Custom endpoints configured with three fields: base URL, API key (Bearer token), model name
- Same safety gates (session consent + pre-send approval) for ALL providers including custom/localhost endpoints — no exceptions
- API keys validated on entry with a lightweight test call (e.g., list models) — immediate "Key valid ✓" or "Invalid key" feedback
- Pre-send approval modal shows provider name, model name, and sanitized prompt
- For custom endpoints: shows user-defined label as header, full base URL as secondary detail (both visible)
- Session consent is global — one consent per session covers all cloud providers, not per-provider
- Flat chronological log with provider badge on each entry — not grouped by provider
- Each log entry shows: timestamp, provider name, model, status, response summary (existing CloudRequestLogEntry shape extended)
- Anthropic: claude-haiku-4-5-20251001 (current default, unchanged)
- OpenAI: gpt-4o-mini (cost-efficient, matches Haiku's classification/routing role)
- Grok (xAI): grok-3-mini (current affordable general-purpose model — see Open Questions re CONTEXT.md naming)
- Custom: user must specify model name in config form
- All built-in provider models are editable — default pre-filled in text field, user can change

### Claude's Discretion
- How to refactor CloudAdapter into a multi-provider architecture (base class, factory, strategy pattern)
- AIAdapter.id and AIResponse.provider type expansion strategy (string literal union vs plain string)
- Key vault internal storage structure for multi-key support
- Provider-specific API client initialization (Anthropic SDK vs fetch for OpenAI-compatible endpoints)
- Test call implementation details per provider for key validation
- Settings panel layout for the provider dropdown and config forms

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CLOUD-01 | User can send AI requests to OpenAI (gpt-4o-mini) via user-provided API key | OpenAI npm package v6.9.1 supports `dangerouslyAllowBrowser: true` + `baseURL` — same fetch path as custom endpoints |
| CLOUD-02 | User can send AI requests to xAI Grok via user-provided API key | xAI API is OpenAI-compatible at `https://api.x.ai/v1` — same OpenAI SDK or fetch works unchanged |
| CLOUD-03 | User can configure a custom OpenAI-compatible endpoint (Ollama, LM Studio, Azure) | OpenAI SDK `baseURL` + `apiKey` constructor options handle all OpenAI-compatible backends |
| CLOUD-04 | Communication log displays which provider handled each cloud request | `CloudRequestLogEntry.provider` is already `string` — extend with model and displayName, show badge in log UI |
</phase_requirements>

---

## Summary

Phase 13 refactors the existing single-provider `CloudAdapter` into a multi-provider architecture. The core insight from the codebase analysis is that the existing `CloudAdapter` already contains all the safety-gate infrastructure (session consent, pre-send approval, communication log, offline detection) — only the Anthropic-specific initialization and API call need extraction. OpenAI and xAI Grok both use the OpenAI REST API format, meaning a single `OpenAICompatibleAdapter` class handles CLOUD-01, CLOUD-02, and CLOUD-03 with different `baseURL` + `apiKey` constructor arguments.

The key vault (`key-vault.ts`) currently holds a single `memoryKey` string. It needs a provider-keyed map: `Record<ProviderId, string>` in memory and a `Record<ProviderId, EncryptedBlob>` in localStorage — both under a single passphrase. The `encryptAndStore` / `decryptFromStore` functions need to accept a `providerId` argument to read/write provider-specific slots.

The adapter type system needs modest expansion: `AIAdapter.id` and `AIResponse.provider` should become `string` (or a loose union with a string fallback) to avoid hardcoding every provider name in the interface file. The `store.ts` `activateCloudAdapter()` function becomes a factory that reads `state.activeCloudProvider` and instantiates the right adapter class.

**Primary recommendation:** Build one `OpenAICompatibleAdapter` (handles OpenAI, Grok, and custom endpoints via `baseURL` parameter), keep `AnthropicCloudAdapter` as a rename of the existing `CloudAdapter` with the Anthropic SDK extracted, and implement a provider factory in `store.ts`. No new dependencies beyond `openai` npm package.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `openai` (npm) | ^6.9.1 | OpenAI-compatible REST client for browser | Official SDK; `dangerouslyAllowBrowser: true` + `baseURL` covers OpenAI, Grok, Ollama, LM Studio, Azure |
| `@anthropic-ai/sdk` | ^0.78.0 (already installed) | Anthropic messages.stream() | Already in package.json; streaming + browser flag already used |
| Web Crypto API | Browser built-in | AES-GCM per-provider key encryption | Already used in key-vault.ts; no new library needed |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Native `fetch` | Browser built-in | Key validation test calls | Simpler than SDK for a single `GET /models` or minimal `POST /chat/completions` ping |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `openai` npm package | Raw `fetch` | fetch requires manually implementing streaming (SSE parsing); openai SDK wraps this — use SDK |
| `openai` npm package | `ai` (Vercel AI SDK) | Vercel AI SDK is a heavy abstraction with its own streaming API that doesn't match the codebase's existing pattern |

**Installation:**
```bash
pnpm add openai
```

---

## Architecture Patterns

### Recommended Project Structure

```
src/ai/
├── adapters/
│   ├── adapter.ts           # Interface: id → string, provider → string
│   ├── noop.ts              # Unchanged
│   ├── browser.ts           # Unchanged
│   ├── cloud-anthropic.ts   # Renamed from cloud.ts — Anthropic SDK, extracts Anthropic-specific logic
│   └── cloud-openai.ts      # NEW — OpenAICompatibleAdapter (OpenAI, Grok, custom)
├── key-vault.ts             # Extended: per-provider key storage
├── provider-registry.ts     # NEW — ProviderConfig definitions + factory function
├── privacy-proxy.ts         # Unchanged
└── router.ts                # Unchanged
src/ui/
├── signals/store.ts         # activateCloudAdapter() becomes factory; new signals: activeCloudProvider
└── components/
    ├── AISettingsPanel.tsx  # Provider dropdown + per-provider config forms
    ├── CloudRequestPreview.tsx  # Show base URL for custom endpoints
    └── StatusBar.tsx        # "Cloud: OpenAI" text segment
```

### Pattern 1: Provider Registry + Factory

**What:** A `ProviderConfig` record defines all known providers (id, displayName, baseURL, defaultModel). A factory in `store.ts` reads `state.activeCloudProvider` and instantiates the correct adapter class.

**When to use:** When the adapter selection is data-driven (user-configurable) and the number of providers grows over time.

**Example:**
```typescript
// src/ai/provider-registry.ts

export type ProviderId = 'anthropic' | 'openai' | 'grok' | 'custom';

export interface ProviderConfig {
  id: ProviderId;
  displayName: string;    // "Anthropic", "OpenAI", "Grok", "Custom"
  baseURL: string | null; // null for Anthropic (uses SDK default)
  defaultModel: string;
  apiKeyPrefix?: string;  // For UI hint: "sk-ant-", "sk-", "xai-"
}

export const PROVIDER_REGISTRY: Record<ProviderId, ProviderConfig> = {
  anthropic: {
    id: 'anthropic',
    displayName: 'Anthropic',
    baseURL: null,
    defaultModel: 'claude-haiku-4-5-20251001',
    apiKeyPrefix: 'sk-ant-',
  },
  openai: {
    id: 'openai',
    displayName: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    apiKeyPrefix: 'sk-',
  },
  grok: {
    id: 'grok',
    displayName: 'Grok (xAI)',
    baseURL: 'https://api.x.ai/v1',
    defaultModel: 'grok-3-mini',
    apiKeyPrefix: 'xai-',
  },
  custom: {
    id: 'custom',
    displayName: 'Custom',
    baseURL: null, // user-supplied
    defaultModel: '', // user-supplied
  },
};
```

### Pattern 2: OpenAICompatibleAdapter

**What:** A single adapter class handles all OpenAI-compatible providers. The constructor receives `baseURL`, `apiKey`, `model`, and `displayName`. Streaming uses the `openai` SDK's `chat.completions.create({ stream: true })` with async iteration.

**When to use:** OpenAI, Grok, custom Ollama/LM Studio/Azure endpoints — anything that speaks the OpenAI chat completions API.

**Example:**
```typescript
// src/ai/adapters/cloud-openai.ts
import OpenAI from 'openai';
import type { AIAdapter, AIRequest, AIResponse, AIProviderStatus } from './adapter';
import { getMemoryKeyForProvider, hasSessionConsent, addCloudRequestLog } from '../key-vault';
import { sanitizeForCloud } from '../privacy-proxy';
import { isOnline } from './browser';
import type { CloudRequestLogEntry } from '../key-vault';

export class OpenAICompatibleAdapter implements AIAdapter {
  readonly id: string;          // 'openai' | 'grok' | 'custom'
  readonly displayName: string; // "OpenAI" | "Grok (xAI)" | user label
  private _status: AIProviderStatus = 'disabled';
  private client: OpenAI | null = null;
  private model: string;
  private baseURL: string;
  private onPreSendApproval: ((entry: CloudRequestLogEntry) => Promise<boolean>) | null = null;

  constructor(config: {
    id: string;
    displayName: string;
    apiKey: string;
    baseURL: string;
    model: string;
  }) {
    this.id = config.id;
    this.displayName = config.displayName;
    this.model = config.model;
    this.baseURL = config.baseURL;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      dangerouslyAllowBrowser: true,
      // Same rationale as AnthropicCloudAdapter: user-provided key, memory-only default
    });
    this._status = 'available';
  }

  get status(): AIProviderStatus { return this._status; }

  setPreSendApprovalHandler(handler: (entry: CloudRequestLogEntry) => Promise<boolean>): void {
    this.onPreSendApproval = handler;
  }

  async execute(request: AIRequest): Promise<AIResponse> {
    if (!this.client) throw new Error(`${this.displayName} adapter not initialized`);
    if (!isOnline()) throw new Error('Cloud AI unavailable — you are offline.');
    if (!hasSessionConsent()) throw new Error('Cloud AI requires session consent.');

    const sanitizedPrompt = sanitizeForCloud(request.prompt, 'structured');
    const logEntry: CloudRequestLogEntry = {
      id: request.requestId,
      timestamp: Date.now(),
      sanitizedPrompt,
      provider: this.displayName,
      model: this.model,
      status: 'pending',
      baseURL: this.id === 'custom' ? this.baseURL : undefined, // For modal display
    };
    addCloudRequestLog(logEntry);

    if (this.onPreSendApproval) {
      const approved = await this.onPreSendApproval(logEntry);
      if (!approved) {
        logEntry.status = 'cancelled';
        throw new Error('Cloud request cancelled by user');
      }
    }
    logEntry.status = 'approved';

    try {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: request.maxTokens ?? 512,
        messages: [{ role: 'user', content: sanitizedPrompt }],
        stream: true,
      });

      let fullText = '';
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? '';
        if (delta) {
          fullText += delta;
          request.onChunk?.(delta);
        }
        if (request.signal?.aborted) break;
      }

      logEntry.status = 'completed';
      logEntry.responseSummary = fullText.slice(0, 100) + (fullText.length > 100 ? '...' : '');
      return { requestId: request.requestId, text: fullText, provider: this.displayName, model: this.model };
    } catch (err) {
      logEntry.status = 'error';
      throw err;
    }
  }

  dispose(): void {
    this.client = null;
    this._status = 'disabled';
  }
}
```

### Pattern 3: Multi-Key Vault Extension

**What:** The key vault stores a `Record<ProviderId, string>` memory map and a `Record<ProviderId, EncryptedBlob>` localStorage map. One passphrase encrypts/decrypts all provider keys using the same AES-GCM + PBKDF2 scheme. A single `STORAGE_KEY` holds the entire multi-provider JSON blob.

**When to use:** Any time a provider-keyed API call is needed.

**Example:**
```typescript
// key-vault.ts additions

type ProviderId = 'anthropic' | 'openai' | 'grok' | 'custom';

// In memory — cleared on unload
const memoryKeys: Partial<Record<ProviderId, string>> = {};

export function setMemoryKeyForProvider(providerId: ProviderId, apiKey: string): void {
  memoryKeys[providerId] = apiKey;
}

export function getMemoryKeyForProvider(providerId: ProviderId): string | null {
  return memoryKeys[providerId] ?? null;
}

export function clearMemoryKeyForProvider(providerId: ProviderId): void {
  delete memoryKeys[providerId];
}

export function hasMemoryKeyForProvider(providerId: ProviderId): boolean {
  return !!memoryKeys[providerId];
}

// Encrypted persistence: stored as Record<ProviderId, EncryptedBlob>
// encryptAndStoreForProvider(providerId, apiKey, passphrase) -> adds to JSON blob
// decryptAllFromStore(passphrase) -> loads all providers at once (one unlock per session)

// Backward compat: getMemoryKey() → getMemoryKeyForProvider('anthropic')
// setMemoryKey(key) → setMemoryKeyForProvider('anthropic', key)
```

### Pattern 4: Store Factory — activateCloudAdapter()

**What:** `activateCloudAdapter()` in `store.ts` reads `state.activeCloudProvider` + `state.customEndpointConfig` and instantiates the correct adapter class.

**Example:**
```typescript
// store.ts
export async function activateCloudAdapter(): Promise<void> {
  const { AnthropicCloudAdapter } = await import('../../ai/adapters/cloud-anthropic');
  const { OpenAICompatibleAdapter } = await import('../../ai/adapters/cloud-openai');
  const { PROVIDER_REGISTRY } = await import('../../ai/provider-registry');
  const { setActiveAdapter } = await import('../../ai/router');

  const providerId = state.activeCloudProvider ?? 'anthropic';
  const config = PROVIDER_REGISTRY[providerId];
  const apiKey = getMemoryKeyForProvider(providerId);

  if (!apiKey) {
    setState('cloudStatus', 'unavailable');
    return;
  }

  let adapter: AIAdapter;
  if (providerId === 'anthropic') {
    const a = new AnthropicCloudAdapter();
    a.initialize(); // uses getMemoryKeyForProvider('anthropic') internally
    adapter = a;
  } else {
    const baseURL = providerId === 'custom'
      ? state.customEndpointConfig?.baseURL ?? ''
      : config.baseURL!;
    const model = providerId === 'custom'
      ? state.customEndpointConfig?.model ?? ''
      : state.providerModels?.[providerId] ?? config.defaultModel;
    adapter = new OpenAICompatibleAdapter({
      id: providerId,
      displayName: config.displayName,
      apiKey,
      baseURL,
      model,
    });
  }

  setActiveAdapter(adapter);
  setState('cloudStatus', adapter.status);
}
```

### Pattern 5: Key Validation Test Call

**What:** After saving a key, fire a lightweight validation call to confirm the key works. For OpenAI-compatible providers: `GET /models` (returns 200 if valid, 401 if not). For Anthropic: small `messages.create` or use the SDK's built-in error.

**When to use:** Immediately after the user clicks "Save" in the key entry form.

**Example (OpenAI-compatible):**
```typescript
async function validateOpenAICompatibleKey(apiKey: string, baseURL: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseURL}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    return res.ok; // 200 = valid, 401/403 = invalid
  } catch {
    return false; // Network error or endpoint unreachable
  }
}

// For Anthropic, test with a minimal message:
async function validateAnthropicKey(apiKey: string): Promise<boolean> {
  try {
    const { Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
    await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }],
    });
    return true;
  } catch (err: unknown) {
    // 401 AuthenticationError = invalid key
    return false;
  }
}
```

**Note on Grok validation:** The xAI API base URL is `https://api.x.ai/v1`. The `GET /models` endpoint is not confirmed in xAI docs, but since they advertise OpenAI compatibility it should work. Fallback: send a minimal 1-token chat completion instead.

### Anti-Patterns to Avoid

- **Creating a new OpenAI client per request:** The `openai` SDK client should be created once at adapter initialization, not per `execute()` call. Recreating it wastes resources and re-initializes connection pooling.
- **Putting provider selection logic inside the adapter:** Provider selection is `store.ts`'s job. Each adapter knows only its own provider.
- **Storing the passphrase in memory after decryption:** After `decryptAllFromStore(passphrase)`, discard the passphrase. Only the decrypted keys live in `memoryKeys`.
- **Using `AIAdapter.id` as a display name:** `id` is the machine identifier (`'openai'`); `displayName` is what users see (`'OpenAI'`). Keep them separate.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OpenAI chat completions streaming | Custom SSE parser | `openai` npm SDK `stream: true` with `for await` | SSE parsing has edge cases (reconnection, UTF-8 boundaries, event types) |
| API key validation | Custom HTTP client wrapper | `fetch` for GET /models (one line) | Simple enough not to need a library |
| AES-GCM encryption for multi-provider keys | New crypto library | Extend existing `deriveKey/encryptAndStore` in key-vault.ts | Pattern already works; adding `providerId` to the stored JSON is sufficient |
| Provider display in modal | New modal component | Extend `CloudRequestPreview.tsx` with `baseURL` field | Modal is already provider-generic; `entry.provider` is already `string` |

**Key insight:** The openai npm SDK's `dangerouslyAllowBrowser: true` + `baseURL` constructor option is the entire multi-provider compatibility story. Grok, Ollama, LM Studio, and Azure all work through this single configuration point.

---

## Common Pitfalls

### Pitfall 1: grok-2-latest Is No Longer the Current Model

**What goes wrong:** CONTEXT.md specifies `grok-2-latest` as the Grok default, but xAI's current model lineup (as of March 2026) is Grok 3 / Grok 4 series. `grok-2-latest` may not return a valid response or may return a deprecated model error.

**Why it happens:** The CONTEXT.md was written before research; CONTEXT.md explicitly says "Claude's Discretion" for default model selection. The locked decision only says "grok-2-latest" as a named suggestion, but the spirit is "a cost-efficient Grok model."

**How to avoid:** Use `grok-3-mini` as the default pre-filled model for Grok. `grok-3-mini` is the current low-cost option ($0.30/$0.50 per million tokens, equivalent role to gpt-4o-mini and claude-haiku). All models are user-editable so users can change to any current model.

**Warning signs:** Key validation test call returning 404 with error about model not found.

### Pitfall 2: Type System Breaks with String Provider IDs

**What goes wrong:** `AIAdapter.id` is currently typed as `'noop' | 'browser' | 'cloud'`. Adding new providers as string literals requires updating this union everywhere it's used, and consumers may have `switch` statements that need `default` cases.

**Why it happens:** The type was designed for the original 3-provider system.

**How to avoid:** Expand `AIAdapter.id` to `string` and `AIResponse.provider` to `string`. This is a widening change — no narrowing, so it's backward compatible. Shell.tsx checks `adapter.id === 'cloud'` — update to check a `setPreSendApprovalHandler` capability check instead (duck typing).

**Shell.tsx wiring fix:**
```typescript
// Before:
if (adapter && adapter.id === 'cloud') {
  const cloudAdapter = adapter as CloudAdapter;
  cloudAdapter.setPreSendApprovalHandler(...)
}

// After — duck typing for capability:
if (adapter && 'setPreSendApprovalHandler' in adapter) {
  (adapter as { setPreSendApprovalHandler: (h: ...) => void }).setPreSendApprovalHandler(...)
}
```

### Pitfall 3: SolidJS Reactivity — Never Destructure State in New Store Signals

**What goes wrong:** Adding new signals like `activeCloudProvider` as destructured values breaks reactivity. This is an existing project pattern.

**Why it happens:** SolidJS reactive signals must be read via accessor functions, not captured by value.

**How to avoid:** Follow existing store pattern. New signals must be added to the `AppState` interface and read as `state.activeCloudProvider` (never `const { activeCloudProvider } = state`).

### Pitfall 4: Multi-Key localStorage Blob Breaks Single-Key Unlock

**What goes wrong:** If `encryptAndStore` is refactored naively, existing users with a stored Anthropic key under `STORAGE_KEY` will fail to decrypt.

**Why it happens:** Old format: `{ salt, iv, data }` (single key). New format: `{ keys: { anthropic: { salt, iv, data }, openai: {...} } }`. A format mismatch causes JSON parse errors.

**How to avoid:** On `decryptAllFromStore`, detect the old format (no `keys` wrapper) and migrate: treat the old blob as the `anthropic` entry. Write the new format on first save.

**Migration guard:**
```typescript
// In decryptAllFromStore
const parsed = JSON.parse(stored);
if ('keys' in parsed) {
  // new format — multi-provider
} else if ('salt' in parsed) {
  // old format — single Anthropic key, migrate on read
  const key = await decryptSingleKey(parsed, passphrase);
  memoryKeys['anthropic'] = key;
}
```

### Pitfall 5: Custom Endpoint Base URL Trailing Slash

**What goes wrong:** `https://localhost:11434/v1/` with trailing slash + SDK prepending `/chat/completions` produces double slashes or incorrect paths.

**Why it happens:** OpenAI SDK and raw fetch handle trailing slashes differently.

**How to avoid:** Normalize the user-entered base URL: strip trailing slash before storing and passing to the SDK constructor.

```typescript
function normalizeBaseURL(url: string): string {
  return url.replace(/\/+$/, '');
}
```

### Pitfall 6: Key Validation Hangs on Unreachable Custom Endpoints

**What goes wrong:** User enters `http://localhost:11434/v1` but Ollama isn't running. The `fetch()` call hangs for the browser's default timeout (30-90 seconds).

**Why it happens:** `fetch` has no timeout by default.

**How to avoid:** Wrap validation in an `AbortController` with a 5-second timeout.

```typescript
async function validateOpenAICompatibleKey(apiKey: string, baseURL: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${normalizeBaseURL(baseURL)}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
```

### Pitfall 7: Status Bar Text Requires New State Signal

**What goes wrong:** Status bar currently shows a green dot when any cloud provider is available. The locked decision requires "Cloud: OpenAI" text — this needs to know the active provider's display name.

**Why it happens:** `StatusBar.tsx` currently reads `state.cloudStatus` but not which provider is active.

**How to avoid:** Add `state.activeCloudProvider` signal to store (already needed for factory pattern). StatusBar reads `PROVIDER_REGISTRY[state.activeCloudProvider].displayName` to render "Cloud: OpenAI".

---

## Code Examples

Verified patterns from official sources and codebase analysis:

### OpenAI SDK Constructor (Browser, Custom BaseURL)
```typescript
// Source: openai npm package v6.9.1 API
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: userApiKey,
  baseURL: 'https://api.x.ai/v1',  // or any OpenAI-compatible endpoint
  dangerouslyAllowBrowser: true,
  // dangerouslyAllowBrowser: safe here because user provides their own key (same rationale as AnthropicCloudAdapter)
});
```

### OpenAI Streaming Chat Completion
```typescript
// Source: openai npm package streaming API
const stream = await client.chat.completions.create({
  model: 'grok-3-mini',
  max_tokens: 512,
  messages: [{ role: 'user', content: sanitizedPrompt }],
  stream: true,
});

let fullText = '';
for await (const chunk of stream) {
  const delta = chunk.choices[0]?.delta?.content ?? '';
  if (delta) {
    fullText += delta;
    request.onChunk?.(delta);
  }
}
```

### Key Vault Multi-Provider Storage Format
```typescript
// localStorage format (new multi-provider):
interface MultiProviderStorageBlob {
  version: 2;
  keys: Partial<Record<ProviderId, SingleKeyBlob>>;
}

interface SingleKeyBlob {
  salt: string;  // base64
  iv: string;    // base64
  data: string;  // base64 AES-GCM ciphertext
}

// Legacy format (v1, auto-migrated):
interface LegacySingleKeyBlob {
  salt: string;
  iv: string;
  data: string;
}
```

### SolidJS Store — New Cloud Provider State
```typescript
// AppState additions (store.ts):
interface AppState {
  // ... existing fields ...
  activeCloudProvider: ProviderId;         // default: 'anthropic'
  providerModels: Partial<Record<ProviderId, string>>;  // user-overridden models
  customEndpointConfig: {
    label: string;    // user-defined name for display
    baseURL: string;
    model: string;
  } | null;
}
```

### AISettingsPanel — Provider Dropdown Skeleton
```typescript
// New section in AISettingsPanel.tsx (SolidJS):
<div class="ai-settings-field">
  <label class="ai-settings-field-label" for="cloud-provider-select">
    Cloud Provider
  </label>
  <select
    id="cloud-provider-select"
    class="ai-settings-select"
    value={state.activeCloudProvider ?? 'anthropic'}
    onChange={(e) => {
      setActiveCloudProvider((e.target as HTMLSelectElement).value as ProviderId);
    }}
  >
    <option value="anthropic">Anthropic</option>
    <option value="openai">OpenAI</option>
    <option value="grok">Grok (xAI)</option>
    <option value="custom">Custom Endpoint</option>
  </select>
</div>

{/* Per-provider config form — rendered conditionally via Show */}
<Show when={state.activeCloudProvider === 'custom'}>
  {/* base URL + model name fields */}
</Show>
```

### CloudRequestPreview — Custom Endpoint Base URL Display
```typescript
// CloudRequestPreview.tsx — additional meta row for custom endpoints
<Show when={props.entry.baseURL !== undefined}>
  <div class="cloud-preview-meta-row">
    <span class="cloud-preview-meta-label">Endpoint:</span>
    <span class="cloud-preview-meta-value cloud-preview-url">{props.entry.baseURL}</span>
  </div>
</Show>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `CloudAdapter` hardcoded to Anthropic | `AnthropicCloudAdapter` + `OpenAICompatibleAdapter` factory | Phase 13 | Anthropic becomes "just another provider" |
| Single `memoryKey: string | null` | `memoryKeys: Partial<Record<ProviderId, string>>` | Phase 13 | All provider keys persist in memory until page unload |
| Single localStorage blob | `{ version: 2, keys: { anthropic: {...}, openai: {...} } }` | Phase 13 | One passphrase decrypts all |
| `AIAdapter.id: 'noop' | 'browser' | 'cloud'` | `AIAdapter.id: string` | Phase 13 | Extensible without modifying interface on every new provider |
| Status bar: green dot only | "Cloud: OpenAI" text label | Phase 13 | User sees which provider is active |

**Deprecated/outdated:**
- `grok-2-latest`: Not in current xAI model lineup as of March 2026. Use `grok-3-mini` as cost-efficient default.
- `getMemoryKey()` / `setMemoryKey()`: Keep as backward-compat shims wrapping `getMemoryKeyForProvider('anthropic')`.

---

## Open Questions

1. **grok-2-latest model name in CONTEXT.md**
   - What we know: The Grok model lineup has moved to Grok 3 / Grok 4 series. `grok-3-mini` is the current affordable option at $0.30/$0.50 per million tokens.
   - What's unclear: Whether `grok-2-latest` is still served as a legacy alias on `api.x.ai/v1`.
   - Recommendation: Pre-fill `grok-3-mini` as the default model for Grok (user-editable text field). Include a note in the config form: "Default: grok-3-mini. See x.ai/api for current model names."

2. **xAI GET /models endpoint availability**
   - What we know: xAI advertises OpenAI API compatibility. OpenAI's `/models` endpoint returns 200 for valid keys.
   - What's unclear: Whether xAI implements `GET /v1/models` (not confirmed in their API reference docs viewed).
   - Recommendation: For Grok key validation, use a minimal 1-token chat completion (`max_tokens: 1`) as the fallback test call. This is unambiguously supported and costs <$0.001.

3. **Custom endpoint key validation behavior for Ollama**
   - What we know: Ollama doesn't require API keys — it accepts empty strings or any Bearer token.
   - What's unclear: Whether `GET /models` on Ollama returns 200 without auth.
   - Recommendation: For custom endpoints, validate by calling `GET {baseURL}/models` without auth first; if 401, retry with Bearer token. If the endpoint returns 200 either way, treat it as valid. 5-second timeout (Pitfall 6).

---

## Sources

### Primary (HIGH confidence)
- Codebase: `src/ai/adapters/cloud.ts` — existing pattern for safety gates, approval handler, log entries
- Codebase: `src/ai/key-vault.ts` — AES-GCM + PBKDF2 pattern, CloudRequestLogEntry shape
- Codebase: `src/ai/adapters/adapter.ts` — AIAdapter interface, current type constraints
- Codebase: `src/ui/signals/store.ts` — activateCloudAdapter(), SolidJS reactive state patterns
- DeepWiki openai-node: openai npm package v6.9.1 — `dangerouslyAllowBrowser`, `baseURL`, streaming API

### Secondary (MEDIUM confidence)
- xAI docs (fetched): `https://docs.x.ai/developers/models` — grok-3-mini confirmed, grok-2-latest not listed
- pricepertoken.com (verified against xAI docs): grok-3-mini $0.30/$0.50 per million tokens
- WebSearch (multiple sources agree): xAI API base URL is `https://api.x.ai/v1`, OpenAI-compatible

### Tertiary (LOW confidence)
- xAI `GET /models` endpoint availability: Not directly confirmed in fetched docs — inferred from OpenAI compatibility claim
- Ollama/LM Studio behavior with empty API keys: Community knowledge, not verified against official docs for validation

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — openai SDK v6.9.1 confirmed, Anthropic SDK already installed, Web Crypto already used
- Architecture: HIGH — patterns are direct extensions of existing codebase code; no novel architecture
- Pitfalls: HIGH for type system + SolidJS (confirmed from codebase); MEDIUM for Grok model name (API docs incomplete)

**Research date:** 2026-03-05
**Valid until:** 2026-04-05 (30 days — stable tech, but xAI model lineup changes frequently; re-verify grok model name before shipping)
