/**
 * MainPane: Content area that renders the active page/view.
 *
 * Routes based on state.activePage:
 * - 'inbox' -> Inbox view placeholder
 * - 'all' -> All atoms placeholder
 * - 'section-{id}' -> Section view placeholder
 *
 * Placeholder content will be replaced by real view components in Plan 01-04.
 *
 * CRITICAL: Never destructure props or store.
 */

import { Show } from 'solid-js';
import { state } from '../signals/store';

export function MainPane() {
  const pageLabel = (): string => {
    if (state.activePage === 'inbox') return 'Inbox';
    if (state.activePage === 'all') return 'All Items';
    if (state.activePage.startsWith('section-')) {
      const sectionId = state.activePage.replace('section-', '');
      const section = state.sections.find((s) => s.id === sectionId);
      return section ? section.name : 'Section';
    }
    return state.activePage;
  };

  const pageIcon = (): string => {
    if (state.activePage === 'inbox') return '\u{1F4E5}';
    if (state.activePage === 'all') return '\u{1F4CB}';
    return '\u{1F4C1}';
  };

  return (
    <div class="main-pane">
      <div class="main-pane-placeholder">
        <span class="main-pane-placeholder-icon">{pageIcon()}</span>
        <span class="main-pane-placeholder-text">{pageLabel()} view</span>
        <Show when={!state.ready}>
          <span class="main-pane-placeholder-text" style={{ "font-size": "12px" }}>
            Loading...
          </span>
        </Show>
        <Show when={state.ready && state.activePage === 'inbox'}>
          <span class="main-pane-placeholder-text" style={{ "font-size": "12px", color: "var(--text-muted)" }}>
            Capture your first thought (Plan 01-04)
          </span>
        </Show>
      </div>
    </div>
  );
}
