/**
 * Predicate registry for context gate evaluation.
 *
 * Mirrors the handler registration pattern from src/ai/tier2/pipeline.ts.
 * Predicates are registered at module init and evaluated together by evaluatePredicates().
 *
 * Pure module: no store imports, no Dexie imports.
 *
 * Phase 30 Plan 03: BTYPE-01
 */

import type { GateContext, GatePredicateResult } from '../../types/gate';
import type { ExpandedBinderTypeConfig } from '../../config/binder-types/schema';
import type { PredicateFn } from './types';

// Module-level predicate registry — mirrors handlers Map in pipeline.ts
const _predicates: Map<string, PredicateFn> = new Map();

/**
 * Register a gate predicate by name.
 * Warns if a predicate with the same name is already registered (overwrite is allowed).
 * Call at module init time for each predicate (mirrors registerHandler pattern).
 */
export function registerPredicate(name: string, fn: PredicateFn): void {
  if (_predicates.has(name)) {
    console.warn(`[context-gate] Predicate "${name}" already registered — overwriting.`);
  }
  _predicates.set(name, fn);
}

/**
 * Evaluate all registered predicates against the provided context and config.
 * Returns an array of named results — one entry per registered predicate.
 * Order matches registration order (Map insertion order).
 */
export function evaluatePredicates(
  ctx: GateContext,
  config: ExpandedBinderTypeConfig
): Array<{ name: string } & GatePredicateResult> {
  const results: Array<{ name: string } & GatePredicateResult> = [];
  for (const [name, fn] of _predicates) {
    const result = fn(ctx, config);
    results.push({ name, ...result });
  }
  return results;
}

/**
 * Clear all registered predicates.
 * Used for test isolation — not for production use.
 */
export function clearPredicates(): void {
  _predicates.clear();
}
