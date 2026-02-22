/**
 * InboxView: Card-by-card triage (LOCKED DECISION).
 *
 * Shows ONE inbox item at a time (Tinder-like), NOT a list.
 *
 * LOCKED DECISIONS (CONTEXT.md):
 *   - Card-by-card: one item at a time, fullscreen-ish card
 *   - Swipe LEFT: skip (stays in inbox)
 *   - Swipe RIGHT: classify (shows classification panel)
 *   - Swipe UP: quick-archive
 *   - System suggests atom type from content heuristics
 *   - Type-ahead search for linking to section items
 *   - No snooze -- forced decisions only
 *   - Micro-animation rewards on triage completion
 *   - Counter: "3 of 12" progress indicator at top
 *
 * CRITICAL: Never destructure props. Use <For> for lists. Use <Show> for conditionals.
 */

import { createSignal, createMemo, For, Show, onCleanup } from 'solid-js';
import { state, sendCommand } from '../signals/store';
import { AtomTypeIcon } from '../components/AtomTypeIcon';
import type { AtomType } from '../../types/atoms';

const ATOM_TYPES: AtomType[] = ['task', 'fact', 'event', 'decision', 'insight'];

/**
 * Content-based heuristic for suggesting an atom type.
 * NOT AI -- simple keyword matching per CONTEXT.md.
 */
export function suggestTypeFromContent(content: string): AtomType {
  const lower = content.toLowerCase();

  // Task indicators
  if (/\b(todo|buy|fix|call|email|schedule|remind|send|finish|complete|submit|book|order|return|pick up|drop off|make|set up|write)\b/.test(lower)) {
    return 'task';
  }
  // Deadline-like patterns
  if (/\b(by|before|due|deadline|asap|urgent)\b/.test(lower)) {
    return 'task';
  }

  // Event indicators
  if (/\b(meeting|appointment|conference|lunch|dinner|party|interview|call at|on (monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/.test(lower)) {
    return 'event';
  }
  // Date/time patterns
  if (/\b\d{1,2}(:\d{2})?\s*(am|pm)\b/.test(lower)) {
    return 'event';
  }
  if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}\b/.test(lower)) {
    return 'event';
  }

  // Decision indicators
  if (/\b(decided|going with|chose|will use|picked|selected|committed to|settled on)\b/.test(lower)) {
    return 'decision';
  }

  // Insight indicators
  if (/\b(realized|idea|what if|maybe|could|might|wonder|thought|insight|noticed|interesting|aha|pattern)\b/.test(lower)) {
    return 'insight';
  }

  // Default: fact
  return 'fact';
}

export function InboxView() {
  const [currentIndex, setCurrentIndex] = createSignal(0);
  const [showClassify, setShowClassify] = createSignal(false);
  const [selectedType, setSelectedType] = createSignal<AtomType>('fact');
  const [linkSearch, setLinkSearch] = createSignal('');
  const [selectedSectionItemId, setSelectedSectionItemId] = createSignal<string | null>(null);
  const [classifyAnimation, setClassifyAnimation] = createSignal(false);
  const [emptyAnimation, setEmptyAnimation] = createSignal(false);
  const [cardTranslateX, setCardTranslateX] = createSignal(0);
  const [cardTranslateY, setCardTranslateY] = createSignal(0);
  const [cardSwiping, setCardSwiping] = createSignal(false);

  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  let isSwipeDirection: 'horizontal' | 'vertical' | null = null;

  const currentItem = createMemo(() => {
    const items = state.inboxItems;
    const idx = currentIndex();
    if (idx >= items.length) return null;
    return items[idx] ?? null;
  });

  const totalItems = createMemo(() => state.inboxItems.length);

  // Compute suggested type when current item changes
  const suggestedType = createMemo(() => {
    const item = currentItem();
    if (!item) return 'fact' as AtomType;
    return suggestTypeFromContent(item.content);
  });

  // Reset classification panel when item changes
  const resetClassifyPanel = () => {
    setShowClassify(false);
    setLinkSearch('');
    setSelectedSectionItemId(null);
  };

  // Filtered section items for type-ahead search
  const filteredSectionItems = createMemo(() => {
    const query = linkSearch().toLowerCase().trim();
    if (!query) return state.sectionItems.filter((si) => !si.archived);
    return state.sectionItems.filter(
      (si) => !si.archived && si.name.toLowerCase().includes(query),
    );
  });

  // Handle classification
  const classifyItem = () => {
    const item = currentItem();
    if (!item) return;

    // Trigger animation
    setClassifyAnimation(true);

    sendCommand({
      type: 'CLASSIFY_INBOX_ITEM',
      payload: {
        id: item.id,
        type: selectedType(),
        sectionItemId: selectedSectionItemId() ?? undefined,
      },
    });

    // Advance after animation
    setTimeout(() => {
      setClassifyAnimation(false);
      resetClassifyPanel();
      // Index stays the same since the item is removed from the array
      // but we need to check if we went past the end
      if (currentIndex() >= state.inboxItems.length) {
        setCurrentIndex(Math.max(0, state.inboxItems.length - 1));
      }
      // Check for empty state
      if (state.inboxItems.length === 0) {
        setEmptyAnimation(true);
      }
    }, 400);
  };

  // Swipe gesture handlers for the triage card
  const handleTouchStart = (e: TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchStartTime = Date.now();
    isSwipeDirection = null;
    setCardSwiping(true);
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!cardSwiping()) return;
    const touch = e.touches[0];
    if (!touch) return;

    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;

    // Determine direction on first significant movement
    if (isSwipeDirection === null) {
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        isSwipeDirection = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
      }
    }

    if (isSwipeDirection === 'horizontal') {
      e.preventDefault();
      setCardTranslateX(dx);
    } else if (isSwipeDirection === 'vertical' && dy < 0) {
      e.preventDefault();
      setCardTranslateY(dy);
    }
  };

  const handleTouchEnd = () => {
    if (!cardSwiping()) return;
    setCardSwiping(false);

    const dx = cardTranslateX();
    const dy = cardTranslateY();
    const elapsed = Date.now() - touchStartTime;
    const velocityX = Math.abs(dx) / Math.max(elapsed, 1);
    const velocityY = Math.abs(dy) / Math.max(elapsed, 1);

    // Swipe RIGHT -> open classify
    if (dx > 80 || (dx > 30 && velocityX > 0.5)) {
      setCardTranslateX(0);
      setCardTranslateY(0);
      setShowClassify(true);
      // Pre-select suggested type
      setSelectedType(suggestedType());
      return;
    }

    // Swipe LEFT -> skip (stay in inbox, advance to next)
    if (dx < -80 || (dx < -30 && velocityX > 0.5)) {
      setCardTranslateX(-400);
      setTimeout(() => {
        setCardTranslateX(0);
        const nextIdx = currentIndex() + 1;
        if (nextIdx < totalItems()) {
          setCurrentIndex(nextIdx);
        } else {
          setCurrentIndex(0); // Loop back
        }
        resetClassifyPanel();
      }, 200);
      return;
    }

    // Swipe UP -> quick-archive
    if (dy < -80 || (dy < -30 && velocityY > 0.5)) {
      const item = currentItem();
      if (item) {
        setCardTranslateY(-400);
        setTimeout(() => {
          setCardTranslateY(0);
          // Classify as fact and archive
          sendCommand({
            type: 'CLASSIFY_INBOX_ITEM',
            payload: { id: item.id, type: 'fact' },
          });
          resetClassifyPanel();
          if (currentIndex() >= state.inboxItems.length) {
            setCurrentIndex(Math.max(0, state.inboxItems.length - 1));
          }
        }, 200);
      }
      return;
    }

    // Snap back
    setCardTranslateX(0);
    setCardTranslateY(0);
  };

  // Keyboard shortcut: Enter to open classify, Escape to close
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !showClassify() && currentItem()) {
      setShowClassify(true);
      setSelectedType(suggestedType());
    }
  };

  // Cleanup timer ref
  let cleanupTimeout: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => {
    if (cleanupTimeout) clearTimeout(cleanupTimeout);
  });

  return (
    <div class="inbox-view" onKeyDown={handleKeyDown} tabIndex={0}>
      {/* Progress counter */}
      <Show when={totalItems() > 0}>
        <div class="inbox-counter">
          {currentIndex() + 1} of {totalItems()}
        </div>
      </Show>

      {/* Empty state */}
      <Show when={totalItems() === 0}>
        <div class={`inbox-empty${emptyAnimation() ? ' celebrate' : ''}`}>
          <div class="inbox-empty-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="var(--status-success)">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
            </svg>
          </div>
          <div class="inbox-empty-title">Inbox zero!</div>
          <div class="inbox-empty-subtitle">All items classified. Well done.</div>
        </div>
      </Show>

      {/* Current triage card */}
      <Show when={currentItem()}>
        <div
          class={`inbox-triage-card${classifyAnimation() ? ' classify-out' : ''}`}
          style={{
            transform: `translateX(${cardTranslateX()}px) translateY(${cardTranslateY()}px)`,
            transition: cardSwiping() ? 'none' : 'transform 0.25s ease-out, opacity 0.3s',
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <Show when={currentItem()!.title}>
            <div class="inbox-card-title">{currentItem()!.title}</div>
          </Show>
          <div class="inbox-card-content">{currentItem()!.content}</div>
          <div class="inbox-card-time">
            {new Date(currentItem()!.created_at).toLocaleString()}
          </div>

          {/* Swipe hints */}
          <div class="inbox-swipe-hints">
            <span class="swipe-hint left">Skip</span>
            <span class="swipe-hint up">Archive</span>
            <span class="swipe-hint right">Classify</span>
          </div>
        </div>

        {/* Classification panel */}
        <Show when={showClassify()}>
          <div class="inbox-classify-panel">
            {/* Type selector */}
            <div class="inbox-type-label">Type</div>
            <div class="inbox-type-buttons">
              <For each={ATOM_TYPES}>
                {(atomType) => (
                  <button
                    class={`inbox-type-btn${selectedType() === atomType ? ' selected' : ''}${suggestedType() === atomType && selectedType() !== atomType ? ' suggested' : ''}`}
                    onClick={() => setSelectedType(atomType)}
                    data-type={atomType}
                  >
                    <AtomTypeIcon type={atomType} size={14} />
                    <span>{atomType}</span>
                  </button>
                )}
              </For>
            </div>

            {/* Type-ahead search for linking */}
            <div class="inbox-link-label">Link to...</div>
            <input
              class="inbox-link-input"
              type="text"
              placeholder="Search projects, areas..."
              value={linkSearch()}
              onInput={(e) => {
                setLinkSearch(e.currentTarget.value);
                setSelectedSectionItemId(null);
              }}
            />

            <Show when={filteredSectionItems().length > 0}>
              <div class="inbox-link-results">
                <For each={filteredSectionItems()}>
                  {(si) => {
                    const section = () => state.sections.find((s) => s.id === si.sectionId);
                    return (
                      <button
                        class={`inbox-link-item${selectedSectionItemId() === si.id ? ' selected' : ''}`}
                        onClick={() => {
                          setSelectedSectionItemId(si.id);
                          setLinkSearch(si.name);
                        }}
                      >
                        <span class="inbox-link-item-name">{si.name}</span>
                        <Show when={section()}>
                          <span class="inbox-link-item-section">{section()!.name}</span>
                        </Show>
                      </button>
                    );
                  }}
                </For>
              </div>
            </Show>

            {/* Classify button */}
            <button class="inbox-classify-btn" onClick={classifyItem}>
              Classify
            </button>
            <button
              class="inbox-classify-cancel"
              onClick={() => {
                resetClassifyPanel();
              }}
            >
              Cancel
            </button>
          </div>
        </Show>

        {/* Desktop action buttons (for non-touch users) */}
        <Show when={!showClassify()}>
          <div class="inbox-desktop-actions">
            <button
              class="inbox-action-btn skip"
              onClick={() => {
                const nextIdx = currentIndex() + 1;
                if (nextIdx < totalItems()) {
                  setCurrentIndex(nextIdx);
                } else {
                  setCurrentIndex(0);
                }
              }}
            >
              Skip
            </button>
            <button
              class="inbox-action-btn classify"
              onClick={() => {
                setShowClassify(true);
                setSelectedType(suggestedType());
              }}
            >
              Classify
            </button>
          </div>
        </Show>
      </Show>
    </div>
  );
}
