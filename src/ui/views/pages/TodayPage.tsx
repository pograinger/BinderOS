/**
 * TodayPage: Focus list for the current day.
 *
 * Shows: tasks due today or overdue, events today, Critical-tier tasks,
 * and atoms approaching critical staleness.
 *
 * Empty state is compute-engine-driven — reads state.entropyScore,
 * state.compressionCandidates, and state.scores to generate contextual prompts.
 *
 * CRITICAL: Never destructure props or store. Use <For>/<Show>, not map/ternary.
 */

import { For, Show } from 'solid-js';
import { todayAtoms, filteredAndSortedAtoms, createFilterState } from '../../signals/queries';
import { FilterBar } from '../../components/FilterBar';
import { AtomCard } from '../../components/AtomCard';
import { state, setSelectedAtomId, setActivePage } from '../../signals/store';
import { useRovingTabindex } from '../../hooks/useRovingTabindex';

/** Count atoms approaching critical staleness for empty state context. */
function staleCount(): number {
  return state.atoms.filter(
    (a) =>
      a.status !== 'done' &&
      a.status !== 'cancelled' &&
      a.status !== 'archived' &&
      (state.scores[a.id]?.staleness ?? 0) > 0.6,
  ).length;
}

/** Check if any active projects lack a next action (no open/in-progress tasks). */
function projectsWithNoNextAction(): boolean {
  const projectsSection = state.sections.find((s) => s.type === 'projects');
  if (!projectsSection) return false;

  const projectAtoms = state.atoms.filter(
    (a) =>
      a.sectionId === projectsSection.id &&
      a.sectionItemId !== undefined &&
      (a.status === 'open' || a.status === 'in-progress'),
  );

  // Get all project sectionItemIds that have any atom
  const allProjectItemIds = new Set(
    state.atoms
      .filter((a) => a.sectionId === projectsSection.id && a.sectionItemId !== undefined)
      .map((a) => a.sectionItemId!),
  );

  // Ids that have active tasks
  const activeIds = new Set(
    projectAtoms.map((a) => a.sectionItemId!),
  );

  // If any project has no active tasks
  for (const id of allProjectItemIds) {
    if (!activeIds.has(id)) return true;
  }
  return false;
}

export function TodayPage() {
  const { filters, setFilter } = createFilterState();
  const filteredAtoms = filteredAndSortedAtoms(todayAtoms, filters);

  const { itemTabindex, isItemFocused, onKeyDown } = useRovingTabindex({
    itemCount: () => filteredAtoms().length,
    onSelect: (i) => {
      const atom = filteredAtoms()[i];
      if (atom) setSelectedAtomId(atom.id);
    },
  });

  const now = Date.now();

  return (
    <div class="page-view">
      <div class="page-header">
        <h2 class="page-title">Today</h2>
        <Show when={filteredAtoms().length > 0}>
          <span class="page-count-badge">{filteredAtoms().length}</span>
        </Show>
      </div>

      <FilterBar
        filters={filters()}
        onFilterChange={setFilter}
        showTypeFilter={false}
        showSectionFilter={false}
      />

      {/* Empty state — compute-engine-driven */}
      <Show when={filteredAtoms().length === 0}>
        <div class="page-empty-state">
          <Show when={state.entropyScore?.level === 'green'}>
            <div class="page-empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="var(--status-success)">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
              </svg>
            </div>
            <p class="page-empty-title">All clear. Your system is healthy.</p>
            <p class="page-empty-subtitle">No tasks or events due today. Everything is under control.</p>
          </Show>

          <Show when={state.entropyScore?.level !== 'green' && staleCount() > 0}>
            <div class="page-empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="var(--status-warning)">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
              </svg>
            </div>
            <p class="page-empty-title">Nothing due today.</p>
            <p class="page-empty-subtitle">
              You have {staleCount()} item{staleCount() !== 1 ? 's' : ''} approaching staleness.
            </p>
            <button
              class="page-empty-action"
              onClick={() => setActivePage('review')}
            >
              Review them
            </button>
          </Show>

          <Show when={state.entropyScore?.level !== 'green' && staleCount() === 0 && projectsWithNoNextAction()}>
            <div class="page-empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="var(--text-muted)">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z" />
              </svg>
            </div>
            <p class="page-empty-title">Nothing due today.</p>
            <p class="page-empty-subtitle">Some projects have no next action defined.</p>
            <button
              class="page-empty-action"
              onClick={() => setActivePage('active-projects')}
            >
              Check Active Projects
            </button>
          </Show>

          <Show
            when={
              (state.entropyScore === null || state.entropyScore?.level !== 'green') &&
              staleCount() === 0 &&
              !projectsWithNoNextAction()
            }
          >
            <div class="page-empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="var(--text-muted)">
                <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11zM7 11h5v5H7z" />
              </svg>
            </div>
            <p class="page-empty-title">Nothing due today.</p>
            <p class="page-empty-subtitle">
              Capture something new or review your week.
            </p>
          </Show>
        </div>
      </Show>

      {/* Atom list */}
      <Show when={filteredAtoms().length > 0}>
        <div class="atom-list" role="listbox" tabindex={0} onKeyDown={onKeyDown}>
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

      {/* Render overdue count hint below list */}
      <Show when={filteredAtoms().length > 0}>
        {(() => {
          const overdue = filteredAtoms().filter(
            (a) => a.type === 'task' && 'dueDate' in a && a.dueDate !== undefined && a.dueDate < now,
          );
          return (
            <Show when={overdue.length > 0}>
              <p class="page-overdue-hint">
                {overdue.length} overdue task{overdue.length !== 1 ? 's' : ''} — address these first.
              </p>
            </Show>
          );
        })()}
      </Show>
    </div>
  );
}
