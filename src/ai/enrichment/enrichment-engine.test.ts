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
import type { ClarificationAnswer, MissingInfoCategory, DecomposedStep, SignalVector } from './types';
import { TEMPLATE_TIER_COUNT } from './types';
import type { CognitiveSignal } from '../tier2/cognitive-signals';
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
      content: 'Fix the roof',
      sidecarEnrichment: [{ category: 'missing-outcome', question: '', answer: 'Leak-free roof', depth: 0, timestamp: 0, tier: 'T1' }],
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
      content: 'Some content',
      sidecarEnrichment: [
        { category: 'missing-outcome', question: '', answer: 'Done', depth: 0, timestamp: 0, tier: 'T1' },
        { category: 'missing-next-action', question: '', answer: 'Do it', depth: 0, timestamp: 0, tier: 'T1' },
        { category: 'missing-timeframe', question: '', answer: 'Tomorrow', depth: 0, timestamp: 0, tier: 'T1' },
        { category: 'missing-context', question: '', answer: 'Home', depth: 0, timestamp: 0, tier: 'T1' },
        { category: 'missing-reference', question: '', answer: 'None', depth: 0, timestamp: 0, tier: 'T1' },
      ],
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

// --- Iterative deepening (Phase 25) ---

function makeCognitiveSignal(
  modelId: string,
  confidence: number,
): CognitiveSignal {
  return {
    modelId: modelId as CognitiveSignal['modelId'],
    dimension: 'priority' as CognitiveSignal['dimension'],
    signalType: 'categorical',
    scores: { a: confidence },
    topLabel: 'a',
    confidence,
    accepted: true,
  };
}

describe('createEnrichmentSession (iterative deepening)', () => {
  const allEnrichments = {
    Outcome: 'Done',
    'Next Action': 'Do it',
    Deadline: 'Tomorrow',
    Context: 'Home',
    Reference: 'None',
  };

  const allSidecarEnrichment = [
    { category: 'missing-outcome', question: '', answer: 'Done', depth: 0, timestamp: 0, tier: 'T1' },
    { category: 'missing-next-action', question: '', answer: 'Do it', depth: 0, timestamp: 0, tier: 'T1' },
    { category: 'missing-timeframe', question: '', answer: 'Tomorrow', depth: 0, timestamp: 0, tier: 'T1' },
    { category: 'missing-context', question: '', answer: 'Home', depth: 0, timestamp: 0, tier: 'T1' },
    { category: 'missing-reference', question: '', answer: 'None', depth: 0, timestamp: 0, tier: 'T1' },
  ];

  it('Test 1: generates follow-up questions for fully-answered item with depthMap at depth 1', () => {
    const depthMap: Record<string, number> = {
      'missing-outcome': 1,
      'missing-next-action': 1,
      'missing-timeframe': 1,
      'missing-context': 1,
      'missing-reference': 1,
    };

    const session = createEnrichmentSession({
      inboxItemId: 'item-deep-1',
      content: 'Some content',
      sidecarEnrichment: allSidecarEnrichment,
      depthMap,
    });

    // Should generate 5 follow-up questions (one per answered category)
    expect(session.questions.length).toBe(5);
    expect(session.phase).toBe('questions');
  });

  it('Test 2: still generates follow-up questions at high depth (no cap)', () => {
    const depthMap: Record<string, number> = {
      'missing-outcome': 10,
      'missing-next-action': 10,
      'missing-timeframe': 10,
      'missing-context': 10,
      'missing-reference': 10,
    };

    const session = createEnrichmentSession({
      inboxItemId: 'item-deep-2',
      content: 'Some content',
      sidecarEnrichment: allSidecarEnrichment,
      depthMap,
    });

    // No depth cap — should still generate 5 follow-up questions
    expect(session.questions.length).toBe(5);
    expect(session.phase).toBe('questions');
  });

  it('Test 3: mixes first-pass and follow-up questions for partially answered items', () => {
    // 3 categories answered at depth 1, 2 not answered
    const depthMap: Record<string, number> = {
      'missing-outcome': 1,
      'missing-next-action': 1,
      'missing-timeframe': 1,
    };
    const partialEnrichments = {
      Outcome: 'Done',
      'Next Action': 'Do it',
      Deadline: 'Tomorrow',
    };

    const partialSidecarEnrichment = [
      { category: 'missing-outcome', question: '', answer: 'Done', depth: 0, timestamp: 0, tier: 'T1' },
      { category: 'missing-next-action', question: '', answer: 'Do it', depth: 0, timestamp: 0, tier: 'T1' },
      { category: 'missing-timeframe', question: '', answer: 'Tomorrow', depth: 0, timestamp: 0, tier: 'T1' },
    ];

    const session = createEnrichmentSession({
      inboxItemId: 'item-deep-3',
      content: 'Some content',
      sidecarEnrichment: partialSidecarEnrichment,
      depthMap,
    });

    // 2 first-pass (context, reference) + 3 follow-up (outcome, next-action, timeframe)
    expect(session.questions.length).toBe(5);
  });

  it('Test 4: follow-up questions contain prior answer text', () => {
    const depthMap: Record<string, number> = {
      'missing-outcome': 1,
    };

    const session = createEnrichmentSession({
      inboxItemId: 'item-deep-4',
      content: 'Test',
      sidecarEnrichment: [{ category: 'missing-outcome', question: '', answer: 'Leak-free roof', depth: 0, timestamp: 0, tier: 'T1' }],
      missingCategories: ['missing-outcome'],
      depthMap,
    });

    // The follow-up question should reference "Leak-free roof"
    const outcomeQ = session.questions.find((q) => q.category === 'missing-outcome');
    expect(outcomeQ).toBeDefined();
    const fullText = outcomeQ!.questionText + ' ' + outcomeQ!.options.join(' ');
    expect(fullText).toContain('Leak-free roof');
  });

  it('Test 5: categoryDepth initialized from depthMap parameter', () => {
    const depthMap = { 'missing-outcome': 2, 'missing-context': 1 };

    const session = createEnrichmentSession({
      inboxItemId: 'item-deep-5',
      content: 'Test',
      depthMap,
    });

    expect(session.categoryDepth).toEqual(depthMap);
  });

  it('Test 6: cognitiveSignals stored in session when provided', () => {
    const signals: SignalVector = {
      signals: { 'priority-matrix': makeCognitiveSignal('priority-matrix', 0.8) },
      composites: [],
      totalMs: 10,
      protocolVersion: 1,
    };

    const session = createEnrichmentSession({
      inboxItemId: 'item-deep-6',
      content: 'Test',
      cognitiveSignals: signals,
    });

    expect(session.cognitiveSignals).toEqual(signals);
  });

  it('Test 7: signal-guided reordering puts low-confidence relevant categories first', () => {
    // priority-matrix maps to missing-outcome, missing-timeframe
    // cognitive-load maps to missing-next-action
    // Make priority-matrix LOW confidence (0.3) -> high relevance for outcome/timeframe
    // Make cognitive-load HIGH confidence (0.95) -> low relevance for next-action
    const signals: SignalVector = {
      signals: {
        'priority-matrix': makeCognitiveSignal('priority-matrix', 0.3),
        'cognitive-load': makeCognitiveSignal('cognitive-load', 0.95),
      },
      composites: [],
      totalMs: 10,
      protocolVersion: 1,
    };

    const session = createEnrichmentSession({
      inboxItemId: 'item-deep-7',
      content: 'Test',
      missingCategories: ['missing-outcome', 'missing-next-action', 'missing-timeframe'],
      cognitiveSignals: signals,
    });

    // outcome and timeframe should come before next-action
    const categories = session.questions.map((q) => q.category);
    const outcomeIdx = categories.indexOf('missing-outcome');
    const timeframeIdx = categories.indexOf('missing-timeframe');
    const nextActionIdx = categories.indexOf('missing-next-action');
    expect(outcomeIdx).toBeLessThan(nextActionIdx);
    expect(timeframeIdx).toBeLessThan(nextActionIdx);
  });

  it('Test 8: null cognitive signals preserves default GTD ordering', () => {
    const session = createEnrichmentSession({
      inboxItemId: 'item-deep-8',
      content: 'Test',
      cognitiveSignals: null,
    });

    // Default order: outcome, next-action, timeframe, context, reference
    const categories = session.questions.map((q) => q.category);
    expect(categories).toEqual([
      'missing-outcome',
      'missing-next-action',
      'missing-timeframe',
      'missing-context',
      'missing-reference',
    ]);
  });
});

describe('applyAnswer (iterative deepening)', () => {
  it('Test 9: increments categoryDepth for the answered category', () => {
    let session = createEnrichmentSession({
      inboxItemId: 'item-1',
      content: 'Test',
      missingCategories: ['missing-outcome'],
    });

    session = applyAnswer(session, makeAnswer('missing-outcome', 'Done'));

    expect(session.categoryDepth['missing-outcome']).toBe(1);
  });

  it('Test 10: replaces existing answer for same category (no duplicates)', () => {
    let session = createEnrichmentSession({
      inboxItemId: 'item-1',
      content: 'Test',
      missingCategories: ['missing-outcome', 'missing-outcome'],
    });

    // First answer
    session = applyAnswer(session, makeAnswer('missing-outcome', 'First answer'));
    // Second answer for same category (follow-up)
    session = applyAnswer(session, makeAnswer('missing-outcome', 'Deeper answer'));

    // Should have only 1 answer for missing-outcome, not 2
    const outcomeAnswers = session.answers.filter((a) => a.category === 'missing-outcome');
    expect(outcomeAnswers.length).toBe(1);
    expect(outcomeAnswers[0].selectedOption).toBe('Deeper answer');
  });
});
