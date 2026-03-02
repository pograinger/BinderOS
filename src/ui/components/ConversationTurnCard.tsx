/**
 * ConversationTurnCard — inline question card for the GTD review flow.
 *
 * Renders a single ReviewFlowStep as a card with:
 * - Optional context area (atom title, project name)
 * - Question text
 * - 3-4 structured option buttons
 * - Optional freeform text input
 * - No backdrop, no close button (it's inline, not a modal)
 *
 * Phase 7: AIRV-03
 */

import { createSignal } from 'solid-js';
import { Show, For } from 'solid-js';
import type { ReviewFlowStep } from '../../types/review';

interface ConversationTurnCardProps {
  step: ReviewFlowStep;
  onSelect: (optionId: string, freeformText?: string) => void;
  stepIndex: number;
  totalSteps: number;
  phaseName: string;   // 'Get Clear' | 'Get Current' | 'Get Creative'
}

export function ConversationTurnCard(props: ConversationTurnCardProps) {
  const [freeformText, setFreeformText] = createSignal('');

  function handleOptionClick(optionId: string) {
    props.onSelect(optionId);
  }

  function handleFreeformSubmit() {
    const text = freeformText().trim();
    if (!text) return;
    props.onSelect('freeform', text);
    setFreeformText('');
  }

  function handleFreeformKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleFreeformSubmit();
    }
  }

  return (
    <div class="conversation-turn-card">
      {/* Progress indicator */}
      <div class="conversation-turn-progress">
        {props.phaseName} — Step {props.stepIndex + 1} of {props.totalSteps}
      </div>

      {/* Optional context */}
      <Show when={props.step.context}>
        <div class="conversation-turn-context">
          {props.step.context!.slice(0, 200)}
        </div>
      </Show>

      {/* Question */}
      <div class="conversation-turn-question">
        {props.step.question}
      </div>

      {/* Options */}
      <div class="conversation-turn-options">
        <For each={props.step.options}>
          {(option) => (
            <button
              class="conversation-turn-option"
              onClick={() => handleOptionClick(option.id)}
              type="button"
            >
              <span class="conversation-turn-option-label">{option.label}</span>
              <Show when={option.description}>
                <span class="conversation-turn-option-desc">{option.description}</span>
              </Show>
            </button>
          )}
        </For>
      </div>

      {/* Freeform input */}
      <Show when={props.step.allowFreeform}>
        <div class="conversation-turn-freeform">
          <input
            type="text"
            placeholder="Type your own..."
            value={freeformText()}
            onInput={(e) => setFreeformText(e.currentTarget.value)}
            onKeyDown={handleFreeformKeyDown}
          />
          <button
            type="button"
            onClick={handleFreeformSubmit}
          >
            Add
          </button>
        </div>
      </Show>
    </div>
  );
}
