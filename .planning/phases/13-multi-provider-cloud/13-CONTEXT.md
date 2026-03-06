# Phase 13: Multi-Provider Cloud - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can send AI requests to OpenAI, Grok (xAI), or a custom OpenAI-compatible endpoint using their own API keys, with all existing safety gates (session consent, pre-send approval, communication log) preserved and provider identity visible throughout the flow. Anthropic adapter continues working identically — refactor is non-breaking.

</domain>

<decisions>
## Implementation Decisions

### Provider selection UX
- Single active provider at a time — dropdown selection in AI Settings, not priority list or per-task routing
- Provider selection lives in the existing AI Settings panel (Ctrl+P → AI Settings), not a separate tab
- All entered API keys persist across provider switches — switching is instant via dropdown, no re-entry
- Status bar shows active cloud provider name: "Cloud: OpenAI", "Cloud: Anthropic", etc.

### Key & endpoint config
- Same AES-GCM + passphrase encryption for all provider keys — one passphrase unlocks all keys
- Key vault stores keyed by provider ID (not single memoryKey)
- Custom endpoints configured with three fields: base URL, API key (Bearer token), model name
- Same safety gates (session consent + pre-send approval) for ALL providers including custom/localhost endpoints — no exceptions
- API keys validated on entry with a lightweight test call (e.g., list models) — immediate "Key valid ✓" or "Invalid key" feedback

### Pre-send approval modal
- Shows provider name, model name, and sanitized prompt — user sees exactly where data goes and which model handles it
- For custom endpoints: shows user-defined label as header, full base URL as secondary detail (both visible)
- Session consent is global — one consent per session covers all cloud providers, not per-provider

### Communication log
- Flat chronological list with provider badge on each entry — not grouped by provider
- Each entry shows: timestamp, provider name, model, status, response summary (existing CloudRequestLogEntry shape extended)

### Default models
- Anthropic: claude-haiku-4-5-20251001 (current default, unchanged)
- OpenAI: gpt-4o-mini (cost-efficient, matches Haiku's classification/routing role)
- Grok (xAI): grok-2-latest (current general-purpose model)
- Custom: user must specify model name in config form
- All built-in provider models are editable — default pre-filled in text field, user can change to any model the provider supports

### Claude's Discretion
- How to refactor CloudAdapter into a multi-provider architecture (base class, factory, strategy pattern — whatever fits the codebase)
- AIAdapter.id and AIResponse.provider type expansion strategy (string literal union vs plain string)
- Key vault internal storage structure for multi-key support
- Provider-specific API client initialization (Anthropic SDK vs fetch for OpenAI-compatible endpoints)
- Test call implementation details per provider for key validation
- Settings panel layout for the provider dropdown and config forms

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AIAdapter` interface (`src/ai/adapters/adapter.ts`): Already defines the pluggable contract — `execute()`, `dispose()`, `status`. Core interface stays, `id` type needs expansion.
- `CloudAdapter` (`src/ai/adapters/cloud.ts`): Pre-send approval flow, communication logging, session consent checks, offline detection — all reusable infrastructure. The Anthropic-specific parts (SDK import, model hardcode) need extraction.
- `key-vault.ts`: AES-GCM encryption, PBKDF2 key derivation, session consent tracking, CloudRequestLogEntry — all reusable. Needs multi-key extension.
- `router.ts`: Single-adapter dispatch via `dispatchAI()` — remains the same, just the active adapter changes by provider.
- `privacy-proxy.ts`: `sanitizeForCloud()` — provider-agnostic, works for any cloud endpoint.

### Established Patterns
- Pure modules: AI adapters import no store — all state passed by caller. New provider adapters must follow this.
- `AIRequest.prompt` is always string (privacy boundary enforced at type level) — applies to all providers.
- Pre-send approval via callback (`setPreSendApprovalHandler`) — reusable for all providers.
- `CloudRequestLogEntry` already has `provider: string` and `model: string` — flexible for multi-provider.

### Integration Points
- `store.ts:activateCloudAdapter()` — Currently creates Anthropic CloudAdapter. Must select provider-specific adapter based on settings.
- `Shell.tsx` — Wires pre-send approval handler to CloudAdapter. Handler code is provider-agnostic already.
- AI Settings UI — Currently has cloud API toggle + key entry. Needs provider dropdown + per-provider config forms.
- `store.ts` cloud-related signals — `cloudAPIEnabled`, `cloudApiKeySet` — may need provider-awareness.

</code_context>

<specifics>
## Specific Ideas

- OpenAI and Grok both support the OpenAI-compatible API format — custom endpoint support is essentially the same code path with user-provided base URL
- The refactor should make Anthropic "just another provider" using the same adapter pattern, not a special case
- Key validation test call gives users confidence their setup is correct before they encounter an error mid-workflow

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 13-multi-provider-cloud*
*Context gathered: 2026-03-06*
