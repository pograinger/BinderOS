/**
 * Activation gate — single entry point for Phase 31 integration.
 *
 * canActivate() evaluates all registered predicates and returns an aggregated GateResult.
 * AND semantics: all predicates must pass for canActivate to be true.
 * Default-allow: returns canActivate: true when no predicates are registered.
 *
 * Phase 31 integration: import canActivate and call it in dispatchTiered() pre-filter.
 * Log results to gateActivationLog (Dexie table defined in Phase 30 Plan 01).
 *
 * Pure module: no store imports, no Dexie imports.
 *
 * Phase 30 Plan 03: BTYPE-01
 */

import type { GateContext, GateResult } from '../../types/gate';
import type { ExpandedBinderTypeConfig } from '../../config/binder-types/schema';
import { evaluatePredicates } from './predicate-registry';

/**
 * Evaluate all registered predicates and return an aggregated GateResult.
 *
 * @param ctx - The current gate context (route, timeOfDay, atomId, etc.)
 * @param config - The active binder type config (provides predicate configuration)
 * @returns GateResult with canActivate (AND of all predicates) and per-predicate results
 */
export function canActivate(ctx: GateContext, config: ExpandedBinderTypeConfig): GateResult {
  const predicateResults = evaluatePredicates(ctx, config);

  // Default-allow when no predicates registered
  if (predicateResults.length === 0) {
    return { canActivate: true, predicateResults: [] };
  }

  // AND semantics: every predicate must return activated: true
  const allActivated = predicateResults.every(r => r.activated);

  return {
    canActivate: allActivated,
    predicateResults,
  };
}
