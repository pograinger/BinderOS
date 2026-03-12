/**
 * EntityCorrectionPopover: Inline correction UX for entity relationships.
 *
 * Displays inferred relationships for an entity with confidence percentages.
 * Allows the user to confirm or fix each relationship. User corrections save
 * as confidence 1.0 ground truth to the entity registry.
 *
 * Also shows a link to the entity's atom timeline (all atoms mentioning it).
 *
 * Props: entityId, entityName, entityType, atomId (context atom), onClose
 *
 * SolidJS gotcha: all callbacks are props or module-level functions.
 * NEVER store callbacks in createStore — proxy wrapping breaks function refs.
 *
 * Phase 29: ENTC-02, ENTC-05
 */

import { createSignal, createResource, For, Show, onCleanup } from 'solid-js';
import type { EntityRelation } from '../../types/intelligence';
import { db } from '../../storage/db';
import { correctRelationship, getEntityTimeline } from '../../storage/entity-helpers';

// --- Relationship options per entity type ---

const PER_RELATIONSHIPS = [
  { group: 'Family', types: ['spouse', 'parent', 'child', 'sibling'] },
  { group: 'Work', types: ['colleague', 'reports-to', 'client', 'mentor'] },
  { group: 'Service', types: ['healthcare-provider', 'accountant', 'lawyer', 'teacher', 'veterinarian'] },
  { group: 'Social', types: ['friend', 'neighbor'] },
];

const ORG_RELATIONSHIPS = ['works-at', 'org-member', 'client'];
const LOC_RELATIONSHIPS = ['lives-at', 'nearby'];

export interface EntityCorrectionPopoverProps {
  entityId: string;
  entityName: string;
  entityType: 'PER' | 'ORG' | 'LOC' | 'MISC';
  atomId: string;
  onClose: () => void;
}

export function EntityCorrectionPopover(props: EntityCorrectionPopoverProps) {
  const [fixingRelationId, setFixingRelationId] = createSignal<string | null>(null);
  const [customType, setCustomType] = createSignal('');
  const [showCustomInput, setShowCustomInput] = createSignal(false);
  const [saving, setSaving] = createSignal(false);

  // Load relations for this entity on mount
  const [relations] = createResource(
    () => props.entityId,
    async (entityId) => {
      const [asTarget, asSource] = await Promise.all([
        db.entityRelations.where('targetEntityId').equals(entityId).toArray(),
        db.entityRelations.where('sourceEntityId').equals(entityId).toArray(),
      ]);
      return [...asTarget, ...asSource];
    },
  );

  // Load atom timeline count
  const [timelineCount] = createResource(
    () => props.entityId,
    async (entityId) => {
      const ids = await getEntityTimeline(entityId);
      return ids.length;
    },
  );

  // Click-outside detection
  let wrapperRef: HTMLDivElement | undefined;

  function handleDocumentClick(e: MouseEvent) {
    if (wrapperRef && !wrapperRef.contains(e.target as Node)) {
      props.onClose();
    }
  }

  document.addEventListener('mousedown', handleDocumentClick);
  onCleanup(() => document.removeEventListener('mousedown', handleDocumentClick));

  // Handle Fix selection
  async function handleFix(relationId: string, newType: string) {
    setSaving(true);
    try {
      await correctRelationship(props.entityId, newType, props.atomId);
      setFixingRelationId(null);
      setShowCustomInput(false);
      props.onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleCustomFix(relationId: string) {
    const type = customType().trim();
    if (!type) return;
    await handleFix(relationId, type);
  }

  // Build relationship option list for this entity type
  function getRelationshipOptions(): { group?: string; types: string[] }[] {
    if (props.entityType === 'PER') return PER_RELATIONSHIPS;
    if (props.entityType === 'ORG') return [{ types: ORG_RELATIONSHIPS }];
    if (props.entityType === 'LOC') return [{ types: LOC_RELATIONSHIPS }];
    return [];
  }

  return (
    <div
      ref={wrapperRef}
      class="absolute z-50 mt-1 w-72 bg-white dark:bg-gray-900 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-3"
      role="dialog"
      aria-label={`Correct relationship for ${props.entityName}`}
    >
      {/* Header */}
      <div class="flex items-center justify-between mb-2">
        <div>
          <span class="font-medium text-sm text-gray-900 dark:text-gray-100">
            {props.entityName}
          </span>
          <span class="ml-2 text-xs text-gray-500 dark:text-gray-400">
            ({props.entityType})
          </span>
        </div>
        <button
          class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xs"
          onClick={() => props.onClose()}
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {/* Relations list */}
      <Show
        when={relations() && relations()!.length > 0}
        fallback={
          <p class="text-xs text-gray-500 dark:text-gray-400 italic mb-2">
            No relationships inferred yet.
          </p>
        }
      >
        <div class="space-y-1.5 mb-2">
          <For each={relations()}>
            {(rel: EntityRelation) => (
              <div class="text-xs">
                <div class="flex items-center justify-between gap-1">
                  <span class="text-gray-700 dark:text-gray-300">
                    <span class="font-medium">{rel.relationshipType}</span>
                    <span class="text-gray-400 ml-1">
                      ({Math.round(rel.confidence * 100)}%
                      {rel.sourceAttribution === 'user-correction' ? ', confirmed' : ''})
                    </span>
                  </span>
                  <div class="flex gap-1">
                    {/* Confirm (no-op close) */}
                    <button
                      class="px-1.5 py-0.5 rounded text-green-700 bg-green-50 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/50"
                      onClick={() => props.onClose()}
                      title="Confirm this relationship"
                    >
                      ✓
                    </button>
                    {/* Fix dropdown toggle */}
                    <button
                      class="px-1.5 py-0.5 rounded text-blue-700 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50"
                      onClick={() => setFixingRelationId(
                        fixingRelationId() === rel.id ? null : rel.id,
                      )}
                      title="Fix this relationship"
                    >
                      Fix
                    </button>
                  </div>
                </div>

                {/* Fix dropdown */}
                <Show when={fixingRelationId() === rel.id}>
                  <div class="mt-1.5 ml-2 border-l-2 border-blue-200 dark:border-blue-700 pl-2 space-y-0.5">
                    <For each={getRelationshipOptions()}>
                      {(group) => (
                        <>
                          <Show when={group.group}>
                            <p class="text-gray-400 dark:text-gray-500 text-xs font-medium mt-1">
                              {group.group}
                            </p>
                          </Show>
                          <For each={group.types}>
                            {(type) => (
                              <button
                                class="block w-full text-left px-1.5 py-0.5 rounded text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
                                onClick={() => handleFix(rel.id, type)}
                                disabled={saving()}
                              >
                                {type}
                              </button>
                            )}
                          </For>
                        </>
                      )}
                    </For>
                    {/* Other... */}
                    <button
                      class="block w-full text-left px-1.5 py-0.5 rounded text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                      onClick={() => setShowCustomInput(!showCustomInput())}
                    >
                      Other...
                    </button>
                    <Show when={showCustomInput()}>
                      <div class="flex gap-1 mt-1">
                        <input
                          class="flex-1 px-1.5 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                          placeholder="e.g. therapist"
                          value={customType()}
                          onInput={(e) => setCustomType(e.currentTarget.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void handleCustomFix(rel.id);
                          }}
                        />
                        <button
                          class="px-1.5 py-0.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                          onClick={() => void handleCustomFix(rel.id)}
                          disabled={saving() || !customType().trim()}
                        >
                          Save
                        </button>
                      </div>
                    </Show>
                  </div>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>

      {/* Entity timeline link */}
      <Show when={(timelineCount() ?? 0) > 0}>
        <div class="border-t border-gray-100 dark:border-gray-800 pt-2 mt-2">
          <button
            class="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            onClick={() => {
              // Navigate to filtered list view for this entity.
              // Sets a well-known URL hash that the search/list view interprets.
              window.location.hash = `#entity:${props.entityId}`;
              props.onClose();
            }}
          >
            See all {timelineCount()} atoms mentioning {props.entityName}
          </button>
        </div>
      </Show>
    </div>
  );
}
