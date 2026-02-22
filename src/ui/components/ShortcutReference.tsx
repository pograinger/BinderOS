/**
 * ShortcutReference — Keyboard shortcut reference sheet overlay.
 *
 * Opened via the ? key (when not in an input field).
 * Shows all keyboard shortcuts organized by category.
 * Uses <kbd> elements for key indicators.
 *
 * CRITICAL: Never destructure props — breaks SolidJS reactivity.
 */

import { For } from 'solid-js';

interface ShortcutReferenceProps {
  onClose: () => void;
}

interface Shortcut {
  key: string;
  description: string;
}

interface ShortcutCategory {
  category: string;
  shortcuts: Shortcut[];
}

const SHORTCUTS: ShortcutCategory[] = [
  {
    category: 'Global',
    shortcuts: [
      { key: 'Ctrl/Cmd + N', description: 'Quick capture' },
      { key: 'Ctrl/Cmd + K', description: 'Search atoms (Spotlight)' },
      { key: 'Ctrl/Cmd + P', description: 'Command palette' },
      { key: 'Ctrl/Cmd + Z', description: 'Undo last action' },
      { key: '?', description: 'Keyboard shortcut reference' },
      { key: 'Escape', description: 'Close overlay or detail panel' },
    ],
  },
  {
    category: 'Navigation',
    shortcuts: [
      { key: '1', description: 'Go to Today' },
      { key: '2', description: 'Go to This Week' },
      { key: '3', description: 'Go to Active Projects' },
      { key: '4', description: 'Go to Waiting' },
      { key: '5', description: 'Go to Insights' },
    ],
  },
  {
    category: 'Lists',
    shortcuts: [
      { key: '↑ / ↓', description: 'Navigate items' },
      { key: 'Enter', description: 'Open selected item' },
      { key: 'Home', description: 'Jump to first item' },
      { key: 'End', description: 'Jump to last item' },
    ],
  },
  {
    category: 'Search',
    shortcuts: [
      { key: '↑ / ↓', description: 'Navigate results' },
      { key: 'Enter', description: 'Open selected result' },
      { key: 'Escape', description: 'Close search overlay' },
    ],
  },
  {
    category: 'Detail Panel',
    shortcuts: [
      { key: 'Escape', description: 'Close detail panel' },
    ],
  },
];

export function ShortcutReference(props: ShortcutReferenceProps) {
  return (
    <>
      {/* Backdrop */}
      <div
        class="shortcut-reference-backdrop"
        onClick={props.onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        class="shortcut-reference-overlay"
        role="dialog"
        aria-label="Keyboard shortcuts"
        aria-modal="true"
        onKeyDown={(e) => e.key === 'Escape' && props.onClose()}
        tabindex={-1}
      >
        <div class="shortcut-reference-header">
          <h2 class="shortcut-reference-title">Keyboard Shortcuts</h2>
          <button
            class="shortcut-reference-close"
            onClick={props.onClose}
            aria-label="Close shortcut reference"
            title="Close (Escape)"
          >
            ×
          </button>
        </div>

        <div class="shortcut-reference-grid">
          <For each={SHORTCUTS}>
            {(section) => (
              <div class="shortcut-category">
                <h3 class="shortcut-category-title">{section.category}</h3>
                <dl class="shortcut-list">
                  <For each={section.shortcuts}>
                    {(shortcut) => (
                      <>
                        <dt class="shortcut-key">
                          <kbd>{shortcut.key}</kbd>
                        </dt>
                        <dd class="shortcut-description">{shortcut.description}</dd>
                      </>
                    )}
                  </For>
                </dl>
              </div>
            )}
          </For>
        </div>
      </div>
    </>
  );
}
