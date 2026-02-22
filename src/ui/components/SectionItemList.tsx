/**
 * SectionItemList: List of section items with CRUD actions.
 *
 * Shows section items (e.g., "Project: Kitchen Reno", "Area: Health").
 * Each item is clickable to filter atoms by sectionItemId.
 * Add button creates a new item. Double-click to rename. Archive action.
 *
 * CRITICAL: Never destructure props. Use <For> for lists.
 */

import { createSignal, For, Show } from 'solid-js';
import { state, sendCommand } from '../signals/store';
import type { SectionItem } from '../../types/sections';

interface SectionItemListProps {
  sectionId: string;
  activeSectionItemId: string | null;
  onSelectItem: (id: string | null) => void;
}

export function SectionItemList(props: SectionItemListProps) {
  const [editingId, setEditingId] = createSignal<string | null>(null);
  const [editName, setEditName] = createSignal('');

  const items = (): SectionItem[] => {
    return state.sectionItems.filter(
      (item) => item.sectionId === props.sectionId && !item.archived,
    );
  };

  const handleAdd = () => {
    const name = prompt('New item name:');
    if (name && name.trim()) {
      sendCommand({
        type: 'CREATE_SECTION_ITEM',
        payload: { sectionId: props.sectionId, name: name.trim() },
      });
    }
  };

  const handleDoubleClick = (item: SectionItem) => {
    setEditingId(item.id);
    setEditName(item.name);
  };

  const handleRename = (id: string) => {
    const newName = editName().trim();
    if (newName && newName !== '') {
      sendCommand({
        type: 'RENAME_SECTION_ITEM',
        payload: { id, name: newName },
      });
    }
    setEditingId(null);
  };

  const handleArchive = (e: MouseEvent, id: string) => {
    e.stopPropagation();
    sendCommand({
      type: 'ARCHIVE_SECTION_ITEM',
      payload: { id },
    });
  };

  const handleKeyDown = (e: KeyboardEvent, id: string) => {
    if (e.key === 'Enter') {
      handleRename(id);
    } else if (e.key === 'Escape') {
      setEditingId(null);
    }
  };

  return (
    <div class="section-item-list">
      <For each={items()}>
        {(item) => (
          <div
            class={`section-item-row${props.activeSectionItemId === item.id ? ' active' : ''}`}
            onClick={() => props.onSelectItem(
              props.activeSectionItemId === item.id ? null : item.id,
            )}
            onDblClick={() => handleDoubleClick(item)}
          >
            <Show
              when={editingId() !== item.id}
              fallback={
                <input
                  class="section-item-edit"
                  value={editName()}
                  onInput={(e) => setEditName(e.currentTarget.value)}
                  onBlur={() => handleRename(item.id)}
                  onKeyDown={(e) => handleKeyDown(e, item.id)}
                  autofocus
                />
              }
            >
              <span class="section-item-name">{item.name}</span>
              <button
                class="section-item-archive-btn"
                onClick={(e) => handleArchive(e, item.id)}
                title="Archive"
              >
                x
              </button>
            </Show>
          </div>
        )}
      </For>
      <button class="section-item-add-btn" onClick={handleAdd}>
        + Add item
      </button>
    </div>
  );
}
