/**
 * Tests for extended enrichment types (iterative deepening).
 *
 * Phase 25: ITER-01, ITER-02
 */

import { describe, it, expect } from 'vitest';
import type { EnrichmentSession } from './types';
import { TEMPLATE_TIER_COUNT } from './types';

describe('EnrichmentSession iterative deepening fields', () => {
  it('accepts categoryDepth as Record<string, number>', () => {
    const session: EnrichmentSession = {
      inboxItemId: '123',
      originalContent: 'test',
      phase: 'questions',
      questions: [],
      currentQuestionIndex: 0,
      answers: [],
      decompositionSteps: [],
      currentStepIndex: 0,
      acceptedSteps: [],
      graduationProposal: null,
      provenance: 0,
      categoryDepth: { 'missing-outcome': 2, 'missing-context': 1 },
      cognitiveSignals: null,
      activeDeepening: null,
    };
    expect(session.categoryDepth['missing-outcome']).toBe(2);
  });

  it('accepts cognitiveSignals as SignalVector | null', () => {
    const session: EnrichmentSession = {
      inboxItemId: '123',
      originalContent: 'test',
      phase: 'questions',
      questions: [],
      currentQuestionIndex: 0,
      answers: [],
      decompositionSteps: [],
      currentStepIndex: 0,
      acceptedSteps: [],
      graduationProposal: null,
      provenance: 0,
      categoryDepth: {},
      cognitiveSignals: {
        signals: {},
        composites: [],
        totalMs: 0,
        protocolVersion: 1,
      },
      activeDeepening: null,
    };
    expect(session.cognitiveSignals).not.toBeNull();
  });

  it('accepts activeDeepening as MissingInfoCategory | null', () => {
    const session: EnrichmentSession = {
      inboxItemId: '123',
      originalContent: 'test',
      phase: 'questions',
      questions: [],
      currentQuestionIndex: 0,
      answers: [],
      decompositionSteps: [],
      currentStepIndex: 0,
      acceptedSteps: [],
      graduationProposal: null,
      provenance: 0,
      categoryDepth: {},
      cognitiveSignals: null,
      activeDeepening: 'missing-outcome',
    };
    expect(session.activeDeepening).toBe('missing-outcome');
  });

  it('exports TEMPLATE_TIER_COUNT as 2', () => {
    expect(TEMPLATE_TIER_COUNT).toBe(2);
  });
});
