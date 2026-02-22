/**
 * TagInput: Freeform tag management and GTD context selector for atoms.
 *
 * Features:
 *   - Tag chips with × remove button
 *   - Text input for new tags: Enter or comma adds tag (trimmed, lowercase, no duplicates)
 *   - Autocomplete dropdown from all unique tags across state.atoms (prefix match)
 *   - Keyboard navigation: ArrowDown/Up in suggestions, Enter to select, Escape to close
 *   - GTD context dropdown with predefined options + custom entry
 *   - On tag add/remove: sends UPDATE_ATOM with updated tags array
 *   - On context change: sends UPDATE_ATOM with updated context
 *
 * CRITICAL: Never destructure props. Access via props.atomId, props.tags, props.context.
 * CRITICAL: Use props.atomId (not a local variable) inside createMemo for reactivity.
 */

import { For, Show, createMemo, createSignal } from 'solid-js';
import { state, sendCommand } from '../signals/store';

// --- Props ---

interface TagInputProps {
  atomId: string;
  tags: string[];
  context: string | null | undefined;
}

// --- GTD context options ---

const GTD_CONTEXTS = [
  '@home',
  '@office',
  '@errands',
  '@calls',
  '@computer',
  '@agenda',
  '@anywhere',
] as const;

// --- Component ---

export function TagInput(props: TagInputProps) {
  const [inputValue, setInputValue] = createSignal('');
  const [focused, setFocused] = createSignal(false);
  const [highlightedIndex, setHighlightedIndex] = createSignal(-1);
  const [showCustomContext, setShowCustomContext] = createSignal(false);
  const [customContextDraft, setCustomContextDraft] = createSignal('');

  // All unique tags across all atoms — used for autocomplete
  const allTags = createMemo((): string[] => {
    return [...new Set(state.atoms.flatMap((a) => a.tags ?? []))];
  });

  // Filtered suggestions: match input prefix, exclude already-added tags
  const suggestions = createMemo((): string[] => {
    const input = inputValue().trim().toLowerCase();
    if (!input) return [];
    return allTags()
      .filter((tag) => tag.startsWith(input) && !props.tags.includes(tag))
      .slice(0, 5);
  });

  // Show dropdown when focused and there are suggestions
  const showDropdown = createMemo(() => focused() && suggestions().length > 0);

  // --- Tag management ---

  function addTag(raw: string) {
    const tag = raw.trim().toLowerCase().replace(/,/g, '');
    if (!tag) return;
    if (props.tags.includes(tag)) {
      setInputValue('');
      return;
    }
    const newTags = [...props.tags, tag];
    sendCommand({
      type: 'UPDATE_ATOM',
      payload: { id: props.atomId, changes: { tags: newTags } },
    });
    setInputValue('');
    setHighlightedIndex(-1);
  }

  function removeTag(tag: string) {
    const newTags = props.tags.filter((t) => t !== tag);
    sendCommand({
      type: 'UPDATE_ATOM',
      payload: { id: props.atomId, changes: { tags: newTags } },
    });
  }

  // --- Input event handlers ---

  function handleInput(e: InputEvent) {
    const value = (e.target as HTMLInputElement).value;
    // Auto-add on comma
    if (value.endsWith(',')) {
      addTag(value.slice(0, -1));
    } else {
      setInputValue(value);
      setHighlightedIndex(-1);
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    const sug = suggestions();

    if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightedIndex() >= 0 && highlightedIndex() < sug.length) {
        addTag(sug[highlightedIndex()]!);
      } else {
        addTag(inputValue());
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, sug.length - 1));
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, -1));
      return;
    }

    if (e.key === 'Escape') {
      setHighlightedIndex(-1);
      setFocused(false);
      return;
    }

    if (e.key === 'Backspace' && inputValue() === '' && props.tags.length > 0) {
      // Remove last tag on backspace with empty input
      removeTag(props.tags[props.tags.length - 1]!);
    }
  }

  // --- Context management ---

  function handleContextSelect(e: Event) {
    const select = e.target as HTMLSelectElement;
    const value = select.value;
    if (value === '__custom__') {
      setShowCustomContext(true);
      setCustomContextDraft('');
      return;
    }
    const newContext = value === '' ? null : value;
    sendCommand({
      type: 'UPDATE_ATOM',
      payload: { id: props.atomId, changes: { context: newContext } },
    });
    setShowCustomContext(false);
  }

  function commitCustomContext() {
    const ctx = customContextDraft().trim();
    if (ctx) {
      // Prefix with @ if not already present
      const normalized = ctx.startsWith('@') ? ctx : `@${ctx}`;
      sendCommand({
        type: 'UPDATE_ATOM',
        payload: { id: props.atomId, changes: { context: normalized } },
      });
    }
    setShowCustomContext(false);
    setCustomContextDraft('');
  }

  function handleCustomContextKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitCustomContext();
    }
    if (e.key === 'Escape') {
      setShowCustomContext(false);
    }
  }

  function clearContext() {
    sendCommand({
      type: 'UPDATE_ATOM',
      payload: { id: props.atomId, changes: { context: null } },
    });
  }

  // Determine if the current context is a custom (non-predefined) value
  const isCustomContext = createMemo(() => {
    const ctx = props.context;
    if (!ctx) return false;
    return !(GTD_CONTEXTS as readonly string[]).includes(ctx);
  });

  return (
    <div class="tag-input-wrapper">
      {/* Tags section */}
      <div class="tag-input-section">
        <span class="atom-detail-section-label">Tags</span>
        <div class="tag-input-field">
          {/* Existing tag chips */}
          <For each={props.tags}>
            {(tag) => (
              <span class="tag-chip">
                {tag}
                <button
                  class="tag-chip-remove"
                  onClick={() => removeTag(tag)}
                  aria-label={`Remove tag ${tag}`}
                  title={`Remove ${tag}`}
                >
                  ×
                </button>
              </span>
            )}
          </For>

          {/* Input for new tags */}
          <div class="tag-input-container">
            <input
              class="tag-input"
              type="text"
              placeholder={props.tags.length === 0 ? 'Add tags...' : ''}
              value={inputValue()}
              onInput={handleInput}
              onKeyDown={handleKeyDown}
              onFocus={() => setFocused(true)}
              onBlur={() => {
                // Delay to allow suggestion clicks to fire
                setTimeout(() => setFocused(false), 150);
              }}
              aria-label="Add tag"
              aria-autocomplete="list"
            />

            {/* Autocomplete dropdown */}
            <Show when={showDropdown()}>
              <div class="tag-autocomplete" role="listbox">
                <For each={suggestions()}>
                  {(suggestion, idx) => (
                    <button
                      class={`tag-autocomplete-item${highlightedIndex() === idx() ? ' highlighted' : ''}`}
                      role="option"
                      aria-selected={highlightedIndex() === idx()}
                      onMouseDown={(e) => {
                        e.preventDefault(); // Prevent blur before click fires
                        addTag(suggestion);
                      }}
                    >
                      {suggestion}
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </div>
      </div>

      {/* GTD Context section */}
      <div class="tag-input-section">
        <span class="atom-detail-section-label">Context</span>
        <div class="context-input-row">
          {/* Show current context chip if set */}
          <Show when={props.context}>
            <span class="context-chip">
              {props.context}
              <button
                class="tag-chip-remove"
                onClick={clearContext}
                aria-label="Clear context"
                title="Clear context"
              >
                ×
              </button>
            </span>
          </Show>

          {/* Context select — show predefined + custom option */}
          <Show when={!showCustomContext()}>
            <select
              class="context-select"
              value={isCustomContext() ? '__custom__' : (props.context ?? '')}
              onChange={handleContextSelect}
              aria-label="Set GTD context"
            >
              <option value="">No context</option>
              <For each={GTD_CONTEXTS}>
                {(ctx) => <option value={ctx}>{ctx}</option>}
              </For>
              <Show when={isCustomContext()}>
                <option value="__custom__">{props.context} (custom)</option>
              </Show>
              <Show when={!isCustomContext()}>
                <option value="__custom__">Custom...</option>
              </Show>
            </select>
          </Show>

          {/* Custom context input */}
          <Show when={showCustomContext()}>
            <input
              class="context-custom-input"
              type="text"
              placeholder="@custom"
              value={customContextDraft()}
              onInput={(e) => setCustomContextDraft(e.currentTarget.value)}
              onKeyDown={handleCustomContextKeyDown}
              onBlur={commitCustomContext}
              autofocus
              aria-label="Custom context"
            />
          </Show>
        </div>
      </div>
    </div>
  );
}
