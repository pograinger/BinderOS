/**
 * PageTabStrip: Horizontal scrollable tab strip.
 *
 * Shows Inbox, Today, This Week, Active Projects, Waiting, Insights,
 * All Items, Review, section-specific tabs, and saved filter tabs.
 * Active tab has a bottom border indicator (Material-style).
 * Scrollable on mobile via overflow-x auto.
 *
 * Saved filter tabs are appended after Review with id 'filter-{filter.id}'
 * so Plan 04 saved filter feature renders immediately once filters are saved.
 *
 * CRITICAL: Never destructure props. Use <For> for lists.
 */

import { For, Show } from 'solid-js';
import { state, setActivePage } from '../signals/store';

interface PageTab {
  id: string;
  label: string;
}

const staticTabs: PageTab[] = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'today', label: 'Today' },
  { id: 'this-week', label: 'This Week' },
  { id: 'active-projects', label: 'Active Projects' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'insights', label: 'Insights' },
  { id: 'all', label: 'All Items' },
];

const reviewTab: PageTab = { id: 'review', label: 'Review' };

export function PageTabStrip() {
  const tabs = (): PageTab[] => {
    const sectionTabs = state.sections.map((s) => ({
      id: `section-${s.id}`,
      label: s.name,
    }));
    const savedFilterTabs = state.savedFilters.map((f) => ({
      id: `filter-${f.id}`,
      label: f.name,
    }));
    return [...staticTabs, ...sectionTabs, reviewTab, ...savedFilterTabs];
  };

  const handleTabClick = (tabId: string) => {
    setActivePage(tabId);
  };

  const reviewCount = () => state.compressionCandidates.length;

  return (
    <div class="page-tab-strip">
      <For each={tabs()}>
        {(tab) => (
          <button
            class={`page-tab${state.activePage === tab.id ? ' active' : ''}`}
            onClick={() => handleTabClick(tab.id)}
          >
            {tab.label}
            <Show when={tab.id === 'review' && reviewCount() > 0}>
              <span class="review-tab-badge">{reviewCount()}</span>
            </Show>
          </button>
        )}
      </For>
    </div>
  );
}
