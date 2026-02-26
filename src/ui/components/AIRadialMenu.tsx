/**
 * AIRadialMenu — radial/pie menu rendered when the AI orb is expanded.
 *
 * 5 segments arranged in a circle around the orb via CSS nth-child transforms.
 * The segment matching primaryAction receives the ai-radial-item--primary class
 * (larger, accent-colored, bolder).
 *
 * Actions:
 *   triage   — wired to triageInbox() in Plan 03
 *   review   — stub for Phase 6
 *   compress — stub for Phase 7
 *   discuss  — stub for AIQuestionFlow in Plan 04
 *   settings — opens AISettingsPanel immediately
 *
 * CSS transform positioning is in layout.css (ai-radial-item:nth-child rules).
 * No third-party radial menu library used — pure CSS transforms.
 *
 * Phase 5: AIUX-02
 */

import { createMemo, For } from 'solid-js';
import { setShowAISettings } from '../signals/store';

// --- Action definitions ---

interface RadialAction {
  id: string;
  label: string;
  icon: () => string; // returns SVG string
}

const ACTIONS: RadialAction[] = [
  {
    id: 'triage',
    label: 'Triage',
    icon: () => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M2 4h12M2 8h8M2 12h5"/>
      <circle cx="13" cy="11" r="2.5"/>
      <path d="M13 9v2l1 1"/>
    </svg>`,
  },
  {
    id: 'review',
    label: 'Review',
    icon: () => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="8" cy="8" r="5.5"/>
      <path d="M8 5v3l2 1.5"/>
    </svg>`,
  },
  {
    id: 'compress',
    label: 'Compress',
    icon: () => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 4l4 4 4-4M4 8l4 4 4-4"/>
    </svg>`,
  },
  {
    id: 'discuss',
    label: 'Discuss',
    icon: () => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M2.5 3h11a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H9l-3 2v-2H3.5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/>
    </svg>`,
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: () => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="8" cy="8" r="2.5"/>
      <path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M3.6 12.4l1.4-1.4M11 5l1.4-1.4"/>
    </svg>`,
  },
];

const ANALYZE_ACTION: RadialAction = {
  id: 'analyze',
  label: 'Analyze',
  icon: () => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M2 14l3-6 3 4 2-3 4 5"/>
    <circle cx="12" cy="4" r="2.5"/>
  </svg>`,
};

// --- Props ---

interface AIRadialMenuProps {
  primaryAction: string;
  selectedAtomId: string | null;
  onAction: (action: string) => void;
  onClose: () => void;
}

// --- Component ---

export function AIRadialMenu(props: AIRadialMenuProps) {
  // Swap "compress" for "analyze" when an atom is selected
  const actions = createMemo(() => {
    if (props.selectedAtomId) {
      return ACTIONS.map(a => a.id === 'compress' ? ANALYZE_ACTION : a);
    }
    return ACTIONS;
  });

  function handleAction(actionId: string) {
    if (actionId === 'settings') {
      setShowAISettings(true);
      props.onClose();
      return;
    }
    props.onAction(actionId);
    props.onClose();
  }

  return (
    <>
      {/* Backdrop: click outside the orb area to close */}
      <div
        class="ai-radial-backdrop"
        onClick={(e) => { e.stopPropagation(); props.onClose(); }}
        aria-hidden="true"
      />

      {/* Radial menu items */}
      <div
        class="ai-radial-menu"
        role="menu"
        aria-label="AI actions"
      >
        <For each={actions()}>
          {(action) => {
            const isPrimary = () => action.id === props.primaryAction;
            return (
              <button
                class={`ai-radial-item${isPrimary() ? ' ai-radial-item--primary' : ''}`}
                role="menuitem"
                aria-label={action.label}
                onClick={(e) => { e.stopPropagation(); handleAction(action.id); }}
                title={action.label}
              >
                <span
                  class="ai-radial-icon"
                  // eslint-disable-next-line solid/no-innerhtml
                  innerHTML={action.icon()}
                  aria-hidden="true"
                />
                {action.label}
              </button>
            );
          }}
        </For>
      </div>
    </>
  );
}
