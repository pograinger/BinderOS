/**
 * Tests for suggestContextFromEntities — entity relationship to GTD context tag mapping.
 *
 * Phase 29: ENTC-03
 */

import { describe, it, expect } from 'vitest';
import { suggestContextFromEntities } from './entity-context-suggestions';
import type { EntityContextCandidate } from './entity-context-suggestions';
import type { BinderTypeConfig } from '../config/binder-types/index';

// Minimal mock config for tests
const mockConfig: BinderTypeConfig = {
  name: 'GTD Personal',
  purpose: 'GTD personal binder',
  categoryOrdering: [],
  supportedAtomTypes: [],
  questionTemplates: {},
  backgroundCloudEnrichment: false,
  entityContextMappings: {
    'healthcare-provider': '@health',
    'spouse': '@home',
    'colleague': '@work',
    'reports-to': '@work',
    'friend': '@personal',
    'accountant': '@finance',
  },
};

const configWithoutMappings: BinderTypeConfig = {
  name: 'GTD Personal',
  purpose: 'GTD personal binder',
  categoryOrdering: [],
  supportedAtomTypes: [],
  questionTemplates: {},
  backgroundCloudEnrichment: false,
  // no entityContextMappings
};

function makeRelation(relationshipType: string, confidence: number): EntityContextCandidate['relation'] {
  return {
    id: 'rel-' + relationshipType,
    sourceEntityId: '[SELF]',
    targetEntityId: 'entity-1',
    relationshipType,
    confidence,
    sourceAttribution: 'keyword',
    evidence: [],
    version: 1,
    deviceId: '',
    updatedAt: Date.now(),
  };
}

describe('suggestContextFromEntities', () => {
  it('returns null for empty candidates array', () => {
    const result = suggestContextFromEntities([], mockConfig);
    expect(result).toBeNull();
  });

  it('returns null when config has no entityContextMappings', () => {
    const candidate: EntityContextCandidate = {
      entityText: 'Dr. Chen',
      relation: makeRelation('healthcare-provider', 0.9),
    };
    const result = suggestContextFromEntities([candidate], configWithoutMappings);
    expect(result).toBeNull();
  });

  it('maps healthcare-provider relation to @health', () => {
    const candidate: EntityContextCandidate = {
      entityText: 'Dr. Chen',
      relation: makeRelation('healthcare-provider', 0.85),
    };
    const result = suggestContextFromEntities([candidate], mockConfig);
    expect(result).toBe('@health');
  });

  it('maps spouse relation to @home', () => {
    const candidate: EntityContextCandidate = {
      entityText: 'Pam',
      relation: makeRelation('spouse', 0.95),
    };
    const result = suggestContextFromEntities([candidate], mockConfig);
    expect(result).toBe('@home');
  });

  it('maps colleague relation to @work', () => {
    const candidate: EntityContextCandidate = {
      entityText: 'Bob',
      relation: makeRelation('colleague', 0.7),
    };
    const result = suggestContextFromEntities([candidate], mockConfig);
    expect(result).toBe('@work');
  });

  it('returns null for entity with no mapping (acquaintance)', () => {
    const candidate: EntityContextCandidate = {
      entityText: 'Someone',
      relation: makeRelation('acquaintance', 0.8),
    };
    const result = suggestContextFromEntities([candidate], mockConfig);
    expect(result).toBeNull();
  });

  it('returns context for highest-confidence relation that has a mapping', () => {
    const candidates: EntityContextCandidate[] = [
      {
        entityText: 'Someone',
        relation: makeRelation('acquaintance', 0.95), // high confidence but no mapping
      },
      {
        entityText: 'Dr. Chen',
        relation: makeRelation('healthcare-provider', 0.75), // lower confidence but has mapping
      },
    ];
    // Should return @health (not null), picking the one with a mapping
    const result = suggestContextFromEntities(candidates, mockConfig);
    expect(result).toBe('@health');
  });

  it('returns highest-confidence mapped context when multiple have mappings', () => {
    const candidates: EntityContextCandidate[] = [
      {
        entityText: 'Dr. Chen',
        relation: makeRelation('healthcare-provider', 0.75),
      },
      {
        entityText: 'Pam',
        relation: makeRelation('spouse', 0.95), // higher confidence
      },
    ];
    // Should return @home (spouse has higher confidence)
    const result = suggestContextFromEntities(candidates, mockConfig);
    expect(result).toBe('@home');
  });

  it('returns null when all candidates have no mapping', () => {
    const candidates: EntityContextCandidate[] = [
      {
        entityText: 'Someone',
        relation: makeRelation('acquaintance', 0.9),
      },
      {
        entityText: 'Another',
        relation: makeRelation('unknown-type', 0.8),
      },
    ];
    const result = suggestContextFromEntities(candidates, mockConfig);
    expect(result).toBeNull();
  });
});
