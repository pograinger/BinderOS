/**
 * Core AI adapter interface and types.
 *
 * Defines the pluggable adapter contract for all AI providers.
 * Enforces the privacy boundary: prompts are always pre-sanitized strings,
 * never raw atom data.
 *
 * Providers:
 *   'noop'    — passthrough for round-trip verification (Phase 4)
 *   'browser' — SmolLM2 via Transformers.js / WebGPU/WASM (Phase 5)
 *   'cloud'   — Anthropic cloud API via privacy proxy (Phase 5)
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
 */
export interface AIResponse {
  requestId: string;
  text: string;
  provider: 'noop' | 'browser' | 'cloud';
  model?: string;
}

/**
 * Pluggable AI adapter interface.
 *
 * Every AI provider (noop, browser, cloud) implements this interface.
 * The router selects the active adapter based on store state.
 */
export interface AIAdapter {
  readonly id: 'noop' | 'browser' | 'cloud';
  readonly status: AIProviderStatus;
  execute(request: AIRequest): Promise<AIResponse>;
  dispose(): void;
}
