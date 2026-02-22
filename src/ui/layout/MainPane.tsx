/**
 * MainPane: Content area that renders the active page/view.
 *
 * Routes based on state.activePage:
 *   - 'inbox' -> InboxView (card-by-card triage)
 *   - 'all' -> SectionView (all atoms, no section filter)
 *   - 'section-{id}' -> SectionView with section filter
 *
 * CRITICAL: Never destructure props or store.
 */

import { Show, Switch, Match } from 'solid-js';
import { state } from '../signals/store';
import { InboxView } from '../views/InboxView';
import { SectionView } from '../views/SectionView';

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
          <Match when={state.activePage === 'all'}>
            <SectionView />
          </Match>
          <Match when={state.activePage.startsWith('section-')}>
            <SectionView sectionId={sectionId()} />
          </Match>
        </Switch>
      </Show>
    </div>
  );
}
