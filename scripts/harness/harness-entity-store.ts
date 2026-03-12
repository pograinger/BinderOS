/**
 * In-memory entity store for headless harness execution.
 *
 * Replaces Dexie for offline, deterministic harness runs. Provides
 * the same entity/relation CRUD surface as entity-helpers.ts but
 * backed by plain Maps instead of IndexedDB.
 *
 * Phase 28: HARN-01, HARN-02
 */

import type { Entity, EntityRelation, AtomIntelligence } from '../../src/types/intelligence.js';
import { getMatcherForType } from '../../src/entity/entity-matcher.js';

export const MERGE_CANDIDATE_THRESHOLD = 0.7;

/**
 * Common English words that get capitalized at sentence start and are NOT entity names.
 * Used as a safety net in findOrCreateEntity to prevent registry pollution.
 */
const NON_ENTITY_WORDS = new Set([
  'not', 'though', 'should', 'probably', 'maybe', 'just', 'also', 'still',
  'already', 'really', 'actually', 'might', 'would', 'could', 'been', 'have',
  'about', 'after', 'before', 'between', 'during', 'each', 'every', 'from',
  'into', 'most', 'only', 'other', 'over', 'same', 'some', 'such', 'than',
  'then', 'these', 'those', 'through', 'under', 'very', 'when', 'where',
  'while', 'with', 'the', 'this', 'that', 'there', 'yeah', 'depends',
  'whoever', 'however', 'since', 'because', 'although', 'unless', 'until',
  'whether', 'anyway', 'besides', 'certainly', 'definitely', 'eventually',
  'finally', 'generally', 'honestly', 'ideally', 'lately', 'likely', 'mainly',
  'mostly', 'obviously', 'perhaps', 'personally', 'specifically', 'unfortunately',
  'usually', 'basically', 'call', 'check', 'get', 'got', 'let', 'make', 'need',
  'put', 'set', 'try', 'want', 'going', 'think', 'know', 'like', 'look', 'take',
  'come', 'give', 'tell', 'ask', 'use', 'find', 'keep', 'bring', 'send', 'talk',
  'pick', 'plan', 'work', 'done', 'sure', 'well', 'okay', 'son', 'but', 'she',
  'her', 'his', 'him', 'they', 'them', 'our', 'your', 'its', 'who', 'what',
  // Professional/role words that corpus generators sometimes capitalize as entities
  'doc', 'nurse', 'doctor', 'dentist', 'therapist', 'surgeon', 'specialist',
  'boss', 'manager', 'supervisor', 'coach', 'trainer', 'mentor', 'tutor',
  'neighbor', 'neighbour', 'landlord', 'landlady', 'accountant', 'lawyer',
  'attorney', 'babysitter', 'nanny', 'sitter', 'buddy', 'pal', 'bestie',
  'coworker', 'teammate', 'partner',
]);

// ---------------------------------------------------------------------------
// HarnessEntityStore
// ---------------------------------------------------------------------------

export class HarnessEntityStore {
  readonly entities = new Map<string, Entity>();
  readonly entityRelations = new Map<string, EntityRelation>();
  readonly atomIntelligence = new Map<string, AtomIntelligence>();

  // -------------------------------------------------------------------------
  // Entity CRUD
  // -------------------------------------------------------------------------

  createEntity(entity: Omit<Entity, 'id'>): string {
    const id = crypto.randomUUID();
    const record: Entity = { ...entity, id };
    this.entities.set(id, record);
    return id;
  }

  getEntity(id: string): Entity | undefined {
    return this.entities.get(id);
  }

  getEntities(): Entity[] {
    return Array.from(this.entities.values());
  }

  getEntitiesByType(type: 'PER' | 'LOC' | 'ORG'): Entity[] {
    return this.getEntities().filter((e) => e.type === type);
  }

  updateEntity(id: string, patch: Partial<Entity>): void {
    const existing = this.entities.get(id);
    if (existing) {
      this.entities.set(id, { ...existing, ...patch });
    }
  }

  // -------------------------------------------------------------------------
  // findOrCreateEntity — mirrors entity-helpers.ts logic
  // -------------------------------------------------------------------------

  findOrCreateEntity(text: string, type: 'PER' | 'LOC' | 'ORG', syntheticTimestamp?: number): string {
    // Reject obvious non-entity words (sentence-starting common words)
    const singleWord = text.trim().split(/\s+/).length === 1;
    if (singleWord && NON_ENTITY_WORDS.has(text.toLowerCase())) {
      return ''; // Signal: not an entity — callers should check for empty string
    }

    const matcher = getMatcherForType(type);
    const allOfType = this.getEntitiesByType(type);

    let bestScore = 0;
    let bestEntity: Entity | null = null;

    for (const entity of allOfType) {
      const score = matcher.matchScore(text, entity);
      if (score > bestScore) {
        bestScore = score;
        bestEntity = entity;
      }
    }

    if (bestScore >= MERGE_CANDIDATE_THRESHOLD && bestEntity) {
      const now = syntheticTimestamp ?? Date.now();
      const normalizedText = matcher.normalize(text);
      const existingAliases = bestEntity.aliases.map((a) => matcher.normalize(a));
      const canonicalNorm = matcher.normalize(bestEntity.canonicalName);

      const isNewAlias =
        normalizedText !== canonicalNorm && !existingAliases.includes(normalizedText);

      this.updateEntity(bestEntity.id, {
        mentionCount: bestEntity.mentionCount + 1,
        lastSeen: now,
        updatedAt: now,
        version: bestEntity.version + 1,
        ...(isNewAlias ? { aliases: [...bestEntity.aliases, text] } : {}),
      });

      return bestEntity.id;
    }

    // No match: create new entity
    const now = syntheticTimestamp ?? Date.now();
    return this.createEntity({
      canonicalName: text,
      type,
      aliases: [],
      mentionCount: 1,
      firstSeen: now,
      lastSeen: now,
      version: 1,
      deviceId: '',
      updatedAt: now,
    });
  }

  // -------------------------------------------------------------------------
  // Relation CRUD
  // -------------------------------------------------------------------------

  createRelation(relation: Omit<EntityRelation, 'id'>): string {
    const id = crypto.randomUUID();
    const record: EntityRelation = { ...relation, id };
    this.entityRelations.set(id, record);
    return id;
  }

  getRelation(id: string): EntityRelation | undefined {
    return this.entityRelations.get(id);
  }

  getRelations(): EntityRelation[] {
    return Array.from(this.entityRelations.values());
  }

  updateRelation(id: string, patch: Partial<EntityRelation>): void {
    const existing = this.entityRelations.get(id);
    if (existing) {
      this.entityRelations.set(id, { ...existing, ...patch });
    }
  }

  /**
   * Find a relation by (sourceEntityId, targetEntityId, relationshipType).
   * Checks both (a,b) and (b,a) ordering for symmetry.
   */
  findRelation(
    sourceEntityId: string,
    targetEntityId: string,
    relationshipType: string,
    attribution?: string,
  ): EntityRelation | undefined {
    for (const relation of this.entityRelations.values()) {
      const matchesType = relation.relationshipType === relationshipType;
      const matchesAttrib = attribution ? relation.sourceAttribution === attribution : true;
      const matchesPair =
        (relation.sourceEntityId === sourceEntityId &&
          relation.targetEntityId === targetEntityId) ||
        (relation.sourceEntityId === targetEntityId &&
          relation.targetEntityId === sourceEntityId);

      if (matchesType && matchesAttrib && matchesPair) {
        return relation;
      }
    }
    return undefined;
  }

  // -------------------------------------------------------------------------
  // AtomIntelligence CRUD
  // -------------------------------------------------------------------------

  putAtomIntelligence(record: AtomIntelligence): void {
    this.atomIntelligence.set(record.atomId, record);
  }

  getAtomIntelligence(atomId: string): AtomIntelligence | undefined {
    return this.atomIntelligence.get(atomId);
  }

  // -------------------------------------------------------------------------
  // Utilities
  // -------------------------------------------------------------------------

  reset(): void {
    this.entities.clear();
    this.entityRelations.clear();
    this.atomIntelligence.clear();
  }

  // -------------------------------------------------------------------------
  // Snapshot / Restore — for adversarial cycle checkpointing
  // -------------------------------------------------------------------------

  snapshot(): {
    entities: Entity[];
    relations: EntityRelation[];
    atomIntelligence: AtomIntelligence[];
  } {
    return {
      entities: Array.from(this.entities.values()),
      relations: Array.from(this.entityRelations.values()),
      atomIntelligence: Array.from(this.atomIntelligence.values()),
    };
  }

  restore(snap: {
    entities: Entity[];
    relations: EntityRelation[];
    atomIntelligence: AtomIntelligence[];
  }): void {
    this.entities.clear();
    this.entityRelations.clear();
    this.atomIntelligence.clear();

    for (const entity of snap.entities) {
      this.entities.set(entity.id, entity);
    }
    for (const relation of snap.relations) {
      this.entityRelations.set(relation.id, relation);
    }
    for (const intel of snap.atomIntelligence) {
      this.atomIntelligence.set(intel.atomId, intel);
    }
  }
}
