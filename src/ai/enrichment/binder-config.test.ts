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

  it('each followUpTemplate has question with {prior_answer} and options', () => {
    const config = getBinderConfig('gtd-personal');
    const templates = config.followUpTemplates!;
    for (const [, template] of Object.entries(templates)) {
      expect(template.question).toContain('{prior_answer}');
      expect(template.options).toBeDefined();
      expect(template.options['_default']).toBeDefined();
      expect(template.options['_default'].length).toBeGreaterThanOrEqual(2);
    }
  });
});
