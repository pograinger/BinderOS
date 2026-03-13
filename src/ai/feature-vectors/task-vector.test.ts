/**
 * Tests for computeTaskVector.
 *
 * Verifies:
 * - Correct Float32Array dimensions (27)
 * - Deterministic output
 * - Cold-start zero-fill
 * - Specific dimension value logic (status one-hot, energy one-hot, age cap, etc.)
 *
 * Phase 35: CFVEC-02
 */

import { describe, it, expect } from 'vitest';
import { computeTaskVector } from './task-vector';
import { TASK_VECTOR_DIM, TASK_DIMENSION_NAMES } from './types';
import type { TaskAtom } from '../../types/atoms';
import type { AtomIntelligence, Entity, EntityRelation } from '../../types/intelligence';

// ---------------------------------------------------------------------------
// Test fixture builders
// ---------------------------------------------------------------------------

const NOW = Date.now();

function makeTaskAtom(overrides: Partial<TaskAtom> = {}): TaskAtom {
  return {
    id: 'atom-1',
    type: 'task',
    content: 'Buy groceries',
    title: 'Buy groceries',
    status: 'open',
    links: [],
    created_at: NOW - 10 * 86_400_000, // 10 days ago
    updated_at: NOW - 2 * 86_400_000, // 2 days ago
    tags: [],
    provenance: 0,
    smartLinks: [],
    ...overrides,
  };
}

function makeSidecar(overrides: Partial<AtomIntelligence> = {}): AtomIntelligence {
  return {
    atomId: 'atom-1',
    enrichment: [],
    entityMentions: [],
    cognitiveSignals: [],
    records: [],
    version: 1,
    deviceId: 'test-device',
    lastUpdated: NOW,
    schemaVersion: 9,
    ...overrides,
  };
}

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    id: 'entity-1',
    canonicalName: 'Alice',
    type: 'PER',
    aliases: ['Ali'],
    mentionCount: 5,
    firstSeen: NOW - 30 * 86_400_000,
    lastSeen: NOW - 1 * 86_400_000,
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
  const idx = TASK_DIMENSION_NAMES.indexOf(name);
  if (idx === -1) throw new Error(`Unknown dimension: ${name}`);
  return idx;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeTaskVector', () => {
  describe('dimensions and structure', () => {
    it('returns Float32Array of length 27', () => {
      const atom = makeTaskAtom();
      const result = computeTaskVector(atom, undefined, [], []);
      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(27);
      expect(result.length).toBe(TASK_VECTOR_DIM);
    });

    it('returns Float32Array with full sidecar and entities', () => {
      const atom = makeTaskAtom();
      const sidecar = makeSidecar();
      const entity = makeEntity();
      const relation = makeRelation();
      const result = computeTaskVector(atom, sidecar, [entity], [relation]);
      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(27);
    });
  });

  describe('cold-start (no sidecar, no entities)', () => {
    it('returns zero-filled vector with undefined sidecar', () => {
      const atom = makeTaskAtom({ energy: undefined, context: undefined });
      const result = computeTaskVector(atom, undefined, [], []);
      // enrichment_depth_norm, has_person_dep, entity_reliability should be 0
      expect(result[dim('enrichment_depth_norm')]).toBe(0.0);
      expect(result[dim('has_person_dep')]).toBe(0.0);
      expect(result[dim('entity_reliability')]).toBe(0.0);
      // prev_energy_fit defaults to 0.5 (neutral)
      expect(result[dim('prev_energy_fit')]).toBe(0.5);
    });
  });

  describe('determinism', () => {
    it('produces identical output for identical input', () => {
      const atom = makeTaskAtom({
        energy: 'Medium',
        context: '@home',
        dueDate: NOW + 5 * 86_400_000,
      });
      const sidecar = makeSidecar({
        enrichment: [
          {
            category: 'missing-outcome',
            question: 'What is the outcome?',
            answer: 'A clean house',
            depth: 1,
            timestamp: NOW,
            tier: 't1',
          },
        ],
      });
      const entity = makeEntity();
      const relation = makeRelation();

      const result1 = computeTaskVector(atom, sidecar, [entity], [relation]);
      const result2 = computeTaskVector(atom, sidecar, [entity], [relation]);

      expect(Array.from(result1)).toEqual(Array.from(result2));
    });
  });

  describe('age_norm', () => {
    it('clamps at 1.0 for atoms older than 365 days', () => {
      const atom = makeTaskAtom({ created_at: NOW - 400 * 86_400_000 });
      const result = computeTaskVector(atom, undefined, [], []);
      expect(result[dim('age_norm')]).toBe(1.0);
    });

    it('is less than 1.0 for recent atoms', () => {
      const atom = makeTaskAtom({ created_at: NOW - 10 * 86_400_000 });
      const result = computeTaskVector(atom, undefined, [], []);
      expect(result[dim('age_norm')]).toBeLessThan(1.0);
      expect(result[dim('age_norm')]).toBeGreaterThan(0.0);
    });
  });

  describe('status one-hot', () => {
    it('sets status_open=1.0 for open atom', () => {
      const atom = makeTaskAtom({ status: 'open' });
      const result = computeTaskVector(atom, undefined, [], []);
      expect(result[dim('status_open')]).toBe(1.0);
      expect(result[dim('status_done')]).toBe(0.0);
      expect(result[dim('status_dropped')]).toBe(0.0);
    });

    it('sets status_open=1.0 for in-progress atom', () => {
      const atom = makeTaskAtom({ status: 'in-progress' });
      const result = computeTaskVector(atom, undefined, [], []);
      expect(result[dim('status_open')]).toBe(1.0);
    });

    it('sets status_done=1.0 for done atom', () => {
      const atom = makeTaskAtom({ status: 'done' });
      const result = computeTaskVector(atom, undefined, [], []);
      expect(result[dim('status_open')]).toBe(0.0);
      expect(result[dim('status_done')]).toBe(1.0);
      expect(result[dim('status_dropped')]).toBe(0.0);
    });

    it('sets status_dropped=1.0 for cancelled atom', () => {
      const atom = makeTaskAtom({ status: 'cancelled' });
      const result = computeTaskVector(atom, undefined, [], []);
      expect(result[dim('status_open')]).toBe(0.0);
      expect(result[dim('status_done')]).toBe(0.0);
      expect(result[dim('status_dropped')]).toBe(1.0);
    });

    it('sets status_dropped=1.0 for archived atom', () => {
      const atom = makeTaskAtom({ status: 'archived' });
      const result = computeTaskVector(atom, undefined, [], []);
      expect(result[dim('status_dropped')]).toBe(1.0);
    });

    it('sets exactly one status slot to 1.0', () => {
      const statuses: Array<TaskAtom['status']> = ['open', 'in-progress', 'done', 'cancelled', 'archived', 'waiting'];
      for (const status of statuses) {
        const atom = makeTaskAtom({ status });
        const result = computeTaskVector(atom, undefined, [], []);
        const statusSlots = [dim('status_open'), dim('status_done'), dim('status_dropped')];
        const total = statusSlots.reduce((sum, idx) => sum + result[idx]!, 0);
        expect(total).toBe(1.0);
      }
    });
  });

  describe('energy one-hot', () => {
    it('maps Quick → energy_low=1.0', () => {
      const atom = makeTaskAtom({ energy: 'Quick' });
      const result = computeTaskVector(atom, undefined, [], []);
      expect(result[dim('energy_low')]).toBe(1.0);
      expect(result[dim('energy_medium')]).toBe(0.0);
      expect(result[dim('energy_high')]).toBe(0.0);
    });

    it('maps Medium → energy_medium=1.0', () => {
      const atom = makeTaskAtom({ energy: 'Medium' });
      const result = computeTaskVector(atom, undefined, [], []);
      expect(result[dim('energy_low')]).toBe(0.0);
      expect(result[dim('energy_medium')]).toBe(1.0);
      expect(result[dim('energy_high')]).toBe(0.0);
    });

    it('maps Deep → energy_high=1.0', () => {
      const atom = makeTaskAtom({ energy: 'Deep' });
      const result = computeTaskVector(atom, undefined, [], []);
      expect(result[dim('energy_low')]).toBe(0.0);
      expect(result[dim('energy_medium')]).toBe(0.0);
      expect(result[dim('energy_high')]).toBe(1.0);
    });

    it('leaves all energy slots 0.0 when energy is undefined', () => {
      const atom = makeTaskAtom({ energy: undefined });
      const result = computeTaskVector(atom, undefined, [], []);
      expect(result[dim('energy_low')]).toBe(0.0);
      expect(result[dim('energy_medium')]).toBe(0.0);
      expect(result[dim('energy_high')]).toBe(0.0);
    });
  });

  describe('entity_reliability', () => {
    it('reflects primary entity relation confidence', () => {
      const atom = makeTaskAtom();
      const sidecar = makeSidecar({
        entityMentions: [
          {
            entityText: 'Alice',
            entityType: 'PER',
            spanStart: 0,
            spanEnd: 5,
            confidence: 0.9,
            entityId: 'entity-1',
          },
        ],
      });
      const relation = makeRelation({ confidence: 0.85 });
      const result = computeTaskVector(atom, sidecar, [], [relation]);
      expect(result[dim('entity_reliability')]).toBeCloseTo(0.85);
    });

    it('returns 0.0 entity_reliability when no relations provided', () => {
      const atom = makeTaskAtom();
      const sidecar = makeSidecar();
      const result = computeTaskVector(atom, sidecar, [], []);
      expect(result[dim('entity_reliability')]).toBe(0.0);
    });
  });

  describe('entity responsiveness', () => {
    it('defaults to entity_resp_unknown=1.0', () => {
      const atom = makeTaskAtom();
      const result = computeTaskVector(atom, undefined, [], []);
      expect(result[dim('entity_resp_fast')]).toBe(0.0);
      expect(result[dim('entity_resp_slow')]).toBe(0.0);
      expect(result[dim('entity_resp_unknown')]).toBe(1.0);
    });
  });

  describe('deadline features', () => {
    it('sets has_deadline=1.0 when dueDate is set', () => {
      const atom = makeTaskAtom({ dueDate: NOW + 7 * 86_400_000 });
      const result = computeTaskVector(atom, undefined, [], []);
      expect(result[dim('has_deadline')]).toBe(1.0);
    });

    it('sets has_deadline=0.0 when no dueDate', () => {
      const atom = makeTaskAtom({ dueDate: undefined });
      const result = computeTaskVector(atom, undefined, [], []);
      expect(result[dim('has_deadline')]).toBe(0.0);
      expect(result[dim('time_pressure_score')]).toBe(0.0);
    });

    it('time_pressure_score is non-zero with imminent deadline', () => {
      const atom = makeTaskAtom({ dueDate: NOW + 1 * 86_400_000 }); // 1 day
      const result = computeTaskVector(atom, undefined, [], []);
      expect(result[dim('time_pressure_score')]).toBeGreaterThan(0.5);
    });
  });

  describe('enrichment_depth_norm', () => {
    it('returns 0.0 with no enrichment records', () => {
      const atom = makeTaskAtom();
      const result = computeTaskVector(atom, makeSidecar({ enrichment: [] }), [], []);
      expect(result[dim('enrichment_depth_norm')]).toBe(0.0);
    });

    it('caps at 1.0 for 5+ enrichment records', () => {
      const atom = makeTaskAtom();
      const sidecar = makeSidecar({
        enrichment: Array.from({ length: 10 }, (_, i) => ({
          category: 'cat',
          question: `Q${i}`,
          answer: `A${i}`,
          depth: 1,
          timestamp: NOW,
          tier: 't1',
        })),
      });
      const result = computeTaskVector(atom, sidecar, [], []);
      expect(result[dim('enrichment_depth_norm')]).toBe(1.0);
    });
  });
});
