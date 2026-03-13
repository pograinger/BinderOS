/**
 * Tests for the four config-reading predicate stubs.
 * Phase 30 Plan 03: context-gate scaffold.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { routePredicate } from '../predicates/route-predicate';
import { timePredicate } from '../predicates/time-predicate';
import { historyPredicate } from '../predicates/history-predicate';
import { binderTypePredicate } from '../predicates/binder-type-predicate';
import { clearPredicates } from '../predicate-registry';
import type { ExpandedBinderTypeConfig } from '../../../config/binder-types/schema';

// Minimal config for predicate tests
const stubConfig = {
  slug: 'gtd-personal',
  predicateConfig: {
    routeGating: { blockedRoutes: ['/insights', '/archive'] },
    timeGating: { lowEnergyHours: [22, 23, 0, 1] },
    historyGating: { maxDepth: 2, staleDays: 7 },
  },
} as unknown as ExpandedBinderTypeConfig;

describe('route-predicate', () => {
  it('returns activated: false with reason containing "blocked" when route matches blockedRoutes', () => {
    const result = routePredicate({ route: '/insights' }, stubConfig);
    expect(result.activated).toBe(false);
    expect(result.reason).toMatch(/blocked/i);
  });

  it('returns activated: true when route does not match blockedRoutes', () => {
    const result = routePredicate({ route: '/inbox' }, stubConfig);
    expect(result.activated).toBe(true);
  });

  it('returns activated: true when no route in context', () => {
    const result = routePredicate({}, stubConfig);
    expect(result.activated).toBe(true);
  });
});

describe('time-predicate', () => {
  it('returns activated: false with reason containing "low-energy" when timeOfDay is in lowEnergyHours', () => {
    const result = timePredicate({ timeOfDay: 23 }, stubConfig);
    expect(result.activated).toBe(false);
    expect(result.reason).toMatch(/low-energy/i);
  });

  it('returns activated: true when timeOfDay is not in lowEnergyHours', () => {
    const result = timePredicate({ timeOfDay: 14 }, stubConfig);
    expect(result.activated).toBe(true);
  });

  it('returns activated: true when no timeOfDay in context', () => {
    const result = timePredicate({}, stubConfig);
    expect(result.activated).toBe(true);
  });
});

describe('history-predicate', () => {
  it('returns activated: false with reason containing "depth" when enrichmentDepth >= maxDepth', () => {
    const result = historyPredicate({ enrichmentDepth: 3 }, stubConfig);
    expect(result.activated).toBe(false);
    expect(result.reason).toMatch(/depth/i);
  });

  it('returns activated: true when enrichmentDepth < maxDepth', () => {
    const result = historyPredicate({ enrichmentDepth: 1 }, stubConfig);
    expect(result.activated).toBe(true);
  });

  it('returns activated: true when no enrichmentDepth in context', () => {
    const result = historyPredicate({}, stubConfig);
    expect(result.activated).toBe(true);
  });
});

describe('binder-type-predicate', () => {
  it('returns activated: true when binderType matches config slug', () => {
    const result = binderTypePredicate({ binderType: 'gtd-personal' }, stubConfig);
    expect(result.activated).toBe(true);
  });

  it('returns activated: true when no binderType in context', () => {
    const result = binderTypePredicate({}, stubConfig);
    expect(result.activated).toBe(true);
  });
});

describe('predicates/index registration', () => {
  beforeEach(() => {
    clearPredicates();
  });

  it('after importing predicates/index, all four predicates are registered', async () => {
    const { initCorePredicates } = await import('../predicates/index');
    initCorePredicates();

    // Import evaluatePredicates to check what's registered
    const { evaluatePredicates } = await import('../predicate-registry');
    const results = evaluatePredicates({}, stubConfig);
    const names = results.map(r => r.name);

    expect(names).toContain('route');
    expect(names).toContain('time-of-day');
    expect(names).toContain('atom-history');
    expect(names).toContain('binder-type');
    expect(names).toHaveLength(4);
  });
});
