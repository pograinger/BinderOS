/**
 * Core AI adapter interface and types.
 *
 * Defines the pluggable adapter contract for all AI providers.
 * Enforces the privacy boundary: prompts are always pre-sanitized strings,
 * never raw atom data.
 *
 * Core providers:
 *   'noop'      — passthrough for round-trip verification (Phase 4)
 *   'browser'   — SmolLM2 via Transformers.js / WebGPU/WASM (Phase 5)
 *   'anthropic' — Anthropic cloud API via privacy proxy (Phase 5)
 *
 * Extensible providers (Phase 13+):
 *   'openai'    — OpenAI-compatible adapter
 *   'grok'      — Grok (xAI) via OpenAI-compatible API
 *   'custom'    — User-supplied custom endpoint
 *
 * AIAdapter.id and AIResponse.provider are string to allow new providers
 * without changing the core interface.
 */

/**
 * Lifecycle status of an AI provider.
 *
 * 'disabled'    — not enabled by user settings
 * 'loading'     — model downloading or initializing
 * 'available'   — ready to serve requests
 * 'error'       — initialization or runtime error
 * 'unavailable' — device lacks required capabilities (e.g., no WebGPU)
 */
export type AIProviderStatus = 'disabled' | 'loading' | 'available' | 'error' | 'unavailable';

/**
 * A request to an AI adapter.
 *
 * PRIVACY BOUNDARY: prompt must ALWAYS be a pre-sanitized string — never raw atom data.
 * Cloud adapters enforce this at the type level per privacy proxy architecture.
 */
export interface AIRequest {
  requestId: string;
  /**
   * ALWAYS pre-sanitized string — never raw atom data.
   * Cloud adapters enforce this at the type level per privacy proxy architecture.
   */
  prompt: string;
  maxTokens?: number;
  /** JSON schema for XGrammar-constrained structured output (used by BrowserAdapter). */
  jsonSchema?: Record<string, unknown>;
  onChunk?: (chunk: string) => void;
  signal?: AbortSignal;
}

/**
 * A response from an AI adapter.
 *
 * provider is a string to support extensible provider IDs beyond the
 * initial set ('noop', 'browser', 'cloud'). For cloud adapters the value
 * is typically the provider's displayName (e.g. 'Anthropic', 'OpenAI').
 */
export interface AIResponse {
  requestId: string;
  text: string;
  provider: string;
  model?: string;
}

/**
 * Pluggable AI adapter interface.
 *
 * Every AI provider (noop, browser, cloud, openai, grok, custom) implements
 * this interface. The router selects the active adapter based on store state.
 *
 * id is a string to support extensible provider IDs. Well-known values:
 *   'noop', 'browser', 'anthropic', 'openai', 'grok', 'custom'
 */
export interface AIAdapter {
  readonly id: string;
  readonly status: AIProviderStatus;
  execute(request: AIRequest): Promise<AIResponse>;
  dispose(): void;
}
