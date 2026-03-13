/**
 * Tests for gate types and Dexie table entry types.
 * Validates shape correctness for GateActivationLogEntry, SequenceContextEntry,
 * BinderTypeConfigEntry, GateContext, GatePredicateResult, and GateResult.
 */
import { describe, it, expect } from 'vitest';
import type {
  GateActivationLogEntry,
  SequenceContextEntry,
  BinderTypeConfigEntry,
  GateContext,
  GatePredicateResult,
  GateResult,
} from './gate';

describe('GateActivationLogEntry', () => {
  it('has all required fields', () => {
    const entry: GateActivationLogEntry = {
      id: 'log-001',
      predicateName: 'route-gate',
      outcome: 'activated',
      timestamp: Date.now(),
      configVersion: '1.0.0',
      version: 1,
      deviceId: 'device-abc',
      updatedAt: Date.now(),
    };
    expect(entry.id).toBe('log-001');
    expect(entry.predicateName).toBe('route-gate');
    expect(entry.outcome).toBe('activated');
    expect(entry.configVersion).toBe('1.0.0');
    expect(entry.version).toBe(1);
    expect(entry.deviceId).toBe('device-abc');
  });

  it('accepts blocked outcome', () => {
    const entry: GateActivationLogEntry = {
      id: 'log-002',
      predicateName: 'time-gate',
      outcome: 'blocked',
      timestamp: Date.now(),
      configVersion: '1.0.0',
      version: 1,
      deviceId: 'device-abc',
      updatedAt: Date.now(),
    };
    expect(entry.outcome).toBe('blocked');
  });

  it('accepts optional contextual fields', () => {
    const entry: GateActivationLogEntry = {
      id: 'log-003',
      predicateName: 'history-gate',
      outcome: 'activated',
      timestamp: Date.now(),
      configVersion: '1.0.0',
      version: 1,
      deviceId: 'device-abc',
      updatedAt: Date.now(),
      atomId: 'atom-001',
      route: '/binder',
      timeOfDay: 14,
      binderType: 'gtd-personal',
      enrichmentDepth: 2,
    };
    expect(entry.atomId).toBe('atom-001');
    expect(entry.route).toBe('/binder');
    expect(entry.timeOfDay).toBe(14);
    expect(entry.binderType).toBe('gtd-personal');
    expect(entry.enrichmentDepth).toBe(2);
  });
});

describe('SequenceContextEntry', () => {
  it('has binderId, windowSize, embeddings, lastUpdated, modelVersion, CRDT fields', () => {
    const entry: SequenceContextEntry = {
      binderId: 'binder-001',
      windowSize: 5,
      embeddings: new Float32Array([0.1, 0.2, 0.3]),
      lastUpdated: Date.now(),
      modelVersion: 'v1.0',
      version: 1,
      deviceId: 'device-abc',
      updatedAt: Date.now(),
    };
    expect(entry.binderId).toBe('binder-001');
    expect(entry.windowSize).toBe(5);
    expect(entry.embeddings).toBeInstanceOf(Float32Array);
    expect(entry.modelVersion).toBe('v1.0');
    expect(entry.version).toBe(1);
    expect(entry.deviceId).toBe('device-abc');
  });
});

describe('BinderTypeConfigEntry', () => {
  it('has slug, configJson, updatedAt, CRDT fields', () => {
    const entry: BinderTypeConfigEntry = {
      slug: 'gtd-personal',
      configJson: '{"name":"GTD Personal"}',
      updatedAt: Date.now(),
      version: 1,
      deviceId: 'device-abc',
    };
    expect(entry.slug).toBe('gtd-personal');
    expect(entry.configJson).toContain('GTD Personal');
    expect(entry.version).toBe(1);
    expect(entry.deviceId).toBe('device-abc');
  });
});

describe('GateContext', () => {
  it('has all optional fields', () => {
    const ctx: GateContext = {
      route: '/binder',
      timeOfDay: 14,
      atomId: 'atom-001',
      enrichmentDepth: 2,
      binderType: 'gtd-personal',
      customFields: { myKey: 'value' },
    };
    expect(ctx.route).toBe('/binder');
    expect(ctx.timeOfDay).toBe(14);
    expect(ctx.customFields?.myKey).toBe('value');
  });

  it('can be empty (all optional)', () => {
    const ctx: GateContext = {};
    expect(ctx.route).toBeUndefined();
  });
});

describe('GatePredicateResult', () => {
  it('has activated boolean and reason string', () => {
    const result: GatePredicateResult = {
      activated: true,
      reason: 'Route is not blocked',
    };
    expect(result.activated).toBe(true);
    expect(result.reason).toBe('Route is not blocked');
  });

  it('accepts optional metadata', () => {
    const result: GatePredicateResult = {
      activated: false,
      reason: 'Low energy hours: 23',
      metadata: { hour: 23, threshold: [22, 23, 0, 1] },
    };
    expect(result.metadata?.hour).toBe(23);
  });
});

describe('GateResult', () => {
  it('has canActivate boolean and predicateResults array', () => {
    const result: GateResult = {
      canActivate: true,
      predicateResults: [
        { name: 'route-gate', activated: true, reason: 'Allowed route' },
        { name: 'time-gate', activated: true, reason: 'Business hours' },
      ],
    };
    expect(result.canActivate).toBe(true);
    expect(result.predicateResults).toHaveLength(2);
    expect(result.predicateResults[0].name).toBe('route-gate');
  });
});
