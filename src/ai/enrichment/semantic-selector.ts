/**
 * Semantic follow-up question selector.
 *
 * At enrichment depth 3+, uses the MiniLM embedding worker to select
 * the most semantically distant question from the question bank,
 * avoiding repetition of previously asked questions.
 *
 * Pure module — no store imports. Requires a Worker reference passed by caller.
 *
 * Phase 25: ITER-01
 */

import type { ClarificationQuestion, MissingInfoCategory } from '../clarification/types';
import { QUESTION_BANK } from './question-bank';
import type { QuestionBankEntry } from './question-bank';

/** Category display labels matching the enrichment engine convention. */
const CATEGORY_LABELS: Record<MissingInfoCategory, string> = {
  'missing-outcome': 'outcome',
  'missing-next-action': 'next action',
  'missing-timeframe': 'timeframe',
  'missing-context': 'context',
  'missing-reference': 'reference',
};

/**
 * Request embeddings from the shared embedding worker.
 * Returns a promise that resolves with the embedding vectors.
 */
function embedViaWorker(worker: Worker, texts: string[]): Promise<number[][]> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();

    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.id !== id) return;

      if (msg.type === 'EMBED_RESULT') {
        worker.removeEventListener('message', handler);
        resolve(msg.vectors as number[][]);
      } else if (msg.type === 'EMBED_ERROR') {
        worker.removeEventListener('message', handler);
        reject(new Error(msg.error as string));
      }
    };

    worker.addEventListener('message', handler);
    worker.postMessage({ type: 'EMBED', id, texts });
  });
}

/**
 * Cosine similarity between two vectors.
 */
function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  const mag = Math.sqrt(normA) * Math.sqrt(normB);
  return mag === 0 ? 0 : dot / mag;
}

/**
 * Apply slot-filling to question bank entries.
 */
function fillPriorAnswer(text: string, priorAnswer: string): string {
  return text.replaceAll('{prior_answer}', priorAnswer);
}

/**
 * Select the most semantically novel follow-up question for a category.
 *
 * Algorithm:
 * 1. Collect all previously asked question texts for this category
 * 2. Get all candidate questions from the question bank
 * 3. Embed previously asked questions + all candidates in one batch
 * 4. For each candidate, compute max similarity to any previously asked question
 * 5. Pick the candidate with the lowest max similarity (most different from everything asked)
 *
 * @param worker - The shared embedding worker
 * @param category - Which category to generate a question for
 * @param priorAnswer - The user's latest answer for slot-filling
 * @param askedQuestions - Previously asked question texts for this category
 * @returns A ClarificationQuestion with semantically novel text and options
 */
export async function selectSemanticFollowUp(
  worker: Worker,
  category: MissingInfoCategory,
  priorAnswer: string,
  askedQuestions: string[],
): Promise<ClarificationQuestion> {
  const bank = QUESTION_BANK[category];
  if (!bank || bank.length === 0) {
    // Fallback if no bank entries
    return {
      category,
      questionText: `Tell me more about "${priorAnswer}":`,
      options: [`Elaborate on "${priorAnswer}"`, 'Let me change this'],
      categoryLabel: CATEGORY_LABELS[category] ?? category,
    };
  }

  // Fill slots in all candidates
  const filledCandidates: Array<{ entry: QuestionBankEntry; text: string }> = bank.map(entry => ({
    entry,
    text: fillPriorAnswer(entry.question, priorAnswer),
  }));

  // If no prior questions asked (shouldn't happen at depth 3+, but safety), pick first
  if (askedQuestions.length === 0) {
    const pick = filledCandidates[0]!;
    return {
      category,
      questionText: pick.text,
      options: pick.entry.options.map(o => fillPriorAnswer(o, priorAnswer)),
      categoryLabel: CATEGORY_LABELS[category] ?? category,
    };
  }

  try {
    // Batch embed: [asked questions..., candidate questions...]
    const allTexts = [
      ...askedQuestions,
      ...filledCandidates.map(c => c.text),
    ];

    const vectors = await embedViaWorker(worker, allTexts);
    const askedVectors = vectors.slice(0, askedQuestions.length);
    const candidateVectors = vectors.slice(askedQuestions.length);

    // Score each candidate: max similarity to any asked question (lower = more novel)
    let bestIdx = 0;
    let bestScore = Infinity;

    for (let i = 0; i < candidateVectors.length; i++) {
      const candidateVec = candidateVectors[i]!;
      let maxSim = -Infinity;

      for (const askedVec of askedVectors) {
        const sim = cosine(candidateVec, askedVec);
        if (sim > maxSim) maxSim = sim;
      }

      if (maxSim < bestScore) {
        bestScore = maxSim;
        bestIdx = i;
      }
    }

    const pick = filledCandidates[bestIdx]!;
    return {
      category,
      questionText: pick.text,
      options: pick.entry.options.map(o => fillPriorAnswer(o, priorAnswer)),
      categoryLabel: CATEGORY_LABELS[category] ?? category,
    };
  } catch (err) {
    // Embedding failed — fall back to random selection from bank
    console.warn('[semantic-selector] Embedding failed, using random selection:', err);
    const idx = Math.floor(Math.random() * filledCandidates.length);
    const pick = filledCandidates[idx]!;
    return {
      category,
      questionText: pick.text,
      options: pick.entry.options.map(o => fillPriorAnswer(o, priorAnswer)),
      categoryLabel: CATEGORY_LABELS[category] ?? category,
    };
  }
}
