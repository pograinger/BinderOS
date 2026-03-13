/**
 * Unit tests for computeConsensus voter function.
 *
 * Covers:
 * - Empty input throws
 * - Unanimous agreement (all 4 at p=0.8 → weightedProbability=0.8, agreementScore=1.0)
 * - Split vote (2 at p=0.7, 2 at p=0.3 → agreementScore < 1.0)
 * - Weighted average bias (higher-weight specialists dominate)
 * - specialistContributions length and shape
 * - computedAt is a recent timestamp
 * - SPECIALIST_FEATURE_SLICES has 4 entries with correct names
 *
 * Phase 36: CONS-02
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { computeConsensus } from './consensus-voter';
import { SPECIALIST_WEIGHTS, SPECIALIST_FEATURE_SLICES } from './types';
import type { SpecialistOutput } from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSpecialist(name: string, probability: number, weight: number): SpecialistOutput {
  return { name, probability, weight };
}

// ---------------------------------------------------------------------------
// computeConsensus — empty input
// ---------------------------------------------------------------------------

describe('computeConsensus — empty input', () => {
  it('throws Error when outputs array is empty', () => {
    expect(() => computeConsensus([])).toThrowError('No specialist outputs');
  });
});

// ---------------------------------------------------------------------------
// computeConsensus — unanimous agreement
// ---------------------------------------------------------------------------

describe('computeConsensus — unanimous agreement (all p=0.8, w=1.0)', () => {
  const specialists: SpecialistOutput[] = [
    makeSpecialist('time-pressure', 0.8, 1.0),
    makeSpecialist('dependency', 0.8, 1.0),
    makeSpecialist('staleness', 0.8, 1.0),
    makeSpecialist('energy-context', 0.8, 1.0),
  ];

  it('weightedProbability is 0.8', () => {
    const result = computeConsensus(specialists);
    expect(result.weightedProbability).toBeCloseTo(0.8, 6);
  });

  it('majorityVote is true', () => {
    const result = computeConsensus(specialists);
    expect(result.majorityVote).toBe(true);
  });

  it('agreementScore is 1.0', () => {
    const result = computeConsensus(specialists);
    expect(result.agreementScore).toBeCloseTo(1.0, 6);
  });

  it('specialistContributions has 4 entries', () => {
    const result = computeConsensus(specialists);
    expect(result.specialistContributions).toHaveLength(4);
  });

  it('each contribution has name, probability, weight', () => {
    const result = computeConsensus(specialists);
    for (const contrib of result.specialistContributions) {
      expect(contrib).toHaveProperty('name');
      expect(contrib).toHaveProperty('probability');
      expect(contrib).toHaveProperty('weight');
    }
  });

  it('computedAt is a recent timestamp', () => {
    const before = Date.now();
    const result = computeConsensus(specialists);
    const after = Date.now();
    expect(result.computedAt).toBeGreaterThanOrEqual(before);
    expect(result.computedAt).toBeLessThanOrEqual(after);
  });
});

// ---------------------------------------------------------------------------
// computeConsensus — split vote
// ---------------------------------------------------------------------------

describe('computeConsensus — split vote (2 at p=0.7, 2 at p=0.3, equal weights)', () => {
  const specialists: SpecialistOutput[] = [
    makeSpecialist('time-pressure', 0.7, 1.0),
    makeSpecialist('dependency', 0.7, 1.0),
    makeSpecialist('staleness', 0.3, 1.0),
    makeSpecialist('energy-context', 0.3, 1.0),
  ];

  it('agreementScore is less than 1.0', () => {
    const result = computeConsensus(specialists);
    expect(result.agreementScore).toBeLessThan(1.0);
  });

  it('agreementScore is approximately 0.33 (1 agreeing pair out of 3 pairs for each side, total 2 out of 6 pairs)', () => {
    // 6 pairs total: (tp,dep)=agree, (tp,sta)=disagree, (tp,en)=disagree, (dep,sta)=disagree, (dep,en)=disagree, (sta,en)=agree
    // 2 agreeing pairs / 6 total = 0.333...
    const result = computeConsensus(specialists);
    expect(result.agreementScore).toBeCloseTo(2 / 6, 3);
  });

  it('weightedProbability is 0.5 (average of 0.7+0.7+0.3+0.3 / 4)', () => {
    const result = computeConsensus(specialists);
    expect(result.weightedProbability).toBeCloseTo(0.5, 6);
  });
});

// ---------------------------------------------------------------------------
// computeConsensus — majority vote edge cases
// ---------------------------------------------------------------------------

describe('computeConsensus — majority vote logic', () => {
  it('3 out of 4 above threshold → majorityVote true', () => {
    const specialists: SpecialistOutput[] = [
      makeSpecialist('time-pressure', 0.9, 1.0),
      makeSpecialist('dependency', 0.8, 1.0),
      makeSpecialist('staleness', 0.6, 1.0),
      makeSpecialist('energy-context', 0.2, 1.0),
    ];
    const result = computeConsensus(specialists);
    expect(result.majorityVote).toBe(true);
  });

  it('all below threshold → majorityVote false', () => {
    const specialists: SpecialistOutput[] = [
      makeSpecialist('time-pressure', 0.1, 1.0),
      makeSpecialist('dependency', 0.2, 1.0),
      makeSpecialist('staleness', 0.3, 1.0),
      makeSpecialist('energy-context', 0.4, 1.0),
    ];
    const result = computeConsensus(specialists);
    expect(result.majorityVote).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeConsensus — weighted bias
// ---------------------------------------------------------------------------

describe('computeConsensus — weighted specialists bias result toward higher-weight inputs', () => {
  // Weights: time-pressure=1.5, dependency=1.5, staleness=1.0, energy-context=1.0
  // Probabilities: [0.9, 0.1, 0.5, 0.5]
  // Weighted avg = (0.9*1.5 + 0.1*1.5 + 0.5*1.0 + 0.5*1.0) / (1.5+1.5+1.0+1.0)
  //              = (1.35 + 0.15 + 0.5 + 0.5) / 5.0
  //              = 2.5 / 5.0 = 0.5
  // Unweighted avg = (0.9+0.1+0.5+0.5)/4 = 0.5 (same here, same by coincidence)

  // Use a case where unweighted vs weighted differ:
  // Weights: [1.5, 1.5, 1.0, 1.0], probs: [0.9, 0.9, 0.1, 0.1]
  // Weighted: (0.9*1.5 + 0.9*1.5 + 0.1*1.0 + 0.1*1.0) / 5.0 = (1.35+1.35+0.1+0.1)/5 = 2.9/5 = 0.58
  // Unweighted: (0.9+0.9+0.1+0.1)/4 = 0.5
  // Weighted result (0.58) > unweighted (0.5) because higher-weight specialists at higher prob dominate

  it('weighted average is biased toward higher-weight specialists', () => {
    const specialists: SpecialistOutput[] = [
      makeSpecialist('time-pressure', 0.9, 1.5),
      makeSpecialist('dependency', 0.9, 1.5),
      makeSpecialist('staleness', 0.1, 1.0),
      makeSpecialist('energy-context', 0.1, 1.0),
    ];
    const result = computeConsensus(specialists);
    const unweightedAvg = (0.9 + 0.9 + 0.1 + 0.1) / 4; // 0.5
    // Weighted result should be above unweighted because high-weight specialists have high probability
    expect(result.weightedProbability).toBeGreaterThan(unweightedAvg);
    expect(result.weightedProbability).toBeCloseTo(2.9 / 5.0, 6);
  });
});

// ---------------------------------------------------------------------------
// computeConsensus — single specialist
// ---------------------------------------------------------------------------

describe('computeConsensus — single specialist', () => {
  it('single specialist returns that specialist probability and agreement 1.0', () => {
    const result = computeConsensus([makeSpecialist('time-pressure', 0.75, 1.0)]);
    expect(result.weightedProbability).toBeCloseTo(0.75, 6);
    expect(result.agreementScore).toBeCloseTo(1.0, 6);
    expect(result.majorityVote).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// SPECIALIST_WEIGHTS — constant validation
// ---------------------------------------------------------------------------

describe('SPECIALIST_WEIGHTS', () => {
  it('has time-pressure = 1.5', () => {
    expect(SPECIALIST_WEIGHTS['time-pressure']).toBe(1.5);
  });

  it('has dependency = 1.5', () => {
    expect(SPECIALIST_WEIGHTS['dependency']).toBe(1.5);
  });

  it('has staleness = 1.0', () => {
    expect(SPECIALIST_WEIGHTS['staleness']).toBe(1.0);
  });

  it('has energy-context = 1.0', () => {
    expect(SPECIALIST_WEIGHTS['energy-context']).toBe(1.0);
  });
});

// ---------------------------------------------------------------------------
// SPECIALIST_FEATURE_SLICES — structure validation
// ---------------------------------------------------------------------------

describe('SPECIALIST_FEATURE_SLICES', () => {
  it('has exactly 4 entries', () => {
    expect(Object.keys(SPECIALIST_FEATURE_SLICES)).toHaveLength(4);
  });

  it('has entries for time-pressure, dependency, staleness, energy-context', () => {
    expect(SPECIALIST_FEATURE_SLICES).toHaveProperty('time-pressure');
    expect(SPECIALIST_FEATURE_SLICES).toHaveProperty('dependency');
    expect(SPECIALIST_FEATURE_SLICES).toHaveProperty('staleness');
    expect(SPECIALIST_FEATURE_SLICES).toHaveProperty('energy-context');
  });

  it('each entry has name, featureIndices array, hiddenLayers array', () => {
    for (const [key, slice] of Object.entries(SPECIALIST_FEATURE_SLICES)) {
      expect(slice).toHaveProperty('name');
      expect(Array.isArray(slice.featureIndices)).toBe(true);
      expect(slice.featureIndices.length).toBeGreaterThan(0);
      expect(Array.isArray(slice.hiddenLayers)).toBe(true);
      expect(slice.hiddenLayers.length).toBeGreaterThan(0);
      // name should match key
      expect(slice.name).toBe(key);
    }
  });

  it('time-pressure includes has_deadline index (task dim 2)', () => {
    // has_deadline is at index 2 in task dims
    expect(SPECIALIST_FEATURE_SLICES['time-pressure']!.featureIndices).toContain(2);
  });

  it('time-pressure includes all calendar dims (indices 50-83)', () => {
    const calStart = 27 + 23; // TASK_DIM + PERSON_DIM = 50
    const calEnd = calStart + 34 - 1; // = 83
    const indices = SPECIALIST_FEATURE_SLICES['time-pressure']!.featureIndices;
    for (let i = calStart; i <= calEnd; i++) {
      expect(indices).toContain(i);
    }
  });

  it('dependency includes is_waiting_for index (task dim 8)', () => {
    expect(SPECIALIST_FEATURE_SLICES['dependency']!.featureIndices).toContain(8);
  });

  it('dependency includes all person dims (indices 27-49)', () => {
    const personStart = 27; // TASK_DIM = 27
    const personEnd = personStart + 23 - 1; // = 49
    const indices = SPECIALIST_FEATURE_SLICES['dependency']!.featureIndices;
    for (let i = personStart; i <= personEnd; i++) {
      expect(indices).toContain(i);
    }
  });

  it('staleness includes age_norm index (task dim 0)', () => {
    expect(SPECIALIST_FEATURE_SLICES['staleness']!.featureIndices).toContain(0);
  });

  it('staleness includes staleness_norm index (task dim 1)', () => {
    expect(SPECIALIST_FEATURE_SLICES['staleness']!.featureIndices).toContain(1);
  });

  it('all feature indices are valid (0-83)', () => {
    for (const slice of Object.values(SPECIALIST_FEATURE_SLICES)) {
      for (const idx of slice.featureIndices) {
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(84); // 27 + 23 + 34 = 84
      }
    }
  });
});
