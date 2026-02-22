/**
 * ReviewView: Card-by-card compression prompt triage.
 *
 * Shows one compression candidate at a time (mirrors InboxView pattern).
 * Candidates come from state.compressionCandidates (stale + orphaned atoms).
 *
 * Four actions per candidate:
 *   - Archive: sets status='archived' via UPDATE_ATOM
 *   - Delete: removes atom permanently via DELETE_ATOM
 *   - Keep: resets staleness by updating updated_at to now via UPDATE_ATOM
 *   - Merge: shows target selector, dispatches MERGE_ATOMS
 *
 * Swipe gestures: left = archive, right = keep, up = delete (mirrors InboxView).
 * Progress indicator shows position. Empty state is rewarding.
 *
 * CRITICAL: Never destructure props. Use Show/For not ternary/map.
 */

import { createSignal, createMemo, For, Show, onCleanup } from 'solid-js';
import { state, sendCommand } from '../signals/store';
import { AtomTypeIcon } from '../components/AtomTypeIcon';

export function ReviewView() {
  const [currentIndex, setCurrentIndex] = createSignal(0);
  const [showMerge, setShowMerge] = createSignal(false);
  const [mergeSearch, setMergeSearch] = createSignal('');
  const [actionAnimation, setActionAnimation] = createSignal(false);
  const [emptyAnimation, setEmptyAnimation] = createSignal(false);
  const [cardTranslateX, setCardTranslateX] = createSignal(0);
  const [cardTranslateY, setCardTranslateY] = createSignal(0);
  const [cardSwiping, setCardSwiping] = createSignal(false);
  const [expandContent, setExpandContent] = createSignal(false);

  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  let isSwipeDirection: 'horizontal' | 'vertical' | null = null;
  let cleanupTimeout: ReturnType<typeof setTimeout> | undefined;

  onCleanup(() => {
    if (cleanupTimeout) clearTimeout(cleanupTimeout);
  });

  const candidates = createMemo(() => state.compressionCandidates);
  const totalCount = createMemo(() => candidates().length);

  const currentCandidate = createMemo(() => {
    const list = candidates();
    const idx = currentIndex();
    if (idx >= list.length) return null;
    return list[idx] ?? null;
  });

  const currentAtom = createMemo(() => {
    const candidate = currentCandidate();
    if (!candidate) return null;
    return state.atoms.find((a) => a.id === candidate.id) ?? null;
  });

  // Merge search: filter atoms by title-search, exclude current candidate
  const filteredMergeTargets = createMemo(() => {
    const query = mergeSearch().toLowerCase().trim();
    const candidate = currentCandidate();
    if (!candidate) return [];
    return state.atoms.filter((a) => {
      if (a.id === candidate.id) return false;
      if (a.status === 'archived') return false;
      if (!query) return true;
      const title = (a.content.split('\n')[0] ?? '').toLowerCase();
      return title.includes(query);
    });
  });

  const advanceCard = () => {
    const next = currentIndex() + 1;
    if (next >= totalCount()) {
      // Went past end — stay at 0 (candidates list will shrink after state update)
      setCurrentIndex(0);
      setEmptyAnimation(true);
    } else {
      setCurrentIndex(next);
    }
    setShowMerge(false);
    setMergeSearch('');
    setExpandContent(false);
  };

  const doAction = (action: () => void) => {
    setActionAnimation(true);
    action();
    cleanupTimeout = setTimeout(() => {
      setActionAnimation(false);
      advanceCard();
    }, 400);
  };

  const handleArchive = () => {
    const candidate = currentCandidate();
    if (!candidate) return;
    doAction(() => {
      sendCommand({
        type: 'UPDATE_ATOM',
        payload: { id: candidate.id, changes: { status: 'archived' } },
      });
    });
  };

  const handleDelete = () => {
    const candidate = currentCandidate();
    if (!candidate) return;
    doAction(() => {
      sendCommand({ type: 'DELETE_ATOM', payload: { id: candidate.id } });
    });
  };

  const handleKeep = () => {
    const candidate = currentCandidate();
    if (!candidate) return;
    doAction(() => {
      sendCommand({
        type: 'UPDATE_ATOM',
        payload: { id: candidate.id, changes: { updated_at: Date.now() } },
      });
    });
  };

  const handleMerge = (targetId: string) => {
    const candidate = currentCandidate();
    if (!candidate) return;
    doAction(() => {
      sendCommand({
        type: 'MERGE_ATOMS',
        payload: { sourceId: candidate.id, targetId },
      });
    });
  };

  // Swipe gesture handlers — mirrors InboxView pattern
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

    // Swipe RIGHT -> Keep (reset staleness)
    if (dx > 80 || (dx > 30 && velocityX > 0.5)) {
      setCardTranslateX(400);
      cleanupTimeout = setTimeout(() => {
        setCardTranslateX(0);
        setCardTranslateY(0);
        handleKeep();
      }, 200);
      return;
    }

    // Swipe LEFT -> Archive
    if (dx < -80 || (dx < -30 && velocityX > 0.5)) {
      setCardTranslateX(-400);
      cleanupTimeout = setTimeout(() => {
        setCardTranslateX(0);
        setCardTranslateY(0);
        handleArchive();
      }, 200);
      return;
    }

    // Swipe UP -> Delete
    if (dy < -80 || (dy < -30 && velocityY > 0.5)) {
      setCardTranslateY(-400);
      cleanupTimeout = setTimeout(() => {
        setCardTranslateX(0);
        setCardTranslateY(0);
        handleDelete();
      }, 200);
      return;
    }

    // Snap back
    setCardTranslateX(0);
    setCardTranslateY(0);
  };

  // Preview text: first 200 chars with expand
  const previewContent = createMemo(() => {
    const atom = currentAtom();
    if (!atom) return '';
    if (expandContent() || atom.content.length <= 200) return atom.content;
    return atom.content.slice(0, 200) + '…';
  });

  // Format the reason more readably
  const formattedReason = createMemo(() => {
    const c = currentCandidate();
    if (!c) return '';
    return c.reason;
  });

  // Last-edit date from updated_at
  const lastEditDate = createMemo(() => {
    const atom = currentAtom();
    if (!atom) return '';
    return new Date(atom.updated_at).toLocaleDateString();
  });

  return (
    <div class="review-view">
      {/* Empty state — no candidates or all done */}
      <Show when={totalCount() === 0}>
        <div class={`review-empty-state${emptyAnimation() ? ' celebrate' : ''}`}>
          <div class="review-empty-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="var(--status-success)">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
            </svg>
          </div>
          <div class="review-empty-title">All clear!</div>
          <div class="review-empty-subtitle">No items need attention right now.</div>
          <Show when={state.entropyScore}>
            <div class="review-entropy-summary">
              <span
                class={`review-entropy-badge ${state.entropyScore!.level}`}
              >
                System health: {state.entropyScore!.level === 'green' ? 'Good' : state.entropyScore!.level === 'yellow' ? 'Fair' : 'Poor'}
              </span>
              <span class="review-entropy-score">Score: {Math.round(state.entropyScore!.score)}</span>
            </div>
          </Show>
        </div>
      </Show>

      {/* Active triage */}
      <Show when={totalCount() > 0 && currentCandidate()}>
        {/* Progress indicator */}
        <div class="review-progress">
          <span class="review-progress-text">
            {Math.min(currentIndex() + 1, totalCount())} of {totalCount()} to review
          </span>
          <div class="review-progress-bar">
            <div
              class="review-progress-fill"
              style={{ width: `${((currentIndex()) / totalCount()) * 100}%` }}
            />
          </div>
        </div>

        {/* Triage card */}
        <div
          class={`review-card${actionAnimation() ? ' action-out' : ''}`}
          style={{
            transform: `translateX(${cardTranslateX()}px) translateY(${cardTranslateY()}px)`,
            transition: cardSwiping() ? 'none' : 'transform 0.25s ease-out, opacity 0.3s',
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Atom type icon + title */}
          <div class="review-card-header">
            <Show when={currentAtom()}>
              <AtomTypeIcon type={currentAtom()!.type} size={18} />
              <span class="review-card-title">
                {currentAtom()!.content.split('\n')[0]?.slice(0, 80) ?? 'Untitled'}
              </span>
            </Show>
          </div>

          {/* Reason badge */}
          <div class="review-reason">{formattedReason()}</div>

          {/* Last edit date */}
          <div class="review-last-edit">Last edited: {lastEditDate()}</div>

          {/* Content preview */}
          <div class="review-card-content">{previewContent()}</div>
          <Show when={currentAtom() && currentAtom()!.content.length > 200}>
            <button
              class="review-expand-btn"
              onClick={() => setExpandContent(!expandContent())}
            >
              {expandContent() ? 'Collapse' : 'Show more'}
            </button>
          </Show>

          {/* Swipe hints */}
          <div class="inbox-swipe-hints">
            <span class="swipe-hint left">Archive</span>
            <span class="swipe-hint up">Delete</span>
            <span class="swipe-hint right">Keep</span>
          </div>
        </div>

        {/* Action buttons (desktop) */}
        <Show when={!showMerge()}>
          <div class="review-actions">
            <button class="review-action-btn archive" onClick={handleArchive}>Archive</button>
            <button class="review-action-btn delete" onClick={handleDelete}>Delete</button>
            <button class="review-action-btn keep" onClick={handleKeep}>Keep</button>
            <button class="review-action-btn merge" onClick={() => setShowMerge(true)}>Merge</button>
          </div>
        </Show>

        {/* Merge target selector */}
        <Show when={showMerge()}>
          <div class="review-merge-search">
            <div class="review-merge-label">Merge into...</div>
            <input
              class="review-merge-input"
              type="text"
              placeholder="Search atoms by title..."
              value={mergeSearch()}
              onInput={(e) => setMergeSearch(e.currentTarget.value)}
            />
            <Show when={filteredMergeTargets().length > 0}>
              <div class="review-merge-results">
                <For each={filteredMergeTargets().slice(0, 8)}>
                  {(atom) => (
                    <button
                      class="review-merge-item"
                      onClick={() => handleMerge(atom.id)}
                    >
                      <AtomTypeIcon type={atom.type} size={12} />
                      <span class="review-merge-item-title">
                        {atom.content.split('\n')[0]?.slice(0, 60) ?? 'Untitled'}
                      </span>
                    </button>
                  )}
                </For>
              </div>
            </Show>
            <Show when={filteredMergeTargets().length === 0 && mergeSearch().length > 0}>
              <div class="review-merge-empty">No matching atoms found.</div>
            </Show>
            <button
              class="review-merge-cancel"
              onClick={() => {
                setShowMerge(false);
                setMergeSearch('');
              }}
            >
              Cancel
            </button>
          </div>
        </Show>
      </Show>
    </div>
  );
}
