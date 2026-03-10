/**
 * Unified enrichment wizard type definitions.
 *
 * Central types for the enrichment session lifecycle: questions, decomposition,
 * graduation, provenance tracking, maturity scoring, and quality gating.
 *
 * Pure type module -- no runtime imports, no store dependencies.
 *
 * Phase 24: ENRICH-03, ENRICH-04
 */

import type { AtomType } from '../../types/atoms';
import type {
  ClarificationQuestion,
  ClarificationAnswer,
  MissingInfoCategory,
} from '../clarification/types';
import type { DecomposedStep } from '../decomposition/categories';
import type { SignalVector } from '../tier2/cognitive-signals';

// Re-export for convenience -- downstream consumers import from here
export type { ClarificationQuestion, ClarificationAnswer, MissingInfoCategory, DecomposedStep, SignalVector };

/**
 * Template tier count — depths beyond this use semantic question selection.
 * No hard cap on enrichment depth; users can keep drilling indefinitely.
 */
export const TEMPLATE_TIER_COUNT = 2;

// --- Enrichment session lifecycle ---

/** Phases of the enrichment wizard flow. */
export type EnrichmentPhase =
  | 'questions'
  | 'decompose-offer'
  | 'decomposing'
  | 'graduate-offer'
  | 'graduating'
  | 'done';

/** Quality level derived from composite quality scoring. */
export type QualityLevel = 'high' | 'moderate' | 'low' | 'insufficient';

/** A decomposed step that the user has reviewed and optionally included. */
export interface AcceptedStep {
  /** Filled template text */
  text: string;
  /** AI-suggested atom type */
  type: AtomType;
  /** Suggested binder section, or null if unknown */
  suggestedSection: string | null;
  /** Composite quality score 0-1 */
  quality: number;
  /** Provenance bitmask for this step */
  provenance: number;
  /** Whether user chose to include this step in graduation */
  included: boolean;
}

/** Graduation proposal: the parent atom + child atoms ready for promotion. */
export interface GraduationProposal {
  parentAtom: {
    type: AtomType;
    content: string;
    enrichments: Record<string, string>;
    quality: number;
    provenance: number;
  };
  childAtoms: AcceptedStep[];
}

/** Maturity state tracking how complete an atom's enrichment is. */
export interface MaturityState {
  /** 0-1 ratio of filled categories to total categories */
  score: number;
  /** List of category keys that have been filled */
  filled: string[];
  /** Total number of enrichment categories tracked */
  totalCategories: number;
}

/** Full enrichment session state for one inbox item. */
export interface EnrichmentSession {
  /** ID of the inbox item being enriched */
  inboxItemId: string;
  /** Original content at session creation (for re-evaluation comparison) */
  originalContent: string;
  /** Current phase of the wizard */
  phase: EnrichmentPhase;
  /** Clarification questions generated for this item */
  questions: ClarificationQuestion[];
  /** Index of the question currently displayed */
  currentQuestionIndex: number;
  /** User answers collected so far */
  answers: ClarificationAnswer[];
  /** Decomposition steps generated (if applicable) */
  decompositionSteps: DecomposedStep[];
  /** Index of decomposition step currently displayed */
  currentStepIndex: number;
  /** Steps the user has reviewed and accepted/rejected */
  acceptedSteps: AcceptedStep[];
  /** Graduation proposal once all enrichment is done */
  graduationProposal: GraduationProposal | null;
  /** Accumulated provenance bitmask tracking all AI models used */
  provenance: number;
  /** Per-category enrichment depth tracking (key = MissingInfoCategory, value = current depth) */
  categoryDepth: Record<string, number>;
  /** Cached cognitive signals for question prioritization */
  cognitiveSignals: SignalVector | null;
  /** Whether "ask more" mode is active for a specific category */
  activeDeepening: MissingInfoCategory | null;
}
