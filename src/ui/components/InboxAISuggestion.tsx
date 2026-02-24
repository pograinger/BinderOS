/**
 * InboxAISuggestion: Per-card AI suggestion strip for inbox triage.
 *
 * Renders inline on an inbox triage card when an AI suggestion exists.
 *
 * Features:
 * - Atom type icon + suggested type + section name
 * - Expandable one-liner reasoning (Show more / Show less)
 * - Related atom chips (clickable, navigates to atom)
 * - Confidence visual: solid left border (high) or dotted left border (low)
 * - Pending/analyzing state with pulsing animation
 * - Error state with retry prompt
 *
 * Per CONTEXT.md locked decisions:
 * - Expandable for more detail (Show more/Show less toggle)
 * - Subtle confidence signal — solid vs dotted border, no numbers/labels
 * - 2-3 related atom chips below the suggestion line
 *
 * Phase 5: AIUX-03, AIUX-04
 */

import { createSignal, Show, For } from 'solid-js';
import type { TriageSuggestion } from '../../ai/triage';
import type { Atom } from '../../types/atoms';
import type { SectionItem } from '../../types/sections';
import { AtomTypeIcon } from './AtomTypeIcon';

// --- Props ---

interface InboxAISuggestionProps {
  suggestion: TriageSuggestion;
  onAccept: () => void;
  onDismiss: () => void;
  onAtomClick: (atomId: string) => void;
  atoms: Atom[];
  sectionItems: SectionItem[];
}

// --- Component ---

export function InboxAISuggestion(props: InboxAISuggestionProps) {
  const [expanded, setExpanded] = createSignal(false);

  // Resolve related atoms from IDs
  const relatedAtoms = () =>
    props.suggestion.relatedAtomIds
      .map((id) => props.atoms.find((a) => a.id === id))
      .filter((a): a is Atom => a !== undefined);

  // Resolve section name from suggestedSectionItemId
  const sectionName = () => {
    const id = props.suggestion.suggestedSectionItemId;
    if (!id) return null;
    const si = props.sectionItems.find((s) => s.id === id);
    return si ? si.name : null;
  };

  // Confidence CSS class
  const confidenceClass = () => {
    const s = props.suggestion;
    if (s.status === 'pending') return 'ai-suggestion-strip--pending';
    if (s.status === 'error') return 'ai-suggestion-strip--error';
    return s.confidence === 'high' ? 'ai-suggestion-strip--high' : 'ai-suggestion-strip--low';
  };

  return (
    <div class={`ai-suggestion-strip ${confidenceClass()}`}>
      {/* Pending / analyzing state */}
      <Show when={props.suggestion.status === 'pending'}>
        <div class="ai-suggestion-analyzing">Analyzing...</div>
      </Show>

      {/* Error state */}
      <Show when={props.suggestion.status === 'error'}>
        <div class="ai-suggestion-error">
          Suggestion failed — tap Triage to retry
        </div>
      </Show>

      {/* Complete suggestion */}
      <Show when={props.suggestion.status === 'complete'}>
        {/* Header row: type icon, type name, section */}
        <div class="ai-suggestion-header">
          <AtomTypeIcon type={props.suggestion.suggestedType} size={14} />
          <span class="ai-suggestion-type">{props.suggestion.suggestedType}</span>
          <Show when={sectionName()}>
            <span class="ai-suggestion-section">in {sectionName()}</span>
          </Show>
          <span class="ai-suggestion-badge" title="AI-suggested">AI</span>
        </div>

        {/* Reasoning — truncated by default, expandable */}
        <div class={`ai-suggestion-reasoning${expanded() ? ' ai-suggestion-reasoning--expanded' : ''}`}>
          {props.suggestion.reasoning}
        </div>

        <button
          class="ai-suggestion-expand"
          onClick={() => setExpanded(!expanded())}
        >
          {expanded() ? 'Show less' : 'Show more'}
        </button>

        {/* Related atom chips */}
        <Show when={relatedAtoms().length > 0}>
          <div class="ai-suggestion-related">
            <For each={relatedAtoms()}>
              {(atom) => (
                <button
                  class="ai-suggestion-chip"
                  onClick={() => props.onAtomClick(atom.id)}
                  title={atom.content.slice(0, 100)}
                >
                  {atom.title || atom.content.slice(0, 30)}
                </button>
              )}
            </For>
          </div>
        </Show>

        {/* Accept / Dismiss buttons (fallback for non-touch users) */}
        <div class="ai-suggestion-actions">
          <button class="ai-suggestion-accept" onClick={() => props.onAccept()}>Accept</button>
          <button class="ai-suggestion-dismiss" onClick={() => props.onDismiss()}>Dismiss</button>
        </div>
      </Show>
    </div>
  );
}
