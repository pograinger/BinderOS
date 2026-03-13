/**
 * Tests for the expanded BinderTypeConfig Zod schema.
 * Validates schema shape, required fields, and type safety.
 *
 * Phase 35: added vectorSchema tests and dimension constant tests.
 */
import { describe, it, expect } from 'vitest';
import { BinderTypeConfigSchema, CompositorRuleConfigSchema } from './schema';
import {
  TASK_DIMENSION_NAMES,
  PERSON_DIMENSION_NAMES,
  CALENDAR_DIMENSION_NAMES,
} from '../../ai/feature-vectors/types';
import { getBinderConfig } from './index';

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

describe('vectorSchema in BinderTypeConfigSchema', () => {
  it('accepts config with optional vectorSchema', () => {
    const withVectors = {
      ...validGtdConfig,
      vectorSchema: {
        task: Array.from({ length: 27 }, (_, i) => `dim_${i}`),
        person: Array.from({ length: 23 }, (_, i) => `dim_${i}`),
        calendar: Array.from({ length: 34 }, (_, i) => `dim_${i}`),
      },
    };
    const result = BinderTypeConfigSchema.safeParse(withVectors);
    expect(result.success).toBe(true);
  });

  it('accepts config without vectorSchema (optional field)', () => {
    const result = BinderTypeConfigSchema.safeParse(validGtdConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.vectorSchema).toBeUndefined();
    }
  });

  it('accepts vectorSchema with only some sub-types defined', () => {
    const withPartialVectors = {
      ...validGtdConfig,
      vectorSchema: {
        task: Array.from({ length: 27 }, (_, i) => `dim_${i}`),
      },
    };
    const result = BinderTypeConfigSchema.safeParse(withPartialVectors);
    expect(result.success).toBe(true);
  });
});

describe('Dimension name constants', () => {
  it('TASK_DIMENSION_NAMES has exactly 27 entries', () => {
    expect(TASK_DIMENSION_NAMES.length).toBe(27);
  });

  it('PERSON_DIMENSION_NAMES has exactly 23 entries', () => {
    expect(PERSON_DIMENSION_NAMES.length).toBe(23);
  });

  it('CALENDAR_DIMENSION_NAMES has exactly 34 entries', () => {
    expect(CALENDAR_DIMENSION_NAMES.length).toBe(34);
  });

  it('TASK_DIMENSION_NAMES contains expected GTD names', () => {
    expect(TASK_DIMENSION_NAMES).toContain('age_norm');
    expect(TASK_DIMENSION_NAMES).toContain('has_deadline');
    expect(TASK_DIMENSION_NAMES).toContain('energy_high');
    expect(TASK_DIMENSION_NAMES).toContain('entity_reliability');
  });

  it('PERSON_DIMENSION_NAMES contains expected relationship names', () => {
    expect(PERSON_DIMENSION_NAMES).toContain('rel_spouse');
    expect(PERSON_DIMENSION_NAMES).toContain('rel_unknown');
    expect(PERSON_DIMENSION_NAMES).toContain('mention_count_norm');
    expect(PERSON_DIMENSION_NAMES).toContain('confidence_norm');
  });

  it('CALENDAR_DIMENSION_NAMES contains expected event names', () => {
    expect(CALENDAR_DIMENSION_NAMES).toContain('start_tod_norm');
    expect(CALENDAR_DIMENSION_NAMES).toContain('entity_is_high_priority');
    expect(CALENDAR_DIMENSION_NAMES).toContain('has_person_entity');
    expect(CALENDAR_DIMENSION_NAMES).toContain('has_loc_entity');
  });
});

describe('getBinderConfig vectorSchema', () => {
  it('gtd-personal vectorSchema.task has 27 entries', () => {
    const config = getBinderConfig('gtd-personal');
    expect(config.vectorSchema?.task?.length).toBe(27);
  });

  it('gtd-personal vectorSchema.person has 23 entries', () => {
    const config = getBinderConfig('gtd-personal');
    expect(config.vectorSchema?.person?.length).toBe(23);
  });

  it('gtd-personal vectorSchema.calendar has 34 entries', () => {
    const config = getBinderConfig('gtd-personal');
    expect(config.vectorSchema?.calendar?.length).toBe(34);
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
