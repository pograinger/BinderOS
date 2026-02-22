/**
 * Sidebar: Desktop navigation panel.
 *
 * Shows the four sections (Projects, Areas, Resources, Archive)
 * and section items under the active section.
 * Hidden on mobile via CSS (bottom tab bar replaces it).
 *
 * CRITICAL SolidJS rules:
 * - Never destructure props: use props.isDesktop, not { isDesktop }
 * - Use <For> for lists, not .map()
 * - Use <Show> for conditional rendering
 */

import { For, Show } from 'solid-js';
import { state, setActiveSection, sendCommand } from '../signals/store';
import { SECTION_IDS } from '../../storage/migrations/v1';

interface SidebarProps {
  isDesktop: boolean;
}

const sectionConfig = [
  { id: SECTION_IDS.projects,  label: 'Projects',  icon: '\u{1F4CB}', type: 'projects' },
  { id: SECTION_IDS.areas,     label: 'Areas',     icon: '\u{1F3AF}', type: 'areas' },
  { id: SECTION_IDS.resources, label: 'Resources', icon: '\u{1F4DA}', type: 'resources' },
  { id: SECTION_IDS.archive,   label: 'Archive',   icon: '\u{1F4E6}', type: 'archive' },
] as const;

export function Sidebar(_props: SidebarProps) {
  const handleSectionClick = (sectionId: string) => {
    setActiveSection(sectionId);
  };

  const handleAddItem = (sectionId: string) => {
    const name = prompt('New item name:');
    if (name && name.trim()) {
      sendCommand({
        type: 'CREATE_SECTION_ITEM',
        payload: { sectionId, name: name.trim() },
      });
    }
  };

  const itemsForActiveSection = () => {
    if (!state.activeSection) return [];
    return state.sectionItems.filter(
      (item) => item.sectionId === state.activeSection && !item.archived,
    );
  };

  return (
    <nav class="sidebar">
      <div class="sidebar-header">Sections</div>

      <For each={sectionConfig}>
        {(section) => (
          <div
            class={`sidebar-section${state.activeSection === section.id ? ' active' : ''}`}
            onClick={() => handleSectionClick(section.id)}
          >
            <span class="sidebar-section-icon">{section.icon}</span>
            <span>{section.label}</span>
          </div>
        )}
      </For>

      <Show when={state.activeSection}>
        <div class="sidebar-items">
          <For each={itemsForActiveSection()}>
            {(item) => (
              <div class="sidebar-item">{item.name}</div>
            )}
          </For>
          <button
            class="sidebar-add-btn"
            onClick={() => handleAddItem(state.activeSection!)}
          >
            + Add item
          </button>
        </div>
      </Show>
    </nav>
  );
}
