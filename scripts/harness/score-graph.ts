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
import type { PersonaAdversarialResult, AggregateScore, LearningCurvePoint } from './harness-types.js';

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
 * Check if two normalized strings match (exact or substring).
 * Substring: "pam" matches "pam jordan", "chen" matches "dr chen".
 */
function fuzzyMatch(a: string, b: string): boolean {
  if (a === b) return true;
  // Substring match — one must be at least 3 chars to avoid "a" matching "pam"
  if (a.length >= 3 && b.includes(a)) return true;
  if (b.length >= 3 && a.includes(b)) return true;
  return false;
}

/**
 * Check if a detected entity matches a ground truth entity.
 * Match by canonical name or any alias (case-insensitive, title-stripped, substring).
 */
function entityMatches(detected: Entity, gt: GroundTruthEntity): boolean {
  const normDetected = normalizeText(detected.canonicalName);
  const normGtCanonical = normalizeText(gt.canonicalName);

  // Check canonical name (exact + substring)
  if (fuzzyMatch(normDetected, normGtCanonical)) return true;

  // Check GT aliases
  for (const alias of gt.aliases) {
    if (fuzzyMatch(normDetected, normalizeText(alias))) return true;
  }

  // Check detected aliases against GT canonical and aliases
  for (const detAlias of detected.aliases) {
    const normDetAlias = normalizeText(detAlias);
    if (fuzzyMatch(normDetAlias, normGtCanonical)) return true;
    for (const gtAlias of gt.aliases) {
      if (fuzzyMatch(normDetAlias, normalizeText(gtAlias))) return true;
    }
  }

  return false;
}

/**
 * Resolve a ground truth entity name to a detected entity ID, if found.
 */
/**
 * Resolve a ground truth entity name to a detected entity ID, if found.
 * Uses fuzzy matching (substring) to handle "Pam" matching "Pam Jordan".
 */
function resolveGtEntity(
  gtEntityName: string,
  detectedEntities: Entity[],
): string | undefined {
  const normGt = normalizeText(gtEntityName);

  // Pass 1: exact match (prefer exact over substring)
  for (const det of detectedEntities) {
    if (normalizeText(det.canonicalName) === normGt) return det.id;
    for (const alias of det.aliases) {
      if (normalizeText(alias) === normGt) return det.id;
    }
  }

  // Pass 2: fuzzy/substring match
  for (const det of detectedEntities) {
    if (fuzzyMatch(normalizeText(det.canonicalName), normGt)) return det.id;
    for (const alias of det.aliases) {
      if (fuzzyMatch(normalizeText(alias), normGt)) return det.id;
    }
  }
  return undefined;
}

/**
 * Resolve a ground truth entity name to ALL matching detected entity IDs.
 * Handles entity dedup issues where "Nexus", "Nexus Tech", and "Nexus Technologies"
 * are separate entities in the store but the same entity in ground truth.
 */
function resolveAllGtEntities(
  gtEntityName: string,
  detectedEntities: Entity[],
): string[] {
  const normGt = normalizeText(gtEntityName);
  const ids: string[] = [];
  for (const det of detectedEntities) {
    if (normalizeText(det.canonicalName) === normGt) {
      ids.push(det.id);
      continue;
    }
    const aliasMatch = det.aliases.some((a) => normalizeText(a) === normGt);
    if (aliasMatch) {
      ids.push(det.id);
      continue;
    }
    if (fuzzyMatch(normalizeText(det.canonicalName), normGt)) {
      ids.push(det.id);
      continue;
    }
    for (const alias of det.aliases) {
      if (fuzzyMatch(normalizeText(alias), normGt)) {
        ids.push(det.id);
        break;
      }
    }
  }
  return ids;
}

// ---------------------------------------------------------------------------
// F1 calculation
// ---------------------------------------------------------------------------

function f1(precision: number, recall: number): number {
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

// ---------------------------------------------------------------------------
// Aggregate scoring helpers
// ---------------------------------------------------------------------------

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + Math.pow(v - m, 2), 0) / values.length;
  return Math.sqrt(variance);
}

function statSummary(values: number[]): { mean: number; median: number; min: number; max: number; stdDev: number } {
  return {
    mean: mean(values),
    median: median(values),
    min: values.length > 0 ? Math.min(...values) : 0,
    max: values.length > 0 ? Math.max(...values) : 0,
    stdDev: stdDev(values),
  };
}

/**
 * Compute aggregate score statistics across all personas.
 */
export function computeAggregateScore(results: PersonaAdversarialResult[]): AggregateScore {
  const entityF1Values = results.map((r) => r.finalScore.entityF1);
  const relationF1Values = results.map((r) => r.finalScore.relationshipF1);
  const privacyValues = results.map((r) => r.finalScore.privacyScore);

  return {
    entityF1: statSummary(entityF1Values),
    relationshipF1: statSummary(relationF1Values),
    privacyScore: statSummary(privacyValues),
    perPersona: results.map((r) => ({
      personaName: r.personaName,
      entityF1: r.finalScore.entityF1,
      relationshipF1: r.finalScore.relationshipF1,
      privacyScore: r.finalScore.privacyScore,
    })),
  };
}

/**
 * Compute per-cycle progression data (learning curve) for a persona.
 */
export function computeLearningCurve(cycles: Array<{ cycleNumber: number; score: GraphScore }>): LearningCurvePoint[] {
  return cycles.map((c) => ({
    cycle: c.cycleNumber,
    entityF1: c.score.entityF1,
    relationshipF1: c.score.relationshipF1,
    privacyScore: c.score.privacyScore,
  }));
}

// ---------------------------------------------------------------------------
// Ablation comparison utilities (re-exported from ablation-engine for convenience)
// ---------------------------------------------------------------------------

import type { AblationSuiteResult, AblationDelta, ComponentRanking } from './ablation-engine.js';
export type { AblationDelta, ComponentRanking };

/**
 * Compute per-metric delta showing exactly how much each component contributes.
 * Exported from score-graph for convenience — delegates to ablation-engine.
 */
export function computeAblationDelta(
  fullScore: GraphScore,
  ablatedScore: GraphScore,
): AblationDelta {
  const entityF1Delta = ablatedScore.entityF1 - fullScore.entityF1;
  const relationshipF1Delta = ablatedScore.relationshipF1 - fullScore.relationshipF1;
  const privacyScoreDelta = ablatedScore.privacyScore - fullScore.privacyScore;
  const overallImpact = entityF1Delta * 0.3 + relationshipF1Delta * 0.5 + privacyScoreDelta * 0.2;
  return { entityF1Delta, relationshipF1Delta, privacyScoreDelta, overallImpact };
}

/**
 * Rank components by their impact on the final score.
 * Uses ablation suite results — largest absolute F1 delta = most load-bearing.
 */
export function rankComponents(suiteResult: AblationSuiteResult): ComponentRanking[] {
  const rankings: ComponentRanking[] = [];

  for (const [componentName, ablationResults] of suiteResult.perComponentResults.entries()) {
    if (ablationResults.length === 0) continue;

    const avgRelF1Delta =
      ablationResults.reduce((sum, r) => sum + r.comparisonToFull.relationshipF1Delta, 0) /
      ablationResults.length;

    const avgEntF1Delta =
      ablationResults.reduce((sum, r) => sum + r.comparisonToFull.entityF1Delta, 0) /
      ablationResults.length;

    const avgOverallImpact =
      ablationResults.reduce((sum, r) => sum + r.comparisonToFull.overallImpact, 0) /
      ablationResults.length;

    rankings.push({
      componentName,
      impactScore: Math.abs(avgOverallImpact),
      relationshipF1Delta: avgRelF1Delta,
      entityF1Delta: avgEntF1Delta,
    });
  }

  return rankings.sort((a, b) => b.impactScore - a.impactScore);
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
    // Find ALL detected entities that could match this GT entity
    const candidateEntityIds = resolveAllGtEntities(gtRel.entity, detectedEntities);

    if (!candidateEntityIds.length) {
      // Entity not detected — relationship can't be found either
      missedRelations.push({ entity: gtRel.entity, type: gtRel.type });
      continue;
    }

    // Check if any detected relation matches this GT relationship for ANY candidate entity
    const found = detectedRelations.some((rel) => {
      const typeMatches = rel.relationshipType === gtRel.type;
      const entityMatched = candidateEntityIds.some(
        (id) => rel.targetEntityId === id || rel.sourceEntityId === id,
      );
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
    const targetEntityId = rel.targetEntityId;
    const detTarget = store.getEntity(targetEntityId);
    if (!detTarget) continue;

    const matchesGt = gtRelationships.some((gtRel) => {
      const gtEntityIds = resolveAllGtEntities(gtRel.entity, detectedEntities);
      return (
        gtEntityIds.includes(targetEntityId) && gtRel.type === rel.relationshipType
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
