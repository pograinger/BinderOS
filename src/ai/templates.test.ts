/**
 * Unit tests for the template engine module.
 *
 * All template functions are pure: no store imports, no async,
 * deterministic output for identical inputs.
 *
 * Phase 12: TMPL-01
 */

import { describe, it, expect } from 'vitest';
import {
  generateBriefingSummary,
  generateCompressionExplanation,
  recommendCompressionAction,
  assessCompressionConfidence,
  enrichTriggerQuestion,
  derivePatternSteps,
} from './templates';
import type { SectionContext } from './templates';
import type { EntropyScore } from '../types/config';
import type { Section } from '../types/sections';
import type { Atom } from '../types/atoms';

// --- Helpers ---

function makeEntropy(level: 'green' | 'yellow' | 'red', score = 40): EntropyScore {
  return { score, level, openTasks: 5, staleCount: 3, zeroLinkCount: 2, inboxCount: 0 };
}

function makeSection(overrides: Partial<Section> = {}): Section {
  return {
    id: 'sec-1',
    name: 'Projects',
    type: 'projects',
    order: 0,
    created_at: Date.now(),
    ...overrides,
  };
}

function makeAtom(overrides: Partial<Atom> = {}): Atom {
  return {
    id: 'atom-1',
    type: 'task',
    title: 'Test atom',
    content: '',
    status: 'open',
    links: [],
    created_at: Date.now(),
    updated_at: Date.now() - 20 * 86400000,
    ...overrides,
  } as Atom;
}

function makeEnrichedCandidate(overrides: {
  staleDays?: number;
  linkCount?: number;
  similarAtomTitles?: string[];
  relatedDecisionTitles?: string[];
  updatedAt?: number;
} = {}) {
  const staleDays = overrides.staleDays ?? 45;
  const updatedAt = overrides.updatedAt ?? (Date.now() - staleDays * 86400000);
  return {
    atomId: 'atom-1',
    atom: {
      id: 'atom-1',
      type: 'task',
      title: 'Old task',
      content: '',
      status: 'open',
      links: Array(overrides.linkCount ?? 0).fill({ targetId: 'x', relationshipType: 'relates-to', direction: 'forward' }),
      created_at: Date.now() - 100 * 86400000,
      updated_at: updatedAt,
    } as Atom,
    staleDays,
    linkCount: overrides.linkCount ?? 0,
    similarAtomTitles: overrides.similarAtomTitles ?? [],
    relatedDecisionTitles: overrides.relatedDecisionTitles ?? [],
  };
}

// --- generateBriefingSummary ---

describe('generateBriefingSummary', () => {
  it('returns clean-state message when green and all zeros', () => {
    const result = generateBriefingSummary(makeEntropy('green'), 0, 0, 0, 0);
    expect(result).toBe('Your system is clean -- nothing needs attention right now.');
  });

  it('green with staleCount=3 includes "3 items could use a touch"', () => {
    const result = generateBriefingSummary(makeEntropy('green'), 3, 0, 0, 20);
    expect(result).toContain('3 items could use a touch');
  });

  it('green with staleCount=3 ends with "You\'re in good shape"', () => {
    const result = generateBriefingSummary(makeEntropy('green'), 3, 0, 0, 20);
    expect(result).toContain("You're in good shape");
  });

  it('yellow includes stale count', () => {
    const result = generateBriefingSummary(makeEntropy('yellow', 55), 5, 2, 3, 30);
    expect(result).toContain('5 stale');
  });

  it('yellow includes "Needs attention"', () => {
    const result = generateBriefingSummary(makeEntropy('yellow', 55), 5, 2, 3, 30);
    expect(result).toContain('Needs attention');
  });

  it('red includes "System load is high"', () => {
    const result = generateBriefingSummary(makeEntropy('red', 80), 10, 4, 6, 50);
    expect(result).toContain('System load is high');
  });

  it('red includes stale count', () => {
    const result = generateBriefingSummary(makeEntropy('red', 80), 10, 4, 6, 50);
    expect(result).toContain('10');
  });

  it('red includes compression count', () => {
    const result = generateBriefingSummary(makeEntropy('red', 80), 10, 4, 6, 50);
    expect(result).toContain('6');
  });

  it('red includes "getting noisy"', () => {
    const result = generateBriefingSummary(makeEntropy('red', 80), 10, 4, 6, 50);
    expect(result).toContain('getting noisy');
  });

  it('null entropy omits percentage but still produces valid text', () => {
    const result = generateBriefingSummary(null, 5, 2, 3, 30);
    expect(result.length).toBeGreaterThan(0);
    expect(result).not.toContain('entropy:');
  });

  it('non-null entropy includes "(entropy: NN%)" label', () => {
    const result = generateBriefingSummary(makeEntropy('yellow', 72), 5, 2, 3, 30);
    expect(result).toContain('(entropy: 72%)');
  });
});

// --- generateCompressionExplanation ---

describe('generateCompressionExplanation', () => {
  it('includes "Last touched" date', () => {
    const candidate = makeEnrichedCandidate({ staleDays: 45 });
    const result = generateCompressionExplanation(candidate);
    expect(result).toContain('Last touched');
  });

  it('includes stale days count', () => {
    const candidate = makeEnrichedCandidate({ staleDays: 45 });
    const result = generateCompressionExplanation(candidate);
    expect(result).toContain('45');
  });

  it('linkCount=0 includes "with no links to other items"', () => {
    const candidate = makeEnrichedCandidate({ staleDays: 45, linkCount: 0 });
    const result = generateCompressionExplanation(candidate);
    expect(result).toContain('with no links to other items');
  });

  it('linkCount>0 does NOT include "with no links to other items"', () => {
    const candidate = makeEnrichedCandidate({ staleDays: 45, linkCount: 2 });
    const result = generateCompressionExplanation(candidate);
    expect(result).not.toContain('with no links to other items');
  });

  it('with similarAtomTitles includes similar item count', () => {
    const candidate = makeEnrichedCandidate({
      staleDays: 45,
      similarAtomTitles: ['Related atom A', 'Related atom B'],
    });
    const result = generateCompressionExplanation(candidate);
    expect(result).toContain('2');
  });

  it('with relatedDecisionTitles includes decision reference', () => {
    const candidate = makeEnrichedCandidate({
      staleDays: 45,
      relatedDecisionTitles: ['Decision: use PostgreSQL'],
    });
    const result = generateCompressionExplanation(candidate);
    expect(result).toContain('Decision: use PostgreSQL');
  });
});

// --- recommendCompressionAction ---

describe('recommendCompressionAction', () => {
  it('returns "archive" for staleDays>60 and linkCount=0', () => {
    const candidate = makeEnrichedCandidate({ staleDays: 65, linkCount: 0 });
    expect(recommendCompressionAction(candidate)).toBe('archive');
  });

  it('returns "tag-someday" for similarAtomTitles>=2', () => {
    const candidate = makeEnrichedCandidate({
      staleDays: 20,
      linkCount: 1,
      similarAtomTitles: ['A', 'B'],
    });
    expect(recommendCompressionAction(candidate)).toBe('tag-someday');
  });

  it('returns "archive" when relatedDecisionTitles>0 (no other criteria)', () => {
    const candidate = makeEnrichedCandidate({
      staleDays: 20,
      linkCount: 1,
      similarAtomTitles: ['A'],
      relatedDecisionTitles: ['Dec A'],
    });
    expect(recommendCompressionAction(candidate)).toBe('archive');
  });

  it('returns "tag-someday" as default', () => {
    const candidate = makeEnrichedCandidate({
      staleDays: 20,
      linkCount: 2,
      similarAtomTitles: ['A'],
      relatedDecisionTitles: [],
    });
    expect(recommendCompressionAction(candidate)).toBe('tag-someday');
  });
});

// --- assessCompressionConfidence ---

describe('assessCompressionConfidence', () => {
  it('returns "high" for staleDays>90 and linkCount=0', () => {
    const candidate = makeEnrichedCandidate({ staleDays: 95, linkCount: 0 });
    expect(assessCompressionConfidence(candidate)).toBe('high');
  });

  it('returns "medium" for staleDays>30 and linkCount<=1', () => {
    const candidate = makeEnrichedCandidate({ staleDays: 35, linkCount: 1 });
    expect(assessCompressionConfidence(candidate)).toBe('medium');
  });

  it('returns "low" otherwise (recent, many links)', () => {
    const candidate = makeEnrichedCandidate({ staleDays: 10, linkCount: 3 });
    expect(assessCompressionConfidence(candidate)).toBe('low');
  });

  it('returns "low" for staleDays>30 but linkCount>1', () => {
    const candidate = makeEnrichedCandidate({ staleDays: 40, linkCount: 3 });
    expect(assessCompressionConfidence(candidate)).toBe('low');
  });
});

// --- enrichTriggerQuestion ---

describe('enrichTriggerQuestion', () => {
  it('returns simple prompt when no section context', () => {
    const result = enrichTriggerQuestion('Health & Wellness', 'Physical health, fitness', null);
    expect(result).toContain('Health & Wellness');
    expect(result).toContain('anything to capture');
  });

  it('section with 0 active tasks returns "has no active tasks"', () => {
    const ctx: SectionContext = {
      section: makeSection({ name: 'Health' }),
      activeTaskCount: 0,
      activeProjectCount: 0,
      daysSinceLastActivity: 5,
    };
    const result = enrichTriggerQuestion('Health & Wellness', 'Fitness', ctx);
    expect(result).toContain('has no active tasks');
  });

  it('section with 0 active tasks and daysSinceLastActivity>14 includes "haven\'t touched" message', () => {
    const ctx: SectionContext = {
      section: makeSection({ name: 'Finance' }),
      activeTaskCount: 0,
      activeProjectCount: 0,
      daysSinceLastActivity: 20,
    };
    const result = enrichTriggerQuestion('Finance', 'Bills', ctx);
    expect(result).toContain("haven't touched");
    expect(result).toContain('20');
  });

  it('section with active tasks includes section name and active count', () => {
    const ctx: SectionContext = {
      section: makeSection({ name: 'Work' }),
      activeTaskCount: 3,
      activeProjectCount: 1,
      daysSinceLastActivity: 5,
    };
    const result = enrichTriggerQuestion('Career', 'Work projects', ctx);
    expect(result).toContain('Work');
    expect(result).toContain('3');
  });

  it('section with active tasks and daysSinceLastActivity<=14 does NOT include stale message', () => {
    const ctx: SectionContext = {
      section: makeSection({ name: 'Work' }),
      activeTaskCount: 3,
      activeProjectCount: 1,
      daysSinceLastActivity: 7,
    };
    const result = enrichTriggerQuestion('Career', 'Work projects', ctx);
    expect(result).not.toContain("haven't touched");
  });
});

// --- derivePatternSteps ---

describe('derivePatternSteps', () => {
  it('returns ReviewFlowStep[] with get-creative phase', () => {
    const sections = [makeSection()];
    const atoms = Array.from({ length: 15 }, (_, i) =>
      makeAtom({ id: `atom-${i}`, status: 'open' }),
    );
    const steps = derivePatternSteps(sections, atoms, 12);
    expect(steps.length).toBeGreaterThan(0);
    steps.forEach((s) => expect(s.phase).toBe('get-creative'));
  });

  it('returns max 3 steps', () => {
    const sections = [makeSection()];
    const atoms = Array.from({ length: 15 }, (_, i) =>
      makeAtom({ id: `atom-${i}`, status: 'open' }),
    );
    const steps = derivePatternSteps(sections, atoms, 15);
    expect(steps.length).toBeLessThanOrEqual(3);
  });

  it('high inbox (>10) produces at least one step', () => {
    const sections = [makeSection()];
    const atoms = [makeAtom()];
    const steps = derivePatternSteps(sections, atoms, 12);
    expect(steps.length).toBeGreaterThan(0);
  });

  it('each step has stepId, options with stagingAction, and allowFreeform', () => {
    const sections = [makeSection()];
    const atoms = [makeAtom()];
    const steps = derivePatternSteps(sections, atoms, 12);
    for (const step of steps) {
      expect(step.stepId).toBeDefined();
      expect(step.options.length).toBeGreaterThan(0);
      expect(step.allowFreeform).toBeDefined();
      for (const opt of step.options) {
        expect(opt.stagingAction).toBeDefined();
      }
    }
  });

  it('returns empty array when no patterns detected (low inbox, all sections active)', () => {
    const sections = [makeSection()];
    const atoms = [makeAtom({ status: 'open' })];
    const steps = derivePatternSteps(sections, atoms, 2);
    // Low inbox, section has active atoms — no patterns triggered
    expect(steps.length).toBe(0);
  });
});
