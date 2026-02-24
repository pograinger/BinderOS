/**
 * AIQuestionFlow — reusable conversational question-flow component.
 *
 * Implements AIUX-03: 3-4 structured option buttons + freeform text input.
 * Used by the "Discuss" orb action in Phase 5 and wired to full AI conversations
 * in Phases 6-7 (review sessions, GTD question flows).
 *
 * Module-level signal pattern (same as Shell.tsx setShowAISettings):
 * - showQuestionFlow: boolean — controls visibility
 * - setShowQuestionFlow: exported setter — called by AIOrb "discuss" action
 * - questionFlowContext: QuestionFlowContext | null — options, callbacks, title
 * - setQuestionFlowContext: exported setter — called by page components to configure context
 *
 * Keyboard support:
 * - Escape key closes the panel
 * - Enter in freeform input submits
 *
 * Phase 5: AIUX-03
 */

import { createSignal, createEffect, onCleanup, Show, For } from 'solid-js';

// --- Types ---

export interface QuestionFlowOption {
  id: string;
  label: string;
  description?: string;
}

export interface QuestionFlowContext {
  title: string;
  description?: string;
  options: QuestionFlowOption[];
  allowFreeform: boolean;
  onSelect: (optionId: string) => void;
  onFreeform: (text: string) => void;
  onClose: () => void;
}

// --- Module-level signals (exported for use by AIOrb and page components) ---

const [showQuestionFlow, setShowQuestionFlow] = createSignal(false);
const [questionFlowContext, setQuestionFlowContext] = createSignal<QuestionFlowContext | null>(null);

export { showQuestionFlow, setShowQuestionFlow, setQuestionFlowContext };

// --- Component ---

export function AIQuestionFlow() {
  const [freeformText, setFreeformText] = createSignal('');

  const ctx = () => questionFlowContext();

  // Escape key closes the panel
  createEffect(() => {
    if (!showQuestionFlow()) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        ctx()?.onClose();
        setShowQuestionFlow(false);
      }
    };

    document.addEventListener('keydown', handler);
    onCleanup(() => document.removeEventListener('keydown', handler));
  });

  function handleOptionClick(optionId: string) {
    ctx()?.onSelect(optionId);
    setShowQuestionFlow(false);
  }

  function handleFreeformSubmit() {
    const text = freeformText().trim();
    if (!text) return;
    ctx()?.onFreeform(text);
    setFreeformText('');
    setShowQuestionFlow(false);
  }

  function handleClose() {
    ctx()?.onClose();
    setShowQuestionFlow(false);
  }

  return (
    <Show when={showQuestionFlow() && ctx()}>
      {/* Backdrop — click outside to close */}
      <div
        class="ai-question-flow-backdrop"
        onClick={handleClose}
      >
        {/* Panel — stop propagation so backdrop click doesn't fire inside panel */}
        <div
          class="ai-question-flow"
          onClick={(e) => e.stopPropagation()}
        >
          <div class="ai-qf-title">{ctx()!.title}</div>

          <Show when={ctx()!.description}>
            <div class="ai-qf-description">{ctx()!.description}</div>
          </Show>

          {/* Structured option buttons */}
          <div class="ai-qf-options">
            <For each={ctx()!.options}>
              {(option) => (
                <button
                  class="ai-qf-option"
                  onClick={() => handleOptionClick(option.id)}
                >
                  <span class="ai-qf-option-label">{option.label}</span>
                  <Show when={option.description}>
                    <span class="ai-qf-option-desc">{option.description}</span>
                  </Show>
                </button>
              )}
            </For>
          </div>

          {/* Freeform text input */}
          <Show when={ctx()!.allowFreeform}>
            <div class="ai-qf-freeform">
              <input
                class="ai-qf-input"
                type="text"
                placeholder="Or type your own..."
                value={freeformText()}
                onInput={(e) => setFreeformText(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && freeformText().trim()) {
                    handleFreeformSubmit();
                  }
                }}
              />
            </div>
          </Show>

          <button class="ai-qf-close" onClick={handleClose}>
            Cancel
          </button>
        </div>
      </div>
    </Show>
  );
}
