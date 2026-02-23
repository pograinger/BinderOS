/**
 * ThisWeekPage: Weekly view with Last Week / This Week / Next Week tabs.
 *
 * Shows: tasks due in the selected week, overdue tasks (current/next only),
 * and events in that week. Sun-Sat calendar weeks.
 *
 * Empty state is compute-engine-driven.
 *
 * CRITICAL: Never destructure props or store. Use <For>/<Show>, not map/ternary.
 */

import { createSignal, For, Show } from 'solid-js';
import { createWeeklyAtoms, weekRangeLabel, filteredAndSortedAtoms, createFilterState } from '../../signals/queries';
import type { WeekOffset } from '../../signals/queries';
import { FilterBar } from '../../components/FilterBar';
import { AtomCard } from '../../components/AtomCard';
import { state, setSelectedAtomId, setActivePage } from '../../signals/store';
import { useRovingTabindex } from '../../hooks/useRovingTabindex';

const TABS: { offset: WeekOffset; label: string }[] = [
  { offset: -1, label: 'Last Week' },
  { offset: 0, label: 'This Week' },
  { offset: 1, label: 'Next Week' },
];

export function ThisWeekPage() {
  const [weekOffset, setWeekOffset] = createSignal<WeekOffset>(0);
  const weekAtoms = createWeeklyAtoms(weekOffset);
  const { filters, setFilter } = createFilterState();
  const filteredAtoms = filteredAndSortedAtoms(weekAtoms, filters);

  const { itemTabindex, isItemFocused } = useRovingTabindex({
    itemCount: () => filteredAtoms().length,
    onSelect: (i) => {
      const atom = filteredAtoms()[i];
      if (atom) setSelectedAtomId(atom.id);
    },
    onLeft: () => setWeekOffset((v) => Math.max(-1, v - 1) as WeekOffset),
    onRight: () => setWeekOffset((v) => Math.min(1, v + 1) as WeekOffset),
  });

  return (
    <div class="page-view">
      <div class="page-header">
        <h2 class="page-title">Weekly</h2>
        <Show when={filteredAtoms().length > 0}>
          <span class="page-count-badge">{filteredAtoms().length}</span>
        </Show>
      </div>

      {/* Week tabs */}
      <div class="week-tabs">
        <For each={TABS}>
          {(tab) => (
            <button
              class={`week-tab${weekOffset() === tab.offset ? ' active' : ''}`}
              onClick={() => setWeekOffset(tab.offset)}
            >
              <span class="week-tab-label">{tab.label}</span>
              <span class="week-tab-range">{weekRangeLabel(tab.offset)}</span>
            </button>
          )}
        </For>
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
            <p class="page-empty-title">Nothing scheduled.</p>
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
            <p class="page-empty-title">Nothing scheduled.</p>
            <p class="page-empty-subtitle">Good time to plan ahead or review stale items.</p>
          </Show>
        </div>
      </Show>

      {/* Atom list */}
      <Show when={filteredAtoms().length > 0}>
        <div class="atom-list" role="listbox">
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
