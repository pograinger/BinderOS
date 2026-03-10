/**
 * Tests for enrichment engine state machine.
 *
 * Phase 24 Plan 03, Task 1
 */

import { describe, it, expect } from 'vitest';
import {
  createEnrichmentSession,
  advanceSession,
  applyAnswer,
  applyDecompositionStep,
  computeGraduationReadiness,
  shouldReEvaluate,
} from './enrichment-engine';
import type { ClarificationAnswer, MissingInfoCategory, DecomposedStep } from './types';
import { OPERATION_IDS, MODEL_IDS } from './provenance';

// --- Helpers ---

function makeAnswer(
  category: MissingInfoCategory,
  option: string | null = 'some answer',
  skipped = false,
): ClarificationAnswer {
  return {
    category,
    selectedOption: option,
    wasFreeform: false,
    freeformText: null,
    wasSkipped: skipped,
  };
}

function makeDecomposedStep(text: string, index: number): DecomposedStep {
  return { text, suggestedType: 'task', stepIndex: index };
}

// --- createEnrichmentSession ---

describe('createEnrichmentSession', () => {
  it('creates session in questions phase with missing categories', () => {
    const session = createEnrichmentSession({
      inboxItemId: 'item-1',
      content: 'Buy groceries',
      missingCategories: ['missing-outcome', 'missing-next-action'],
    });

    expect(session.inboxItemId).toBe('item-1');
    expect(session.phase).toBe('questions');
    expect(session.questions.length).toBeGreaterThanOrEqual(2);
    expect(session.currentQuestionIndex).toBe(0);
    expect(session.answers).toEqual([]);
    expect(session.provenance & OPERATION_IDS.ENRICH).toBeTruthy();
  });

  it('pre-fills answers from existing enrichments, skipping answered categories', () => {
    const session = createEnrichmentSession({
      inboxItemId: 'item-2',
      content: 'Fix the roof\n---\nOutcome: Leak-free roof',
      existingEnrichments: { Outcome: 'Leak-free roof' },
      missingCategories: ['missing-outcome', 'missing-next-action', 'missing-timeframe'],
    });

    // Should skip 'missing-outcome' since it's already answered
    // Questions should only be for missing-next-action and missing-timeframe
    const questionCategories = session.questions.map((q) => q.category);
    expect(questionCategories).not.toContain('missing-outcome');
    expect(questionCategories).toContain('missing-next-action');
  });

  it('skips questions phase if no missing categories', () => {
    const session = createEnrichmentSession({
      inboxItemId: 'item-3',
      content: 'Some content',
      missingCategories: [],
    });

    expect(session.phase).toBe('decompose-offer');
    expect(session.questions).toEqual([]);
  });

  it('skips questions phase when all categories already enriched', () => {
    const session = createEnrichmentSession({
      inboxItemId: 'item-4',
      content: 'Some content\n---\nOutcome: Done\nNext Action: Do it\nDeadline: Tomorrow\nContext: Home\nReference: None',
      existingEnrichments: {
        Outcome: 'Done',
        'Next Action': 'Do it',
        Deadline: 'Tomorrow',
        Context: 'Home',
        Reference: 'None',
      },
      missingCategories: ['missing-outcome', 'missing-next-action', 'missing-timeframe', 'missing-context', 'missing-reference'],
    });

    expect(session.phase).toBe('decompose-offer');
  });
});

// --- advanceSession ---

describe('advanceSession', () => {
  it('transitions from questions to decompose-offer when all answered', () => {
    let session = createEnrichmentSession({
      inboxItemId: 'item-1',
      content: 'Test',
      missingCategories: ['missing-outcome'],
    });

    // Answer the single question
    session = applyAnswer(session, makeAnswer('missing-outcome', 'Get it done'));
    session = advanceSession(session);

    expect(session.phase).toBe('decompose-offer');
  });

  it('does not advance from questions if questions remain', () => {
    let session = createEnrichmentSession({
      inboxItemId: 'item-1',
      content: 'Test',
      missingCategories: ['missing-outcome', 'missing-next-action'],
    });

    // Only answer one of two questions
    session = applyAnswer(session, makeAnswer('missing-outcome', 'Get it done'));
    session = advanceSession(session);

    expect(session.phase).toBe('questions');
  });

  it('transitions from decompose-offer to decomposing on accept', () => {
    let session = createEnrichmentSession({
      inboxItemId: 'item-1',
      content: 'Test',
      missingCategories: [],
    });

    expect(session.phase).toBe('decompose-offer');
    session = advanceSession(session, 'accept');

    expect(session.phase).toBe('decomposing');
  });

  it('transitions from decompose-offer to graduate-offer on decline', () => {
    let session = createEnrichmentSession({
      inboxItemId: 'item-1',
      content: 'Test',
      missingCategories: [],
    });

    session = advanceSession(session, 'decline');

    expect(session.phase).toBe('graduate-offer');
  });

  it('transitions from decomposing to graduate-offer when all steps reviewed', () => {
    let session = createEnrichmentSession({
      inboxItemId: 'item-1',
      content: 'Test',
      missingCategories: [],
    });

    session = advanceSession(session, 'accept');
    expect(session.phase).toBe('decomposing');

    // Add decomposition steps and review them all
    session = {
      ...session,
      decompositionSteps: [makeDecomposedStep('Step 1', 0), makeDecomposedStep('Step 2', 1)],
    };
    session = applyDecompositionStep(session, 0, 'accept');
    session = applyDecompositionStep(session, 1, 'accept');
    session = advanceSession(session);

    expect(session.phase).toBe('graduate-offer');
  });

  it('transitions from graduate-offer to graduating on accept', () => {
    let session = createEnrichmentSession({
      inboxItemId: 'item-1',
      content: 'Test',
      missingCategories: [],
    });

    session = { ...session, phase: 'graduate-offer' as const };
    session = advanceSession(session, 'accept');

    expect(session.phase).toBe('graduating');
  });

  it('transitions from graduate-offer to done on decline', () => {
    let session = createEnrichmentSession({
      inboxItemId: 'item-1',
      content: 'Test',
      missingCategories: [],
    });

    session = { ...session, phase: 'graduate-offer' as const };
    session = advanceSession(session, 'decline');

    expect(session.phase).toBe('done');
  });

  it('transitions from graduating to done', () => {
    let session = createEnrichmentSession({
      inboxItemId: 'item-1',
      content: 'Test',
      missingCategories: [],
    });

    session = { ...session, phase: 'graduating' as const };
    session = advanceSession(session);

    expect(session.phase).toBe('done');
  });
});

// --- applyAnswer ---

describe('applyAnswer', () => {
  it('records answer and advances question index', () => {
    let session = createEnrichmentSession({
      inboxItemId: 'item-1',
      content: 'Test',
      missingCategories: ['missing-outcome', 'missing-next-action'],
    });

    const answer = makeAnswer('missing-outcome', 'Get it done');
    session = applyAnswer(session, answer);

    expect(session.answers).toHaveLength(1);
    expect(session.answers[0].selectedOption).toBe('Get it done');
    expect(session.currentQuestionIndex).toBe(1);
  });

  it('updates provenance with CLARIFY operation', () => {
    let session = createEnrichmentSession({
      inboxItemId: 'item-1',
      content: 'Test',
      missingCategories: ['missing-outcome'],
    });

    session = applyAnswer(session, makeAnswer('missing-outcome', 'Done'));

    expect(session.provenance & OPERATION_IDS.CLARIFY).toBeTruthy();
  });

  it('records skipped answer correctly', () => {
    let session = createEnrichmentSession({
      inboxItemId: 'item-1',
      content: 'Test',
      missingCategories: ['missing-outcome'],
    });

    session = applyAnswer(session, makeAnswer('missing-outcome', null, true));

    expect(session.answers[0].wasSkipped).toBe(true);
    expect(session.currentQuestionIndex).toBe(1);
  });

  it('returns new session object (immutable)', () => {
    const session = createEnrichmentSession({
      inboxItemId: 'item-1',
      content: 'Test',
      missingCategories: ['missing-outcome'],
    });

    const updated = applyAnswer(session, makeAnswer('missing-outcome'));

    expect(updated).not.toBe(session);
    expect(session.answers).toHaveLength(0);
    expect(updated.answers).toHaveLength(1);
  });
});

// --- applyDecompositionStep ---

describe('applyDecompositionStep', () => {
  it('accepts a step and tracks it', () => {
    let session = createEnrichmentSession({
      inboxItemId: 'item-1',
      content: 'Test',
      missingCategories: [],
    });

    session = advanceSession(session, 'accept');
    session = {
      ...session,
      decompositionSteps: [makeDecomposedStep('Step 1', 0)],
    };

    session = applyDecompositionStep(session, 0, 'accept');

    expect(session.acceptedSteps).toHaveLength(1);
    expect(session.acceptedSteps[0].text).toBe('Step 1');
    expect(session.acceptedSteps[0].included).toBe(true);
    expect(session.currentStepIndex).toBe(1);
  });

  it('skips a step without adding to acceptedSteps', () => {
    let session = createEnrichmentSession({
      inboxItemId: 'item-1',
      content: 'Test',
      missingCategories: [],
    });

    session = advanceSession(session, 'accept');
    session = {
      ...session,
      decompositionSteps: [makeDecomposedStep('Step 1', 0)],
    };

    session = applyDecompositionStep(session, 0, 'skip');

    expect(session.acceptedSteps).toHaveLength(0);
    expect(session.currentStepIndex).toBe(1);
  });

  it('edits a step text when accepting', () => {
    let session = createEnrichmentSession({
      inboxItemId: 'item-1',
      content: 'Test',
      missingCategories: [],
    });

    session = advanceSession(session, 'accept');
    session = {
      ...session,
      decompositionSteps: [makeDecomposedStep('Step 1', 0)],
    };

    session = applyDecompositionStep(session, 0, 'edit', 'Edited Step 1');

    expect(session.acceptedSteps).toHaveLength(1);
    expect(session.acceptedSteps[0].text).toBe('Edited Step 1');
  });

  it('updates provenance with DECOMPOSE operation', () => {
    let session = createEnrichmentSession({
      inboxItemId: 'item-1',
      content: 'Test',
      missingCategories: [],
    });

    session = advanceSession(session, 'accept');
    session = {
      ...session,
      decompositionSteps: [makeDecomposedStep('Step 1', 0)],
    };

    session = applyDecompositionStep(session, 0, 'accept');

    expect(session.provenance & OPERATION_IDS.DECOMPOSE).toBeTruthy();
    expect(session.provenance & MODEL_IDS.DECOMPOSE_ONNX).toBeTruthy();
  });
});

// --- computeGraduationReadiness ---

describe('computeGraduationReadiness', () => {
  it('returns shouldOffer=true when maturity >= 0.4', () => {
    let session = createEnrichmentSession({
      inboxItemId: 'item-1',
      content: 'Test',
      missingCategories: ['missing-outcome', 'missing-next-action'],
    });

    // Answer both questions to fill 2/5 categories = 0.4
    session = applyAnswer(session, makeAnswer('missing-outcome', 'Done'));
    session = applyAnswer(session, makeAnswer('missing-next-action', 'Do it'));

    const readiness = computeGraduationReadiness(session);

    expect(readiness.maturityScore).toBeCloseTo(0.4);
    expect(readiness.shouldOffer).toBe(true);
  });

  it('returns shouldOffer=true when has accepted decomposition steps', () => {
    let session = createEnrichmentSession({
      inboxItemId: 'item-1',
      content: 'Test',
      missingCategories: [],
    });

    session = {
      ...session,
      acceptedSteps: [
        {
          text: 'Step 1',
          type: 'task',
          suggestedSection: null,
          quality: 0.5,
          provenance: 0,
          included: true,
        },
      ],
    };

    const readiness = computeGraduationReadiness(session);

    expect(readiness.shouldOffer).toBe(true);
  });

  it('returns shouldOffer=false when low maturity and no steps', () => {
    const session = createEnrichmentSession({
      inboxItemId: 'item-1',
      content: 'Test',
      missingCategories: ['missing-outcome'],
    });

    // No answers given, maturity = 0
    const readiness = computeGraduationReadiness(session);

    expect(readiness.maturityScore).toBe(0);
    expect(readiness.shouldOffer).toBe(false);
  });
});

// --- shouldReEvaluate ---

describe('shouldReEvaluate', () => {
  it('returns true if content changed by more than 30%', () => {
    const session = createEnrichmentSession({
      inboxItemId: 'item-1',
      content: 'Buy groceries for dinner',
    });

    const result = shouldReEvaluate(
      session,
      'Completely different text about building a house renovation project',
    );

    expect(result).toBe(true);
  });

  it('returns false if content is similar', () => {
    const session = createEnrichmentSession({
      inboxItemId: 'item-1',
      content: 'Buy groceries for dinner tonight',
    });

    const result = shouldReEvaluate(session, 'Buy groceries for dinner tonight!');

    expect(result).toBe(false);
  });

  it('returns true for empty vs non-empty content', () => {
    const session = createEnrichmentSession({
      inboxItemId: 'item-1',
      content: 'Some content here',
    });

    const result = shouldReEvaluate(session, '');

    expect(result).toBe(true);
  });
});
