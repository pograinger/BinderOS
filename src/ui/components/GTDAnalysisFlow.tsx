/**
 * GTDAnalysisFlow — multi-step GTD decision tree Q&A panel.
 *
 * Dedicated multi-step panel (NOT extending AIQuestionFlow — that's single-step).
 * Shows:
 * - Step history as collapsed summary chips
 * - Current LLM-generated question with option buttons
 * - "Thinking..." spinner between steps
 * - Back button to revisit previous step
 * - Suggestion card at the end with Accept/Modify/Dismiss
 *
 * Module-level signals:
 * - showGTDFlow / setShowGTDFlow: visibility control
 * - gtdFlowState / setGTDFlowState: full flow state
 *
 * Phase 7: GTD analysis skill agent
 */

import { createSignal, createEffect, onCleanup, Show, For } from 'solid-js';
import type { GTDStepId, GTDStep, GTDAnswer, GTDRecommendation } from '../../ai/gtd-analysis';
import { determineNextStep, executeGTDStep, generateRecommendation, cancelGTDAnalysis } from '../../ai/gtd-analysis';
import { GTDSuggestionCard } from './GTDSuggestionCard';
import type { Atom } from '../../types/atoms';

// --- Flow state ---

export type GTDFlowStatus = 'loading' | 'asking' | 'generating-recommendation' | 'recommendation' | 'error';

export interface GTDFlowState {
  atom: Atom;
  relatedAtoms: Atom[];
  currentStep: GTDStep | null;
  answers: GTDAnswer[];
  recommendation: GTDRecommendation | null;
  status: GTDFlowStatus;
  error: string | null;
}

// --- Module-level signals ---

const [showGTDFlow, setShowGTDFlow] = createSignal(false);
const [gtdFlowState, setGTDFlowState] = createSignal<GTDFlowState | null>(null);

export { showGTDFlow, setShowGTDFlow, gtdFlowState, setGTDFlowState };

// --- Component ---

export function GTDAnalysisFlow() {
  // Escape key closes the panel
  createEffect(() => {
    if (!showGTDFlow()) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handler);
    onCleanup(() => document.removeEventListener('keydown', handler));
  });

  function handleClose() {
    cancelGTDAnalysis();
    setShowGTDFlow(false);
    setGTDFlowState(null);
  }

  async function handleOptionSelect(optionId: string) {
    const flow = gtdFlowState();
    if (!flow || !flow.currentStep) return;

    const selectedOption = flow.currentStep.options.find(o => o.id === optionId);
    if (!selectedOption) return;

    const answer: GTDAnswer = {
      stepId: flow.currentStep.stepId,
      selectedOptionId: optionId,
      selectedLabel: selectedOption.label,
    };

    const updatedAnswers = [...flow.answers, answer];
    const nextStepId = determineNextStep(flow.currentStep.stepId, optionId);

    if (nextStepId === 'done') {
      // Generate recommendation
      setGTDFlowState({
        ...flow,
        answers: updatedAnswers,
        currentStep: null,
        status: 'generating-recommendation',
      });

      try {
        const rec = await generateRecommendation(
          flow.atom,
          flow.relatedAtoms,
          updatedAnswers,
        );
        setGTDFlowState(prev => prev ? {
          ...prev,
          recommendation: rec,
          status: 'recommendation',
        } : null);
      } catch {
        setGTDFlowState(prev => prev ? {
          ...prev,
          status: 'error',
          error: 'Failed to generate recommendation',
        } : null);
      }
      return;
    }

    // Load next step
    setGTDFlowState({
      ...flow,
      answers: updatedAnswers,
      currentStep: null,
      status: 'loading',
    });

    try {
      const step = await executeGTDStep(
        nextStepId,
        flow.atom,
        flow.relatedAtoms,
        updatedAnswers,
      );
      setGTDFlowState(prev => prev ? {
        ...prev,
        currentStep: step,
        status: 'asking',
      } : null);
    } catch {
      setGTDFlowState(prev => prev ? {
        ...prev,
        status: 'error',
        error: 'Failed to load next step',
      } : null);
    }
  }

  function handleBack() {
    const flow = gtdFlowState();
    if (!flow || flow.answers.length === 0) return;

    const lastAnswer = flow.answers[flow.answers.length - 1];
    if (!lastAnswer) return;

    const prevAnswers = flow.answers.slice(0, -1);

    setGTDFlowState({
      ...flow,
      answers: prevAnswers,
      currentStep: null,
      recommendation: null,
      status: 'loading',
    });

    // Re-execute the step the user wants to go back to
    void executeGTDStep(
      lastAnswer.stepId,
      flow.atom,
      flow.relatedAtoms,
      prevAnswers,
    ).then(step => {
      setGTDFlowState(prev => prev ? {
        ...prev,
        currentStep: step,
        status: 'asking',
      } : null);
    }).catch(() => {
      setGTDFlowState(prev => prev ? {
        ...prev,
        status: 'error',
        error: 'Failed to reload step',
      } : null);
    });
  }

  function handleAccept(changes: Record<string, unknown>) {
    const flow = gtdFlowState();
    if (!flow) return;

    // Lazy import to avoid circular dependency
    import('../signals/store').then(({ applyGTDRecommendation }) => {
      applyGTDRecommendation(flow.atom.id, changes);
    });

    handleClose();
  }

  function handleDismiss() {
    handleClose();
  }

  const flow = () => gtdFlowState();

  return (
    <Show when={showGTDFlow() && flow()}>
      <div class="gtd-flow-backdrop" onClick={handleClose}>
        <div class="gtd-flow-panel" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div class="gtd-flow-header">
            <span class="gtd-flow-title">GTD Analysis</span>
            <span class="gtd-flow-atom-name">{flow()!.atom.title}</span>
            <button class="gtd-flow-close" onClick={handleClose} aria-label="Close">
              &times;
            </button>
          </div>

          {/* Step history chips */}
          <Show when={flow()!.answers.length > 0}>
            <div class="gtd-flow-history">
              <For each={flow()!.answers}>
                {(answer) => (
                  <div class="gtd-flow-chip">
                    <span class="gtd-flow-chip-step">{answer.stepId.replace(/-/g, ' ')}</span>
                    <span class="gtd-flow-chip-answer">{answer.selectedLabel}</span>
                  </div>
                )}
              </For>
            </div>
          </Show>

          {/* Loading spinner */}
          <Show when={flow()!.status === 'loading' || flow()!.status === 'generating-recommendation'}>
            <div class="gtd-flow-loading">
              <div class="gtd-flow-spinner" />
              <span>
                {flow()!.status === 'generating-recommendation'
                  ? 'Generating recommendation...'
                  : 'Thinking...'}
              </span>
            </div>
          </Show>

          {/* Current question */}
          <Show when={flow()!.status === 'asking' && flow()!.currentStep}>
            <div class="gtd-flow-question">
              <div class="gtd-flow-q-text">{flow()!.currentStep!.question}</div>
              <Show when={flow()!.currentStep!.aiGenerated}>
                <span class="gtd-flow-ai-tag">AI-tailored</span>
              </Show>
              <div class="gtd-flow-options">
                <For each={flow()!.currentStep!.options}>
                  {(option) => (
                    <button
                      class="gtd-flow-option"
                      onClick={() => handleOptionSelect(option.id)}
                    >
                      <span class="gtd-flow-option-label">{option.label}</span>
                      <Show when={option.description}>
                        <span class="gtd-flow-option-desc">{option.description}</span>
                      </Show>
                    </button>
                  )}
                </For>
              </div>
            </div>
          </Show>

          {/* Recommendation */}
          <Show when={flow()!.status === 'recommendation' && flow()!.recommendation}>
            <GTDSuggestionCard
              atom={flow()!.atom}
              recommendation={flow()!.recommendation!}
              onAccept={handleAccept}
              onDismiss={handleDismiss}
            />
          </Show>

          {/* Error state */}
          <Show when={flow()!.status === 'error'}>
            <div class="gtd-flow-error">
              <span>{flow()!.error ?? 'Something went wrong'}</span>
              <button class="gtd-flow-retry" onClick={handleClose}>Close</button>
            </div>
          </Show>

          {/* Back button */}
          <Show when={flow()!.answers.length > 0 && flow()!.status === 'asking'}>
            <button class="gtd-flow-back" onClick={handleBack}>
              &larr; Back
            </button>
          </Show>
        </div>
      </div>
    </Show>
  );
}
