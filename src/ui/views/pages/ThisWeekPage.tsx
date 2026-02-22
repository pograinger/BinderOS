/**
 * ThisWeekPage: Tasks and events for the current week.
 *
 * Shows: tasks due this week, overdue tasks, and events happening this week.
 * Displays the Mon-Sun date range in the header.
 *
 * Empty state is compute-engine-driven.
 *
 * CRITICAL: Never destructure props or store. Use <For>/<Show>, not map/ternary.
 */

import { For, Show } from 'solid-js';
import { thisWeekAtoms, filteredAndSortedAtoms, createFilterState } from '../../signals/queries';
import { FilterBar } from '../../components/FilterBar';
import { AtomCard } from '../../components/AtomCard';
import { state, setSelectedAtomId, setActivePage } from '../../signals/store';
import { useRovingTabindex } from '../../hooks/useRovingTabindex';

/** Format Mon-Sun range for the current week. */
function weekRangeLabel(): string {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const diffToMon = day === 0 ? -6 : 1 - day;

  const mon = new Date(now);
  mon.setDate(now.getDate() + diffToMon);
  mon.setHours(0, 0, 0, 0);

  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);

  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return `${fmt(mon)} – ${fmt(sun)}`;
}

export function ThisWeekPage() {
  const { filters, setFilter } = createFilterState();
  const filteredAtoms = filteredAndSortedAtoms(thisWeekAtoms, filters);

  const { itemTabindex, isItemFocused, containerProps } = useRovingTabindex({
    itemCount: () => filteredAtoms().length,
    onSelect: (i) => {
      const atom = filteredAtoms()[i];
      if (atom) setSelectedAtomId(atom.id);
    },
  });

  return (
    <div class="page-view">
      <div class="page-header">
        <h2 class="page-title">This Week</h2>
        <span class="page-date-range">{weekRangeLabel()}</span>
        <Show when={filteredAtoms().length > 0}>
          <span class="page-count-badge">{filteredAtoms().length}</span>
        </Show>
      </div>

      <FilterBar
        filters={filters()}
        onFilterChange={setFilter}
        showSectionFilter={false}
      />

      {/* Empty state */}
      <Show when={filteredAtoms().length === 0}>
        <div class="page-empty-state">
          <div class="page-empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="var(--text-muted)">
              <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z" />
            </svg>
          </div>
          <Show when={state.compressionCandidates.length > 0}>
            <p class="page-empty-title">Your week is clear.</p>
            <p class="page-empty-subtitle">
              Good time to review {state.compressionCandidates.length} stale item
              {state.compressionCandidates.length !== 1 ? 's' : ''} in your system.
            </p>
            <button
              class="page-empty-action"
              onClick={() => setActivePage('review')}
            >
              Go to Review
            </button>
          </Show>
          <Show when={state.compressionCandidates.length === 0}>
            <p class="page-empty-title">Your week is clear.</p>
            <p class="page-empty-subtitle">Good time to plan ahead or review stale items.</p>
          </Show>
        </div>
      </Show>

      {/* Atom list */}
      <Show when={filteredAtoms().length > 0}>
        <div class="atom-list" {...(containerProps as Record<string, unknown>)}>
          <For each={filteredAtoms()}>
            {(atom, i) => (
              <AtomCard
                atom={atom}
                tabindex={itemTabindex(i())}
                focused={isItemFocused(i())}
                onClick={() => setSelectedAtomId(atom.id)}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
