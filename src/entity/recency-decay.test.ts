/**
 * Tests for computeEntityRelevance — 30-day half-life exponential decay.
 *
 * Phase 29: ENTC-02
 */

import { describe, it, expect } from 'vitest';
import { computeEntityRelevance, HALF_LIFE_DAYS } from './recency-decay';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('computeEntityRelevance', () => {
  it('returns full mentionCount at 0 days (no decay)', () => {
    const now = Date.now();
    const result = computeEntityRelevance(10, now, now);
    expect(result).toBeCloseTo(10, 5);
  });

  it('returns ~50% at 30 days (half-life)', () => {
    const now = Date.now();
    const lastSeen = now - 30 * DAY_MS;
    const result = computeEntityRelevance(10, lastSeen, now);
    expect(result).toBeCloseTo(5, 1);
  });

  it('returns ~25% at 60 days (two half-lives)', () => {
    const now = Date.now();
    const lastSeen = now - 60 * DAY_MS;
    const result = computeEntityRelevance(10, lastSeen, now);
    expect(result).toBeCloseTo(2.5, 1);
  });

  it('returns near 0 at 365 days', () => {
    const now = Date.now();
    const lastSeen = now - 365 * DAY_MS;
    const result = computeEntityRelevance(1, lastSeen, now);
    expect(result).toBeLessThan(0.1);
  });

  it('scales proportionally with mentionCount at same age', () => {
    const now = Date.now();
    const lastSeen = now - 15 * DAY_MS;
    const r1 = computeEntityRelevance(1, lastSeen, now);
    const r10 = computeEntityRelevance(10, lastSeen, now);
    expect(r10).toBeCloseTo(r1 * 10, 5);
  });

  it('uses current time when nowMs is omitted', () => {
    const now = Date.now();
    const lastSeen = now - 30 * DAY_MS;
    // Should not throw and should return approximately half the mentionCount
    const result = computeEntityRelevance(10, lastSeen);
    expect(result).toBeGreaterThan(3);
    expect(result).toBeLessThan(7);
  });

  it('exports HALF_LIFE_DAYS constant as 30', () => {
    expect(HALF_LIFE_DAYS).toBe(30);
  });
});
