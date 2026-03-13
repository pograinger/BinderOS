/**
 * Binder type predicate — verifies context matches the active binder config.
 *
 * Checks that the binderType in context matches the config's slug.
 * This predicate ensures agents don't apply GTD gating logic to non-GTD binders.
 * Pure function: no store imports, no Dexie queries.
 *
 * Phase 30 Plan 03: BTYPE-01
 */

import type { GateContext, GatePredicateResult } from '../../../types/gate';
import type { ExpandedBinderTypeConfig } from '../../../config/binder-types/schema';

/**
 * Binder type gate predicate.
 * Activates when the context's binderType matches config.slug.
 * Default-allow when no binderType is present in context.
 */
export function binderTypePredicate(
  ctx: GateContext,
  config: ExpandedBinderTypeConfig
): GatePredicateResult {
  if (ctx.binderType === undefined) {
    return {
      activated: true,
      reason: 'No binder type in context - allow by default',
    };
  }

  const expectedSlug = config.slug;
  const actualSlug = ctx.binderType;
  const matches = actualSlug === expectedSlug;

  return {
    activated: matches,
    reason: matches
      ? `Binder type "${actualSlug}" matches active config "${expectedSlug}"`
      : `Binder type "${actualSlug}" does not match active config "${expectedSlug}"`,
    metadata: { expectedSlug, actualSlug },
  };
}
