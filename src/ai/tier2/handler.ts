/**
 * TierHandler interface — pluggable handler for each ring of the 3-Ring Binder.
 *
 * Each tier implements this interface. The pipeline calls canHandle() to check
 * if the tier supports the task, then handle() to produce a result.
 *
 * Handlers are pure — no store imports. All context passed via TieredRequest.
 */

import type { AITaskType, TieredRequest, TieredResult } from './types';

/**
 * A handler for a single tier of the AI pipeline.
 */
export interface TierHandler {
  /** Which tier this handler represents */
  readonly tier: 1 | 2 | 3;

  /** Human-readable name for logging/debugging */
  readonly name: string;

  /**
   * Check if this handler can process the given task type.
   * Returns false if the tier doesn't support this task or isn't ready.
   */
  canHandle(task: AITaskType): boolean;

  /**
   * Process the request and return a result with confidence score.
   * Should never throw — returns low confidence on failure.
   */
  handle(request: TieredRequest): Promise<TieredResult>;
}
