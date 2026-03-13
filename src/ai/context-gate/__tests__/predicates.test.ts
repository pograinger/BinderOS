/**
 * Tests for the four config-reading predicate stubs.
 * Phase 30 Plan 03: context-gate scaffold.
 * Phase 31 Plan 01: staleDays tests added.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { routePredicate } from '../predicates/route-predicate';
import { timePredicate } from '../predicates/time-predicate';
import { historyPredicate } from '../predicates/history-predicate';
import { binderTypePredicate } from '../predicates/binder-type-predicate';
import { clearPredicates } from '../predicate-registry';
import { makePermissiveContext } from '../../tier2/__tests__/test-helpers';
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

describe('history-predicate staleDays', () => {
  const NOW = 1_700_000_000_000; // fixed epoch ms

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('blocks when enrichmentDepth >= maxDepth AND lastEnrichedAt is recent (not stale)', () => {
    // enriched 1 day ago — within 7-day staleDays window
    const recentlyEnriched = NOW - 1 * 86400000;
    const result = historyPredicate(
      { enrichmentDepth: 3, lastEnrichedAt: recentlyEnriched },
      stubConfig
    );
    expect(result.activated).toBe(false);
    expect(result.reason).toMatch(/not stale/i);
    expect(result.metadata?.isStale).toBe(false);
  });

  it('allows when enrichmentDepth >= maxDepth AND lastEnrichedAt is older than staleDays (stale)', () => {
    // enriched 10 days ago — beyond 7-day staleDays window
    const staleEnriched = NOW - 10 * 86400000;
    const result = historyPredicate(
      { enrichmentDepth: 3, lastEnrichedAt: staleEnriched },
      stubConfig
    );
    expect(result.activated).toBe(true);
    expect(result.reason).toMatch(/stale/i);
    expect(result.metadata?.isStale).toBe(true);
  });

  it('blocks (conservative) when enrichmentDepth >= maxDepth AND lastEnrichedAt is undefined', () => {
    // No timestamp — treat as not stale (do not re-enrich)
    const result = historyPredicate({ enrichmentDepth: 3 }, stubConfig);
    expect(result.activated).toBe(false);
    expect(result.metadata?.isStale).toBe(false);
  });

  it('allows when enrichmentDepth is undefined (existing behavior preserved)', () => {
    const result = historyPredicate({}, stubConfig);
    expect(result.activated).toBe(true);
    expect(result.reason).toMatch(/No enrichment depth/i);
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

describe('makePermissiveContext', () => {
  it('returns a context that passes all four core predicates', () => {
    const ctx = makePermissiveContext();
    const routeResult = routePredicate(ctx, stubConfig);
    const timeResult = timePredicate(ctx, stubConfig);
    const historyResult = historyPredicate(ctx, stubConfig);
    const binderResult = binderTypePredicate(ctx, stubConfig);

    expect(routeResult.activated).toBe(true);
    expect(timeResult.activated).toBe(true);
    expect(historyResult.activated).toBe(true);
    expect(binderResult.activated).toBe(true);
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
