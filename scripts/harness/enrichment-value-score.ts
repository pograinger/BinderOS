/**
 * Enrichment Value Score (EVS) — objective measurement of how much
 * smarter the local stack got about an atom after enrichment.
 *
 * Five dimensions:
 * 1. Information Gain — new entities/relationships discovered from enrichment answers
 * 2. Disambiguation — ambiguous atoms resolved to specific entities+relations
 * 3. Actionability — GTD-actionable metadata surfaced (next-action, project, deadline, context)
 * 4. Graph Connectivity — new edges added to the knowledge graph from enrichment
 * 5. Privacy Yield — entities promoted from generic pseudonyms to semantic tags
 *
 * All scores are 0-1 normalized. The composite EVS is a weighted average.
 *
 * Phase 29: TVAL-01
 */

import type { EnrichmentEmulation, SimulatedQA } from './harness-types.js';
import type { GroundTruth } from './score-graph.js';
import { HarnessEntityStore } from './harness-entity-store.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EVSDimensions {
  /** New entities/relationships first discovered via enrichment answers */
  informationGain: number;
  /** Ambiguous references resolved to known entities with relationships */
  disambiguation: number;
  /** GTD-actionable metadata surfaced: next-action, project, deadline, context, delegation */
  actionability: number;
  /** New knowledge graph edges created from enrichment mining */
  graphConnectivity: number;
  /** Entities promoted from <Person N> to [SPOUSE]/[DENTIST] semantic tags */
  privacyYield: number;
}

export interface AtomEVS {
  atomId: string;
  dimensions: EVSDimensions;
  /** Weighted composite score (0-1) */
  composite: number;
}

export interface CycleEVS {
  /** Per-atom EVS scores */
  perAtom: AtomEVS[];
  /** Aggregate across all atoms in the cycle */
  mean: EVSDimensions & { composite: number };
  /** How many atoms had enrichment that actually produced value (composite > 0.1) */
  atomsWithValue: number;
  /** Total atoms enriched */
  totalAtoms: number;
}

// Dimension weights — tuned to reflect what matters for "learning and protecting"
const WEIGHTS = {
  informationGain: 0.25,
  disambiguation: 0.20,
  actionability: 0.20,
  graphConnectivity: 0.20,
  privacyYield: 0.15,
};

// ---------------------------------------------------------------------------
// Actionability detection from enrichment answers
// ---------------------------------------------------------------------------

const ACTIONABILITY_SIGNALS = {
  nextAction: /\b(need to|should|will|going to|have to|must|call|email|send|buy|pick up|drop off|schedule|book|cancel|update|review|check|follow up|reach out)\b/i,
  project: /\b(project|goal|initiative|milestone|phase|campaign|launch|rollout|migration|renovation|plan for)\b/i,
  deadline: /\b(by|before|due|deadline|expires?|until|end of|no later than|this week|next week|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|asap|urgent)\b/i,
  context: /\b(@\w+|at (work|home|office|computer|phone|store)|online|in person|at the)\b/i,
  delegation: /\b(ask|tell|have|get)\s+(him|her|them|\w+)\s+(to|about)\b/i,
};

function scoreActionability(qa: SimulatedQA[]): number {
  if (qa.length === 0) return 0;

  const allText = qa.map((q) => q.answer).join(' ');
  let signals = 0;
  const total = Object.keys(ACTIONABILITY_SIGNALS).length;

  for (const [_key, pattern] of Object.entries(ACTIONABILITY_SIGNALS)) {
    if (pattern.test(allText)) signals++;
  }

  return signals / total;
}

// ---------------------------------------------------------------------------
// Per-atom EVS computation
// ---------------------------------------------------------------------------

/**
 * Compute EVS for a single atom's enrichment session.
 *
 * @param emulation - The enrichment emulation result for this atom
 * @param store - Entity store AFTER enrichment processing
 * @param storeBefore - Entity store snapshot BEFORE this atom's enrichment
 *   (relations count, entity count — used to measure delta)
 * @param groundTruth - Persona ground truth for measuring coverage
 */
export function computeAtomEVS(
  emulation: EnrichmentEmulation,
  store: HarnessEntityStore,
  preEnrichmentRelCount: number,
  preEnrichmentEntityCount: number,
  groundTruth: GroundTruth,
): AtomEVS {
  const { atomId, newEntityMentions, simulatedQA } = emulation;

  // --- 1. Information Gain ---
  // New entities first seen in enrichment / total GT entities
  const newEntitiesFromEnrichment = newEntityMentions.filter((m) => m.entityId).length;
  const gtEntityCount = Math.max(1, groundTruth.entities.length);
  const informationGain = Math.min(1, newEntitiesFromEnrichment / gtEntityCount);

  // --- 2. Disambiguation ---
  // Of the new entity mentions from enrichment, how many now have a relationship?
  const mentionsWithRelation = newEntityMentions.filter((m) => {
    if (!m.entityId) return false;
    const rels = store.getRelations().filter(
      (r) => r.targetEntityId === m.entityId || r.sourceEntityId === m.entityId,
    );
    return rels.length > 0;
  }).length;
  const disambiguation = newEntityMentions.length > 0
    ? mentionsWithRelation / newEntityMentions.length
    : 0;

  // --- 3. Actionability ---
  const actionability = scoreActionability(simulatedQA);

  // --- 4. Graph Connectivity ---
  // New relation edges created during/after enrichment processing
  const postRelCount = store.getRelations().length;
  const postEntityCount = store.getEntities().length;
  const newRelations = Math.max(0, postRelCount - preEnrichmentRelCount);
  const newEntities = Math.max(0, postEntityCount - preEnrichmentEntityCount);
  // Normalize: new edges relative to GT relationship count
  const gtRelCount = Math.max(1, groundTruth.relationships.length);
  const graphConnectivity = Math.min(1, (newRelations + newEntities * 0.5) / gtRelCount);

  // --- 5. Privacy Yield ---
  // Entities from enrichment that now have a relationship (enabling semantic sanitization)
  // vs total entities from enrichment
  const enrichmentEntityIds = new Set(
    newEntityMentions.filter((m) => m.entityId).map((m) => m.entityId!),
  );
  let semanticTaggable = 0;
  for (const entityId of enrichmentEntityIds) {
    const hasRelation = store.getRelations().some(
      (r) => r.targetEntityId === entityId || r.sourceEntityId === entityId,
    );
    if (hasRelation) semanticTaggable++;
  }
  const privacyYield = enrichmentEntityIds.size > 0
    ? semanticTaggable / enrichmentEntityIds.size
    : 0;

  const dimensions: EVSDimensions = {
    informationGain,
    disambiguation,
    actionability,
    graphConnectivity,
    privacyYield,
  };

  const composite =
    dimensions.informationGain * WEIGHTS.informationGain +
    dimensions.disambiguation * WEIGHTS.disambiguation +
    dimensions.actionability * WEIGHTS.actionability +
    dimensions.graphConnectivity * WEIGHTS.graphConnectivity +
    dimensions.privacyYield * WEIGHTS.privacyYield;

  return { atomId, dimensions, composite };
}

// ---------------------------------------------------------------------------
// Cycle-level EVS aggregation
// ---------------------------------------------------------------------------

export function aggregateCycleEVS(atomScores: AtomEVS[]): CycleEVS {
  const totalAtoms = atomScores.length;

  if (totalAtoms === 0) {
    return {
      perAtom: [],
      mean: {
        informationGain: 0,
        disambiguation: 0,
        actionability: 0,
        graphConnectivity: 0,
        privacyYield: 0,
        composite: 0,
      },
      atomsWithValue: 0,
      totalAtoms: 0,
    };
  }

  const sum: EVSDimensions = {
    informationGain: 0,
    disambiguation: 0,
    actionability: 0,
    graphConnectivity: 0,
    privacyYield: 0,
  };
  let compositeSum = 0;
  let atomsWithValue = 0;

  for (const atom of atomScores) {
    sum.informationGain += atom.dimensions.informationGain;
    sum.disambiguation += atom.dimensions.disambiguation;
    sum.actionability += atom.dimensions.actionability;
    sum.graphConnectivity += atom.dimensions.graphConnectivity;
    sum.privacyYield += atom.dimensions.privacyYield;
    compositeSum += atom.composite;
    if (atom.composite > 0.1) atomsWithValue++;
  }

  return {
    perAtom: atomScores,
    mean: {
      informationGain: sum.informationGain / totalAtoms,
      disambiguation: sum.disambiguation / totalAtoms,
      actionability: sum.actionability / totalAtoms,
      graphConnectivity: sum.graphConnectivity / totalAtoms,
      privacyYield: sum.privacyYield / totalAtoms,
      composite: compositeSum / totalAtoms,
    },
    atomsWithValue,
    totalAtoms,
  };
}

// ---------------------------------------------------------------------------
// Format EVS for reports
// ---------------------------------------------------------------------------

export function formatEVSReport(evs: CycleEVS): string {
  const m = evs.mean;
  const pct = (v: number) => (v * 100).toFixed(1) + '%';
  const bar = (v: number) => {
    const filled = Math.round(v * 20);
    return '|' + '\u2588'.repeat(filled) + '\u2591'.repeat(20 - filled) + '|';
  };

  return [
    `  Composite EVS:      ${bar(m.composite)} ${pct(m.composite)}`,
    `  Information Gain:   ${bar(m.informationGain)} ${pct(m.informationGain)}  (new entities/relations from enrichment)`,
    `  Disambiguation:     ${bar(m.disambiguation)} ${pct(m.disambiguation)}  (enrichment entities resolved to relationships)`,
    `  Actionability:      ${bar(m.actionability)} ${pct(m.actionability)}  (GTD-actionable metadata surfaced)`,
    `  Graph Connectivity: ${bar(m.graphConnectivity)} ${pct(m.graphConnectivity)}  (new knowledge graph edges)`,
    `  Privacy Yield:      ${bar(m.privacyYield)} ${pct(m.privacyYield)}  (entities promotable to semantic tags)`,
    `  Atoms with value:   ${evs.atomsWithValue}/${evs.totalAtoms} (composite > 10%)`,
  ].join('\n');
}
