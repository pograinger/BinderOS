/**
 * Harness-specific inference wrappers.
 *
 * These replicate the logic from src/inference/keyword-patterns.ts and
 * src/inference/cooccurrence-tracker.ts but use HarnessEntityStore
 * instead of Dexie, enabling headless Node.js execution.
 *
 * No browser-only imports (no Worker, no DOM APIs, no SolidJS).
 *
 * Phase 28: HARN-01, HARN-02
 */

import type { EntityMention, EntityRelation } from '../../src/types/intelligence.js';
import { splitIntoSentences, buildKeywordRegex, buildKeywordPosRegex, filterByProximity } from '../../src/inference/keyword-patterns.js';
import type { RelationshipPattern, RelationshipPatternsConfig } from '../../src/inference/types.js';
import { HarnessEntityStore } from './harness-entity-store.js';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

// ---------------------------------------------------------------------------
// Load relationship patterns
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const patternsPath = path.join(__dirname, '../../src/config/binder-types/gtd-personal/relationships.json');
const PATTERNS_CONFIG: RelationshipPatternsConfig = JSON.parse(
  fs.readFileSync(patternsPath, 'utf-8'),
);

interface CompiledPattern extends RelationshipPattern {
  regex: RegExp;
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
// Co-occurrence in-memory state (per harness run, reset between runs)
// ---------------------------------------------------------------------------

interface CooccurrenceEntry {
  count: number;
  evidence: Array<{ atomId: string; snippet: string; timestamp: number }>;
}

// ---------------------------------------------------------------------------
// Tunable knobs (overridable via env vars for Optuna landscape search)
// ---------------------------------------------------------------------------

export const CO_OCCURRENCE_THRESHOLD = parseInt(
  process.env.HARNESS_COOCCURRENCE_THRESHOLD ?? '3', 10,
);

export const PATTERN_CONFIDENCE_SCALE = parseFloat(
  process.env.HARNESS_PATTERN_CONFIDENCE_SCALE ?? '1.0',
);

const EXCLUDED_TYPES = new Set(['MISC', 'DATE']);

let cooccurrenceMap = new Map<string, CooccurrenceEntry>();

export function resetHarnessCooccurrence(): void {
  cooccurrenceMap = new Map();
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

// ---------------------------------------------------------------------------
// Harness keyword pattern engine
// ---------------------------------------------------------------------------

async function upsertKeywordRelation(
  store: HarnessEntityStore,
  params: {
    atomId: string;
    sourceEntityId: string;
    targetEntityId: string;
    relationshipType: string;
    confidenceBase: number;
    snippet: string;
  },
): Promise<void> {
  const { atomId, sourceEntityId, targetEntityId, relationshipType, confidenceBase, snippet } =
    params;

  const now = Date.now();
  const newEvidence = { atomId, snippet, timestamp: now };

  // Find existing relation
  const existing = store.findRelation(sourceEntityId, targetEntityId, relationshipType);

  if (existing) {
    // Guard: never overwrite user-corrections with inferred patterns
    if (existing.sourceAttribution === 'user-correction') return;

    const updatedConfidence = Math.min(0.95, existing.confidence + 0.1);
    store.updateRelation(existing.id, {
      confidence: updatedConfidence,
      evidence: [...existing.evidence, newEvidence],
      updatedAt: now,
      version: existing.version + 1,
    });
  } else {
    store.createRelation({
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

/** Discount factor applied to confidenceBase for relations inferred from enrichment answers */
export const ENRICHMENT_CONFIDENCE_DISCOUNT = parseFloat(
  process.env.HARNESS_ENRICHMENT_DISCOUNT ?? '0.5',
);

export async function runHarnessKeywordPatterns(
  store: HarnessEntityStore,
  atomId: string,
  content: string,
  entityMentions: EntityMention[],
  options?: { fromEnrichment?: boolean },
): Promise<void> {
  if (!entityMentions.length) return;

  const sentences = splitIntoSentences(content);

  for (const sentence of sentences) {
    const sentenceEnd = sentence.start + sentence.text.length;

    const mentionsInSentence = entityMentions.filter(
      (m) => m.spanStart >= sentence.start && m.spanStart < sentenceEnd,
    );

    if (!mentionsInSentence.length) continue;

    const sentenceText = sentence.text;

    for (const pattern of COMPILED_PATTERNS) {
      if (!pattern.regex.test(sentenceText)) continue;

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

      for (const entity of proximityFiltered) {
        // Check suppression: skip if entity already has a more specific relationship
        if (pattern.suppressedByTypes?.length) {
          const existingRels = store.getRelations().filter(
            (r) =>
              r.sourceEntityId === '[SELF]' &&
              r.targetEntityId === entity.entityId &&
              pattern.suppressedByTypes!.includes(r.relationshipType),
          );
          if (existingRels.length > 0) continue;
        }

        const scaledBase = pattern.confidenceBase * PATTERN_CONFIDENCE_SCALE;
        const effectiveConfidence = options?.fromEnrichment
          ? scaledBase * ENRICHMENT_CONFIDENCE_DISCOUNT
          : scaledBase;

        await upsertKeywordRelation(store, {
          atomId,
          sourceEntityId: '[SELF]',
          targetEntityId: entity.entityId!,
          relationshipType: pattern.relationshipType,
          confidenceBase: effectiveConfidence,
          snippet: sentenceText,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Harness co-occurrence tracker
// ---------------------------------------------------------------------------

export function updateHarnessCooccurrence(
  content: string,
  entityMentions: EntityMention[],
): void {
  if (entityMentions.length < 2) return;

  const trackable = entityMentions.filter(
    (m) => m.entityId && !EXCLUDED_TYPES.has(m.entityType),
  );

  if (trackable.length < 2) return;

  const sentences = splitIntoSentences(content);

  for (const sentence of sentences) {
    const sentenceEnd = sentence.start + sentence.text.length;

    const inSentence = trackable.filter(
      (m) => m.spanStart >= sentence.start && m.spanStart < sentenceEnd,
    );

    if (inSentence.length < 2) continue;

    for (let i = 0; i < inSentence.length; i++) {
      for (let j = i + 1; j < inSentence.length; j++) {
        const a = inSentence[i];
        const b = inSentence[j];
        const key = pairKey(a.entityId!, b.entityId!);
        const existing = cooccurrenceMap.get(key);
        const entry = existing ?? { count: 0, evidence: [] };
        entry.count += 1;
        entry.evidence.push({ atomId: '', snippet: sentence.text, timestamp: Date.now() });
        cooccurrenceMap.set(key, entry);
      }
    }
  }
}

/**
 * Post-processing: remove relations that are suppressed by more specific types.
 * E.g., if Dr. Patel has both "veterinarian" and "healthcare-provider",
 * remove "healthcare-provider" since "veterinarian" is more specific.
 */
export function cleanSuppressedRelations(store: HarnessEntityStore): void {
  // Build suppression rules from pattern config
  const suppressionRules = new Map<string, string[]>();
  for (const pattern of COMPILED_PATTERNS) {
    if (pattern.suppressedByTypes?.length) {
      const existing = suppressionRules.get(pattern.relationshipType) ?? [];
      for (const t of pattern.suppressedByTypes) {
        if (!existing.includes(t)) existing.push(t);
      }
      suppressionRules.set(pattern.relationshipType, existing);
    }
  }

  if (suppressionRules.size === 0) return;

  const allRelations = store.getRelations();
  const toDelete: string[] = [];

  for (const rel of allRelations) {
    const suppressors = suppressionRules.get(rel.relationshipType);
    if (!suppressors) continue;

    // Check if a suppressing relation exists for the same entity pair
    const hasSuppressor = allRelations.some(
      (other) =>
        other.id !== rel.id &&
        other.sourceEntityId === rel.sourceEntityId &&
        other.targetEntityId === rel.targetEntityId &&
        suppressors.includes(other.relationshipType),
    );

    if (hasSuppressor) toDelete.push(rel.id);
  }

  for (const id of toDelete) {
    store.entityRelations.delete(id);
  }
}

/**
 * Re-run keyword patterns for all atoms mentioning a specific entity.
 * Used by correction ripple: after a user-correction, re-evaluate all
 * existing atoms that reference the corrected entity.
 */
export async function reRunPatternsForEntity(
  entityId: string,
  store: HarnessEntityStore,
): Promise<void> {
  const allIntel = Array.from(store.atomIntelligence.values());
  for (const intel of allIntel) {
    const mentionsEntity = intel.entityMentions.some((m) => m.entityId === entityId);
    if (!mentionsEntity) continue;

    // Get atom content from the sidecar — reconstruct content from evidence snippets is not feasible,
    // so we use the entity mention spans to build keyword pattern content from available context.
    // Workaround: we run keyword patterns using the entity mentions only (re-resolve).
    const registryMentions = intel.entityMentions.filter((m) => m.entityId);
    if (registryMentions.length > 0) {
      // We need the content; store it in atomIntelligence as optional cache
      const contentCache = (intel as unknown as { _content?: string })._content;
      if (contentCache) {
        await runHarnessKeywordPatterns(store, intel.atomId, contentCache, registryMentions);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Singular relation uniqueness enforcement
// ---------------------------------------------------------------------------

/**
 * Relationship types that are inherently singular — a person has only one
 * spouse, one boss, one home city. When entity fragmentation creates multiple
 * relations of the same singular type, keep only the highest-confidence one.
 */
/**
 * "Typically singular" relation types — most people have one, but edge cases
 * (divorce, polyamory, matrix orgs) mean multiples are possible.
 *
 * Strategy: keep only the highest-confidence relation by default, but this is
 * overridden by user-corrections. If a user confirms multiple (e.g., two
 * spouses), their corrections (confidence 1.0) all survive.
 *
 * Edge cases (poly, divorce, dual-reporting) are real but uncommon — the
 * system defaults to "one is most likely" and relies on user confirmation
 * to learn about the rarer patterns.
 */
const SINGULAR_RELATION_TYPES = new Set([
  'spouse',         // usually one; poly/divorce overridden by user-correction
  'reports-to',     // usually one; matrix orgs overridden by user-correction
  'lives-at',       // one primary residence
  'landlord',       // one landlord per lease
  'veterinarian',   // typically one vet
  'accountant',     // typically one CPA
  'lawyer',         // typically one primary attorney
]);

export function enforceRelationUniqueness(store: HarnessEntityStore): number {
  let removed = 0;
  for (const type of SINGULAR_RELATION_TYPES) {
    const rels = store.getRelations().filter((r) => r.relationshipType === type);
    if (rels.length <= 1) continue;

    // User-corrections are sacred — if user confirmed multiple, keep all of them
    const userCorrected = rels.filter((r) => r.sourceAttribution === 'user-correction');
    const inferred = rels.filter((r) => r.sourceAttribution !== 'user-correction');

    if (userCorrected.length > 1) {
      // User confirmed multiple (e.g., poly, two managers) — remove only inferred duplicates
      for (const rel of inferred) {
        // Keep inferred if it matches a user-corrected entity (reinforcement)
        const matchesUserCorrected = userCorrected.some(
          (uc) => uc.targetEntityId === rel.targetEntityId,
        );
        if (!matchesUserCorrected) {
          store.entityRelations.delete(rel.id);
          removed++;
        }
      }
    } else {
      // Default: keep highest-confidence, remove the rest (among inferred only)
      inferred.sort((a, b) => b.confidence - a.confidence);
      for (let i = 1; i < inferred.length; i++) {
        store.entityRelations.delete(inferred[i].id);
        removed++;
      }
    }
  }
  return removed;
}

export function flushHarnessCooccurrence(store: HarnessEntityStore): void {
  for (const [key, entry] of cooccurrenceMap) {
    if (entry.count < CO_OCCURRENCE_THRESHOLD) continue;

    const colonIdx = key.indexOf(':');
    const entityId1 = key.slice(0, colonIdx);
    const entityId2 = key.slice(colonIdx + 1);

    const existing = store.findRelation(entityId1, entityId2, 'associated', 'co-occurrence');

    if (existing) {
      const updatedConfidence = Math.min(0.95, existing.confidence + 0.05 * entry.count);
      store.updateRelation(existing.id, {
        confidence: updatedConfidence,
        evidence: [...existing.evidence, ...entry.evidence],
        updatedAt: Date.now(),
        version: existing.version + 1,
      });
    } else {
      store.createRelation({
        sourceEntityId: entityId1,
        targetEntityId: entityId2,
        relationshipType: 'associated',
        confidence: 0.25 * PATTERN_CONFIDENCE_SCALE,
        sourceAttribution: 'co-occurrence',
        evidence: entry.evidence,
        version: 1,
        deviceId: '',
        updatedAt: Date.now(),
      });
    }
  }

  cooccurrenceMap.clear();
}
