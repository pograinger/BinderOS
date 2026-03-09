/**
 * ClarificationFlow -- modal overlay for GTD missing-info clarification.
 *
 * Module-level signal pattern (same as DecompositionFlow.tsx):
 * - showClarificationFlow: boolean -- controls visibility
 * - startClarification: opens modal with generated questions
 * - closeClarification: cleans up and closes
 *
 * Presents one question at a time with 3-4 pre-built options + freeform input.
 * Supports skip, partial answers on abandon, cloud option upgrade, and summary view.
 *
 * Phase 19: CLAR-04, CLAR-07
 */

import { createSignal, createEffect, onCleanup, Show, For } from 'solid-js';
import { generateTemplateOptions } from '../../ai/clarification/question-templates';
import { appendEnrichment } from '../../ai/clarification/enrichment';
import { prefetchCloudOptions } from '../../ai/clarification/cloud-options';
import { getBinderConfig } from '../../config/binder-types/index';
import type {
  ClarificationQuestion,
  ClarificationAnswer,
  ClarificationResult,
  MissingInfoCategory,
} from '../../ai/clarification/types';

// --- Types ---

interface ClarificationAtom {
  id: string;
  title: string;
  content: string;
  type: string;
}

// --- Module-level signals ---

const [clarificationActive, setClarificationActive] = createSignal(false);
const [clarificationAtom, setClarificationAtom] = createSignal<ClarificationAtom | null>(null);
const [clarificationQuestions, setClarificationQuestions] = createSignal<ClarificationQuestion[]>([]);
const [currentQuestionIndex, setCurrentQuestionIndex] = createSignal(0);
const [answers, setAnswers] = createSignal<ClarificationAnswer[]>([]);
const [showSummary, setShowSummary] = createSignal(false);
const [cloudOptions, setCloudOptions] = createSignal<Map<MissingInfoCategory, string[] | null>>(new Map());

/** Callback set by caller to handle completed clarification. */
let onCompleteCallback: ((result: ClarificationResult) => void) | null = null;

/** Cloud prefetch promises for lazy consumption. */
let cloudPrefetchMap: Map<MissingInfoCategory, Promise<string[] | null>> | null = null;

export { clarificationActive as showClarificationFlow };

// --- Public API ---

/**
 * Start a clarification session for an atom.
 *
 * Generates template questions for each missing category, ordered per binder config.
 * Optionally kicks off cloud option prefetch when cloud is available.
 */
export function startClarification(
  atom: ClarificationAtom,
  missingCategories: MissingInfoCategory[],
  onComplete: (result: ClarificationResult) => void,
): void {
  const config = getBinderConfig();
  const ordering = config.categoryOrdering as string[];

  // Sort categories per binder config ordering
  const sorted = [...missingCategories].sort((a, b) => {
    const ia = ordering.indexOf(a);
    const ib = ordering.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  // Generate template questions for each category
  const questions = sorted.map((cat) =>
    generateTemplateOptions(cat, atom.type, { topic: atom.title || atom.content.slice(0, 30) }),
  );

  setClarificationAtom(atom);
  setClarificationQuestions(questions);
  setCurrentQuestionIndex(0);
  setAnswers([]);
  setShowSummary(false);
  setCloudOptions(new Map());
  onCompleteCallback = onComplete;

  // Kick off cloud option prefetch (non-blocking)
  try {
    cloudPrefetchMap = prefetchCloudOptions(sorted, atom.content, atom.type);
    // As each prefetch resolves, update cloudOptions map
    for (const [category, promise] of cloudPrefetchMap) {
      promise.then((options) => {
        if (options && clarificationActive()) {
          setCloudOptions((prev) => {
            const next = new Map(prev);
            next.set(category, options);
            return next;
          });
        }
      }).catch(() => {
        // Cloud failure is fine -- template options remain
      });
    }
  } catch {
    // Cloud unavailable -- template options used
    cloudPrefetchMap = null;
  }

  setClarificationActive(true);
}

/**
 * Close the clarification modal.
 * Applies partial answers if any were given.
 */
export function closeClarification(): void {
  const atom = clarificationAtom();
  const currentAnswers = answers();

  if (atom && currentAnswers.length > 0 && onCompleteCallback) {
    finishClarification(atom, currentAnswers);
  }

  cleanup();
}

// --- Internal helpers ---

function cleanup(): void {
  setClarificationActive(false);
  setClarificationAtom(null);
  setClarificationQuestions([]);
  setCurrentQuestionIndex(0);
  setAnswers([]);
  setShowSummary(false);
  setCloudOptions(new Map());
  onCompleteCallback = null;
  cloudPrefetchMap = null;
}

function finishClarification(atom: ClarificationAtom, finalAnswers: ClarificationAnswer[]): void {
  const questions = clarificationQuestions();
  const enrichedContent = appendEnrichment(atom.content, finalAnswers);

  const allCategories = questions.map((q) => q.category);
  const answeredCategories = finalAnswers
    .filter((a) => !a.wasSkipped)
    .map((a) => a.category);
  const skippedCategories = finalAnswers
    .filter((a) => a.wasSkipped)
    .map((a) => a.category);

  const result: ClarificationResult = {
    atomId: atom.id,
    answers: finalAnswers,
    enrichedContent,
    categoriesDetected: allCategories,
    categoriesAnswered: answeredCategories,
    categoriesSkipped: skippedCategories,
  };

  onCompleteCallback?.(result);
}

function recordAnswer(answer: ClarificationAnswer): void {
  setAnswers((prev) => [...prev, answer]);

  const questions = clarificationQuestions();
  const nextIndex = currentQuestionIndex() + 1;

  if (nextIndex >= questions.length) {
    setShowSummary(true);
  } else {
    setCurrentQuestionIndex(nextIndex);
  }
}

/** Get the effective options for a question (cloud-upgraded if available). */
function getEffectiveOptions(question: ClarificationQuestion): string[] {
  const cloud = cloudOptions().get(question.category);
  if (cloud && cloud.length >= 2) return cloud;
  return question.options;
}

// --- Category display labels for summary ---

const CATEGORY_DISPLAY: Record<string, string> = {
  'missing-outcome': 'Outcome',
  'missing-next-action': 'Next Action',
  'missing-timeframe': 'Deadline',
  'missing-context': 'Context',
  'missing-reference': 'Reference',
};

// --- Component ---

export function ClarificationFlow() {
  const [freeformText, setFreeformText] = createSignal('');

  // Reset freeform when question changes
  createEffect(() => {
    currentQuestionIndex(); // track
    setFreeformText('');
  });

  // Keyboard support
  createEffect(() => {
    if (!clarificationActive()) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showSummary()) {
          handleDone();
        } else {
          closeClarification();
        }
      }
    };

    document.addEventListener('keydown', handler);
    onCleanup(() => document.removeEventListener('keydown', handler));
  });

  function handleOptionSelect(option: string): void {
    const questions = clarificationQuestions();
    const question = questions[currentQuestionIndex()];
    if (!question) return;

    recordAnswer({
      category: question.category,
      selectedOption: option,
      wasFreeform: false,
      freeformText: null,
      wasSkipped: false,
    });
  }

  function handleFreeformSubmit(): void {
    const text = freeformText().trim();
    if (!text) return;

    const questions = clarificationQuestions();
    const question = questions[currentQuestionIndex()];
    if (!question) return;

    recordAnswer({
      category: question.category,
      selectedOption: null,
      wasFreeform: true,
      freeformText: text,
      wasSkipped: false,
    });
  }

  function handleSkip(): void {
    const questions = clarificationQuestions();
    const question = questions[currentQuestionIndex()];
    if (!question) return;

    recordAnswer({
      category: question.category,
      selectedOption: null,
      wasFreeform: false,
      freeformText: null,
      wasSkipped: true,
    });
  }

  function handleDone(): void {
    const atom = clarificationAtom();
    const currentAnswers = answers();

    if (atom && onCompleteCallback) {
      finishClarification(atom, currentAnswers);
    }

    cleanup();
  }

  /** Build a summary of what was answered for display. */
  function getAnsweredSummary(): Array<{ label: string; value: string }> {
    return answers()
      .filter((a) => !a.wasSkipped)
      .map((a) => ({
        label: CATEGORY_DISPLAY[a.category] ?? a.category,
        value: a.wasFreeform ? (a.freeformText ?? '') : (a.selectedOption ?? ''),
      }));
  }

  return (
    <Show when={clarificationActive() && clarificationAtom()}>
      {/* Backdrop */}
      <div class="clarification-flow-backdrop" onClick={closeClarification}>
        <div class="clarification-flow" onClick={(e) => e.stopPropagation()}>

          {/* Header: original atom content pinned at top */}
          <div class="clarification-header">
            <div class="clarification-header-label">Clarifying:</div>
            <div class="clarification-header-content">
              {clarificationAtom()!.title || clarificationAtom()!.content.slice(0, 80)}
            </div>
          </div>

          {/* Question view */}
          <Show when={!showSummary()}>
            {(() => {
              const questions = clarificationQuestions();
              const question = questions[currentQuestionIndex()];
              if (!question) return null;
              const options = getEffectiveOptions(question);
              return (
                <>
                  <div class="clarification-step-header">
                    Question {currentQuestionIndex() + 1} of {questions.length}
                    <span class="clarification-category-badge">{question.categoryLabel}</span>
                  </div>

                  <div class="clarification-question-text">
                    {question.questionText}
                  </div>

                  <div class="clarification-options">
                    <For each={options}>
                      {(option) => (
                        <button
                          class="clarification-option-btn"
                          onClick={() => handleOptionSelect(option)}
                        >
                          {option}
                        </button>
                      )}
                    </For>
                  </div>

                  <div class="clarification-freeform">
                    <input
                      class="clarification-freeform-input"
                      type="text"
                      placeholder="Or type your own..."
                      value={freeformText()}
                      onInput={(e) => setFreeformText(e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleFreeformSubmit();
                        }
                      }}
                    />
                  </div>

                  <div class="clarification-actions">
                    <button class="clarification-skip-btn" onClick={handleSkip}>
                      Skip
                    </button>
                  </div>
                </>
              );
            })()}
          </Show>

          {/* Summary view */}
          <Show when={showSummary()}>
            <div class="clarification-summary">
              <div class="clarification-summary-title">Clarification Complete</div>

              <Show when={getAnsweredSummary().length > 0}>
                <div class="clarification-summary-label">
                  Added: {getAnsweredSummary().map((s) => s.label).join(', ')}
                </div>
                <div class="clarification-summary-items">
                  <For each={getAnsweredSummary()}>
                    {(item) => (
                      <div class="clarification-summary-item">
                        <span class="clarification-summary-key">{item.label}:</span>
                        <span class="clarification-summary-value">{item.value}</span>
                      </div>
                    )}
                  </For>
                </div>
              </Show>

              <Show when={getAnsweredSummary().length === 0}>
                <div class="clarification-summary-label">All questions skipped</div>
              </Show>

              <button class="clarification-done-btn" onClick={handleDone}>
                Done
              </button>
            </div>
          </Show>

        </div>
      </div>
    </Show>
  );
}
