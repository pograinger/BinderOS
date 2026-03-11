/**
 * Scoring engine — compares detected entity graph against ground truth.
 *
 * Computes precision/recall/F1 for entities and relationships,
 * plus a privacy score showing how entity knowledge enables semantic
 * sanitization (replacing "[PERSON]" with "[SPOUSE]" etc.).
 *
 * Phase 28: HARN-03
 */

import type { Entity, EntityRelation } from '../../src/types/intelligence.js';
import { HarnessEntityStore } from './harness-entity-store.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GroundTruthEntity {
  canonicalName: string;
  type: 'PER' | 'LOC' | 'ORG';
  aliases: string[];
}

export interface GroundTruthRelationship {
  entity: string; // canonical name of the target entity
  type: string; // relationship type
  confidence: number;
  note?: string;
}

export interface GroundTruth {
  entities: GroundTruthEntity[];
  relationships: GroundTruthRelationship[];
  facts: string[];
}

export interface GraphScore {
  checkpoint: number; // atom count at which this score was taken
  // Entity scores
  entityPrecision: number;
  entityRecall: number;
  entityF1: number;
  // Relationship scores
  relationshipPrecision: number;
  relationshipRecall: number;
  relationshipF1: number;
  // Privacy score
  privacyScore: number;
  // Counts
  totalDetectedEntities: number;
  totalGroundTruthEntities: number;
  correctEntities: number;
  totalDetectedRelations: number;
  totalGroundTruthRelations: number;
  correctRelations: number;
  // Detail
  foundEntities: string[];
  missedEntities: string[];
  foundRelations: Array<{ entity: string; type: string }>;
  missedRelations: Array<{ entity: string; type: string }>;
}

// ---------------------------------------------------------------------------
// Entity matching helpers
// ---------------------------------------------------------------------------

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/^(dr\.?|mr\.?|mrs\.?|ms\.?|prof\.?)\s+/i, '')
    .trim();
}

/**
 * Check if a detected entity matches a ground truth entity.
 * Match by canonical name or any alias (case-insensitive, title-stripped).
 */
function entityMatches(detected: Entity, gt: GroundTruthEntity): boolean {
  const normDetected = normalizeText(detected.canonicalName);

  // Check canonical name
  if (normDetected === normalizeText(gt.canonicalName)) return true;

  // Check GT aliases
  for (const alias of gt.aliases) {
    if (normDetected === normalizeText(alias)) return true;
  }

  // Check detected aliases against GT canonical and aliases
  for (const detAlias of detected.aliases) {
    const normDetAlias = normalizeText(detAlias);
    if (normDetAlias === normalizeText(gt.canonicalName)) return true;
    for (const gtAlias of gt.aliases) {
      if (normDetAlias === normalizeText(gtAlias)) return true;
    }
  }

  return false;
}

/**
 * Resolve a ground truth entity name to a detected entity ID, if found.
 */
function resolveGtEntity(
  gtEntityName: string,
  detectedEntities: Entity[],
): string | undefined {
  const normGt = normalizeText(gtEntityName);
  for (const det of detectedEntities) {
    if (normalizeText(det.canonicalName) === normGt) return det.id;
    for (const alias of det.aliases) {
      if (normalizeText(alias) === normGt) return det.id;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// F1 calculation
// ---------------------------------------------------------------------------

function f1(precision: number, recall: number): number {
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

// ---------------------------------------------------------------------------
// Main scoring function
// ---------------------------------------------------------------------------

export function scoreEntityGraph(
  store: HarnessEntityStore,
  groundTruth: GroundTruth,
  checkpoint: number,
): GraphScore {
  const detectedEntities = store.getEntities();
  const detectedRelations = store.getRelations();
  const gtEntities = groundTruth.entities;
  const gtRelationships = groundTruth.relationships;

  // -------------------------------------------------------------------------
  // Entity scoring
  // -------------------------------------------------------------------------

  // For each ground truth entity, check if we detected it
  const foundEntities: string[] = [];
  const missedEntities: string[] = [];

  for (const gtEnt of gtEntities) {
    const found = detectedEntities.some((det) => entityMatches(det, gtEnt));
    if (found) {
      foundEntities.push(gtEnt.canonicalName);
    } else {
      missedEntities.push(gtEnt.canonicalName);
    }
  }

  // For precision: how many detected entities match a GT entity
  let correctDetected = 0;
  for (const det of detectedEntities) {
    const matchesAny = gtEntities.some((gt) => entityMatches(det, gt));
    if (matchesAny) correctDetected++;
  }

  const entityPrecision =
    detectedEntities.length > 0 ? correctDetected / detectedEntities.length : 0;
  const entityRecall =
    gtEntities.length > 0 ? foundEntities.length / gtEntities.length : 0;

  // -------------------------------------------------------------------------
  // Relationship scoring
  // -------------------------------------------------------------------------

  const foundRelations: Array<{ entity: string; type: string }> = [];
  const missedRelations: Array<{ entity: string; type: string }> = [];

  for (const gtRel of gtRelationships) {
    // Find the detected entity corresponding to this GT relationship target
    const detectedEntityId = resolveGtEntity(gtRel.entity, detectedEntities);

    if (!detectedEntityId) {
      // Entity not detected — relationship can't be found either
      missedRelations.push({ entity: gtRel.entity, type: gtRel.type });
      continue;
    }

    // Check if any detected relation matches this GT relationship
    // GT relationships use [SELF] as source (Alex's relationships)
    const found = detectedRelations.some((rel) => {
      const typeMatches = rel.relationshipType === gtRel.type;
      const entityMatched =
        rel.targetEntityId === detectedEntityId ||
        rel.sourceEntityId === detectedEntityId;
      return typeMatches && entityMatched;
    });

    if (found) {
      foundRelations.push({ entity: gtRel.entity, type: gtRel.type });
    } else {
      missedRelations.push({ entity: gtRel.entity, type: gtRel.type });
    }
  }

  // For precision: how many detected relations correspond to GT relationships
  let correctRelations = 0;
  for (const rel of detectedRelations) {
    // Find the target entity
    const targetEntityId =
      rel.sourceEntityId === '[SELF]' ? rel.targetEntityId : rel.targetEntityId;
    const detTarget = store.getEntity(targetEntityId);
    if (!detTarget) continue;

    const matchesGt = gtRelationships.some((gtRel) => {
      const gtEntityId = resolveGtEntity(gtRel.entity, detectedEntities);
      return (
        gtEntityId === targetEntityId && gtRel.type === rel.relationshipType
      );
    });
    if (matchesGt) correctRelations++;
  }

  const relationshipPrecision =
    detectedRelations.length > 0 ? correctRelations / detectedRelations.length : 0;
  const relationshipRecall =
    gtRelationships.length > 0 ? foundRelations.length / gtRelationships.length : 0;

  // -------------------------------------------------------------------------
  // Privacy score
  // -------------------------------------------------------------------------
  // For each GT entity with a relationship, check if we have an EntityRelation
  // that allows semantic sanitization (e.g., "Pam" → "[SPOUSE]").
  const gtEntitiesWithRelationships = gtRelationships.map((r) => r.entity);
  let entitiesWithInferredRelation = 0;

  for (const gtEntName of gtEntitiesWithRelationships) {
    const detEntityId = resolveGtEntity(gtEntName, detectedEntities);
    if (!detEntityId) continue;

    const hasRelation = detectedRelations.some(
      (rel) =>
        rel.targetEntityId === detEntityId || rel.sourceEntityId === detEntityId,
    );
    if (hasRelation) entitiesWithInferredRelation++;
  }

  const privacyScore =
    gtEntitiesWithRelationships.length > 0
      ? entitiesWithInferredRelation / gtEntitiesWithRelationships.length
      : 0;

  return {
    checkpoint,
    entityPrecision,
    entityRecall,
    entityF1: f1(entityPrecision, entityRecall),
    relationshipPrecision,
    relationshipRecall,
    relationshipF1: f1(relationshipPrecision, relationshipRecall),
    privacyScore,
    totalDetectedEntities: detectedEntities.length,
    totalGroundTruthEntities: gtEntities.length,
    correctEntities: foundEntities.length,
    totalDetectedRelations: detectedRelations.length,
    totalGroundTruthRelations: gtRelationships.length,
    correctRelations: foundRelations.length,
    foundEntities,
    missedEntities,
    foundRelations,
    missedRelations,
  };
}
