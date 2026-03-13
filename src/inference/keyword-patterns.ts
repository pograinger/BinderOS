/**
 * Keyword pattern engine for relationship inference.
 *
 * Loads ~20 patterns from relationship-patterns.json. For each atom,
 * splits content into sentences, finds entity mentions within each
 * sentence, and checks if any keyword pattern fires. When a pattern
 * fires, creates (or updates) an EntityRelation record in Dexie.
 *
 * Key design decisions:
 * - Sentence-scoped matching: entities in different sentences do NOT create
 *   a relationship even if a keyword is present (prevents false positives).
 * - Fuzzy matching: case-insensitive, word-boundary anchored regex from
 *   keyword list (no external NLP library needed for inbox atom lengths).
 * - Implicit self: single PER entity + keyword = '[SELF]' → entity relation.
 * - Conflicting patterns coexist: "Dr. Pam + anniversary" = both healthcare
 *   AND spouse. User correction (Phase 29) resolves ambiguity.
 *
 * Pure module: no store imports.
 *
 * Phase 28: RELI-01, RELI-03
 */

import { db } from '../storage/db';
import { createRelation } from '../storage/entity-helpers';
import type { EntityMention } from '../types/intelligence';
import type { RelationshipPattern, RelationshipPatternsConfig } from './types';
import { getBinderConfig } from '../config/binder-types/index';

// ---------------------------------------------------------------------------
// Pattern config — loaded once at module init from BinderTypeConfig
// ---------------------------------------------------------------------------

const PATTERNS_CONFIG: RelationshipPatternsConfig = {
  version: 2,
  // Cast: ExpandedBinderTypeConfig.relationshipPatterns uses z.string() for targetEntityType
  // while RelationshipPattern uses the narrower 'PER'|'LOC'|'ORG' union. The JSON values
  // are always one of those three literals; the cast is safe.
  patterns: getBinderConfig().relationshipPatterns as RelationshipPattern[],
};

// Pre-build regexes for each pattern (avoid re-compiling on every call)
interface CompiledPattern extends RelationshipPattern {
  regex: RegExp;
  /** Capture-group regex for finding keyword position within sentence text */
  keywordPosRegex: RegExp;
  entityTextRegex?: RegExp;
}

const COMPILED_PATTERNS: CompiledPattern[] = PATTERNS_CONFIG.patterns.map((p) => ({
  ...p,
  regex: buildKeywordRegex(p.keywords, p.caseSensitiveKeywords),
  keywordPosRegex: buildKeywordPosRegex(p.keywords, p.caseSensitiveKeywords),
  entityTextRegex: p.entityTextFilter ? new RegExp(p.entityTextFilter, 'i') : undefined,
}));

// ---------------------------------------------------------------------------
// Title abbreviations that should NOT be treated as sentence boundaries
// ---------------------------------------------------------------------------

const TITLE_ABBREVS = ['Dr', 'Mr', 'Mrs', 'Ms', 'Prof', 'St', 'Jr', 'Sr', 'Lt', 'Sgt', 'Cpl'];

/**
 * Split text into sentences, handling title abbreviations correctly.
 *
 * Algorithm:
 * 1. Replace known abbreviations ("Dr.", "Mr.", etc.) with placeholder versions
 *    that don't contain a period (to prevent false splits).
 * 2. Split on: look-behind for sentence-ending punctuation + whitespace + capital letter,
 *    OR on newlines.
 * 3. Restore the original forms in the resulting sentences.
 *
 * Returns an array of { text, start } objects so we can map back to spans.
 */
export function splitIntoSentences(
  text: string,
): { text: string; start: number }[] {
  // Build placeholder map: "Dr." -> "__DR__"
  const replacements: { placeholder: string; original: string }[] = TITLE_ABBREVS.map((t) => ({
    placeholder: `__${t.toUpperCase()}__`,
    original: `${t}.`,
  }));

  let processed = text;
  for (const { placeholder, original } of replacements) {
    // Replace "Dr." (case-sensitive for titles) with placeholder
    // Escape the dot in the original so "Dr." matches literally (not "Dro", "Drp", etc.)
    const escapedOriginal = original.replace(/\./g, '\\.');
    processed = processed.replace(new RegExp(`\\b${escapedOriginal}`, 'g'), placeholder);
  }

  // Split on sentence boundaries: after [.!?] + whitespace + uppercase,
  // or on newlines. Keep track of original positions by computing offsets.
  const sentences: { text: string; start: number }[] = [];
  const splitRegex = /(?<=[.!?])\s+(?=[A-Z])|\n+/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = splitRegex.exec(processed)) !== null) {
    const rawSentence = processed.slice(lastIndex, match.index);
    if (rawSentence.trim()) {
      sentences.push({
        text: restoreAbbreviations(rawSentence.trim(), replacements),
        start: lastIndex,
      });
    }
    lastIndex = match.index + match[0].length;
  }

  // Last segment
  const remaining = processed.slice(lastIndex);
  if (remaining.trim()) {
    sentences.push({
      text: restoreAbbreviations(remaining.trim(), replacements),
      start: lastIndex,
    });
  }

  return sentences;
}

function restoreAbbreviations(
  text: string,
  replacements: { placeholder: string; original: string }[],
): string {
  let result = text;
  for (const { placeholder, original } of replacements) {
    result = result.replace(new RegExp(placeholder, 'g'), original);
  }
  return result;
}

/**
 * Build a word-boundary anchored regex from a list of keywords.
 * Multi-word phrases are supported (word boundaries at start/end of phrase).
 */
export function buildKeywordRegex(keywords: string[], caseSensitive?: boolean): RegExp {
  const escaped = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const flags = caseSensitive ? '' : 'i';
  return new RegExp(`(?:^|\\b|\\s)(${escaped.join('|')})(?:\\b|\\s|$)`, flags);
}

/**
 * Build a regex that captures keyword matches with their positions.
 * Uses the global flag so we can iterate matches via exec().
 */
export function buildKeywordPosRegex(keywords: string[], caseSensitive?: boolean): RegExp {
  const escaped = keywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const flags = caseSensitive ? 'g' : 'gi';
  return new RegExp(`(?:^|\\b|\\s)(${escaped.join('|')})(?:\\b|\\s|$)`, flags);
}

// ---------------------------------------------------------------------------
// Proximity filtering — only tag entity nearest to the keyword
// ---------------------------------------------------------------------------

/**
 * Count word distance between a keyword match position and an entity mention
 * within a sentence. Distance is measured as the number of whitespace-separated
 * tokens between the keyword and the nearest edge of the entity span.
 */
/**
 * Clause boundary penalty: commas and semicolons within the gap add virtual
 * distance, preventing entities in a separate clause from being tagged.
 * E.g., "Arjun to his dentist appointment, Sunita will..." — the comma
 * between "appointment" and "Sunita" adds 3 virtual words of distance.
 */
const CLAUSE_BOUNDARY_PENALTY = 3;

function wordDistance(
  sentenceText: string,
  keywordStartInSentence: number,
  keywordEndInSentence: number,
  entityStartInSentence: number,
  entityEndInSentence: number,
): number {
  // If keyword and entity overlap, distance is 0
  if (keywordStartInSentence < entityEndInSentence && keywordEndInSentence > entityStartInSentence) {
    return 0;
  }

  // Determine the text gap between keyword and entity
  const gapStart = Math.min(keywordEndInSentence, entityEndInSentence);
  const gapEnd = Math.max(keywordStartInSentence, entityStartInSentence);
  const gapText = sentenceText.slice(gapStart, gapEnd);

  // Count words in the gap (split on whitespace, filter empty)
  const words = gapText.split(/\s+/).filter((w) => w.length > 0).length;

  // Add penalty for clause boundaries (commas, semicolons) in the gap
  const clauseBoundaries = (gapText.match(/[,;]/g) || []).length;

  return words + clauseBoundaries * CLAUSE_BOUNDARY_PENALTY;
}

/**
 * Filter entities by proximity to keyword match. Returns only the entity(ies)
 * closest to the keyword, provided they are within proximityMaxWords distance.
 * If multiple entities are equidistant, all are returned.
 */
export function filterByProximity(
  sentenceText: string,
  sentenceStart: number,
  pattern: CompiledPattern,
  entities: EntityMention[],
): EntityMention[] {
  // Find keyword position(s) in sentence using the position-capturing regex
  const posRegex = new RegExp(pattern.keywordPosRegex.source, pattern.keywordPosRegex.flags);
  const keywordPositions: Array<{ start: number; end: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = posRegex.exec(sentenceText)) !== null) {
    // Group 1 is the keyword itself (offset by any leading whitespace/boundary)
    const kwStart = match.index + (match[0].length - match[1].length);
    keywordPositions.push({ start: kwStart, end: kwStart + match[1].length });
  }

  if (!keywordPositions.length) return entities; // fallback: no position found, keep all

  // Possessive pronouns that indicate third-party relationships
  const POSSESSIVE_RE = /\b(his|her|their|my)\b/i;

  // For each entity, compute minimum word distance to any keyword occurrence
  const scored = entities.map((ent) => {
    const entityStartInSentence = ent.spanStart - sentenceStart;
    const entityEndInSentence = entityStartInSentence + ent.entityText.length;

    let minDist = Infinity;
    let hasPossessiveGap = false;
    for (const kw of keywordPositions) {
      const dist = wordDistance(sentenceText, kw.start, kw.end, entityStartInSentence, entityEndInSentence);
      if (dist < minDist) minDist = dist;

      // Check for possessive in the gap between entity and keyword
      if (pattern.skipOnPossessiveGap) {
        const gapStart = Math.min(kw.end, entityEndInSentence);
        const gapEnd = Math.max(kw.start, entityStartInSentence);
        if (gapEnd > gapStart) {
          const gapText = sentenceText.slice(gapStart, gapEnd);
          if (POSSESSIVE_RE.test(gapText)) hasPossessiveGap = true;
        }
      }
    }
    return { entity: ent, distance: minDist, possessiveExcluded: hasPossessiveGap };
  });

  // Exclude entities with possessive gap (third-party relationships)
  const eligible = pattern.skipOnPossessiveGap
    ? scored.filter((s) => !s.possessiveExcluded)
    : scored;

  if (!eligible.length) return [];

  // Find the minimum distance
  const minDistance = Math.min(...eligible.map((s) => s.distance));

  // Only keep entities at minimum distance AND within the max threshold
  if (minDistance > pattern.proximityMaxWords!) return [];

  return eligible
    .filter((s) => s.distance === minDistance)
    .map((s) => s.entity);
}

// ---------------------------------------------------------------------------
// Main pattern engine
// ---------------------------------------------------------------------------

/**
 * Run all keyword patterns against the atom content.
 *
 * For each sentence:
 * 1. Find which entity mentions (with entityId) fall within the sentence span.
 * 2. For each pattern, check if the sentence text matches the pattern regex.
 * 3. If matched AND sentence contains an entity of the correct targetEntityType,
 *    create (or update) an EntityRelation record.
 *
 * Self-relationship: when a single entity fires a keyword pattern, the relation
 * is: sourceEntityId='[SELF]', targetEntityId=entity.entityId
 *
 * Confidence update: if a relation already exists for the same
 * (sourceEntityId, targetEntityId, relationshipType), append evidence and
 * boost confidence: Math.min(0.95, existing + 0.10).
 */
export async function runKeywordPatterns(
  atomId: string,
  content: string,
  entityMentions: EntityMention[],
): Promise<void> {
  if (!entityMentions.length) return;

  const sentences = splitIntoSentences(content);

  for (const sentence of sentences) {
    const sentenceEnd = sentence.start + sentence.text.length;

    // Find mentions whose span falls within this sentence's region.
    // We use the sentence start position as reported by the splitter.
    // Since we split on whitespace after punctuation, each mention's
    // spanStart should fall within [sentence.start, sentenceEnd].
    const mentionsInSentence = entityMentions.filter((m) => {
      // Check span overlap: mention must start within the sentence
      return m.spanStart >= sentence.start && m.spanStart < sentenceEnd;
    });

    if (!mentionsInSentence.length) continue;

    const sentenceText = sentence.text;

    for (const pattern of COMPILED_PATTERNS) {
      // Check if the sentence text matches this pattern
      if (!pattern.regex.test(sentenceText)) continue;

      // Find entities of the target type in this sentence
      const matchingEntities = mentionsInSentence.filter(
        (m) => m.entityType === pattern.targetEntityType && m.entityId &&
          (!pattern.entityTextRegex || pattern.entityTextRegex.test(m.entityText)),
      );

      if (!matchingEntities.length) continue;

      // Apply proximity filtering: only keep entities closest to the keyword
      const proximityFiltered = pattern.proximityMaxWords
        ? filterByProximity(sentenceText, sentence.start, pattern, matchingEntities)
        : matchingEntities;

      if (!proximityFiltered.length) continue;

      // Create a relation for each matching entity
      for (const entity of proximityFiltered) {
        // Check suppression: skip if entity already has a more specific relationship
        if (pattern.suppressedByTypes?.length) {
          const suppressed = await isRelationSuppressed(
            '[SELF]',
            entity.entityId!,
            pattern.suppressedByTypes,
          );
          if (suppressed) continue;
        }

        await upsertKeywordRelation({
          atomId,
          sourceEntityId: '[SELF]',
          targetEntityId: entity.entityId!,
          relationshipType: pattern.relationshipType,
          confidenceBase: pattern.confidenceBase,
          snippet: sentenceText,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Suppression check — skip generic types when a specific type already exists
// ---------------------------------------------------------------------------

async function isRelationSuppressed(
  sourceEntityId: string,
  targetEntityId: string,
  suppressedByTypes: string[],
): Promise<boolean> {
  const existing = await db.entityRelations
    .where('[sourceEntityId+targetEntityId]')
    .equals([sourceEntityId, targetEntityId])
    .toArray()
    .catch(() => [] as Array<{ relationshipType: string }>);

  return existing.some((r) => suppressedByTypes.includes(r.relationshipType));
}

// ---------------------------------------------------------------------------
// Relation upsert helper
// ---------------------------------------------------------------------------

interface UpsertParams {
  atomId: string;
  sourceEntityId: string;
  targetEntityId: string;
  relationshipType: string;
  confidenceBase: number;
  snippet: string;
}

async function upsertKeywordRelation(params: UpsertParams): Promise<void> {
  const { atomId, sourceEntityId, targetEntityId, relationshipType, confidenceBase, snippet } =
    params;

  const now = Date.now();
  const newEvidence = { atomId, snippet, timestamp: now };

  // Check if a relation already exists for this (source, target, type) triple
  const existing = await db.entityRelations
    .where('[sourceEntityId+targetEntityId]')
    .equals([sourceEntityId, targetEntityId])
    .filter((r) => r.relationshipType === relationshipType)
    .first()
    .catch(() => undefined);

  if (existing) {
    // Update: boost confidence and append evidence
    const updatedConfidence = Math.min(0.95, existing.confidence + 0.10);
    await db.entityRelations.update(existing.id, {
      confidence: updatedConfidence,
      evidence: [...existing.evidence, newEvidence],
      updatedAt: now,
      version: existing.version + 1,
    });
  } else {
    // Create new relation
    await createRelation({
      sourceEntityId,
      targetEntityId,
      relationshipType,
      confidence: confidenceBase,
      sourceAttribution: 'keyword',
      evidence: [newEvidence],
      version: 1,
      deviceId: '',
      updatedAt: now,
    });
  }
}
