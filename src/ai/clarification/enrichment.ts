/**
 * Atom content enrichment from clarification answers.
 *
 * Appends structured key:value lines below a `\n---\n` separator.
 * Provides a parser to split enriched content back into original + enrichments.
 *
 * Pure module — no store imports. All state passed by caller.
 *
 * Phase 19: CLAR-07
 */

import type { ClarificationAnswer, MissingInfoCategory } from './types';

/** Map from category to human-readable display key for enrichment lines. */
const CATEGORY_DISPLAY_KEYS: Record<MissingInfoCategory, string> = {
  'missing-outcome': 'Outcome',
  'missing-next-action': 'Next Action',
  'missing-timeframe': 'Deadline',
  'missing-context': 'Context',
  'missing-reference': 'Reference',
};

const ENRICHMENT_SEPARATOR = '\n---\n';

/**
 * Append answered clarification data as structured key:value lines.
 *
 * Skipped answers are not included. For each non-skipped answer,
 * the value is either the selected option or the freeform text.
 *
 * @param originalContent - The atom's current content (may already have enrichments)
 * @param answers - Clarification answers to append
 * @returns The enriched content string
 */
export function appendEnrichment(
  originalContent: string,
  answers: ClarificationAnswer[],
): string {
  const newLines: string[] = [];

  for (const answer of answers) {
    if (answer.wasSkipped) continue;

    const key = CATEGORY_DISPLAY_KEYS[answer.category] ?? answer.category;
    const value = answer.wasFreeform ? answer.freeformText : answer.selectedOption;

    if (value) {
      newLines.push(`${key}: ${value}`);
    }
  }

  if (newLines.length === 0) return originalContent;

  // If content already has an enrichment section, append to it
  const separatorIndex = originalContent.indexOf(ENRICHMENT_SEPARATOR);
  if (separatorIndex !== -1) {
    return originalContent + '\n' + newLines.join('\n');
  }

  return originalContent + ENRICHMENT_SEPARATOR + newLines.join('\n');
}

/**
 * Parse enriched content back into original text and enrichment key:value pairs.
 *
 * @param content - The full content string (possibly enriched)
 * @returns Object with `original` text and `enrichments` map
 */
export function parseEnrichment(
  content: string,
): { original: string; enrichments: Record<string, string> } {
  const separatorIndex = content.indexOf(ENRICHMENT_SEPARATOR);

  if (separatorIndex === -1) {
    return { original: content, enrichments: {} };
  }

  const original = content.slice(0, separatorIndex);
  const enrichmentSection = content.slice(separatorIndex + ENRICHMENT_SEPARATOR.length);
  const enrichments: Record<string, string> = {};

  for (const line of enrichmentSection.split('\n')) {
    const colonIndex = line.indexOf(': ');
    if (colonIndex !== -1) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 2).trim();
      if (key && value) {
        enrichments[key] = value;
      }
    }
  }

  return { original, enrichments };
}
