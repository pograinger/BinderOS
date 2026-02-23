/**
 * PageTabStrip: Tab navigation with collapsible "More" dropdown.
 *
 * Primary tabs (Inbox, Today, Weekly) are always visible.
 * Remaining tabs (Active Projects, Waiting, Insights, All Items, Review,
 * section tabs, saved filter tabs) collapse into a "More" dropdown.
 *
 * If the active page is in the overflow group, the "More" button shows
 * that page's label so the user knows where they are.
 *
 * CRITICAL: Never destructure props. Use <For>/<Show> for conditionals.
 */

import { createSignal, For, Show, onCleanup } from 'solid-js';
import { state, setActivePage, sendCommand } from '../signals/store';

interface PageTab {
  id: string;
  label: string;
}

const primaryTabs: PageTab[] = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'today', label: 'Today' },
  { id: 'this-week', label: 'Weekly' },
];

const overflowStaticTabs: PageTab[] = [
  { id: 'active-projects', label: 'Active Projects' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'insights', label: 'Insights' },
  { id: 'all', label: 'All Items' },
];

const reviewTab: PageTab = { id: 'review', label: 'Review' };

export function PageTabStrip() {
  const [moreOpen, setMoreOpen] = createSignal(false);

  // Build overflow tabs dynamically (static pages + review + saved filters)
  // Note: PARA sections (Projects, Areas, Resources, Archive) are in the sidebar,
  // not duplicated here.
  const overflowTabs = (): PageTab[] => {
    const savedFilterTabs = state.savedFilters.map((f) => ({
      id: `filter-${f.id}`,
      label: f.name,
    }));
    return [...overflowStaticTabs, reviewTab, ...savedFilterTabs];
  };

  // Check if current active page is in the overflow group
  const activeOverflowTab = (): PageTab | null => {
    return overflowTabs().find((t) => t.id === state.activePage) ?? null;
  };

  const reviewCount = () => state.compressionCandidates.length;

  const handleTabClick = (tabId: string) => {
    setActivePage(tabId);
    setMoreOpen(false);
  };

  // Close dropdown on outside click
  const handleDocClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest('.page-tab-more-container')) {
      setMoreOpen(false);
    }
  };

  document.addEventListener('click', handleDocClick);
  onCleanup(() => document.removeEventListener('click', handleDocClick));

  return (
    <div class="page-tab-strip">
      {/* Primary tabs — always visible */}
      <For each={primaryTabs}>
        {(tab) => (
          <button
            class={`page-tab${state.activePage === tab.id ? ' active' : ''}`}
            onClick={() => handleTabClick(tab.id)}
          >
            {tab.label}
          </button>
        )}
      </For>

      {/* More dropdown */}
      <div class="page-tab-more-container">
        <button
          class={`page-tab page-tab-more${activeOverflowTab() ? ' active' : ''}`}
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen()}
          aria-haspopup="true"
        >
          {activeOverflowTab()?.label ?? 'More'}
          <svg class="page-tab-more-chevron" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M7 10l5 5 5-5z" />
          </svg>
        </button>

        <Show when={moreOpen()}>
          <div class="page-tab-dropdown">
            <For each={overflowTabs()}>
              {(tab) => (
                <button
                  class={`page-tab-dropdown-item${state.activePage === tab.id ? ' active' : ''}`}
                  onClick={() => handleTabClick(tab.id)}
                >
                  {tab.label}
                  <Show when={tab.id === 'review' && reviewCount() > 0}>
                    <span class="review-tab-badge">{reviewCount()}</span>
                  </Show>
                  {/* Delete button for saved filter tabs */}
                  <Show when={tab.id.startsWith('filter-')}>
                    <button
                      class="filter-tab-delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        const filterId = tab.id.replace('filter-', '');
                        sendCommand({ type: 'DELETE_FILTER', payload: { id: filterId } });
                        if (state.activePage === tab.id) {
                          setActivePage('inbox');
                        }
                        setMoreOpen(false);
                      }}
                      title="Remove saved filter"
                      aria-label={`Remove filter tab ${tab.label}`}
                    >
                      ×
                    </button>
                  </Show>
                </button>
              )}
            </For>
          </div>
        </Show>
      </div>
    </div>
  );
}
