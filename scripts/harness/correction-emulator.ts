/**
 * Cloud-as-user correction simulation.
 *
 * Uses Haiku to identify wrong relationships in the entity graph vs
 * ground truth, generate user corrections, and apply them with ripple
 * through existing atoms.
 *
 * User corrections (sourceAttribution='user-correction') are never
 * overwritten by inference — they are ground truth.
 *
 * Phase 29: TVAL-01
 */

import Anthropic from '@anthropic-ai/sdk';
import { HarnessEntityStore } from './harness-entity-store.js';
import {
  runHarnessKeywordPatterns,
  cleanSuppressedRelations,
} from './harness-inference.js';
import type { GroundTruth } from './score-graph.js';
import type { UserCorrection } from './harness-types.js';

// ---------------------------------------------------------------------------
// Relationship mismatch detection
// ---------------------------------------------------------------------------

interface RelationshipMismatch {
  entityName: string;
  entityId: string;
  /** What the graph currently infers (null if no relation found) */
  currentType: string | null;
  /** The correct relationship type from ground truth */
  correctType: string;
}

function findMismatches(
  store: HarnessEntityStore,
  groundTruth: GroundTruth,
): RelationshipMismatch[] {
  const detectedEntities = store.getEntities();
  const allRelations = store.getRelations();
  const mismatches: RelationshipMismatch[] = [];

  for (const gtRel of groundTruth.relationships) {
    // Find the detected entity for this GT relationship
    const normGt = gtRel.entity.toLowerCase().replace(/^(dr\.|mr\.|mrs\.|ms\.|prof\.)\s+/i, '').trim();
    const matchedEntity = detectedEntities.find((e) => {
      const normCan = e.canonicalName.toLowerCase().replace(/^(dr\.|mr\.|mrs\.|ms\.|prof\.)\s+/i, '').trim();
      if (normCan === normGt || normCan.includes(normGt) || normGt.includes(normCan)) return true;
      return e.aliases.some((a) => {
        const normA = a.toLowerCase().replace(/^(dr\.|mr\.|mrs\.|ms\.|prof\.)\s+/i, '').trim();
        return normA === normGt || normA.includes(normGt) || normGt.includes(normA);
      });
    });

    if (!matchedEntity) continue; // Entity not detected — gap, not mismatch

    // Find current relationship for this entity
    const currentRel = allRelations.find(
      (r) =>
        (r.targetEntityId === matchedEntity.id || r.sourceEntityId === matchedEntity.id) &&
        r.sourceEntityId !== matchedEntity.id, // prefer [SELF] → entity direction
    );

    // Also check user-corrections: never generate corrections for already-corrected relations
    const hasUserCorrection = allRelations.some(
      (r) =>
        (r.targetEntityId === matchedEntity.id || r.sourceEntityId === matchedEntity.id) &&
        r.sourceAttribution === 'user-correction' &&
        r.relationshipType === gtRel.type,
    );

    if (hasUserCorrection) continue; // Already corrected correctly

    const currentType = currentRel?.relationshipType ?? null;

    if (currentType !== gtRel.type) {
      mismatches.push({
        entityName: matchedEntity.canonicalName,
        entityId: matchedEntity.id,
        currentType,
        correctType: gtRel.type,
      });
    }
  }

  return mismatches;
}

// ---------------------------------------------------------------------------
// Correction application
// ---------------------------------------------------------------------------

/**
 * Apply a user correction to the entity store.
 *
 * 1. Creates a new relation with confidence 1.0 and sourceAttribution='user-correction'
 * 2. Removes wrong-type relations for the same entity (if conflicting)
 * 3. Re-runs keyword patterns on all atoms mentioning this entity (ripple)
 * 4. Runs cleanSuppressedRelations to remove dominated relations
 */
export function applyCorrection(
  store: HarnessEntityStore,
  correction: UserCorrection,
): void {
  // Find the entity by name
  const entities = store.getEntities();
  const normName = correction.entityName.toLowerCase().replace(/^(dr\.|mr\.|mrs\.|ms\.|prof\.)\s+/i, '').trim();
  const entity = entities.find((e) => {
    const normCan = e.canonicalName.toLowerCase().replace(/^(dr\.|mr\.|mrs\.|ms\.|prof\.)\s+/i, '').trim();
    return normCan === normName || e.aliases.some(
      (a) => a.toLowerCase().replace(/^(dr\.|mr\.|mrs\.|ms\.|prof\.)\s+/i, '').trim() === normName,
    );
  });

  if (!entity) return;

  const now = Date.now();
  const allRelations = store.getRelations();

  // Remove wrong relationship type for this entity (if any)
  if (correction.wrongRelationshipType) {
    for (const rel of allRelations) {
      const involvesEntity =
        rel.targetEntityId === entity.id || rel.sourceEntityId === entity.id;
      const isWrongType = rel.relationshipType === correction.wrongRelationshipType;
      const isNotUserCorrection = rel.sourceAttribution !== 'user-correction';
      if (involvesEntity && isWrongType && isNotUserCorrection) {
        store.entityRelations.delete(rel.id);
      }
    }
  }

  // Check if correct relation already exists with user-correction attribution
  const existingCorrection = allRelations.find(
    (r) =>
      (r.targetEntityId === entity.id || r.sourceEntityId === entity.id) &&
      r.relationshipType === correction.correctRelationshipType &&
      r.sourceAttribution === 'user-correction',
  );

  if (!existingCorrection) {
    // Create user-correction relation
    store.createRelation({
      sourceEntityId: '[SELF]',
      targetEntityId: entity.id,
      relationshipType: correction.correctRelationshipType,
      confidence: 1.0,
      sourceAttribution: 'user-correction',
      evidence: [
        {
          atomId: correction.atomId,
          snippet: `User correction: ${correction.correctRelationshipType}`,
          timestamp: now,
        },
      ],
      version: 1,
      deviceId: '',
      updatedAt: now,
    });
  }

  // Ripple: re-run keyword patterns for all atoms mentioning this entity
  // (This is simplified — the content cache in harness-pipeline._content enables this)
  const allIntel = Array.from(store.atomIntelligence.values());
  for (const intel of allIntel) {
    const mentionsEntity = intel.entityMentions.some((m) => m.entityId === entity.id);
    if (!mentionsEntity) continue;

    const contentCache = (intel as unknown as { _content?: string })._content;
    if (contentCache) {
      const registryMentions = intel.entityMentions.filter((m) => m.entityId);
      if (registryMentions.length > 0) {
        // Run synchronously using void (side effects only)
        void runHarnessKeywordPatterns(store, intel.atomId, contentCache, registryMentions);
      }
    }
  }

  // Clean up suppressed relations after ripple
  cleanSuppressedRelations(store);
}

// ---------------------------------------------------------------------------
// Correction generation via LLM
// ---------------------------------------------------------------------------

export async function generateCorrections(
  store: HarnessEntityStore,
  groundTruth: GroundTruth,
  client: Anthropic,
  personaName: string,
): Promise<UserCorrection[]> {
  const mismatches = findMismatches(store, groundTruth);

  if (mismatches.length === 0) return [];

  const mismatchSummary = mismatches
    .map((m) => {
      if (m.currentType) {
        return `- ${m.entityName}: currently inferred as "${m.currentType}", should be "${m.correctType}"`;
      }
      return `- ${m.entityName}: no relationship inferred yet, should be "${m.correctType}"`;
    })
    .join('\n');

  const prompt = `You are reviewing the entity relationship graph for a GTD user named ${personaName}.

The system has made these relationship inference errors:
${mismatchSummary}

For each error, generate a realistic user correction that ${personaName} would submit through a UI popover.
The correction should reference a recent inbox item they remember (use a plausible but fictional atom ID like "item-cycle-N").

Return JSON only:
{
  "corrections": [
    {
      "entityName": "<exact name>",
      "wrongRelationshipType": "<wrong type or null if missing>",
      "correctRelationshipType": "<correct type>",
      "atomId": "<plausible item ID>"
    }
  ]
}`;

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
    const cleaned = responseText
      .replace(/^```json\s*/m, '')
      .replace(/^```\s*/m, '')
      .replace(/```\s*$/m, '')
      .trim();

    const parsed = JSON.parse(cleaned) as {
      corrections: Array<{
        entityName: string;
        wrongRelationshipType: string | null;
        correctRelationshipType: string;
        atomId: string;
      }>;
    };

    const now = new Date().toISOString();
    return (parsed.corrections || []).map((c) => ({
      entityName: c.entityName,
      wrongRelationshipType: c.wrongRelationshipType ?? null,
      correctRelationshipType: c.correctRelationshipType,
      atomId: c.atomId,
      appliedAt: now,
    }));
  } catch {
    // Fallback: generate corrections directly from mismatches without LLM
    const now = new Date().toISOString();
    return mismatches.map((m) => ({
      entityName: m.entityName,
      wrongRelationshipType: m.currentType,
      correctRelationshipType: m.correctType,
      atomId: 'item-auto-correction',
      appliedAt: now,
    }));
  }
}
