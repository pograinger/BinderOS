/**
 * ReviewBriefingView — full-screen review briefing experience.
 *
 * Renders the AI-generated briefing from state.reviewBriefing.
 * Three states: loading/analyzing, error, ready.
 *
 * Ready state shows:
 *   - AI summary sentence (frosted glass card with AI badge)
 *   - Sectioned frosted glass cards: stale items, projects missing next actions, compression candidates
 *   - Each item shows title + metadata chips, tappable for inline expand + quick actions
 *   - Session resume: restores expanded/addressed items and scroll position
 *   - Stale session (>24h) warning with "Start Fresh" option
 *   - "Finish Review" button clears session and navigates to inbox
 *
 * Phase 6: AIRV-02, AIRV-05, AIGN-01
 */

import { createSignal, Show, For, createEffect, onCleanup, onMount } from 'solid-js';
import {
  state,
  sendCommand,
  cancelReviewBriefing,
  startReviewBriefing,
  setActivePage,
} from '../signals/store';
import type { BriefingItem } from '../../ai/analysis';
import { updateReviewSession, finishReviewSession } from '../signals/store';
import { REVIEW_SESSION_STALE_MS } from '../../storage/review-session';

// --- BriefingSection component ---

interface BriefingSectionProps {
  title: string;
  count: number;
  items: BriefingItem[];
  renderChips: (item: BriefingItem) => (string | null)[];
  onDefer?: (item: BriefingItem) => void;
  onArchive?: (item: BriefingItem) => void;
  onAddNextAction?: (item: BriefingItem) => void;
  expandedIds: () => Set<string>;
  addressedIds: () => Set<string>;
  onToggleExpand: (id: string) => void;
}

function BriefingSection(props: BriefingSectionProps) {
  return (
    <div class="analysis-card briefing-section">
      <span class="analysis-ai-badge">AI</span>
      <div class="briefing-section-header">
        <span class="briefing-section-title">{props.title}</span>
        <span class="briefing-section-count">{props.count}</span>
      </div>
      <For each={props.items}>
        {(item) => {
          const isExpanded = () => props.expandedIds().has(item.atomId);
          const isAddressed = () => props.addressedIds().has(item.atomId);
          const chips = () => props.renderChips(item).filter(Boolean) as string[];

          return (
            <div
              class={`briefing-item${isAddressed() ? ' briefing-item--addressed' : ''}`}
              onClick={() => props.onToggleExpand(item.atomId)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') props.onToggleExpand(item.atomId);
              }}
            >
              <div class="briefing-item-row">
                <span class="briefing-item-title">{item.title}</span>
                <Show when={isAddressed()}>
                  <span class="briefing-item-check">&#x2713;</span>
                </Show>
              </div>
              <Show when={chips().length > 0}>
                <div class="briefing-chips">
                  <For each={chips()}>
                    {(chip) => <span class="briefing-chip">{chip}</span>}
                  </For>
                </div>
              </Show>
              <Show when={isExpanded() && !isAddressed()}>
                <div class="briefing-item-actions" onClick={(e) => e.stopPropagation()}>
                  <Show when={props.onDefer}>
                    <button
                      class="briefing-action-btn"
                      onClick={() => props.onDefer!(item)}
                    >
                      Defer
                    </button>
                  </Show>
                  <Show when={props.onArchive}>
                    <button
                      class="briefing-action-btn"
                      onClick={() => props.onArchive!(item)}
                    >
                      Archive
                    </button>
                  </Show>
                  <Show when={props.onAddNextAction}>
                    <button
                      class="briefing-action-btn"
                      onClick={() => props.onAddNextAction!(item)}
                    >
                      Add Next Action
                    </button>
                  </Show>
                </div>
              </Show>
            </div>
          );
        }}
      </For>
    </div>
  );
}

// --- Main component ---

export function ReviewBriefingView() {
  // Local signals for interaction state
  const [expandedIds, setExpandedIds] = createSignal<Set<string>>(new Set());
  const [addressedIds, setAddressedIds] = createSignal<Set<string>>(new Set());

  // Scroll position persistence (debounced)
  let scrollRef: HTMLDivElement | undefined;
  let scrollDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // --- Session restore on mount ---
  onMount(() => {
    const session = state.reviewSession;
    if (session) {
      setExpandedIds(new Set(session.expandedItemIds));
      setAddressedIds(new Set(session.addressedItemIds));
      // Restore scroll after DOM is available
      requestAnimationFrame(() => {
        if (scrollRef && session.scrollPosition > 0) {
          scrollRef.scrollTop = session.scrollPosition;
        }
      });
    }
  });

  // Clean up scroll debounce on unmount
  onCleanup(() => {
    if (scrollDebounceTimer) clearTimeout(scrollDebounceTimer);
  });

  // --- Scroll handler ---
  function handleScroll() {
    if (scrollDebounceTimer) clearTimeout(scrollDebounceTimer);
    scrollDebounceTimer = setTimeout(() => {
      if (scrollRef) {
        void updateReviewSession({ scrollPosition: scrollRef.scrollTop });
      }
    }, 500);
  }

  // --- Toggle expand ---
  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      void updateReviewSession({ expandedItemIds: [...next] });
      return next;
    });
  }

  // --- Mark item as addressed ---
  function markAddressed(item: BriefingItem) {
    setAddressedIds((prev) => {
      const next = new Set(prev);
      next.add(item.atomId);
      void updateReviewSession({ addressedItemIds: [...next] });
      return next;
    });
    // Collapse item after action
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.delete(item.atomId);
      return next;
    });
  }

  // --- Quick actions ---
  function handleDefer(item: BriefingItem) {
    sendCommand({
      type: 'UPDATE_ATOM',
      payload: { id: item.atomId, changes: { updated_at: Date.now() } },
    });
    markAddressed(item);
  }

  function handleArchive(item: BriefingItem) {
    sendCommand({
      type: 'UPDATE_ATOM',
      payload: { id: item.atomId, changes: { status: 'archived' } },
    });
    markAddressed(item);
  }

  function handleAddNextAction(item: BriefingItem) {
    sendCommand({
      type: 'CREATE_INBOX_ITEM',
      payload: {
        content: `Next action for: ${item.title}`,
      },
    });
    markAddressed(item);
  }

  // --- Finish review ---
  async function handleFinishReview() {
    await finishReviewSession();
    setActivePage('inbox');
  }

  // --- Stale session check ---
  const isSessionStale = () => {
    const session = state.reviewSession;
    if (!session) return false;
    return Date.now() - session.startedAt > REVIEW_SESSION_STALE_MS;
  };

  // --- Handle start fresh ---
  async function handleStartFresh() {
    await finishReviewSession();
    startReviewBriefing();
  }

  return (
    <>
      {/* Loading / Analyzing state */}
      <Show when={state.reviewStatus === 'analyzing'}>
        <div class="review-briefing-progress">
          <div class="review-progress-spinner" />
          <div class="review-progress-messages">
            <Show when={state.reviewProgress}>
              <span class="review-progress-msg">{state.reviewProgress}</span>
            </Show>
          </div>
          <button class="review-cancel-btn" onClick={() => cancelReviewBriefing()}>
            Cancel
          </button>
        </div>
      </Show>

      {/* Error state */}
      <Show when={state.reviewStatus === 'error'}>
        <div class="review-briefing-error">
          <p class="review-error-msg">{state.reviewError ?? 'Something went wrong'}</p>
          <button class="briefing-action-btn" onClick={() => startReviewBriefing()}>
            Retry
          </button>
        </div>
      </Show>

      {/* Ready state */}
      <Show when={state.reviewStatus === 'ready' && state.reviewBriefing != null}>
        <div
          class="review-briefing"
          ref={scrollRef}
          onScroll={handleScroll}
        >
          {/* Stale session warning */}
          <Show when={isSessionStale()}>
            <div class="review-resume-banner">
              This briefing is more than 24 hours old and may be outdated.{' '}
              <button
                class="briefing-action-btn"
                style="display: inline; margin-left: 8px;"
                onClick={() => void handleStartFresh()}
              >
                Start Fresh
              </button>
            </div>
          </Show>

          {/* AI summary sentence */}
          <div class="review-briefing-summary analysis-card">
            <span class="analysis-ai-badge">AI</span>
            <p class="review-briefing-summary-text">{state.reviewBriefing!.summaryText}</p>
          </div>

          {/* All sections empty: celebration state */}
          <Show
            when={
              state.reviewBriefing!.staleItems.length === 0 &&
              state.reviewBriefing!.projectsMissingNextAction.length === 0 &&
              state.reviewBriefing!.compressionCandidates.length === 0
            }
          >
            <div class="review-briefing-empty">
              <p class="review-briefing-empty-title">Your system is in great shape!</p>
              <p style="color: var(--text-secondary); font-size: 13px;">
                No stale items, all projects have next actions, nothing to compress.
              </p>
            </div>
          </Show>

          {/* Stale items section */}
          <Show when={state.reviewBriefing!.staleItems.length > 0}>
            <BriefingSection
              title="Stale Items"
              count={state.reviewBriefing!.staleItems.length}
              items={state.reviewBriefing!.staleItems}
              renderChips={(item) => [
                item.staleDays != null ? `${item.staleDays}d stale` : null,
                item.linkCount != null ? `${item.linkCount} links` : null,
                item.entropyScore != null ? `Score: ${Math.round(item.entropyScore)}` : null,
              ]}
              onDefer={handleDefer}
              onArchive={handleArchive}
              expandedIds={expandedIds}
              addressedIds={addressedIds}
              onToggleExpand={toggleExpand}
            />
          </Show>

          {/* Projects missing next actions */}
          <Show when={state.reviewBriefing!.projectsMissingNextAction.length > 0}>
            <BriefingSection
              title="Projects Missing Next Actions"
              count={state.reviewBriefing!.projectsMissingNextAction.length}
              items={state.reviewBriefing!.projectsMissingNextAction}
              renderChips={() => []}
              onAddNextAction={handleAddNextAction}
              expandedIds={expandedIds}
              addressedIds={addressedIds}
              onToggleExpand={toggleExpand}
            />
          </Show>

          {/* Compression candidates */}
          <Show when={state.reviewBriefing!.compressionCandidates.length > 0}>
            <BriefingSection
              title="Compression Candidates"
              count={state.reviewBriefing!.compressionCandidates.length}
              items={state.reviewBriefing!.compressionCandidates}
              renderChips={(item) => [
                item.staleDays != null ? `${item.staleDays}d stale` : null,
              ]}
              onArchive={handleArchive}
              expandedIds={expandedIds}
              addressedIds={addressedIds}
              onToggleExpand={toggleExpand}
            />
          </Show>

          {/* Finish review button */}
          <div style="display: flex; justify-content: center; padding: 8px 0 24px;">
            <button class="briefing-action-btn" onClick={() => void handleFinishReview()}>
              Finish Review
            </button>
          </div>
        </div>
      </Show>

      {/* Idle state (before first briefing) */}
      <Show when={state.reviewStatus === 'idle'}>
        <div class="review-briefing-empty">
          <p style="color: var(--text-secondary); font-size: 14px;">
            Starting review briefing...
          </p>
        </div>
      </Show>
    </>
  );
}
