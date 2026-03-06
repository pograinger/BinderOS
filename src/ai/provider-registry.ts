/**
 * Provider registry — configuration for all supported cloud AI providers.
 *
 * Defines ProviderId, ProviderConfig, and the PROVIDER_REGISTRY map.
 * Used by the store factory (activateCloudAdapter) and key vault to
 * route requests to the correct adapter and credential store.
 *
 * Providers using OpenAI-compatible API (chat/completions):
 *   openai, grok, custom
 *
 * Providers using their own SDK:
 *   anthropic (uses @anthropic-ai/sdk directly)
 */

export type ProviderId = 'anthropic' | 'openai' | 'grok' | 'custom';

export interface ProviderConfig {
  id: ProviderId;
  displayName: string;
  /** Base URL for the OpenAI-compatible API. Null for Anthropic (uses SDK default). */
  baseURL: string | null;
  defaultModel: string;
  /** Hint prefix shown in the API key input field (e.g. 'sk-ant-'). */
  apiKeyPrefix?: string;
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
    baseURL: null,
    defaultModel: '',
  },
};

/**
 * Strip trailing slashes from a base URL to prevent double-slash issues.
 * e.g. 'https://api.example.com/v1/' -> 'https://api.example.com/v1'
 */
export function normalizeBaseURL(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Validate an API key by making a lightweight test request to the provider.
 *
 * Returns true if the key is valid (request succeeds), false otherwise.
 * Never throws — all errors are caught and return false.
 *
 * Validation strategy:
 *   - anthropic: uses Anthropic SDK to send a 1-token message
 *   - openai/grok/custom: fetches GET /models with Bearer token (5-second timeout)
 *     For grok: falls back to a minimal chat completion if GET /models fails non-401
 */
export async function validateProviderKey(
  providerId: ProviderId,
  apiKey: string,
  baseURL?: string,
): Promise<boolean> {
  try {
    if (providerId === 'anthropic') {
      // Dynamic import to avoid loading the Anthropic SDK until needed
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
      await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      });
      return true;
    }

    // OpenAI-compatible providers: GET /models with 5-second timeout
    const config = PROVIDER_REGISTRY[providerId];
    const resolvedBaseURL = normalizeBaseURL(
      baseURL ?? config.baseURL ?? '',
    );
    if (!resolvedBaseURL) return false;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const resp = await fetch(`${resolvedBaseURL}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (resp.ok) return true;

      // 401 means the key is definitely invalid
      if (resp.status === 401) return false;

      // Grok fallback: if GET /models fails with non-401, try a minimal chat completion
      if (providerId === 'grok') {
        return await validateViaMinimalCompletion(resolvedBaseURL, apiKey, config.defaultModel);
      }

      return false;
    } catch {
      clearTimeout(timeoutId);
      // For grok, fall back to chat completion on network/fetch error too
      if (providerId === 'grok') {
        return await validateViaMinimalCompletion(resolvedBaseURL, apiKey, config.defaultModel);
      }
      return false;
    }
  } catch {
    return false;
  }
}

/**
 * Fallback validation via a minimal 1-token chat completion POST.
 * Used for providers where GET /models is not reliable (e.g. Grok).
 */
async function validateViaMinimalCompletion(
  baseURL: string,
  apiKey: string,
  model: string,
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
      const resp = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ping' }],
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return resp.ok || resp.status !== 401;
    } catch {
      clearTimeout(timeoutId);
      return false;
    }
  } catch {
    return false;
  }
}
