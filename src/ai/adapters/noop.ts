/**
 * NoOpAdapter — passthrough AI adapter for round-trip verification.
 *
 * Returns a fixed '[no-op response]' after a short simulated delay.
 * Used in Phase 4 to verify the full AI dispatch pipeline works
 * before any real LLM model is connected.
 *
 * Always has status 'available' — never requires model loading.
 */

import type { AIAdapter, AIRequest, AIResponse } from './adapter';

export class NoOpAdapter implements AIAdapter {
  readonly id = 'noop' as const;
  readonly status = 'available' as const;

  async execute(request: AIRequest): Promise<AIResponse> {
    // Simulate minimal latency to exercise the async round-trip
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    // Notify streaming chunk listener if provided
    request.onChunk?.('[no-op response]');

    return {
      requestId: request.requestId,
      text: '[no-op response]',
      provider: 'noop',
    };
  }

  dispose(): void {
    // No resources to release
  }
}
