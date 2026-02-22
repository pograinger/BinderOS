/**
 * BacklinksPanel: Collapsible section showing atoms that link to the current atom.
 *
 * Per CONTEXT.md NAV-05: "Collapsible 'Linked from (N)' section at the bottom of
 * atom detail view. Collapsed by default, expand to see linking atoms as compact cards."
 *
 * Implementation notes:
 *   - Backlinks computed as createMemo to track reactive state.atoms changes
 *   - props.atomId used directly (not destructured) inside the memo for SolidJS reactivity
 *   - Click on a backlink navigates to that atom via setSelectedAtomId
 *   - Collapsed by default
 *
 * CRITICAL: Never destructure props. Use props.atomId.
 */

import { Show, For, createMemo, createSignal } from 'solid-js';
import { state, setSelectedAtomId } from '../signals/store';
import { AtomTypeIcon } from './AtomTypeIcon';
import type { Atom } from '../../types/atoms';

// --- Props ---

interface BacklinksPanelProps {
  atomId: string;
}

// --- Helpers ---

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

// --- Component ---

export function BacklinksPanel(props: BacklinksPanelProps) {
  const [expanded, setExpanded] = createSignal(false);

  // Compute all atoms that have a link targeting props.atomId
  // Access props.atomId directly (not destructured) for SolidJS reactive tracking
  const backlinks = createMemo((): Atom[] => {
    return state.atoms.filter((a) =>
      a.links.some((l) => l.targetId === props.atomId),
    );
  });

  const count = createMemo(() => backlinks().length);

  return (
    <div class="backlinks-panel">
      {/* Header — clickable to toggle */}
      <button
        class="backlinks-header"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded()}
        aria-controls="backlinks-content"
      >
        <span class="backlinks-header-label">
          Linked from ({count()})
        </span>
        <span class="backlinks-header-chevron">
          {expanded() ? '▲' : '▼'}
        </span>
      </button>

      {/* Collapsible content */}
      <Show when={expanded()}>
        <div id="backlinks-content" class="backlinks-content">
          <Show
            when={count() > 0}
            fallback={
              <p class="backlinks-empty">No other atoms link to this one.</p>
            }
          >
            <For each={backlinks()}>
              {(backlinkAtom) => (
                <button
                  class="backlink-item"
                  onClick={() => setSelectedAtomId(backlinkAtom.id)}
                  title={`Navigate to: ${backlinkAtom.title || backlinkAtom.content.slice(0, 60)}`}
                >
                  <AtomTypeIcon type={backlinkAtom.type} size={14} />
                  <span class="backlink-item-title">
                    {backlinkAtom.title || backlinkAtom.content.slice(0, 60)}
                  </span>
                  <span class="backlink-item-time">
                    {relativeTime(backlinkAtom.updated_at)}
                  </span>
                </button>
              )}
            </For>
          </Show>
        </div>
      </Show>
    </div>
  );
}
