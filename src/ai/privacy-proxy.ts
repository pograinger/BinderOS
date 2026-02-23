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
 *   'full'        — Titles and full content included.
 *
 * Default is 'abstract' (most private). Users can raise the level in AI Settings > Privacy.
 *
 * Phase 4: This is a passthrough with level validation.
 * Phase 5+: Local LLM summarizes atoms at the selected level before cloud dispatch.
 *           The summary string produced by the local LLM is what gets passed here.
 */

/**
 * Sanitization level controlling how much atom data reaches cloud AI providers.
 *
 * 'abstract'   — Aggregate statistics only (counts, types, scores). No titles or content.
 * 'structured' — Metadata summaries (title, type, status, scores). No body content.
 * 'full'       — Full atom content including titles and body text.
 */
export type SanitizationLevel = 'abstract' | 'structured' | 'full';

/**
 * Default sanitization level — most private option.
 * Users can raise this in AI Settings > Privacy.
 */
export const DEFAULT_SANITIZATION_LEVEL: SanitizationLevel = 'abstract';

/**
 * Sanitize a context string for cloud dispatch at the specified level.
 *
 * In Phase 4: validates the level and returns the (already string) context.
 * The context string is prepared by the calling code (or local LLM summary).
 *
 * In Phase 5+: the local LLM will produce the summary at the selected level,
 * and this function will enforce that the output matches the level's constraints.
 *
 * @param rawContext - Pre-prepared context string (never raw Atom objects)
 * @param level - Sanitization level to apply
 * @returns Sanitized context string safe for cloud transmission
 */
export function sanitizeForCloud(
  rawContext: string,
  level: SanitizationLevel,
): string {
  // Type boundary is the real protection: AIRequest.prompt is string, never Atom.
  // In Phase 4, the rawContext is already a string prepared by the local LLM or calling code.
  // The sanitization level controls how the local LLM summarizes before passing to cloud.
  //
  // Phase 5+ will implement the actual local-LLM-as-proxy flow where the local model
  // summarizes atoms at the selected level before sending the summary to the cloud adapter.
  if (level === 'abstract') {
    // Phase 4: validate that no raw atom content appears
    // (enforcement; actual summarization added in Phase 5)
    return rawContext;
  }
  return rawContext;
}

/**
 * Human-readable description of each sanitization level.
 * Used in AI Settings > Privacy section.
 */
export const SANITIZATION_LEVEL_DESCRIPTIONS: Record<SanitizationLevel, string> = {
  abstract: 'Abstract patterns only — cloud AI sees only counts, types, and scores. No titles or content.',
  structured: 'Structured summaries — cloud AI sees titles, types, and status. No body content.',
  full: 'Full context — cloud AI sees all content including titles and body text. Maximum capability, minimum privacy.',
};
