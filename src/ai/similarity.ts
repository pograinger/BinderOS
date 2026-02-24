/**
 * Keyword similarity for finding related atoms (AITG-04).
 *
 * Reuses the Jaccard keyword overlap approach from classification-log.ts.
 * This module is pure — no imports from store.ts or reactive state.
 * The caller passes atoms in directly.
 *
 * Phase 5: Extracted as a standalone utility so triage.ts can call it
 * from the main thread without coupling to the classification log.
 */

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
  'shall', 'can', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into',
  'through', 'during', 'before', 'after', 'above', 'below', 'between', 'and', 'but', 'or', 'not',
  'no', 'nor', 'so', 'yet', 'this', 'that', 'these', 'those', 'it', 'its',
]);

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function keywordSimilarity(a: string, b: string): number {
  const kwA = new Set(extractKeywords(a));
  const kwB = new Set(extractKeywords(b));
  if (kwA.size === 0 || kwB.size === 0) return 0;
  let intersection = 0;
  for (const w of kwA) {
    if (kwB.has(w)) intersection++;
  }
  return intersection / (kwA.size + kwB.size - intersection); // Jaccard
}

/**
 * Find atoms semantically related to the given content using Jaccard keyword similarity.
 *
 * @param content - Content of the item being triaged (inbox item content + title)
 * @param atoms - Candidate atoms to compare against
 * @param limit - Maximum number of related atom IDs to return (default 3)
 * @returns Array of atom IDs sorted by similarity score descending (score > 0.15 threshold)
 */
export function findRelatedAtoms(
  content: string,
  atoms: Array<{ id: string; title?: string; content: string }>,
  limit = 3,
): string[] {
  const scored = atoms.map((atom) => ({
    id: atom.id,
    score: keywordSimilarity(content, atom.content + ' ' + (atom.title ?? '')),
  }));

  return scored
    .filter((s) => s.score > 0.15)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.id);
}
