/**
 * Template engine module — pure deterministic text generation for briefings,
 * compression explanations, trigger enrichment, and GTD pattern steps.
 *
 * Design: Zero store imports. All state passed in by caller.
 * Uses TypeScript template literals only (no external template libraries).
 *
 * Phase 12: TMPL-01
 */

import type { EntropyScore } from '../types/config';
import type { Section } from '../types/sections';
import type { Atom } from '../types/atoms';
import type { ReviewFlowStep } from '../types/review';
import type { EnrichedCandidate, CompressionExplanation } from './compression';

// --- SectionContext ---

/**
 * Contextual data about a section for trigger question enrichment.
 */
export interface SectionContext {
  section: Section;
  activeTaskCount: number;
  activeProjectCount: number;
  daysSinceLastActivity: number;
}

// --- Helpers ---

function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}

// --- 1. generateBriefingSummary ---

/**
 * Generate the weekly review briefing summary sentence from entropy signals.
 *
 * Three entropy levels: green, yellow, red. Null entropy defaults to yellow
 * level but omits the percentage. Fully deterministic — no AI call.
 *
 * Locked tone decisions:
 * - Green + all zeros: "Your system is clean -- nothing needs attention right now."
 * - Red: uses "getting noisy" phrasing
 */
export function generateBriefingSummary(
  entropyScore: EntropyScore | null,
  staleCount: number,
  missingNextActions: number,
  compressionCount: number,
  _totalAtoms: number,
): string {
  const level = entropyScore?.level ?? 'yellow';
  const entropyLabel =
    entropyScore != null ? ` (entropy: ${Math.round(entropyScore.score)}%)` : '';

  if (level === 'green') {
    if (staleCount === 0 && missingNextActions === 0 && compressionCount === 0) {
      return 'Your system is clean -- nothing needs attention right now.';
    }

    const parts: string[] = [];
    if (staleCount > 0) {
      parts.push(
        `${staleCount} ${pluralize(staleCount, 'item', 'items')} could use a touch`,
      );
    }
    if (missingNextActions > 0) {
      parts.push(
        `${missingNextActions} ${pluralize(missingNextActions, 'project', 'projects')} missing a next action`,
      );
    }

    const detail = parts.length > 0 ? `${parts.join(', ')}. ` : '';
    return `${detail}You're in good shape.`;
  }

  if (level === 'red') {
    return (
      `System load is high${entropyLabel}. ` +
      `${staleCount} stale ${pluralize(staleCount, 'item', 'items')}, ` +
      `${missingNextActions} ${pluralize(missingNextActions, 'project', 'projects')} with no next action, ` +
      `and ${compressionCount} compression ${pluralize(compressionCount, 'candidate', 'candidates')}. ` +
      `Your system is getting noisy.`
    );
  }

  // yellow (default)
  return (
    `You have ${staleCount} stale ${pluralize(staleCount, 'item', 'items')} and ` +
    `${missingNextActions} ${pluralize(missingNextActions, 'project', 'projects')} missing next actions. ` +
    `Needs attention${entropyLabel}.`
  );
}

// --- 2. generateCompressionExplanation ---

/**
 * Generate a human-readable explanation for a compression candidate using
 * staleness, link count, similar atoms, and related decisions as signals.
 */
export function generateCompressionExplanation(c: EnrichedCandidate): string {
  const lastTouched = new Date(c.atom.updated_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const orphanClause = c.linkCount === 0 ? ', with no links to other items' : '';
  const staleClause = `Last touched ${lastTouched} -- stale for ${c.staleDays} days${orphanClause}.`;

  const similarClause =
    c.similarAtomTitles.length > 0
      ? ` There ${pluralize(c.similarAtomTitles.length, 'is', 'are')} ${c.similarAtomTitles.length} similar ${pluralize(c.similarAtomTitles.length, 'item', 'items')}.`
      : '';

  const decisionClause =
    c.relatedDecisionTitles.length > 0
      ? ` Related decision: "${c.relatedDecisionTitles[0]}".`
      : '';

  return `${staleClause}${similarClause}${decisionClause}`;
}

// --- 3. recommendCompressionAction ---

/**
 * Recommend a compression action based on staleness, links, and similarity signals.
 */
export function recommendCompressionAction(
  c: EnrichedCandidate,
): CompressionExplanation['recommendedAction'] {
  if (c.staleDays > 60 && c.linkCount === 0) return 'archive';
  if (c.similarAtomTitles.length >= 2) return 'tag-someday';
  if (c.relatedDecisionTitles.length > 0) return 'archive';
  return 'tag-someday';
}

// --- 4. assessCompressionConfidence ---

/**
 * Assess confidence in the compression recommendation.
 */
export function assessCompressionConfidence(
  c: EnrichedCandidate,
): CompressionExplanation['confidence'] {
  if (c.staleDays > 90 && c.linkCount === 0) return 'high';
  if (c.staleDays > 30 && c.linkCount <= 1) return 'medium';
  return 'low';
}

// --- 5. enrichTriggerQuestion ---

/**
 * Enrich a GTD trigger question with section-specific context.
 *
 * - No section context: simple prompt asking if anything to capture
 * - Section with 0 active tasks: notes the section is inactive
 * - Section with active tasks: shows count and asks for new captures
 * - Stale message added if daysSinceLastActivity > 14
 */
export function enrichTriggerQuestion(
  triggerLabel: string,
  triggerDescription: string,
  relevantSectionCtx: SectionContext | null,
): string {
  if (!relevantSectionCtx) {
    return `${triggerLabel}: ${triggerDescription} -- anything to capture?`;
  }

  const { section, activeTaskCount, daysSinceLastActivity } = relevantSectionCtx;

  const staleMsg =
    daysSinceLastActivity > 14
      ? ` You haven't touched ${section.name} in ${daysSinceLastActivity} days.`
      : '';

  if (activeTaskCount === 0) {
    return `${section.name} has no active tasks.${staleMsg} Anything to add?`;
  }

  return `${section.name} (${activeTaskCount} active).${staleMsg} ${triggerDescription} -- anything new to capture?`;
}

// --- 6. derivePatternSteps ---

/**
 * Derive Get Creative pattern steps from system state.
 *
 * Detects:
 * 1. High inbox (>10 items) — prompt to process backlog
 * 2. Empty sections (no open atoms in any section)
 *
 * Returns max 3 ReviewFlowStep[] with phase 'get-creative'.
 */
export function derivePatternSteps(
  sections: Section[],
  atoms: Atom[],
  inboxCount: number,
): ReviewFlowStep[] {
  const steps: ReviewFlowStep[] = [];

  // Pattern 1: High inbox backlog
  if (inboxCount > 10) {
    steps.push({
      stepId: `pattern-inbox-${Math.random().toString(36).slice(2, 7)}`,
      phase: 'get-creative',
      question: `Your inbox has ${inboxCount} items. Would you like to schedule a dedicated inbox session?`,
      options: [
        {
          id: 'capture',
          label: 'Schedule inbox session',
          description: 'Add a task to process the inbox backlog',
          stagingAction: { type: 'capture', content: 'Process inbox backlog' },
        },
        {
          id: 'skip',
          label: 'Skip for now',
          stagingAction: { type: 'skip' },
        },
      ],
      allowFreeform: false,
    });
  }

  if (steps.length >= 3) return steps.slice(0, 3);

  // Pattern 2: Sections with no open atoms
  const openAtoms = atoms.filter((a) => a.status === 'open' || a.status === 'in-progress');
  for (const section of sections) {
    if (steps.length >= 3) break;

    // Filter open atoms belonging to this section via sectionId
    const sectionOpenAtoms = openAtoms.filter((a) => a.sectionId === section.id);

    if (section.type !== 'archive' && sectionOpenAtoms.length === 0) {
      steps.push({
        stepId: `pattern-empty-${section.id.slice(0, 5)}-${Math.random().toString(36).slice(2, 7)}`,
        phase: 'get-creative',
        question: `Your ${section.name} section has no open items. Any projects to start?`,
        options: [
          {
            id: 'capture',
            label: `Add to ${section.name}`,
            description: `Capture a new item for ${section.name}`,
            stagingAction: { type: 'capture', content: `New item for ${section.name}` },
          },
          {
            id: 'skip',
            label: 'Skip',
            stagingAction: { type: 'skip' },
          },
        ],
        allowFreeform: true,
      });
      break; // Only add one empty-section step
    }
  }

  return steps.slice(0, 3);
}
