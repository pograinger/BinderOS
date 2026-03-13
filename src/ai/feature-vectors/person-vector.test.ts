/**
 * Tests for computePersonVector.
 *
 * Verifies:
 * - Correct Float32Array dimensions (23)
 * - Relationship type one-hot mapping
 * - rel_unknown=1.0 when no relations
 * - mention_count_norm cap
 * - has_user_correction flag
 *
 * Phase 35: CFVEC-03
 */

import { describe, it, expect } from 'vitest';
import { computePersonVector } from './person-vector';
import { PERSON_VECTOR_DIM, PERSON_DIMENSION_NAMES } from './types';
import type { Entity, EntityRelation } from '../../types/intelligence';

// ---------------------------------------------------------------------------
// Test fixture builders
// ---------------------------------------------------------------------------

const NOW = Date.now();

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'entity-1',
    canonicalName: 'Alice',
    type: 'PER',
    aliases: ['Ali', 'Al'],
    mentionCount: 10,
    firstSeen: NOW - 60 * 86_400_000,
    lastSeen: NOW - 3 * 86_400_000,
    version: 1,
    deviceId: 'test-device',
    updatedAt: NOW,
    ...overrides,
  };
}

function makeRelation(overrides: Partial<EntityRelation> = {}): EntityRelation {
  return {
    id: 'rel-1',
    sourceEntityId: 'entity-1',
    targetEntityId: 'entity-user',
    relationshipType: 'colleague',
    confidence: 0.75,
    sourceAttribution: 'keyword',
    evidence: [],
    version: 1,
    deviceId: 'test-device',
    updatedAt: NOW,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helper to get dimension index by name
// ---------------------------------------------------------------------------

function dim(name: string): number {
  const idx = PERSON_DIMENSION_NAMES.indexOf(name);
  if (idx === -1) throw new Error(`Unknown dimension: ${name}`);
  return idx;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computePersonVector', () => {
  describe('dimensions and structure', () => {
    it('returns Float32Array of length 23 with entity+relations', () => {
      const entity = makeEntity();
      const relation = makeRelation();
      const result = computePersonVector(entity, [relation]);
      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(23);
      expect(result.length).toBe(PERSON_VECTOR_DIM);
    });
  });

  describe('no relations — cold-start', () => {
    it('sets rel_unknown=1.0 when no relations provided', () => {
      const entity = makeEntity();
      const result = computePersonVector(entity, []);
      expect(result[dim('rel_unknown')]).toBe(1.0);
    });

    it('all relationship slots are 0 except rel_unknown', () => {
      const entity = makeEntity();
      const result = computePersonVector(entity, []);
      const relSlots = [
        'rel_spouse', 'rel_parent', 'rel_child', 'rel_colleague',
        'rel_reports_to', 'rel_healthcare', 'rel_friend', 'rel_org_member',
      ];
      for (const slot of relSlots) {
        expect(result[dim(slot)]).toBe(0.0);
      }
    });
  });

  describe('relationship type one-hot', () => {
    const relTypeMapping: Array<[string, string]> = [
      ['spouse', 'rel_spouse'],
      ['parent', 'rel_parent'],
      ['child', 'rel_child'],
      ['colleague', 'rel_colleague'],
      ['reports-to', 'rel_reports_to'],
      ['healthcare-provider', 'rel_healthcare'],
      ['friend', 'rel_friend'],
      ['org-member', 'rel_org_member'],
    ];

    it.each(relTypeMapping)(
      'maps %s → %s=1.0 (all others 0)',
      (relType, dimName) => {
        const entity = makeEntity();
        const relation = makeRelation({ relationshipType: relType });
        const result = computePersonVector(entity, [relation]);
        expect(result[dim(dimName)]).toBe(1.0);
        expect(result[dim('rel_unknown')]).toBe(0.0);
      }
    );

    it('picks highest-confidence relation for one-hot when multiple relations exist', () => {
      const entity = makeEntity();
      const relations = [
        makeRelation({ relationshipType: 'colleague', confidence: 0.5 }),
        makeRelation({ id: 'rel-2', relationshipType: 'friend', confidence: 0.9 }),
      ];
      const result = computePersonVector(entity, relations);
      expect(result[dim('rel_friend')]).toBe(1.0);
      expect(result[dim('rel_colleague')]).toBe(0.0);
    });
  });

  describe('mention_count_norm', () => {
    it('caps at 1.0 for high mention counts (>=50)', () => {
      const entity = makeEntity({ mentionCount: 100 });
      const result = computePersonVector(entity, []);
      expect(result[dim('mention_count_norm')]).toBe(1.0);
    });

    it('returns 0.0 for zero mentions', () => {
      const entity = makeEntity({ mentionCount: 0 });
      const result = computePersonVector(entity, []);
      expect(result[dim('mention_count_norm')]).toBe(0.0);
    });

    it('returns 0.5 for 25 mentions', () => {
      const entity = makeEntity({ mentionCount: 25 });
      const result = computePersonVector(entity, []);
      expect(result[dim('mention_count_norm')]).toBeCloseTo(0.5);
    });
  });

  describe('has_user_correction', () => {
    it('returns 1.0 when any relation has user-correction attribution', () => {
      const entity = makeEntity();
      const relations = [
        makeRelation({ sourceAttribution: 'keyword' }),
        makeRelation({ id: 'rel-2', sourceAttribution: 'user-correction' }),
      ];
      const result = computePersonVector(entity, relations);
      expect(result[dim('has_user_correction')]).toBe(1.0);
    });

    it('returns 0.0 when no user-correction attribution', () => {
      const entity = makeEntity();
      const relation = makeRelation({ sourceAttribution: 'keyword' });
      const result = computePersonVector(entity, [relation]);
      expect(result[dim('has_user_correction')]).toBe(0.0);
    });
  });

  describe('confidence_norm', () => {
    it('returns max confidence across all relations', () => {
      const entity = makeEntity();
      const relations = [
        makeRelation({ confidence: 0.6 }),
        makeRelation({ id: 'rel-2', confidence: 0.95 }),
      ];
      const result = computePersonVector(entity, relations);
      expect(result[dim('confidence_norm')]).toBeCloseTo(0.95);
    });

    it('returns 0.0 when no relations', () => {
      const entity = makeEntity();
      const result = computePersonVector(entity, []);
      expect(result[dim('confidence_norm')]).toBe(0.0);
    });
  });

  describe('collaboration frequency one-hot', () => {
    it('sets collab_low=1.0 for mentionCount < 5', () => {
      const entity = makeEntity({ mentionCount: 3 });
      const result = computePersonVector(entity, []);
      expect(result[dim('collab_low')]).toBe(1.0);
      expect(result[dim('collab_medium')]).toBe(0.0);
      expect(result[dim('collab_high')]).toBe(0.0);
    });

    it('sets collab_medium=1.0 for mentionCount 5-20', () => {
      const entity = makeEntity({ mentionCount: 10 });
      const result = computePersonVector(entity, []);
      expect(result[dim('collab_medium')]).toBe(1.0);
    });

    it('sets collab_high=1.0 for mentionCount > 20', () => {
      const entity = makeEntity({ mentionCount: 25 });
      const result = computePersonVector(entity, []);
      expect(result[dim('collab_high')]).toBe(1.0);
    });
  });

  describe('responsiveness', () => {
    it('defaults to resp_unknown=1.0 (no data yet)', () => {
      const entity = makeEntity();
      const result = computePersonVector(entity, []);
      expect(result[dim('resp_unknown')]).toBe(1.0);
      expect(result[dim('resp_fast')]).toBe(0.0);
      expect(result[dim('resp_normal')]).toBe(0.0);
      expect(result[dim('resp_slow')]).toBe(0.0);
    });
  });

  describe('alias_count_norm', () => {
    it('caps at 1.0 for 5+ aliases', () => {
      const entity = makeEntity({ aliases: ['A', 'B', 'C', 'D', 'E', 'F'] });
      const result = computePersonVector(entity, []);
      expect(result[dim('alias_count_norm')]).toBe(1.0);
    });

    it('returns 0.0 for no aliases', () => {
      const entity = makeEntity({ aliases: [] });
      const result = computePersonVector(entity, []);
      expect(result[dim('alias_count_norm')]).toBe(0.0);
    });
  });
});
