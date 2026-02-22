/**
 * AtomDetailView: Slide-in detail panel for a selected atom.
 *
 * Renders as a fixed right panel when state.selectedAtomId is set.
 * Shows full atom information with editable fields.
 *
 * Editable fields:
 *   - Title: inline input, saves on blur/Enter via UPDATE_ATOM
 *   - Status: row of buttons for tasks (open, in-progress, waiting, done, cancelled)
 *   - Due date / scheduled date (tasks) via <input type="date">
 *   - Event date (events) via <input type="date">
 *   - Content: textarea, saves on blur via UPDATE_ATOM
 *
 * Close on: Close button click, overlay click, Escape key.
 * Quick capture (Ctrl+N) continues to work — handled at app level.
 *
 * CRITICAL: Never destructure props or store. Use Switch/Match, Show.
 * CRITICAL: Never early-return from component body.
 */

import { Show, Switch, Match, createSignal, createMemo, onCleanup, For, createEffect } from 'solid-js';
import { state, sendCommand, setSelectedAtomId } from '../signals/store';
import { AtomTypeIcon } from '../components/AtomTypeIcon';
import { PriorityBadge } from '../components/PriorityBadge';
import { TagInput } from '../components/TagInput';
import { BacklinksPanel } from '../components/BacklinksPanel';
import { MentionAutocomplete } from '../components/MentionAutocomplete';
import type { AtomStatus, AtomLink } from '../../types/atoms';

// --- Date helpers ---

/**
 * Convert a Unix ms timestamp to an HTML date input value string (YYYY-MM-DD).
 * Returns '' if ts is undefined.
 */
function tsToDateInput(ts: number | undefined): string {
  if (ts === undefined) return '';
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Convert an HTML date input value string (YYYY-MM-DD) to Unix ms timestamp.
 * Returns undefined if the value is empty.
 */
function dateInputToTs(value: string): number | undefined {
  if (!value) return undefined;
  return new Date(value).getTime();
}

/** Format a Unix ms timestamp as a human-readable date (e.g., "Feb 22, 2026"). */
function formatLongDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// Task status options (excluding 'archived' — use swipe or review for that)
const TASK_STATUSES: { value: AtomStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function AtomDetailView() {
  // Reactive reference to the selected atom
  const atom = createMemo(() =>
    state.atoms.find((a) => a.id === state.selectedAtomId) ?? null,
  );

  // Local editing state — only for fields being actively edited
  const [editingTitle, setEditingTitle] = createSignal(false);
  const [titleDraft, setTitleDraft] = createSignal('');

  // --- Close handler ---
  const close = () => setSelectedAtomId(null);

  // --- Escape key ---
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      close();
    }
  };

  document.addEventListener('keydown', handleKeyDown);
  onCleanup(() => document.removeEventListener('keydown', handleKeyDown));

  // --- Title editing ---

  const startEditTitle = () => {
    const a = atom();
    if (!a) return;
    setTitleDraft(a.title || (a.content.split('\n')[0] ?? ''));
    setEditingTitle(true);
  };

  const commitTitle = () => {
    const a = atom();
    if (!a) return;
    const newTitle = titleDraft().trim();
    if (newTitle && newTitle !== a.title) {
      sendCommand({
        type: 'UPDATE_ATOM',
        payload: { id: a.id, changes: { title: newTitle } },
      });
    }
    setEditingTitle(false);
  };

  const handleTitleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitTitle();
    }
    if (e.key === 'Escape') {
      setEditingTitle(false);
    }
    e.stopPropagation(); // Prevent panel close on Escape during edit
  };

  // --- Status change ---
  const handleStatusChange = (newStatus: AtomStatus) => {
    const a = atom();
    if (!a) return;
    sendCommand({
      type: 'UPDATE_ATOM',
      payload: { id: a.id, changes: { status: newStatus } },
    });
  };

  // --- Due date change (tasks) ---
  const handleDueDateChange = (e: Event) => {
    const a = atom();
    if (!a) return;
    const input = e.target as HTMLInputElement;
    const ts = dateInputToTs(input.value);
    sendCommand({
      type: 'UPDATE_ATOM',
      payload: { id: a.id, changes: { dueDate: ts } },
    });
  };

  // --- Scheduled date change (tasks) ---
  const handleScheduledDateChange = (e: Event) => {
    const a = atom();
    if (!a) return;
    const input = e.target as HTMLInputElement;
    const ts = dateInputToTs(input.value);
    sendCommand({
      type: 'UPDATE_ATOM',
      payload: { id: a.id, changes: { scheduledDate: ts } },
    });
  };

  // --- Event date change ---
  const handleEventDateChange = (e: Event) => {
    const a = atom();
    if (!a) return;
    const input = e.target as HTMLInputElement;
    const ts = dateInputToTs(input.value);
    sendCommand({
      type: 'UPDATE_ATOM',
      payload: { id: a.id, changes: { eventDate: ts } },
    });
  };

  // --- Content editing with debounce ---
  // Local signal for the content textarea value — debounces saves at 300ms
  const [contentDraft, setContentDraft] = createSignal<string | null>(null);

  // Sync draft to atom content when selected atom changes (reset draft on nav)
  createEffect(() => {
    const a = atom();
    if (a) {
      setContentDraft(a.content);
    } else {
      setContentDraft(null);
    }
  });

  let contentDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  const handleContentChange = (newContent: string) => {
    setContentDraft(newContent);
    // Debounce saves by 300ms
    if (contentDebounceTimer !== null) clearTimeout(contentDebounceTimer);
    contentDebounceTimer = setTimeout(() => {
      const a = atom();
      if (!a) return;
      if (newContent !== a.content) {
        sendCommand({
          type: 'UPDATE_ATOM',
          payload: { id: a.id, changes: { content: newContent } },
        });
      }
    }, 300);
  };

  onCleanup(() => {
    if (contentDebounceTimer !== null) clearTimeout(contentDebounceTimer);
  });

  const handleLinkCreated = (targetId: string) => {
    const a = atom();
    if (!a) return;
    const currentLinks = a.links;
    if (currentLinks.some((l) => l.targetId === targetId)) return; // already linked
    const newLink: AtomLink = {
      targetId,
      relationshipType: 'mentions',
      direction: 'forward',
    };
    sendCommand({
      type: 'UPDATE_ATOM',
      payload: {
        id: a.id,
        changes: { links: [...currentLinks, newLink] },
      },
    });
  };

  // --- Resolved section/section item names ---
  const sectionName = createMemo(() => {
    const a = atom();
    if (!a?.sectionId) return null;
    return state.sections.find((s) => s.id === a.sectionId)?.name ?? null;
  });

  const sectionItemName = createMemo(() => {
    const a = atom();
    if (!a?.sectionItemId) return null;
    return state.sectionItems.find((si) => si.id === a.sectionItemId)?.name ?? null;
  });

  // --- Score data ---
  const atomScore = createMemo(() => {
    const a = atom();
    if (!a) return null;
    return state.scores[a.id] ?? null;
  });

  return (
    <Show when={atom()}>
      {/* Overlay — click to close */}
      <div
        class="atom-detail-overlay"
        onClick={close}
        aria-hidden="true"
      />

      {/* Detail panel */}
      <div
        class="atom-detail-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Atom detail"
      >
        {/* Header */}
        <div class="atom-detail-header">
          <AtomTypeIcon type={atom()!.type} size={18} />

          {/* Title — editable on click */}
          <Show when={!editingTitle()}>
            <span
              class="atom-detail-title"
              onClick={startEditTitle}
              title="Click to edit title"
              role="button"
              tabindex={0}
              onKeyDown={(e) => { if (e.key === 'Enter') startEditTitle(); }}
            >
              {atom()!.title || atom()!.content.split('\n')[0] || 'Untitled'}
            </span>
          </Show>

          <Show when={editingTitle()}>
            <input
              class="atom-detail-title-input"
              type="text"
              value={titleDraft()}
              onInput={(e) => setTitleDraft(e.currentTarget.value)}
              onBlur={commitTitle}
              onKeyDown={handleTitleKeyDown}
              autofocus
              aria-label="Edit title"
            />
          </Show>

          <button
            class="atom-detail-close"
            onClick={close}
            aria-label="Close detail panel"
            title="Close (Escape)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        {/* Priority + staleness row */}
        <Show when={atomScore()}>
          <div class="atom-detail-score-row">
            <Show when={atomScore()!.priorityTier != null}>
              <PriorityBadge
                tier={atomScore()!.priorityTier!}
                pinned={atom()!.pinned_tier != null}
              />
            </Show>
            <Show when={(atomScore()!.staleness ?? 0) > 0}>
              <span
                class={`atom-detail-staleness${(atomScore()!.staleness ?? 0) > 0.6 ? ' high' : ''}`}
                title={`Staleness: ${Math.round((atomScore()!.staleness ?? 0) * 100)}%`}
              >
                {Math.round((atomScore()!.staleness ?? 0) * 100)}% stale
              </span>
            </Show>
          </div>
        </Show>

        {/* Status section — tasks only */}
        <Show when={atom()!.type === 'task'}>
          <div class="atom-detail-section">
            <span class="atom-detail-section-label">Status</span>
            <div class="status-button-row">
              <For each={TASK_STATUSES}>
                {(s) => (
                  <button
                    class={`status-button${atom()!.status === s.value ? ' active' : ''}`}
                    onClick={() => handleStatusChange(s.value)}
                    aria-pressed={atom()!.status === s.value}
                  >
                    {s.label}
                  </button>
                )}
              </For>
            </div>
          </div>
        </Show>

        {/* Status for non-tasks — read-only badge */}
        <Show when={atom()!.type !== 'task'}>
          <div class="atom-detail-section">
            <span class="atom-detail-section-label">Status</span>
            <span class="atom-detail-status-badge">{atom()!.status}</span>
          </div>
        </Show>

        {/* Date section — tasks */}
        <Show when={atom()!.type === 'task'}>
          <div class="atom-detail-section">
            <span class="atom-detail-section-label">Dates</span>
            <div class="atom-detail-dates">
              <label class="atom-detail-date-label">
                <span>Due</span>
                <input
                  type="date"
                  class="atom-detail-date-input"
                  value={tsToDateInput(
                    'dueDate' in atom()! ? (atom()! as { dueDate?: number }).dueDate : undefined,
                  )}
                  onChange={handleDueDateChange}
                  aria-label="Due date"
                />
              </label>
              <label class="atom-detail-date-label">
                <span>Scheduled</span>
                <input
                  type="date"
                  class="atom-detail-date-input"
                  value={tsToDateInput(
                    'scheduledDate' in atom()!
                      ? (atom()! as { scheduledDate?: number }).scheduledDate
                      : undefined,
                  )}
                  onChange={handleScheduledDateChange}
                  aria-label="Scheduled date"
                />
              </label>
            </div>
          </div>
        </Show>

        {/* Date section — events */}
        <Show when={atom()!.type === 'event'}>
          <div class="atom-detail-section">
            <span class="atom-detail-section-label">Event Date</span>
            <input
              type="date"
              class="atom-detail-date-input"
              value={tsToDateInput(
                'eventDate' in atom()! ? (atom()! as { eventDate?: number }).eventDate : undefined,
              )}
              onChange={handleEventDateChange}
              aria-label="Event date"
            />
          </div>
        </Show>

        {/* Content section — MentionAutocomplete textarea with @mention + debounced save */}
        <div class="atom-detail-section atom-detail-content-section">
          <span class="atom-detail-section-label">Content</span>
          <MentionAutocomplete
            value={contentDraft() ?? atom()!.content}
            onValueChange={handleContentChange}
            onLinkCreated={handleLinkCreated}
          />
        </div>

        {/* Metadata */}
        <div class="atom-detail-section atom-detail-meta">
          <div class="atom-detail-meta-row">
            <span class="atom-detail-meta-label">Created</span>
            <span class="atom-detail-meta-value">{formatLongDate(atom()!.created_at)}</span>
          </div>
          <div class="atom-detail-meta-row">
            <span class="atom-detail-meta-label">Updated</span>
            <span class="atom-detail-meta-value">{formatLongDate(atom()!.updated_at)}</span>
          </div>
          <Show when={sectionName()}>
            <div class="atom-detail-meta-row">
              <span class="atom-detail-meta-label">Section</span>
              <span class="atom-detail-meta-value">{sectionName()}</span>
            </div>
          </Show>
          <Show when={sectionItemName()}>
            <div class="atom-detail-meta-row">
              <span class="atom-detail-meta-label">Project</span>
              <span class="atom-detail-meta-value">{sectionItemName()}</span>
            </div>
          </Show>
          <div class="atom-detail-meta-row">
            <span class="atom-detail-meta-label">Links</span>
            <span class="atom-detail-meta-value">{atom()!.links.length}</span>
          </div>
        </div>

        {/* Backlinks section — shows atoms that link to this atom */}
        <div class="atom-detail-section">
          <BacklinksPanel atomId={state.selectedAtomId!} />
        </div>

        {/* Tags + GTD context section */}
        <div class="atom-detail-section">
          <TagInput
            atomId={state.selectedAtomId!}
            tags={atom()?.tags ?? []}
            context={atom()?.context ?? null}
          />
        </div>
      </div>
    </Show>
  );
}
