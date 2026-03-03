/**
 * 3-Ring Binder tiered AI architecture — public API.
 *
 * Exports:
 * - dispatchTiered() — main entry point for tiered requests
 * - initTieredPipeline() — registers all tier handlers
 * - Types and handler interface
 */

export type {
  AITaskType,
  TieredRequest,
  TieredResponse,
  TieredResult,
  TieredFeatures,
} from './types';
export { CONFIDENCE_THRESHOLDS, MIN_SAMPLES_PER_TYPE, CENTROID_REBUILD_INTERVAL } from './types';
export type { TierHandler } from './handler';
export {
  dispatchTiered,
  registerHandler,
  unregisterHandler,
  getRegisteredHandlers,
} from './pipeline';

import { registerHandler } from './pipeline';
import { createTier1Handler } from './tier1-handler';
import { createTier3Handler } from './tier3-handler';
import type { ClassificationEvent } from '../../storage/classification-log';

// Module-level reference to Tier 1 handler for history updates
let tier1Handler: ReturnType<typeof createTier1Handler> | null = null;

/**
 * Initialize the tiered pipeline with Tier 1 + Tier 3 handlers.
 * Tier 2 is registered separately when the embedding worker is ready.
 *
 * @param classificationHistory - Initial classification history for Tier 1 pattern matching
 */
export function initTieredPipeline(
  classificationHistory: ClassificationEvent[] = [],
): void {
  tier1Handler = createTier1Handler(classificationHistory);
  registerHandler(tier1Handler);
  registerHandler(createTier3Handler());
}

/**
 * Update Tier 1's classification history (called after new classifications).
 */
export function updateTier1History(history: ClassificationEvent[]): void {
  tier1Handler?.updateHistory(history);
}
