/**
 * Tier 3 (LLM) enrichment question generator.
 *
 * Generates contextual follow-up questions using the active AI adapter (cloud or browser LLM).
 * Each question is informed by the item's full context, all prior Q&A pairs,
 * ONNX cognitive signals, and GTD methodology rules.
 *
 * The LLM acts as a GTD coach — asking the right question at the right depth,
 * with answer options spanning a spectrum of appropriate responses.
 *
 * Pure module — no store imports. All state passed by caller.
 *
 * Phase 25: ITER-01
 */

import type { ClarificationQuestion, MissingInfoCategory, ClarificationAnswer } from '../clarification/types';
import type { SignalVector, CognitiveSignal } from '../tier2/cognitive-signals';
import { dispatchAI, getActiveAdapter } from '../router';

/** Structured log entry for T3 enrichment exchanges. */
export interface T3ExchangeLog {
  timestamp: number;
  adapterId: string;
  adapterStatus: string;
  focusCategory: string | null;
  depth: Record<string, number>;
  promptLength: number;
  promptPreview: string;
  responseRaw: string | null;
  parsedQuestion: string | null;
  parsedOptions: string[] | null;
  durationMs: number;
  success: boolean;
  error: string | null;
}

/** Ring buffer of recent T3 exchanges for debugging. */
const _exchangeLog: T3ExchangeLog[] = [];
const MAX_LOG_SIZE = 20;

/** Get all logged T3 exchanges (most recent last). */
export function getT3ExchangeLog(): readonly T3ExchangeLog[] {
  return _exchangeLog;
}

/** Clear the T3 exchange log. */
export function clearT3ExchangeLog(): void {
  _exchangeLog.length = 0;
}

/** Input context for T3 question generation. */
export interface T3EnrichmentContext {
  /** The inbox item's raw content */
  itemContent: string;
  /** The item's detected type (task, fact, event, etc.) */
  atomType: string;
  /** All prior Q&A pairs from this enrichment session */
  priorQA: Array<{ category: string; question: string; answer: string }>;
  /** Per-category enrichment depth */
  categoryDepth: Record<string, number>;
  /** ONNX cognitive signals (null if not yet computed) */
  cognitiveSignals: SignalVector | null;
  /** Which category to focus on (null = LLM chooses best next) */
  focusCategory: MissingInfoCategory | null;
}

/** Category display labels. */
const CATEGORY_LABELS: Record<MissingInfoCategory, string> = {
  'missing-outcome': 'Outcome',
  'missing-next-action': 'Next Action',
  'missing-timeframe': 'Timeframe',
  'missing-context': 'Context',
  'missing-reference': 'Reference',
};

const ALL_CATEGORIES: MissingInfoCategory[] = [
  'missing-outcome',
  'missing-next-action',
  'missing-timeframe',
  'missing-context',
  'missing-reference',
];

/**
 * Format ONNX cognitive signals into a human-readable summary for the LLM prompt.
 */
function formatSignals(signals: SignalVector): string {
  const lines: string[] = [];
  for (const [modelId, signal] of Object.entries(signals.signals) as Array<[string, CognitiveSignal]>) {
    if (signal.accepted) {
      lines.push(`- ${signal.dimension}: ${signal.topLabel} (${Math.round(signal.confidence * 100)}% confidence)`);
    }
  }
  if (signals.composites.length > 0) {
    lines.push('');
    lines.push('Composite patterns detected:');
    for (const c of signals.composites) {
      lines.push(`- ${c.name}: ${c.description}`);
    }
  }
  return lines.length > 0 ? lines.join('\n') : 'No strong signals detected.';
}

/**
 * Format prior Q&A history for the LLM prompt.
 */
function formatPriorQA(priorQA: T3EnrichmentContext['priorQA']): string {
  if (priorQA.length === 0) return 'No prior questions asked yet.';

  return priorQA.map((qa, i) => (
    `Q${i + 1} [${qa.category}]: ${qa.question}\nA${i + 1}: ${qa.answer}`
  )).join('\n\n');
}

/**
 * Format category depth summary.
 */
function formatDepth(depth: Record<string, number>): string {
  const parts: string[] = [];
  for (const cat of ALL_CATEGORIES) {
    const d = depth[cat] ?? 0;
    const label = CATEGORY_LABELS[cat];
    parts.push(`${label}: depth ${d}`);
  }
  return parts.join(', ');
}

/**
 * Build the T3 enrichment prompt.
 *
 * The prompt positions the LLM as a GTD coach conducting a structured enrichment
 * interview. It provides full context about the item, what's been discussed,
 * and what the ONNX models have detected — then asks for the single best next question.
 */
function buildPrompt(ctx: T3EnrichmentContext): string {
  const signalSummary = ctx.cognitiveSignals
    ? formatSignals(ctx.cognitiveSignals)
    : 'Cognitive signals not available.';

  const focusInstruction = ctx.focusCategory
    ? `\nFOCUS: The user wants to go deeper on "${CATEGORY_LABELS[ctx.focusCategory]}". Generate a question for this specific category.`
    : '\nChoose the category that would most benefit from a question right now based on depth, signals, and prior answers.';

  return `You are a GTD (Getting Things Done) productivity coach conducting an enrichment interview.
Your goal: help the user clarify and actionize an inbox item through targeted questions.

ITEM CONTENT:
${ctx.itemContent}

ITEM TYPE: ${ctx.atomType}

PRIOR CONVERSATION:
${formatPriorQA(ctx.priorQA)}

ENRICHMENT DEPTH: ${formatDepth(ctx.categoryDepth)}

COGNITIVE SIGNALS (from on-device AI analysis):
${signalSummary}
${focusInstruction}

GTD METHODOLOGY RULES:
- Outcome: What does "done" look like? Success criteria, deliverables, measurable results.
- Next Action: The very next physical, visible action. Must be concrete and doable.
- Timeframe: When must this happen? Hard deadline vs. flexible target. Dependencies.
- Context: Where/when/what tools/energy level needed? GTD @contexts.
- Reference: Related projects, people, documents, prior art, dependencies.

DEPTH GUIDELINES:
- Depth 0 (first pass): Broad, foundational questions. "What's the outcome?"
- Depth 1-2: Specific follow-ups referencing prior answers. "You said X — what does that mean concretely?"
- Depth 3+: Actionable, edge-case, or contingency questions. "What if X fails? What's the minimum viable version?"

INSTRUCTIONS:
1. Generate ONE question that deepens the user's understanding of this item.
2. The question MUST reference prior answers when available — don't ask what's already been answered.
3. Provide 3-4 answer options spanning a spectrum from simple to detailed.
4. Options should be specific to this item, not generic.
5. Always include one option that challenges the user's assumptions.

Respond with ONLY this JSON (no markdown, no explanation):
{"category":"missing-outcome|missing-next-action|missing-timeframe|missing-context|missing-reference","question":"Your contextual question here","options":["Option 1","Option 2","Option 3","Option 4"]}`;
}

/**
 * Parse the LLM response into a ClarificationQuestion.
 * Handles various response formats (raw JSON, markdown-wrapped, etc.)
 */
function parseResponse(text: string): { category: MissingInfoCategory; question: string; options: string[] } | null {
  // Strip markdown code fences if present
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (
      typeof parsed.category === 'string' &&
      typeof parsed.question === 'string' &&
      Array.isArray(parsed.options) &&
      parsed.options.length >= 2
    ) {
      // Validate category is a known MissingInfoCategory
      const validCategories = new Set(ALL_CATEGORIES as readonly string[]);
      const category = validCategories.has(parsed.category)
        ? (parsed.category as MissingInfoCategory)
        : 'missing-outcome'; // safe fallback

      return {
        category,
        question: parsed.question,
        options: parsed.options.map(String),
      };
    }
  } catch {
    // JSON parse failed — try to extract from malformed response
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return parseResponse(jsonMatch[0]);
      } catch {
        // Give up
      }
    }
  }

  return null;
}

/**
 * Generate a contextual enrichment question using the active AI adapter (Tier 3).
 *
 * Returns null if no adapter is available or the LLM response can't be parsed.
 * Caller should fall back to template-based questions when this returns null.
 *
 * @param ctx - Full enrichment context including item, history, signals
 * @returns A ClarificationQuestion with contextual text and options, or null
 */
export async function generateT3Question(
  ctx: T3EnrichmentContext,
): Promise<ClarificationQuestion | null> {
  const adapter = getActiveAdapter();
  const adapterId = adapter?.id ?? 'none';
  const adapterStatus = adapter?.status ?? 'unavailable';
  const startMs = performance.now();

  const logEntry: T3ExchangeLog = {
    timestamp: Date.now(),
    adapterId,
    adapterStatus,
    focusCategory: ctx.focusCategory,
    depth: { ...ctx.categoryDepth },
    promptLength: 0,
    promptPreview: '',
    responseRaw: null,
    parsedQuestion: null,
    parsedOptions: null,
    durationMs: 0,
    success: false,
    error: null,
  };

  try {
    const prompt = buildPrompt(ctx);
    logEntry.promptLength = prompt.length;
    logEntry.promptPreview = prompt.slice(0, 300) + (prompt.length > 300 ? '...' : '');

    console.group(`%c[T3 Enrichment] → ${adapterId}`, 'color: #58a6ff; font-weight: bold');
    console.log('Adapter:', adapterId, `(${adapterStatus})`);
    console.log('Focus:', ctx.focusCategory ?? 'auto');
    console.log('Depth:', ctx.categoryDepth);
    console.log('Prior Q&A:', ctx.priorQA.length, 'pairs');
    console.log('Prompt length:', prompt.length, 'chars');
    console.log('Prompt preview:', prompt.slice(0, 500));

    const response = await dispatchAI({
      requestId: crypto.randomUUID(),
      prompt,
      maxTokens: 256,
    });

    logEntry.responseRaw = response.text;
    logEntry.durationMs = Math.round(performance.now() - startMs);

    console.log(`%c← Response (${logEntry.durationMs}ms) from ${response.provider}/${response.model ?? '?'}`, 'color: #22c55e');
    console.log('Raw response:', response.text);

    const parsed = parseResponse(response.text);
    if (!parsed) {
      logEntry.error = 'parse_failure';
      console.warn('Parse FAILED — could not extract JSON from response');
      console.groupEnd();
      _pushLog(logEntry);
      return null;
    }

    logEntry.parsedQuestion = parsed.question;
    logEntry.parsedOptions = parsed.options;
    logEntry.success = true;

    console.log('%cParsed:', 'color: #22c55e', {
      category: parsed.category,
      question: parsed.question,
      options: parsed.options,
    });
    console.groupEnd();

    _pushLog(logEntry);

    return {
      category: parsed.category,
      questionText: parsed.question,
      options: parsed.options,
      categoryLabel: CATEGORY_LABELS[parsed.category] ?? parsed.category,
    };
  } catch (err) {
    logEntry.durationMs = Math.round(performance.now() - startMs);
    logEntry.error = err instanceof Error ? err.message : String(err);

    console.warn(`%c[T3 Enrichment] FAILED (${logEntry.durationMs}ms)`, 'color: #ef4444', err);
    console.groupEnd();

    _pushLog(logEntry);
    return null;
  }
}

/** Push to ring buffer, evicting oldest if full. */
function _pushLog(entry: T3ExchangeLog): void {
  if (_exchangeLog.length >= MAX_LOG_SIZE) _exchangeLog.shift();
  _exchangeLog.push(entry);
}

/**
 * Check if Tier 3 is available for enrichment questions.
 * Returns true if any AI adapter is in 'available' status.
 */
export function isT3Available(): boolean {
  try {
    const adapter = getActiveAdapter();
    return adapter !== null && adapter.status === 'available' && adapter.id !== 'noop';
  } catch {
    return false;
  }
}
