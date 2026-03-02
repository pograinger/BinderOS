/**
 * Types for the Phase 7 guided GTD weekly review flow.
 *
 * ReviewPhaseContext tracks the review's position across three phases.
 * ReviewFlowStep defines each question card in the step queue.
 * Staging types are defined in store.ts (ephemeral module-level signals).
 *
 * Phase 7: AIRV-03
 */

export type ReviewPhase = 'get-clear' | 'get-current' | 'get-creative';

export interface ReviewAction {
  stepId: string;
  selectedOptionId: string;
  selectedLabel: string;
  freeformText?: string;
  phase: ReviewPhase;
  timestamp: number;
}

export interface ReviewPhaseContext {
  phase: ReviewPhase;
  phaseSummaries: string[];         // AI-generated summary per completed phase (~200 tokens each)
  currentStep: number;
  atomsReviewed: string[];          // atom IDs processed during this session
  actionsTaken: ReviewAction[];     // what user did at each step
}

export type StagingAction =
  | { type: 'archive'; atomId: string }
  | { type: 'delete'; atomId: string }
  | { type: 'defer'; atomId: string }
  | { type: 'add-next-action'; projectName: string }
  | { type: 'capture'; content: string }
  | { type: 'skip' }
  | { type: 'none' };

export interface ReviewStepOption {
  id: string;
  label: string;
  description?: string;
  /** What this option does to the staging area — interpreted by advanceReviewStep */
  stagingAction?: StagingAction;
}

export interface ReviewFlowStep {
  stepId: string;
  phase: ReviewPhase;
  question: string;
  options: ReviewStepOption[];
  allowFreeform: boolean;
  context?: string;                 // atom title, project name, etc. shown above question
  atomId?: string;                  // for steps tied to a specific atom
}
