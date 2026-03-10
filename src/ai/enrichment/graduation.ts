/**
 * Graduation proposal generator.
 *
 * Builds graduation proposals from enrichment sessions: a parent atom
 * (the enriched inbox item) plus optional child atoms (from decomposition).
 * Supports toggle inclusion and produces action descriptors for the store.
 *
 * Pure module -- no store imports, no side effects.
 *
 * Phase 24: ENRICH-02, ENRICH-03, ENRICH-10
 */

import type { AtomType } from '../../types/atoms';
import type {
  EnrichmentSession,
  GraduationProposal,
  AcceptedStep,
  MissingInfoCategory,
} from './types';
import { addProvenance, OPERATION_IDS } from './provenance';
import { computeMaturity } from './maturity';
import { computeQuality } from './quality-gate';
import { appendEnrichment } from '../clarification/enrichment';

// --- Category display key mapping (mirrors enrichment-engine.ts) ---

const CATEGORY_DISPLAY_KEYS: Record<MissingInfoCategory, string> = {
  'missing-outcome': 'Outcome',
  'missing-next-action': 'Next Action',
  'missing-timeframe': 'Deadline',
  'missing-context': 'Context',
  'missing-reference': 'Reference',
};

/** Decision-related language patterns for type inference. */
const DECISION_PATTERNS = [
  /\bdecid/i,
  /\bchose\b/i,
  /\bchoose\b/i,
  /\bgo with\b/i,
  /\bpick\b/i,
  /\bselect/i,
  /\bopted?\b/i,
  /\bcommit to\b/i,
];

// --- Graduation proposal building ---

/**
 * Build a graduation proposal from an enrichment session.
 *
 * Creates a parent atom with enriched content and quality score, plus
 * child atoms from any accepted decomposition steps.
 */
export function buildGraduationProposal(
  session: EnrichmentSession,
  classificationContext?: {
    parentType?: AtomType;
    childSections?: Record<number, string>;
  },
): GraduationProposal {
  // Build enrichments record from answers
  const enrichments: Record<string, string> = {};
  for (const answer of session.answers) {
    if (answer.wasSkipped) continue;
    const key = CATEGORY_DISPLAY_KEYS[answer.category] ?? answer.category;
    const value = answer.wasFreeform ? answer.freeformText : answer.selectedOption;
    if (key && value) {
      enrichments[key] = value;
    }
  }

  // Parent type inference
  const hasDecomposition = session.acceptedSteps.length > 0;
  const parentType = classificationContext?.parentType
    ?? inferParentType(enrichments, hasDecomposition);

  // Parent content: original + enrichment answers
  const parentContent = appendEnrichment(session.originalContent, session.answers);

  // Parent quality
  const maturityScore = computeMaturity(enrichments);
  const parentQuality = computeQuality({
    provenance: session.provenance,
    maturityScore,
    hasUserContent: session.answers.some((a) => !a.wasSkipped),
  });

  // Parent provenance: add GRADUATE operation
  const parentProvenance = addProvenance(session.provenance, OPERATION_IDS.GRADUATE);

  // Child atoms from accepted steps
  const childAtoms: AcceptedStep[] = session.acceptedSteps.map((step, index) => {
    const childQuality = computeQuality({
      provenance: step.provenance,
      maturityScore: 0.6, // Decomposed steps are well-specified
      hasUserContent: true, // User reviewed and accepted
    });

    return {
      ...step,
      suggestedSection: classificationContext?.childSections?.[index] ?? step.suggestedSection,
      quality: childQuality.score,
    };
  });

  return {
    parentAtom: {
      type: parentType,
      content: parentContent,
      enrichments,
      quality: parentQuality.score,
      provenance: parentProvenance,
    },
    childAtoms,
  };
}

// --- Child inclusion toggle ---

/**
 * Toggle the included flag on a specific child atom (immutable).
 */
export function toggleChildInclusion(
  proposal: GraduationProposal,
  childIndex: number,
): GraduationProposal {
  const newChildren = proposal.childAtoms.map((child, i) =>
    i === childIndex ? { ...child, included: !child.included } : child,
  );

  return {
    ...proposal,
    childAtoms: newChildren,
  };
}

// --- Graduation action descriptors ---

/** Descriptor for a graduation action (store command). */
export interface GraduationAction {
  action: 'classify-parent' | 'create-child';
  type: AtomType;
  content: string;
  sectionItemId?: string | null;
  provenance: number;
  skipTriage: boolean;
}

/**
 * Get action descriptors for executing the graduation.
 *
 * First action is always classify-parent (the inbox item becomes an atom).
 * Subsequent actions are create-child for each included child.
 * Children have skipTriage=true (per user decision: children skip re-triaging).
 */
export function getGraduationActions(proposal: GraduationProposal): GraduationAction[] {
  const actions: GraduationAction[] = [];

  // Parent action
  actions.push({
    action: 'classify-parent',
    type: proposal.parentAtom.type,
    content: proposal.parentAtom.content,
    sectionItemId: null,
    provenance: proposal.parentAtom.provenance,
    skipTriage: false,
  });

  // Child actions (only included children)
  for (const child of proposal.childAtoms) {
    if (!child.included) continue;

    actions.push({
      action: 'create-child',
      type: child.type,
      content: child.text,
      sectionItemId: child.suggestedSection,
      provenance: child.provenance,
      skipTriage: true,
    });
  }

  return actions;
}

// --- Parent type inference ---

/**
 * Infer the parent atom type from enrichment answers and decomposition state.
 *
 * - If decomposition accepted -> 'task' (multi-step = project/task)
 * - If enrichment has "Next Action" -> 'task'
 * - If enrichment has "Outcome" with decision language -> 'decision'
 * - Default: 'task'
 */
export function inferParentType(
  enrichments: Record<string, string>,
  hasDecomposition: boolean,
): AtomType {
  if (hasDecomposition) return 'task';

  if (enrichments['Next Action']) return 'task';

  const outcome = enrichments['Outcome'];
  if (outcome) {
    for (const pattern of DECISION_PATTERNS) {
      if (pattern.test(outcome)) return 'decision';
    }
  }

  return 'task';
}
