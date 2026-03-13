/**
 * Tests for the expanded BinderTypeConfig Zod schema.
 * Validates schema shape, required fields, and type safety.
 */
import { describe, it, expect } from 'vitest';
import { BinderTypeConfigSchema, CompositorRuleConfigSchema } from './schema';

// Minimal valid GTD config for testing
const validGtdConfig = {
  slug: 'gtd-personal',
  name: 'GTD Personal',
  schemaVersion: 1,
  purpose: 'Getting Things Done personal productivity',
  categoryOrdering: ['missing-outcome', 'missing-next-action'],
  supportedAtomTypes: ['task', 'fact', 'event', 'decision', 'insight'],
  questionTemplates: {
    'missing-outcome': {
      question: "What's the desired outcome?",
      options: { _default: ['Complete {topic}', '{freeform}'] },
    },
  },
  backgroundCloudEnrichment: false,
  columnSet: [
    'cognitive-load',
    'collaboration-type',
    'emotional-valence',
    'energy-level',
    'gtd-horizon',
    'information-lifecycle',
    'knowledge-domain',
    'priority-matrix',
    'review-cadence',
    'time-estimate',
  ],
  compositorRules: [
    {
      name: 'quick-win-detector',
      inputs: ['priority-matrix', 'time-estimate'],
      outputSignal: 'quick-win',
      condition: {
        operator: 'AND',
        clauses: [
          { modelId: 'priority-matrix', label: 'urgent-important', op: '==' },
          { modelId: 'time-estimate', label: 'quick', op: '==' },
        ],
      },
    },
  ],
  relationshipPatterns: [
    {
      id: 'spouse-direct',
      keywords: ['wife', 'husband'],
      relationshipType: 'spouse',
      targetEntityType: 'PER',
      confidenceBase: 0.65,
      scope: 'sentence',
    },
  ],
  entityTypePriority: ['PER', 'LOC', 'ORG'],
  predicateConfig: {
    routeGating: { blockedRoutes: ['/insights', '/archive'] },
    timeGating: { lowEnergyHours: [22, 23, 0, 1] },
    historyGating: { maxDepth: 2, staleDays: 7 },
  },
  maturityThresholds: { graduationDepth: 2, maxEnrichmentDepth: 4 },
};

describe('BinderTypeConfigSchema', () => {
  it('validates a complete GTD config object successfully', () => {
    const result = BinderTypeConfigSchema.safeParse(validGtdConfig);
    expect(result.success).toBe(true);
  });

  it('rejects config missing columnSet', () => {
    const { columnSet: _cs, ...withoutColumnSet } = validGtdConfig;
    const result = BinderTypeConfigSchema.safeParse(withoutColumnSet);
    expect(result.success).toBe(false);
  });

  it('rejects config missing predicateConfig', () => {
    const { predicateConfig: _pc, ...withoutPredicateConfig } = validGtdConfig;
    const result = BinderTypeConfigSchema.safeParse(withoutPredicateConfig);
    expect(result.success).toBe(false);
  });

  it('rejects config with invalid CognitiveModelId in columnSet', () => {
    const invalidConfig = {
      ...validGtdConfig,
      columnSet: ['not-a-valid-model', 'cognitive-load'],
    };
    const result = BinderTypeConfigSchema.safeParse(invalidConfig);
    expect(result.success).toBe(false);
  });

  it('accepts optional fields (followUpTemplates, entityContextMappings)', () => {
    const withOptionals = {
      ...validGtdConfig,
      followUpTemplates: {
        'missing-outcome': {
          tiers: [{ question: 'Follow up?', options: { _default: ['{freeform}'] } }],
        },
      },
      entityContextMappings: { spouse: '@home', colleague: '@work' },
    };
    const result = BinderTypeConfigSchema.safeParse(withOptionals);
    expect(result.success).toBe(true);
  });

  it('accepts optional metadata fields (description, icon, category, author)', () => {
    const withMeta = {
      ...validGtdConfig,
      description: 'GTD personal binder type',
      icon: 'clipboard',
      category: 'productivity',
      author: 'BinderOS',
      minAppVersion: '5.5.0',
    };
    const result = BinderTypeConfigSchema.safeParse(withMeta);
    expect(result.success).toBe(true);
  });
});

describe('CompositorRuleConfigSchema', () => {
  it('validates a rule with AND operator and multiple clauses', () => {
    const rule = {
      name: 'quick-win-detector',
      inputs: ['priority-matrix', 'time-estimate'],
      outputSignal: 'quick-win',
      condition: {
        operator: 'AND',
        clauses: [
          { modelId: 'priority-matrix', label: 'urgent-important', op: '==' },
          { modelId: 'time-estimate', label: 'quick', op: '==' },
        ],
      },
    };
    const result = CompositorRuleConfigSchema.safeParse(rule);
    expect(result.success).toBe(true);
  });

  it('validates a rule with OR operator and "in" op', () => {
    const rule = {
      name: 'deep-work-batch',
      inputs: ['energy-level', 'cognitive-load', 'time-estimate'],
      outputSignal: 'deep-work-block',
      condition: {
        operator: 'OR',
        clauses: [
          { modelId: 'energy-level', label: 'high-focus', op: '==' },
          { modelId: 'time-estimate', label: ['medium', 'long'], op: 'in' },
        ],
      },
      outputValue: 'true',
    };
    const result = CompositorRuleConfigSchema.safeParse(rule);
    expect(result.success).toBe(true);
  });

  it('rejects rule with invalid operator', () => {
    const rule = {
      name: 'bad-rule',
      inputs: ['cognitive-load'],
      outputSignal: 'quick-win',
      condition: {
        operator: 'XOR',
        clauses: [{ modelId: 'cognitive-load', label: 'deep', op: '==' }],
      },
    };
    const result = CompositorRuleConfigSchema.safeParse(rule);
    expect(result.success).toBe(false);
  });
});
