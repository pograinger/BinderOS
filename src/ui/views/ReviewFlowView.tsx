/**
 * ReviewFlowView — full-screen guided GTD review experience.
 *
 * Renders the current step from the review flow state machine as a
 * ConversationTurnCard. Shows phase transitions, progress, and completion state.
 *
 * Phase 7: AIRV-03
 */

import { Show } from 'solid-js';
import {
  reviewFlowStatus,
  reviewFlowStep,
  reviewStepIndex,
  reviewTotalSteps,
  advanceReviewStep,
  cancelGuidedReview,
  completeGuidedReview,
  setActivePage,
} from '../signals/store';
import { ConversationTurnCard } from '../components/ConversationTurnCard';

// Phase display name helper
const phaseDisplayName = () => {
  const status = reviewFlowStatus();
  switch (status) {
    case 'get-clear': return 'Get Clear';
    case 'get-current': return 'Get Current';
    case 'get-creative': return 'Get Creative';
    case 'staging': return 'Review Proposals';
    default: return 'Review';
  }
};

// Phase order for progress dots
const PHASES = ['get-clear', 'get-current', 'get-creative'] as const;

function phaseStatus(phase: typeof PHASES[number]): 'complete' | 'active' | 'pending' {
  const status = reviewFlowStatus();
  const idx = PHASES.indexOf(phase);
  const currentIdx = PHASES.indexOf(status as typeof PHASES[number]);
  if (status === 'staging' || status === 'complete') return 'complete';
  if (idx < currentIdx) return 'complete';
  if (idx === currentIdx) return 'active';
  return 'pending';
}

export function ReviewFlowView() {
  function handleCancel() {
    cancelGuidedReview();
    setActivePage('review');
  }

  return (
    <div class="review-flow-view">
      {/* Header */}
      <div class="review-flow-header">
        <span class="review-flow-phase-name">{phaseDisplayName()}</span>

        {/* Phase progress dots */}
        <div class="review-phase-progress">
          <Show when={true}>
            <div class={`review-phase-dot${phaseStatus('get-clear') === 'active' ? ' review-phase-dot--active' : phaseStatus('get-clear') === 'complete' ? ' review-phase-dot--complete' : ''}`} title="Get Clear" />
            <div class="review-phase-connector" />
            <div class={`review-phase-dot${phaseStatus('get-current') === 'active' ? ' review-phase-dot--active' : phaseStatus('get-current') === 'complete' ? ' review-phase-dot--complete' : ''}`} title="Get Current" />
            <div class="review-phase-connector" />
            <div class={`review-phase-dot${phaseStatus('get-creative') === 'active' ? ' review-phase-dot--active' : phaseStatus('get-creative') === 'complete' ? ' review-phase-dot--complete' : ''}`} title="Get Creative" />
          </Show>
        </div>

        <button
          class="review-flow-cancel"
          type="button"
          onClick={handleCancel}
        >
          Cancel
        </button>
      </div>

      {/* Loading state — preparing next phase */}
      <Show when={reviewFlowStep() === null && reviewFlowStatus() !== 'staging' && reviewFlowStatus() !== 'idle' && reviewFlowStatus() !== 'complete'}>
        <div class="review-flow-staging">
          <div class="review-progress-spinner" />
          <p class="review-flow-staging-msg">Preparing next phase...</p>
        </div>
      </Show>

      {/* Active step */}
      <Show when={reviewFlowStep() !== null}>
        <ConversationTurnCard
          step={reviewFlowStep()!}
          onSelect={(optionId, freeformText) => void advanceReviewStep(optionId, freeformText)}
          stepIndex={reviewStepIndex()}
          totalSteps={reviewTotalSteps()}
          phaseName={phaseDisplayName()}
        />
      </Show>

      {/* Staging state */}
      <Show when={reviewFlowStatus() === 'staging'}>
        <div class="review-flow-staging">
          <p class="review-flow-staging-title">Review complete!</p>
          <p class="review-flow-staging-msg">You have pending suggestions to review.</p>
          <button
            class="briefing-action-btn briefing-action-btn--primary"
            type="button"
            onClick={() => void completeGuidedReview()}
          >
            Finish Review
          </button>
        </div>
      </Show>

      {/* Complete state */}
      <Show when={reviewFlowStatus() === 'complete'}>
        <div class="review-flow-complete">
          <p class="review-flow-complete-title">Weekly review complete!</p>
        </div>
      </Show>
    </div>
  );
}
