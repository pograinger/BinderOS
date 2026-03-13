/**
 * Tests for computeCalendarVector.
 *
 * Verifies:
 * - Correct Float32Array dimensions (34)
 * - Temporal zero-fill when no eventDate
 * - entity_is_high_priority for spouse/reports-to/parent/child relations
 * - Energy one-hot mapping
 * - Entity type flags (has_person_entity, has_org_entity, has_loc_entity)
 *
 * Phase 35: CFVEC-04
 */

import { describe, it, expect } from 'vitest';
import { computeCalendarVector } from './calendar-vector';
import { CALENDAR_VECTOR_DIM, CALENDAR_DIMENSION_NAMES } from './types';
import type { EventAtom } from '../../types/atoms';
import type { AtomIntelligence, Entity, EntityRelation } from '../../types/intelligence';

// ---------------------------------------------------------------------------
// Test fixture builders
// ---------------------------------------------------------------------------

const NOW = Date.now();
// Fixed event date: 5 days in future for consistent temporal tests
const FUTURE_EVENT = NOW + 5 * 86_400_000;

function makeEventAtom(overrides: Partial<EventAtom> = {}): EventAtom {
  return {
    id: 'event-1',
    type: 'event',
    content: 'Team meeting',
    title: 'Team meeting',
    status: 'open',
    links: [],
    created_at: NOW - 2 * 86_400_000,
    updated_at: NOW - 1 * 86_400_000,
    tags: [],
    provenance: 0,
    smartLinks: [],
    eventDate: FUTURE_EVENT,
    ...overrides,
  };
}

function makeSidecar(overrides: Partial<AtomIntelligence> = {}): AtomIntelligence {
  return {
    atomId: 'event-1',
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
    canonicalName: 'Bob',
    type: 'PER',
    aliases: [],
    mentionCount: 3,
    firstSeen: NOW - 20 * 86_400_000,
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
    confidence: 0.7,
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
  const idx = CALENDAR_DIMENSION_NAMES.indexOf(name);
  if (idx === -1) throw new Error(`Unknown dimension: ${name}`);
  return idx;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeCalendarVector', () => {
  describe('dimensions and structure', () => {
    it('returns Float32Array of length 34 with full data', () => {
      const atom = makeEventAtom();
      const sidecar = makeSidecar();
      const entity = makeEntity();
      const relation = makeRelation();
      const result = computeCalendarVector(atom, sidecar, [entity], [relation]);
      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(34);
      expect(result.length).toBe(CALENDAR_VECTOR_DIM);
    });
  });

  describe('no eventDate — temporal zero-fill', () => {
    it('returns zero-filled temporal dimensions when no eventDate', () => {
      const atom = makeEventAtom({ eventDate: undefined });
      const result = computeCalendarVector(atom, undefined, [], []);
      expect(result[dim('start_tod_norm')]).toBe(0.0);
      expect(result[dim('dow_mon')]).toBe(0.0);
      expect(result[dim('dow_tue')]).toBe(0.0);
      expect(result[dim('dow_wed')]).toBe(0.0);
      expect(result[dim('dow_thu')]).toBe(0.0);
      expect(result[dim('dow_fri')]).toBe(0.0);
      expect(result[dim('dow_sat')]).toBe(0.0);
      expect(result[dim('dow_sun')]).toBe(0.0);
      expect(result[dim('has_deadline')]).toBe(0.0);
      expect(result[dim('days_to_event_norm')]).toBe(0.0);
      expect(result[dim('time_pressure_score')]).toBe(0.0);
    });
  });

  describe('entity_is_high_priority', () => {
    const highPriorityTypes = ['spouse', 'reports-to', 'parent', 'child'];

    it.each(highPriorityTypes)(
      'sets entity_is_high_priority=1.0 for %s relation',
      (relType) => {
        const atom = makeEventAtom();
        const sidecar = makeSidecar({
          entityMentions: [
            {
              entityText: 'Bob',
              entityType: 'PER',
              spanStart: 0,
              spanEnd: 3,
              confidence: 0.9,
              entityId: 'entity-1',
            },
          ],
        });
        const relation = makeRelation({ relationshipType: relType });
        const result = computeCalendarVector(atom, sidecar, [], [relation]);
        expect(result[dim('entity_is_high_priority')]).toBe(1.0);
      }
    );

    it('sets entity_is_high_priority=0.0 for non-priority relation (colleague)', () => {
      const atom = makeEventAtom();
      const sidecar = makeSidecar({
        entityMentions: [
          {
            entityText: 'Bob',
            entityType: 'PER',
            spanStart: 0,
            spanEnd: 3,
            confidence: 0.9,
            entityId: 'entity-1',
          },
        ],
      });
      const relation = makeRelation({ relationshipType: 'colleague' });
      const result = computeCalendarVector(atom, sidecar, [], [relation]);
      expect(result[dim('entity_is_high_priority')]).toBe(0.0);
    });

    it('sets entity_is_high_priority=0.0 when no entity mentions', () => {
      const atom = makeEventAtom();
      const sidecar = makeSidecar({ entityMentions: [] });
      const relation = makeRelation({ relationshipType: 'spouse' });
      const result = computeCalendarVector(atom, sidecar, [], [relation]);
      expect(result[dim('entity_is_high_priority')]).toBe(0.0);
    });
  });

  describe('energy one-hot', () => {
    it('maps Quick → energy_low=1.0', () => {
      const atom = makeEventAtom({ energy: 'Quick' });
      const result = computeCalendarVector(atom, undefined, [], []);
      expect(result[dim('energy_low')]).toBe(1.0);
      expect(result[dim('energy_medium')]).toBe(0.0);
      expect(result[dim('energy_high')]).toBe(0.0);
    });

    it('maps Medium → energy_medium=1.0', () => {
      const atom = makeEventAtom({ energy: 'Medium' });
      const result = computeCalendarVector(atom, undefined, [], []);
      expect(result[dim('energy_medium')]).toBe(1.0);
    });

    it('maps Deep → energy_high=1.0', () => {
      const atom = makeEventAtom({ energy: 'Deep' });
      const result = computeCalendarVector(atom, undefined, [], []);
      expect(result[dim('energy_high')]).toBe(1.0);
    });
  });

  describe('entity type flags', () => {
    it('sets has_person_entity=1.0 when PER mention in sidecar', () => {
      const atom = makeEventAtom();
      const sidecar = makeSidecar({
        entityMentions: [
          { entityText: 'Bob', entityType: 'PER', spanStart: 0, spanEnd: 3, confidence: 0.8 },
        ],
      });
      const result = computeCalendarVector(atom, sidecar, [], []);
      expect(result[dim('has_person_entity')]).toBe(1.0);
    });

    it('sets has_org_entity=1.0 when ORG mention in sidecar', () => {
      const atom = makeEventAtom();
      const sidecar = makeSidecar({
        entityMentions: [
          { entityText: 'Acme Corp', entityType: 'ORG', spanStart: 0, spanEnd: 9, confidence: 0.7 },
        ],
      });
      const result = computeCalendarVector(atom, sidecar, [], []);
      expect(result[dim('has_org_entity')]).toBe(1.0);
    });

    it('sets has_loc_entity=1.0 when LOC mention in sidecar', () => {
      const atom = makeEventAtom();
      const sidecar = makeSidecar({
        entityMentions: [
          { entityText: 'New York', entityType: 'LOC', spanStart: 0, spanEnd: 8, confidence: 0.85 },
        ],
      });
      const result = computeCalendarVector(atom, sidecar, [], []);
      expect(result[dim('has_loc_entity')]).toBe(1.0);
    });

    it('all entity flags are 0.0 when sidecar has no mentions', () => {
      const atom = makeEventAtom();
      const sidecar = makeSidecar({ entityMentions: [] });
      const result = computeCalendarVector(atom, sidecar, [], []);
      expect(result[dim('has_person_entity')]).toBe(0.0);
      expect(result[dim('has_org_entity')]).toBe(0.0);
      expect(result[dim('has_loc_entity')]).toBe(0.0);
    });

    it('all entity flags are 0.0 when undefined sidecar', () => {
      const atom = makeEventAtom();
      const result = computeCalendarVector(atom, undefined, [], []);
      expect(result[dim('has_person_entity')]).toBe(0.0);
      expect(result[dim('has_org_entity')]).toBe(0.0);
      expect(result[dim('has_loc_entity')]).toBe(0.0);
    });
  });

  describe('defaults for placeholder dimensions', () => {
    it('sets slack_before_none=1.0 as default', () => {
      const atom = makeEventAtom();
      const result = computeCalendarVector(atom, undefined, [], []);
      expect(result[dim('slack_before_none')]).toBe(1.0);
      expect(result[dim('slack_before_short')]).toBe(0.0);
    });

    it('sets prep_none=1.0 as default', () => {
      const atom = makeEventAtom();
      const result = computeCalendarVector(atom, undefined, [], []);
      expect(result[dim('prep_none')]).toBe(1.0);
      expect(result[dim('prep_short')]).toBe(0.0);
    });

    it('overrun_risk is 0.0 (Phase 38 placeholder)', () => {
      const atom = makeEventAtom();
      const result = computeCalendarVector(atom, undefined, [], []);
      expect(result[dim('overrun_risk')]).toBe(0.0);
    });

    it('is_recurring is 0.0 (no recurrence field)', () => {
      const atom = makeEventAtom();
      const result = computeCalendarVector(atom, undefined, [], []);
      expect(result[dim('is_recurring')]).toBe(0.0);
    });
  });
});
