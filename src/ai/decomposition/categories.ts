/**
 * Decomposition pattern categories and template definitions.
 *
 * Each category maps to a set of 3-5 GTD-style "next physical action" steps
 * with placeholder slots filled from the input text at runtime.
 *
 * Category names match the labels in decomposition-classes.json produced by
 * the training pipeline (scripts/train/30_generate_decomposition_data.py).
 *
 * Pure module -- no store imports.
 */

import type { AtomType } from '../../types/atoms';

// --- Types ---

/**
 * A single step in a decomposition template.
 */
export interface TemplateStep {
  /** Template string with {slot} placeholders, e.g. "Research {topic} options" */
  template: string;
  /** AI-suggested atom type for this step */
  defaultType: AtomType;
  /** Which slots this step needs, e.g. ['topic'] */
  slots: string[];
}

/**
 * A decomposition template for a pattern category.
 */
export interface DecompositionTemplate {
  /** Category label matching the ONNX classifier output */
  category: string;
  /** Which atom types this template applies to */
  applicableTo: ('task' | 'decision')[];
  /** Ordered steps to decompose the atom into */
  steps: TemplateStep[];
}

/**
 * A single decomposed step with filled template text.
 */
export interface DecomposedStep {
  /** Filled template text */
  text: string;
  /** From template defaultType */
  suggestedType: AtomType;
  /** 0-based position in template */
  stepIndex: number;
}

/**
 * Result of decomposing an atom.
 */
export interface DecompositionResult {
  /** Classified pattern category */
  category: string;
  /** Classification confidence */
  confidence: number;
  /** Filled decomposition steps */
  steps: DecomposedStep[];
  /** Original input text */
  originalText: string;
}

// --- Category definitions ---
// 25 task patterns + 10 decision patterns = 35 total
// All step templates use verb-first GTD "next physical action" style.

export const DECOMPOSITION_CATEGORIES: Record<string, DecompositionTemplate> = {
  // ==================== TASK PATTERNS (25) ====================

  'administrative': {
    category: 'administrative',
    applicableTo: ['task'],
    steps: [
      { template: 'Gather all required documents for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Fill out forms or paperwork for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Submit completed paperwork for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Confirm receipt and follow up on {topic}', defaultType: 'task', slots: ['topic'] },
    ],
  },

  'career-move': {
    category: 'career-move',
    applicableTo: ['task'],
    steps: [
      { template: 'Update resume and portfolio for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Research companies and roles related to {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Reach out to contacts in your network about {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Apply or schedule interviews for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Prepare for interviews about {topic}', defaultType: 'task', slots: ['topic'] },
    ],
  },

  'childcare-parenting': {
    category: 'childcare-parenting',
    applicableTo: ['task'],
    steps: [
      { template: 'Research options and recommendations for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Schedule appointment or session for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Prepare supplies or materials needed for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Follow through on {topic} plan', defaultType: 'task', slots: ['topic'] },
    ],
  },

  'communication-task': {
    category: 'communication-task',
    applicableTo: ['task'],
    steps: [
      { template: 'Draft message or talking points for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Send message to {person} about {topic}', defaultType: 'task', slots: ['person', 'topic'] },
      { template: 'Follow up if no response within 48 hours on {topic}', defaultType: 'task', slots: ['topic'] },
    ],
  },

  'complete-application': {
    category: 'complete-application',
    applicableTo: ['task'],
    steps: [
      { template: 'Collect required documents for {topic} application', defaultType: 'task', slots: ['topic'] },
      { template: 'Fill out {topic} application form', defaultType: 'task', slots: ['topic'] },
      { template: 'Write personal statement or cover letter for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Submit {topic} application before deadline', defaultType: 'task', slots: ['topic'] },
      { template: 'Confirm submission and note follow-up date for {topic}', defaultType: 'task', slots: ['topic'] },
    ],
  },

  'create-content': {
    category: 'create-content',
    applicableTo: ['task'],
    steps: [
      { template: 'Outline the structure and key points for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Draft the first version of {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Review and edit {topic} draft', defaultType: 'task', slots: ['topic'] },
      { template: 'Publish or share {topic}', defaultType: 'task', slots: ['topic'] },
    ],
  },

  'digital-cleanup': {
    category: 'digital-cleanup',
    applicableTo: ['task'],
    steps: [
      { template: 'Identify files and accounts to clean up for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Back up important data before {topic} cleanup', defaultType: 'task', slots: ['topic'] },
      { template: 'Delete or archive unnecessary items for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Organize remaining files and update {topic} structure', defaultType: 'task', slots: ['topic'] },
    ],
  },

  'errand-run': {
    category: 'errand-run',
    applicableTo: ['task'],
    steps: [
      { template: 'Make a list of items needed for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Plan the route to {location} for {topic}', defaultType: 'task', slots: ['location', 'topic'] },
      { template: 'Go to {location} and complete {topic}', defaultType: 'task', slots: ['location', 'topic'] },
      { template: 'Put away purchases and update {topic} list', defaultType: 'task', slots: ['topic'] },
    ],
  },

  'financial-task': {
    category: 'financial-task',
    applicableTo: ['task'],
    steps: [
      { template: 'Gather account statements and records for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Review numbers and identify issues with {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Take action: pay, transfer, or adjust {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'File records and set reminder for next {topic} review', defaultType: 'task', slots: ['topic'] },
    ],
  },

  'fitness-goal': {
    category: 'fitness-goal',
    applicableTo: ['task'],
    steps: [
      { template: 'Define specific target and timeline for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Create a weekly schedule for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Prepare gear and supplies needed for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Complete the first {topic} session', defaultType: 'task', slots: ['topic'] },
    ],
  },

  'gift-giving': {
    category: 'gift-giving',
    applicableTo: ['task'],
    steps: [
      { template: 'Brainstorm gift ideas for {person} related to {topic}', defaultType: 'task', slots: ['person', 'topic'] },
      { template: 'Set a budget for {topic} gift', defaultType: 'decision', slots: ['topic'] },
      { template: 'Purchase or order {topic} gift', defaultType: 'task', slots: ['topic'] },
      { template: 'Wrap and deliver {topic} gift to {person}', defaultType: 'task', slots: ['person', 'topic'] },
    ],
  },

  'home-improvement': {
    category: 'home-improvement',
    applicableTo: ['task'],
    steps: [
      { template: 'Research materials and methods for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Buy supplies needed for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Clear and prep the area for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Complete {topic} work', defaultType: 'task', slots: ['topic'] },
      { template: 'Clean up and inspect {topic} result', defaultType: 'task', slots: ['topic'] },
    ],
  },

  'learn-skill': {
    category: 'learn-skill',
    applicableTo: ['task'],
    steps: [
      { template: 'Find a course, book, or tutorial for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Schedule regular practice time for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Complete the first lesson or chapter on {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Practice {topic} with a small real project', defaultType: 'task', slots: ['topic'] },
    ],
  },

  'maintenance-routine': {
    category: 'maintenance-routine',
    applicableTo: ['task'],
    steps: [
      { template: 'Check current condition of {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Gather cleaning supplies or parts for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Perform {topic} maintenance', defaultType: 'task', slots: ['topic'] },
      { template: 'Set next maintenance reminder for {topic}', defaultType: 'task', slots: ['topic'] },
    ],
  },

  'meal-prep': {
    category: 'meal-prep',
    applicableTo: ['task'],
    steps: [
      { template: 'Choose recipes for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Write shopping list for {topic} ingredients', defaultType: 'task', slots: ['topic'] },
      { template: 'Buy ingredients for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Prep and cook {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Store and label {topic} portions', defaultType: 'task', slots: ['topic'] },
    ],
  },

  'medical-health': {
    category: 'medical-health',
    applicableTo: ['task'],
    steps: [
      { template: 'Call to schedule appointment for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Gather insurance info and medical records for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Attend {topic} appointment', defaultType: 'task', slots: ['topic'] },
      { template: 'Follow up on {topic} results or prescriptions', defaultType: 'task', slots: ['topic'] },
    ],
  },

  'moving-relocate': {
    category: 'moving-relocate',
    applicableTo: ['task'],
    steps: [
      { template: 'Sort and declutter belongings before {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Get quotes from movers or rent a truck for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Pack boxes and label them for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Update address for utilities, subscriptions, and mail for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Complete the move and unpack essentials for {topic}', defaultType: 'task', slots: ['topic'] },
    ],
  },

  'organize-space': {
    category: 'organize-space',
    applicableTo: ['task'],
    steps: [
      { template: 'Empty and sort everything in {location} for {topic}', defaultType: 'task', slots: ['location', 'topic'] },
      { template: 'Discard or donate items you no longer need for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Get storage containers or organizers for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Put everything back in {location} organized for {topic}', defaultType: 'task', slots: ['location', 'topic'] },
    ],
  },

  'pet-care': {
    category: 'pet-care',
    applicableTo: ['task'],
    steps: [
      { template: 'Schedule vet appointment for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Buy supplies needed for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Complete {topic} care routine', defaultType: 'task', slots: ['topic'] },
      { template: 'Set reminder for next {topic} check', defaultType: 'task', slots: ['topic'] },
    ],
  },

  'plan-event': {
    category: 'plan-event',
    applicableTo: ['task'],
    steps: [
      { template: 'Set date, time, and location for {topic}', defaultType: 'decision', slots: ['topic'] },
      { template: 'Create guest list and send invitations for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Arrange food, drinks, and supplies for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Confirm RSVPs and finalize details for {topic}', defaultType: 'task', slots: ['topic'] },
    ],
  },

  'plan-trip': {
    category: 'plan-trip',
    applicableTo: ['task'],
    steps: [
      { template: 'Choose dates and destination for {topic}', defaultType: 'decision', slots: ['topic'] },
      { template: 'Book transportation for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Reserve accommodation for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Plan activities and create itinerary for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Pack bags and prepare travel documents for {topic}', defaultType: 'task', slots: ['topic'] },
    ],
  },

  'repair-fix': {
    category: 'repair-fix',
    applicableTo: ['task'],
    steps: [
      { template: 'Diagnose the exact problem with {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Look up repair instructions or find a professional for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Get parts or tools needed to fix {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Complete the repair on {topic}', defaultType: 'task', slots: ['topic'] },
    ],
  },

  'research-purchase': {
    category: 'research-purchase',
    applicableTo: ['task'],
    steps: [
      { template: 'Define requirements and budget for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Research top options and read reviews for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Compare top 3 options for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Purchase {topic}', defaultType: 'task', slots: ['topic'] },
    ],
  },

  'social-plan': {
    category: 'social-plan',
    applicableTo: ['task'],
    steps: [
      { template: 'Reach out to {person} to suggest {topic}', defaultType: 'task', slots: ['person', 'topic'] },
      { template: 'Agree on date and location for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Make reservations or arrangements for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Confirm plans the day before {topic}', defaultType: 'task', slots: ['topic'] },
    ],
  },

  'volunteer-community': {
    category: 'volunteer-community',
    applicableTo: ['task'],
    steps: [
      { template: 'Research organizations and opportunities for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Contact coordinator and sign up for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Complete any required training for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Attend first {topic} volunteer session', defaultType: 'task', slots: ['topic'] },
    ],
  },

  // ==================== DECISION PATTERNS (10) ====================

  'decide-career': {
    category: 'decide-career',
    applicableTo: ['decision'],
    steps: [
      { template: 'List pros and cons of each career option for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Talk to people currently in roles related to {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Evaluate financial impact of {topic} decision', defaultType: 'task', slots: ['topic'] },
      { template: 'Make and record decision on {topic}', defaultType: 'decision', slots: ['topic'] },
    ],
  },

  'decide-education': {
    category: 'decide-education',
    applicableTo: ['decision'],
    steps: [
      { template: 'Research program options for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Compare curriculum, cost, and schedule for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Talk to alumni or students about {topic} programs', defaultType: 'task', slots: ['topic'] },
      { template: 'Make and record decision on {topic}', defaultType: 'decision', slots: ['topic'] },
    ],
  },

  'decide-financial': {
    category: 'decide-financial',
    applicableTo: ['decision'],
    steps: [
      { template: 'Gather current financial data relevant to {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Research options and rates for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Calculate projected outcomes for each {topic} option', defaultType: 'task', slots: ['topic'] },
      { template: 'Make and record decision on {topic}', defaultType: 'decision', slots: ['topic'] },
    ],
  },

  'decide-health': {
    category: 'decide-health',
    applicableTo: ['decision'],
    steps: [
      { template: 'Research medical options and evidence for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Consult with healthcare provider about {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Weigh risks and benefits of each {topic} option', defaultType: 'task', slots: ['topic'] },
      { template: 'Make and record decision on {topic}', defaultType: 'decision', slots: ['topic'] },
    ],
  },

  'decide-living': {
    category: 'decide-living',
    applicableTo: ['decision'],
    steps: [
      { template: 'Define must-haves and deal-breakers for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Research neighborhoods and options for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Visit top candidates and compare for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Calculate total cost for each {topic} option', defaultType: 'task', slots: ['topic'] },
      { template: 'Make and record decision on {topic}', defaultType: 'decision', slots: ['topic'] },
    ],
  },

  'decide-priority': {
    category: 'decide-priority',
    applicableTo: ['decision'],
    steps: [
      { template: 'List all competing priorities related to {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Define criteria for ranking {topic} priorities', defaultType: 'task', slots: ['topic'] },
      { template: 'Rank options against criteria for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Make and record decision on {topic}', defaultType: 'decision', slots: ['topic'] },
    ],
  },

  'decide-purchase': {
    category: 'decide-purchase',
    applicableTo: ['decision'],
    steps: [
      { template: 'Define budget and requirements for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Research and shortlist options for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Compare price, quality, and reviews for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Make and record purchase decision on {topic}', defaultType: 'decision', slots: ['topic'] },
    ],
  },

  'decide-relationship': {
    category: 'decide-relationship',
    applicableTo: ['decision'],
    steps: [
      { template: 'Clarify what you want from {topic} situation', defaultType: 'task', slots: ['topic'] },
      { template: 'Consider the other perspective on {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Identify possible actions and their consequences for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Make and record decision on {topic}', defaultType: 'decision', slots: ['topic'] },
    ],
  },

  'decide-service': {
    category: 'decide-service',
    applicableTo: ['decision'],
    steps: [
      { template: 'Define requirements for {topic} service', defaultType: 'task', slots: ['topic'] },
      { template: 'Get quotes or proposals from providers for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Check reviews and references for {topic} providers', defaultType: 'task', slots: ['topic'] },
      { template: 'Make and record decision on {topic} provider', defaultType: 'decision', slots: ['topic'] },
    ],
  },

  'decide-technology': {
    category: 'decide-technology',
    applicableTo: ['decision'],
    steps: [
      { template: 'Define technical requirements for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Research and compare solutions for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Test or trial top candidates for {topic}', defaultType: 'task', slots: ['topic'] },
      { template: 'Make and record decision on {topic}', defaultType: 'decision', slots: ['topic'] },
    ],
  },
};
