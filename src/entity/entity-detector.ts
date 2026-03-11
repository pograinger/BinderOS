/**
 * Entity detection orchestrator.
 *
 * Pure module -- no store imports. Orchestrates:
 * NER call -> confidence filter -> registry lookup -> sidecar write.
 *
 * Entity detection failures NEVER block atom operations.
 *
 * Phase 27: ENTD-01, ENTD-02, ENTD-03, ENTR-03
 */

import { detectEntitiesForKnowledgeGraph } from '../ai/sanitization/sanitizer';
import { findOrCreateEntity, decrementEntityMentionCount } from '../storage/entity-helpers';
import { getIntelligence, writeEntityMentions } from '../storage/atom-intelligence';
import type { EntityMention } from '../types/intelligence';
import { inferRelationshipsForAtom } from '../inference/relationship-inference';

/** Entity types that get full registry treatment */
const REGISTRY_TYPES = new Set(['PER', 'LOC', 'ORG']);

/** Valid entity mention types */
const VALID_TYPES = new Set(['PER', 'LOC', 'ORG', 'MISC', 'DATE']);

/**
 * Detect entities in atom content and persist to sidecar + registry.
 *
 * On re-scan (atom edit), old mention counts are decremented first to
 * avoid mention count drift (Pitfall 3).
 *
 * This function is designed to be called fire-and-forget (non-blocking).
 * All errors are caught and logged -- never thrown.
 */
export async function detectEntitiesForAtom(
  atomId: string,
  content: string,
): Promise<void> {
  try {
    // On re-scan: decrement old entity mention counts first
    const existingIntel = await getIntelligence(atomId);
    if (existingIntel && existingIntel.entityMentions.length > 0) {
      for (const oldMention of existingIntel.entityMentions) {
        if (oldMention.entityId) {
          await decrementEntityMentionCount(oldMention.entityId);
        }
      }
    }

    // Get raw NER entities + DATE regex results
    const rawEntities = await detectEntitiesForKnowledgeGraph(content);

    // Build structured EntityMention array
    const mentions: EntityMention[] = [];

    for (const raw of rawEntities) {
      if (!VALID_TYPES.has(raw.type)) continue;

      const entityType = raw.type as EntityMention['entityType'];
      let entityId: string | undefined;

      // PER/LOC/ORG get registry treatment
      if (REGISTRY_TYPES.has(raw.type)) {
        entityId = await findOrCreateEntity(
          raw.text,
          raw.type as 'PER' | 'LOC' | 'ORG',
        );
      }

      mentions.push({
        entityText: raw.text,
        entityType,
        spanStart: raw.start,
        spanEnd: raw.end,
        confidence: raw.confidence,
        entityId,
      });
    }

    // Write mentions to sidecar (full replace)
    await writeEntityMentions(atomId, mentions);

    // Phase 28: Infer relationships between detected entities
    // Fire-and-forget: errors are caught inside inferRelationshipsForAtom
    await inferRelationshipsForAtom({ atomId, content, entityMentions: mentions });
  } catch (err) {
    // Entity detection must NEVER block atom operations
    console.warn('[entity-detector] Detection failed for atom', atomId, err);
  }
}
