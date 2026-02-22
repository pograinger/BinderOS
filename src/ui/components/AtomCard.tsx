/**
 * AtomCard: Compact atom row with swipe gestures.
 *
 * LOCKED DECISIONS (CONTEXT.md):
 *   - Swipe LEFT: archive (dispatch UPDATE_ATOM with status='archived')
 *   - Swipe RIGHT: complete (dispatch UPDATE_ATOM with status='done')
 *   - Hybrid density: compact row by default; click opens detail panel (Phase 3)
 *   - Visual feedback: card slides with color tint (red for archive, green for complete)
 *   - Velocity threshold: 80px displacement or 0.5 velocity
 *
 * Phase 2 additions:
 *   - Staleness opacity: reads state.scores[atom.id].opacity (1.0 fresh → 0.6 stale)
 *   - PriorityBadge: shown for Tasks and Events only (not Facts/Decisions/Insights)
 *   - CSS transition on opacity for gradual visual change
 *
 * Phase 3 additions:
 *   - onClick prop: called on click instead of toggling expanded (detail panel opens)
 *   - tabindex prop: roving tabindex support for keyboard navigation
 *   - focused prop: visual focus indicator for keyboard nav
 *   - Due date display: shows due date for tasks, event date for events
 *
 * Uses raw touch handlers since solid-gesture is not installed.
 * Disambiguates horizontal swipe from vertical scroll.
 *
 * CRITICAL: Never destructure props. Use props.atom, not { atom }.
 * CRITICAL: Never destructure state. Access via state.scores[props.atom.id].
 */

import { createSignal, Show } from 'solid-js';
import { AtomTypeIcon } from './AtomTypeIcon';
import { PriorityBadge } from './PriorityBadge';
import { sendCommand, state, setSelectedAtomId } from '../signals/store';
import type { Atom } from '../../types/atoms';

interface AtomCardProps {
  atom: Atom;
  /** Phase 3: onClick handler (overrides default expand toggle). */
  onClick?: () => void;
  /** Phase 3: tabindex for roving keyboard navigation. */
  tabindex?: 0 | -1;
  /** Phase 3: whether this card has roving keyboard focus. */
  focused?: boolean;
}

/**
 * Format a Unix ms timestamp as a short date (e.g., "Feb 22").
 */
function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Relative time display (e.g., "2h ago", "3d ago").
 */
function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function AtomCard(props: AtomCardProps) {
  const [translateX, setTranslateX] = createSignal(0);
  const [swiping, setSwiping] = createSignal(false);
  const [dismissed, setDismissed] = createSignal(false);

  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  let isHorizontalSwipe: boolean | null = null;

  // Phase 2: reactive score for this atom
  const atomScore = () => state.scores[props.atom.id];

  // Phase 2: staleness opacity (defaults to 1.0 if no score yet)
  const stalenessOpacity = () => {
    if (dismissed()) return 0;
    return atomScore()?.opacity ?? 1.0;
  };

  // Phase 2: show priority badge for tasks and events only
  const showPriorityBadge = () =>
    (props.atom.type === 'task' || props.atom.type === 'event') &&
    atomScore()?.priorityTier != null;

  // Phase 3: due date display for tasks
  const dueDate = (): number | undefined => {
    if (props.atom.type === 'task' && 'dueDate' in props.atom) {
      return props.atom.dueDate;
    }
    return undefined;
  };

  // Phase 3: event date display for events
  const eventDate = (): number | undefined => {
    if (props.atom.type === 'event' && 'eventDate' in props.atom) {
      return props.atom.eventDate;
    }
    return undefined;
  };

  const isOverdue = (): boolean => {
    const d = dueDate();
    return d !== undefined && d < Date.now();
  };

  const handleTouchStart = (e: TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchStartTime = Date.now();
    isHorizontalSwipe = null;
    setSwiping(true);
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!swiping()) return;
    const touch = e.touches[0];
    if (!touch) return;

    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;

    // Determine swipe direction on first significant movement
    if (isHorizontalSwipe === null) {
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        isHorizontalSwipe = Math.abs(dx) > Math.abs(dy);
      }
    }

    if (isHorizontalSwipe) {
      e.preventDefault();
      setTranslateX(dx);
    }
  };

  const handleTouchEnd = () => {
    if (!swiping()) return;
    setSwiping(false);

    const dx = translateX();
    const elapsed = Date.now() - touchStartTime;
    const velocity = Math.abs(dx) / Math.max(elapsed, 1);

    // Threshold: 80px displacement OR 0.5 velocity
    if (dx < -80 || (dx < -30 && velocity > 0.5)) {
      // Swipe LEFT -> archive
      setDismissed(true);
      setTranslateX(-300);
      setTimeout(() => {
        sendCommand({
          type: 'UPDATE_ATOM',
          payload: { id: props.atom.id, changes: { status: 'archived' } },
        });
      }, 200);
      return;
    }

    if (dx > 80 || (dx > 30 && velocity > 0.5)) {
      // Swipe RIGHT -> complete
      setDismissed(true);
      setTranslateX(300);
      setTimeout(() => {
        sendCommand({
          type: 'UPDATE_ATOM',
          payload: { id: props.atom.id, changes: { status: 'done' } },
        });
      }, 200);
      return;
    }

    // Snap back
    setTranslateX(0);
  };

  const bgTint = (): string => {
    const x = translateX();
    if (x < -30) return 'rgba(248, 81, 73, 0.15)'; // Red for archive
    if (x > 30) return 'rgba(63, 185, 80, 0.15)';  // Green for complete
    return 'transparent';
  };

  const statusBadge = (): string => {
    switch (props.atom.status) {
      case 'open': return '';
      case 'in-progress': return 'In Progress';
      case 'waiting': return 'Waiting';
      case 'done': return 'Done';
      case 'cancelled': return 'Cancelled';
      case 'archived': return 'Archived';
      default: return '';
    }
  };

  return (
    <div
      class="atom-card"
      style={{
        transform: `translateX(${translateX()}px)`,
        background: bgTint(),
        // Phase 2: staleness opacity transition; swipe animation uses transform transition
        transition: swiping()
          ? 'none'
          : 'transform 0.2s ease-out, background 0.2s, opacity 0.5s ease',
        opacity: String(stalenessOpacity()),
        "touch-action": "pan-y",
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      tabindex={props.tabindex ?? 0}
      onClick={() => {
        if (props.onClick) {
          props.onClick();
        } else {
          setSelectedAtomId(props.atom.id);
        }
      }}
    >
      <div class="atom-card-row">
        <AtomTypeIcon type={props.atom.type} size={16} />
        {/* Phase 2: PriorityBadge for tasks and events */}
        <Show when={showPriorityBadge()}>
          <PriorityBadge
            tier={atomScore()!.priorityTier!}
            pinned={props.atom.pinned_tier != null}
          />
        </Show>
        <span class="atom-card-title">
          {props.atom.title || props.atom.content.slice(0, 60)}
        </span>
        <Show when={statusBadge()}>
          <span class="atom-card-badge">{statusBadge()}</span>
        </Show>
        {/* Phase 3: due date for tasks */}
        <Show when={dueDate() !== undefined}>
          <span class={`atom-card-due${isOverdue() ? ' overdue' : ''}`}>
            Due {formatDate(dueDate()!)}
          </span>
        </Show>
        {/* Phase 3: event date for events */}
        <Show when={eventDate() !== undefined}>
          <span class="atom-card-event-date">
            {formatDate(eventDate()!)}
          </span>
        </Show>
        <span class="atom-card-time">{relativeTime(props.atom.updated_at)}</span>
      </div>
    </div>
  );
}
