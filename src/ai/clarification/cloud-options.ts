/**
 * Cloud option generation for clarification questions.
 *
 * Tier-adaptive: generates enhanced options via cloud AI when available,
 * with a 2-second timeout. Returns null on timeout/error — caller falls
 * back to template-based options from question-templates.ts.
 *
 * Pure module — no store imports. Cloud adapter accessed via dispatchAI.
 *
 * Phase 19: CLAR-05, CLAR-06
 */

import type { MissingInfoCategory } from './types';
import { dispatchAI } from '../router';

/** Human-readable labels for prompt construction. */
const CATEGORY_PROMPTS: Record<MissingInfoCategory, string> = {
  'missing-outcome': 'desired outcome or end result',
  'missing-next-action': 'concrete next physical action',
  'missing-timeframe': 'deadline, due date, or timeframe',
  'missing-context': 'relevant context, project, or area of responsibility',
  'missing-reference': 'reference material, link, person, or resource needed',
};

/**
 * Generate cloud-enhanced clarification options for a single category.
 *
 * Builds a sanitized prompt (no raw personal data beyond the atom content itself),
 * dispatches via dispatchAI with a 2-second timeout, and parses the response
 * as a JSON array of 3-4 option strings.
 *
 * @param category - Which missing-info category to generate options for
 * @param atomContent - The atom's content text (for context)
 * @param atomType - The atom's type (task, decision, etc.)
 * @param signal - Optional external AbortSignal for cancellation
 * @returns Array of 3-4 option strings, or null on timeout/error/cloud unavailable
 */
export async function generateCloudOptions(
  category: MissingInfoCategory,
  atomContent: string,
  atomType: string,
  signal?: AbortSignal,
): Promise<string[] | null> {
  // Create a 2-second timeout AbortController that also respects external signal
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), 2000);

  // If external signal aborts, propagate to our controller
  const onExternalAbort = () => timeoutController.abort();
  signal?.addEventListener('abort', onExternalAbort, { once: true });

  try {
    const categoryDesc = CATEGORY_PROMPTS[category];

    const prompt = `You are a productivity assistant helping a user clarify a ${atomType} they captured.

The ${atomType} says: "${atomContent}"

This item is missing a clear ${categoryDesc}.

Generate exactly 3 short, specific options the user might choose to fill in the ${categoryDesc}. Each option should be a complete, actionable phrase (not a question). Keep each under 60 characters.

Respond with ONLY a JSON array of strings, no explanation:
["option 1", "option 2", "option 3"]`;

    const response = await dispatchAI({
      requestId: crypto.randomUUID(),
      prompt,
      maxTokens: 150,
      signal: timeoutController.signal,
    });

    // Parse response as JSON array
    const match = response.text.match(/\[[\s\S]*\]/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]) as unknown;
    if (!Array.isArray(parsed)) return null;

    // Validate and filter: must be strings, max 4 options
    const options = parsed
      .filter((item): item is string => typeof item === 'string' && item.length > 0)
      .slice(0, 4);

    return options.length >= 2 ? options : null;
  } catch {
    // Timeout, network error, no adapter, or parse failure — all return null
    return null;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener('abort', onExternalAbort);
  }
}

/**
 * Prefetch cloud options for multiple categories in parallel.
 *
 * Initiates cloud option generation for each category with its own AbortController.
 * Returns a Map of category -> Promise for lazy consumption by the UI.
 *
 * Only call when cloud is available and completeness confidence is high (>0.85).
 * Caller is responsible for aborting unused prefetches on modal close.
 *
 * @param categories - Which categories to prefetch options for
 * @param atomContent - The atom's content text
 * @param atomType - The atom's type
 * @returns Map of category -> Promise<string[] | null>, plus abort controllers
 */
export function prefetchCloudOptions(
  categories: MissingInfoCategory[],
  atomContent: string,
  atomType: string,
): Map<MissingInfoCategory, Promise<string[] | null>> {
  const prefetchMap = new Map<MissingInfoCategory, Promise<string[] | null>>();

  for (const category of categories) {
    // Each category gets its own independent promise
    prefetchMap.set(
      category,
      generateCloudOptions(category, atomContent, atomType),
    );
  }

  return prefetchMap;
}
