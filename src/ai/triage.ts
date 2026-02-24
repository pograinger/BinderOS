/**
 * AI triage pipeline — batch processing engine for inbox items (AITG-01 through AITG-05).
 *
 * Processes inbox items sequentially through the active AI adapter. For each item,
 * builds a structured prompt including entropy signals and available sections,
 * dispatches to the AI adapter, and parses the JSON response into a TriageSuggestion.
 *
 * Key design decisions:
 * - Sequential processing prevents rate limit exhaustion (RESEARCH.md Pitfall 3)
 * - AbortController cancellation preserves completed suggestions (AIUX-06 / CONTEXT.md)
 * - Pending placeholder emitted before AI call so UI can show "Analyzing..." (CONTEXT.md)
 * - No per-token card animation — each card gets its full suggestion when parseTriageResponse returns
 * - Pure module: no imports from store.ts — all state passed in by caller (store.ts orchestrates)
 *
 * Phase 5: AITG-01, AITG-02, AITG-03, AITG-04, AITG-05, AIUX-06
 */

import type { AtomType, InboxItem } from '../types/atoms';
import type { AtomScore, EntropyScore } from '../types/config';
import type { SectionItem, Section } from '../types/sections';
import { dispatchAI } from './router';
import { findRelatedAtoms } from './similarity';

// --- TriageSuggestion interface ---

export interface TriageSuggestion {
  inboxItemId: string;
  suggestedType: AtomType;
  suggestedSectionItemId: string | null;
  reasoning: string;
  confidence: 'high' | 'low';
  relatedAtomIds: string[];
  status: 'pending' | 'complete' | 'error';
  errorMessage?: string;
}

// --- Module-level AbortController for cancellation ---

let triageAbortController: AbortController | null = null;

// --- Prompt builder ---

/**
 * Build a structured GTD triage prompt for a single inbox item.
 *
 * Includes:
 * - Inbox item title and content (AITG-01)
 * - Atom type definitions with brief descriptions (AITG-01)
 * - Available section items with parent section names (AITG-02)
 * - Entropy context: system entropy level/score, stale count, open tasks (AITG-03)
 * - Per-item score context: staleness, priorityTier (AITG-03)
 * - Instruction to respond with ONLY valid JSON
 */
export function buildTriagePrompt(
  item: InboxItem,
  score: AtomScore | undefined,
  entropyScore: EntropyScore | null,
  sectionItems: Array<{ id: string; name: string; sectionName: string }>,
): string {
  const sectionList = sectionItems
    .map((si) => `- "${si.name}" (id: ${si.id}, in: ${si.sectionName})`)
    .join('\n');

  const entropyCtx = entropyScore
    ? `System entropy: ${entropyScore.level} (score: ${entropyScore.score.toFixed(0)}%). ${entropyScore.staleCount} stale atoms, ${entropyScore.openTasks} open tasks.`
    : 'System entropy: unknown.';

  const scoreCtx = score
    ? `This item: staleness=${score.staleness.toFixed(2)}, priorityTier=${score.priorityTier ?? 'none'}.`
    : '';

  return `You are a GTD (Getting Things Done) triage assistant. Classify the following inbox item.

INBOX ITEM:
Title: ${item.title || '(none)'}
Content: ${item.content}

CONTEXT:
${entropyCtx}
${scoreCtx}

ATOM TYPES:
- task: actionable item with a clear next physical action
- fact: reference information you want to remember or store
- event: time-bound occurrence (meeting, appointment, deadline)
- decision: choice that was made or needs to be made
- insight: realization, idea, or pattern noticed

AVAILABLE SECTIONS (pick one id or use null):
${sectionList || '(none available)'}

Respond with ONLY valid JSON, no markdown, no explanation:
{"type":"<atom_type>","sectionItemId":"<id_or_null>","reasoning":"<one sentence why>","confidence":"<high_or_low>"}`;
}

// --- Response parser ---

const VALID_TYPES: AtomType[] = ['task', 'fact', 'event', 'decision', 'insight'];

/**
 * Parse the AI response JSON for a triage suggestion.
 *
 * Uses regex to extract the JSON block first (models sometimes add wrapper text),
 * then validates the parsed type against the known AtomType enum.
 *
 * Returns null on parse failure — the caller should set status: 'error' with a message.
 */
export function parseTriageResponse(
  inboxItemId: string,
  responseText: string,
  relatedAtomIds: string[],
): TriageSuggestion | null {
  try {
    const match = responseText.match(/\{[\s\S]*\}/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]) as Record<string, unknown>;

    if (typeof parsed.type !== 'string' || !VALID_TYPES.includes(parsed.type as AtomType)) {
      return null;
    }

    return {
      inboxItemId,
      suggestedType: parsed.type as AtomType,
      suggestedSectionItemId:
        typeof parsed.sectionItemId === 'string' && parsed.sectionItemId !== 'null'
          ? parsed.sectionItemId
          : null,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
      confidence: parsed.confidence === 'high' ? 'high' : 'low',
      relatedAtomIds,
      status: 'complete',
    };
  } catch {
    return null;
  }
}

// --- Main triage pipeline ---

/**
 * Process all inbox items through the AI adapter sequentially.
 *
 * For each item:
 * 1. Emits a pending placeholder via onSuggestion (shows "Analyzing..." on the card)
 * 2. Calls findRelatedAtoms for AITG-04 keyword similarity
 * 3. Builds the prompt with entropy + score context
 * 4. Dispatches to the active AI adapter via dispatchAI
 * 5. Parses the response, emits the complete suggestion (or error)
 *
 * Cancellation: checks signal.aborted before each item. Completed suggestions are preserved.
 * No per-token card animation — each card gets its full suggestion only when parsing succeeds.
 *
 * @param inboxItems - Items to triage
 * @param scores - Per-atom scoring results from compute engine
 * @param entropyScore - System entropy indicator
 * @param sectionItems - Available sections for suggestion (AITG-02)
 * @param sections - Parent section list (used to resolve sectionItem.sectionId -> Section.name)
 * @param atoms - All atoms for related-atom keyword similarity (AITG-04)
 * @param onSuggestion - Called for each item: first with pending placeholder, then with result
 * @param onError - Called when an individual item fails (not aborted)
 */
export async function triageInbox(
  inboxItems: InboxItem[],
  scores: Record<string, AtomScore>,
  entropyScore: EntropyScore | null,
  sectionItems: SectionItem[],
  sections: Section[],
  atoms: Array<{ id: string; title?: string; content: string }>,
  onSuggestion: (suggestion: TriageSuggestion) => void,
  onError: (itemId: string, error: string) => void,
): Promise<void> {
  // Cancel any previous in-flight triage
  triageAbortController?.abort();
  triageAbortController = new AbortController();
  const signal = triageAbortController.signal;

  // Build section list with resolved parent section names once (reused for every item)
  const resolvedSectionItems = sectionItems.map((si) => ({
    id: si.id,
    name: si.name,
    sectionName: sections.find((s) => s.id === si.sectionId)?.name ?? '',
  }));

  for (const item of inboxItems) {
    // Check for cancellation before processing each item
    // This preserves already-completed suggestions (CONTEXT.md / AIUX-06)
    if (signal.aborted) break;

    // Emit pending placeholder so the UI can show "Analyzing..." on the current card
    onSuggestion({
      inboxItemId: item.id,
      suggestedType: 'fact',
      suggestedSectionItemId: null,
      reasoning: '',
      confidence: 'low',
      relatedAtomIds: [],
      status: 'pending',
    });

    try {
      // Find related atoms via keyword similarity (AITG-04) — synchronous, no model needed
      const relatedAtomIds = findRelatedAtoms(
        item.content + ' ' + (item.title ?? ''),
        atoms,
      );

      // Build structured prompt with entropy signals (AITG-03)
      const prompt = buildTriagePrompt(item, scores[item.id], entropyScore, resolvedSectionItems);

      // Dispatch to active AI adapter (main thread — not the BinderCore worker)
      const response = await dispatchAI({
        requestId: crypto.randomUUID(),
        prompt,
        maxTokens: 200,
        signal,
      });

      if (signal.aborted) break;

      // Parse JSON response — resilient to model adding extra text around JSON
      const suggestion = parseTriageResponse(item.id, response.text, relatedAtomIds);

      if (suggestion) {
        // Complete suggestion — replaces the pending placeholder
        onSuggestion(suggestion);
      } else {
        // Parse failure — set error status on this card (RESEARCH.md Pitfall 4)
        onSuggestion({
          inboxItemId: item.id,
          suggestedType: 'fact',
          suggestedSectionItemId: null,
          reasoning: '',
          confidence: 'low',
          relatedAtomIds,
          status: 'error',
          errorMessage: 'Could not parse AI response',
        });
      }
    } catch (err) {
      // Only surface as error if not due to cancellation
      if (!signal.aborted) {
        onError(item.id, err instanceof Error ? err.message : String(err));
      }
    }
  }
}

// --- Cancellation ---

/**
 * Cancel any in-flight triage batch.
 *
 * Aborts the current AbortController, which:
 * - Stops the sequential loop after the current item completes
 * - Signals the CloudAdapter to abort its SSE stream (via request.signal)
 * - Preserves all suggestions already added to the Map (partial results kept)
 */
export function cancelTriage(): void {
  triageAbortController?.abort();
  triageAbortController = null;
}
