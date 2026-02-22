/**
 * MainPane: Content area that renders the active page/view.
 *
 * Routes based on state.activePage:
 *   - 'inbox'           -> InboxView (card-by-card triage)
 *   - 'today'           -> TodayPage
 *   - 'this-week'       -> ThisWeekPage
 *   - 'active-projects' -> ActiveProjectsPage
 *   - 'waiting'         -> WaitingPage
 *   - 'insights'        -> InsightsPage
 *   - 'all'             -> SectionView (all atoms, no section filter)
 *   - 'review'          -> ReviewView
 *   - 'section-{id}'    -> SectionView with section filter
 *
 * Also renders AtomDetailView as a slide-in panel when state.selectedAtomId is set.
 *
 * CRITICAL: Never destructure props or store.
 */

import { Show, Switch, Match, For, createMemo } from 'solid-js';
import { state, setActivePage } from '../signals/store';
import { filteredAndSortedAtoms } from '../signals/queries';
import type { FilterState } from '../signals/queries';
import { InboxView } from '../views/InboxView';
import { SectionView } from '../views/SectionView';
import { ReviewView } from '../views/ReviewView';
import { TodayPage } from '../views/pages/TodayPage';
import { ThisWeekPage } from '../views/pages/ThisWeekPage';
import { ActiveProjectsPage } from '../views/pages/ActiveProjectsPage';
import { WaitingPage } from '../views/pages/WaitingPage';
import { InsightsPage } from '../views/pages/InsightsPage';
import { AtomDetailView } from '../views/AtomDetailView';
import { AtomCard } from '../components/AtomCard';

// SavedFilterView: renders the filtered atom list for a saved filter page
function SavedFilterView() {
  const filterId = createMemo(() => state.activePage.replace('filter-', ''));

  const savedFilter = createMemo(() =>
    state.savedFilters.find((f) => f.id === filterId()),
  );

  const filterState = createMemo((): FilterState => {
    const sf = savedFilter();
    if (!sf) return {
      types: [], statuses: [], tags: [], context: null,
      dateRange: null, sectionId: null, priorityTiers: [],
      sortBy: 'priority', sortOrder: 'desc',
    };
    return {
      types: sf.filter.types ?? [],
      statuses: sf.filter.statuses ?? [],
      tags: sf.filter.tags ?? [],
      context: sf.filter.context ?? null,
      dateRange: sf.filter.dateRange ?? null,
      sectionId: sf.filter.sectionId ?? null,
      priorityTiers: sf.filter.priorityTiers ?? [],
      sortBy: (sf.filter.sortBy as FilterState['sortBy']) ?? 'priority',
      sortOrder: (sf.filter.sortOrder as FilterState['sortOrder']) ?? 'desc',
    };
  });

  const filteredAtoms = filteredAndSortedAtoms(
    () => state.atoms,
    filterState,
  );

  return (
    <Show
      when={savedFilter()}
      fallback={
        <div class="page-empty-state">
          <p class="page-empty-subtitle">Filter not found. It may have been deleted.</p>
          <button class="page-empty-action" onClick={() => setActivePage('inbox')}>
            Go to Inbox
          </button>
        </div>
      }
    >
      <div class="page-view">
        <div class="page-header">
          <h1 class="page-title">{savedFilter()!.name}</h1>
          <span class="page-count-badge">{filteredAtoms().length}</span>
        </div>
        <div class="atom-list">
          <Show
            when={filteredAtoms().length > 0}
            fallback={
              <div class="page-empty-state">
                <p class="page-empty-subtitle">No atoms match this filter.</p>
              </div>
            }
          >
            <For each={filteredAtoms()}>
              {(atom) => <AtomCard atom={atom} />}
            </For>
          </Show>
        </div>
      </div>
    </Show>
  );
}

export function MainPane() {
  const sectionId = (): string | undefined => {
    if (state.activePage.startsWith('section-')) {
      return state.activePage.replace('section-', '');
    }
    return undefined;
  };

  return (
    <div class="main-pane">
      <Show when={!state.ready}>
        <div class="main-pane-placeholder">
          <span class="main-pane-placeholder-text">Loading...</span>
        </div>
      </Show>

      <Show when={state.ready}>
        <Switch>
          <Match when={state.activePage === 'inbox'}>
            <InboxView />
          </Match>
          <Match when={state.activePage === 'today'}>
            <TodayPage />
          </Match>
          <Match when={state.activePage === 'this-week'}>
            <ThisWeekPage />
          </Match>
          <Match when={state.activePage === 'active-projects'}>
            <ActiveProjectsPage />
          </Match>
          <Match when={state.activePage === 'waiting'}>
            <WaitingPage />
          </Match>
          <Match when={state.activePage === 'insights'}>
            <InsightsPage />
          </Match>
          <Match when={state.activePage === 'all'}>
            <SectionView />
          </Match>
          <Match when={state.activePage === 'review'}>
            <ReviewView />
          </Match>
          <Match when={state.activePage.startsWith('section-')}>
            <SectionView sectionId={sectionId()} />
          </Match>
          <Match when={state.activePage.startsWith('filter-')}>
            <SavedFilterView />
          </Match>
        </Switch>
      </Show>

      {/* Phase 3: Atom detail panel — slide-in from right when an atom is selected */}
      <Show when={state.selectedAtomId !== null}>
        <AtomDetailView />
      </Show>
    </div>
  );
}
