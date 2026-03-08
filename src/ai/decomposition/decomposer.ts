/**
 * Main decomposition pipeline: classify -> template lookup -> slot fill -> return steps.
 *
 * Takes input text and atom type, classifies via an injected classify function (ONNX),
 * looks up the matching template, fills slots, and returns personalized GTD steps.
 *
 * Pure module -- no store imports. classifyFn injected by caller (tier2 handler).
 */

import { DECOMPOSITION_CATEGORIES } from './categories';
import type { DecompositionResult, DecomposedStep, TemplateStep } from './categories';
import { extractSlots } from './slot-extractor';
import type { ExtractedSlots } from './slot-extractor';

// --- Constants ---

/** Minimum confidence to use the classified template; below this, use fallback */
const CONFIDENCE_THRESHOLD = 0.60;

// --- Fallback templates ---

const FALLBACK_TASK_STEPS: TemplateStep[] = [
  { template: 'Clarify what done looks like for {topic}', defaultType: 'task', slots: ['topic'] },
  { template: 'Identify the very next physical action for {topic}', defaultType: 'task', slots: ['topic'] },
  { template: 'Do the next action or schedule it', defaultType: 'task', slots: [] },
];

const FALLBACK_DECISION_STEPS: TemplateStep[] = [
  { template: 'Research options for {topic}', defaultType: 'task', slots: ['topic'] },
  { template: 'Define criteria for {topic}', defaultType: 'task', slots: ['topic'] },
  { template: 'Compare top options for {topic}', defaultType: 'task', slots: ['topic'] },
  { template: 'Make and record decision on {topic}', defaultType: 'decision', slots: ['topic'] },
];

// --- Slot filling ---

/**
 * Fill a template string with extracted slots.
 * For undefined slots, removes the placeholder and cleans up whitespace.
 *
 * Example: "Meet with {person} about {topic}" with person=undefined
 *       -> "Meet about {topic}" (with topic then filled)
 */
function fillTemplate(template: string, slots: ExtractedSlots): string {
  let result = template;

  // Replace each slot placeholder
  const slotMap: Record<string, string | undefined> = {
    topic: slots.topic,
    person: slots.person,
    location: slots.location,
    item: slots.item,
    event: slots.event,
  };

  for (const [key, value] of Object.entries(slotMap)) {
    const placeholder = `{${key}}`;
    if (!result.includes(placeholder)) continue;

    if (value !== undefined) {
      result = result.replace(placeholder, value);
    } else {
      // Remove placeholder and clean surrounding whitespace
      // Handle patterns like "to {person} about" -> "about" (remove trailing word before placeholder)
      result = result.replace(new RegExp(`\\s*\\b(?:to|for|with|from)\\s+\\{${key}\\}`, 'g'), '');
      // If still present (no preposition prefix), just remove the placeholder
      result = result.replace(new RegExp(`\\{${key}\\}\\s*`, 'g'), '');
      result = result.replace(new RegExp(`\\s+\\{${key}\\}`, 'g'), '');
    }
  }

  // Clean up any double spaces and trim
  result = result.replace(/\s{2,}/g, ' ').trim();

  return result;
}

// --- Main pipeline ---

/**
 * Decompose an atom into GTD next-action steps.
 *
 * Pipeline:
 * 1. Classify via injected classifyFn (ONNX model)
 * 2. Look up template in DECOMPOSITION_CATEGORIES
 * 3. Filter by atomType applicability
 * 4. Extract slots from input text
 * 5. Fill template steps with extracted slots
 * 6. Return DecompositionResult
 *
 * @param text - Input text to decompose
 * @param atomType - 'task' or 'decision'
 * @param classifyFn - Injected classifier (returns category + confidence)
 */
export async function decomposeAtom(
  text: string,
  atomType: 'task' | 'decision',
  classifyFn: (text: string) => Promise<{ category: string; confidence: number }>,
): Promise<DecompositionResult> {
  // Step 1: Classify
  const { category, confidence } = await classifyFn(text);

  // Step 2: Look up template
  let templateSteps: TemplateStep[];
  let usedCategory = category;

  const template = DECOMPOSITION_CATEGORIES[category];

  if (template && confidence >= CONFIDENCE_THRESHOLD && template.applicableTo.includes(atomType)) {
    // Good match: use the classified template
    templateSteps = template.steps;
  } else {
    // Fallback: generic template
    usedCategory = `fallback-${atomType}`;
    templateSteps = atomType === 'decision' ? FALLBACK_DECISION_STEPS : FALLBACK_TASK_STEPS;
  }

  // Step 3: Extract slots from input text
  const slots = extractSlots(text);

  // Step 4: Fill templates
  const steps: DecomposedStep[] = templateSteps.map((step, index) => ({
    text: fillTemplate(step.template, slots),
    suggestedType: step.defaultType,
    stepIndex: index,
  }));

  return {
    category: usedCategory,
    confidence,
    steps,
    originalText: text,
  };
}

export type { DecomposedStep, DecompositionResult };
