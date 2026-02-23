/**
 * SectionView: Shows atoms filtered by active section/section item.
 *
 * Uses AtomCard components with built-in swipe gestures.
 * Empty state: contextual hint ("No items yet. Capture a thought!").
 *
 * CRITICAL: Never destructure props. Use <For> for lists. Use <Show> for conditionals.
 */

import { createSignal, createMemo, For, Show } from 'solid-js';
import { state, setSelectedAtomId } from '../signals/store';
import { filteredAndSortedAtoms, createFilterState } from '../signals/queries';
import { AtomCard } from '../components/AtomCard';
import { FilterBar } from '../components/FilterBar';
import { SectionItemList } from '../components/SectionItemList';
import { useRovingTabindex } from '../hooks/useRovingTabindex';
import type { Atom } from '../../types/atoms';

interface SectionViewProps {
  sectionId?: string;
}

export function SectionView(props: SectionViewProps) {
  const [activeSectionItemId, setActiveSectionItemId] = createSignal<string | null>(null);
  const { filters, setFilter } = createFilterState();

  // Base atoms before FilterBar filtering
  const baseAtoms = createMemo((): Atom[] => {
    const itemId = activeSectionItemId();

    if (itemId) {
      return state.atoms.filter(
        (a) => a.sectionItemId === itemId && a.status !== 'archived',
      );
    } else if (props.sectionId) {
      const sectionItemIds = state.sectionItems
        .filter((si) => si.sectionId === props.sectionId && !si.archived)
        .map((si) => si.id);
      return state.atoms.filter(
        (a) =>
          (a.sectionId === props.sectionId || (a.sectionItemId && sectionItemIds.includes(a.sectionItemId))) &&
          a.status !== 'archived',
      );
    } else {
      return state.atoms.filter((a) => a.status !== 'archived');
    }
  });

  // Apply FilterBar filters + sorting
  const activeAtoms = filteredAndSortedAtoms(baseAtoms, filters);

  const { itemTabindex, isItemFocused } = useRovingTabindex({
    itemCount: () => activeAtoms().length,
    onSelect: (i) => {
      const atom = activeAtoms()[i];
      if (atom) setSelectedAtomId(atom.id);
    },
  });

  return (
    <div class="section-view">
      {/* Section item filter list */}
      <Show when={props.sectionId}>
        <SectionItemList
          sectionId={props.sectionId!}
          activeSectionItemId={activeSectionItemId()}
          onSelectItem={setActiveSectionItemId}
        />
      </Show>

      {/* Filters */}
      <FilterBar
        filters={filters()}
        onFilterChange={setFilter}
        showSectionFilter={!props.sectionId}
      />

      {/* Atom list */}
      <Show
        when={activeAtoms().length > 0}
        fallback={
          <div class="section-empty">
            <div class="section-empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="var(--text-muted)">
                <path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z" />
              </svg>
            </div>
            <div class="section-empty-text">No items yet. Capture a thought!</div>
          </div>
        }
      >
        <div class="atom-list" role="listbox">
          <For each={activeAtoms()}>
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
