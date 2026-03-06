/**
 * Core types for the sanitization pipeline.
 *
 * The SanitizedPrompt branded type enforces sanitization-before-cloud at compile time:
 * any code path constructing a CloudRequestLogEntry must go through createSanitizedPrompt(),
 * which is only called by the sanitization pipeline.
 *
 * Phase 14: SNTZ-01 — PII detection and pseudonymization.
 */

// --- Branded SanitizedPrompt type ---

declare const __sanitized: unique symbol;

/**
 * A prompt string that has been processed by the sanitization pipeline.
 * Cannot be created from a raw string without an explicit cast via createSanitizedPrompt().
 */
export type SanitizedPrompt = string & { readonly [__sanitized]: true };

/**
 * The ONLY function that creates a SanitizedPrompt from a raw string.
 * Must only be called by the sanitization pipeline after PII detection/replacement.
 */
export function createSanitizedPrompt(text: string): SanitizedPrompt {
  return text as SanitizedPrompt;
}

// --- Entity types ---

/**
 * Categories of personally identifiable information detected by the sanitizer.
 */
export type EntityCategory = 'PERSON' | 'LOCATION' | 'FINANCIAL' | 'CONTACT' | 'CREDENTIAL';

/**
 * A single detected entity in the input text.
 */
export interface DetectedEntity {
  /** The original text of the entity */
  text: string;
  /** PII category */
  category: EntityCategory;
  /** Start character offset in the original text */
  start: number;
  /** End character offset in the original text (exclusive) */
  end: number;
  /** How the entity was detected */
  source: 'ner' | 'regex' | 'both';
  /** Detection confidence (0-1) */
  confidence: number;
}

/**
 * Result of the sanitization pipeline.
 */
export interface SanitizedResult {
  /** The sanitized prompt with PII replaced by pseudonym tags */
  prompt: SanitizedPrompt;
  /** All detected entities */
  entities: DetectedEntity[];
  /** Maps pseudonym tag -> real text (for de-pseudonymization of responses) */
  entityMap: Map<string, string>;
  /** Maps real text -> pseudonym tag (for quick lookup during sanitization) */
  reverseMap: Map<string, string>;
}

// --- Entity registry persistence ---

/**
 * A persisted entity-to-pseudonym mapping stored in Dexie.
 * Enables consistent pseudonyms across sessions.
 */
export interface EntityRegistryEntry {
  /** Unique ID (auto-generated UUID) */
  id: string;
  /** Original text of the entity */
  realText: string;
  /** Lowercase trimmed version for deduplication lookups */
  normalizedText: string;
  /** PII category */
  category: EntityCategory;
  /** Monotonically increasing ID per category (e.g., Person 1, Person 2) */
  pseudonymId: number;
  /** Whether user wants this entity restored (not redacted) in responses */
  restorePreference: boolean;
  /** Timestamp when first detected */
  createdAt: number;
  /** Timestamp when last seen in a sanitization pass */
  lastSeenAt: number;
}
