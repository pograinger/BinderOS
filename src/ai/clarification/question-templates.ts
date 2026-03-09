/**
 * Template-based option generation for clarification questions.
 *
 * Loads question templates from binder config and applies slot-filling
 * to generate context-aware ClarificationQuestion instances.
 *
 * Pure module — no store imports. All state passed by caller.
 *
 * Phase 19: CLAR-09
 */

import { getBinderConfig } from '../../config/binder-types/index';
import type { ClarificationQuestion, MissingInfoCategory } from './types';

/** Human-readable labels for each category. */
const CATEGORY_LABELS: Record<MissingInfoCategory, string> = {
  'missing-outcome': 'outcome',
  'missing-next-action': 'next action',
  'missing-timeframe': 'timeframe',
  'missing-context': 'context',
  'missing-reference': 'reference',
};

/**
 * Apply slot-filling to a template string.
 * Replaces {topic}, {person}, {location} placeholders with extracted values.
 * Unknown placeholders are replaced with generic fallback text.
 */
function fillSlots(template: string, slots: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(slots)) {
    result = result.replaceAll(`{${key}}`, value);
  }
  // Replace any remaining unfilled placeholders with "this"
  result = result.replace(/\{topic\}/g, 'this');
  result = result.replace(/\{person\}/g, 'someone');
  result = result.replace(/\{location\}/g, 'somewhere');
  return result;
}

/**
 * Generate a ClarificationQuestion from binder config templates.
 *
 * @param category - Which missing-info category to generate for
 * @param atomType - The atom's type (task, decision, etc.) for type-specific options
 * @param slots - Extracted slot values for placeholder filling ({topic}, {person}, etc.)
 * @param binderType - Optional binder type slug (defaults to 'gtd-personal')
 * @returns A fully populated ClarificationQuestion with slot-filled options
 */
export function generateTemplateOptions(
  category: MissingInfoCategory,
  atomType: string,
  slots: Record<string, string>,
  binderType?: string,
): ClarificationQuestion {
  const config = getBinderConfig(binderType);
  const templateEntry = config.questionTemplates[category];

  if (!templateEntry) {
    // Fallback for unknown category — should not happen with well-formed config
    return {
      category,
      questionText: `Tell us more about the ${CATEGORY_LABELS[category] ?? category}:`,
      options: [],
      categoryLabel: CATEGORY_LABELS[category] ?? category,
    };
  }

  // Select options: prefer atom-type-specific, fall back to _default
  const rawOptions = templateEntry.options[atomType] ?? templateEntry.options['_default'] ?? [];

  // Apply slot-filling and filter out {freeform} placeholder
  const filledOptions = rawOptions
    .filter((opt) => opt !== '{freeform}')
    .map((opt) => fillSlots(opt, slots));

  return {
    category,
    questionText: fillSlots(templateEntry.question, slots),
    options: filledOptions,
    categoryLabel: CATEGORY_LABELS[category] ?? category,
  };
}
