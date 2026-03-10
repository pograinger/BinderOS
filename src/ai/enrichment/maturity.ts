/**
 * Maturity scoring for enriched atoms.
 *
 * Computes a 0-1 score based on how many enrichment categories have been
 * filled. Recognizes both MissingInfoCategory keys (e.g. 'missing-outcome')
 * and display keys (e.g. 'Outcome') to handle both raw and rendered forms.
 *
 * Pure module -- no store imports, no side effects.
 *
 * Phase 24: ENRICH-07
 */

import type { MissingInfoCategory } from '../clarification/types';

/** The five enrichment categories, ordered by GTD importance. */
export const MATURITY_CATEGORIES = [
  'outcome',
  'next-action',
  'timeframe',
  'context',
  'reference',
] as const;

/**
 * Map from MissingInfoCategory key to display key.
 * Matches the CATEGORY_DISPLAY_KEYS in clarification/enrichment.ts.
 */
const CATEGORY_KEY_MAP: Record<MissingInfoCategory, string> = {
  'missing-outcome': 'Outcome',
  'missing-next-action': 'Next Action',
  'missing-timeframe': 'Deadline',
  'missing-context': 'Context',
  'missing-reference': 'Reference',
};

/** Reverse map: display key -> MissingInfoCategory */
const DISPLAY_TO_CATEGORY: Record<string, MissingInfoCategory> = {};
for (const [cat, display] of Object.entries(CATEGORY_KEY_MAP)) {
  DISPLAY_TO_CATEGORY[display] = cat as MissingInfoCategory;
}

/** All MissingInfoCategory keys as a Set for fast lookup. */
const CATEGORY_KEYS = new Set<string>(Object.keys(CATEGORY_KEY_MAP));

/** All display keys as a Set for fast lookup. */
const DISPLAY_KEYS = new Set<string>(Object.values(CATEGORY_KEY_MAP));

/**
 * Compute the maturity score (0-1) from an enrichments record.
 *
 * Checks both MissingInfoCategory keys and display keys. If both forms
 * of the same category are present, it counts only once.
 *
 * @param enrichments - Key-value map from parseEnrichment() or similar
 * @returns Ratio of filled categories to total (5)
 */
export function computeMaturity(enrichments: Record<string, string>): number {
  const total = MATURITY_CATEGORIES.length; // 5
  const filledCategories = new Set<string>();

  for (const key of Object.keys(enrichments)) {
    if (CATEGORY_KEYS.has(key)) {
      // It's a MissingInfoCategory key like 'missing-outcome'
      filledCategories.add(key);
    } else if (DISPLAY_KEYS.has(key)) {
      // It's a display key like 'Outcome' -- map to category
      const cat = DISPLAY_TO_CATEGORY[key];
      if (cat) filledCategories.add(cat);
    }
    // Unrecognized keys are ignored
  }

  if (filledCategories.size === 0) return 0;
  return filledCategories.size / total;
}
