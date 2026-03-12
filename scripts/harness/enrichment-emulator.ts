/**
 * Cloud-as-user enrichment Q&A simulation.
 *
 * Uses Haiku to simulate the persona answering 3 enrichment questions
 * naturally about a GTD inbox item. Mines entity signals from the answers
 * via keyword patterns and co-occurrence tracking.
 *
 * Phase 29: TVAL-01
 */

import Anthropic from '@anthropic-ai/sdk';
import type { EntityMention } from '../../src/types/intelligence.js';
import { HarnessEntityStore } from './harness-entity-store.js';
import {
  runHarnessKeywordPatterns,
  updateHarnessCooccurrence,
} from './harness-inference.js';
import type { EnrichmentEmulation, SimulatedQA } from './harness-types.js';

// ---------------------------------------------------------------------------
// Context types
// ---------------------------------------------------------------------------

export interface HarnessEnrichmentContext {
  atomId: string;
  atomContent: string;
  atomType: string;
  /** Human-readable summary of currently known entities + relationships */
  entitySummary: string;
  /** Prior Q&A pairs for this atom (if re-enriching) */
  priorQA: SimulatedQA[];
}

export interface HarnessEnrichmentResult {
  emulation: EnrichmentEmulation;
  /** New entity mentions detected in answers (for attribution tracking) */
  newEntityMentions: EntityMention[];
}

// ---------------------------------------------------------------------------
// Entity summary builder
// ---------------------------------------------------------------------------

/**
 * Build a human-readable entity context block for the enrichment prompt.
 * Shows known entities and their relationships to help the LLM generate
 * contextually aware enrichment answers.
 */
export function buildEntitySummary(
  store: HarnessEntityStore,
  mentionedEntityIds: string[],
): string {
  if (mentionedEntityIds.length === 0) return 'No entities detected yet.';

  const lines: string[] = [];
  const allRelations = store.getRelations();

  for (const entityId of mentionedEntityIds) {
    const entity = store.getEntity(entityId);
    if (!entity) continue;

    const relations = allRelations.filter(
      (r) => r.targetEntityId === entityId || r.sourceEntityId === entityId,
    );

    if (relations.length > 0) {
      const relDesc = relations
        .map((r) => {
          const isSelf = r.sourceEntityId === '[SELF]';
          if (isSelf) {
            return `${r.relationshipType}`;
          }
          const otherEntityId = r.sourceEntityId === entityId ? r.targetEntityId : r.sourceEntityId;
          const otherEntity = store.getEntity(otherEntityId)?.canonicalName ?? otherEntityId;
          return `${r.relationshipType} of ${otherEntity}`;
        })
        .join(', ');
      lines.push(`- ${entity.canonicalName}: ${relDesc}`);
    } else {
      lines.push(`- ${entity.canonicalName}: (relationship unknown)`);
    }
  }

  return lines.length > 0 ? lines.join('\n') : 'No entity relationships known yet.';
}

// ---------------------------------------------------------------------------
// Enrichment question categories
// ---------------------------------------------------------------------------

const ENRICHMENT_QUESTION_TEMPLATES = [
  { category: 'context', question: 'Who is involved in this, and what is your relationship to them?' },
  { category: 'next-action', question: 'What is the very next physical action needed for this?' },
  { category: 'why', question: 'Why does this matter to you right now?' },
  { category: 'deadline', question: 'Is there a deadline or time constraint on this?' },
  { category: 'project', question: 'Does this belong to a larger project or goal? Which one?' },
  { category: 'people', question: 'Is anyone else involved or affected by this?' },
  { category: 'location', question: 'Where does this need to happen, or what tool/place is required?' },
];

function selectQuestions(
  priorQA: SimulatedQA[],
): Array<{ category: string; question: string }> {
  const priorCategories = new Set(priorQA.map((qa) => qa.category));
  const unanswered = ENRICHMENT_QUESTION_TEMPLATES.filter((t) => !priorCategories.has(t.category));
  const pool = unanswered.length >= 3 ? unanswered : ENRICHMENT_QUESTION_TEMPLATES;

  // Prioritize 'context' and 'people' (most useful for entity mining)
  const prioritized = [...pool].sort((a, b) => {
    const highPriority = ['context', 'people'];
    const aP = highPriority.includes(a.category) ? 0 : 1;
    const bP = highPriority.includes(b.category) ? 0 : 1;
    return aP - bP;
  });

  return prioritized.slice(0, 3);
}

// ---------------------------------------------------------------------------
// Enrichment answer entity mining
// ---------------------------------------------------------------------------

const SKIP_WORDS = new Set([
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December',
  'GTD', 'The', 'This', 'That', 'There', 'I', 'My', 'Our', 'Your', 'Their', 'Its',
]);

/**
 * Mine entity mentions from an enrichment answer text.
 * Uses lightweight regex-based proper name detection (NER not available offline).
 * Runs keyword patterns and co-occurrence on mined entities.
 */
async function mineAnswerForEntities(
  atomId: string,
  answer: string,
  store: HarnessEntityStore,
  syntheticTimestamp?: number,
): Promise<EntityMention[]> {
  if (!answer.trim() || answer === '(no answer generated)') return [];

  const mentions: EntityMention[] = [];

  // Match proper names: titles + name, or multi-word capitalized names, or single 3+ char caps
  const namePattern = /(?:Dr\.|Mr\.|Mrs\.|Ms\.|Prof\.)\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?|[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+){1,2}|[A-Z][a-z]{2,}/g;
  let match;

  while ((match = namePattern.exec(answer)) !== null) {
    const entityText = match[0].trim();
    const firstWord = entityText.split(' ')[0];
    if (SKIP_WORDS.has(firstWord) || SKIP_WORDS.has(entityText)) continue;

    const entityId = store.findOrCreateEntity(entityText, 'PER', syntheticTimestamp);
    mentions.push({
      entityText,
      entityType: 'PER',
      entityId,
      spanStart: match.index,
      spanEnd: match.index + entityText.length,
      confidence: 0.7,
    });
  }

  // Run keyword patterns on answer text for relationship signals
  if (mentions.length > 0) {
    await runHarnessKeywordPatterns(store, atomId + '-enrichment', answer, mentions);
    updateHarnessCooccurrence(answer, mentions);
  }

  return mentions;
}

// ---------------------------------------------------------------------------
// Main emulation function
// ---------------------------------------------------------------------------

export async function emulateEnrichmentSession(
  context: HarnessEnrichmentContext,
  personaBio: string,
  store: HarnessEntityStore,
  client: Anthropic,
  syntheticTimestamp?: number,
): Promise<HarnessEnrichmentResult> {
  const questions = selectQuestions(context.priorQA);

  const priorQAText =
    context.priorQA.length > 0
      ? `\n\nPrevious answers about this item:\n${context.priorQA.map((qa) => `Q: ${qa.question}\nA: ${qa.answer}`).join('\n\n')}`
      : '';

  const entityContext =
    context.entitySummary &&
    context.entitySummary !== 'No entities detected yet.' &&
    context.entitySummary !== 'No entity relationships known yet.'
      ? `\n\nPeople and places you have a history with:\n${context.entitySummary}`
      : '';

  const questionsText = questions
    .map((q, i) => `Question ${i + 1}: ${q.question}`)
    .join('\n');

  // Extract persona first name from bio for natural phrasing
  const personaFirstSentence = personaBio.split('.')[0].trim();

  const prompt = `You are ${personaFirstSentence}.

Here is a GTD inbox item you captured:
"${context.atomContent}"
${entityContext}${priorQAText}

Please answer these 3 enrichment questions naturally, as YOU would answer them in your own words.
Do NOT use abstract labels like "my spouse" or "my boss" — reference people by their actual first name or nickname.
Be brief and conversational (1-3 sentences per answer).

${questionsText}

Respond with JSON only:
{
  "answers": [
    {"question": "...", "answer": "..."},
    {"question": "...", "answer": "..."},
    {"question": "...", "answer": "..."}
  ]
}`;

  let simulatedQA: SimulatedQA[] = [];

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    const cleaned = responseText
      .replace(/^```json\s*/m, '')
      .replace(/^```\s*/m, '')
      .replace(/```\s*$/m, '')
      .trim();

    const parsed = JSON.parse(cleaned) as {
      answers: Array<{ question: string; answer: string }>;
    };

    simulatedQA = parsed.answers.map((a, i) => ({
      question: a.question || questions[i]?.question || '',
      answer: a.answer || '',
      category: questions[i]?.category || 'general',
    }));
  } catch {
    // Fallback to placeholder Q&A if API/parse fails
    simulatedQA = questions.map((q) => ({
      question: q.question,
      answer: '(no answer generated)',
      category: q.category,
    }));
  }

  // Mine entity signals from each answer
  const allNewMentions: EntityMention[] = [];
  for (const qa of simulatedQA) {
    const mentions = await mineAnswerForEntities(
      context.atomId,
      qa.answer,
      store,
      syntheticTimestamp,
    );
    allNewMentions.push(...mentions);
  }

  const emulation: EnrichmentEmulation = {
    atomId: context.atomId,
    simulatedQA,
    newEntityMentions: allNewMentions,
  };

  return { emulation, newEntityMentions: allNewMentions };
}
