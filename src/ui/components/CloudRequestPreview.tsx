/**
 * CloudRequestPreview — Pre-send review modal for cloud AI requests.
 *
 * Shows the user exactly what data is about to leave the device before each cloud request.
 * User can approve (send) or cancel (abort the request).
 *
 * Phase 14 additions:
 * - Entity count badge showing number of redacted entities
 * - Expandable entity mapping table (pseudonym -> real text, collapsed by default)
 * - Per-entity restore toggle (calls setRestorePreference to persist across sessions)
 * - Pseudonym tag highlighting in the prompt display
 * - Warning when entities are marked for restore (un-redaction)
 *
 * This component is rendered by Shell.tsx when state.pendingCloudRequest is set.
 * The CloudAdapter.execute() method awaits the user's decision via a Promise<boolean>
 * resolved by onApprove/onCancel callbacks.
 *
 * CONTEXT.md locked decision:
 *   "every cloud request shows a preview of what the local LLM is sending.
 *    User can see exactly what data leaves the device and can cancel before sending."
 *
 * CRITICAL: Never destructure props — breaks SolidJS reactivity.
 */

import { createSignal, createMemo, For, Show } from 'solid-js';
import type { CloudRequestLogEntry } from '../../ai/key-vault';
import type { DetectedEntity, EntityCategory } from '../../ai/sanitization/types';
import { setRestorePreference } from '../../ai/sanitization/entity-registry';

interface CloudRequestPreviewProps {
  entry: CloudRequestLogEntry;
  entities?: DetectedEntity[];
  entityMap?: Map<string, string>;
  onApprove: () => void;
  onCancel: () => void;
}

/** Map entity category to CSS class suffix for color coding */
function categoryClass(category: EntityCategory): string {
  return `entity-cat-${category.toLowerCase()}`;
}

export function CloudRequestPreview(props: CloudRequestPreviewProps) {
  const [mapExpanded, setMapExpanded] = createSignal(false);
  const [restoredEntities, setRestoredEntities] = createSignal<Set<string>>(new Set());

  function formatTimestamp(ts: number): string {
    return new Date(ts).toLocaleString();
  }

  /** Build entries from entityMap for the mapping table */
  const mapEntries = createMemo(() => {
    const map = props.entityMap;
    if (!map || map.size === 0) return [];
    const entries: Array<{ pseudonym: string; realText: string; category: EntityCategory }> = [];
    for (const [pseudonym, realText] of map) {
      // Extract category from pseudonym tag like "<Person 1>"
      const match = pseudonym.match(/^<(Person|Location|Financial|Contact|Credential)\s+\d+>$/);
      if (match) {
        const catMap: Record<string, EntityCategory> = {
          Person: 'PERSON',
          Location: 'LOCATION',
          Financial: 'FINANCIAL',
          Contact: 'CONTACT',
          Credential: 'CREDENTIAL',
        };
        entries.push({ pseudonym, realText, category: catMap[match[1]!]! });
      } else {
        entries.push({ pseudonym, realText, category: 'PERSON' });
      }
    }
    return entries;
  });

  const entityCount = createMemo(() => {
    const entities = props.entities;
    return entities ? entities.length : 0;
  });

  const restoredCount = createMemo(() => restoredEntities().size);

  /** Highlight pseudonym tags in the prompt text with colored spans */
  const highlightedPrompt = createMemo(() => {
    const text = props.entry.sanitizedPrompt as string;
    // Replace <Category N> with highlighted spans
    return text.replace(
      /<(Person|Location|Financial|Contact|Credential)\s+\d+>/g,
      (match, cat) => {
        const cls = `pseudonym-highlight entity-cat-${(cat as string).toLowerCase()}`;
        return `<span class="${cls}">${match.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>`;
      },
    );
  });

  async function handleRestore(realText: string, category: EntityCategory) {
    const key = `${realText}::${category}`;
    const current = restoredEntities();
    const isRestored = current.has(key);

    // Toggle restore preference
    await setRestorePreference(realText, category, !isRestored);

    const next = new Set(current);
    if (isRestored) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setRestoredEntities(next);
  }

  function isEntityRestored(realText: string, category: EntityCategory): boolean {
    return restoredEntities().has(`${realText}::${category}`);
  }

  return (
    <>
      {/* Backdrop -- clicking it cancels */}
      <div
        class="cloud-preview-backdrop"
        onClick={() => props.onCancel()}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        class="cloud-preview-container"
        role="dialog"
        aria-label="Cloud Request Preview"
        aria-modal="true"
      >
        {/* Header */}
        <div class="cloud-preview-header">
          <h2 class="cloud-preview-title">Cloud Request Preview</h2>
        </div>

        {/* Info */}
        <p class="cloud-preview-info">
          The following data will be sent to{' '}
          <strong>{props.entry.provider}</strong>. Review before sending.
        </p>

        {/* Metadata */}
        <div class="cloud-preview-meta">
          <div class="cloud-preview-meta-row">
            <span class="cloud-preview-meta-label">Provider:</span>
            <span class="cloud-preview-meta-value">{props.entry.provider}</span>
          </div>
          <div class="cloud-preview-meta-row">
            <span class="cloud-preview-meta-label">Model:</span>
            <span class="cloud-preview-meta-value">{props.entry.model}</span>
          </div>
          <div class="cloud-preview-meta-row">
            <span class="cloud-preview-meta-label">Time:</span>
            <span class="cloud-preview-meta-value">
              {formatTimestamp(props.entry.timestamp)}
            </span>
          </div>
          <Show when={props.entry.baseURL !== undefined}>
            <div class="cloud-preview-meta-row">
              <span class="cloud-preview-meta-label">Endpoint:</span>
              <span class="cloud-preview-meta-value cloud-preview-url">{props.entry.baseURL}</span>
            </div>
          </Show>
        </div>

        {/* Entity count badge */}
        <div class="entity-count-badge-row">
          <Show
            when={entityCount() > 0}
            fallback={<span class="entity-count-badge entity-count-none">No entities detected</span>}
          >
            <span class="entity-count-badge">{entityCount()} {entityCount() === 1 ? 'entity' : 'entities'} redacted</span>
          </Show>
        </div>

        {/* Data preview with highlighted pseudonyms */}
        <div class="cloud-preview-data-label">Data being sent:</div>
        <div class="cloud-preview-data">
          <pre class="cloud-preview-prompt" innerHTML={highlightedPrompt()} />
        </div>

        {/* Entity mapping table (expandable) */}
        <Show when={entityCount() > 0}>
          <button
            class="entity-map-toggle"
            onClick={() => setMapExpanded(!mapExpanded())}
          >
            <span class="entity-map-toggle-arrow">{mapExpanded() ? '\u25BC' : '\u25B6'}</span>
            {mapExpanded() ? 'Hide entity map' : 'Show entity map'}
          </button>

          <Show when={mapExpanded()}>
            <table class="entity-map-table">
              <thead>
                <tr>
                  <th>Pseudonym</th>
                  <th>Real Value</th>
                  <th>Category</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                <For each={mapEntries()}>
                  {(entry) => {
                    const restored = () => isEntityRestored(entry.realText, entry.category);
                    return (
                      <tr class={restored() ? 'entity-map-restored' : ''}>
                        <td>
                          <span class={`entity-map-pseudonym ${categoryClass(entry.category)}`}>
                            {entry.pseudonym}
                          </span>
                        </td>
                        <td class="entity-map-real">{entry.realText}</td>
                        <td>
                          <span class={`entity-map-category ${categoryClass(entry.category)}`}>
                            {entry.category}
                          </span>
                        </td>
                        <td>
                          <button
                            class={`entity-map-restore-btn ${restored() ? 'entity-map-restore-active' : ''}`}
                            onClick={() => handleRestore(entry.realText, entry.category)}
                          >
                            {restored() ? 'Restored' : 'Restore'}
                          </button>
                        </td>
                      </tr>
                    );
                  }}
                </For>
              </tbody>
            </table>
          </Show>

          {/* Restore warning */}
          <Show when={restoredCount() > 0}>
            <p class="entity-restore-warning">
              {restoredCount()} {restoredCount() === 1 ? 'entity' : 'entities'} will be sent un-redacted to the cloud
            </p>
          </Show>
        </Show>

        {/* Footer */}
        <div class="cloud-preview-footer">
          <button
            class="cloud-preview-btn cloud-preview-btn-cancel"
            onClick={() => props.onCancel()}
          >
            Cancel
          </button>
          <button
            class="cloud-preview-btn cloud-preview-btn-approve"
            onClick={() => props.onApprove()}
          >
            Send to Cloud
          </button>
        </div>

        {/* Note */}
        <p class="cloud-preview-note">
          You can disable this preview in AI Settings &gt; Privacy.
        </p>
      </div>
    </>
  );
}
