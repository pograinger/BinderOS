/**
 * AI adapter router.
 *
 * Holds the currently active AI adapter and dispatches requests to it.
 * The router is always called as a result of user action — it performs
 * no autonomous scheduling (AIST-04).
 *
 * Usage:
 *   setActiveAdapter(new NoOpAdapter());
 *   const result = await dispatchAI({ requestId, prompt });
 */

import type { AIAdapter, AIRequest, AIResponse } from './adapters/adapter';

// Module-level active adapter — starts null until initialized on INIT
let activeAdapter: AIAdapter | null = null;

/**
 * Set the active AI adapter.
 * Pass null to disable AI dispatch.
 */
export function setActiveAdapter(adapter: AIAdapter | null): void {
  activeAdapter = adapter;
}

/**
 * Get the current active AI adapter (or null if none is set).
 */
export function getActiveAdapter(): AIAdapter | null {
  return activeAdapter;
}

/**
 * Dispatch an AI request to the active adapter.
 *
 * Throws if no adapter is set or the adapter is not in 'available' status.
 * All dispatch is user-initiated — never called autonomously (AIST-04).
 */
export async function dispatchAI(request: AIRequest): Promise<AIResponse> {
  if (!activeAdapter || activeAdapter.status !== 'available') {
    throw new Error('No AI adapter available');
  }
  return activeAdapter.execute(request);
}
