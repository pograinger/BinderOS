/**
 * useRovingTabindex — arrow key navigation for atom lists.
 *
 * Two modes:
 * - global (default): Listens at the document level. Arrow keys work without
 *   clicking a container first. Skips when an input/textarea/select is focused
 *   or when an overlay (search, command palette, etc.) is open.
 * - container: Only fires when the container has focus. Used by overlays
 *   (SearchOverlay, CommandPalette) to avoid conflicts with page-level hooks.
 *
 * Up/Down: navigate items. Enter: select. Home/End: jump to edges.
 * Left/Right: optional callbacks for page-specific actions (e.g., week tabs).
 *
 * CRITICAL: Never destructure the returned object in a SolidJS reactive context.
 * Always call itemTabindex() and isItemFocused() as functions.
 */

import { createSignal, createEffect, onMount, onCleanup } from 'solid-js';

// --- Types ---

export interface UseRovingTabindexOptions {
  /** Total number of items in the list */
  itemCount: () => number;
  /** Called when Enter is pressed on the focused item */
  onSelect: (index: number) => void;
  /** Called when Escape is pressed (optional) */
  onEscape?: () => void;
  /** Called when ArrowLeft is pressed (optional, e.g., previous week tab) */
  onLeft?: () => void;
  /** Called when ArrowRight is pressed (optional, e.g., next week tab) */
  onRight?: () => void;
  /** Whether the hook is active. Set false when an overlay is open. Default: true */
  enabled?: () => boolean;
  /**
   * Listening mode. Default: 'global'.
   * - 'global': registers on document, works without focusing a container.
   *   Automatically skips when inputs are focused or overlays are open.
   * - 'container': returns onKeyDown for manual attachment to a container element.
   */
  mode?: 'global' | 'container';
}

export interface UseRovingTabindexReturn {
  /** Currently focused index (-1 = none focused) */
  focusedIndex: () => number;
  /** Set focused index programmatically */
  setFocusedIndex: (index: number) => void;
  /** KeyDown event handler for container mode */
  onKeyDown: (e: KeyboardEvent) => void;
  /** Returns tabindex value for a given item index: 0 if focused, -1 otherwise */
  itemTabindex: (index: number) => 0 | -1;
  /** Returns true if the given index is currently focused */
  isItemFocused: (index: number) => boolean;
}

/** Overlay selectors that suppress global arrow key handling */
const OVERLAY_SELECTORS = [
  '.search-overlay-backdrop',
  '.command-palette-backdrop',
  '.capture-overlay',
  '.shortcut-reference-backdrop',
].join(',');

function isInputFocused(): boolean {
  const tag = document.activeElement?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function isOverlayOpen(): boolean {
  return document.querySelector(OVERLAY_SELECTORS) !== null;
}

// --- Hook ---

export function useRovingTabindex(
  options: UseRovingTabindexOptions,
): UseRovingTabindexReturn {
  const [focusedIndex, setFocusedIndex] = createSignal<number>(-1);
  const isGlobal = (options.mode ?? 'global') === 'global';

  // Reset focused index when list content changes
  createEffect(() => {
    options.itemCount(); // track for reactivity
    setFocusedIndex(-1);
  });

  const handleKeyDown = (e: KeyboardEvent) => {
    // Global mode: skip when input focused or overlay open
    if (isGlobal) {
      if (isInputFocused()) return;
      if (isOverlayOpen()) return;
    }
    if (options.enabled && !options.enabled()) return;

    const count = options.itemCount();

    switch (e.key) {
      case 'ArrowDown':
        if (count === 0) return;
        e.preventDefault();
        setFocusedIndex((prev) => {
          if (prev < 0) return 0;
          return (prev + 1) % count;
        });
        break;

      case 'ArrowUp':
        if (count === 0) return;
        e.preventDefault();
        setFocusedIndex((prev) => {
          if (prev < 0) return count - 1;
          return (prev - 1 + count) % count;
        });
        break;

      case 'ArrowLeft':
        if (options.onLeft) {
          e.preventDefault();
          options.onLeft();
        }
        break;

      case 'ArrowRight':
        if (options.onRight) {
          e.preventDefault();
          options.onRight();
        }
        break;

      case 'Home':
        if (count === 0) return;
        e.preventDefault();
        setFocusedIndex(0);
        break;

      case 'End':
        if (count === 0) return;
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

  // Global mode: listen at document level
  if (isGlobal) {
    onMount(() => {
      document.addEventListener('keydown', handleKeyDown);
    });

    onCleanup(() => {
      document.removeEventListener('keydown', handleKeyDown);
    });
  }

  return {
    focusedIndex,
    setFocusedIndex,
    onKeyDown: handleKeyDown,
    itemTabindex: (index: number): 0 | -1 => (focusedIndex() === index ? 0 : -1),
    isItemFocused: (index: number): boolean => focusedIndex() === index,
  };
}
