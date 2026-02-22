/**
 * CapEnforcementModal: Hard-block modal shown when inbox or task cap is exceeded.
 *
 * UX philosophy: "System helping you triage" — not punitive. Tone is calm,
 * focused on the resolution path. The modal cannot be dismissed; it only
 * closes when the underlying count drops below the cap.
 *
 * Renders via Portal into document.body (bypasses CSS stacking context).
 * Shows when state.capExceeded is not null.
 *
 * After any triage action, the worker sends STATE_UPDATE which updates
 * counts in the store. The store clears capExceeded when count < cap,
 * which hides this modal via the outer <Show>.
 *
 * CRITICAL: Never destructure state or props. Use Show/For not map/ternary.
 * CRITICAL: Use Switch/Match for exclusive branches.
 */

import { createSignal, Show, For } from 'solid-js';
import { Switch, Match } from 'solid-js';
import { Portal } from 'solid-js/web';
import { state, sendCommand } from '../signals/store';
import type { InboxItem, AtomType } from '../../types/atoms';
import type { Atom } from '../../types/atoms';

/** Format a timestamp as a relative age string. */
function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Display title for an item — first 60 chars of content if no title. */
function itemTitle(content: string, title?: string): string {
  const raw = title?.trim() || content;
  return raw.length > 60 ? raw.slice(0, 57) + '…' : raw;
}

// Atom types available for inbox classification
const ATOM_TYPES: AtomType[] = ['task', 'fact', 'event', 'decision', 'insight'];

/**
 * Inline classify row for inbox items within the cap modal.
 * Shows a type selector and confirm/cancel controls.
 */
function InboxItemRow(props: { item: InboxItem }) {
  const [classifying, setClassifying] = createSignal(false);
  const [selectedType, setSelectedType] = createSignal<AtomType | null>(null);

  const handleClassify = () => {
    const type = selectedType();
    if (!type) return;
    sendCommand({
      type: 'CLASSIFY_INBOX_ITEM',
      payload: { id: props.item.id, type },
    });
    setClassifying(false);
  };

  const handleDiscard = () => {
    sendCommand({
      type: 'DELETE_INBOX_ITEM',
      payload: { id: props.item.id },
    });
  };

  return (
    <div class="cap-modal-item">
      <Show when={!classifying()}>
        <div class="cap-modal-item-info">
          <span class="cap-modal-item-title">
            {itemTitle(props.item.content, props.item.title)}
          </span>
          <span class="cap-modal-item-time">{relativeTime(props.item.created_at)}</span>
        </div>
        <div class="cap-modal-actions">
          <button
            class="cap-modal-btn cap-modal-btn-classify"
            onClick={() => setClassifying(true)}
            type="button"
          >
            Classify
          </button>
          <button
            class="cap-modal-btn cap-modal-btn-discard"
            onClick={handleDiscard}
            type="button"
          >
            Discard
          </button>
        </div>
      </Show>
      <Show when={classifying()}>
        <div class="cap-modal-type-selector">
          <div class="cap-modal-type-buttons">
            <For each={ATOM_TYPES}>
              {(atomType) => (
                <button
                  type="button"
                  class={`cap-modal-type-btn${selectedType() === atomType ? ' selected' : ''}`}
                  onClick={() => setSelectedType(atomType)}
                >
                  {atomType}
                </button>
              )}
            </For>
          </div>
          <div style={{ display: 'flex', "align-items": 'center' }}>
            <button
              class="cap-modal-classify-confirm"
              onClick={handleClassify}
              disabled={selectedType() === null}
              type="button"
            >
              Confirm
            </button>
            <button
              class="cap-modal-classify-cancel"
              onClick={() => { setClassifying(false); setSelectedType(null); }}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}

/** Row for an open task in the task cap modal. */
function TaskRow(props: { atom: Atom }) {
  const handleComplete = () => {
    sendCommand({
      type: 'UPDATE_ATOM',
      payload: { id: props.atom.id, changes: { status: 'done' } },
    });
  };

  const handleArchive = () => {
    sendCommand({
      type: 'UPDATE_ATOM',
      payload: { id: props.atom.id, changes: { status: 'archived' } },
    });
  };

  const handleSchedule = () => {
    // "Schedule" = mark as waiting for now (future enhancement: date picker)
    sendCommand({
      type: 'UPDATE_ATOM',
      payload: { id: props.atom.id, changes: { status: 'waiting' } },
    });
  };

  return (
    <div class="cap-modal-item">
      <div class="cap-modal-item-info">
        <span class="cap-modal-item-title">
          {itemTitle(props.atom.content, props.atom.title)}
        </span>
        <span class="cap-modal-item-time">{relativeTime(props.atom.updated_at)}</span>
      </div>
      <div class="cap-modal-actions">
        <button
          class="cap-modal-btn cap-modal-btn-complete"
          onClick={handleComplete}
          type="button"
        >
          Done
        </button>
        <button
          class="cap-modal-btn cap-modal-btn-archive"
          onClick={handleArchive}
          type="button"
        >
          Archive
        </button>
        <button
          class="cap-modal-btn cap-modal-btn-schedule"
          onClick={handleSchedule}
          type="button"
        >
          Schedule
        </button>
      </div>
    </div>
  );
}

export function CapEnforcementModal() {
  // Derive the list of inbox items to triage (sorted oldest first)
  const inboxItems = () =>
    [...state.inboxItems].sort((a, b) => a.created_at - b.created_at);

  // Derive the list of open/in-progress tasks to triage (sorted oldest updated first)
  const openTasks = () =>
    state.atoms
      .filter((a) => a.type === 'task' && (a.status === 'open' || a.status === 'in-progress'))
      .slice()
      .sort((a, b) => a.updated_at - b.updated_at);

  return (
    <Show when={state.capExceeded !== null}>
      <Portal mount={document.body}>
        {/* Overlay — no click-to-dismiss handler */}
        <div class="cap-modal-overlay" aria-modal="true" role="dialog">
          <div class="cap-modal">
            <Switch>
              <Match when={state.capExceeded === 'inbox'}>
                <h2 class="cap-modal-title">Inbox Full</h2>
                <p class="cap-modal-message">
                  Free at least one slot to continue. Classify an item to turn it into an atom, or discard items that no longer matter.
                </p>
                <div class="cap-modal-list">
                  <For each={inboxItems()}>
                    {(item) => <InboxItemRow item={item} />}
                  </For>
                </div>
              </Match>
              <Match when={state.capExceeded === 'task'}>
                <h2 class="cap-modal-title">Task List Full</h2>
                <p class="cap-modal-message">
                  Free at least one slot to continue. Complete a task, archive something no longer relevant, or schedule it for later.
                </p>
                <div class="cap-modal-list">
                  <For each={openTasks()}>
                    {(atom) => <TaskRow atom={atom} />}
                  </For>
                </div>
              </Match>
            </Switch>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
