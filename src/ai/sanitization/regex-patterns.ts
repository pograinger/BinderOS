/**
 * PII regex pattern library for structured entity detection.
 *
 * Pure module — no side effects, no imports beyond types.
 * Each pattern maps to an EntityCategory and produces DetectedEntity results
 * with confidence: 1.0 and source: 'regex'.
 *
 * Phase 14: SNTZ-01 — regex-based PII detection layer.
 */

import type { EntityCategory, DetectedEntity } from './types';

/**
 * A single PII detection pattern.
 */
export interface PIIPattern {
  /** Human-readable name for the pattern */
  name: string;
  /** Entity category this pattern detects */
  category: EntityCategory;
  /** Regular expression (without global flag — matchAll handles iteration) */
  pattern: RegExp;
}

/**
 * PII regex patterns covering all 5 entity categories.
 *
 * Patterns are ordered by specificity within each category.
 * All use word boundaries or structural anchors to minimize false positives.
 */
export const PII_PATTERNS: PIIPattern[] = [
  // --- CONTACT ---
  {
    name: 'email',
    category: 'CONTACT',
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
  },
  {
    name: 'us-phone',
    category: 'CONTACT',
    pattern: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/,
  },
  {
    name: 'international-phone',
    category: 'CONTACT',
    pattern: /\+\d{1,3}[-.\s]?\d{2,4}[-.\s]?\d{3,4}[-.\s]?\d{3,4}\b/,
  },

  // --- FINANCIAL ---
  {
    name: 'credit-card',
    category: 'FINANCIAL',
    pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/,
  },
  {
    name: 'iban',
    category: 'FINANCIAL',
    pattern: /\b[A-Z]{2}\d{2}[\s]?[A-Z0-9]{4}[\s]?(?:\d{4}[\s]?){2,7}\d{1,4}\b/,
  },
  {
    name: 'dollar-amount',
    category: 'FINANCIAL',
    pattern: /\$\d{1,3}(?:,\d{3})*(?:\.\d{2})?\b/,
  },

  // --- CREDENTIAL ---
  {
    name: 'anthropic-key',
    category: 'CREDENTIAL',
    pattern: /\bsk-ant-[a-zA-Z0-9_-]{20,}\b/,
  },
  {
    name: 'openai-key',
    category: 'CREDENTIAL',
    pattern: /\bsk-[a-zA-Z0-9]{20,}\b/,
  },
  {
    name: 'github-token',
    category: 'CREDENTIAL',
    pattern: /\b(?:ghp_|gho_|ghu_|ghs_|ghr_)[a-zA-Z0-9]{36,}\b/,
  },
  {
    name: 'api-key-prefix',
    category: 'CREDENTIAL',
    pattern: /\b(?:pk-|api-|key-|token-|secret-|bearer-)[a-zA-Z0-9_-]{16,}\b/,
  },
  {
    name: 'ssn',
    category: 'CREDENTIAL',
    pattern: /\b\d{3}-\d{2}-\d{4}\b/,
  },
];

// ---------------------------------------------------------------------------
// DATE regex patterns for knowledge graph entity detection (Phase 27)
// ---------------------------------------------------------------------------

const DATE_PATTERNS: RegExp[] = [
  // ISO format: 2026-03-11
  /\b\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b/,
  // US format: 03/11/2026 or 3/11/2026
  /\b(?:0?[1-9]|1[0-2])\/(?:0?[1-9]|[12]\d|3[01])\/\d{4}\b/,
  // Named month with year: March 11, 2026 or Mar 11 2026
  /\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{4}\b/i,
  // Day Month Year: 11 March 2026
  /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{4}\b/i,
  // Month and day without year: March 11, January 1st
  /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?\b/i,
];

/**
 * Detect date patterns in text for knowledge graph entity detection.
 *
 * Returns raw entity mentions with type 'DATE' and confidence 1.0.
 * These are NOT PII — they are informational entities for the entity registry.
 *
 * Phase 27: ENTD-01
 */
export function detectDates(text: string): { text: string; type: string; start: number; end: number; confidence: number }[] {
  const results: { text: string; type: string; start: number; end: number; confidence: number }[] = [];

  for (const pattern of DATE_PATTERNS) {
    const globalPattern = new RegExp(pattern.source, pattern.flags.replace('g', '') + 'g');
    for (const match of text.matchAll(globalPattern)) {
      if (match.index === undefined) continue;
      results.push({
        text: match[0],
        type: 'DATE',
        start: match.index,
        end: match.index + match[0].length,
        confidence: 1.0,
      });
    }
  }

  results.sort((a, b) => a.start - b.start);
  return results;
}

/**
 * Run all PII regex patterns against the input text.
 *
 * Returns detected entities with accurate start/end character offsets,
 * confidence: 1.0, and source: 'regex'.
 *
 * Uses matchAll with fresh RegExp instances to avoid stateful lastIndex issues.
 *
 * @param text - The input text to scan for PII
 * @returns Array of detected entities sorted by start offset
 */
export function detectWithRegex(text: string): DetectedEntity[] {
  const entities: DetectedEntity[] = [];

  for (const { name: _name, category, pattern } of PII_PATTERNS) {
    // Create a new global RegExp from the pattern source and flags to use matchAll safely
    const globalPattern = new RegExp(pattern.source, pattern.flags + 'g');

    for (const match of text.matchAll(globalPattern)) {
      if (match.index === undefined) continue;
      const matchText = match[0];
      entities.push({
        text: matchText,
        category,
        start: match.index,
        end: match.index + matchText.length,
        source: 'regex',
        confidence: 1.0,
      });
    }
  }

  // Sort by start offset for consistent ordering
  entities.sort((a, b) => a.start - b.start);
  return entities;
}
