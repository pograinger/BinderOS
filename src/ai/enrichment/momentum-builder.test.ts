/**
 * Unit tests for momentum builder.
 *
 * Tests cover:
 * - Windowed Dexie query with exponential decay
 * - Cold-start flag based on atom count
 * - Entity trajectory with recency decay and user-correction boost
 * - Prediction cache TTL, invalidation, harness hooks
 * - Hybrid window (atom count + time constraints)
 *
 * Dexie is mocked — no actual IndexedDB required.
 *
 * Phase 32: PRED-02
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { PredictionConfig } from '../../config/binder-types/schema';

// ---------------------------------------------------------------------------
// Mock db module
// ---------------------------------------------------------------------------

// We must mock before importing momentum-builder so the mock is in place
const mockAtomIds = ['atom-1', 'atom-2', 'atom-3', 'atom-4', 'atom-5'];

type AtomIntelligenceRow = {
  atomId: string;
  lastUpdated: number;
  cognitiveSignals: Array<{ modelId: string; label: string; confidence: number; timestamp: number }>;
  entityMentions: Array<{ entityId?: string; entityText: string; entityType: string; spanStart: number; spanEnd: number; confidence: number }>;
};

type EntityRow = {
  id: string;
  type: string;
  mentionCount: number;
  lastSeen: number;
};

type EntityRelationRow = {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  sourceAttribution: string;
};

let mockAtomIntelligenceRows: AtomIntelligenceRow[] = [];
let mockEntityRows: EntityRow[] = [];
let mockEntityRelationRows: EntityRelationRow[] = [];

vi.mock('../../storage/db', () => ({
  db: {
    atoms: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          primaryKeys: vi.fn(async () => mockAtomIds),
        })),
      })),
    },
    atomIntelligence: {
      where: vi.fn(() => ({
        anyOf: vi.fn(() => ({
          toArray: vi.fn(async () => mockAtomIntelligenceRows),
        })),
      })),
    },
    entities: {
      get: vi.fn(async (id: string) => mockEntityRows.find((e) => e.id === id)),
      where: vi.fn(() => ({
        anyOf: vi.fn(() => ({
          count: vi.fn(async () => mockEntityRows.length),
        })),
      })),
    },
    entityRelations: {
      where: vi.fn(() => ({
        anyOf: vi.fn(() => ({
          toArray: vi.fn(async () => mockEntityRelationRows),
        })),
      })),
    },
  },
}));

import {
  computeMomentumVector,
  computeEntityTrajectory,
  invalidateCache,
  getCacheState,
  getInvalidationLog,
  clearInvalidationLog,
} from './momentum-builder';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_CONFIG: PredictionConfig = {
  windowSize: 20,
  maxWindowHours: 48,
  momentumHalfLife: 5,
  coldStartThreshold: 3,
  entityColdStartThreshold: 2,
  cacheTtlMs: 300000,
};

const SHORT_TTL_CONFIG: PredictionConfig = {
  ...BASE_CONFIG,
  cacheTtlMs: 100, // 100ms — expires quickly in tests
};

const NOW = Date.now();
const HOUR_MS = 60 * 60 * 1000;

function makeAtomIntelligenceRow(
  atomId: string,
  signals: Array<{ modelId: string; label: string; confidence: number }>,
  lastUpdatedOffset = 0,
): AtomIntelligenceRow {
  return {
    atomId,
    lastUpdated: NOW - lastUpdatedOffset,
    cognitiveSignals: signals.map((s) => ({ ...s, timestamp: NOW - lastUpdatedOffset })),
    entityMentions: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeMomentumVector', () => {
  beforeEach(() => {
    // Clear cache and mocks before each test
    invalidateCache('binder-1', 'test-reset');
    clearInvalidationLog();
    mockAtomIntelligenceRows = [];
    mockEntityRows = [];
    mockEntityRelationRows = [];
  });

  it('computes momentum vector with correct frequency and strength for each signal label', async () => {
    mockAtomIntelligenceRows = [
      makeAtomIntelligenceRow('atom-1', [{ modelId: 'priority-matrix', label: 'urgent-important', confidence: 0.9 }]),
      makeAtomIntelligenceRow('atom-2', [{ modelId: 'priority-matrix', label: 'urgent-important', confidence: 0.8 }]),
      makeAtomIntelligenceRow('atom-3', [{ modelId: 'cognitive-load', label: 'high', confidence: 0.7 }]),
    ];

    const { momentum } = await computeMomentumVector('binder-1', BASE_CONFIG);

    // priority-matrix should appear twice → frequency > 0
    expect(momentum.signalFrequency['priority-matrix']).toBeGreaterThan(0);
    expect(momentum.signalStrength['priority-matrix']).toBeGreaterThan(0);
    // cognitive-load appears once → lower frequency than priority-matrix
    expect(momentum.signalFrequency['cognitive-load']).toBeGreaterThan(0);
    expect(momentum.signalFrequency['priority-matrix']).toBeGreaterThan(
      momentum.signalFrequency['cognitive-load'] ?? 0
    );
  });

  it('applies exponential decay — most recent atom contributes more than oldest', async () => {
    // atom-1 is newest (0 offset), atom-2 is at position 1 (older in window)
    mockAtomIntelligenceRows = [
      makeAtomIntelligenceRow('atom-1', [{ modelId: 'priority-matrix', label: 'urgent', confidence: 1.0 }], 0),
      makeAtomIntelligenceRow('atom-2', [{ modelId: 'cognitive-load', label: 'high', confidence: 1.0 }], HOUR_MS),
    ];

    // Both signals have same confidence (1.0). The signal in the more recent atom
    // should have higher decay weight (position 0) vs the older atom (position 1).
    // We can verify by checking that the signal from atom-1 dominates when
    // both have the same confidence. Since atom-1 is returned first (sorted desc by lastUpdated),
    // priority-matrix (position 0, weight=1.0) vs cognitive-load (position 1, weight=exp(-ln2/5)).
    const { momentum } = await computeMomentumVector('binder-1', BASE_CONFIG);

    // weight at position 0 = 1.0, weight at position 1 = exp(-ln2/5) ≈ 0.87
    // Both have confidence 1.0, so signalStrength reflects the decay weights
    const weight0 = 1.0;
    const weight1 = Math.exp(-(Math.LN2 / BASE_CONFIG.momentumHalfLife) * 1);

    expect(momentum.signalStrength['priority-matrix']).toBeCloseTo(weight0 * 1.0, 5);
    expect(momentum.signalStrength['cognitive-load']).toBeCloseTo(weight1 * 1.0, 5);
    expect(momentum.signalStrength['priority-matrix']).toBeGreaterThan(momentum.signalStrength['cognitive-load'] ?? 0);
  });

  it('sets coldStart: true when atom count with signals < coldStartThreshold', async () => {
    // coldStartThreshold is 3, we have 2 atoms with signals
    mockAtomIntelligenceRows = [
      makeAtomIntelligenceRow('atom-1', [{ modelId: 'priority-matrix', label: 'urgent', confidence: 0.9 }]),
      makeAtomIntelligenceRow('atom-2', [{ modelId: 'cognitive-load', label: 'high', confidence: 0.7 }]),
    ];

    const { momentum } = await computeMomentumVector('binder-1', { ...BASE_CONFIG, coldStartThreshold: 3 });
    expect(momentum.coldStart).toBe(true);
  });

  it('sets coldStart: false when atom count with signals >= coldStartThreshold', async () => {
    // coldStartThreshold is 3, we have 3 atoms with signals
    mockAtomIntelligenceRows = [
      makeAtomIntelligenceRow('atom-1', [{ modelId: 'priority-matrix', label: 'urgent', confidence: 0.9 }]),
      makeAtomIntelligenceRow('atom-2', [{ modelId: 'cognitive-load', label: 'high', confidence: 0.7 }]),
      makeAtomIntelligenceRow('atom-3', [{ modelId: 'time-estimate', label: 'medium', confidence: 0.6 }]),
    ];

    const { momentum } = await computeMomentumVector('binder-1', { ...BASE_CONFIG, coldStartThreshold: 3 });
    expect(momentum.coldStart).toBe(false);
  });

  it('respects hybrid window — excludes atoms older than maxWindowHours', async () => {
    // atom-3 is 50 hours old — outside 48h window
    mockAtomIntelligenceRows = [
      makeAtomIntelligenceRow('atom-1', [{ modelId: 'priority-matrix', label: 'urgent', confidence: 0.9 }], 0),
      makeAtomIntelligenceRow('atom-2', [{ modelId: 'cognitive-load', label: 'high', confidence: 0.7 }], HOUR_MS),
      makeAtomIntelligenceRow('atom-3', [{ modelId: 'time-estimate', label: 'long', confidence: 0.8 }], 50 * HOUR_MS),
    ];

    const { momentum } = await computeMomentumVector('binder-1', BASE_CONFIG);
    // time-estimate from atom-3 (outside window) should NOT appear
    expect(momentum.signalFrequency['time-estimate']).toBeUndefined();
    // priority-matrix and cognitive-load (inside window) should appear
    expect(momentum.signalFrequency['priority-matrix']).toBeGreaterThan(0);
  });

  it('returns cached result within TTL without recomputation', async () => {
    invalidateCache('binder-cache', 'test-reset');
    mockAtomIntelligenceRows = [
      makeAtomIntelligenceRow('atom-1', [{ modelId: 'priority-matrix', label: 'urgent', confidence: 0.9 }]),
    ];

    const result1 = await computeMomentumVector('binder-cache', BASE_CONFIG);

    // Change the mock data — should not affect cached result
    mockAtomIntelligenceRows = [
      makeAtomIntelligenceRow('atom-1', [{ modelId: 'cognitive-load', label: 'high', confidence: 0.5 }]),
    ];

    const result2 = await computeMomentumVector('binder-cache', BASE_CONFIG);

    // Both should be identical (cache hit)
    expect(result2.momentum.signalFrequency).toEqual(result1.momentum.signalFrequency);
  });

  it('recomputes after TTL expiry', async () => {
    invalidateCache('binder-ttl', 'test-reset');
    mockAtomIntelligenceRows = [
      makeAtomIntelligenceRow('atom-1', [{ modelId: 'priority-matrix', label: 'urgent', confidence: 0.9 }]),
    ];

    await computeMomentumVector('binder-ttl', SHORT_TTL_CONFIG);

    // Wait for TTL to expire (100ms config)
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Change mock data
    mockAtomIntelligenceRows = [
      makeAtomIntelligenceRow('atom-1', [{ modelId: 'cognitive-load', label: 'high', confidence: 0.5 }]),
    ];

    const result2 = await computeMomentumVector('binder-ttl', SHORT_TTL_CONFIG);
    // Should have recomputed — cognitive-load should be present, not priority-matrix
    expect(result2.momentum.signalFrequency['cognitive-load']).toBeGreaterThan(0);
    expect(result2.momentum.signalFrequency['priority-matrix']).toBeUndefined();
  });
});

describe('cache management', () => {
  beforeEach(() => {
    clearInvalidationLog();
    invalidateCache('binder-1', 'test-reset');
  });

  it('invalidateCache clears the cache entry — next call recomputes', async () => {
    mockAtomIntelligenceRows = [
      makeAtomIntelligenceRow('atom-1', [{ modelId: 'priority-matrix', label: 'urgent', confidence: 0.9 }]),
    ];

    await computeMomentumVector('binder-inv', BASE_CONFIG);

    // Entry should be cached
    expect(getCacheState('binder-inv')).toBeDefined();

    invalidateCache('binder-inv', 'test');

    // Entry should be gone
    expect(getCacheState('binder-inv')).toBeUndefined();
  });

  it('getCacheState returns current cache entry or undefined', async () => {
    invalidateCache('binder-get', 'test-reset');
    expect(getCacheState('binder-get')).toBeUndefined();

    mockAtomIntelligenceRows = [
      makeAtomIntelligenceRow('atom-1', [{ modelId: 'priority-matrix', label: 'urgent', confidence: 0.9 }]),
    ];

    await computeMomentumVector('binder-get', BASE_CONFIG);
    const state = getCacheState('binder-get');
    expect(state).toBeDefined();
    expect(state).toHaveProperty('result');
    expect(state).toHaveProperty('timestamp');
  });

  it('invalidation log tracks reason and timestamp', async () => {
    clearInvalidationLog();
    invalidateCache('binder-log', 'atom-added');
    invalidateCache('binder-log', 'entity-updated');

    const log = getInvalidationLog();
    expect(log).toHaveLength(2);
    expect(log[0]?.binderId).toBe('binder-log');
    expect(log[0]?.reason).toBe('atom-added');
    expect(log[1]?.reason).toBe('entity-updated');
  });
});

describe('computeEntityTrajectory', () => {
  beforeEach(() => {
    clearInvalidationLog();
    mockEntityRows = [];
    mockEntityRelationRows = [];
  });

  it('returns empty record when atomEntityIds is empty', async () => {
    const scores = await computeEntityTrajectory('binder-1', [], BASE_CONFIG);
    expect(scores).toEqual({});
  });

  it('returns empty record when entity count < entityColdStartThreshold', async () => {
    // entityColdStartThreshold = 2, we have 1 entity
    mockEntityRows = [{ id: 'entity-1', type: 'PER', mentionCount: 5, lastSeen: NOW }];

    const scores = await computeEntityTrajectory('binder-1', ['entity-1'], {
      ...BASE_CONFIG,
      entityColdStartThreshold: 2,
    });

    // Should return empty since count (1) < threshold (2)
    // (Threshold check counts atoms with entity mentions, not entities themselves)
    // In mock, db.entities.where().anyOf().count() returns mockEntityRows.length = 1
    expect(scores).toEqual({});
  });

  it('computes trajectory score with recency decay', async () => {
    mockEntityRows = [
      { id: 'entity-1', type: 'PER', mentionCount: 10, lastSeen: NOW },
      { id: 'entity-2', type: 'PER', mentionCount: 10, lastSeen: NOW - 30 * 24 * 60 * 60 * 1000 }, // 30 days ago
    ];

    const scores = await computeEntityTrajectory('binder-1', ['entity-1', 'entity-2'], {
      ...BASE_CONFIG,
      entityColdStartThreshold: 2,
    });

    // entity-1 (seen today) should score higher than entity-2 (seen 30 days ago)
    expect(scores['entity-1']).toBeGreaterThan(scores['entity-2'] ?? 0);
    // entity-2 should be about half of entity-1 (half-life = momentumHalfLife = 5 atoms,
    // but we're using days here with the decay formula)
    expect(scores['entity-1']).toBeGreaterThan(0);
    expect(scores['entity-2']).toBeGreaterThan(0);
  });

  it('applies 2x boost for entities with user-correction relations', async () => {
    mockEntityRows = [
      { id: 'entity-1', type: 'PER', mentionCount: 5, lastSeen: NOW },
      { id: 'entity-2', type: 'PER', mentionCount: 5, lastSeen: NOW },
    ];

    // entity-1 has a user-correction relation
    mockEntityRelationRows = [
      {
        id: 'rel-1',
        sourceEntityId: 'entity-1',
        targetEntityId: 'entity-other',
        sourceAttribution: 'user-correction',
      },
    ];

    const scores = await computeEntityTrajectory('binder-1', ['entity-1', 'entity-2'], {
      ...BASE_CONFIG,
      entityColdStartThreshold: 2,
    });

    // entity-1 should score ~2x entity-2 (same mentionCount + lastSeen, but correction boost)
    expect(scores['entity-1']).toBeGreaterThan(0);
    expect(scores['entity-2']).toBeGreaterThan(0);
    expect((scores['entity-1'] ?? 0) / (scores['entity-2'] ?? 1)).toBeCloseTo(2.0, 1);
  });
});
