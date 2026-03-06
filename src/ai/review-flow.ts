/**
 * GTD weekly review state machine — three-phase flow builder (AIRV-03).
 *
 * Each phase builder generates a ReviewFlowStep[] queue.
 * The store dequeues steps one at a time, advancing through the queue.
 * Phase transitions trigger AI-generated context summaries.
 *
 * Phase 12: Trigger prompts enriched with section context via templates.
 * Pattern surfacing is now deterministic from atom/section data — no AI call.
 * generatePhaseSummary still uses dispatchAI (stays LLM-eligible).
 *
 * Pure module: no imports from store.ts — all state passed in by caller.
 */

import type { Atom, InboxItem } from '../types/atoms';
import type { Section, SectionItem } from '../types/sections';
import type { CompressionCandidate } from '../types/config';
import type { ReviewFlowStep, ReviewPhase, ReviewAction } from '../types/review';
import { dispatchAI } from './router';
import { enrichTriggerQuestion, derivePatternSteps } from './templates';
import type { SectionContext } from './templates';

// --- GTD Trigger List ---

const TRIGGER_PROMPTS = [
  { id: 'health', label: 'Health & Wellness', description: 'Physical health, medical, fitness, mental health' },
  { id: 'career', label: 'Career & Professional', description: 'Work projects, skills, job, career goals' },
  { id: 'family', label: 'Family & Relationships', description: 'Family, friends, commitments, communication' },
  { id: 'home', label: 'Home & Errands', description: 'Household, repairs, purchases, logistics' },
  { id: 'learning', label: 'Learning & Growth', description: 'Books, courses, skills to develop' },
  { id: 'finance', label: 'Finance & Admin', description: 'Bills, taxes, banking, planning' },
  { id: 'creative', label: 'Creative & Side Projects', description: 'Personal projects, hobbies, ideas' },
];

// --- Phase builders ---

/**
 * Build Get Clear phase steps — one step per inbox item.
 */
export function buildGetClearSteps(inboxItems: InboxItem[]): ReviewFlowStep[] {
  if (inboxItems.length === 0) {
    return [
      {
        stepId: 'get-clear-empty',
        phase: 'get-clear',
        question: 'Your inbox is clear! No items to process.',
        options: [{ id: 'continue', label: 'Continue to next phase' }],
        allowFreeform: false,
      },
    ];
  }

  return inboxItems.map((item): ReviewFlowStep => ({
    stepId: `get-clear-${item.id}`,
    phase: 'get-clear',
    question: `What should we do with "${item.title || item.content.slice(0, 60)}"?`,
    options: [
      {
        id: 'classify-task',
        label: "It's a task",
        description: 'Actionable — needs to be done',
        stagingAction: { type: 'none' },
      },
      {
        id: 'classify-reference',
        label: "It's reference",
        description: 'Keep for future lookup',
        stagingAction: { type: 'none' },
      },
      {
        id: 'trash',
        label: 'Trash it',
        description: 'Not needed anymore',
        stagingAction: { type: 'delete', atomId: item.id },
      },
      {
        id: 'skip',
        label: 'Skip for now',
        stagingAction: { type: 'skip' },
      },
    ],
    allowFreeform: false,
    context: item.content.slice(0, 200),
    atomId: item.id,
  }));
}

/**
 * Build Get Current phase steps — stale atoms, projects missing next actions, compression candidates.
 */
export function buildGetCurrentSteps(
  staleAtoms: Atom[],
  projectsMissingNextAction: SectionItem[],
  compressionCandidates: CompressionCandidate[],
): ReviewFlowStep[] {
  if (staleAtoms.length === 0 && projectsMissingNextAction.length === 0 && compressionCandidates.length === 0) {
    return [
      {
        stepId: 'get-current-empty',
        phase: 'get-current',
        question: 'Your system is healthy — no stale items, all projects have next actions.',
        options: [{ id: 'continue', label: 'Continue to Get Creative' }],
        allowFreeform: false,
      },
    ];
  }

  const steps: ReviewFlowStep[] = [];

  // Stale atom steps (limit to first 10)
  const limitedStaleAtoms = staleAtoms.slice(0, 10);
  for (const atom of limitedStaleAtoms) {
    const staleDays = Math.floor((Date.now() - atom.updated_at) / (1000 * 60 * 60 * 24));
    steps.push({
      stepId: `get-current-stale-${atom.id}`,
      phase: 'get-current',
      question: `"${atom.title}" hasn't been updated in ${staleDays} days. What should we do?`,
      options: [
        {
          id: 'keep',
          label: 'Still relevant',
          description: 'Touch to reset staleness',
          stagingAction: { type: 'defer', atomId: atom.id },
        },
        {
          id: 'archive',
          label: 'Archive it',
          description: 'No longer active',
          stagingAction: { type: 'archive', atomId: atom.id },
        },
        {
          id: 'skip',
          label: 'Skip',
          stagingAction: { type: 'skip' },
        },
      ],
      allowFreeform: false,
      atomId: atom.id,
    });
  }

  // Project missing next action steps (limit to first 10)
  const limitedProjects = projectsMissingNextAction.slice(0, 10);
  for (const item of limitedProjects) {
    steps.push({
      stepId: `get-current-project-${item.id}`,
      phase: 'get-current',
      question: `Project "${item.name}" has no next action. What's the next step?`,
      options: [
        {
          id: 'add-action',
          label: 'Add next action',
          description: 'Capture what needs to happen next',
          stagingAction: { type: 'add-next-action', projectName: item.name },
        },
        {
          id: 'skip',
          label: 'Skip for now',
          stagingAction: { type: 'skip' },
        },
      ],
      allowFreeform: true, // user can type the next action directly
    });
  }

  // Compression candidates: single aggregated step
  if (compressionCandidates.length > 0) {
    steps.push({
      stepId: 'get-current-compression',
      phase: 'get-current',
      question: `${compressionCandidates.length} compression candidate${compressionCandidates.length === 1 ? '' : 's'} detected. AI explanations have been generated — you'll review them in the staging area at the end.`,
      options: [{ id: 'continue', label: 'Got it, continue' }],
      allowFreeform: false,
    });
  }

  return steps;
}

/**
 * Build SectionContext from a section and the full atom list.
 * Atoms are associated with sections via the sectionId field.
 */
function buildSectionContext(section: Section, atoms: Atom[]): SectionContext {
  const sectionAtoms = atoms.filter(a => a.sectionId === section.id);
  const activeTasks = sectionAtoms.filter(a => a.type === 'task' && (a.status === 'open' || a.status === 'in-progress'));
  const activeProjects = sectionAtoms.filter(a => a.type === 'task' && a.status === 'open');
  const lastActivity = sectionAtoms.reduce((max, a) => Math.max(max, a.updated_at), 0);
  const daysSinceLastActivity = lastActivity > 0 ? Math.floor((Date.now() - lastActivity) / 86400000) : 999;
  return {
    section,
    activeTaskCount: activeTasks.length,
    activeProjectCount: activeProjects.length,
    daysSinceLastActivity,
  };
}

/**
 * Build Get Creative phase steps — Someday/Maybe scan, area gap check, trigger list, pattern surfacing, final capture.
 *
 * Phase 12: Trigger prompts enriched with section context (no AI call for trigger list).
 * Pattern surfacing is deterministic from atom/section data via derivePatternSteps.
 * generatePhaseSummary still uses dispatchAI for LLM-eligible summaries.
 */
export async function buildGetCreativeSteps(
  sections: Section[],
  recentDecisions: Atom[],
  recentInsights: Atom[],
  phaseSummaries: string[],
  atoms: Atom[],
  inboxItems: InboxItem[],
  signal?: AbortSignal,
): Promise<ReviewFlowStep[]> {
  const steps: ReviewFlowStep[] = [];

  // Step 1 — Someday/Maybe scan
  steps.push({
    stepId: 'get-creative-someday',
    phase: 'get-creative',
    question: "Let's scan your Someday/Maybe items. Anything you'd like to activate or discard?",
    options: [
      {
        id: 'activate',
        label: 'Activate something',
        description: 'Move a someday item to active',
      },
      {
        id: 'all-good',
        label: 'All good',
        description: 'Nothing to change',
      },
    ],
    allowFreeform: true,
  });

  // Steps 2-N — Area gap check (one per non-projects section)
  const nonProjectSections = sections.filter(s => s.type !== 'projects');
  for (const section of nonProjectSections) {
    steps.push({
      stepId: `get-creative-area-${section.id}`,
      phase: 'get-creative',
      question: `Area: "${section.name}" — any new projects or tasks needed here?`,
      options: [
        {
          id: 'new-project',
          label: 'New project needed',
          stagingAction: { type: 'capture', content: '' },
        },
        {
          id: 'new-task',
          label: 'Quick task to add',
          stagingAction: { type: 'capture', content: '' },
        },
        {
          id: 'all-good',
          label: 'All good here',
        },
      ],
      allowFreeform: true,
    });
  }

  // Trigger list steps — enriched with section context (no AI call)
  for (const trigger of TRIGGER_PROMPTS) {
    const matchingSection = sections.find(s =>
      s.name.toLowerCase().includes(trigger.id) ||
      trigger.id.includes(s.name.toLowerCase()),
    );
    const sectionCtx = matchingSection ? buildSectionContext(matchingSection, atoms) : null;
    const enrichedQuestion = enrichTriggerQuestion(
      trigger.label,
      trigger.description,
      sectionCtx,
    );
    steps.push({
      stepId: `get-creative-trigger-${trigger.id}`,
      phase: 'get-creative',
      question: enrichedQuestion,
      options: [
        {
          id: 'capture',
          label: 'Yes, add to inbox',
          stagingAction: { type: 'capture', content: '' },
        },
        {
          id: 'skip',
          label: 'Nothing here',
        },
      ],
      allowFreeform: true,
    });
  }

  // Deterministic pattern steps (replaces AI pattern surfacing)
  const patternSteps = derivePatternSteps(sections, atoms, inboxItems.length);
  steps.push(...patternSteps);

  // Final step — "Anything else?"
  steps.push({
    stepId: 'get-creative-final',
    phase: 'get-creative',
    question: "Anything else on your mind? One last chance to capture before we wrap up.",
    options: [
      {
        id: 'capture',
        label: 'Yes, one more thing',
        stagingAction: { type: 'capture', content: '' },
      },
      {
        id: 'done',
        label: "I'm done!",
      },
    ],
    allowFreeform: true,
  });

  return steps;
}

/**
 * Generate an AI summary for a completed review phase.
 *
 * Used at phase transitions to maintain context across API calls.
 * Falls back to a simple template if AI is unavailable.
 */
export async function generatePhaseSummary(
  phase: ReviewPhase,
  actionsTaken: ReviewAction[],
  signal?: AbortSignal,
): Promise<string> {
  const phaseLabel = phase === 'get-clear' ? 'Get Clear' : phase === 'get-current' ? 'Get Current' : 'Get Creative';
  const actionList = actionsTaken
    .map(a => `- ${a.phase}: "${a.selectedLabel}"${a.freeformText ? ` (note: ${a.freeformText})` : ''}`)
    .join('\n');

  const prompt = `Summarize this GTD review phase in ~50 words. Phase: ${phaseLabel}. Actions taken:\n${actionList || '(no actions taken)'}\n\nFocus on what was decided, not the process.`;

  try {
    const response = await dispatchAI({
      requestId: crypto.randomUUID(),
      prompt,
      maxTokens: 150,
      signal,
    });
    return response.text.trim();
  } catch {
    return `${phaseLabel} phase complete. ${actionsTaken.length} items reviewed.`;
  }
}
