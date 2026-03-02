/**
 * Compression coach engine — generates per-candidate AI explanations (AIRV-04).
 *
 * Takes compression candidates + full atom store + scores and produces
 * AI-written explanations referencing specific signals (staleness, link density,
 * similar atoms, related decisions).
 *
 * Design: Single batched cloud API call for ALL candidates to avoid multiple
 * approval modals (CloudAdapter fires onPreSendApproval per execute() call).
 *
 * Pure module: no imports from store.ts — all state passed in by caller.
 */

import type { Atom } from '../types/atoms';
import type { CompressionCandidate, AtomScore } from '../types/config';
import { findRelatedAtoms } from './similarity';
import { dispatchAI } from './router';

/**
 * Per-candidate AI explanation with contextual signal references.
 * Exported for use in Plan 03 staging area UI.
 */
export interface CompressionExplanation {
  atomId: string;
  title: string;
  explanation: string;       // AI-written, references specific signals
  staleDays: number;
  linkCount: number;
  similarAtomCount: number;  // atoms with keyword similarity > 0.15
  similarAtomTitles: string[];
  decisionContext?: string;  // relevant decision atom title if found
  recommendedAction: 'archive' | 'delete' | 'tag-someday' | 'add-link';
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Candidate enriched with signal data for prompt construction.
 * Exported for testing.
 */
export interface EnrichedCandidate {
  atomId: string;
  atom: Atom;
  staleDays: number;
  linkCount: number;
  similarAtomTitles: string[];
  relatedDecisionTitles: string[];
}

/**
 * Enrich compression candidates with staleness, link count, similar atoms, and related decisions.
 * Uses findRelatedAtoms (Jaccard keyword overlap) for similarity detection.
 */
function enrichCandidates(
  candidates: CompressionCandidate[],
  atoms: Atom[],
  _scores: Record<string, AtomScore>,
): EnrichedCandidate[] {
  const now = Date.now();
  const decisionAtoms = atoms.filter(a => a.type === 'decision');

  return candidates
    .map(c => {
      const atom = atoms.find(a => a.id === c.id);
      if (!atom) return null;

      const staleDays = Math.floor((now - atom.updated_at) / 86400000);
      const linkCount = atom.links.length;

      // Find similar atoms using Jaccard keyword overlap
      const searchText = (atom.title || '') + ' ' + atom.content;
      const otherAtoms = atoms
        .filter(a => a.id !== atom.id && a.type !== 'analysis')
        .map(a => ({ id: a.id, title: a.title, content: a.content }));
      const similarIds = findRelatedAtoms(searchText, otherAtoms, 5);
      const similarAtomTitles = similarIds
        .map(id => atoms.find(a => a.id === id)?.title ?? '')
        .filter(Boolean);

      // Find related decisions (by keyword overlap)
      const decisionSearchAtoms = decisionAtoms.map(a => ({
        id: a.id,
        title: a.title,
        content: a.content,
      }));
      const relatedDecisionIds = findRelatedAtoms(searchText, decisionSearchAtoms, 3);
      const relatedDecisionTitles = relatedDecisionIds
        .map(id => decisionAtoms.find(a => a.id === id)?.title ?? '')
        .filter(Boolean);

      return {
        atomId: atom.id,
        atom,
        staleDays,
        linkCount,
        similarAtomTitles,
        relatedDecisionTitles,
      };
    })
    .filter((x): x is EnrichedCandidate => x !== null);
}

/**
 * Build a single batched prompt for all candidates.
 * One cloud API call = one approval modal (avoids approval fatigue).
 */
function buildCompressionBatchPrompt(enriched: EnrichedCandidate[]): string {
  const items = enriched.map((c, i) => `
${i + 1}. Title: "${c.atom.title || c.atom.content.slice(0, 60)}"
   Type: ${c.atom.type}
   Staleness: ${c.staleDays} days since last update
   Link count: ${c.linkCount} (${c.linkCount === 0 ? 'orphaned' : 'connected'})
   Similar items: ${c.similarAtomTitles.length > 0 ? c.similarAtomTitles.join(', ') : 'none found'}
   Related decisions: ${c.relatedDecisionTitles.length > 0 ? c.relatedDecisionTitles.join(', ') : 'none'}
   Atom ID: ${c.atomId}`).join('\n');

  return `You are analyzing a personal knowledge management system for compression candidates.
These items have been flagged as potentially stale, orphaned, or redundant.

For each item below, explain in ONE to TWO sentences why it may be noise or could be compressed.
Reference specific signals: how many days stale, whether it's orphaned (zero links), how many similar items exist, whether any decisions supersede it.
Then recommend an action.

CANDIDATES:
${items}

Respond with ONLY a JSON array. Each element:
{"atomId":"<id>","explanation":"<1-2 sentence explanation referencing signals>","recommendedAction":"archive|delete|tag-someday|add-link","confidence":"high|medium|low"}`;
}

/**
 * Parse the AI batch response and merge with enriched signal data.
 * Falls back to template explanations if parsing fails.
 */
function parseCompressionBatchResponse(
  text: string,
  enriched: EnrichedCandidate[],
): CompressionExplanation[] {
  try {
    // Extract JSON array from response
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return buildFallbackExplanations(enriched);

    const parsed = JSON.parse(match[0]) as Array<Record<string, unknown>>;
    if (!Array.isArray(parsed)) return buildFallbackExplanations(enriched);

    const results: CompressionExplanation[] = [];
    for (const item of parsed) {
      const candidate = enriched.find(c => c.atomId === item.atomId);
      if (!candidate) continue;
      if (typeof item.explanation !== 'string') continue;

      const validActions = ['archive', 'delete', 'tag-someday', 'add-link'];
      const validConfidence = ['high', 'medium', 'low'];

      const decisionContext = candidate.relatedDecisionTitles[0] ?? undefined;

      results.push({
        atomId: candidate.atomId,
        title: candidate.atom.title || candidate.atom.content.slice(0, 60),
        explanation: item.explanation,
        staleDays: candidate.staleDays,
        linkCount: candidate.linkCount,
        similarAtomCount: candidate.similarAtomTitles.length,
        similarAtomTitles: candidate.similarAtomTitles,
        decisionContext,
        recommendedAction: (validActions.includes(item.recommendedAction as string)
          ? item.recommendedAction
          : 'archive') as CompressionExplanation['recommendedAction'],
        confidence: (validConfidence.includes(item.confidence as string)
          ? item.confidence
          : 'medium') as CompressionExplanation['confidence'],
      });
    }
    return results;
  } catch {
    return buildFallbackExplanations(enriched);
  }
}

/**
 * Generate template-based fallback explanations when AI is unavailable.
 * Uses signal data directly for explanation text.
 */
function buildFallbackExplanations(enriched: EnrichedCandidate[]): CompressionExplanation[] {
  return enriched.map(c => ({
    atomId: c.atomId,
    title: c.atom.title || c.atom.content.slice(0, 60),
    explanation: `This item has been stale for ${c.staleDays} days${c.linkCount === 0 ? ' and has no links to other items' : ''}. ${c.similarAtomTitles.length > 0 ? `There are ${c.similarAtomTitles.length} similar items that may overlap.` : 'Consider whether it still provides value.'}`,
    staleDays: c.staleDays,
    linkCount: c.linkCount,
    similarAtomCount: c.similarAtomTitles.length,
    similarAtomTitles: c.similarAtomTitles,
    decisionContext: c.relatedDecisionTitles[0],
    recommendedAction: c.staleDays > 60 && c.linkCount === 0 ? 'archive' : 'tag-someday',
    confidence: 'low' as const,
  }));
}

/**
 * Generate per-candidate AI explanations for compression candidates.
 *
 * Uses a single batched cloud API call to avoid multiple approval modals.
 * Falls back to template explanations if the AI call fails.
 *
 * @param candidates - Compression candidates from store (pre-computed by entropy engine)
 * @param atoms - All atoms from store
 * @param scores - Per-atom scores from compute engine
 * @param signal - AbortSignal for cancellation
 * @param onProgress - Progress callback (count, total)
 * @returns Array of CompressionExplanation with AI reasoning
 */
export async function generateCompressionExplanations(
  candidates: CompressionCandidate[],
  atoms: Atom[],
  scores: Record<string, AtomScore>,
  signal?: AbortSignal,
  onProgress?: (count: number, total: number) => void,
): Promise<CompressionExplanation[]> {
  if (candidates.length === 0) return [];

  // 1. Enrich candidates with signal data
  onProgress?.(0, candidates.length);
  const enriched = enrichCandidates(candidates, atoms, scores);

  if (enriched.length === 0) return [];

  // 2. Check abort
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  // 3. Single batched prompt → one cloud approval modal
  const prompt = buildCompressionBatchPrompt(enriched);

  try {
    const response = await dispatchAI({
      requestId: crypto.randomUUID(),
      prompt,
      maxTokens: Math.min(enriched.length * 150, 2000), // ~150 tokens per candidate, cap at 2000
      signal,
    });

    onProgress?.(enriched.length, enriched.length);
    return parseCompressionBatchResponse(response.text, enriched);
  } catch (err) {
    // Re-throw abort errors
    if (err instanceof DOMException && err.name === 'AbortError') throw err;

    // AI call failed — use fallback explanations
    console.warn('[compression] AI batch call failed, using fallback explanations:', err);
    onProgress?.(enriched.length, enriched.length);
    return buildFallbackExplanations(enriched);
  }
}
