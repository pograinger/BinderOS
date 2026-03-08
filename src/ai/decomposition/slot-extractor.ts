/**
 * Slot extraction from input text for template filling.
 *
 * Extracts named entities (person, location) via the sanitization regex library,
 * and derives topic/item from the input text by stripping leading verbs.
 *
 * Pure module -- no store imports.
 */

import { detectWithRegex } from '../sanitization/regex-patterns';

// --- Types ---

/**
 * Extracted slots from input text for template filling.
 */
export interface ExtractedSlots {
  /** Primary subject -- always filled (falls back to full text) */
  topic: string;
  /** Person name from regex detection */
  person?: string;
  /** Place from regex detection */
  location?: string;
  /** Object referenced in the text */
  item?: string;
  /** Event name */
  event?: string;
}

// --- Extraction logic ---

/**
 * Common leading verbs and phrases to strip when extracting the topic.
 * Ordered longest-first so multi-word phrases match before single words.
 */
const LEADING_VERBS = [
  'decide on', 'set up', 'sign up for',
  'plan', 'buy', 'organize', 'research', 'decide', 'choose',
  'find', 'get', 'make', 'create', 'fix', 'schedule', 'arrange',
  'prepare', 'complete', 'start', 'learn', 'update', 'write',
  'send', 'clean', 'review', 'cancel', 'renew', 'book', 'order',
  'apply for', 'sign up', 'look into', 'figure out', 'work on',
  'take care of', 'deal with', 'follow up on',
];

/**
 * Prepositions to strip after verb removal.
 */
const LEADING_PREPOSITIONS = [
  'about', 'for', 'with', 'on', 'to', 'at', 'in', 'the', 'a', 'an', 'my', 'our',
];

/**
 * Pattern for detecting items: "new X", "a X", "the X" after verb stripping.
 */
const ITEM_PATTERNS = [
  /\bnew\s+(\w[\w\s]{0,30}?)(?:\s+(?:for|from|at|in|on)\b|$)/i,
  /\ba\s+(\w[\w\s]{0,30}?)(?:\s+(?:for|from|at|in|on)\b|$)/i,
  /\bthe\s+(\w[\w\s]{0,30}?)(?:\s+(?:for|from|at|in|on)\b|$)/i,
];

/**
 * Extract slots from input text for template filling.
 *
 * Strategy:
 * 1. Use detectWithRegex for PERSON and LOCATION entities
 * 2. Strip leading verbs and prepositions for topic
 * 3. Look for item patterns
 *
 * @param text - Raw input text from the atom
 * @returns Extracted slots with topic always filled
 */
export function extractSlots(text: string): ExtractedSlots {
  const slots: ExtractedSlots = {
    topic: text, // Default: full text
  };

  // --- Entity detection via sanitization regex ---
  const entities = detectWithRegex(text);

  for (const entity of entities) {
    if (entity.category === 'PERSON' && !slots.person) {
      slots.person = entity.text;
    }
    if (entity.category === 'LOCATION' && !slots.location) {
      slots.location = entity.text;
    }
  }

  // --- Topic extraction: strip leading verb + prepositions ---
  let topic = text.trim();

  // Try each verb phrase (longest first already in LEADING_VERBS order)
  for (const verb of LEADING_VERBS) {
    const pattern = new RegExp(`^${verb}\\b\\s*`, 'i');
    if (pattern.test(topic)) {
      topic = topic.replace(pattern, '');
      break;
    }
  }

  // Strip leading prepositions/articles
  let changed = true;
  while (changed) {
    changed = false;
    for (const prep of LEADING_PREPOSITIONS) {
      const pattern = new RegExp(`^${prep}\\b\\s*`, 'i');
      if (pattern.test(topic)) {
        topic = topic.replace(pattern, '');
        changed = true;
        break;
      }
    }
  }

  // Use extracted topic if non-empty, otherwise keep full text
  topic = topic.trim();
  if (topic.length > 0) {
    slots.topic = topic;
  }

  // --- Item extraction ---
  for (const pattern of ITEM_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      slots.item = match[1].trim();
      break;
    }
  }

  return slots;
}
