/**
 * MentionAutocomplete: Textarea wrapper with @mention inline linking.
 *
 * Per CONTEXT.md: "@mention syntax in atom content, type @atomName to create a
 * link with autocomplete showing existing atoms".
 *
 * Implementation (v1, per RESEARCH.md Pitfall 7 — simple approach):
 *   - Wraps a <textarea> with @mention detection
 *   - Detects @query after an @ symbol in the current input
 *   - Shows dropdown below textarea (anchored to textarea bottom, not cursor — v1)
 *   - Dropdown: up to 8 matching atoms by title (prefix match, case-insensitive)
 *   - On selection: replaces @query text with @{atom.title} in content
 *   - Calls onLinkCreated(selectedAtom.id) for the parent to add a link
 *   - Keyboard: ArrowDown/Up to navigate, Enter to select, Escape to dismiss
 *
 * Content changes are passed through onValueChange for debounced persistence.
 *
 * CRITICAL: Never destructure props. Access via props.value, props.onValueChange.
 */

import { createMemo, createSignal, For, Show } from 'solid-js';
import { state } from '../signals/store';
import { AtomTypeIcon } from './AtomTypeIcon';
import type { Atom } from '../../types/atoms';

// --- Props ---

interface MentionAutocompleteProps {
  value: string;
  onValueChange: (value: string) => void;
  onLinkCreated: (targetId: string) => void;
}

// --- Helper: extract @mention query from textarea value and cursor position ---

interface MentionState {
  active: boolean;
  query: string;
  mentionStart: number; // index of the @ character
}

function detectMention(value: string, cursorPos: number): MentionState {
  const textBeforeCursor = value.slice(0, cursorPos);
  // Find the last @ before the cursor that is preceded by a space, newline, or start
  const atIndex = textBeforeCursor.lastIndexOf('@');
  if (atIndex === -1) return { active: false, query: '', mentionStart: -1 };

  // Check that the character before @ is a space, newline, or start of text
  const charBeforeAt = atIndex > 0 ? textBeforeCursor[atIndex - 1] : ' ';
  if (charBeforeAt !== ' ' && charBeforeAt !== '\n') {
    return { active: false, query: '', mentionStart: -1 };
  }

  // The query is the text between @ and the cursor
  const query = textBeforeCursor.slice(atIndex + 1);

  // Query should not contain spaces (that would mean it's a completed mention or new word)
  if (query.includes(' ') || query.includes('\n')) {
    return { active: false, query: '', mentionStart: -1 };
  }

  return { active: true, query, mentionStart: atIndex };
}

// --- Component ---

export function MentionAutocomplete(props: MentionAutocompleteProps) {
  const [cursorPos, setCursorPos] = createSignal(0);
  const [showDropdown, setShowDropdown] = createSignal(false);
  const [highlightedIndex, setHighlightedIndex] = createSignal(0);

  let textareaRef: HTMLTextAreaElement | undefined;

  // Detect active @mention in current value + cursor position
  const mentionState = createMemo((): MentionState => {
    if (!showDropdown()) return { active: false, query: '', mentionStart: -1 };
    return detectMention(props.value, cursorPos());
  });

  // Filter atoms matching the mention query
  const suggestions = createMemo((): Atom[] => {
    const ms = mentionState();
    if (!ms.active) return [];
    const q = ms.query.toLowerCase();
    return state.atoms
      .filter((a) => {
        const title = (a.title || a.content.slice(0, 60)).toLowerCase();
        return title.includes(q);
      })
      .slice(0, 8);
  });

  const shouldShowDropdown = createMemo(
    () => showDropdown() && mentionState().active && suggestions().length > 0,
  );

  // --- Select a suggestion ---

  function selectSuggestion(atom: Atom) {
    const ms = mentionState();
    if (!ms.active) return;

    const title = atom.title || atom.content.slice(0, 60);
    // Replace @query with @title in the content
    const before = props.value.slice(0, ms.mentionStart);
    const after = props.value.slice(
      ms.mentionStart + 1 + ms.query.length,
    );
    const newValue = `${before}@${title}${after}`;

    props.onValueChange(newValue);
    props.onLinkCreated(atom.id);

    setShowDropdown(false);
    setHighlightedIndex(0);

    // Restore focus and position cursor after the inserted mention
    if (textareaRef) {
      const newCursorPos = before.length + 1 + title.length;
      textareaRef.focus();
      requestAnimationFrame(() => {
        if (textareaRef) {
          textareaRef.setSelectionRange(newCursorPos, newCursorPos);
        }
      });
    }
  }

  // --- Textarea event handlers ---

  function handleInput(e: InputEvent) {
    const textarea = e.target as HTMLTextAreaElement;
    props.onValueChange(textarea.value);
    setCursorPos(textarea.selectionStart ?? 0);

    // Check if we should show the dropdown
    const ms = detectMention(textarea.value, textarea.selectionStart ?? 0);
    setShowDropdown(ms.active);
    if (ms.active) {
      setHighlightedIndex(0);
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!shouldShowDropdown()) return;

    const sug = suggestions();

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, sug.length - 1));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
      return;
    }

    if (e.key === 'Enter') {
      const selected = sug[highlightedIndex()];
      if (selected) {
        e.preventDefault();
        selectSuggestion(selected);
      }
      return;
    }

    if (e.key === 'Escape') {
      setShowDropdown(false);
      return;
    }
  }

  function handleSelect(e: Event) {
    const textarea = e.target as HTMLTextAreaElement;
    setCursorPos(textarea.selectionStart ?? 0);
    const ms = detectMention(textarea.value, textarea.selectionStart ?? 0);
    setShowDropdown(ms.active);
  }

  function handleBlur() {
    // Delay so suggestion clicks can fire first
    setTimeout(() => setShowDropdown(false), 200);
  }

  return (
    <div class="mention-autocomplete">
      <textarea
        ref={textareaRef}
        class="mention-textarea"
        value={props.value}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onSelect={handleSelect}
        onBlur={handleBlur}
        aria-label="Atom content"
        aria-autocomplete="list"
        rows={6}
      />

      {/* @mention dropdown — anchored below textarea */}
      <Show when={shouldShowDropdown()}>
        <div class="mention-dropdown" role="listbox" aria-label="Atom suggestions">
          <For each={suggestions()}>
            {(atom, idx) => (
              <button
                class={`mention-item${highlightedIndex() === idx() ? ' highlighted' : ''}`}
                role="option"
                aria-selected={highlightedIndex() === idx()}
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevent textarea blur before click fires
                  selectSuggestion(atom);
                }}
              >
                <AtomTypeIcon type={atom.type} size={14} />
                <span class="mention-item-title">
                  {atom.title || atom.content.slice(0, 60)}
                </span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
