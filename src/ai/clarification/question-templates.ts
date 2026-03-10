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

/**
 * Generate a follow-up ClarificationQuestion for iterative enrichment deepening.
 *
 * Uses followUpTemplates from binder config when available, otherwise falls back
 * to a generic follow-up referencing the prior answer.
 *
 * @param category - Which missing-info category to deepen
 * @param atomType - The atom's type for type-specific option selection
 * @param priorAnswer - The user's previous answer for this category
 * @param depth - Current enrichment depth for this category
 * @param slots - Extracted slot values for placeholder filling
 * @param binderType - Optional binder type slug (defaults to 'gtd-personal')
 * @returns A ClarificationQuestion with prior-answer-aware text and options
 */
export function generateFollowUpOptions(
  category: MissingInfoCategory,
  atomType: string,
  priorAnswer: string,
  depth: number,
  slots: Record<string, string>,
  binderType?: string,
): ClarificationQuestion {
  const config = getBinderConfig(binderType);
  const followUp = config.followUpTemplates?.[category];

  const allSlots = { ...slots, prior_answer: priorAnswer };

  if (!followUp) {
    // Generic fallback when no followUpTemplates configured
    return {
      category,
      questionText: `You said "${priorAnswer}" for ${CATEGORY_LABELS[category] ?? category}. Can you elaborate?`,
      options: [
        `More details about "${priorAnswer}"`,
        `Actually, let me change this`,
      ],
      categoryLabel: CATEGORY_LABELS[category] ?? category,
    };
  }

  // Support depth-tiered templates: if `tiers` array exists, pick by depth index.
  // depth=1 → tiers[0], depth=2 → tiers[1], etc. Falls back to last tier if depth exceeds array.
  // Legacy format (single question/options) used when no tiers array present.
  let templateEntry: { question: string; options: Record<string, string[]> };

  if (Array.isArray(followUp.tiers) && followUp.tiers.length > 0) {
    const tierIndex = Math.min(depth - 1, followUp.tiers.length - 1);
    templateEntry = followUp.tiers[tierIndex];
  } else {
    templateEntry = followUp as { question: string; options: Record<string, string[]> };
  }

  // Select options: prefer atom-type-specific, fall back to _default
  const rawOptions = templateEntry.options[atomType] ?? templateEntry.options['_default'] ?? [];

  // Apply slot-filling and filter out {freeform} placeholder
  const filledOptions = rawOptions
    .filter((opt) => opt !== '{freeform}')
    .map((opt) => fillSlots(opt, allSlots));

  return {
    category,
    questionText: fillSlots(templateEntry.question, allSlots),
    options: filledOptions,
    categoryLabel: CATEGORY_LABELS[category] ?? category,
  };
}
