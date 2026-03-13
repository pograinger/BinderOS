/**
 * Enrichment engine state machine.
 *
 * Orchestrates the questions-first-then-decomposition-offer flow for the
 * unified enrichment wizard. Manages session state transitions, partial
 * enrichment resume, and smart re-evaluation detection.
 *
 * Pure module -- no store imports, no side effects.
 *
 * Callers must call invalidateCache() from momentum-builder.ts on triage
 * completion events to keep the prediction cache fresh for the next session.
 *
 * Phase 24: ENRICH-02, ENRICH-03, ENRICH-05
 * Phase 32: PRED-03 — replaced static computeSignalRelevance() with predictEnrichmentOrder()
 */

import type { AtomType } from '../../types/atoms';
import type {
  EnrichmentSession,
  EnrichmentPhase,
  ClarificationQuestion,
  ClarificationAnswer,
  MissingInfoCategory,
  SignalVector,
  DecomposedStep,
  AcceptedStep,
} from './types';
import { TEMPLATE_TIER_COUNT } from './types';
import { addProvenance, OPERATION_IDS, MODEL_IDS } from './provenance';
import { computeMaturity } from './maturity';
import type { EnrichmentRecord } from '../../types/intelligence';
import { generateTemplateOptions, generateFollowUpOptions } from '../clarification/question-templates';
import { predictEnrichmentOrder } from './predictive-scorer';
import type { MomentumVector, CategoryRanking } from './predictive-scorer';

/**
 * Fallback signal relevance for callers that pass cognitiveSignals but no momentum.
 * Preserves pre-Phase-32 behavior as a degraded fallback during caller migration.
 * Private — not exported. Use predictEnrichmentOrder() in all new callers.
 */
function computeFallbackRelevance(
  category: MissingInfoCategory,
  signals: SignalVector,
  signalCategoryMap?: Record<string, string[]>,
): number {
  const map = signalCategoryMap ?? {};
  let relevance = 0;
  for (const [modelId, categories] of Object.entries(map)) {
    if ((categories as string[]).includes(category)) {
      const signal = signals.signals[modelId];
      if (signal) {
        relevance += 1 - signal.confidence;
      }
    }
  }
  return relevance;
}

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
 * already-answered categories. When depthMap is provided, generates follow-up
 * questions for answered categories at any depth (no cap).
 *
 * When momentum is provided (Phase 32+), uses predictEnrichmentOrder() for
 * dynamic question ordering based on signal history and entity trajectory.
 * When only cognitiveSignals are provided (legacy path), falls back to
 * computeFallbackRelevance() for backward compatibility.
 *
 * Backward-compatible: all Phase 32 params are optional. Callers passing only
 * the original params get the same behavior as before (fallback or no reordering).
 *
 * NOTE: This function is synchronous. The caller (store.ts) is responsible for
 * calling computeMomentumVector() before creating the session and passing the
 * result. Sidecar snapshot writes also happen in the caller path.
 */
export function createEnrichmentSession(params: {
  inboxItemId: string;
  content: string;
  atomType?: AtomType;
  sidecarEnrichment?: EnrichmentRecord[];
  missingCategories?: MissingInfoCategory[];
  depthMap?: Record<string, number>;
  cognitiveSignals?: SignalVector | null;
  // Phase 32: predictive ordering params (all optional — backward compatible)
  momentum?: MomentumVector;
  entityScores?: Record<string, number>;
  signalCategoryMap?: Record<string, string[]>;
  entityCategoryMap?: Record<string, string[]>;
  entityTypePriorityWeights?: Record<string, number>;
}): EnrichmentSession {
  const {
    inboxItemId,
    content,
    atomType,
    sidecarEnrichment,
    missingCategories,
    depthMap,
    cognitiveSignals,
    momentum,
    entityScores,
    signalCategoryMap,
    entityCategoryMap,
    entityTypePriorityWeights,
  } = params;

  // Build enrichments lookup from sidecar records (replaces parseEnrichment)
  const allEnrichments: Record<string, string> = {};
  if (sidecarEnrichment) {
    for (const rec of sidecarEnrichment) {
      const displayKey = CATEGORY_DISPLAY_KEYS[rec.category as MissingInfoCategory];
      if (displayKey && rec.answer) {
        allEnrichments[displayKey] = rec.answer;
      }
    }
  }
  const enrichedDisplayKeys = new Set(Object.keys(allEnrichments));

  // Determine the full list of categories to consider
  const candidateCategories = missingCategories ?? ALL_CATEGORIES;

  // Whether iterative deepening is active (depthMap explicitly provided)
  const deepeningActive = depthMap !== undefined;

  // Generate questions: first-pass for unanswered, follow-ups for answered (if deepening active)
  // No depth cap — depths beyond TEMPLATE_TIER_COUNT get template-based questions here,
  // then the store replaces them with semantically-selected questions asynchronously.
  const questions: ClarificationQuestion[] = [];

  for (const cat of candidateCategories) {
    const displayKey = CATEGORY_DISPLAY_KEYS[cat];
    const hasAnswer = enrichedDisplayKeys.has(displayKey);
    const priorAnswer = hasAnswer ? allEnrichments[displayKey] : undefined;
    const currentDepth = depthMap?.[cat] ?? 0;

    if (!hasAnswer) {
      // First-pass question for unanswered category
      questions.push(generateTemplateOptions(cat, atomType ?? 'task', {}, undefined));
    } else if (deepeningActive && priorAnswer) {
      // Follow-up question for answered category — no depth cap
      questions.push(generateFollowUpOptions(cat, atomType ?? 'task', priorAnswer, currentDepth + 1, {}));
    }
    // else: no depthMap (legacy) — skip answered categories
  }

  // Apply predictive ordering when momentum is available (Phase 32+)
  if (momentum) {
    const config = {
      signalCategoryMap: signalCategoryMap ?? {},
      entityCategoryMap: entityCategoryMap ?? {},
      entityTypePriorityWeights: entityTypePriorityWeights ?? {},
    };
    const ranking = predictEnrichmentOrder(
      cognitiveSignals ?? null,
      momentum,
      entityScores ?? {},
      depthMap ?? {},
      config,
    );
    const rankMap = new Map(ranking.map((r, i) => [r.category, i]));
    questions.sort((a, b) => (rankMap.get(a.category) ?? 999) - (rankMap.get(b.category) ?? 999));
  } else if (cognitiveSignals) {
    // Fallback: no momentum available (e.g., caller doesn't pass it yet)
    // Preserves pre-Phase-32 signal-guided ordering for backward compatibility
    questions.sort((a, b) => {
      const relA = computeFallbackRelevance(a.category, cognitiveSignals, signalCategoryMap);
      const relB = computeFallbackRelevance(b.category, cognitiveSignals, signalCategoryMap);
      return relB - relA;
    });
  }

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
    categoryDepth: depthMap ? { ...depthMap } : {},
    cognitiveSignals: cognitiveSignals ?? null,
    activeDeepening: null,
    isGenerating: false,
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
 * Records the answer, updates provenance, advances the question index,
 * increments categoryDepth, and replaces any existing answer for the same
 * category (follow-up answers replace, not duplicate).
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

  // Replace existing answer for same category, or append if new
  const existingIdx = session.answers.findIndex((a) => a.category === answer.category);
  let updatedAnswers: ClarificationAnswer[];
  if (existingIdx >= 0) {
    updatedAnswers = [...session.answers];
    updatedAnswers[existingIdx] = answer;
  } else {
    updatedAnswers = [...session.answers, answer];
  }

  // Increment categoryDepth for the answered category
  const updatedDepth = { ...session.categoryDepth };
  updatedDepth[answer.category] = (updatedDepth[answer.category] ?? 0) + 1;

  return {
    ...session,
    answers: updatedAnswers,
    currentQuestionIndex: session.currentQuestionIndex + 1,
    provenance,
    categoryDepth: updatedDepth,
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
