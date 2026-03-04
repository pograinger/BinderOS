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

// --- AI task types ---

/**
 * Task types that the tiered pipeline can handle.
 * Each task has different tier support and confidence thresholds.
 */
export type AITaskType =
  | 'classify-type'      // Classify inbox item → AtomType
  | 'route-section'      // Suggest section placement
  | 'extract-entities'   // Regex-based entity extraction (Tier 1 only)
  | 'assess-staleness'   // Interpret WASM staleness score
  | 'summarize'          // Always LLM (Tier 3 only)
  | 'analyze-gtd';       // Always LLM (Tier 3 only)

// --- Confidence thresholds per task ---

/**
 * Minimum confidence required to accept a tier's result without escalation.
 * Lower thresholds = more trust in that tier for that task.
 */
export const CONFIDENCE_THRESHOLDS: Record<AITaskType, number> = {
  'classify-type':    0.78,  // Calibrated for Platt-scaled ONNX probabilities (was 0.65 for centroid similarity)
  'route-section':    0.60,
  'extract-entities': 0.50,
  'assess-staleness': 0.70,
  'summarize':        1.0,   // Always escalates to Tier 3
  'analyze-gtd':      1.0,   // Always escalates to Tier 3
};

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
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
}

/**
 * A request to the tiered AI pipeline.
 */
export interface TieredRequest {
  /** Unique request identifier */
  requestId: string;
  /** Which AI task to perform */
  task: AITaskType;
  /** Features/context for the task */
  features: TieredFeatures;
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
