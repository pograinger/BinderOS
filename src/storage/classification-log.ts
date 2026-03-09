/**
 * Classification event logging for pattern learning.
 *
 * LOCKED DECISION (CONTEXT.md): Pattern learning -- track classification
 * patterns over time to improve suggestions. This is a lightweight foundation
 * for future AI-powered suggestions without requiring AI now.
 *
 * Stores classification events in the Dexie config table under the key
 * 'classification-events' as a JSON array.
 *
 * suggestTypeFromPatterns() analyzes recent history for content keyword
 * overlap and returns the most common chosenType if confidence > 60%.
 */

import { db } from './db';
import { writeQueue } from './write-queue';
import type { AtomType } from '../types/atoms';

export interface ClassificationEvent {
  inboxItemId: string;
  content: string;
  suggestedType: AtomType;
  chosenType: AtomType;
  sectionItemId: string | null;
  sectionItemName: string | null;
  timestamp: number;
  /** Which tier suggested this classification (Phase 8) */
  tier?: 1 | 2 | 3;
  /** Confidence score from the suggesting tier (Phase 8) */
  confidence?: number;
  /** Cached 384-dim MiniLM embedding vector for centroid rebuild (Phase 8) */
  embedding?: number[];
  /** Model's top-1 suggestion BEFORE user interaction (Phase 9+). Used to detect model-collapse feedback loops. */
  modelSuggestion?: AtomType;
  /** GTD list routing suggestion (only for tasks) */
  suggestedGtdRouting?: string;
  /** User's chosen GTD routing (if corrected) */
  chosenGtdRouting?: string;
  /** Suggested actionability */
  suggestedActionable?: boolean;
  /** Suggested project status */
  suggestedIsProject?: boolean;
  /** Suggested context tag */
  suggestedContextTag?: string;
  /** User's chosen context tag (if corrected) */
  chosenContextTag?: string;
  /** Marks this as a clarification event */
  clarificationType?: 'clarification';
  /** Which missing-info category was detected */
  detectedCategory?: string;
  /** Options presented to the user */
  optionsShown?: string[];
  /** Which option the user selected (null if skipped) */
  optionSelected?: string | null;
  /** Whether the user used freeform input */
  wasFreeform?: boolean;
  /** Freeform text if applicable */
  freeformText?: string | null;
}

const CONFIG_KEY = 'classification-events';

/**
 * Log a classification event for future pattern learning.
 * Appends to the config table under the classification-events key.
 * Uses the write queue for batched persistence.
 */
export function logClassification(event: ClassificationEvent): void {
  writeQueue.enqueue(async () => {
    const existing = await db.config.get(CONFIG_KEY);
    const events: ClassificationEvent[] = existing
      ? (existing.value as ClassificationEvent[])
      : [];
    events.push(event);
    await db.config.put({ key: CONFIG_KEY, value: events });
  });
}

/** Input for logging a clarification event. */
export interface ClarificationLogEvent {
  inboxItemId: string;
  content: string;
  atomType: AtomType;
  detectedCategory: string;
  optionsShown: string[];
  optionSelected: string | null;
  wasFreeform: boolean;
  freeformText: string | null;
  tier?: 1 | 2 | 3;
  confidence?: number;
}

/**
 * Log a clarification event for future pattern learning.
 * Convenience wrapper that calls logClassification with clarification fields populated.
 */
export function logClarification(event: ClarificationLogEvent): void {
  logClassification({
    inboxItemId: event.inboxItemId,
    content: event.content,
    suggestedType: event.atomType,
    chosenType: event.atomType,
    sectionItemId: null,
    sectionItemName: null,
    timestamp: Date.now(),
    tier: event.tier,
    confidence: event.confidence,
    clarificationType: 'clarification',
    detectedCategory: event.detectedCategory,
    optionsShown: event.optionsShown,
    optionSelected: event.optionSelected,
    wasFreeform: event.wasFreeform,
    freeformText: event.freeformText,
  });
}

/**
 * Read the full classification history from the config table.
 */
export async function getClassificationHistory(): Promise<ClassificationEvent[]> {
  const entry = await db.config.get(CONFIG_KEY);
  if (!entry) return [];
  return entry.value as ClassificationEvent[];
}

/**
 * Export classification history as JSONL string for retraining data.
 * Includes GTD fields when present. Format compatible with training pipeline.
 */
export async function exportClassificationJSONL(): Promise<string> {
  const history = await getClassificationHistory();
  return history
    .map(event => JSON.stringify({
      text: event.content,
      type_suggested: event.suggestedType,
      type_chosen: event.chosenType,
      gtd_routing_suggested: event.suggestedGtdRouting ?? null,
      gtd_routing_chosen: event.chosenGtdRouting ?? null,
      actionable_suggested: event.suggestedActionable ?? null,
      is_project_suggested: event.suggestedIsProject ?? null,
      context_tag_suggested: event.suggestedContextTag ?? null,
      context_tag_chosen: event.chosenContextTag ?? null,
      tier: event.tier ?? null,
      confidence: event.confidence ?? null,
      timestamp: event.timestamp,
      clarification_type: event.clarificationType ?? null,
      detected_category: event.detectedCategory ?? null,
      options_shown: event.optionsShown ?? null,
      option_selected: event.optionSelected ?? null,
      was_freeform: event.wasFreeform ?? null,
      freeform_text: event.freeformText ?? null,
    }))
    .join('\n');
}

/**
 * Extract significant keywords from content for comparison.
 * Strips common stop words and returns lowercase tokens.
 */
function extractKeywords(content: string): string[] {
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'about', 'up', 'out',
    'that', 'this', 'it', 'its', 'i', 'me', 'my', 'we', 'our', 'and',
    'or', 'but', 'not', 'no', 'so', 'if', 'then', 'than', 'too', 'very',
  ]);

  return content
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));
}

/**
 * Calculate keyword similarity between two content strings.
 * Returns a score between 0 and 1 based on Jaccard similarity.
 */
function keywordSimilarity(a: string, b: string): number {
  const kwA = new Set(extractKeywords(a));
  const kwB = new Set(extractKeywords(b));
  if (kwA.size === 0 || kwB.size === 0) return 0;

  let intersection = 0;
  for (const word of kwA) {
    if (kwB.has(word)) intersection++;
  }

  const union = new Set([...kwA, ...kwB]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Suggest an atom type based on classification pattern history.
 *
 * Looks at recent classification events, finds items with similar
 * content keywords, and returns the most common chosenType if:
 *   - At least 3 similar items were classified the same way
 *   - Pattern confidence > 60% (same type chosen > 60% of similar items)
 *
 * Returns null if no strong pattern found (caller falls back to
 * content heuristic in InboxView).
 */
export async function suggestTypeFromPatterns(content: string): Promise<AtomType | null> {
  const history = await getClassificationHistory();
  if (history.length < 3) return null;

  // Find similar items (similarity > 0.3)
  const SIMILARITY_THRESHOLD = 0.3;
  const similar = history.filter(
    (event) => keywordSimilarity(content, event.content) > SIMILARITY_THRESHOLD,
  );

  if (similar.length < 3) return null;

  // Count chosen types among similar items
  const typeCounts = new Map<AtomType, number>();
  for (const event of similar) {
    typeCounts.set(event.chosenType, (typeCounts.get(event.chosenType) ?? 0) + 1);
  }

  // Find the most common type
  let bestType: AtomType | null = null;
  let bestCount = 0;
  for (const [type, count] of typeCounts) {
    if (count > bestCount) {
      bestCount = count;
      bestType = type;
    }
  }

  // Check confidence threshold: > 60% of similar items chose this type
  if (bestType && bestCount / similar.length > 0.6) {
    return bestType;
  }

  return null;
}
