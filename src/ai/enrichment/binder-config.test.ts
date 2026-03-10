/**
 * Tests for gtd-personal.json followUpTemplates and BinderTypeConfig extension.
 *
 * Phase 25: ITER-01
 */

import { describe, it, expect } from 'vitest';
import { getBinderConfig } from '../../config/binder-types/index';

describe('gtd-personal followUpTemplates', () => {
  it('has followUpTemplates for all 5 categories', () => {
    const config = getBinderConfig('gtd-personal');
    expect(config.followUpTemplates).toBeDefined();
    const templates = config.followUpTemplates!;
    expect(templates['missing-outcome']).toBeDefined();
    expect(templates['missing-next-action']).toBeDefined();
    expect(templates['missing-timeframe']).toBeDefined();
    expect(templates['missing-context']).toBeDefined();
    expect(templates['missing-reference']).toBeDefined();
  });

  it('each followUpTemplate has depth tiers with {prior_answer} and options', () => {
    const config = getBinderConfig('gtd-personal');
    const templates = config.followUpTemplates!;
    for (const [, template] of Object.entries(templates)) {
      expect(template.tiers).toBeDefined();
      expect(template.tiers.length).toBeGreaterThanOrEqual(2);
      for (const tier of template.tiers) {
        expect(tier.question).toContain('{prior_answer}');
        expect(tier.options).toBeDefined();
        expect(tier.options['_default']).toBeDefined();
        expect(tier.options['_default']!.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('depth 1 and depth 2 tiers have different questions', () => {
    const config = getBinderConfig('gtd-personal');
    const templates = config.followUpTemplates!;
    for (const [, template] of Object.entries(templates)) {
      const tier1 = template.tiers[0];
      const tier2 = template.tiers[1];
      expect(tier1.question).not.toBe(tier2.question);
    }
  });
});
