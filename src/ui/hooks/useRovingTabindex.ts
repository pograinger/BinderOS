/**
 * useRovingTabindex — shared roving tabindex hook for arrow key navigation.
 *
 * Implements ARIA roving tabindex pattern (RESEARCH.md Pattern 5) for any
 * list of items. Used in:
 * - SearchOverlay result list
 * - CommandPalette command list
 * - Page components (TodayPage, ThisWeekPage, ActiveProjectsPage, WaitingPage, InsightsPage)
 *
 * Usage:
 * ```tsx
 * const { onKeyDown, itemTabindex, isItemFocused } = useRovingTabindex({
 *   itemCount: () => atoms().length,
 *   onSelect: (i) => setSelectedAtomId(atoms()[i].id),
 *   enabled: () => overlay() === 'none',
 * });
 *
 * return (
 *   <div role="listbox" tabindex={0} onKeyDown={onKeyDown} class="atom-list">
 *     <For each={atoms()}>
 *       {(atom, i) => (
 *         <AtomCard
 *           atom={atom}
 *           tabindex={itemTabindex(i())}
 *           focused={isItemFocused(i())}
 *         />
 *       )}
 *     </For>
 *   </div>
 * );
 * ```
 *
 * CRITICAL: Never destructure the returned object in a SolidJS reactive context.
 * Always call itemTabindex() and isItemFocused() as functions.
 *
 * Note: containerProps.role is typed 'listbox' for ARIA compliance. Each consumer
 * can override role in their JSX as needed.
 */

import { createSignal, createEffect } from 'solid-js';

// --- Types ---

export interface UseRovingTabindexOptions {
  /** Total number of items in the list */
  itemCount: () => number;
  /** Called when Enter is pressed on the focused item */
  onSelect: (index: number) => void;
  /** Called when Escape is pressed (optional) */
  onEscape?: () => void;
  /** Whether the hook is active. Set false when an overlay is open. Default: true */
  enabled?: () => boolean;
}

export interface UseRovingTabindexReturn {
  /** Currently focused index (-1 = none focused) */
  focusedIndex: () => number;
  /** Set focused index programmatically */
  setFocusedIndex: (index: number) => void;
  /** KeyDown event handler to attach to the list container */
  onKeyDown: (e: KeyboardEvent) => void;
  /** Returns tabindex value for a given item index: 0 if focused, -1 otherwise */
  itemTabindex: (index: number) => 0 | -1;
  /** Returns true if the given index is currently focused */
  isItemFocused: (index: number) => boolean;
}

// --- Hook ---

export function useRovingTabindex(
  options: UseRovingTabindexOptions,
): UseRovingTabindexReturn {
  const [focusedIndex, setFocusedIndex] = createSignal<number>(-1);

  // Reset focused index when list content changes
  createEffect(() => {
    options.itemCount(); // track for reactivity
    setFocusedIndex(-1);
  });

  const handleKeyDown = (e: KeyboardEvent) => {
    // Respect enabled() guard
    if (options.enabled && !options.enabled()) return;

    const count = options.itemCount();
    if (count === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex((prev) => {
          if (prev < 0) return 0;
          return (prev + 1) % count;
        });
        break;

      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex((prev) => {
          if (prev < 0) return count - 1;
          return (prev - 1 + count) % count;
        });
        break;

      case 'Home':
        e.preventDefault();
        setFocusedIndex(0);
        break;

      case 'End':
        e.preventDefault();
        setFocusedIndex(count - 1);
        break;

      case 'Enter': {
        const idx = focusedIndex();
        if (idx >= 0 && idx < count) {
          e.preventDefault();
          options.onSelect(idx);
        }
        break;
      }

      case 'Escape':
        options.onEscape?.();
        break;
    }
  };

  return {
    focusedIndex,
    setFocusedIndex,
    onKeyDown: handleKeyDown,
    itemTabindex: (index: number): 0 | -1 => (focusedIndex() === index ? 0 : -1),
    isItemFocused: (index: number): boolean => focusedIndex() === index,
  };
}
