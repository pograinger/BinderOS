/**
 * AI review pre-analysis pipeline — generates briefing from store state (AIRV-01, AIRV-02).
 *
 * Two-phase architecture:
 * 1. Pre-analysis (synchronous, no AI): compute stale items, projects without next actions,
 *    compression candidates from store data. Emit progress via onProgress callback.
 * 2. AI summary call: pass pre-computed stats to cloud adapter for a single summary sentence.
 *
 * Pure module: no imports from store.ts. All state passed in by caller.
 * Mirrors src/ai/triage.ts pattern.
 *
 * Phase 6: AIRV-01, AIRV-02
 */

import type { Atom } from '../types/atoms';
import type { AtomScore, EntropyScore } from '../types/config';
import type { SectionItem, Section } from '../types/sections';
import { dispatchAI } from './router';

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
 * Phase 2: AI summary sentence (single cloud AI call)
 *   - Passes pre-computed statistics for a 30-word health summary
 *   - Falls back to template string if AI call fails or is aborted
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

  // --- Phase 2: AI summary sentence ---

  // Count open tasks for context
  const openTaskCount = atoms.filter(
    (a) => a.type === 'task' && (a.status === 'open' || a.status === 'in-progress'),
  ).length;

  const fallbackSummary = `System has ${staleItems.length} stale items, ${projectsMissing.length} projects needing action, and ${compressionCandidates.length} compression candidates.`;

  let summaryText = fallbackSummary;

  // Check abort before AI call
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError');
  }

  const prompt = `You are analyzing a personal knowledge management system. Based on these statistics, write ONE natural language sentence (max 30 words) summarizing the overall system health:

- Total atoms: ${atoms.filter((a) => a.type !== 'analysis').length}
- System entropy: ${entropyScore?.level ?? 'unknown'} (${entropyScore?.score ?? 'N/A'})
- Stale items (>14 days): ${staleItems.length}
- Projects without next actions: ${projectsMissing.length}
- Compression candidates: ${compressionCandidates.length}
- Open tasks: ${openTaskCount}

Respond with ONLY the summary sentence. No JSON, no markdown, no explanation.`;

  try {
    const response = await dispatchAI({
      requestId: crypto.randomUUID(),
      prompt,
      maxTokens: 100,
      signal,
    });
    const trimmed = response.text.trim();
    if (trimmed.length > 0) {
      summaryText = trimmed;
    }
  } catch (err) {
    // Re-throw if aborted — caller handles AbortError separately
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    // AI call failed — use fallback summary (non-critical, briefing still works)
    console.warn('[analysis] AI summary call failed, using fallback:', err);
    summaryText = fallbackSummary;
  }

  return {
    summaryText,
    staleItems,
    projectsMissingNextAction: projectsMissing,
    compressionCandidates,
    generatedAt: now,
  };
}
