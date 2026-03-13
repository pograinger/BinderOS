/**
 * Core types for the 3-Ring Binder tiered AI architecture.
 *
 * Ring 1 (Inner):  Deterministic Engine — WASM scoring, heuristics, keyword search
 * Ring 2 (Middle): Compact Neural Models — ONNX embedding centroid classification
 * Ring 3 (Outer):  Generative Intelligence — WebLLM / Anthropic Claude
 *
 * Each tier returns a confidence score. Below the task-specific threshold → escalate.
 * Best result across all attempted tiers kept as fallback.
 */

import type { AtomType } from '../../types/atoms';
import type { DecomposedStep } from '../decomposition/categories';
import type { CompletenessGateResult, MissingInfoResult } from '../clarification/types';
import type { GateContext, GateResult } from '../../types/gate';

// --- AI task types ---

/**
 * Task types that the tiered pipeline can handle.
 * Each task has different tier support and confidence thresholds.
 */
export type AITaskType =
  | 'classify-type'      // Classify inbox item → AtomType
  | 'classify-gtd'       // Runs all 4 GTD classifiers on a task
  | 'route-section'      // Suggest section placement
  | 'extract-entities'   // Regex-based entity extraction (Tier 1 only)
  | 'assess-staleness'   // Interpret WASM staleness score
  | 'summarize'          // Always LLM (Tier 3 only)
  | 'analyze-gtd'        // Always LLM (Tier 3 only)
  | 'decompose'          // Decompose task/decision into GTD next-action steps
  | 'check-completeness' // Binary gate: complete vs incomplete (completeness gate)
  | 'classify-missing-info' // 5 binary classifiers: which info categories are missing
  | 'enrich-questions'      // Generate contextual clarification questions (T2B)
  | 'enrich-options'        // Generate contextual answer options (T2B)
  | 'decompose-contextual'  // Content-aware decomposition steps (T2B, better than template)
  | 'synthesize-enrichment'; // Post-enrichment summary for graduation (T2B)

// --- Confidence thresholds per task ---

/**
 * Minimum confidence required to accept a tier's result without escalation.
 * Lower thresholds = more trust in that tier for that task.
 */
export const CONFIDENCE_THRESHOLDS: Record<AITaskType, number> = {
  'classify-type':    0.78,  // Calibrated for Platt-scaled ONNX probabilities (was 0.65 for centroid similarity)
  'classify-gtd':     0.65,  // Not used directly; per-classifier thresholds in GTD_CONFIDENCE_THRESHOLDS
  'route-section':    0.60,
  'extract-entities': 0.50,
  'assess-staleness': 0.70,
  'summarize':        1.0,   // Always escalates to Tier 3
  'analyze-gtd':      1.0,   // Always escalates to Tier 3
  'decompose':        0.60,  // Lower threshold due to ~35 classes; user-triggered so acceptable
  'check-completeness': 0.75,  // Moderate gate — flags vague atoms for optional clarification
  'classify-missing-info': 0.50,  // Low threshold — binary classifiers, start permissive and tune with P/R data
  'enrich-questions': 0.50,       // Low — T2B enhancement, falls back to templates
  'enrich-options': 0.50,         // Low — T2B enhancement, falls back to templates
  'decompose-contextual': 0.60,  // Same as regular decompose
  'synthesize-enrichment': 0.70, // Moderate — synthesis quality matters
};

// --- Per-classifier GTD confidence thresholds ---

/**
 * Individual confidence thresholds for each GTD classifier.
 * Results below threshold are marked isLowConfidence: true (still returned, but flagged).
 */
export const GTD_CONFIDENCE_THRESHOLDS = {
  'gtd-routing':        0.70,
  'actionability':      0.80,
  'project-detection':  0.75,
  'context-tagging':    0.65,
} as const;

export type GtdClassifierName = keyof typeof GTD_CONFIDENCE_THRESHOLDS;

// --- GTD classification result ---

/**
 * Per-classifier result from the GTD classification pipeline.
 * Each field is optional — absent if that classifier's model failed to load.
 */
export interface GtdClassification {
  /** GTD list routing: next-action, waiting-for, someday-maybe, reference */
  routing?: { label: string; confidence: number; isLowConfidence: boolean };
  /** Actionability: actionable, non-actionable */
  actionability?: { label: string; confidence: number; isLowConfidence: boolean };
  /** Project detection: project, single-action */
  project?: { label: string; confidence: number; isLowConfidence: boolean };
  /** Context tagging: @computer, @phone, @errands, @home, @office, @agenda */
  context?: { label: string; confidence: number; isLowConfidence: boolean };
}

// --- Tiered request ---

/**
 * Features/context passed to the tiered pipeline.
 * Each handler extracts what it needs from this bag.
 */
export interface TieredFeatures {
  /** Content text to classify/analyze */
  content: string;
  /** Optional title */
  title?: string;
  /** Available section items for routing */
  sectionItems?: Array<{ id: string; name: string; sectionName: string }>;
  /** Entropy context for triage prompts */
  entropyContext?: string;
  /** Score context for triage prompts */
  scoreContext?: string;
  /** Atom type definitions for LLM prompts */
  typeDefinitions?: string;
  /** Full prompt override for Tier 3 (allows caller to pass pre-built prompts) */
  promptOverride?: string;
  /** Atom type for decomposition (task/decision) */
  atomType?: 'task' | 'decision';
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
  /** Existing enrichment answers for context in synthesis/graduation */
  enrichmentAnswers?: Record<string, string>;
  /** Current maturity score for graduation readiness assessment */
  maturityScore?: number;
  /**
   * 128-dim sequence context embedding from the LSTM model.
   * Concatenated with MiniLM embedding (384-dim) before T2 classifier inference.
   * Absent or undefined → zero-padded 128-dim (cold-start path).
   */
  sequenceContext?: Float32Array;
}

/**
 * A request to the tiered AI pipeline.
 *
 * context is REQUIRED — every dispatch must carry gate context so the pre-filter
 * can evaluate route, time-of-day, atom history, and binder-type predicates before
 * any handler runs.
 */
export interface TieredRequest {
  /** Unique request identifier */
  requestId: string;
  /** Which AI task to perform */
  task: AITaskType;
  /** Features/context for the task */
  features: TieredFeatures;
  /**
   * Gate context for the pre-dispatch filter. Required.
   * All four predicates (route, time-of-day, atom-history, binder-type) read from this.
   * Callers that have no meaningful context should pass makePermissiveContext() from test-helpers,
   * or construct a minimal GateContext with the fields they know.
   */
  context: GateContext;
}

// --- Tiered response ---

/**
 * A result from a single tier's handler.
 */
export interface TieredResult {
  /** Which tier produced this result */
  tier: 1 | 2 | 3;
  /** Confidence in this result (0-1) */
  confidence: number;
  /** Classified atom type (for classify-type task) */
  type?: AtomType;
  /** Suggested section item ID (for route-section task) */
  sectionItemId?: string | null;
  /** Reasoning text */
  reasoning?: string;
  /** Raw text output (for summarize/analyze-gtd tasks) */
  text?: string;
  /** Extracted entities (for extract-entities task) */
  entities?: Array<{ kind: string; value: string }>;
  /** Staleness assessment (for assess-staleness task) */
  assessment?: string;
  /** Second-best type when spread < 0.15 (ambiguous ONNX classification) */
  alternativeType?: AtomType;
  /** Confidence spread between top-1 and top-2 ONNX probabilities (for logging) */
  confidenceSpread?: number;
  /** GTD classification results (only for tasks, from classify-gtd) */
  gtd?: GtdClassification;
  /** Decomposed next-action steps (for decompose task) */
  decomposition?: DecomposedStep[];
  /** Completeness gate result (for check-completeness task) */
  completeness?: CompletenessGateResult;
  /** Missing info classification results (for classify-missing-info task) */
  missingInfo?: MissingInfoResult[];
  /** Generated questions for enrichment (enrich-questions task) */
  enrichmentQuestions?: Array<{ questionText: string; options: string[]; category: string }>;
  /** Generated options for a specific category (enrich-options task) */
  enrichmentOptions?: string[];
  /** Synthesis text for graduation summary (synthesize-enrichment task) */
  synthesisText?: string;
}

/**
 * The final response from the tiered pipeline.
 * Contains the accepted result plus metadata about all attempted tiers.
 */
export interface TieredResponse {
  /** The accepted (best) result */
  result: TieredResult;
  /** All tier attempts, in order attempted */
  attempts: TieredResult[];
  /** Whether the result was escalated past the first attempted tier */
  escalated: boolean;
  /** Total time across all tier attempts (ms) */
  totalMs: number;
  /**
   * True when the context gate blocked this dispatch — no handler ran.
   * Undefined (falsy) on normal passing dispatches.
   */
  gateBlocked?: boolean;
  /**
   * Gate evaluation result — populated on ALL dispatches (blocked and passing).
   * Includes per-predicate activated/blocked reasons for harness analysis.
   */
  gateResult?: GateResult;
}

// --- Minimum samples for Tier 2 activation ---

/**
 * Minimum classified items per type before Tier 2 centroids activate for that type.
 */
export const MIN_SAMPLES_PER_TYPE = 3;

/**
 * Number of classifications between centroid rebuilds.
 */
export const CENTROID_REBUILD_INTERVAL = 10;
