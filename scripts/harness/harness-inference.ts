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
import { splitIntoSentences, buildKeywordRegex } from '../../src/inference/keyword-patterns.js';
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
const patternsPath = path.join(__dirname, '../../src/config/relationship-patterns.json');
const PATTERNS_CONFIG: RelationshipPatternsConfig = JSON.parse(
  fs.readFileSync(patternsPath, 'utf-8'),
);

interface CompiledPattern extends RelationshipPattern {
  regex: RegExp;
}

const COMPILED_PATTERNS: CompiledPattern[] = PATTERNS_CONFIG.patterns.map((p) => ({
  ...p,
  regex: buildKeywordRegex(p.keywords),
}));

// ---------------------------------------------------------------------------
// Co-occurrence in-memory state (per harness run, reset between runs)
// ---------------------------------------------------------------------------

interface CooccurrenceEntry {
  count: number;
  evidence: Array<{ atomId: string; snippet: string; timestamp: number }>;
}

export const CO_OCCURRENCE_THRESHOLD = 3;
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

export async function runHarnessKeywordPatterns(
  store: HarnessEntityStore,
  atomId: string,
  content: string,
  entityMentions: EntityMention[],
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
        (m) => m.entityType === pattern.targetEntityType && m.entityId,
      );

      if (!matchingEntities.length) continue;

      for (const entity of matchingEntities) {
        await upsertKeywordRelation(store, {
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
        confidence: 0.25,
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
