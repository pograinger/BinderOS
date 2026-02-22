/**
 * PageTabStrip: Horizontal scrollable tab strip.
 *
 * Shows Inbox, All Items, and section-specific tabs.
 * Active tab has a bottom border indicator (Material-style).
 * Scrollable on mobile via overflow-x auto.
 *
 * CRITICAL: Never destructure props. Use <For> for lists.
 */

import { For } from 'solid-js';
import { state, setActivePage } from '../signals/store';

interface PageTab {
  id: string;
  label: string;
}

const staticTabs: PageTab[] = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'all', label: 'All Items' },
];

export function PageTabStrip() {
  const tabs = (): PageTab[] => {
    const sectionTabs = state.sections.map((s) => ({
      id: `section-${s.id}`,
      label: s.name,
    }));
    return [...staticTabs, ...sectionTabs];
  };

  const handleTabClick = (tabId: string) => {
    setActivePage(tabId);
  };

  return (
    <div class="page-tab-strip">
      <For each={tabs()}>
        {(tab) => (
          <button
            class={`page-tab${state.activePage === tab.id ? ' active' : ''}`}
            onClick={() => handleTabClick(tab.id)}
          >
            {tab.label}
          </button>
        )}
      </For>
    </div>
  );
}
