/**
 * ReviewResumeToast: Toast notification for pending review sessions.
 *
 * Phase 11: Replaces the silent badge dot with an explicit toast prompt on app load,
 * so users don't miss a review in progress. The AIOrb badge dot remains as fallback
 * after this toast is dismissed.
 *
 * Key design decisions:
 * - Uses createEffect (not onMount) because state.reviewSession is hydrated
 *   asynchronously from Dexie after app load — onMount fires too early.
 * - sessionStorage prevents re-showing within the same browser session.
 *   A new tab or window resets sessionStorage, so the toast re-appears — correct behavior.
 * - Auto-dismisses after 15 seconds via setTimeout with onCleanup to prevent leaks.
 */

import { createSignal, createEffect, onCleanup, Show } from 'solid-js';
import { state, setActivePage, finishReviewSession } from '../signals/store';

const TOAST_SHOWN_KEY = 'binderos-review-toast-shown';

export function ReviewResumeToast() {
  const [visible, setVisible] = createSignal(false);

  createEffect(() => {
    if (state.reviewSession && !sessionStorage.getItem(TOAST_SHOWN_KEY)) {
      setVisible(true);
      sessionStorage.setItem(TOAST_SHOWN_KEY, '1');

      const timer = setTimeout(() => {
        setVisible(false);
      }, 15000);

      onCleanup(() => clearTimeout(timer));
    }
  });

  function handleResume() {
    setVisible(false);
    setActivePage('review');
  }

  async function handleDiscard() {
    setVisible(false);
    await finishReviewSession();
  }

  return (
    <Show when={visible()}>
      <div class="review-resume-toast">
        <span class="review-resume-toast-msg">You have a review in progress</span>
        <div class="review-resume-toast-actions">
          <button
            class="review-resume-toast-btn review-resume-toast-resume"
            onClick={handleResume}
          >
            Resume
          </button>
          <button
            class="review-resume-toast-btn review-resume-toast-discard"
            onClick={() => void handleDiscard()}
          >
            Discard
          </button>
        </div>
      </div>
    </Show>
  );
}
