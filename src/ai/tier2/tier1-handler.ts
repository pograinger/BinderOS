/**
 * Tier 1: Deterministic Engine handler.
 *
 * Always on-device, instant. Uses:
 * - Keyword heuristics for type classification
 * - Pattern history from classification log (Jaccard similarity)
 * - Regex for entity extraction
 * - WASM score interpretation for staleness assessment
 *
 * Pure module — no store imports. Classification history passed in at init.
 */

import type { TierHandler } from './handler';
import type { AITaskType, TieredRequest, TieredResult } from './types';
import type { AtomType } from '../../types/atoms';
import type { ClassificationEvent } from '../../storage/classification-log';

// --- Keyword heuristic patterns ---

const TYPE_PATTERNS: Record<AtomType, RegExp[]> = {
  task: [
    /\b(buy|get|do|make|send|call|email|write|fix|update|finish|complete|submit|schedule|book|order|pick\s*up|drop\s*off|check|review|prepare|create|set\s*up|clean|organize)\b/i,
    /\b(todo|to-do|to do|need to|must|should|have to|got to|gotta|reminder)\b/i,
    /\b(asap|urgent|deadline|due|by\s+\w+day)\b/i,
  ],
  event: [
    /\b(meeting|appointment|call|interview|conference|party|birthday|anniversary|dinner|lunch|breakfast|ceremony|wedding|funeral)\b/i,
    /\b(at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?|on\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i,
    /\b(\d{1,2}\/\d{1,2}|\d{4}-\d{2}-\d{2}|january|february|march|april|may|june|july|august|september|october|november|december)\b/i,
  ],
  decision: [
    /\b(decided|decision|chose|chosen|picked|selected|agreed|committed|resolved|determined)\b/i,
    /\b(going with|opted for|will use|settled on|narrowed down)\b/i,
    /\b(pro|con|tradeoff|trade-off|versus|vs\.?)\b/i,
  ],
  insight: [
    /\b(realized|noticed|learned|discovered|found out|turns out|interesting|pattern|observation|aha|eureka)\b/i,
    /\b(insight|idea|thought|hypothesis|theory|connection|correlation)\b/i,
  ],
  fact: [
    /\b(is|are|was|were|has|have|had|contains|consists|equals|means|refers to|defined as)\b/i,
  ],
  analysis: [], // Not a valid classification target
};

/**
 * Score content against keyword patterns for each type.
 * Returns the best matching type with confidence based on pattern match count.
 */
function classifyByKeywords(content: string): { type: AtomType; confidence: number } {
  const validTypes: AtomType[] = ['task', 'fact', 'event', 'decision', 'insight'];
  let bestType: AtomType = 'fact';
  let bestScore = 0;

  for (const type of validTypes) {
    const patterns = TYPE_PATTERNS[type];
    let matchCount = 0;
    for (const pattern of patterns) {
      if (pattern.test(content)) matchCount++;
    }
    // Normalize by number of patterns for this type
    const score = patterns.length > 0 ? matchCount / patterns.length : 0;
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }

  // Confidence mapping: 0 matches = 0.1, 1 pattern = 0.3, 2+ = 0.4-0.6
  const confidence = bestScore === 0 ? 0.1 : Math.min(0.6, 0.2 + bestScore * 0.4);
  return { type: bestType, confidence };
}

// --- Pattern history lookup ---

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
  'shall', 'can', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into',
  'through', 'during', 'before', 'after', 'above', 'below', 'between', 'and', 'but', 'or', 'not',
  'no', 'nor', 'so', 'yet', 'this', 'that', 'these', 'those', 'it', 'its',
]);

function extractKeywords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) {
    if (b.has(w)) intersection++;
  }
  return intersection / (a.size + b.size - intersection);
}

/**
 * Look up classification history for similar content.
 * Returns the most common chosenType among similar items.
 */
function classifyByHistory(
  content: string,
  history: ClassificationEvent[],
): { type: AtomType; confidence: number } | null {
  if (history.length < 3) return null;

  const contentKw = extractKeywords(content);
  const similar = history.filter(
    (event) => jaccardSimilarity(contentKw, extractKeywords(event.content)) > 0.3,
  );

  if (similar.length < 3) return null;

  const typeCounts = new Map<AtomType, number>();
  for (const event of similar) {
    typeCounts.set(event.chosenType, (typeCounts.get(event.chosenType) ?? 0) + 1);
  }

  let bestType: AtomType | null = null;
  let bestCount = 0;
  for (const [type, count] of typeCounts) {
    if (count > bestCount) {
      bestCount = count;
      bestType = type;
    }
  }

  if (!bestType) return null;

  const confidence = bestCount / similar.length;
  // Pattern history confidence range: 0.3 - 0.7
  return confidence > 0.5
    ? { type: bestType, confidence: Math.min(0.7, 0.3 + confidence * 0.4) }
    : null;
}

// --- Entity extraction ---

const ENTITY_PATTERNS: Array<{ kind: string; pattern: RegExp }> = [
  { kind: 'context', pattern: /@(\w+)/g },
  { kind: 'energy', pattern: /\b(quick|medium|deep)\s*(?:energy|focus|effort)?\b/gi },
  { kind: 'date', pattern: /\b(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/g },
  { kind: 'tag', pattern: /#(\w[\w-]*)/g },
];

function extractEntities(content: string): Array<{ kind: string; value: string }> {
  const entities: Array<{ kind: string; value: string }> = [];
  for (const { kind, pattern } of ENTITY_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      entities.push({ kind, value: match[1] ?? match[0] });
    }
  }
  return entities;
}

// --- Staleness assessment ---

function assessStaleness(content: string): { assessment: string; confidence: number } {
  // Extract staleness score from content if provided in scoreContext
  const staleMatch = content.match(/staleness[=:]?\s*([\d.]+)/i);
  const staleness = staleMatch?.[1] ? parseFloat(staleMatch[1]) : 0;

  if (staleness > 0.8) {
    return { assessment: 'High staleness — likely needs archiving or refresh', confidence: 0.75 };
  } else if (staleness > 0.5) {
    return { assessment: 'Moderate staleness — review for relevance', confidence: 0.65 };
  } else if (staleness > 0.2) {
    return { assessment: 'Low staleness — still relatively fresh', confidence: 0.7 };
  }
  return { assessment: 'Fresh content — no staleness concern', confidence: 0.8 };
}

// --- Tier 1 Handler ---

/**
 * Create a Tier 1 handler with access to classification history.
 *
 * The history is injected at creation time and can be refreshed
 * via updateHistory() when new classifications are logged.
 */
export function createTier1Handler(
  initialHistory: ClassificationEvent[] = [],
): TierHandler & { updateHistory: (history: ClassificationEvent[]) => void } {
  let classificationHistory = initialHistory;

  const SUPPORTED_TASKS: AITaskType[] = [
    'classify-type',
    'route-section',
    'extract-entities',
    'assess-staleness',
  ];

  return {
    tier: 1,
    name: 'Deterministic Engine',

    canHandle(task: AITaskType): boolean {
      return SUPPORTED_TASKS.includes(task);
    },

    async handle(request: TieredRequest): Promise<TieredResult> {
      const { task, features } = request;
      const text = (features.title ?? '') + ' ' + features.content;

      switch (task) {
        case 'classify-type': {
          // Try pattern history first (higher confidence if match found)
          const historyResult = classifyByHistory(text, classificationHistory);
          if (historyResult) {
            return {
              tier: 1,
              confidence: historyResult.confidence,
              type: historyResult.type,
              reasoning: 'Matched classification pattern from history',
            };
          }

          // Fall back to keyword heuristics
          const kwResult = classifyByKeywords(text);
          return {
            tier: 1,
            confidence: kwResult.confidence,
            type: kwResult.type,
            reasoning: 'Keyword heuristic classification',
          };
        }

        case 'route-section': {
          // Tier 1 can't do meaningful section routing without embeddings
          return {
            tier: 1,
            confidence: 0.1,
            sectionItemId: null,
            reasoning: 'No deterministic section routing available',
          };
        }

        case 'extract-entities': {
          const entities = extractEntities(features.content);
          return {
            tier: 1,
            confidence: entities.length > 0 ? 0.8 : 0.5,
            entities,
            reasoning: `Extracted ${entities.length} entities via regex`,
          };
        }

        case 'assess-staleness': {
          const assessment = assessStaleness(text);
          return {
            tier: 1,
            confidence: assessment.confidence,
            assessment: assessment.assessment,
            reasoning: 'WASM score interpretation',
          };
        }

        default:
          return { tier: 1, confidence: 0, reasoning: `Task ${task} not supported by Tier 1` };
      }
    },

    updateHistory(history: ClassificationEvent[]): void {
      classificationHistory = history;
    },
  };
}
