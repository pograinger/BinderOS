/**
 * Compression coach engine — generates per-candidate template-driven explanations (AIRV-04).
 *
 * Takes compression candidates + full atom store + scores and produces
 * template-driven explanations referencing specific signals (staleness, link density,
 * similar atoms, related decisions).
 *
 * Design: Pure template-driven explanations from signal data, zero network requests.
 * All explanations generated locally from enriched candidate signals.
 *
 * Pure module: no imports from store.ts — all state passed in by caller.
 */

import type { Atom } from '../types/atoms';
import type { CompressionCandidate, AtomScore } from '../types/config';
import { findRelatedAtoms } from './similarity';
import { generateCompressionExplanation, recommendCompressionAction, assessCompressionConfidence } from './templates';

/**
 * Per-candidate template-driven explanation with contextual signal references.
 * Exported for use in Plan 03 staging area UI.
 */
export interface CompressionExplanation {
  atomId: string;
  title: string;
  explanation: string;       // Template-driven, references specific signals
  staleDays: number;
  linkCount: number;
  similarAtomCount: number;  // atoms with keyword similarity > 0.15
  similarAtomTitles: string[];
  decisionContext?: string;  // relevant decision atom title if found
  recommendedAction: 'archive' | 'delete' | 'tag-someday' | 'add-link';
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Candidate enriched with signal data for template generation.
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
 * Generate per-candidate template-driven explanations for compression candidates.
 *
 * Uses signal data (staleness, link count, similar atoms, related decisions) to
 * produce explanations locally with zero network requests. Confidence is tiered:
 * high (>90d orphaned), medium (>30d low links), low (default).
 *
 * @param candidates - Compression candidates from store (pre-computed by entropy engine)
 * @param atoms - All atoms from store
 * @param scores - Per-atom scores from compute engine
 * @param signal - AbortSignal for cancellation
 * @param onProgress - Progress callback (count, total)
 * @returns Array of CompressionExplanation with template-driven reasoning
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

  // 2. Check abort before template generation
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  // 3. Generate template-driven explanations (no AI call)
  onProgress?.(enriched.length, enriched.length);
  return enriched.map(c => ({
    atomId: c.atomId,
    title: c.atom.title || c.atom.content.slice(0, 60),
    explanation: generateCompressionExplanation(c),
    staleDays: c.staleDays,
    linkCount: c.linkCount,
    similarAtomCount: c.similarAtomTitles.length,
    similarAtomTitles: c.similarAtomTitles,
    decisionContext: c.relatedDecisionTitles[0],
    recommendedAction: recommendCompressionAction(c),
    confidence: assessCompressionConfidence(c),
  }));
}
