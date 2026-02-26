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
 * Double-click/double-tap opens CaptureOverlay (replaces the old + FAB).
 *
 * Phase 5: AIUX-01, AIUX-02
 * Phase 6: 'review' radial action wired to startReviewBriefing() (AIRV-01)
 */

import { createSignal, createEffect, Show } from 'solid-js';
import { state, anyAIAvailable, startTriageInbox, startReviewBriefing, setActivePage, setShowCapture } from '../signals/store';
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

  // Double-click/double-tap detection for quick capture.
  // Uses onTouchEnd for reliable iOS handling (onClick can be swallowed by Safari
  // gesture recognition). The touchHandled flag prevents double-firing on devices
  // that emit both touchend and click.
  let lastTapTime = 0;
  let touchHandled = false;
  const DOUBLE_TAP_MS = 350;

  function handleTap() {
    if (props.isOverlayOpen) return;

    const now = Date.now();
    if (now - lastTapTime < DOUBLE_TAP_MS) {
      // Double-tap: open capture overlay
      lastTapTime = 0;
      setOrbState('idle');
      setShowCapture(true);
      return;
    }
    lastTapTime = now;

    // Delay single-tap action to distinguish from double-tap
    setTimeout(() => {
      // If a double-tap happened, lastTapTime was reset to 0
      if (lastTapTime === 0) return;

      const current = orbState();
      if (current === 'error') {
        startTriageInbox();
        setOrbState('idle');
      } else if (current === 'expanded') {
        setOrbState('idle');
      } else if (current === 'idle') {
        setOrbState('expanded');
      }
    }, DOUBLE_TAP_MS);
  }

  function handleTouchEnd(e: TouchEvent) {
    e.preventDefault(); // Prevent iOS from synthesizing a delayed click
    touchHandled = true;
    handleTap();
    // Reset flag after the click event would have fired
    setTimeout(() => { touchHandled = false; }, 50);
  }

  function handleClick() {
    // Skip if already handled by touchend (touch devices fire both)
    if (touchHandled) return;
    handleTap();
  }

  function handleMenuAction(action: string) {
    // Action callbacks — triage wired in Plan 03
    // 'discuss' wired to AIQuestionFlow in Plan 04
    // 'review', 'compress' are stubs for Phases 6-7
    if (action === 'triage') {
      setOrbState('idle');
      setActivePage('inbox');
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

    if (action === 'review') {
      // Phase 6: wire review action to briefing pipeline (AIRV-01, AIRV-02)
      setOrbState('idle');
      startReviewBriefing();
      return;
    }

    // Other actions ('compress') handled in their respective plans
  }

  function handleMenuClose() {
    setOrbState('idle');
  }

  const orbClass = () => {
    const base = `ai-orb ai-orb--${orbState()}`;
    return props.isOverlayOpen ? `${base} ai-orb--overlay-active` : base;
  };

  return (
    <div
      ref={orbRef}
      class={orbClass()}
      onTouchEnd={handleTouchEnd}
      onClick={handleClick}
      role="button"
      aria-label="AI assistant — double-click to capture"
      aria-expanded={orbState() === 'expanded'}
    >
      <img
        class="ai-orb-icon"
        src={orbState() === 'expanded' ? `${import.meta.env.BASE_URL}icons/orb-open.png` : `${import.meta.env.BASE_URL}icons/orb-closed.png`}
        alt=""
        draggable={false}
      />

      {/* Error message */}
      <Show when={orbState() === 'error'}>
        <span class="ai-orb-error-msg">Triage failed — tap to retry</span>
      </Show>

      {/* Radial menu — rendered when expanded, AI enabled, and no overlay active */}
      <Show when={orbState() === 'expanded' && state.aiEnabled && !props.isOverlayOpen}>
        <AIRadialMenu
          primaryAction={primaryAction()}
          onAction={handleMenuAction}
          onClose={handleMenuClose}
        />
      </Show>
    </div>
  );
}
