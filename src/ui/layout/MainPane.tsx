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

import { Show, Switch, Match } from 'solid-js';
import { state } from '../signals/store';
import { InboxView } from '../views/InboxView';
import { SectionView } from '../views/SectionView';
import { ReviewView } from '../views/ReviewView';
import { TodayPage } from '../views/pages/TodayPage';
import { ThisWeekPage } from '../views/pages/ThisWeekPage';
import { ActiveProjectsPage } from '../views/pages/ActiveProjectsPage';
import { WaitingPage } from '../views/pages/WaitingPage';
import { InsightsPage } from '../views/pages/InsightsPage';
import { AtomDetailView } from '../views/AtomDetailView';

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
        </Switch>
      </Show>

      {/* Phase 3: Atom detail panel — slide-in from right when an atom is selected */}
      <Show when={state.selectedAtomId !== null}>
        <AtomDetailView />
      </Show>
    </div>
  );
}
