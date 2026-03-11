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
// Pipeline
// ---------------------------------------------------------------------------

/**
 * Process one corpus item through the headless pipeline.
 *
 * Steps:
 * 1. Simulate triage acceptance
 * 2. Resolve pre-annotated entity mentions to registry IDs
 * 3. Write mentions to atomIntelligence sidecar
 * 4. Run keyword pattern inference
 * 5. Update co-occurrence map
 */
export async function runHarnessAtom(
  item: CorpusItem,
  store: HarnessEntityStore,
): Promise<void> {
  const atomId = item.id;
  const content = item.content;

  // Step 1: Triage acceptance — harness always accepts all items

  // Step 2: Resolve entity mentions to registry IDs
  const resolvedMentions: EntityMention[] = [];

  for (const mention of item.entityMentions) {
    // Only PER/LOC/ORG go through entity registry
    if (mention.entityType !== 'PER' && mention.entityType !== 'LOC' && mention.entityType !== 'ORG') {
      resolvedMentions.push({ ...mention });
      continue;
    }

    const entityId = store.findOrCreateEntity(mention.entityText, mention.entityType);
    resolvedMentions.push({ ...mention, entityId });
  }

  // Step 3: Write atomIntelligence sidecar
  const now = Date.now();
  const intel: AtomIntelligence = {
    atomId,
    enrichment: [],
    entityMentions: resolvedMentions,
    cognitiveSignals: [],
    records: [],
    version: 1,
    deviceId: '',
    lastUpdated: now,
    schemaVersion: 1,
  };
  store.putAtomIntelligence(intel);

  // Step 4: Run keyword patterns for registry mentions
  const registryMentions = resolvedMentions.filter((m) => m.entityId);
  if (registryMentions.length > 0) {
    await runHarnessKeywordPatterns(store, atomId, content, registryMentions);
  }

  // Step 5: Update co-occurrence map
  updateHarnessCooccurrence(content, registryMentions);
}
