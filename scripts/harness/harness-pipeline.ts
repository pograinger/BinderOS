/**
 * Headless pipeline for the cognitive harness.
 *
 * Processes a single corpus item through:
 * 1. Triage acceptance (all items accepted in harness)
 * 2. Entity mention injection (pre-annotated, skips NER)
 * 3. Relationship inference (keyword patterns + co-occurrence)
 *
 * No browser-only imports — pure Node.js compatible.
 *
 * Phase 28: HARN-01, HARN-02
 */

import type { AtomIntelligence, EntityMention } from '../../src/types/intelligence.js';
import type { GateContext } from '../../src/types/gate.js';
import type { CorpusItem } from './generate-corpus.js';
import { HarnessEntityStore } from './harness-entity-store.js';
import {
  runHarnessKeywordPatterns,
  updateHarnessCooccurrence,
} from './harness-inference.js';

// ---------------------------------------------------------------------------
// Role-word alias extraction — "mom Linda" → add "mom" as alias for Linda
// ---------------------------------------------------------------------------

const ROLE_WORDS = new Set([
  'mom', 'mother', 'mama', 'ma',
  'dad', 'father', 'papa', 'pop',
  'brother', 'sister', 'bro', 'sis',
  'son', 'daughter', 'kid', 'kiddo',
  'wife', 'husband', 'hubby',
  'uncle', 'aunt',
  'grandma', 'grandmother', 'grandpa', 'grandfather',
  'boss', 'manager', 'supervisor',
  'dentist', 'doctor', 'doc', 'therapist',
  'neighbor', 'neighbour',
  'buddy', 'bestie', 'pal',
  'babysitter', 'nanny', 'sitter',
]);

// ---------------------------------------------------------------------------
// Role-word → relationship type mapping for entity resolution
// ---------------------------------------------------------------------------

const ROLE_WORD_TO_RELATION = new Map<string, string>([
  // Spouse
  ['wife', 'spouse'], ['husband', 'spouse'], ['hubby', 'spouse'],
  ['spouse', 'spouse'], ['partner', 'spouse'],
  ['better half', 'spouse'], ['sweetheart', 'spouse'],
  // Reports-to
  ['boss', 'reports-to'], ['manager', 'reports-to'], ['supervisor', 'reports-to'],
  ['team lead', 'reports-to'],
  // Parent
  ['mom', 'parent'], ['mother', 'parent'], ['mama', 'parent'], ['ma', 'parent'],
  ['dad', 'parent'], ['father', 'parent'], ['papa', 'parent'], ['pop', 'parent'],
  // Child
  ['son', 'child'], ['daughter', 'child'], ['kid', 'child'], ['kiddo', 'child'],
  ['little one', 'child'], ['baby', 'child'], ['my boy', 'child'], ['my girl', 'child'],
  // Healthcare
  ['dentist', 'healthcare-provider'], ['doctor', 'healthcare-provider'],
  ['therapist', 'healthcare-provider'], ['pediatrician', 'healthcare-provider'],
  ['physician', 'healthcare-provider'], ['psychiatrist', 'healthcare-provider'],
  ['orthodontist', 'healthcare-provider'], ['dermatologist', 'healthcare-provider'],
  ['chiropractor', 'healthcare-provider'], ['doc', 'healthcare-provider'],
  ['surgeon', 'healthcare-provider'], ['specialist', 'healthcare-provider'],
  ['cardiologist', 'healthcare-provider'], ['oncologist', 'healthcare-provider'],
  ['optometrist', 'healthcare-provider'], ['nurse', 'healthcare-provider'],
  // Sibling
  ['brother', 'sibling'], ['sister', 'sibling'], ['bro', 'sibling'], ['sis', 'sibling'],
  // Friend
  ['buddy', 'friend'], ['bestie', 'friend'], ['pal', 'friend'], ['bff', 'friend'],
  // Colleague
  ['coworker', 'colleague'], ['co-worker', 'colleague'], ['teammate', 'colleague'],
  ['workmate', 'colleague'],
  // Other
  ['neighbor', 'neighbor'], ['neighbour', 'neighbor'],
  ['lawyer', 'lawyer'], ['attorney', 'lawyer'],
  ['vet', 'veterinarian'], ['veterinarian', 'veterinarian'],
  ['accountant', 'accountant'], ['cpa', 'accountant'],
  ['landlord', 'landlord'], ['landlady', 'landlord'],
  ['coach', 'coach'], ['trainer', 'coach'],
  ['mentor', 'mentor'],
  ['teacher', 'teacher'], ['tutor', 'teacher'],
  ['babysitter', 'childcare'], ['nanny', 'childcare'], ['sitter', 'childcare'],
]);

// ---------------------------------------------------------------------------
// Entity type heuristic — fixes corpus generator misclassifying ORG/LOC as PER
// ---------------------------------------------------------------------------

const ORG_INDICATORS = /\b(corp|inc|llc|ltd|co\.?|company|university|school|elementary|academy|institute|hospital|clinic|foundation|association|depot|store|bank|group)\b/i;

function inferEntityType(
  entityText: string,
  annotatedType: 'PER' | 'LOC' | 'ORG',
): 'PER' | 'LOC' | 'ORG' {
  if (annotatedType !== 'PER') return annotatedType;
  if (ORG_INDICATORS.test(entityText)) return 'ORG';
  return annotatedType;
}

/**
 * Check if a known role word appears immediately before the entity mention.
 * If so, add it as an alias to enable future dedup (e.g., "mom Linda" → "mom" alias on Linda).
 */
function extractRoleAlias(
  content: string,
  mention: { spanStart: number; entityText: string },
): string | undefined {
  // Look at the word immediately before the entity span
  const prefix = content.slice(0, mention.spanStart).trimEnd();
  const lastWord = prefix.split(/\s+/).pop()?.toLowerCase();
  if (lastWord && ROLE_WORDS.has(lastWord)) {
    return lastWord;
  }
  return undefined;
}

/**
 * Merge sourceEntity into targetEntity: reassign all relations and remove source.
 */
function mergeEntities(store: HarnessEntityStore, sourceId: string, targetId: string): void {
  const source = store.getEntity(sourceId);
  const target = store.getEntity(targetId);
  if (!source || !target) return;

  // Add source name as alias on target
  const normSource = source.canonicalName.toLowerCase();
  const hasAlias = target.aliases.some((a) => a.toLowerCase() === normSource) ||
    target.canonicalName.toLowerCase() === normSource;
  if (!hasAlias) {
    store.updateEntity(targetId, {
      aliases: [...target.aliases, source.canonicalName],
      mentionCount: target.mentionCount + source.mentionCount,
    });
  }

  // Reassign all relations pointing to/from source → target
  for (const rel of store.getRelations()) {
    if (rel.sourceEntityId === sourceId) {
      // Check for duplicate before reassigning
      const existing = store.findRelation(targetId, rel.targetEntityId, rel.relationshipType);
      if (existing) {
        // Merge evidence and boost confidence
        store.updateRelation(existing.id, {
          confidence: Math.min(0.95, existing.confidence + rel.confidence * 0.5),
          evidence: [...existing.evidence, ...rel.evidence],
        });
        store.entityRelations.delete(rel.id);
      } else {
        store.updateRelation(rel.id, { sourceEntityId: targetId });
      }
    } else if (rel.targetEntityId === sourceId) {
      const existing = store.findRelation(rel.sourceEntityId, targetId, rel.relationshipType);
      if (existing) {
        store.updateRelation(existing.id, {
          confidence: Math.min(0.95, existing.confidence + rel.confidence * 0.5),
          evidence: [...existing.evidence, ...rel.evidence],
        });
        store.entityRelations.delete(rel.id);
      } else {
        store.updateRelation(rel.id, { targetEntityId: targetId });
      }
    }
  }

  // Remove source entity
  store.entities.delete(sourceId);
}

// ---------------------------------------------------------------------------
// Gate context builder — Phase 31
// ---------------------------------------------------------------------------

/**
 * Build a GateContext for harness dispatches.
 *
 * The harness runs in a headless Node.js environment with no browser routing.
 * Route is always '/binder' and timeOfDay is fixed to midday (10) for deterministic
 * replay — harness results should not vary by clock time.
 *
 * If the atom has been enriched before (atomIntelligence exists), lastEnrichedAt
 * and enrichmentDepth are populated from the sidecar so the history predicate
 * evaluates correctly during ablation replays.
 *
 * @param atomId - The atom being dispatched
 * @param store  - HarnessEntityStore for reading existing sidecar data
 */
export function buildHarnessGateContext(
  atomId: string,
  store: HarnessEntityStore,
): GateContext {
  const intel = store.atomIntelligence?.get(atomId);
  return {
    route: '/binder',
    timeOfDay: 10, // Fixed midday — harness results must not vary by wall-clock time
    atomId,
    binderType: 'gtd-personal',
    enrichmentDepth: intel?.enrichment?.length ?? 0,
    lastEnrichedAt: intel?.lastUpdated,
  };
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

/**
 * Get all atom IDs processed so far in this store.
 * Used by correction ripple to iterate existing atoms.
 */
export function getProcessedAtomIds(store: HarnessEntityStore): string[] {
  return Array.from(store.atomIntelligence.keys());
}

/**
 * Process one corpus item through the headless pipeline.
 *
 * Steps:
 * 1. Simulate triage acceptance
 * 2. Resolve pre-annotated entity mentions to registry IDs
 * 3. Write mentions to atomIntelligence sidecar
 * 4. Run keyword pattern inference
 * 5. Update co-occurrence map
 *
 * @param syntheticTimestamp Optional ISO timestamp to use for entity lastSeen / sidecar timestamps
 */
export async function runHarnessAtom(
  item: CorpusItem,
  store: HarnessEntityStore,
  syntheticTimestamp?: number,
): Promise<void> {
  const atomId = item.id;
  const content = item.content;

  // Step 1: Triage acceptance — harness always accepts all items

  // Use synthetic timestamp if provided (for realistic decay simulation), else real time
  const timestamp = syntheticTimestamp ?? Date.now();

  // Step 2: Resolve entity mentions to registry IDs
  const resolvedMentions: EntityMention[] = [];
  const roleWordLinks: Array<{ roleWord: string; entityId: string }> = [];

  for (const mention of item.entityMentions) {
    // Only PER/LOC/ORG go through entity registry
    if (mention.entityType !== 'PER' && mention.entityType !== 'LOC' && mention.entityType !== 'ORG') {
      resolvedMentions.push({ ...mention });
      continue;
    }

    // Fix entity type: corpus generator sometimes misclassifies ORG/LOC as PER
    const correctedType = inferEntityType(
      mention.entityText,
      mention.entityType as 'PER' | 'LOC' | 'ORG',
    );

    // Cross-type dedup: if entity was previously registered under the wrong type,
    // fix it so findOrCreateEntity won't create a duplicate (e.g., "Little Steps Daycare"
    // as both PER and ORG → just ORG)
    if (correctedType !== mention.entityType) {
      const wrongTypeEntities = store.getEntitiesByType(mention.entityType as 'PER' | 'LOC' | 'ORG');
      const existingWrong = wrongTypeEntities.find(
        (e) => e.canonicalName.toLowerCase() === mention.entityText.toLowerCase(),
      );
      if (existingWrong) {
        store.updateEntity(existingWrong.id, { type: correctedType });
      }
    }

    const entityId = store.findOrCreateEntity(mention.entityText, correctedType, timestamp);
    if (!entityId) continue; // Rejected as non-entity word
    resolvedMentions.push({ ...mention, entityType: correctedType, entityId });

    // Extract role-word context for deferred merging (e.g., "mom Linda" → link "mom" to Linda)
    if (mention.entityType === 'PER') {
      const roleAlias = extractRoleAlias(content, mention);
      if (roleAlias) {
        roleWordLinks.push({ roleWord: roleAlias.toLowerCase(), entityId });
      }
    }
  }

  // Deferred merge: if a role-word entity exists (e.g., "Mom") and a proper-name entity
  // has the same role word adjacent (e.g., "mom Linda"), merge role-word entity into proper-name.
  for (const { roleWord, entityId: properNameId } of roleWordLinks) {
    const allPer = store.getEntitiesByType('PER');
    const roleEntity = allPer.find(
      (e) => e.id !== properNameId && e.canonicalName.toLowerCase() === roleWord,
    );
    if (roleEntity) {
      mergeEntities(store, roleEntity.id, properNameId);
    }
  }

  // Step 3: Write atomIntelligence sidecar
  const intel: AtomIntelligence = {
    atomId,
    enrichment: [],
    entityMentions: resolvedMentions,
    cognitiveSignals: [],
    records: [],
    version: 1,
    deviceId: '',
    lastUpdated: timestamp,
    schemaVersion: 1,
  };
  store.putAtomIntelligence(intel);

  // Cache content for reRunPatternsForEntity correction ripple
  (intel as unknown as { _content: string })._content = content;

  // Step 4: Run keyword patterns for registry mentions
  const registryMentions = resolvedMentions.filter((m) => m.entityId);
  if (registryMentions.length > 0) {
    await runHarnessKeywordPatterns(store, atomId, content, registryMentions);
  }

  // Step 5: Update co-occurrence map
  updateHarnessCooccurrence(content, registryMentions);
}

// ---------------------------------------------------------------------------
// Post-cycle role-word entity merge
// ---------------------------------------------------------------------------

/**
 * Merge single-word role-word entities into proper-name entities that share
 * the same relationship type. E.g., merge "Boss" → "Marcus" when both have
 * reports-to, or "dentist" → "Dr. Chen" when both have healthcare-provider.
 *
 * This eliminates duplicate relations that tank precision without helping recall.
 * Call after all atoms in a cycle are processed, before scoring.
 */
export function mergeRoleWordEntities(store: HarnessEntityStore): number {
  let mergeCount = 0;
  // Snapshot entity list — merges mutate the map
  const entities = store.getEntities();

  for (const entity of entities) {
    // Skip if already merged (deleted from store)
    if (!store.getEntity(entity.id)) continue;

    const roleRelation = ROLE_WORD_TO_RELATION.get(entity.canonicalName.toLowerCase());
    if (!roleRelation) continue;

    // This IS a role-word entity — find a proper-name entity with the same relation type
    const allRelations = store.getRelations();

    // Find relations on this role-word entity
    const roleEntityRelations = allRelations.filter(
      (r) => r.targetEntityId === entity.id || r.sourceEntityId === entity.id,
    );

    // Find proper-name entities with the same relationship type
    for (const rel of roleEntityRelations) {
      const sameTypeRelations = allRelations.filter(
        (r) =>
          r.relationshipType === rel.relationshipType &&
          r.id !== rel.id,
      );

      for (const otherRel of sameTypeRelations) {
        // Relations are [SELF] → targetEntityId
        const otherTargetId = otherRel.targetEntityId;
        if (otherTargetId === entity.id) continue;

        const otherEntity = store.getEntity(otherTargetId);
        if (!otherEntity) continue;

        // Don't merge into another role-word entity
        if (ROLE_WORD_TO_RELATION.has(otherEntity.canonicalName.toLowerCase())) continue;

        // Merge role-word entity into proper-name entity
        mergeEntities(store, entity.id, otherTargetId);
        mergeCount++;
        break;
      }

      // Stop if already merged
      if (!store.getEntity(entity.id)) break;
    }
  }

  return mergeCount;
}

/**
 * Merge descriptor entities into proper-name entities for non-singular relation types.
 *
 * Handles cases that ROLE_WORD_TO_RELATION misses: when a descriptive phrase
 * (lowercase, common noun) has the same relation type as a proper name.
 * E.g., "little one" + "Zara" both with child → merge "little one" into Zara.
 *
 * Heuristic: an entity is a "descriptor" if its canonical name is:
 *   - All lowercase (no proper-noun capitalization), OR
 *   - A known role word in ROLE_WORD_TO_RELATION (already handled, but belt-and-suspenders)
 *
 * Only merges when exactly one proper-name entity has the same relation type,
 * preventing ambiguous merges when multiple proper names share a type.
 */
export function mergeDescriptorEntities(store: HarnessEntityStore): number {
  let mergeCount = 0;
  const entities = store.getEntities();
  const allRelations = store.getRelations();

  // Build a map: relationshipType → list of {entityId, isDescriptor}
  const relTypeToEntities = new Map<string, Array<{ entityId: string; isDescriptor: boolean }>>();

  for (const rel of allRelations) {
    if (rel.sourceEntityId !== '[SELF]') continue;
    const entity = store.getEntity(rel.targetEntityId);
    if (!entity || entity.type !== 'PER') continue;

    const name = entity.canonicalName;
    const isDescriptor =
      name === name.toLowerCase() || // all lowercase = common noun
      ROLE_WORD_TO_RELATION.has(name.toLowerCase());

    const list = relTypeToEntities.get(rel.relationshipType) ?? [];
    list.push({ entityId: entity.id, isDescriptor });
    relTypeToEntities.set(rel.relationshipType, list);
  }

  for (const [_relType, entries] of relTypeToEntities) {
    const descriptors = entries.filter((e) => e.isDescriptor && store.getEntity(e.entityId));
    const properNames = entries.filter((e) => !e.isDescriptor && store.getEntity(e.entityId));

    // Only merge when there's exactly one proper-name target (unambiguous)
    if (properNames.length !== 1 || descriptors.length === 0) continue;

    for (const desc of descriptors) {
      if (!store.getEntity(desc.entityId)) continue; // already merged
      mergeEntities(store, desc.entityId, properNames[0].entityId);
      mergeCount++;
    }
  }

  return mergeCount;
}
