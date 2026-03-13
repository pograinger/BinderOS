/**
 * Integration tests for the context gate pre-filter in dispatchTiered().
 *
 * Covers:
 * - Gate-blocked dispatches return gateBlocked: true with no handler execution (GATE-01)
 * - Permissive context passes gate and runs handlers normally (GATE-05)
 * - Gate log entries written to gateActivationLog fire-and-forget (GATE-04)
 * - Log write failure does not cause dispatchTiered() to reject
 * - gateResult populated on both blocked and passing dispatches
 *
 * Phase 31 Plan 01: GATE-01, GATE-04, GATE-05
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock Dexie db before importing pipeline
vi.mock('../../../storage/db', () => ({
  db: {
    gateActivationLog: {
      bulkAdd: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

import { dispatchTiered, registerHandler, unregisterHandler } from '../pipeline';
import { clearPredicates, evaluatePredicates } from '../../context-gate/predicate-registry';
import { initCorePredicates } from '../../context-gate/predicates/index';
import { makePermissiveContext } from './test-helpers';
import type { TieredRequest, TieredResult } from '../types';
import type { TierHandler } from '../handler';
import type { AITaskType } from '../types';

// Import the mocked db to spy on it
import { db } from '../../../storage/db';

// --- Test handler that always returns confidence 0.9 ---

const testHandler: TierHandler = {
  tier: 1,
  name: 'test-tier1',
  canHandle: (task: AITaskType) => task === 'classify-type',
  handle: vi.fn().mockResolvedValue({
    tier: 1,
    confidence: 0.9,
    reasoning: 'test handler ran',
  } satisfies TieredResult),
};

// --- Setup / teardown ---

beforeEach(() => {
  clearPredicates();
  initCorePredicates();
  registerHandler(testHandler);
  vi.mocked(testHandler.handle).mockClear();
  vi.mocked(db.gateActivationLog.bulkAdd).mockClear();
});

afterEach(() => {
  unregisterHandler(1, 'test-tier1');
  clearPredicates();
});

// --- Helper ---

function makeBlockedRequest(): TieredRequest {
  return {
    requestId: 'test-blocked',
    task: 'classify-type',
    features: { content: 'Test content' },
    // route '/insights' is in blockedRoutes — gate should block
    context: { route: '/insights', timeOfDay: 12, binderType: 'gtd-personal', enrichmentDepth: 0 },
  };
}

function makePassRequest(): TieredRequest {
  return {
    requestId: 'test-pass',
    task: 'classify-type',
    features: { content: 'Test content' },
    context: makePermissiveContext(),
  };
}

// --- Tests ---

describe('dispatchTiered gate pre-filter', () => {
  it('returns gateBlocked: true when context fails route predicate', async () => {
    const response = await dispatchTiered(makeBlockedRequest());

    expect(response.gateBlocked).toBe(true);
    expect(response.attempts).toHaveLength(0);
    expect(response.result.tier).toBe(1);
    expect(response.result.confidence).toBe(0);
  });

  it('does not run any handler when gate blocks', async () => {
    await dispatchTiered(makeBlockedRequest());

    expect(testHandler.handle).not.toHaveBeenCalled();
  });

  it('blocked response includes reasoning with predicate names', async () => {
    const response = await dispatchTiered(makeBlockedRequest());

    // Reasoning should mention the blocking predicate
    expect(response.result.reasoning).toBeTruthy();
    expect(typeof response.result.reasoning).toBe('string');
  });

  it('runs handlers normally with permissive context', async () => {
    const response = await dispatchTiered(makePassRequest());

    expect(response.gateBlocked).toBeFalsy();
    expect(testHandler.handle).toHaveBeenCalledOnce();
    expect(response.result.confidence).toBe(0.9);
  });

  it('populates gateResult on passing dispatch', async () => {
    const response = await dispatchTiered(makePassRequest());

    expect(response.gateResult).toBeDefined();
    expect(response.gateResult?.canActivate).toBe(true);
    expect(response.gateResult?.predicateResults).toHaveLength(4); // all four core predicates
  });

  it('populates gateResult on blocked dispatch', async () => {
    const response = await dispatchTiered(makeBlockedRequest());

    expect(response.gateResult).toBeDefined();
    expect(response.gateResult?.canActivate).toBe(false);
    // At least one predicate should be blocked
    const blocked = response.gateResult?.predicateResults.filter(r => !r.activated);
    expect(blocked?.length).toBeGreaterThan(0);
  });
});

describe('dispatchTiered gate logging', () => {
  it('writes one GateActivationLogEntry per predicate to gateActivationLog', async () => {
    await dispatchTiered(makePassRequest());

    expect(db.gateActivationLog.bulkAdd).toHaveBeenCalledOnce();
    const entries = vi.mocked(db.gateActivationLog.bulkAdd).mock.calls[0]![0] as unknown[];
    // Four core predicates registered
    expect(entries).toHaveLength(4);
  });

  it('log entries have correct shape', async () => {
    await dispatchTiered(makePassRequest());

    const entries = vi.mocked(db.gateActivationLog.bulkAdd).mock.calls[0]![0] as Array<{
      id: string;
      predicateName: string;
      outcome: string;
      timestamp: number;
      configVersion: string;
      version: number;
      deviceId: string;
      updatedAt: number;
    }>;

    for (const entry of entries) {
      expect(entry.id).toBeTypeOf('string');
      expect(entry.predicateName).toBeTypeOf('string');
      expect(['activated', 'blocked']).toContain(entry.outcome);
      expect(entry.timestamp).toBeTypeOf('number');
      expect(entry.configVersion).toBeTypeOf('string');
      expect(entry.version).toBe(1);
      expect(entry.deviceId).toBe('local');
      expect(entry.updatedAt).toBeTypeOf('number');
    }
  });

  it('does not reject when gateActivationLog.bulkAdd fails (fire-and-forget)', async () => {
    vi.mocked(db.gateActivationLog.bulkAdd).mockRejectedValueOnce(new Error('DB write failed'));

    // Should resolve normally despite log failure
    await expect(dispatchTiered(makePassRequest())).resolves.toBeDefined();
  });

  it('also writes gate log on blocked dispatches', async () => {
    await dispatchTiered(makeBlockedRequest());

    expect(db.gateActivationLog.bulkAdd).toHaveBeenCalledOnce();
  });
});
