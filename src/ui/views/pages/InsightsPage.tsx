/**
 * InsightsPage: Captured insights, newest first.
 *
 * Shows all atoms of type 'insight' that are not archived.
 * FilterBar shows sort and date range only.
 *
 * Empty state is compute-engine-driven.
 *
 * CRITICAL: Never destructure props or store. Use <For>/<Show>, not map/ternary.
 */

import { For, Show } from 'solid-js';
import { insightAtoms, filteredAndSortedAtoms, createFilterState } from '../../signals/queries';
import { FilterBar } from '../../components/FilterBar';
import { AtomCard } from '../../components/AtomCard';
import { setSelectedAtomId } from '../../signals/store';
import { useRovingTabindex } from '../../hooks/useRovingTabindex';

export function InsightsPage() {
  const { filters, setFilter } = createFilterState();
  const filteredAtoms = filteredAndSortedAtoms(insightAtoms, filters);

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
        <h2 class="page-title">Insights</h2>
        <Show when={filteredAtoms().length > 0}>
          <span class="page-count-badge">{filteredAtoms().length}</span>
        </Show>
      </div>

      {/* Sort and date range only */}
      <FilterBar
        filters={filters()}
        onFilterChange={setFilter}
        showTypeFilter={false}
        showStatusFilter={false}
        showPriorityFilter={false}
        showSectionFilter={false}
      />

      {/* Empty state */}
      <Show when={filteredAtoms().length === 0}>
        <div class="page-empty-state">
          <div class="page-empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="var(--atom-insight)">
              <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z" />
            </svg>
          </div>
          <p class="page-empty-title">No insights captured yet.</p>
          <p class="page-empty-subtitle">
            When you have an idea worth remembering, capture it as an Insight.
          </p>
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
