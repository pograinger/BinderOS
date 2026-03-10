/**
 * Tests for maturity scoring.
 *
 * Phase 24: ENRICH-07
 */

import { describe, it, expect } from 'vitest';
import { computeMaturity, MATURITY_CATEGORIES } from './maturity';

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
