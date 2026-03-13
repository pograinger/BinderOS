/**
 * Time predicate — suppresses enrichment during low-energy hours.
 *
 * Reads lowEnergyHours from BinderTypeConfig.predicateConfig.timeGating.
 * Pure function: no store imports, no Dexie queries.
 *
 * Phase 30 Plan 03: BTYPE-01
 */

import type { GateContext, GatePredicateResult } from '../../../types/gate';
import type { ExpandedBinderTypeConfig } from '../../../config/binder-types/schema';

/**
 * Time-of-day gate predicate.
 * Blocks activation when the current hour falls in lowEnergyHours.
 * Default-allow when no timeOfDay is present in context.
 */
export function timePredicate(
  ctx: GateContext,
  config: ExpandedBinderTypeConfig
): GatePredicateResult {
  if (ctx.timeOfDay === undefined) {
    return {
      activated: true,
      reason: 'No time in context - allow by default',
    };
  }

  const { lowEnergyHours } = config.predicateConfig.timeGating;
  const checkedHour = ctx.timeOfDay;
  const isLowEnergy = lowEnergyHours.includes(checkedHour);

  return {
    activated: !isLowEnergy,
    reason: isLowEnergy
      ? `Hour ${checkedHour} is a low-energy hour — enrichment suppressed`
      : `Hour ${checkedHour} is not a low-energy hour`,
    metadata: { lowEnergyHours, checkedHour },
  };
}
