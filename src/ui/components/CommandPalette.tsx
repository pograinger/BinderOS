/**
 * CommandPalette — Action-oriented command palette (Ctrl+P).
 *
 * SEPARATE from search (Ctrl+K per CONTEXT.md decisions):
 * - Search = find atoms by content
 * - Command palette = execute actions and navigate pages
 *
 * Commands include:
 * - Navigation: Go to page (today, this week, active projects, waiting, insights, inbox, all, review)
 * - Actions: New capture, undo, export data, open search
 * - Recent: Last 5 atoms sorted by updated_at
 *
 * Fuzzy filtering: simple substring matching across words in command labels.
 * Arrow key navigation via useRovingTabindex hook.
 *
 * CRITICAL: Never destructure props or state — breaks SolidJS reactivity.
 */

import { createSignal, createMemo, For, Show, createEffect } from 'solid-js';
import { state, sendCommand, setActivePage, setSelectedAtomId } from '../signals/store';
import { useRovingTabindex } from '../hooks/useRovingTabindex';

// --- Types ---

interface PaletteCommand {
  id: string;
  label: string;
  shortcut?: string;
  category: 'navigation' | 'action' | 'recent';
  action: () => void;
}

interface CommandPaletteProps {
  onClose: () => void;
  onOpenSearch: () => void;
}

// --- Fuzzy filter ---

/**
 * Simple fuzzy filter: splits query into words, checks each word
 * appears as a substring in the label (case-insensitive).
 */
function fuzzyMatch(label: string, query: string): boolean {
  if (!query.trim()) return true;
  const lowerLabel = label.toLowerCase();
  const words = query.toLowerCase().trim().split(/\s+/);
  return words.every((word) => lowerLabel.includes(word));
}

// --- Component ---

export function CommandPalette(props: CommandPaletteProps) {
  const [query, setQuery] = createSignal('');

  let inputRef: HTMLInputElement | undefined;

  // Focus input on open
  createEffect(() => {
    if (inputRef) {
      setTimeout(() => inputRef!.focus(), 10);
    }
  });

  // Build command list (static commands + dynamic recent atoms)
  const staticCommands = (): PaletteCommand[] => [
    // Navigation
    {
      id: 'nav-today',
      label: 'Go to Today',
      shortcut: '1',
      category: 'navigation',
      action: () => { setActivePage('today'); props.onClose(); },
    },
    {
      id: 'nav-this-week',
      label: 'Go to This Week',
      shortcut: '2',
      category: 'navigation',
      action: () => { setActivePage('this-week'); props.onClose(); },
    },
    {
      id: 'nav-active-projects',
      label: 'Go to Active Projects',
      shortcut: '3',
      category: 'navigation',
      action: () => { setActivePage('active-projects'); props.onClose(); },
    },
    {
      id: 'nav-waiting',
      label: 'Go to Waiting',
      shortcut: '4',
      category: 'navigation',
      action: () => { setActivePage('waiting'); props.onClose(); },
    },
    {
      id: 'nav-insights',
      label: 'Go to Insights',
      shortcut: '5',
      category: 'navigation',
      action: () => { setActivePage('insights'); props.onClose(); },
    },
    {
      id: 'nav-inbox',
      label: 'Go to Inbox',
      category: 'navigation',
      action: () => { setActivePage('inbox'); props.onClose(); },
    },
    {
      id: 'nav-all',
      label: 'Go to All Items',
      category: 'navigation',
      action: () => { setActivePage('all'); props.onClose(); },
    },
    {
      id: 'nav-review',
      label: 'Go to Review',
      category: 'navigation',
      action: () => { setActivePage('review'); props.onClose(); },
    },
    // Actions
    {
      id: 'action-search',
      label: 'Search',
      shortcut: 'Ctrl+K',
      category: 'action',
      action: () => { props.onClose(); props.onOpenSearch(); },
    },
    {
      id: 'action-undo',
      label: 'Undo',
      shortcut: 'Ctrl+Z',
      category: 'action',
      action: () => { sendCommand({ type: 'UNDO' }); props.onClose(); },
    },
    {
      id: 'action-export',
      label: 'Export Data',
      category: 'action',
      action: () => { sendCommand({ type: 'EXPORT_DATA' }); props.onClose(); },
    },
    {
      id: 'action-persistence',
      label: 'Request Storage Persistence',
      category: 'action',
      action: () => { sendCommand({ type: 'REQUEST_PERSISTENCE' }); props.onClose(); },
    },
  ];

  // Recent atoms (last 5 by updated_at)
  const recentCommands = createMemo((): PaletteCommand[] => {
    const sorted = [...state.atoms]
      .sort((a, b) => b.updated_at - a.updated_at)
      .slice(0, 5);

    return sorted.map((atom) => ({
      id: `recent-${atom.id}`,
      label: atom.title || atom.content.slice(0, 50),
      category: 'recent' as const,
      action: () => {
        setSelectedAtomId(atom.id);
        props.onClose();
      },
    }));
  });

  // All commands combined
  const allCommands = createMemo((): PaletteCommand[] => [
    ...staticCommands(),
    ...recentCommands(),
  ]);

  // Filtered commands based on query
  const filteredCommands = createMemo((): PaletteCommand[] => {
    const q = query();
    return allCommands().filter((cmd) => fuzzyMatch(cmd.label, q));
  });

  // Roving tabindex
  const { onKeyDown, itemTabindex, isItemFocused, setFocusedIndex } = useRovingTabindex({
    itemCount: () => filteredCommands().length,
    onSelect: (i) => {
      const cmd = filteredCommands()[i];
      if (cmd) cmd.action();
    },
    onEscape: props.onClose,
  });

  const handleInputKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      props.onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex(0);
    }
  };

  const categoryLabel = (category: string): string => {
    switch (category) {
      case 'navigation': return 'Navigation';
      case 'action': return 'Actions';
      case 'recent': return 'Recent';
      default: return category;
    }
  };

  // Group by category for display
  const groupedCommands = createMemo(() => {
    const groups = new Map<string, PaletteCommand[]>();
    for (const cmd of filteredCommands()) {
      const group = groups.get(cmd.category) ?? [];
      group.push(cmd);
      groups.set(cmd.category, group);
    }
    return groups;
  });

  // Flat index mapping for roving tabindex (since we render grouped)
  const flatIndex = (cmd: PaletteCommand): number => {
    return filteredCommands().indexOf(cmd);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        class="command-palette-backdrop"
        onClick={props.onClose}
        aria-hidden="true"
      />

      {/* Palette container */}
      <div
        class="command-palette-container"
        role="dialog"
        aria-label="Command palette"
        aria-modal="true"
      >
        {/* Input */}
        <input
          ref={inputRef}
          class="command-palette-input"
          type="text"
          placeholder="Type a command..."
          value={query()}
          onInput={(e) => {
            setQuery((e.target as HTMLInputElement).value);
            setFocusedIndex(-1);
          }}
          onKeyDown={handleInputKeyDown}
          aria-label="Command search"
          autocomplete="off"
          autocorrect="off"
          spellcheck={false}
        />

        {/* Command list */}
        <div
          role="listbox"
          tabindex={0}
          onKeyDown={onKeyDown}
          class="command-list"
          aria-label="Commands"
        >
          <Show
            when={filteredCommands().length > 0}
            fallback={
              <div class="command-empty">No commands match "{query()}"</div>
            }
          >
            {/* Navigation group */}
            <Show when={(groupedCommands().get('navigation') ?? []).length > 0}>
              <div class="command-group">
                <div class="command-group-label">
                  {categoryLabel('navigation')}
                </div>
                <For each={groupedCommands().get('navigation') ?? []}>
                  {(cmd) => (
                    <button
                      class={`command-item${isItemFocused(flatIndex(cmd)) ? ' focused' : ''}`}
                      tabindex={itemTabindex(flatIndex(cmd))}
                      onClick={cmd.action}
                      onMouseEnter={() => setFocusedIndex(flatIndex(cmd))}
                    >
                      <span class="command-item-label">{cmd.label}</span>
                      <Show when={cmd.shortcut}>
                        <kbd class="command-item-shortcut">{cmd.shortcut}</kbd>
                      </Show>
                    </button>
                  )}
                </For>
              </div>
            </Show>

            {/* Actions group */}
            <Show when={(groupedCommands().get('action') ?? []).length > 0}>
              <div class="command-group">
                <div class="command-group-label">
                  {categoryLabel('action')}
                </div>
                <For each={groupedCommands().get('action') ?? []}>
                  {(cmd) => (
                    <button
                      class={`command-item${isItemFocused(flatIndex(cmd)) ? ' focused' : ''}`}
                      tabindex={itemTabindex(flatIndex(cmd))}
                      onClick={cmd.action}
                      onMouseEnter={() => setFocusedIndex(flatIndex(cmd))}
                    >
                      <span class="command-item-label">{cmd.label}</span>
                      <Show when={cmd.shortcut}>
                        <kbd class="command-item-shortcut">{cmd.shortcut}</kbd>
                      </Show>
                    </button>
                  )}
                </For>
              </div>
            </Show>

            {/* Recent atoms group */}
            <Show when={(groupedCommands().get('recent') ?? []).length > 0}>
              <div class="command-group">
                <div class="command-group-label">
                  {categoryLabel('recent')}
                </div>
                <For each={groupedCommands().get('recent') ?? []}>
                  {(cmd) => (
                    <button
                      class={`command-item${isItemFocused(flatIndex(cmd)) ? ' focused' : ''}`}
                      tabindex={itemTabindex(flatIndex(cmd))}
                      onClick={cmd.action}
                      onMouseEnter={() => setFocusedIndex(flatIndex(cmd))}
                    >
                      <span class="command-item-label">{cmd.label}</span>
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </div>

        {/* Keyboard hints */}
        <div class="command-hints">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> execute</span>
          <span><kbd>Esc</kbd> close</span>
        </div>
      </div>
    </>
  );
}
