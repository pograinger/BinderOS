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

  const { maxDepth } = config.predicateConfig.historyGating;
  const currentDepth = ctx.enrichmentDepth;
  const exceedsMax = currentDepth >= maxDepth;

  // TODO (Phase 31): Add staleDays check — if atom is stale (last enriched > staleDays ago),
  // re-allow enrichment even if depth >= maxDepth. Requires atom's lastEnrichedAt timestamp.

  return {
    activated: !exceedsMax,
    reason: exceedsMax
      ? `Enrichment depth ${currentDepth} has reached maxDepth ${maxDepth}`
      : `Enrichment depth ${currentDepth} is below maxDepth ${maxDepth}`,
    metadata: { maxDepth, currentDepth },
  };
}
