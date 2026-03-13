/**
 * Tests for the activation gate (canActivate entry point).
 * Phase 30 Plan 03: context-gate scaffold.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { canActivate } from '../activation-gate';
import { registerPredicate, clearPredicates } from '../predicate-registry';
import type { GateContext, GatePredicateResult } from '../types';
import type { ExpandedBinderTypeConfig } from '../../../config/binder-types/schema';

const stubConfig = {
  predicateConfig: {
    routeGating: { blockedRoutes: ['/insights'] },
    timeGating: { lowEnergyHours: [22, 23, 0, 1] },
    historyGating: { maxDepth: 2, staleDays: 7 },
  },
} as unknown as ExpandedBinderTypeConfig;

const allowFn = (_ctx: GateContext, _cfg: ExpandedBinderTypeConfig): GatePredicateResult => ({
  activated: true,
  reason: 'allow',
});
const blockFn = (_ctx: GateContext, _cfg: ExpandedBinderTypeConfig): GatePredicateResult => ({
  activated: false,
  reason: 'block',
});

describe('activation-gate', () => {
  beforeEach(() => {
    clearPredicates();
  });

  it('returns canActivate: true when all predicates return activated: true', () => {
    registerPredicate('p1', allowFn);
    registerPredicate('p2', allowFn);
    const result = canActivate({}, stubConfig);
    expect(result.canActivate).toBe(true);
  });

  it('returns canActivate: false when any predicate returns activated: false', () => {
    registerPredicate('p1', allowFn);
    registerPredicate('p2', blockFn);
    const result = canActivate({}, stubConfig);
    expect(result.canActivate).toBe(false);
  });

  it('returns canActivate: true with empty context and no predicates', () => {
    const result = canActivate({}, stubConfig);
    expect(result.canActivate).toBe(true);
    expect(result.predicateResults).toEqual([]);
  });

  it('predicateResults array contains name, activated, reason for each predicate', () => {
    registerPredicate('gate-a', allowFn);
    registerPredicate('gate-b', blockFn);
    const result = canActivate({}, stubConfig);
    expect(result.predicateResults).toHaveLength(2);
    const gateA = result.predicateResults.find(r => r.name === 'gate-a');
    const gateB = result.predicateResults.find(r => r.name === 'gate-b');
    expect(gateA).toBeDefined();
    expect(gateA?.activated).toBe(true);
    expect(gateA?.reason).toBe('allow');
    expect(gateB).toBeDefined();
    expect(gateB?.activated).toBe(false);
    expect(gateB?.reason).toBe('block');
  });
});
