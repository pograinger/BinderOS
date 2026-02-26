/**
 * GTDSuggestionCard — displays the GTD analysis recommendation.
 *
 * Shows a diff-like view of recommended changes:
 * - Next action text (new title)
 * - Status, energy, context, tags changes
 * - AI reasoning
 *
 * Three actions:
 * - Accept: applies all changes via sendCommand UPDATE_ATOM
 * - Modify: makes fields editable so user can tweak before accepting
 * - Dismiss: closes without changes
 *
 * Phase 7: GTD analysis skill agent
 */

import { createSignal, Show, For } from 'solid-js';
import type { GTDRecommendation } from '../../ai/gtd-analysis';
import type { Atom } from '../../types/atoms';

// --- Props ---

interface GTDSuggestionCardProps {
  atom: Atom;
  recommendation: GTDRecommendation;
  onAccept: (changes: Record<string, unknown>) => void;
  onDismiss: () => void;
}

// --- Component ---

export function GTDSuggestionCard(props: GTDSuggestionCardProps) {
  const [isModifying, setIsModifying] = createSignal(false);
  const [editTitle, setEditTitle] = createSignal('');
  const [editStatus, setEditStatus] = createSignal('');
  const [editEnergy, setEditEnergy] = createSignal('');
  const [editContext, setEditContext] = createSignal('');
  const [editTags, setEditTags] = createSignal('');

  const rec = () => props.recommendation;
  const atom = () => props.atom;

  /** Build the changes object from recommendation or edited values. */
  function buildChanges(): Record<string, unknown> {
    const changes: Record<string, unknown> = {};

    if (isModifying()) {
      const title = editTitle().trim();
      if (title && title !== atom().title) changes.title = title;
      const status = editStatus();
      if (status && status !== atom().status) changes.status = status;
      const energy = editEnergy();
      if (energy) changes.energy = energy || undefined;
      const context = editContext().trim();
      if (context) changes.context = context;
      const tags = editTags().trim();
      if (tags) changes.tags = tags.split(',').map(t => t.trim()).filter(Boolean);
    } else {
      if (rec().nextActionText !== atom().title) changes.title = rec().nextActionText;
      if (rec().suggestedStatus && rec().suggestedStatus !== atom().status) changes.status = rec().suggestedStatus;
      if (rec().suggestedEnergy) changes.energy = rec().suggestedEnergy;
      if (rec().suggestedContext) changes.context = rec().suggestedContext;
      if (rec().suggestedTags && rec().suggestedTags!.length > 0) {
        changes.tags = [...new Set([...(atom().tags ?? []), ...rec().suggestedTags!])];
      }
    }

    return changes;
  }

  function handleModify() {
    setEditTitle(rec().nextActionText);
    setEditStatus(rec().suggestedStatus ?? atom().status);
    setEditEnergy(rec().suggestedEnergy ?? atom().energy ?? '');
    setEditContext(rec().suggestedContext ?? atom().context ?? '');
    setEditTags(rec().suggestedTags?.join(', ') ?? atom().tags?.join(', ') ?? '');
    setIsModifying(true);
  }

  function handleAccept() {
    props.onAccept(buildChanges());
  }

  const statusOptions = ['open', 'in-progress', 'waiting', 'done', 'cancelled', 'archived'];
  const energyOptions = ['', 'Quick', 'Medium', 'Deep'];

  return (
    <div class="gtd-suggestion-card">
      <div class="gtd-sc-header">
        <span class="gtd-sc-title">Recommendation</span>
        <Show when={rec().aiGenerated}>
          <span class="gtd-sc-ai-badge">AI</span>
        </Show>
      </div>

      {/* Recommendation details */}
      <div class="gtd-sc-changes">
        {/* Next action / title */}
        <Show when={!isModifying()}>
          <div class="gtd-sc-row">
            <span class="gtd-sc-label">Next action</span>
            <span class={`gtd-sc-value${rec().nextActionText !== atom().title ? ' gtd-sc-value--changed' : ''}`}>
              {rec().nextActionText}
            </span>
          </div>
        </Show>
        <Show when={isModifying()}>
          <div class="gtd-sc-row gtd-sc-row--edit">
            <label class="gtd-sc-label">Next action</label>
            <input
              class="gtd-sc-input"
              type="text"
              value={editTitle()}
              onInput={(e) => setEditTitle(e.currentTarget.value)}
            />
          </div>
        </Show>

        {/* Status */}
        <Show when={!isModifying() && rec().suggestedStatus}>
          <div class="gtd-sc-row">
            <span class="gtd-sc-label">Status</span>
            <span class={`gtd-sc-value${rec().suggestedStatus !== atom().status ? ' gtd-sc-value--changed' : ''}`}>
              {atom().status} → {rec().suggestedStatus}
            </span>
          </div>
        </Show>
        <Show when={isModifying()}>
          <div class="gtd-sc-row gtd-sc-row--edit">
            <label class="gtd-sc-label">Status</label>
            <select
              class="gtd-sc-select"
              value={editStatus()}
              onChange={(e) => setEditStatus(e.currentTarget.value)}
            >
              <For each={statusOptions}>
                {(s) => <option value={s}>{s}</option>}
              </For>
            </select>
          </div>
        </Show>

        {/* Energy */}
        <Show when={!isModifying() && rec().suggestedEnergy}>
          <div class="gtd-sc-row">
            <span class="gtd-sc-label">Energy</span>
            <span class="gtd-sc-value gtd-sc-value--changed">{rec().suggestedEnergy}</span>
          </div>
        </Show>
        <Show when={isModifying()}>
          <div class="gtd-sc-row gtd-sc-row--edit">
            <label class="gtd-sc-label">Energy</label>
            <select
              class="gtd-sc-select"
              value={editEnergy()}
              onChange={(e) => setEditEnergy(e.currentTarget.value)}
            >
              <For each={energyOptions}>
                {(e) => <option value={e}>{e || '(none)'}</option>}
              </For>
            </select>
          </div>
        </Show>

        {/* Context */}
        <Show when={!isModifying() && rec().suggestedContext}>
          <div class="gtd-sc-row">
            <span class="gtd-sc-label">Context</span>
            <span class="gtd-sc-value gtd-sc-value--changed">{rec().suggestedContext}</span>
          </div>
        </Show>
        <Show when={isModifying()}>
          <div class="gtd-sc-row gtd-sc-row--edit">
            <label class="gtd-sc-label">Context</label>
            <input
              class="gtd-sc-input"
              type="text"
              value={editContext()}
              onInput={(e) => setEditContext(e.currentTarget.value)}
              placeholder="@computer, @phone, @errands..."
            />
          </div>
        </Show>

        {/* Tags */}
        <Show when={!isModifying() && rec().suggestedTags && rec().suggestedTags!.length > 0}>
          <div class="gtd-sc-row">
            <span class="gtd-sc-label">Tags</span>
            <span class="gtd-sc-value gtd-sc-value--changed">
              +{rec().suggestedTags!.join(', ')}
            </span>
          </div>
        </Show>
        <Show when={isModifying()}>
          <div class="gtd-sc-row gtd-sc-row--edit">
            <label class="gtd-sc-label">Tags</label>
            <input
              class="gtd-sc-input"
              type="text"
              value={editTags()}
              onInput={(e) => setEditTags(e.currentTarget.value)}
              placeholder="tag1, tag2, ..."
            />
          </div>
        </Show>
      </div>

      {/* Reasoning */}
      <div class="gtd-sc-reasoning">{rec().reasoning}</div>

      {/* Action buttons */}
      <div class="gtd-sc-actions">
        <button class="gtd-sc-btn gtd-sc-btn--accept" onClick={handleAccept}>
          Accept
        </button>
        <Show when={!isModifying()}>
          <button class="gtd-sc-btn gtd-sc-btn--modify" onClick={handleModify}>
            Modify
          </button>
        </Show>
        <button class="gtd-sc-btn gtd-sc-btn--dismiss" onClick={props.onDismiss}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
