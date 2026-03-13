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
import type { GateActivationLogEntry, GateResult } from '../../types/gate';
import { canActivate } from '../context-gate/activation-gate';
import { getBinderConfig } from '../../config/binder-types';
import { db } from '../../storage/db';
// Register core predicates (route, time-of-day, atom-history, binder-type)
import '../context-gate/predicates';

// --- Handler registry ---

const handlers: TierHandler[] = [];

/**
 * Register a tier handler. Handlers are tried in tier order (1, 2, 3).
 * Multiple handlers for the same tier are supported (e.g., T2A + T2B)
 * and are differentiated by name. Call this at init time for each handler.
 */
export function registerHandler(handler: TierHandler): void {
  // Remove existing handler with same tier AND name (allows T2A + T2B coexistence)
  const existingIdx = handlers.findIndex(
    (h) => h.tier === handler.tier && h.name === handler.name
  );
  if (existingIdx >= 0) {
    handlers.splice(existingIdx, 1);
  }
  handlers.push(handler);
  handlers.sort((a, b) => a.tier - b.tier);
}

/**
 * Remove a tier handler by tier number, or by tier + name for specific removal.
 * When name is provided, only removes the matching handler (preserves others at same tier).
 * When name is omitted, removes ALL handlers at that tier (backwards-compatible).
 */
export function unregisterHandler(tier: 1 | 2 | 3, name?: string): void {
  if (name) {
    const idx = handlers.findIndex((h) => h.tier === tier && h.name === name);
    if (idx >= 0) handlers.splice(idx, 1);
  } else {
    // Remove all handlers at this tier (backwards-compatible behavior)
    for (let i = handlers.length - 1; i >= 0; i--) {
      if (handlers[i]?.tier === tier) handlers.splice(i, 1);
    }
  }
}

/**
 * Get the currently registered handlers (for debugging/testing).
 */
export function getRegisteredHandlers(): readonly TierHandler[] {
  return handlers;
}

// --- Gate log writer ---

/**
 * Fire-and-forget gate activation log writer.
 * Maps each predicate result to a GateActivationLogEntry and bulk-inserts into Dexie.
 * Failures are logged as warnings — never throws, never blocks dispatch.
 */
async function writeGateLog(
  request: TieredRequest,
  gateResult: GateResult,
  configVersion: string
): Promise<void> {
  const now = Date.now();
  const entries: GateActivationLogEntry[] = gateResult.predicateResults.map((r) => ({
    id: crypto.randomUUID(),
    predicateName: r.name,
    outcome: r.activated ? 'activated' : 'blocked',
    timestamp: now,
    configVersion,
    atomId: request.context.atomId,
    route: request.context.route,
    timeOfDay: request.context.timeOfDay,
    binderType: request.context.binderType,
    enrichmentDepth: request.context.enrichmentDepth,
    version: 1,
    deviceId: 'local',
    updatedAt: now,
  }));

  try {
    await db.gateActivationLog.bulkAdd(entries);
  } catch (err) {
    console.warn('[context-gate] Failed to write activation log:', err);
  }
}

/**
 * Prune old gate activation log entries.
 * Deletes entries older than retentionDays. Call lazily (app boot or harness cleanup).
 * Not in the dispatch path.
 *
 * @param retentionDays - How many days to retain log entries (default 30)
 */
export async function cleanupGateLogs(retentionDays = 30): Promise<void> {
  const cutoff = Date.now() - retentionDays * 86400000;
  await db.gateActivationLog.where('timestamp').below(cutoff).delete();
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

  // --- Context gate pre-filter ---
  // Evaluate all registered predicates before any handler runs.
  // Fire-and-forget gate log write — never blocks dispatch.
  const binderConfig = getBinderConfig(request.context.binderType ?? 'gtd-personal');
  const gateResult = canActivate(request.context, binderConfig);
  void writeGateLog(request, gateResult, String(binderConfig.schemaVersion));

  if (!gateResult.canActivate) {
    const blockedReasons = gateResult.predicateResults
      .filter((r) => !r.activated)
      .map((r) => `[${r.name}] ${r.reason}`)
      .join('; ');

    return {
      result: {
        tier: 1,
        confidence: 0,
        reasoning: `Gate blocked: ${blockedReasons}`,
      },
      attempts: [],
      escalated: false,
      totalMs: performance.now() - startTime,
      gateBlocked: true,
      gateResult,
    };
  }
  // --- End gate pre-filter ---

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
          gateResult,
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
    gateResult,
  };
}
