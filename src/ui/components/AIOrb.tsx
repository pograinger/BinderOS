/**
 * AIOrb — floating AI entry point for BinderOS.
 *
 * Always-visible fixed-position orb styled as a binder ring that opens.
 * Reads anyAIAvailable() from store — hidden when no AI adapter is enabled.
 *
 * State machine:
 *   'idle'      — gentle ring pulse (default)
 *   'thinking'  — dashed ring rotates (AI processing)
 *   'streaming' — conic-gradient ring with slow spin (AI streaming response)
 *   'error'     — brief red flash, shows "Triage failed — tap to retry" message
 *   'expanded'  — ring fully open, radial menu rendered
 *
 * Module-level setOrbState export allows Plan 03 (triage pipeline) to drive
 * the orb state from outside the component.
 *
 * Context-aware positioning: reads state.activePage to adjust bottom/right offsets.
 * Overlay suppression: isOverlayOpen prop shrinks orb to dot and hides menu.
 *
 * Phase 5: AIUX-01, AIUX-02
 */

import { createSignal, createEffect, Show } from 'solid-js';
import { state, anyAIAvailable, startTriageInbox } from '../signals/store';
import { AIRadialMenu } from './AIRadialMenu';
import { setShowQuestionFlow, setQuestionFlowContext } from './AIQuestionFlow';

// --- State machine type ---

export type OrbState = 'idle' | 'thinking' | 'streaming' | 'error' | 'expanded';

// --- Module-level signal (exported for triage pipeline in Plan 03) ---

const [orbState, setOrbState] = createSignal<OrbState>('idle');
export { setOrbState };

// --- Props ---

interface AIOrpProps {
  isOverlayOpen?: boolean;
}

// --- Context-aware positioning ---

function getOrbPosition(page: string): { bottom: string; right: string } {
  switch (page) {
    case 'inbox':
      // Slightly higher on inbox to avoid overlap with triage card actions
      return { bottom: 'calc(var(--status-bar-height) + 96px)', right: '16px' };
    case 'all':
    case 'active-projects':
      return { bottom: 'calc(var(--status-bar-height) + 72px)', right: '24px' };
    default:
      return { bottom: 'calc(var(--status-bar-height) + 72px)', right: '16px' };
  }
}

// --- Component ---

export function AIOrb(props: AIOrpProps) {
  let orbRef: HTMLDivElement | undefined;

  // Primary action determined by current page
  const primaryAction = () => {
    switch (state.activePage) {
      case 'inbox': return 'triage';
      case 'today':
      case 'this-week': return 'review';
      case 'all':
      case 'active-projects': return 'compress';
      default: return 'discuss';
    }
  };

  // Update CSS custom properties when page changes
  createEffect(() => {
    const pos = getOrbPosition(state.activePage);
    if (orbRef) {
      orbRef.style.setProperty('--orb-bottom', pos.bottom);
      orbRef.style.setProperty('--orb-right', pos.right);
    }
  });

  function handleOrbClick() {
    if (props.isOverlayOpen) return;

    const current = orbState();
    if (current === 'error') {
      // Retry: trigger triage and reset to idle
      startTriageInbox();
      setOrbState('idle');
    } else if (current === 'expanded') {
      setOrbState('idle');
    } else if (current === 'idle') {
      setOrbState('expanded');
    }
    // Do not toggle during thinking/streaming
  }

  function handleMenuAction(action: string) {
    // Action callbacks — triage wired in Plan 03
    // 'discuss' wired to AIQuestionFlow in Plan 04
    // 'review', 'compress' are stubs for Phases 6-7
    if (action === 'triage') {
      setOrbState('idle');
      startTriageInbox();
      return;
    }

    if (action === 'discuss') {
      // Set up context-appropriate question flow options based on current page
      const isInbox = state.activePage === 'inbox';
      setQuestionFlowContext({
        title: isInbox
          ? 'What would you like to do with your inbox?'
          : 'What would you like to do?',
        description: isInbox
          ? 'Choose how to work with your inbox items'
          : 'Choose an action for the current view',
        options: isInbox
          ? [
              { id: 'process-all', label: 'Process all inbox items', description: 'Triage everything at once' },
              { id: 'tell-me', label: 'Tell me about this item', description: 'Explain the current inbox card' },
              { id: 'organize', label: 'Suggest organization', description: 'Recommend sections and groupings' },
              { id: 'prioritize', label: 'Prioritize inbox', description: 'Order items by urgency and importance' },
            ]
          : [
              { id: 'summarize', label: 'Summarize this section', description: 'Get an overview of current items' },
              { id: 'stale', label: 'Find stale items', description: 'Identify atoms that need attention' },
              { id: 'connections', label: 'Suggest connections', description: 'Find related atoms and patterns' },
            ],
        allowFreeform: true,
        onSelect: (optionId) => {
          // Phase 5 stub — actual AI conversation wired in Phases 6-7
          console.log('[AIOrb] Discuss option selected:', optionId);
        },
        onFreeform: (text) => {
          // Phase 5 stub — actual AI conversation wired in Phases 6-7
          console.log('[AIOrb] Discuss freeform input:', text);
        },
        onClose: () => {
          // No additional cleanup needed
        },
      });
      setShowQuestionFlow(true);
      return;
    }

    // Other actions ('review', 'compress') handled in their respective plans
  }

  function handleMenuClose() {
    setOrbState('idle');
  }

  const orbClass = () => {
    const base = `ai-orb ai-orb--${orbState()}`;
    return props.isOverlayOpen ? `${base} ai-orb--overlay-active` : base;
  };

  return (
    <Show when={anyAIAvailable()}>
      <div
        ref={orbRef}
        class={orbClass()}
        onClick={handleOrbClick}
        role="button"
        aria-label="AI assistant"
        aria-expanded={orbState() === 'expanded'}
      >
        <div class="ai-orb-ring" />

        {/* Error message */}
        <Show when={orbState() === 'error'}>
          <span class="ai-orb-error-msg">Triage failed — tap to retry</span>
        </Show>

        {/* Radial menu — rendered when expanded and no overlay active */}
        <Show when={orbState() === 'expanded' && !props.isOverlayOpen}>
          <AIRadialMenu
            primaryAction={primaryAction()}
            onAction={handleMenuAction}
            onClose={handleMenuClose}
          />
        </Show>
      </div>
    </Show>
  );
}
