/**
 * History predicate — prevents over-enrichment based on depth.
 *
 * Reads maxDepth and staleDays from BinderTypeConfig.predicateConfig.historyGating.
 * Pure function: no store imports, no Dexie queries.
 *
 * Phase 30 Plan 03: BTYPE-01
 */

import type { GateContext, GatePredicateResult } from '../../../types/gate';
import type { ExpandedBinderTypeConfig } from '../../../config/binder-types/schema';

/**
 * Atom history gate predicate.
 * Blocks activation when enrichmentDepth has reached or exceeded maxDepth.
 * Default-allow when no enrichmentDepth is present in context.
 *
 * NOTE: staleDays check (re-allow enrichment after staleness window) requires comparing
 * against the atom's last-enriched timestamp. This is stubbed as always-allow for now.
 * Phase 31 will add content-change-date checking when the gate is wired into dispatchTiered().
 */
export function historyPredicate(
  ctx: GateContext,
  config: ExpandedBinderTypeConfig
): GatePredicateResult {
  if (ctx.enrichmentDepth === undefined) {
    return {
      activated: true,
      reason: 'No enrichment depth in context - allow by default',
    };
  }

  const { maxDepth, staleDays } = config.predicateConfig.historyGating;
  const currentDepth = ctx.enrichmentDepth;
  const exceedsMax = currentDepth >= maxDepth;

  if (!exceedsMax) {
    return {
      activated: true,
      reason: `Enrichment depth ${currentDepth} is below maxDepth ${maxDepth}`,
      metadata: { maxDepth, currentDepth },
    };
  }

  // Depth has reached maxDepth — check staleDays to allow re-enrichment of stale atoms.
  // Conservative default: if no lastEnrichedAt timestamp, treat as NOT stale (do not re-enrich).
  const staleDaysMs = staleDays * 86400000;
  const isStale =
    ctx.lastEnrichedAt !== undefined
      ? Date.now() - ctx.lastEnrichedAt > staleDaysMs
      : false;

  if (isStale) {
    return {
      activated: true,
      reason: `Re-enrichment allowed: atom is stale (last enriched > ${staleDays} days ago)`,
      metadata: { maxDepth, currentDepth, staleDays, lastEnrichedAt: ctx.lastEnrichedAt, isStale },
    };
  }

  return {
    activated: false,
    reason: `Enrichment depth ${currentDepth} has reached maxDepth ${maxDepth} and atom is not stale`,
    metadata: { maxDepth, currentDepth, staleDays, lastEnrichedAt: ctx.lastEnrichedAt, isStale },
  };
}
