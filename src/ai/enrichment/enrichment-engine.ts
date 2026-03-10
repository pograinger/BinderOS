/**
 * Enrichment engine state machine.
 *
 * Orchestrates the questions-first-then-decomposition-offer flow for the
 * unified enrichment wizard. Manages session state transitions, partial
 * enrichment resume, and smart re-evaluation detection.
 *
 * Pure module -- no store imports, no side effects.
 *
 * Phase 24: ENRICH-02, ENRICH-03, ENRICH-05
 */

import type { AtomType } from '../../types/atoms';
import type {
  EnrichmentSession,
  EnrichmentPhase,
  ClarificationQuestion,
  ClarificationAnswer,
  MissingInfoCategory,
  DecomposedStep,
  AcceptedStep,
} from './types';
import { addProvenance, OPERATION_IDS, MODEL_IDS } from './provenance';
import { computeMaturity } from './maturity';
import { parseEnrichment } from '../clarification/enrichment';
import { generateTemplateOptions } from '../clarification/question-templates';

// --- Category key mappings ---

/** Display keys used in enrichment content, keyed by MissingInfoCategory. */
const CATEGORY_DISPLAY_KEYS: Record<MissingInfoCategory, string> = {
  'missing-outcome': 'Outcome',
  'missing-next-action': 'Next Action',
  'missing-timeframe': 'Deadline',
  'missing-context': 'Context',
  'missing-reference': 'Reference',
};

/** All five missing-info categories. */
const ALL_CATEGORIES: MissingInfoCategory[] = [
  'missing-outcome',
  'missing-next-action',
  'missing-timeframe',
  'missing-context',
  'missing-reference',
];

// --- Session creation ---

/**
 * Create a new enrichment session for an inbox item.
 *
 * Handles partial resume by detecting existing enrichments and skipping
 * already-answered categories. Starts in 'decompose-offer' if no questions
 * are needed.
 */
export function createEnrichmentSession(params: {
  inboxItemId: string;
  content: string;
  atomType?: AtomType;
  existingEnrichments?: Record<string, string>;
  missingCategories?: MissingInfoCategory[];
}): EnrichmentSession {
  const {
    inboxItemId,
    content,
    atomType,
    existingEnrichments,
    missingCategories,
  } = params;

  // Parse content to detect any inline enrichments
  const parsed = parseEnrichment(content);
  const allEnrichments = { ...parsed.enrichments, ...existingEnrichments };

  // Determine which categories are truly missing (not already enriched)
  const enrichedDisplayKeys = new Set(Object.keys(allEnrichments));
  const categoriesToAsk = (missingCategories ?? deriveMissingCategories(allEnrichments))
    .filter((cat) => {
      const displayKey = CATEGORY_DISPLAY_KEYS[cat];
      return !enrichedDisplayKeys.has(displayKey);
    });

  // Generate questions for unanswered categories
  const questions: ClarificationQuestion[] = categoriesToAsk.map((cat) =>
    generateTemplateOptions(cat, atomType ?? 'task', {}, undefined),
  );

  // If no questions needed, start at decompose-offer
  const phase: EnrichmentPhase = questions.length === 0 ? 'decompose-offer' : 'questions';

  const provenance = addProvenance(0, OPERATION_IDS.ENRICH);

  return {
    inboxItemId,
    originalContent: content,
    phase,
    questions,
    currentQuestionIndex: 0,
    answers: [],
    decompositionSteps: [],
    currentStepIndex: 0,
    acceptedSteps: [],
    graduationProposal: null,
    provenance,
    categoryDepth: {},
    cognitiveSignals: null,
    activeDeepening: null,
  };
}

/**
 * Derive missing categories from what's NOT already in enrichments.
 * Used when missingCategories is not explicitly provided.
 */
function deriveMissingCategories(
  enrichments: Record<string, string>,
): MissingInfoCategory[] {
  const enrichedDisplayKeys = new Set(Object.keys(enrichments));
  return ALL_CATEGORIES.filter((cat) => {
    const displayKey = CATEGORY_DISPLAY_KEYS[cat];
    return !enrichedDisplayKeys.has(displayKey);
  });
}

// --- Session advancement ---

/**
 * Advance the session to the next phase based on current state and user choice.
 *
 * Deterministic state transitions:
 * - 'questions' -> 'decompose-offer' (when all questions answered)
 * - 'decompose-offer' + accept -> 'decomposing'
 * - 'decompose-offer' + decline -> 'graduate-offer'
 * - 'decomposing' -> 'graduate-offer' (when all steps reviewed)
 * - 'graduate-offer' + accept -> 'graduating'
 * - 'graduate-offer' + decline -> 'done'
 * - 'graduating' -> 'done'
 */
export function advanceSession(
  session: EnrichmentSession,
  userChoice?: 'accept' | 'decline',
): EnrichmentSession {
  switch (session.phase) {
    case 'questions': {
      if (session.currentQuestionIndex >= session.questions.length) {
        return { ...session, phase: 'decompose-offer' };
      }
      return session;
    }

    case 'decompose-offer': {
      if (userChoice === 'accept') {
        return { ...session, phase: 'decomposing' };
      }
      if (userChoice === 'decline') {
        return { ...session, phase: 'graduate-offer' };
      }
      return session;
    }

    case 'decomposing': {
      if (session.currentStepIndex >= session.decompositionSteps.length) {
        return { ...session, phase: 'graduate-offer' };
      }
      return session;
    }

    case 'graduate-offer': {
      if (userChoice === 'accept') {
        return { ...session, phase: 'graduating' };
      }
      if (userChoice === 'decline') {
        return { ...session, phase: 'done' };
      }
      return session;
    }

    case 'graduating': {
      return { ...session, phase: 'done' };
    }

    default:
      return session;
  }
}

// --- Answer application ---

/**
 * Apply a clarification answer to the session (immutable update).
 *
 * Records the answer, updates provenance, and advances the question index.
 */
export function applyAnswer(
  session: EnrichmentSession,
  answer: ClarificationAnswer,
): EnrichmentSession {
  let provenance = addProvenance(session.provenance, OPERATION_IDS.CLARIFY);

  // If this answer came from an ONNX-derived question, track the model
  if (!answer.wasSkipped) {
    provenance = addProvenance(provenance, MODEL_IDS.MISSING_INFO);
  }

  return {
    ...session,
    answers: [...session.answers, answer],
    currentQuestionIndex: session.currentQuestionIndex + 1,
    provenance,
  };
}

// --- Decomposition step application ---

/**
 * Apply a user decision to a decomposition step (immutable update).
 *
 * - 'accept': add step to acceptedSteps with included=true
 * - 'edit': add step with edited text to acceptedSteps
 * - 'skip': advance index without adding to acceptedSteps
 */
export function applyDecompositionStep(
  session: EnrichmentSession,
  stepIndex: number,
  action: 'accept' | 'edit' | 'skip',
  editedText?: string,
): EnrichmentSession {
  let provenance = addProvenance(
    session.provenance,
    MODEL_IDS.DECOMPOSE_ONNX | OPERATION_IDS.DECOMPOSE,
  );

  if (action === 'skip') {
    return {
      ...session,
      currentStepIndex: session.currentStepIndex + 1,
      provenance,
    };
  }

  const step = session.decompositionSteps[stepIndex];
  if (!step) {
    return {
      ...session,
      currentStepIndex: session.currentStepIndex + 1,
      provenance,
    };
  }

  const acceptedStep: AcceptedStep = {
    text: action === 'edit' && editedText ? editedText : step.text,
    type: step.suggestedType ?? 'task',
    suggestedSection: null,
    quality: 0,
    provenance,
    included: true,
  };

  return {
    ...session,
    acceptedSteps: [...session.acceptedSteps, acceptedStep],
    currentStepIndex: session.currentStepIndex + 1,
    provenance,
  };
}

// --- Graduation readiness ---

/**
 * Compute whether the session is ready for graduation.
 *
 * Returns shouldOffer=true if maturity >= 0.4 or if decomposition steps
 * have been accepted (i.e., user engaged with the flow).
 */
export function computeGraduationReadiness(
  session: EnrichmentSession,
): { maturityScore: number; shouldOffer: boolean } {
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

  const maturityScore = computeMaturity(enrichments);
  const hasAcceptedSteps = session.acceptedSteps.length > 0;
  const shouldOffer = maturityScore >= 0.4 || hasAcceptedSteps;

  return { maturityScore, shouldOffer };
}

// --- Smart re-evaluation ---

/**
 * Determine if content has changed significantly since session creation.
 *
 * Uses a length-based heuristic: if the character-level difference ratio
 * exceeds 30%, the content is considered significantly changed.
 */
export function shouldReEvaluate(
  session: EnrichmentSession,
  newContent: string,
): boolean {
  const original = session.originalContent;

  // Empty edge cases
  if (original.length === 0 && newContent.length === 0) return false;
  if (original.length === 0 || newContent.length === 0) return true;

  // Simple character-level difference ratio
  const maxLen = Math.max(original.length, newContent.length);
  let matchCount = 0;

  // Count matching characters (order-aware comparison)
  const minLen = Math.min(original.length, newContent.length);
  for (let i = 0; i < minLen; i++) {
    if (original[i] === newContent[i]) {
      matchCount++;
    }
  }

  const similarity = matchCount / maxLen;
  const differenceRatio = 1 - similarity;

  return differenceRatio > 0.3;
}
