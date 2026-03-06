/**
 * Privacy proxy — sanitization layer between atom store and cloud AI adapters.
 *
 * CRITICAL ARCHITECTURAL BOUNDARY (CONTEXT.md):
 *   Local LLMs have direct access to atoms (trusted, on-device).
 *   Cloud/remote LLMs NEVER see raw atom data.
 *
 * The type boundary is the primary enforcement mechanism:
 *   CloudAdapter.execute() accepts AIRequest with prompt: string, never Atom objects.
 *   Atoms cannot flow to the cloud by type — this file provides the runtime enforcement layer.
 *
 * Sanitization levels (user-controlled per CONTEXT.md):
 *   'abstract'    — Only counts, types, scores. E.g., "15 tasks, 3 stale. Entropy: yellow."
 *   'structured'  — Metadata without content. E.g., title, type, status, scores — no body text.
 *   'full'        — Full context with automatic PII pseudonymization via NER + regex.
 *
 * Default is 'full' (NER pseudonymization active). Users can lower the level in AI Settings > Privacy.
 *
 * Phase 14: sanitizeForCloud returns Promise<SanitizedResult> at 'full' level,
 * running NER + regex PII detection and pseudonymization via the sanitization pipeline.
 */

import type { SanitizedResult } from './sanitization/types';
import { createSanitizedPrompt } from './sanitization/types';
import { sanitizeText } from './sanitization/sanitizer';

/**
 * Sanitization level controlling how much atom data reaches cloud AI providers.
 *
 * 'abstract'   — Aggregate statistics only (counts, types, scores). No titles or content.
 * 'structured' — Metadata summaries (title, type, status, scores). No body content.
 * 'full'       — Full atom content with automatic PII pseudonymization.
 */
export type SanitizationLevel = 'abstract' | 'structured' | 'full';

/**
 * Default sanitization level — full context with NER pseudonymization.
 * Users can lower this in AI Settings > Privacy.
 */
export const DEFAULT_SANITIZATION_LEVEL: SanitizationLevel = 'full';

/**
 * Sanitize a context string for cloud dispatch at the specified level.
 *
 * At 'full' level: runs NER + regex PII detection, replaces entities with
 * pseudonym tags, returns SanitizedResult with entity maps for de-pseudonymization.
 *
 * At 'abstract' and 'structured' levels: wraps text as-is in SanitizedPrompt
 * (these levels already strip sensitive content before reaching this function).
 *
 * @param rawContext - Pre-prepared context string (never raw Atom objects)
 * @param level - Sanitization level to apply
 * @returns SanitizedResult with sanitized prompt and entity maps
 */
export async function sanitizeForCloud(
  rawContext: string,
  level: SanitizationLevel,
): Promise<SanitizedResult> {
  if (level === 'full') {
    // NER + regex pseudonymization
    return sanitizeText(rawContext);
  }

  // Abstract and structured levels: content already stripped by caller
  // Wrap as-is in SanitizedPrompt with empty entity maps
  return {
    prompt: createSanitizedPrompt(rawContext),
    entities: [],
    entityMap: new Map(),
    reverseMap: new Map(),
  };
}

/**
 * Human-readable description of each sanitization level.
 * Used in AI Settings > Privacy section.
 */
export const SANITIZATION_LEVEL_DESCRIPTIONS: Record<SanitizationLevel, string> = {
  abstract: 'Abstract patterns only — cloud AI sees only counts, types, and scores. No titles or content.',
  structured: 'Structured summaries — cloud AI sees titles, types, and status. No body content.',
  full: 'Full context with automatic PII pseudonymization — names, locations, and sensitive data are replaced with anonymous tags before cloud dispatch.',
};
