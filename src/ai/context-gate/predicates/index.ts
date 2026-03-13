/**
 * Core predicate registration module.
 *
 * Exports initCorePredicates() for explicit registration (used by tests and production init).
 * Also registers all four predicates at module level for production use via side-effect import.
 *
 * Import this module once at application init to wire the context gate predicates:
 *   import '@/ai/context-gate/predicates';
 * Or call initCorePredicates() explicitly for testability.
 *
 * Phase 30 Plan 03: BTYPE-01
 */

import { registerPredicate } from '../predicate-registry';
import { routePredicate } from './route-predicate';
import { timePredicate } from './time-predicate';
import { historyPredicate } from './history-predicate';
import { binderTypePredicate } from './binder-type-predicate';

export { routePredicate } from './route-predicate';
export { timePredicate } from './time-predicate';
export { historyPredicate } from './history-predicate';
export { binderTypePredicate } from './binder-type-predicate';

/**
 * Register all four built-in gate predicates.
 * Called explicitly in tests (after clearPredicates()) for isolation.
 * Also called at module level for production side-effect import.
 */
export function initCorePredicates(): void {
  registerPredicate('route', routePredicate);
  registerPredicate('time-of-day', timePredicate);
  registerPredicate('atom-history', historyPredicate);
  registerPredicate('binder-type', binderTypePredicate);
}

// Register at module level — production init via side-effect import
// Tests call clearPredicates() + initCorePredicates() for isolation
initCorePredicates();
