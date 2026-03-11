/**
 * EntityBadges: Color-coded entity chips for atom detail views.
 *
 * Renders PER (blue), ORG (amber), LOC (green), MISC (gray) badges
 * sorted by confidence descending. DATE badges are hidden (rarely identity-meaningful).
 * Shows top N (default 5) with "+N more" overflow chip.
 *
 * Phase 27: ENTR-05
 */

import { Show, For, createSignal, createMemo } from 'solid-js';
import type { EntityMention } from '../../types/intelligence';

const TYPE_COLORS: Record<string, string> = {
  PER: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  ORG: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  LOC: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  MISC: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
};

const TYPE_LABELS: Record<string, string> = {
  PER: 'Person',
  ORG: 'Organization',
  LOC: 'Location',
  MISC: 'Other',
};

export interface EntityBadgesProps {
  mentions: EntityMention[];
  maxVisible?: number;
}

export function EntityBadges(props: EntityBadgesProps) {
  const [expanded, setExpanded] = createSignal(false);

  const maxVisible = () => props.maxVisible ?? 5;

  // Deduplicate by entityText (case-insensitive, keep highest confidence),
  // filter out DATE, sort by confidence descending.
  const sorted = createMemo(() => {
    const seen = new Map<string, EntityMention>();
    for (const m of props.mentions) {
      if (m.entityType === 'DATE') continue;
      const key = m.entityText.toLowerCase();
      const existing = seen.get(key);
      if (!existing || m.confidence > existing.confidence) {
        seen.set(key, m);
      }
    }
    return Array.from(seen.values()).sort((a, b) => b.confidence - a.confidence);
  });

  const visible = createMemo(() =>
    expanded() ? sorted() : sorted().slice(0, maxVisible()),
  );

  const overflowCount = createMemo(() =>
    Math.max(0, sorted().length - maxVisible()),
  );

  return (
    <Show when={sorted().length > 0}>
      <div class="flex flex-wrap gap-1.5 mt-2">
        <For each={visible()}>
          {(mention) => (
            <span
              class={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[mention.entityType] ?? TYPE_COLORS.MISC}`}
              title={`${TYPE_LABELS[mention.entityType] ?? mention.entityType} (${Math.round(mention.confidence * 100)}%)`}
            >
              {mention.entityText}
            </span>
          )}
        </For>
        <Show when={!expanded() && overflowCount() > 0}>
          <button
            class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600"
            onClick={() => setExpanded(true)}
            title="Show all entities"
          >
            +{overflowCount()} more
          </button>
        </Show>
        <Show when={expanded() && overflowCount() > 0}>
          <button
            class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600"
            onClick={() => setExpanded(false)}
            title="Show fewer"
          >
            show less
          </button>
        </Show>
      </div>
    </Show>
  );
}
