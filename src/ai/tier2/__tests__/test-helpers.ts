/**
 * Shared test helpers for the tiered pipeline and gate integration tests.
 *
 * Phase 31 Plan 01: GATE-01, GATE-04, GATE-05
 */

import type { GateContext } from '../../../types/gate';

/**
 * Returns a GateContext that passes all four core predicates:
 * - route: '/binder'   → not in blockedRoutes (['/insights', '/archive'])
 * - timeOfDay: 12      → not in lowEnergyHours ([22, 23, 0, 1])
 * - binderType: 'gtd-personal' → matches config slug
 * - enrichmentDepth: 0 → below maxDepth (2)
 */
export function makePermissiveContext(): GateContext {
  return {
    route: '/binder',
    timeOfDay: 12,
    binderType: 'gtd-personal',
    enrichmentDepth: 0,
  };
}
