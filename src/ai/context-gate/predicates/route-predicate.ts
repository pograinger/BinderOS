/**
 * Route predicate — blocks enrichment on configured routes.
 *
 * Reads blockedRoutes from BinderTypeConfig.predicateConfig.routeGating.
 * Pure function: no store imports, no Dexie queries.
 *
 * Phase 30 Plan 03: BTYPE-01
 */

import type { GateContext, GatePredicateResult } from '../../../types/gate';
import type { ExpandedBinderTypeConfig } from '../../../config/binder-types/schema';

/**
 * Route gate predicate.
 * Blocks activation when the current route starts with any blockedRoute entry.
 * Default-allow when no route is present in context.
 */
export function routePredicate(
  ctx: GateContext,
  config: ExpandedBinderTypeConfig
): GatePredicateResult {
  if (ctx.route === undefined) {
    return {
      activated: true,
      reason: 'No route in context - allow by default',
    };
  }

  const { blockedRoutes } = config.predicateConfig.routeGating;
  const checkedRoute = ctx.route;
  const isBlocked = blockedRoutes.some(blocked => checkedRoute.startsWith(blocked));

  return {
    activated: !isBlocked,
    reason: isBlocked
      ? `Route "${checkedRoute}" is blocked for enrichment`
      : `Route "${checkedRoute}" is not blocked`,
    metadata: { blockedRoutes, checkedRoute },
  };
}
