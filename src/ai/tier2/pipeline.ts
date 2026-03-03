/**
 * Tiered escalation pipeline — the core of the 3-Ring Binder architecture.
 *
 * dispatchTiered() drives the escalation flow:
 *   Request → Tier 1 → confidence check → Tier 2 → confidence check → Tier 3
 *
 * Each tier returns a confidence score. Below the task-specific threshold → escalate.
 * Best result across all attempted tiers kept as fallback.
 *
 * This is additive — dispatchAI() continues to work as a direct Tier 3 call.
 */

import type { TierHandler } from './handler';
import type { TieredRequest, TieredResponse, TieredResult } from './types';
import { CONFIDENCE_THRESHOLDS } from './types';

// --- Handler registry ---

const handlers: TierHandler[] = [];

/**
 * Register a tier handler. Handlers are tried in tier order (1, 2, 3).
 * Call this at init time for each tier.
 */
export function registerHandler(handler: TierHandler): void {
  // Remove any existing handler for this tier
  const existingIdx = handlers.findIndex((h) => h.tier === handler.tier);
  if (existingIdx >= 0) {
    handlers.splice(existingIdx, 1);
  }
  handlers.push(handler);
  handlers.sort((a, b) => a.tier - b.tier);
}

/**
 * Remove a tier handler by tier number.
 */
export function unregisterHandler(tier: 1 | 2 | 3): void {
  const idx = handlers.findIndex((h) => h.tier === tier);
  if (idx >= 0) handlers.splice(idx, 1);
}

/**
 * Get the currently registered handlers (for debugging/testing).
 */
export function getRegisteredHandlers(): readonly TierHandler[] {
  return handlers;
}

// --- Escalation pipeline ---

/**
 * Dispatch a request through the tiered pipeline.
 *
 * Tries each registered tier in order (1 → 2 → 3).
 * Stops when a tier returns confidence >= threshold for the task.
 * If no tier meets threshold, returns the best result seen.
 *
 * @param request - The tiered request to process
 * @returns TieredResponse with the accepted result and all attempts
 */
export async function dispatchTiered(request: TieredRequest): Promise<TieredResponse> {
  const startTime = performance.now();
  const threshold = CONFIDENCE_THRESHOLDS[request.task];
  const attempts: TieredResult[] = [];
  let bestResult: TieredResult | null = null;

  for (const handler of handlers) {
    // Skip handlers that can't process this task
    if (!handler.canHandle(request.task)) continue;

    // Check abort before each tier
    if (request.features.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    try {
      const result = await handler.handle(request);
      attempts.push(result);

      // Track best result across all tiers
      if (!bestResult || result.confidence > bestResult.confidence) {
        bestResult = result;
      }

      // Accept this tier's result if confidence meets threshold
      if (result.confidence >= threshold) {
        return {
          result,
          attempts,
          escalated: attempts.length > 1,
          totalMs: performance.now() - startTime,
        };
      }
    } catch (err) {
      // Re-throw abort errors
      if (err instanceof DOMException && err.name === 'AbortError') throw err;

      // Log tier failure but continue to next tier
      console.warn(`[tier${handler.tier}] ${handler.name} failed:`, err);
      attempts.push({
        tier: handler.tier,
        confidence: 0,
        reasoning: `Handler error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // No tier met the threshold — return the best we got
  const fallback: TieredResult = bestResult ?? {
    tier: 1,
    confidence: 0,
    reasoning: 'No handlers available for this task',
  };

  return {
    result: fallback,
    attempts,
    escalated: attempts.length > 1,
    totalMs: performance.now() - startTime,
  };
}
