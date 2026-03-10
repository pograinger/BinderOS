/**
 * Tests for maturity scoring.
 *
 * Phase 24: ENRICH-07
 */

import { describe, it, expect } from 'vitest';
import { computeMaturity, computeDepthWeightedMaturity, MATURITY_CATEGORIES } from './maturity';

describe('computeMaturity', () => {
  it('returns 0 for empty enrichments', () => {
    expect(computeMaturity({})).toBe(0);
  });

  it('returns 1.0 when all 5 categories are filled (display keys)', () => {
    const enrichments: Record<string, string> = {
      'Outcome': 'Ship feature',
      'Next Action': 'Write tests',
      'Deadline': '2026-04-01',
      'Context': 'Work project',
      'Reference': 'JIRA-123',
    };
    expect(computeMaturity(enrichments)).toBe(1.0);
  });

  it('returns 1.0 when all 5 categories are filled (MissingInfoCategory keys)', () => {
    const enrichments: Record<string, string> = {
      'missing-outcome': 'Ship feature',
      'missing-next-action': 'Write tests',
      'missing-timeframe': '2026-04-01',
      'missing-context': 'Work project',
      'missing-reference': 'JIRA-123',
    };
    expect(computeMaturity(enrichments)).toBe(1.0);
  });

  it('returns 0.6 with 3 of 5 filled', () => {
    const enrichments: Record<string, string> = {
      'Outcome': 'Ship feature',
      'Next Action': 'Write tests',
      'Deadline': '2026-04-01',
    };
    expect(computeMaturity(enrichments)).toBeCloseTo(0.6);
  });

  it('returns 0.2 with 1 of 5 filled', () => {
    const enrichments: Record<string, string> = {
      'Outcome': 'Ship feature',
    };
    expect(computeMaturity(enrichments)).toBeCloseTo(0.2);
  });

  it('handles mixed key forms without double-counting', () => {
    const enrichments: Record<string, string> = {
      'Outcome': 'Ship feature',
      'missing-outcome': 'Also here',  // same category, should not double count
      'Next Action': 'Write code',
    };
    expect(computeMaturity(enrichments)).toBeCloseTo(0.4);
  });

  it('MATURITY_CATEGORIES has 5 entries', () => {
    expect(MATURITY_CATEGORIES).toHaveLength(5);
  });

  it('ignores unrecognized keys', () => {
    const enrichments: Record<string, string> = {
      'Outcome': 'Ship feature',
      'SomeRandomKey': 'irrelevant',
    };
    expect(computeMaturity(enrichments)).toBeCloseTo(0.2);
  });
});

describe('computeDepthWeightedMaturity', () => {
  it('returns 0 for empty depth map', () => {
    expect(computeDepthWeightedMaturity({})).toBe(0);
  });

  it('returns ~0.33 with 5 categories at depth 1 (maxDepth 3)', () => {
    const depthMap: Record<string, number> = {
      'missing-outcome': 1,
      'missing-next-action': 1,
      'missing-timeframe': 1,
      'missing-context': 1,
      'missing-reference': 1,
    };
    // 5 * (1/3) / 5 = 1/3 ~ 0.333
    expect(computeDepthWeightedMaturity(depthMap)).toBeCloseTo(1 / 3);
  });

  it('returns 1.0 with 5 categories at depth 3 (maxDepth 3)', () => {
    const depthMap: Record<string, number> = {
      'missing-outcome': 3,
      'missing-next-action': 3,
      'missing-timeframe': 3,
      'missing-context': 3,
      'missing-reference': 3,
    };
    expect(computeDepthWeightedMaturity(depthMap)).toBe(1.0);
  });

  it('returns ~0.267 with 2 categories at depth 2', () => {
    const depthMap: Record<string, number> = {
      'missing-outcome': 2,
      'missing-next-action': 2,
    };
    // (2/3 + 2/3) / 5 = 4/15 ~ 0.267
    expect(computeDepthWeightedMaturity(depthMap)).toBeCloseTo(4 / 15);
  });

  it('accepts display keys too', () => {
    const depthMap: Record<string, number> = {
      'Outcome': 2,
      'Next Action': 1,
    };
    // (2/3 + 1/3) / 5 = 1/5 = 0.2
    expect(computeDepthWeightedMaturity(depthMap)).toBeCloseTo(0.2);
  });

  it('clamps depth at maxDepth', () => {
    const depthMap: Record<string, number> = {
      'missing-outcome': 5,  // exceeds max of 3
    };
    // min(5,3)/3 / 5 = 1/5 = 0.2
    expect(computeDepthWeightedMaturity(depthMap)).toBeCloseTo(0.2);
  });

  it('accepts custom maxDepth', () => {
    const depthMap: Record<string, number> = {
      'missing-outcome': 2,
    };
    // min(2,2)/2 / 5 = 1/5 = 0.2
    expect(computeDepthWeightedMaturity(depthMap, 2)).toBeCloseTo(0.2);
  });
});
