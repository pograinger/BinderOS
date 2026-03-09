/**
 * Clarification system type definitions.
 *
 * All interfaces consumed by downstream clarification plans (03-05).
 * Pure type module — no runtime imports, no store dependencies.
 *
 * Phase 19: CLAR-08, CLAR-09
 */

/** The five categories of missing information, ordered by GTD importance. */
export type MissingInfoCategory =
  | 'missing-outcome'
  | 'missing-next-action'
  | 'missing-timeframe'
  | 'missing-context'
  | 'missing-reference';

/** Result from the completeness gate binary classifier. */
export interface CompletenessGateResult {
  isIncomplete: boolean;
  confidence: number;
}

/** Result from a single missing-info binary classifier. */
export interface MissingInfoResult {
  category: MissingInfoCategory;
  isMissing: boolean;
  confidence: number;
}

/** A clarification question presented to the user. */
export interface ClarificationQuestion {
  category: MissingInfoCategory;
  questionText: string;
  /** 3-4 pre-built options; freeform rendered separately by UI. */
  options: string[];
  /** Subtle indicator shown in UI: "outcome", "timeframe", etc. */
  categoryLabel: string;
}

/** A user's answer to a clarification question. */
export interface ClarificationAnswer {
  category: MissingInfoCategory;
  selectedOption: string | null;
  wasFreeform: boolean;
  freeformText: string | null;
  wasSkipped: boolean;
}

/** Full result of a clarification session for one atom. */
export interface ClarificationResult {
  atomId: string;
  answers: ClarificationAnswer[];
  enrichedContent: string;
  categoriesDetected: MissingInfoCategory[];
  categoriesAnswered: MissingInfoCategory[];
  categoriesSkipped: MissingInfoCategory[];
}
