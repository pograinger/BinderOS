/**
 * Registry API tests for the expanded binder-type registry.
 *
 * TDD: These tests define the behavior of src/config/binder-types/index.ts
 * after the Plan 02 rewrite.
 *
 * Phase 30: BTYPE-01
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getBinderConfig,
  listBinderTypes,
  getActiveBinderType,
  setActiveBinderType,
  setActiveBinderConfig,
} from '../binder-types/index';
import type { ExpandedBinderTypeConfig } from '../binder-types/schema';

// ---------------------------------------------------------------------------
// getBinderConfig
// ---------------------------------------------------------------------------

describe('getBinderConfig', () => {
  beforeEach(() => {
    // Reset any override before each test
    setActiveBinderConfig(null);
  });

  it('returns the expanded config for gtd-personal', () => {
    const config = getBinderConfig('gtd-personal');
    expect(config.slug).toBe('gtd-personal');
    expect(config.name).toBe('GTD Personal');
    expect(config.schemaVersion).toBeGreaterThan(0);
  });

  it('returns config with all new v5.5 fields', () => {
    const config = getBinderConfig('gtd-personal');

    // columnSet — ONNX model selection
    expect(Array.isArray(config.columnSet)).toBe(true);
    expect(config.columnSet.length).toBeGreaterThan(0);
    expect(config.columnSet).toContain('cognitive-load');

    // compositorRules — JSON-serializable signal combination rules
    expect(Array.isArray(config.compositorRules)).toBe(true);
    expect(config.compositorRules.length).toBeGreaterThan(0);
    expect(config.compositorRules[0]).toHaveProperty('name');
    expect(config.compositorRules[0]).toHaveProperty('condition');

    // relationshipPatterns — keyword patterns for entity relationship inference
    expect(Array.isArray(config.relationshipPatterns)).toBe(true);
    expect(config.relationshipPatterns.length).toBeGreaterThan(0);
    expect(config.relationshipPatterns[0]).toHaveProperty('id');
    expect(config.relationshipPatterns[0]).toHaveProperty('keywords');

    // entityTypePriority — NER detection order
    expect(Array.isArray(config.entityTypePriority)).toBe(true);
    expect(config.entityTypePriority).toContain('PER');

    // predicateConfig — context gate configuration
    expect(config.predicateConfig).toBeDefined();
    expect(config.predicateConfig.routeGating).toBeDefined();
    expect(config.predicateConfig.timeGating).toBeDefined();
    expect(config.predicateConfig.historyGating).toBeDefined();

    // maturityThresholds — enrichment graduation criteria
    expect(config.maturityThresholds).toBeDefined();
    expect(config.maturityThresholds.graduationDepth).toBeGreaterThan(0);
    expect(config.maturityThresholds.maxEnrichmentDepth).toBeGreaterThan(0);
  });

  it('returns config with legacy enrichment fields (backward compat)', () => {
    const config = getBinderConfig('gtd-personal');

    // Legacy fields that existing consumers use
    expect(typeof config.purpose).toBe('string');
    expect(Array.isArray(config.categoryOrdering)).toBe(true);
    expect(Array.isArray(config.supportedAtomTypes)).toBe(true);
    expect(typeof config.questionTemplates).toBe('object');
    expect(typeof config.backgroundCloudEnrichment).toBe('boolean');
  });

  it('falls back to gtd-personal for nonexistent slug', () => {
    const config = getBinderConfig('nonexistent-type');
    expect(config.slug).toBe('gtd-personal');
  });

  it('falls back to gtd-personal when called with no argument', () => {
    const config = getBinderConfig();
    expect(config.slug).toBe('gtd-personal');
  });
});

// ---------------------------------------------------------------------------
// Override API (harness injection)
// ---------------------------------------------------------------------------

describe('setActiveBinderConfig', () => {
  beforeEach(() => {
    setActiveBinderConfig(null);
  });

  it('causes getBinderConfig() to return the override', () => {
    const override = {
      ...getBinderConfig('gtd-personal'),
      slug: 'test-override',
      name: 'Test Override',
    } as ExpandedBinderTypeConfig;

    setActiveBinderConfig(override);

    const result = getBinderConfig();
    expect(result.slug).toBe('test-override');
    expect(result.name).toBe('Test Override');
  });

  it('override also applies when getBinderConfig is called with a slug', () => {
    const override = {
      ...getBinderConfig('gtd-personal'),
      slug: 'harness-injected',
    } as ExpandedBinderTypeConfig;

    setActiveBinderConfig(override);

    // Even requesting a specific slug returns override (harness semantics)
    const result = getBinderConfig('gtd-personal');
    expect(result.slug).toBe('harness-injected');
  });

  it('setActiveBinderConfig(null) clears the override and reverts to registry', () => {
    const override = {
      ...getBinderConfig('gtd-personal'),
      slug: 'test-override',
    } as ExpandedBinderTypeConfig;

    setActiveBinderConfig(override);
    expect(getBinderConfig().slug).toBe('test-override');

    setActiveBinderConfig(null);
    expect(getBinderConfig().slug).toBe('gtd-personal');
  });
});

// ---------------------------------------------------------------------------
// listBinderTypes
// ---------------------------------------------------------------------------

describe('listBinderTypes', () => {
  it('returns an array with at least the gtd-personal entry', () => {
    const types = listBinderTypes();
    expect(Array.isArray(types)).toBe(true);
    expect(types.length).toBeGreaterThan(0);
  });

  it('returns metadata objects with required fields', () => {
    const types = listBinderTypes();
    const gtdEntry = types.find((t) => t.slug === 'gtd-personal');
    expect(gtdEntry).toBeDefined();
    expect(gtdEntry!.slug).toBe('gtd-personal');
    expect(gtdEntry!.name).toBe('GTD Personal');
    expect(typeof gtdEntry!.schemaVersion).toBe('number');
  });
});

// ---------------------------------------------------------------------------
// getActiveBinderType / setActiveBinderType
// ---------------------------------------------------------------------------

describe('getActiveBinderType', () => {
  beforeEach(() => {
    setActiveBinderType('gtd-personal');
  });

  it('returns gtd-personal by default', () => {
    expect(getActiveBinderType()).toBe('gtd-personal');
  });

  it('setActiveBinderType changes the active type', () => {
    setActiveBinderType('gtd-personal');
    expect(getActiveBinderType()).toBe('gtd-personal');
  });
});
