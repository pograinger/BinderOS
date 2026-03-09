/**
 * Self-learning option ranking for clarification questions.
 *
 * Pure module -- no store imports. All state passed by caller.
 *
 * - rankOptions: sorts template options by selection frequency (most-selected first)
 * - getSkipPatterns: counts how often each category is skipped
 * - shouldDeprioritizeCategory: returns true if a category is skipped >70% of the time
 *
 * Phase 19: CLAR-06
 */

import type { MissingInfoCategory } from './types';
import type { ClassificationEvent } from '../../storage/classification-log';

/** Minimum freeform occurrences before promoting to option list. */
const FREEFORM_PROMOTION_THRESHOLD = 3;

/**
 * Rank template options by historical selection frequency.
 *
 * - Filters history to clarification events matching this category
 * - Counts how often each option was selected
 * - Sorts: most-selected first, then unranked options in original order
 * - Freeform entries appearing 3+ times get appended (for JSONL export awareness)
 * - Cold start (no history): returns defaultOptions unchanged
 */
export function rankOptions(
  category: MissingInfoCategory,
  defaultOptions: string[],
  history: ClassificationEvent[],
): string[] {
  // Filter to clarification events for this category
  const relevant = history.filter(
    (e) => e.clarificationType === 'clarification' && e.detectedCategory === category,
  );

  if (relevant.length === 0) return defaultOptions;

  // Count frequency of each selected option
  const freq = new Map<string, number>();
  const freeformFreq = new Map<string, number>();

  for (const event of relevant) {
    if (event.optionSelected) {
      freq.set(event.optionSelected, (freq.get(event.optionSelected) ?? 0) + 1);
    }
    if (event.wasFreeform && event.freeformText) {
      const normalized = event.freeformText.trim().toLowerCase();
      freeformFreq.set(normalized, (freeformFreq.get(normalized) ?? 0) + 1);
    }
  }

  // Split default options into ranked (have history) and unranked
  const ranked: Array<{ option: string; count: number }> = [];
  const unranked: string[] = [];

  for (const option of defaultOptions) {
    const count = freq.get(option) ?? 0;
    if (count > 0) {
      ranked.push({ option, count });
    } else {
      unranked.push(option);
    }
  }

  // Sort ranked by frequency descending
  ranked.sort((a, b) => b.count - a.count);

  // Combine: ranked first, then unranked in original order
  const result = [...ranked.map((r) => r.option), ...unranked];

  // Promote frequently-typed freeform entries (append, not replace)
  const defaultSet = new Set(defaultOptions.map((o) => o.toLowerCase()));
  for (const [text, count] of freeformFreq) {
    if (count >= FREEFORM_PROMOTION_THRESHOLD && !defaultSet.has(text)) {
      // Use the original-cased version from the most recent event
      const original = relevant
        .filter((e) => e.wasFreeform && e.freeformText?.trim().toLowerCase() === text)
        .pop()?.freeformText?.trim();
      if (original && !result.includes(original)) {
        result.push(original);
      }
    }
  }

  return result;
}

/**
 * Count how many times each category was skipped.
 *
 * A skip is defined as: optionSelected === null AND wasFreeform === false.
 */
export function getSkipPatterns(
  history: ClassificationEvent[],
): Record<MissingInfoCategory, number> {
  const patterns: Record<string, number> = {
    'missing-outcome': 0,
    'missing-next-action': 0,
    'missing-timeframe': 0,
    'missing-context': 0,
    'missing-reference': 0,
  };

  for (const event of history) {
    if (
      event.clarificationType === 'clarification' &&
      event.detectedCategory &&
      event.optionSelected === null &&
      !event.wasFreeform
    ) {
      const cat = event.detectedCategory;
      if (cat in patterns && patterns[cat] !== undefined) {
        patterns[cat] = patterns[cat] + 1;
      }
    }
  }

  return patterns as Record<MissingInfoCategory, number>;
}

/**
 * Determine if a category should be deprioritized (moved to end of question list).
 *
 * Deprioritize when:
 * - totalClarifications > 5 (enough data to judge)
 * - skip rate for this category exceeds 70%
 */
export function shouldDeprioritizeCategory(
  category: MissingInfoCategory,
  skipPatterns: Record<MissingInfoCategory, number>,
  totalClarifications: number,
): boolean {
  if (totalClarifications <= 5) return false;

  const skipCount = skipPatterns[category];
  if (skipCount === undefined) return false;
  const skipRate = skipCount / totalClarifications;
  return skipRate > 0.7;
}
