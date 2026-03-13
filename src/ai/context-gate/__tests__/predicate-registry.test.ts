/**
 * Tests for predicate registry and activation gate.
 * Phase 30 Plan 03: context-gate scaffold.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerPredicate,
  evaluatePredicates,
  clearPredicates,
} from '../predicate-registry';
import type { GateContext, GatePredicateResult } from '../types';
import type { ExpandedBinderTypeConfig } from '../../../config/binder-types/schema';

// Minimal config stub for tests — only predicateConfig fields are used by predicates
const stubConfig = {
  predicateConfig: {
    routeGating: { blockedRoutes: ['/insights'] },
    timeGating: { lowEnergyHours: [22, 23, 0, 1] },
    historyGating: { maxDepth: 2, staleDays: 7 },
  },
} as unknown as ExpandedBinderTypeConfig;

const alwaysAllow = (_ctx: GateContext, _config: ExpandedBinderTypeConfig): GatePredicateResult => ({
  activated: true,
  reason: 'always allow',
});

const alwaysBlock = (_ctx: GateContext, _config: ExpandedBinderTypeConfig): GatePredicateResult => ({
  activated: false,
  reason: 'always block',
});

describe('predicate-registry', () => {
  beforeEach(() => {
    clearPredicates();
  });

  it('registerPredicate adds a predicate; evaluatePredicates returns its result', () => {
    registerPredicate('test', alwaysAllow);
    const results = evaluatePredicates({}, stubConfig);
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe('test');
    expect(results[0]?.activated).toBe(true);
  });

  it('evaluatePredicates with zero predicates returns empty array', () => {
    const results = evaluatePredicates({}, stubConfig);
    expect(results).toEqual([]);
  });

  it('evaluatePredicates with multiple predicates returns all results with names', () => {
    registerPredicate('pred-a', alwaysAllow);
    registerPredicate('pred-b', alwaysBlock);
    const results = evaluatePredicates({}, stubConfig);
    expect(results).toHaveLength(2);
    expect(results.map(r => r.name)).toContain('pred-a');
    expect(results.map(r => r.name)).toContain('pred-b');
    expect(results.find(r => r.name === 'pred-a')?.activated).toBe(true);
    expect(results.find(r => r.name === 'pred-b')?.activated).toBe(false);
  });

  it('clearPredicates empties the registry', () => {
    registerPredicate('test', alwaysAllow);
    clearPredicates();
    const results = evaluatePredicates({}, stubConfig);
    expect(results).toEqual([]);
  });
});
