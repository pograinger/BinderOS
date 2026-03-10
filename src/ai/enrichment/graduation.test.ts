/**
 * Tests for graduation proposal generator.
 *
 * Phase 24 Plan 03, Task 2
 */

import { describe, it, expect } from 'vitest';
import {
  buildGraduationProposal,
  toggleChildInclusion,
  getGraduationActions,
  inferParentType,
} from './graduation';
import type { EnrichmentSession, AcceptedStep, ClarificationAnswer } from './types';
import { OPERATION_IDS } from './provenance';

// --- Helpers ---

function makeSession(overrides: Partial<EnrichmentSession> = {}): EnrichmentSession {
  return {
    inboxItemId: 'item-1',
    originalContent: 'Buy groceries for the week',
    phase: 'graduating',
    questions: [],
    currentQuestionIndex: 0,
    answers: [],
    decompositionSteps: [],
    currentStepIndex: 0,
    acceptedSteps: [],
    graduationProposal: null,
    provenance: OPERATION_IDS.ENRICH,
    categoryDepth: {},
    cognitiveSignals: null,
    activeDeepening: null,
    isGenerating: false,
    ...overrides,
  };
}

function makeAnswer(
  category: 'missing-outcome' | 'missing-next-action' | 'missing-timeframe' | 'missing-context' | 'missing-reference',
  value: string,
): ClarificationAnswer {
  return {
    category,
    selectedOption: value,
    wasFreeform: false,
    freeformText: null,
    wasSkipped: false,
  };
}

function makeAcceptedStep(text: string, included = true): AcceptedStep {
  return {
    text,
    type: 'task',
    suggestedSection: null,
    quality: 0,
    provenance: OPERATION_IDS.DECOMPOSE,
    included,
  };
}

// --- buildGraduationProposal ---

describe('buildGraduationProposal', () => {
  it('builds parent-only proposal when no decomposition steps', () => {
    const session = makeSession({
      answers: [makeAnswer('missing-outcome', 'Have food for the week')],
    });

    const proposal = buildGraduationProposal(session);

    expect(proposal.parentAtom.content).toContain('Buy groceries');
    expect(proposal.parentAtom.type).toBe('task');
    expect(proposal.parentAtom.provenance & OPERATION_IDS.GRADUATE).toBeTruthy();
    expect(proposal.childAtoms).toHaveLength(0);
  });

  it('builds parent + children when accepted decomposition steps exist', () => {
    const session = makeSession({
      answers: [makeAnswer('missing-outcome', 'Have food for the week')],
      acceptedSteps: [
        makeAcceptedStep('Make a grocery list'),
        makeAcceptedStep('Go to the store'),
        makeAcceptedStep('Put groceries away'),
      ],
    });

    const proposal = buildGraduationProposal(session);

    expect(proposal.parentAtom.type).toBe('task');
    expect(proposal.childAtoms).toHaveLength(3);
    expect(proposal.childAtoms[0].text).toBe('Make a grocery list');
    expect(proposal.childAtoms[1].text).toBe('Go to the store');
    expect(proposal.childAtoms[2].text).toBe('Put groceries away');
  });

  it('uses classificationContext.parentType when provided', () => {
    const session = makeSession();

    const proposal = buildGraduationProposal(session, {
      parentType: 'decision',
    });

    expect(proposal.parentAtom.type).toBe('decision');
  });

  it('assigns quality scores to children', () => {
    const session = makeSession({
      acceptedSteps: [makeAcceptedStep('Step 1')],
    });

    const proposal = buildGraduationProposal(session);

    // Quality should be computed (non-zero due to decomposition maturity)
    expect(typeof proposal.childAtoms[0].quality).toBe('number');
  });

  it('applies childSections from classificationContext', () => {
    const session = makeSession({
      acceptedSteps: [
        makeAcceptedStep('Step 1'),
        makeAcceptedStep('Step 2'),
      ],
    });

    const proposal = buildGraduationProposal(session, {
      childSections: { 0: 'section-a', 1: 'section-b' },
    });

    expect(proposal.childAtoms[0].suggestedSection).toBe('section-a');
    expect(proposal.childAtoms[1].suggestedSection).toBe('section-b');
  });

  it('includes enrichments in parent atom', () => {
    const session = makeSession({
      answers: [
        makeAnswer('missing-outcome', 'Have food'),
        makeAnswer('missing-next-action', 'Go shopping'),
      ],
    });

    const proposal = buildGraduationProposal(session);

    expect(proposal.parentAtom.enrichments['Outcome']).toBe('Have food');
    expect(proposal.parentAtom.enrichments['Next Action']).toBe('Go shopping');
  });
});

// --- toggleChildInclusion ---

describe('toggleChildInclusion', () => {
  it('toggles included flag on specified child', () => {
    const session = makeSession({
      acceptedSteps: [
        makeAcceptedStep('Step 1', true),
        makeAcceptedStep('Step 2', true),
      ],
    });

    const proposal = buildGraduationProposal(session);
    expect(proposal.childAtoms[0].included).toBe(true);

    const toggled = toggleChildInclusion(proposal, 0);
    expect(toggled.childAtoms[0].included).toBe(false);
    expect(toggled.childAtoms[1].included).toBe(true);
  });

  it('returns new proposal object (immutable)', () => {
    const session = makeSession({
      acceptedSteps: [makeAcceptedStep('Step 1')],
    });

    const proposal = buildGraduationProposal(session);
    const toggled = toggleChildInclusion(proposal, 0);

    expect(toggled).not.toBe(proposal);
    expect(proposal.childAtoms[0].included).toBe(true);
    expect(toggled.childAtoms[0].included).toBe(false);
  });

  it('double toggle restores original state', () => {
    const session = makeSession({
      acceptedSteps: [makeAcceptedStep('Step 1')],
    });

    const proposal = buildGraduationProposal(session);
    const toggled1 = toggleChildInclusion(proposal, 0);
    const toggled2 = toggleChildInclusion(toggled1, 0);

    expect(toggled2.childAtoms[0].included).toBe(true);
  });
});

// --- getGraduationActions ---

describe('getGraduationActions', () => {
  it('returns classify-parent as first action', () => {
    const session = makeSession();
    const proposal = buildGraduationProposal(session);
    const actions = getGraduationActions(proposal);

    expect(actions.length).toBeGreaterThanOrEqual(1);
    expect(actions[0].action).toBe('classify-parent');
    expect(actions[0].content).toContain('Buy groceries');
  });

  it('returns create-child for each included child', () => {
    const session = makeSession({
      acceptedSteps: [
        makeAcceptedStep('Step 1', true),
        makeAcceptedStep('Step 2', true),
      ],
    });

    const proposal = buildGraduationProposal(session);
    const actions = getGraduationActions(proposal);

    expect(actions).toHaveLength(3); // 1 parent + 2 children
    expect(actions[1].action).toBe('create-child');
    expect(actions[1].skipTriage).toBe(true);
    expect(actions[2].action).toBe('create-child');
  });

  it('excludes children with included=false', () => {
    const session = makeSession({
      acceptedSteps: [
        makeAcceptedStep('Step 1', true),
        makeAcceptedStep('Step 2', false),
      ],
    });

    const proposal = buildGraduationProposal(session);
    const actions = getGraduationActions(proposal);

    expect(actions).toHaveLength(2); // 1 parent + 1 included child
    expect(actions[1].content).toBe('Step 1');
  });

  it('children have skipTriage=true', () => {
    const session = makeSession({
      acceptedSteps: [makeAcceptedStep('Step 1')],
    });

    const proposal = buildGraduationProposal(session);
    const actions = getGraduationActions(proposal);

    const childAction = actions.find((a) => a.action === 'create-child');
    expect(childAction?.skipTriage).toBe(true);
  });
});

// --- inferParentType ---

describe('inferParentType', () => {
  it('returns task when decomposition accepted', () => {
    expect(inferParentType({}, true)).toBe('task');
  });

  it('returns task when Next Action enrichment present', () => {
    expect(inferParentType({ 'Next Action': 'Do it' }, false)).toBe('task');
  });

  it('returns decision when Outcome has decision language', () => {
    expect(inferParentType({ Outcome: 'Decided to go with option A' }, false)).toBe('decision');
  });

  it('defaults to task', () => {
    expect(inferParentType({}, false)).toBe('task');
  });
});
