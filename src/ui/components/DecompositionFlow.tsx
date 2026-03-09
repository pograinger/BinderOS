/**
 * DecompositionFlow -- multi-step decomposition overlay for GTD next-action breakdown.
 *
 * Module-level signal pattern (same as AIQuestionFlow.tsx):
 * - showDecompositionFlow: boolean -- controls visibility
 * - startDecomposition: triggers ONNX classification + shows step flow
 *
 * Each decomposed step is presented one at a time with accept/edit/skip controls.
 * After all steps, user is asked "Mark as project?" for the parent atom.
 * Accepted steps are created as new inbox items via CREATE_INBOX_ITEM.
 *
 * Phase 18: DECOMP-05, DECOMP-06
 */

import { createSignal, createEffect, onCleanup, Show, For } from 'solid-js';
import { sendCommand } from '../signals/store';
import { dispatchTiered } from '../../ai/tier2/pipeline';
import { decomposeAtom } from '../../ai/decomposition/decomposer';
import type { DecomposedStep } from '../../ai/decomposition/decomposer';
import type { AtomType } from '../../types/atoms';

// --- Types ---

interface DecompositionFlowState {
  steps: DecomposedStep[];
  currentStepIndex: number;
  acceptedSteps: AcceptedStep[];
  originalText: string;
  originalAtomId: string;
  category: string;
  confidence: number;
  phase: 'stepping' | 'project-prompt' | 'done';
}

interface AcceptedStep {
  text: string;
  type: AtomType;
  edited: boolean;
}

// --- Module-level signals ---

const [showDecompositionFlow, setShowDecompositionFlow] = createSignal(false);
const [decompositionState, setDecompositionState] = createSignal<DecompositionFlowState | null>(null);

export { showDecompositionFlow };

// --- Constants ---

const ATOM_TYPES: AtomType[] = ['task', 'fact', 'event', 'decision', 'insight'];

// --- Public API ---

/**
 * Trigger decomposition for an atom.
 * Calls the tiered pipeline (ONNX classification), then shows the step flow.
 */
export async function startDecomposition(
  atomId: string,
  text: string,
  atomType: 'task' | 'decision',
): Promise<void> {
  try {
    const response = await dispatchTiered({
      requestId: `decompose-${atomId}-${Date.now()}`,
      task: 'decompose',
      features: { content: text, atomType },
    });

    let steps = response.result.decomposition ?? [];
    let category = response.result.reasoning ?? 'unknown';
    let confidence = response.result.confidence;

    // Fallback: if tier 2 unavailable (e.g. ONNX not loaded on mobile),
    // use heuristic classifier with fallback templates
    if (steps.length === 0) {
      const heuristicClassify = async () => ({ category: `fallback-${atomType}`, confidence: 0 });
      const fallback = await decomposeAtom(text, atomType, heuristicClassify);
      steps = fallback.steps;
      category = fallback.category;
      confidence = fallback.confidence;
    }

    if (steps.length === 0) {
      // No steps returned -- nothing to show
      return;
    }

    setDecompositionState({
      steps,
      currentStepIndex: 0,
      acceptedSteps: [],
      originalText: text,
      originalAtomId: atomId,
      category,
      confidence,
      phase: 'stepping',
    });
    setShowDecompositionFlow(true);
  } catch (err) {
    console.warn('[DecompositionFlow] Failed to decompose:', err);
  }
}

// --- Component ---

export function DecompositionFlow() {
  const [editText, setEditText] = createSignal('');
  const [editType, setEditType] = createSignal<AtomType>('task');

  // Sync edit fields when step changes
  createEffect(() => {
    const st = decompositionState();
    if (!st || st.phase !== 'stepping') return;
    const step = st.steps[st.currentStepIndex];
    if (step) {
      setEditText(step.text);
      setEditType(step.suggestedType);
    }
  });

  // Keyboard support
  createEffect(() => {
    if (!showDecompositionFlow()) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeFlow();
      } else if (e.key === 'Enter') {
        const st = decompositionState();
        if (st?.phase === 'stepping') {
          e.preventDefault();
          acceptStep();
        }
      } else if (e.key === 'Tab') {
        const st = decompositionState();
        if (st?.phase === 'stepping') {
          e.preventDefault();
          skipStep();
        }
      }
    };

    document.addEventListener('keydown', handler);
    onCleanup(() => document.removeEventListener('keydown', handler));
  });

  function closeFlow() {
    setShowDecompositionFlow(false);
    setDecompositionState(null);
  }

  function acceptStep() {
    const st = decompositionState();
    if (!st || st.phase !== 'stepping') return;

    const step = st.steps[st.currentStepIndex];
    if (!step) return;

    const accepted: AcceptedStep = {
      text: editText(),
      type: editType(),
      edited: editText() !== step.text || editType() !== step.suggestedType,
    };

    const newAccepted = [...st.acceptedSteps, accepted];
    advanceStep(st, newAccepted);
  }

  function skipStep() {
    const st = decompositionState();
    if (!st || st.phase !== 'stepping') return;
    advanceStep(st, st.acceptedSteps);
  }

  function advanceStep(st: DecompositionFlowState, acceptedSteps: AcceptedStep[]) {
    const nextIndex = st.currentStepIndex + 1;
    if (nextIndex >= st.steps.length) {
      // All steps processed -- go to project prompt
      setDecompositionState({
        ...st,
        currentStepIndex: nextIndex,
        acceptedSteps,
        phase: 'project-prompt',
      });
    } else {
      setDecompositionState({
        ...st,
        currentStepIndex: nextIndex,
        acceptedSteps,
      });
    }
  }

  function handleProjectResponse(isProject: boolean) {
    const st = decompositionState();
    if (!st) return;

    // Create inbox items for all accepted steps
    for (const step of st.acceptedSteps) {
      sendCommand({
        type: 'CREATE_INBOX_ITEM',
        payload: { content: step.text },
      });
    }

    // If marked as project, classify the parent as a task (project marker is informational)
    if (isProject) {
      sendCommand({
        type: 'CLASSIFY_INBOX_ITEM',
        payload: {
          id: st.originalAtomId,
          type: 'task',
          aiSourced: true,
        },
      });
    }

    // Show done phase briefly
    setDecompositionState({ ...st, phase: 'done' });

    // Auto-close after brief confirmation
    setTimeout(() => closeFlow(), 1200);
  }

  return (
    <Show when={showDecompositionFlow() && decompositionState()}>
      {/* Backdrop */}
      <div class="decomposition-flow-backdrop" onClick={closeFlow}>
        <div class="decomposition-flow" onClick={(e) => e.stopPropagation()}>

          {/* Stepping phase */}
          <Show when={decompositionState()!.phase === 'stepping'}>
            {(() => {
              const st = decompositionState()!;
              const step = st.steps[st.currentStepIndex];
              if (!step) return null;
              return (
                <>
                  <div class="decomp-step-header">
                    Step {st.currentStepIndex + 1} of {st.steps.length}
                    <span class="decomp-category">{st.category}</span>
                  </div>

                  <input
                    class="decomp-step-text"
                    type="text"
                    value={editText()}
                    onInput={(e) => setEditText(e.currentTarget.value)}
                  />

                  <div class="decomp-type-buttons">
                    <For each={ATOM_TYPES}>
                      {(atomType) => (
                        <button
                          class={`decomp-type-btn${editType() === atomType ? ' selected' : ''}`}
                          data-type={atomType}
                          onClick={() => setEditType(atomType)}
                        >
                          {atomType}
                        </button>
                      )}
                    </For>
                  </div>

                  <div class="decomp-actions">
                    <button class="decomp-accept-btn" onClick={acceptStep}>
                      Accept
                    </button>
                    <button class="decomp-skip-btn" onClick={skipStep}>
                      Skip
                    </button>
                  </div>
                </>
              );
            })()}
          </Show>

          {/* Project prompt phase */}
          <Show when={decompositionState()!.phase === 'project-prompt'}>
            <div class="decomp-project-prompt">
              <div class="decomp-project-question">
                Mark "{decompositionState()!.originalText}" as a project?
              </div>
              <div class="decomp-project-actions">
                <button class="decomp-accept-btn" onClick={() => handleProjectResponse(true)}>
                  Yes
                </button>
                <button class="decomp-skip-btn" onClick={() => handleProjectResponse(false)}>
                  No
                </button>
              </div>
            </div>
          </Show>

          {/* Done phase */}
          <Show when={decompositionState()!.phase === 'done'}>
            <div class="decomp-summary">
              {decompositionState()!.acceptedSteps.length} step{decompositionState()!.acceptedSteps.length !== 1 ? 's' : ''} added to inbox
            </div>
          </Show>

        </div>
      </div>
    </Show>
  );
}
