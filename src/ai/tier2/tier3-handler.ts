/**
 * Tier 3: Generative Intelligence handler.
 *
 * Wraps the existing dispatchAI() as the generative fallback tier.
 * Supports all task types — this is the "always works" tier.
 *
 * For classify-type: extracts the triage prompt from features or builds a minimal one.
 * For other tasks: passes through the prompt to dispatchAI().
 *
 * Pure module — imports dispatchAI from router but no store dependencies.
 */

import type { TierHandler } from './handler';
import type { AITaskType, TieredRequest, TieredResult } from './types';
import type { AtomType } from '../../types/atoms';
import { dispatchAI } from '../router';

const VALID_TYPES: AtomType[] = ['task', 'fact', 'event', 'decision', 'insight'];

/**
 * Build a classification prompt for Tier 3 when no promptOverride is provided.
 */
function buildClassifyPrompt(content: string, title?: string): string {
  return `You are a GTD triage assistant. Classify the following item.

Title: ${title ?? '(none)'}
Content: ${content}

ATOM TYPES:
- task: actionable item with a clear next physical action
- fact: reference information you want to remember or store
- event: time-bound occurrence (meeting, appointment, deadline)
- decision: choice that was made or needs to be made
- insight: realization, idea, or pattern noticed

Respond with ONLY valid JSON:
{"type":"<atom_type>","sectionItemId":null,"reasoning":"<one sentence why>","confidence":"high|low"}`;
}

/**
 * Parse the classify-type JSON response from the LLM.
 */
function parseClassifyResponse(text: string): { type: AtomType; confidence: number; reasoning: string; sectionItemId: string | null } | null {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    if (typeof parsed.type !== 'string' || !VALID_TYPES.includes(parsed.type as AtomType)) {
      return null;
    }

    return {
      type: parsed.type as AtomType,
      confidence: parsed.confidence === 'high' ? 0.9 : 0.7,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
      sectionItemId:
        typeof parsed.sectionItemId === 'string' && parsed.sectionItemId !== 'null'
          ? parsed.sectionItemId
          : null,
    };
  } catch {
    return null;
  }
}

/**
 * Create a Tier 3 generative handler that wraps dispatchAI().
 */
export function createTier3Handler(): TierHandler {
  return {
    tier: 3,
    name: 'Generative Intelligence',

    canHandle(_task: AITaskType): boolean {
      // Tier 3 can handle everything — it's the generative fallback
      return true;
    },

    async handle(request: TieredRequest): Promise<TieredResult> {
      const { task, features } = request;

      try {
        switch (task) {
          case 'classify-type': {
            const prompt = features.promptOverride ?? buildClassifyPrompt(features.content, features.title);
            const response = await dispatchAI({
              requestId: request.requestId,
              prompt,
              maxTokens: 200,
              signal: features.signal,
            });

            const parsed = parseClassifyResponse(response.text);
            if (parsed) {
              return {
                tier: 3,
                confidence: parsed.confidence,
                type: parsed.type,
                sectionItemId: parsed.sectionItemId,
                reasoning: parsed.reasoning,
              };
            }

            return {
              tier: 3,
              confidence: 0.3,
              reasoning: 'Could not parse LLM classification response',
            };
          }

          case 'route-section': {
            const prompt = features.promptOverride ?? buildClassifyPrompt(features.content, features.title);
            const response = await dispatchAI({
              requestId: request.requestId,
              prompt,
              maxTokens: 200,
              signal: features.signal,
            });

            const parsed = parseClassifyResponse(response.text);
            if (parsed) {
              return {
                tier: 3,
                confidence: parsed.sectionItemId ? 0.8 : 0.5,
                sectionItemId: parsed.sectionItemId,
                reasoning: parsed.reasoning,
              };
            }

            return {
              tier: 3,
              confidence: 0.3,
              sectionItemId: null,
              reasoning: 'Could not parse LLM routing response',
            };
          }

          case 'assess-staleness': {
            const prompt = features.promptOverride ??
              `Assess the staleness of this item in 1-2 sentences: "${features.content}"`;
            const response = await dispatchAI({
              requestId: request.requestId,
              prompt,
              maxTokens: 200,
              signal: features.signal,
            });

            return {
              tier: 3,
              confidence: 0.85,
              assessment: response.text,
              reasoning: 'LLM staleness assessment',
            };
          }

          case 'summarize':
          case 'analyze-gtd': {
            const prompt = features.promptOverride ?? features.content;
            const response = await dispatchAI({
              requestId: request.requestId,
              prompt,
              maxTokens: 1000,
              signal: features.signal,
            });

            return {
              tier: 3,
              confidence: 0.9,
              text: response.text,
              reasoning: `LLM ${task}`,
            };
          }

          default:
            return {
              tier: 3,
              confidence: 0,
              reasoning: `Unknown task type: ${task}`,
            };
        }
      } catch (err) {
        // Re-throw abort errors
        if (err instanceof DOMException && err.name === 'AbortError') throw err;

        return {
          tier: 3,
          confidence: 0,
          reasoning: `Tier 3 error: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    },
  };
}
