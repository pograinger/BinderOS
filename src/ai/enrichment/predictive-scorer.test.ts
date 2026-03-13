/**
 * Unit tests for predictive enrichment scorer.
 *
 * Tests cover:
 * - Momentum-weighted category ranking
 * - Cold-start static ordering
 * - Entity trajectory boost
 * - Depth map exclusions
 * - Null atomSignals uniform base
 * - Entity question candidate generation
 *
 * Phase 32: PRED-01
 */

import { describe, it, expect } from 'vitest';
import {
  predictEnrichmentOrder,
  generateEntityQuestions,
} from './predictive-scorer';
import type { MomentumVector, CategoryRanking, PredictionConfig } from './predictive-scorer';
import type { MissingInfoCategory } from '../clarification/types';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const ALL_CATEGORIES: MissingInfoCategory[] = [
  'missing-outcome',
  'missing-next-action',
  'missing-timeframe',
  'missing-context',
  'missing-reference',
];

const BASE_CONFIG: PredictionConfig = {
  windowSize: 20,
  maxWindowHours: 48,
  momentumHalfLife: 5,
  coldStartThreshold: 15,
  entityColdStartThreshold: 10,
  cacheTtlMs: 300000,
};

const SIGNAL_CATEGORY_MAP: Record<string, string[]> = {
  'priority-matrix': ['missing-outcome', 'missing-timeframe'],
  'collaboration-type': ['missing-context', 'missing-reference'],
  'cognitive-load': ['missing-next-action'],
  'gtd-horizon': ['missing-outcome'],
  'time-estimate': ['missing-timeframe'],
  'energy-level': ['missing-context'],
  'knowledge-domain': ['missing-reference'],
};

const ENTITY_CATEGORY_MAP: Record<string, string[]> = {
  PER: ['missing-context'],
  LOC: ['missing-context'],
  ORG: ['missing-context', 'missing-reference'],
};

const ENTITY_TYPE_PRIORITY_WEIGHTS: Record<string, number> = {
  PER: 1.5,
  LOC: 1.0,
  ORG: 1.2,
};

const WARM_MOMENTUM: MomentumVector = {
  signalFrequency: {
    'priority-matrix': 3.5,
    'time-estimate': 2.1,
    'cognitive-load': 1.0,
    'collaboration-type': 0.5,
    'knowledge-domain': 0.3,
  },
  signalStrength: {
    'priority-matrix': 2.8,
    'time-estimate': 1.8,
    'cognitive-load': 0.7,
    'collaboration-type': 0.4,
    'knowledge-domain': 0.2,
  },
  entityScores: {},
  coldStart: false,
  atomCount: 20,
};

const COLD_MOMENTUM: MomentumVector = {
  signalFrequency: {},
  signalStrength: {},
  entityScores: {},
  coldStart: true,
  atomCount: 5,
};

const ATOM_SIGNALS = {
  signals: {
    'priority-matrix': { label: 'urgent-important', confidence: 0.85 },
    'time-estimate': { label: 'medium', confidence: 0.6 },
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('predictEnrichmentOrder', () => {
  it('returns categories ranked by momentum-weighted relevance (not static) with warm momentum + self-signal', () => {
    const rankings = predictEnrichmentOrder(
      ATOM_SIGNALS,
      WARM_MOMENTUM,
      {},
      {},
      {
        signalCategoryMap: SIGNAL_CATEGORY_MAP,
        entityCategoryMap: ENTITY_CATEGORY_MAP,
        entityTypePriorityWeights: ENTITY_TYPE_PRIORITY_WEIGHTS,
      }
    );

    // All categories should be returned
    expect(rankings).toHaveLength(ALL_CATEGORIES.length);

    // Should return CategoryRanking[] with required fields
    for (const r of rankings) {
      expect(r).toHaveProperty('category');
      expect(r).toHaveProperty('score');
      expect(r).toHaveProperty('explanation');
      expect(typeof r.score).toBe('number');
    }

    // Rankings should NOT be in the static order — warm momentum re-orders categories
    const categories = rankings.map((r) => r.category);
    const staticOrder = [...ALL_CATEGORIES];
    // At least one category should be out of its static position
    const isReordered = categories.some((cat, i) => cat !== staticOrder[i]);
    expect(isReordered).toBe(true);

    // All scores should be positive (not cold-start zeros)
    for (const r of rankings) {
      expect(r.score).toBeGreaterThan(0);
    }
  });

  it('promotes missing-timeframe and missing-outcome with rising priority-matrix momentum', () => {
    const risingMomentum: MomentumVector = {
      signalFrequency: { 'priority-matrix': 10.0 },
      signalStrength: { 'priority-matrix': 9.0 },
      entityScores: {},
      coldStart: false,
      atomCount: 20,
    };

    const rankings = predictEnrichmentOrder(
      null,
      risingMomentum,
      {},
      {},
      {
        signalCategoryMap: SIGNAL_CATEGORY_MAP,
        entityCategoryMap: ENTITY_CATEGORY_MAP,
        entityTypePriorityWeights: ENTITY_TYPE_PRIORITY_WEIGHTS,
      }
    );

    const categories = rankings.map((r) => r.category);
    const outcomeIdx = categories.indexOf('missing-outcome');
    const timeframeIdx = categories.indexOf('missing-timeframe');
    const referenceIdx = categories.indexOf('missing-reference');

    // Both outcome and timeframe should rank above reference (no priority-matrix mapping)
    expect(outcomeIdx).toBeLessThan(referenceIdx);
    expect(timeframeIdx).toBeLessThan(referenceIdx);
  });

  it('boosts categories mapped via entityCategoryMap when entity trajectory scores are high', () => {
    const entityScores: Record<string, number> = {
      'entity-per-123': 5.0, // PER entity → missing-context
    };

    // entityTypes map: entity-per-123 → PER
    const entityTypeMap: Record<string, string> = {
      'entity-per-123': 'PER',
    };

    const rankings = predictEnrichmentOrder(
      null,
      { ...WARM_MOMENTUM, signalFrequency: {}, signalStrength: {} },
      entityScores,
      {},
      {
        signalCategoryMap: SIGNAL_CATEGORY_MAP,
        entityCategoryMap: ENTITY_CATEGORY_MAP,
        entityTypePriorityWeights: ENTITY_TYPE_PRIORITY_WEIGHTS,
        entityTypeMap,
      }
    );

    const categories = rankings.map((r) => r.category);
    const contextIdx = categories.indexOf('missing-context');
    const outcomeIdx = categories.indexOf('missing-outcome');
    // missing-context boosted by PER entity should rank above missing-outcome (no entity boost)
    expect(contextIdx).toBeLessThan(outcomeIdx);
  });

  it('returns static ordering with coldStart: true regardless of momentum values', () => {
    const rankings = predictEnrichmentOrder(
      ATOM_SIGNALS,
      COLD_MOMENTUM,
      {},
      {},
      {
        signalCategoryMap: SIGNAL_CATEGORY_MAP,
        entityCategoryMap: ENTITY_CATEGORY_MAP,
        entityTypePriorityWeights: ENTITY_TYPE_PRIORITY_WEIGHTS,
      }
    );

    // Cold-start returns all categories
    expect(rankings).toHaveLength(ALL_CATEGORIES.length);

    // All scores should be 0 (static ordering, cold-start sentinel)
    for (const r of rankings) {
      expect(r.score).toBe(0);
      expect(r.explanation).toContain('cold-start');
    }

    // Order should match static ALL_CATEGORIES order
    const categories = rankings.map((r) => r.category);
    expect(categories).toEqual(ALL_CATEGORIES);
  });

  it('excludes categories at max depth in depthMap', () => {
    const maxDepth = 3;
    const depthMap: Record<string, number> = {
      'missing-outcome': maxDepth,  // at max → excluded
    };

    const rankings = predictEnrichmentOrder(
      null,
      WARM_MOMENTUM,
      {},
      depthMap,
      {
        signalCategoryMap: SIGNAL_CATEGORY_MAP,
        entityCategoryMap: ENTITY_CATEGORY_MAP,
        entityTypePriorityWeights: ENTITY_TYPE_PRIORITY_WEIGHTS,
        maxEnrichmentDepth: maxDepth,
      }
    );

    const categories = rankings.map((r) => r.category);
    expect(categories).not.toContain('missing-outcome');
    expect(rankings).toHaveLength(ALL_CATEGORIES.length - 1);
  });

  it('uses uniform base relevance (1.0) when atomSignals is null — momentum still produces meaningful ordering', () => {
    const rankingsWithNull = predictEnrichmentOrder(
      null,
      WARM_MOMENTUM,
      {},
      {},
      {
        signalCategoryMap: SIGNAL_CATEGORY_MAP,
        entityCategoryMap: ENTITY_CATEGORY_MAP,
        entityTypePriorityWeights: ENTITY_TYPE_PRIORITY_WEIGHTS,
      }
    );

    const rankingsWithSignals = predictEnrichmentOrder(
      ATOM_SIGNALS,
      WARM_MOMENTUM,
      {},
      {},
      {
        signalCategoryMap: SIGNAL_CATEGORY_MAP,
        entityCategoryMap: ENTITY_CATEGORY_MAP,
        entityTypePriorityWeights: ENTITY_TYPE_PRIORITY_WEIGHTS,
      }
    );

    // Both should return all categories (not empty)
    expect(rankingsWithNull).toHaveLength(ALL_CATEGORIES.length);
    expect(rankingsWithSignals).toHaveLength(ALL_CATEGORIES.length);

    // Null-signal scores should all be >= 1.0 (uniform base not 0)
    for (const r of rankingsWithNull) {
      expect(r.score).toBeGreaterThanOrEqual(1.0);
    }
  });

  it('produces ordering barely different from static when momentum values are all equal and minimal', () => {
    // When all signals have the same tiny momentum value, normalization makes boost equal for all categories
    // The ordering should fall back to tie-breaking by static index (same as static ordering)
    const uniformMomentum: MomentumVector = {
      signalFrequency: {
        'priority-matrix': 0.001,
        'collaboration-type': 0.001,
        'cognitive-load': 0.001,
        'gtd-horizon': 0.001,
        'time-estimate': 0.001,
        'energy-level': 0.001,
        'knowledge-domain': 0.001,
      },
      signalStrength: {
        'priority-matrix': 0.001,
        'collaboration-type': 0.001,
        'cognitive-load': 0.001,
        'gtd-horizon': 0.001,
        'time-estimate': 0.001,
        'energy-level': 0.001,
        'knowledge-domain': 0.001,
      },
      entityScores: {},
      coldStart: false,
      atomCount: 20,
    };

    const rankings = predictEnrichmentOrder(
      null,
      uniformMomentum,
      {},
      {},
      {
        signalCategoryMap: SIGNAL_CATEGORY_MAP,
        entityCategoryMap: ENTITY_CATEGORY_MAP,
        entityTypePriorityWeights: ENTITY_TYPE_PRIORITY_WEIGHTS,
      }
    );

    // All scores should be positive (non-cold-start)
    for (const r of rankings) {
      expect(r.score).toBeGreaterThan(0);
    }

    // With uniform momentum and null atomSignals (uniform base), order should follow static tie-break
    // The categories with more mapped signals may score slightly higher due to averaging
    // but the order should be deterministic
    expect(rankings).toHaveLength(ALL_CATEGORIES.length);

    // Scores should be consistent (all similar magnitude when uniform momentum)
    const scores = rankings.map((r) => r.score);
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    // Ratio should not be extreme (similar base relevance across categories)
    expect(maxScore / minScore).toBeLessThan(3.0);
  });
});

describe('generateEntityQuestions', () => {
  it('caps entity question candidates at 2 per session by default', () => {
    const entityScores: Record<string, number> = {
      'entity-per-1': 5.0,
      'entity-per-2': 4.0,
      'entity-org-1': 3.0,
      'entity-loc-1': 2.0,
    };
    const entityTypeMap: Record<string, string> = {
      'entity-per-1': 'PER',
      'entity-per-2': 'PER',
      'entity-org-1': 'ORG',
      'entity-loc-1': 'LOC',
    };

    const candidates = generateEntityQuestions(
      entityScores,
      ENTITY_CATEGORY_MAP,
      ENTITY_TYPE_PRIORITY_WEIGHTS,
      entityTypeMap
    );

    // Default cap is 2
    expect(candidates.length).toBeLessThanOrEqual(2);
  });

  it('respects custom cap parameter', () => {
    const entityScores: Record<string, number> = {
      'entity-per-1': 5.0,
      'entity-per-2': 4.0,
      'entity-org-1': 3.0,
    };
    const entityTypeMap: Record<string, string> = {
      'entity-per-1': 'PER',
      'entity-per-2': 'PER',
      'entity-org-1': 'ORG',
    };

    const candidates = generateEntityQuestions(
      entityScores,
      ENTITY_CATEGORY_MAP,
      ENTITY_TYPE_PRIORITY_WEIGHTS,
      entityTypeMap,
      1
    );

    expect(candidates.length).toBe(1);
  });

  it('returns candidates with required fields', () => {
    const entityScores: Record<string, number> = {
      'entity-per-1': 5.0,
    };
    const entityTypeMap: Record<string, string> = {
      'entity-per-1': 'PER',
    };

    const candidates = generateEntityQuestions(
      entityScores,
      ENTITY_CATEGORY_MAP,
      ENTITY_TYPE_PRIORITY_WEIGHTS,
      entityTypeMap
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toHaveProperty('entityId', 'entity-per-1');
    expect(candidates[0]).toHaveProperty('category');
    expect(candidates[0]).toHaveProperty('score');
    expect(candidates[0]).toHaveProperty('explanation');
  });

  it('returns candidates sorted by score descending', () => {
    const entityScores: Record<string, number> = {
      'entity-per-1': 2.0,
      'entity-org-1': 8.0,  // higher score
    };
    const entityTypeMap: Record<string, string> = {
      'entity-per-1': 'PER',
      'entity-org-1': 'ORG',
    };

    const candidates = generateEntityQuestions(
      entityScores,
      ENTITY_CATEGORY_MAP,
      ENTITY_TYPE_PRIORITY_WEIGHTS,
      entityTypeMap,
      2
    );

    expect(candidates[0].entityId).toBe('entity-org-1');
    expect(candidates[1].entityId).toBe('entity-per-1');
  });
});
