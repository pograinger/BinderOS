/**
 * WaitingPage: Tasks blocked on external action (status = 'waiting').
 *
 * Shows waiting tasks oldest-first.
 * Long-wait badge is shown when staleness > 0.5.
 *
 * Empty state is compute-engine-driven.
 *
 * CRITICAL: Never destructure props or store. Use <For>/<Show>, not map/ternary.
 */

import { For, Show } from 'solid-js';
import { waitingAtoms, filteredAndSortedAtoms, createFilterState } from '../../signals/queries';
import { FilterBar } from '../../components/FilterBar';
import { AtomCard } from '../../components/AtomCard';
import { state, setSelectedAtomId } from '../../signals/store';
import { useRovingTabindex } from '../../hooks/useRovingTabindex';

export function WaitingPage() {
  // Filter state — only sort controls shown (all items are waiting by definition)
  const { filters, setFilter } = createFilterState();
  const filteredAtoms = filteredAndSortedAtoms(waitingAtoms, filters);

  const { itemTabindex, isItemFocused } = useRovingTabindex({
    itemCount: () => filteredAtoms().length,
    onSelect: (i) => {
      const atom = filteredAtoms()[i];
      if (atom) setSelectedAtomId(atom.id);
    },
  });

  // Count how many have staleness > 0.5 (long wait)
  const longWaitCount = () =>
    filteredAtoms().filter((a) => (state.scores[a.id]?.staleness ?? 0) > 0.5).length;

  return (
    <div class="page-view">
      <div class="page-header">
        <h2 class="page-title">Waiting</h2>
        <Show when={filteredAtoms().length > 0}>
          <span class="page-count-badge">{filteredAtoms().length}</span>
        </Show>
      </div>

      {/* Only sort controls — all items are waiting tasks by definition */}
      <FilterBar
        filters={filters()}
        onFilterChange={setFilter}
        showTypeFilter={false}
        showStatusFilter={false}
        showPriorityFilter={false}
        showDateRange={false}
        showSectionFilter={false}
      />

      {/* Long wait hint */}
      <Show when={longWaitCount() > 0}>
        <p class="page-wait-hint">
          {longWaitCount()} item{longWaitCount() !== 1 ? 's have' : ' has'} been waiting a long time. Consider following up.
        </p>
      </Show>

      {/* Empty state */}
      <Show when={filteredAtoms().length === 0}>
        <div class="page-empty-state">
          <div class="page-empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="var(--text-muted)">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z" />
            </svg>
          </div>
          <p class="page-empty-title">Nothing waiting.</p>
          <p class="page-empty-subtitle">
            If you're blocked on something, mark a task as 'waiting'.
          </p>
        </div>
      </Show>

      {/* Atom list */}
      <Show when={filteredAtoms().length > 0}>
        <div class="atom-list" role="listbox">
          <For each={filteredAtoms()}>
            {(atom, i) => (
              <div class="waiting-atom-row">
                <Show when={(state.scores[atom.id]?.staleness ?? 0) > 0.5}>
                  <span class="long-wait-badge">Long wait</span>
                </Show>
                <AtomCard
                  atom={atom}
                  tabindex={itemTabindex(i())}
                  focused={isItemFocused(i())}
                  onClick={() => setSelectedAtomId(atom.id)}
                />
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
