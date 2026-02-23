/**
 * ActiveProjectsPage: Tasks grouped by project (section item), sorted by priority.
 *
 * The first atom in each group is the "Next Action" for that project.
 * Groups sorted by highest priorityScore (most urgent project first).
 *
 * Empty state is compute-engine-driven.
 *
 * CRITICAL: Never destructure props or store. Use <For>/<Show>, not map/ternary.
 */

import { createSignal, For, Show } from 'solid-js';
import { activeProjectAtoms, createFilterState } from '../../signals/queries';
import { FilterBar } from '../../components/FilterBar';
import { AtomCard } from '../../components/AtomCard';
import { state, setSelectedAtomId, sendCommand } from '../../signals/store';
import { SECTION_IDS } from '../../../storage/migrations/v1';
import { useRovingTabindex } from '../../hooks/useRovingTabindex';

/** Flatten grouped atoms for roving tabindex item count. */
function allGroupedAtoms(): ReturnType<typeof activeProjectAtoms>[0]['atoms'][0][] {
  return activeProjectAtoms().flatMap((g) => g.atoms);
}

export function ActiveProjectsPage() {
  const { filters, setFilter } = createFilterState();

  // For roving tabindex, flatten all atoms across all groups
  const flatAtoms = () => allGroupedAtoms();

  const { itemTabindex, isItemFocused } = useRovingTabindex({
    itemCount: () => flatAtoms().length,
    onSelect: (i) => {
      const atom = flatAtoms()[i];
      if (atom) setSelectedAtomId(atom.id);
    },
  });

  const totalAtomCount = () => activeProjectAtoms().reduce((sum, g) => sum + g.atoms.length, 0);

  const handleCreateProject = () => {
    const name = prompt('New project name:');
    if (name && name.trim()) {
      sendCommand({
        type: 'CREATE_SECTION_ITEM',
        payload: { sectionId: SECTION_IDS.projects, name: name.trim() },
      });
    }
  };

  const projectItems = () =>
    state.sectionItems.filter(
      (item) => item.sectionId === SECTION_IDS.projects && !item.archived,
    );

  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [editName, setEditName] = createSignal('');

  const handleRename = (id: string) => {
    const newName = editName().trim();
    if (newName) {
      sendCommand({
        type: 'RENAME_SECTION_ITEM',
        payload: { id, name: newName },
      });
    }
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    sendCommand({
      type: 'ARCHIVE_SECTION_ITEM',
      payload: { id },
    });
  };

  /** Count of assigned atoms for a given project */
  const atomCountForProject = (projectId: string) =>
    state.atoms.filter(
      (a) => a.sectionItemId === projectId && (a.status === 'open' || a.status === 'in-progress'),
    ).length;

  // Running index across groups for roving tabindex
  let runningIndex = 0;

  return (
    <div class="page-view">
      <div class="page-header">
        <h2 class="page-title">Active Projects</h2>
        <Show when={activeProjectAtoms().length > 0}>
          <span class="page-count-badge">{activeProjectAtoms().length} projects</span>
        </Show>
        <button
          class="page-header-action"
          onClick={handleCreateProject}
          title="Create new project"
        >
          + New Project
        </button>
      </div>

      {/* Project list — always visible when projects exist */}
      <Show when={projectItems().length > 0}>
        <div class="project-list-panel">
          <For each={projectItems()}>
            {(item) => (
              <div class="project-list-row">
                <Show
                  when={editingId() !== item.id}
                  fallback={
                    <input
                      class="project-list-edit"
                      value={editName()}
                      onInput={(e) => setEditName(e.currentTarget.value)}
                      onBlur={() => handleRename(item.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRename(item.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      autofocus
                    />
                  }
                >
                  <span
                    class="project-list-name"
                    onDblClick={() => {
                      setEditingId(item.id);
                      setEditName(item.name);
                    }}
                    title="Double-click to rename"
                  >
                    {item.name}
                  </span>
                  <span class="project-list-count">
                    {atomCountForProject(item.id)} task{atomCountForProject(item.id) !== 1 ? 's' : ''}
                  </span>
                  <button
                    class="project-list-delete"
                    onClick={() => handleDelete(item.id)}
                    title="Delete project"
                    aria-label={`Delete project ${item.name}`}
                  >
                    &times;
                  </button>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>

      {/* Empty state — no projects at all */}
      <Show when={projectItems().length === 0}>
        <div class="page-empty-state">
          <div class="page-empty-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="var(--text-muted)">
              <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
            </svg>
          </div>
          <p class="page-empty-title">No projects yet.</p>
          <p class="page-empty-subtitle">
            Create a project, then assign tasks to it from the detail panel.
          </p>
          <button class="page-empty-action" onClick={handleCreateProject}>
            Create First Project
          </button>
        </div>
      </Show>

      <FilterBar
        filters={filters()}
        onFilterChange={setFilter}
        showTypeFilter={false}
        showSectionFilter={false}
      />

      {/* Project groups — atoms grouped by project */}
      <Show when={activeProjectAtoms().length > 0}>
        <div role="listbox">
          <For each={activeProjectAtoms()}>
            {(group) => {
              return (
                <div class="project-group">
                  <div class="project-group-header">
                    <span class="project-group-name">{group.sectionItemName}</span>
                    <span class="project-group-count">{group.atoms.length} task{group.atoms.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div class="atom-list">
                    <For each={group.atoms}>
                      {(atom, atomIndex) => {
                        const idx = runningIndex;
                        runningIndex++;
                        return (
                          <div class={`project-atom-row${atomIndex() === 0 ? ' next-action' : ''}`}>
                            <Show when={atomIndex() === 0}>
                              <span class="next-action-badge">Next Action</span>
                            </Show>
                            <AtomCard
                              atom={atom}
                              tabindex={itemTabindex(idx)}
                              focused={isItemFocused(idx)}
                              onClick={() => setSelectedAtomId(atom.id)}
                            />
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </div>
              );
            }}
          </For>
        </div>

        <p class="page-total-hint">
          {totalAtomCount()} task{totalAtomCount() !== 1 ? 's' : ''} across {activeProjectAtoms().length} project{activeProjectAtoms().length !== 1 ? 's' : ''}
        </p>
      </Show>
    </div>
  );
}
