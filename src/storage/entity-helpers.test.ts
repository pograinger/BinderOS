/**
 * Wave 0 test stubs for entity-helpers Phase 29 additions.
 *
 * These stubs define the expected behavior contracts for correctRelationship
 * and getEntityTimeline. Full Dexie mocking will be filled in during TDD
 * validation passes.
 *
 * Phase 29: ENTC-02, ENTC-05
 */

import { describe, it } from 'vitest';

// NOTE: These are Wave 0 stubs — behavior contracts only.
// Full integration tests require Dexie mock setup (fake-indexeddb).

describe('correctRelationship', () => {
  it('saves correction as confidence 1.0 user-correction', () => {
    // STUB: correctRelationship(entityId, 'spouse', atomId) should write to
    // entityRelations table with:
    //   sourceAttribution = 'user-correction'
    //   confidence = 1.0
    //   targetEntityId = entityId
    //   evidence[0].atomId = atomId
    // Verified in harness integration tests (Phase 29).
  });

  it('overwrites existing inferred relation for same entity+type', () => {
    // STUB: When an inferred relation (keyword/co-occurrence) exists for the
    // same entityId + relationshipType pair, correctRelationship should delete
    // it before creating the user-correction.
    // Ensures user corrections always take precedence over inference.
  });
});

describe('getEntityTimeline', () => {
  it('returns atomIds mentioning entity in chronological order', () => {
    // STUB: getEntityTimeline(entityId) returns atomIds sorted by atom
    // createdAt descending (most recent first).
    // Verified by harness integration tests seeding multiple atoms with
    // entity mentions at known timestamps.
  });

  it('returns empty array for entity with no mentions', () => {
    // STUB: When no atomIntelligence sidecar contains entityId in
    // entityMentions, getEntityTimeline returns [].
  });
});
