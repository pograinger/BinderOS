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
  'wife', 'husband',
  'uncle', 'aunt',
  'grandma', 'grandmother', 'grandpa', 'grandfather',
]);

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

    const entityId = store.findOrCreateEntity(mention.entityText, mention.entityType, timestamp);
    if (!entityId) continue; // Rejected as non-entity word
    resolvedMentions.push({ ...mention, entityId });

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
