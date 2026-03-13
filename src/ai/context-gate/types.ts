/**
 * Context gate types module.
 *
 * Re-exports gate evaluation types from src/types/gate.ts and defines the
 * PredicateFn type alias used by the predicate registry.
 *
 * Phase 30 Plan 03: BTYPE-01
 */

export type { GateContext, GatePredicateResult, GateResult } from '../../types/gate';
import type { GateContext, GatePredicateResult } from '../../types/gate';
import type { ExpandedBinderTypeConfig } from '../../config/binder-types/schema';

/**
 * A gate predicate function.
 * Accepts the current gate context and active binder type config, returns a typed result.
 * All predicates are pure functions — no store imports, no Dexie queries.
 */
export type PredicateFn = (ctx: GateContext, config: ExpandedBinderTypeConfig) => GatePredicateResult;
