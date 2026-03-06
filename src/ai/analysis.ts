/**
 * Review pre-analysis pipeline — generates briefing from store state (AIRV-01, AIRV-02).
 *
 * Two-phase architecture:
 * 1. Pre-analysis (synchronous, no AI): compute stale items, projects without next actions,
 *    compression candidates from store data. Emit progress via onProgress callback.
 * 2. Template-driven summary sentence from entropy signals (no AI call).
 *
 * Pure module: no imports from store.ts. All state passed in by caller.
 * Mirrors src/ai/triage.ts pattern.
 *
 * Phase 6: AIRV-01, AIRV-02
 * Phase 12: Template engine replaces AI summary call
 */

import type { Atom } from '../types/atoms';
import type { AtomScore, EntropyScore } from '../types/config';
import type { SectionItem, Section } from '../types/sections';
import { generateBriefingSummary } from './templates';

// --- BriefingItem interface ---

export interface BriefingItem {
  atomId: string;
  title: string;
  staleDays?: number;
  linkCount?: number;
  entropyScore?: number;
}

// --- BriefingResult interface ---

export interface BriefingResult {
  summaryText: string;
  staleItems: BriefingItem[];
  projectsMissingNextAction: BriefingItem[];
  compressionCandidates: BriefingItem[];
  generatedAt: number;
}

// --- Main briefing generation pipeline ---

/**
 * Generate a review briefing from current store state.
 *
 * Phase 1: Pre-analysis (synchronous, no AI)
 *   - Stale items (open/in-progress, last updated > 14 days ago)
 *   - Projects without next actions (active section items with no open tasks)
 *   - Compression candidates (orphaned atoms not updated in > 30 days)
 *
 * Phase 2: Template-driven summary sentence from entropy signals (no AI call)
 *   - Deterministic text generation based on entropy level and pre-computed counts
 *   - Works fully offline — no AI adapter required
 *
 * @param atoms - All atoms from store state
 * @param scores - Per-atom scoring results from compute engine
 * @param entropyScore - System entropy indicator
 * @param sectionItems - All section items for project next-action check
 * @param sections - All sections (used to resolve sectionItem.sectionId)
 * @param onProgress - Called with progress messages during pre-analysis
 * @param signal - AbortSignal for cancellation
 */
export async function generateBriefing(
  atoms: Atom[],
  scores: Record<string, AtomScore>,
  entropyScore: EntropyScore | null,
  sectionItems: SectionItem[],
  sections: Section[],
  onProgress: (message: string) => void,
  signal?: AbortSignal,
): Promise<BriefingResult> {
  const now = Date.now();

  // --- Phase 1: Pre-analysis (synchronous, no AI) ---

  // a) Compute stale items: open/in-progress atoms not updated in > 14 days
  const staleItems: BriefingItem[] = atoms
    .filter((a) => a.type !== 'analysis' && (a.status === 'open' || a.status === 'in-progress'))
    .map((a) => ({
      atom: a,
      staleDays: Math.floor((now - a.updated_at) / 86400000),
    }))
    .filter(({ staleDays }) => staleDays > 14)
    .sort((x, y) => y.staleDays - x.staleDays)
    .map(({ atom, staleDays }) => ({
      atomId: atom.id,
      title: atom.title || atom.content.split('\n')[0] || atom.id,
      staleDays,
      linkCount: atom.links.length,
      entropyScore: scores[atom.id]?.staleness,
    }));

  onProgress(`${staleItems.length} stale item${staleItems.length === 1 ? '' : 's'} found`);

  // b) Compute projects without next actions
  // Find the Projects section
  const projectsSection = sections.find((s) => s.type === 'projects');
  const projectsMissing: BriefingItem[] = [];

  if (projectsSection) {
    const activeSectionItems = sectionItems.filter((si) => !si.archived);
    for (const si of activeSectionItems) {
      // Only check section items that belong to the projects section
      if (si.sectionId !== projectsSection.id) continue;
      const hasNextAction = atoms.some(
        (a) =>
          a.sectionItemId === si.id &&
          a.type === 'task' &&
          (a.status === 'open' || a.status === 'in-progress'),
      );
      if (!hasNextAction) {
        projectsMissing.push({ atomId: si.id, title: si.name });
      }
    }
  }

  onProgress(
    `${projectsMissing.length} project${projectsMissing.length === 1 ? '' : 's'} missing next actions`,
  );

  // c) Compute compression candidates: orphaned atoms (no links) stale > 30 days
  const compressionCandidates: BriefingItem[] = atoms
    .filter(
      (a) =>
        a.type !== 'analysis' &&
        a.status !== 'archived' &&
        a.status !== 'cancelled',
    )
    .map((a) => ({
      atom: a,
      staleDays: Math.floor((now - a.updated_at) / 86400000),
    }))
    .filter(({ atom, staleDays }) => staleDays > 30 && atom.links.length === 0)
    .map(({ atom, staleDays }) => ({
      atomId: atom.id,
      title: atom.title || atom.content.split('\n')[0] || atom.id,
      staleDays,
    }));

  onProgress(
    `${compressionCandidates.length} compression candidate${compressionCandidates.length === 1 ? '' : 's'} identified`,
  );

  // --- Phase 2: Template summary (no AI call) ---

  // Check abort before template call — honor abort contract even though templates are sync
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  const summaryText = generateBriefingSummary(
    entropyScore,
    staleItems.length,
    projectsMissing.length,
    compressionCandidates.length,
    atoms.filter(a => a.type !== 'analysis').length,
  );

  return {
    summaryText,
    staleItems,
    projectsMissingNextAction: projectsMissing,
    compressionCandidates,
    generatedAt: now,
  };
}
