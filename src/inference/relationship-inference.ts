/**
 * Relationship inference orchestrator.
 *
 * Ties keyword pattern matching and co-occurrence tracking into a single
 * fire-and-forget function called after entity detection completes for an atom.
 *
 * Execution flow:
 * 1. Filter for entity mentions with registry IDs (skip unresolved entities)
 * 2. Ensure PWA flush handlers are registered (once per session)
 * 3. Run keyword pattern matching (sentence-scoped, creates typed relations)
 * 4. Update co-occurrence map for entity pairs in the same sentence
 * 5. Flush co-occurrence if threshold exceeded
 *
 * All errors are caught and logged — this function NEVER throws.
 * Same fire-and-forget pattern as detectEntitiesForAtom.
 *
 * Pure module: no store imports.
 *
 * Phase 28: RELI-01, RELI-02, RELI-03
 */

import type { EntityMention } from '../types/intelligence';
import { runKeywordPatterns } from './keyword-patterns';
import {
  updateCooccurrence,
  maybeFlushCooccurrence,
  registerCooccurrenceFlushHandlers,
} from './cooccurrence-tracker';

// ---------------------------------------------------------------------------
// PWA flush handler registration (once per session)
// ---------------------------------------------------------------------------

let flushRegistered = false;

function ensureFlushRegistered(): void {
  if (flushRegistered) return;
  flushRegistered = true;

  // Detect device class: mobile if touch points > 0
  const deviceClass =
    typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0 ? 'mobile' : 'desktop';

  registerCooccurrenceFlushHandlers(deviceClass);
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/**
 * Infer relationships for entity mentions in an atom.
 *
 * Called after detectEntitiesForAtom writes mentions to the sidecar.
 * Accepts entity mentions directly (caller has them in memory already —
 * no need to re-read from sidecar).
 *
 * Fire-and-forget: catches all errors, never throws.
 */
export async function inferRelationshipsForAtom(params: {
  atomId: string;
  content: string;
  entityMentions: EntityMention[];
}): Promise<void> {
  try {
    const { atomId, content, entityMentions } = params;

    // Skip if no entity mentions have been resolved to registry IDs
    const registryMentions = entityMentions.filter((m) => m.entityId);
    if (registryMentions.length === 0) return;

    // Ensure PWA flush handlers are registered (idempotent)
    ensureFlushRegistered();

    // 1. Run keyword pattern matching (sentence-scoped, creates typed relations)
    await runKeywordPatterns(atomId, content, registryMentions);

    // 2. Update co-occurrence map for entity pairs in the same sentence
    updateCooccurrence(content, registryMentions);

    // 3. Flush co-occurrence if threshold exceeded
    await maybeFlushCooccurrence();
  } catch (err) {
    // Inference NEVER blocks atom operations
    console.warn('[relationship-inference] Inference failed for atom', params.atomId, err);
  }
}
