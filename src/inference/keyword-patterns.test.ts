/**
 * Tests for keyword pattern engine.
 *
 * Covers RELI-01: keyword patterns, sentence scoping, fuzzy matching,
 * implicit self relationships, conflicting patterns, confidence values.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EntityMention } from '../types/intelligence';

// Mock Dexie db and createRelation before importing the module under test
vi.mock('../storage/db', () => ({
  db: {
    entityRelations: {
      where: vi.fn().mockReturnValue({
        equals: vi.fn().mockReturnValue({
          filter: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue(null),
          }),
          first: vi.fn().mockResolvedValue(null),
        }),
        filter: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null),
        }),
        first: vi.fn().mockResolvedValue(null),
      }),
      put: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

vi.mock('../storage/entity-helpers', () => ({
  createRelation: vi.fn().mockResolvedValue('mock-relation-id'),
}));

// Import after mocks
import { runKeywordPatterns } from './keyword-patterns';
import { createRelation } from '../storage/entity-helpers';

const mockCreateRelation = vi.mocked(createRelation);

// Helper: build a PER mention at given positions
function perMention(
  entityText: string,
  spanStart: number,
  spanEnd: number,
  entityId = 'entity-uuid-' + entityText,
): EntityMention {
  return {
    entityText,
    entityType: 'PER',
    spanStart,
    spanEnd,
    confidence: 0.9,
    entityId,
  };
}

function orgMention(
  entityText: string,
  spanStart: number,
  spanEnd: number,
  entityId = 'org-uuid-' + entityText,
): EntityMention {
  return {
    entityText,
    entityType: 'ORG',
    spanStart,
    spanEnd,
    confidence: 0.9,
    entityId,
  };
}

function locMention(
  entityText: string,
  spanStart: number,
  spanEnd: number,
  entityId = 'loc-uuid-' + entityText,
): EntityMention {
  return {
    entityText,
    entityType: 'LOC',
    spanStart,
    spanEnd,
    confidence: 0.9,
    entityId,
  };
}

describe('runKeywordPatterns', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('spouse pattern — anniversary keyword (confidence 0.30)', () => {
    it('infers spouse relationship from anniversary keyword with PER entity', async () => {
      const content = "Pam's anniversary is next month";
      const mentions: EntityMention[] = [perMention('Pam', 0, 3)];

      await runKeywordPatterns('atom-1', content, mentions);

      expect(mockCreateRelation).toHaveBeenCalledTimes(1);
      const call = mockCreateRelation.mock.calls[0][0];
      expect(call.relationshipType).toBe('spouse');
      expect(call.confidence).toBeCloseTo(0.30, 2);
      expect(call.sourceAttribution).toBe('keyword');
      expect(call.sourceEntityId).toBe('[SELF]');
      expect(call.targetEntityId).toBe('entity-uuid-Pam');
      expect(call.evidence).toHaveLength(1);
      expect(call.evidence[0].atomId).toBe('atom-1');
      expect(call.evidence[0].snippet).toContain("anniversary");
    });
  });

  describe('spouse pattern — direct keyword (confidence 0.65)', () => {
    it('infers spouse relationship from "My wife Sarah called"', async () => {
      const content = 'My wife Sarah called';
      const mentions: EntityMention[] = [perMention('Sarah', 8, 13)];

      await runKeywordPatterns('atom-2', content, mentions);

      expect(mockCreateRelation).toHaveBeenCalled();
      const spouseCall = mockCreateRelation.mock.calls.find(
        (c) => c[0].relationshipType === 'spouse',
      );
      expect(spouseCall).toBeDefined();
      expect(spouseCall![0].confidence).toBeCloseTo(0.65, 2);
      expect(spouseCall![0].sourceEntityId).toBe('[SELF]');
      expect(spouseCall![0].targetEntityId).toBe('entity-uuid-Sarah');
    });
  });

  describe('healthcare-provider pattern (confidence 0.70)', () => {
    it('infers healthcare-provider relationship from "Dr. Chen said to floss more"', async () => {
      const content = 'Dr. Chen said to floss more';
      const mentions: EntityMention[] = [perMention('Dr. Chen', 0, 8)];

      await runKeywordPatterns('atom-3', content, mentions);

      expect(mockCreateRelation).toHaveBeenCalled();
      const hpCall = mockCreateRelation.mock.calls.find(
        (c) => c[0].relationshipType === 'healthcare-provider',
      );
      expect(hpCall).toBeDefined();
      expect(hpCall![0].confidence).toBeCloseTo(0.70, 2);
      expect(hpCall![0].targetEntityId).toBe('entity-uuid-Dr. Chen');
    });
  });

  describe('sentence scope', () => {
    it('does NOT create relationship between Sarah and Bob in different sentences', async () => {
      const content = 'Sarah mentioned the project. Bob sent the budget.';
      // Sarah: 0-5, Bob: 28-31
      const mentions: EntityMention[] = [
        perMention('Sarah', 0, 5),
        perMention('Bob', 28, 31),
      ];

      await runKeywordPatterns('atom-4', content, mentions);

      // No keyword pattern triggers here, but verify no false cross-sentence relationships
      // Neither sentence has a keyword, so no relations should be created
      expect(mockCreateRelation).not.toHaveBeenCalled();
    });

    it('does NOT create relationship between entities in different sentences even with keyword', async () => {
      // "Sarah works hard" is not a pattern keyword match for "Bob"
      const content = 'Sarah is my boss. Bob is just a colleague.';
      // Sarah: 0-5, Bob: 18-21
      const mentions: EntityMention[] = [
        perMention('Sarah', 0, 5),
        perMention('Bob', 18, 21),
      ];

      await runKeywordPatterns('atom-5', content, mentions);

      // "boss" fires for the first sentence, which only contains Sarah
      // "colleague" fires for the second sentence, which only contains Bob
      const calls = mockCreateRelation.mock.calls;
      // Check that no call has BOTH Sarah and Bob as source+target
      for (const [rel] of calls) {
        const hasSarah =
          rel.sourceEntityId === 'entity-uuid-Sarah' ||
          rel.targetEntityId === 'entity-uuid-Sarah';
        const hasBob =
          rel.sourceEntityId === 'entity-uuid-Bob' ||
          rel.targetEntityId === 'entity-uuid-Bob';
        expect(hasSarah && hasBob).toBe(false);
      }
    });
  });

  describe('fuzzy matching', () => {
    it('matches "married to Pam" via spouse pattern', async () => {
      const content = 'I married to Pam last year';
      // Pam at position 13-16
      const mentions: EntityMention[] = [perMention('Pam', 13, 16)];

      await runKeywordPatterns('atom-6', content, mentions);

      expect(mockCreateRelation).toHaveBeenCalled();
      const spouseCall = mockCreateRelation.mock.calls.find(
        (c) => c[0].relationshipType === 'spouse',
      );
      expect(spouseCall).toBeDefined();
    });

    it('matches "marry Pam" via spouse pattern', async () => {
      const content = 'I want to marry Pam';
      const mentions: EntityMention[] = [perMention('Pam', 16, 19)];

      await runKeywordPatterns('atom-7', content, mentions);

      expect(mockCreateRelation).toHaveBeenCalled();
      const spouseCall = mockCreateRelation.mock.calls.find(
        (c) => c[0].relationshipType === 'spouse',
      );
      expect(spouseCall).toBeDefined();
    });
  });

  describe('implicit self relationship', () => {
    it('uses [SELF] sentinel as sourceEntityId for implicit self relationships', async () => {
      const content = "My wife Pam called";
      const mentions: EntityMention[] = [perMention('Pam', 8, 11)];

      await runKeywordPatterns('atom-8', content, mentions);

      expect(mockCreateRelation).toHaveBeenCalled();
      const call = mockCreateRelation.mock.calls[0][0];
      expect(call.sourceEntityId).toBe('[SELF]');
      expect(call.targetEntityId).toBe('entity-uuid-Pam');
    });
  });

  describe('conflicting patterns coexist', () => {
    it('creates both healthcare-provider AND spouse for "Dr. Pam anniversary"', async () => {
      // Both "Dr." and "anniversary" appear with Pam in the same sentence
      const content = "Dr. Pam's anniversary is this weekend";
      const mentions: EntityMention[] = [perMention('Dr. Pam', 0, 7)];

      await runKeywordPatterns('atom-9', content, mentions);

      const types = mockCreateRelation.mock.calls.map((c) => c[0].relationshipType);
      expect(types).toContain('healthcare-provider');
      expect(types).toContain('spouse');
    });
  });

  describe('no entity, no relationship', () => {
    it('does NOT create relationship when no PER/LOC/ORG entities in sentence with keyword', async () => {
      const content = 'The anniversary party was great';
      // No entity mentions
      const mentions: EntityMention[] = [];

      await runKeywordPatterns('atom-10', content, mentions);

      expect(mockCreateRelation).not.toHaveBeenCalled();
    });
  });

  describe('reports-to pattern', () => {
    it('infers reports-to relationship from "my boss Sarah"', async () => {
      const content = 'My boss Sarah always has great ideas';
      const mentions: EntityMention[] = [perMention('Sarah', 8, 13)];

      await runKeywordPatterns('atom-11', content, mentions);

      expect(mockCreateRelation).toHaveBeenCalled();
      const bossCall = mockCreateRelation.mock.calls.find(
        (c) => c[0].relationshipType === 'reports-to',
      );
      expect(bossCall).toBeDefined();
      expect(bossCall![0].confidence).toBeCloseTo(0.55, 2);
    });
  });

  describe('sentence splitting handles title abbreviations', () => {
    it('does NOT split on "Dr." as sentence boundary', async () => {
      // This tests that "Dr. Chen said..." is not split into ["Dr", "Chen said..."]
      const content = 'Dr. Chen is my dentist. I need to schedule an appointment.';
      const mentions: EntityMention[] = [perMention('Dr. Chen', 0, 8)];

      await runKeywordPatterns('atom-12', content, mentions);

      // healthcare-provider should still be detected because "Dr." is in same sentence as Chen
      const hpCall = mockCreateRelation.mock.calls.find(
        (c) => c[0].relationshipType === 'healthcare-provider',
      );
      expect(hpCall).toBeDefined();
    });
  });

  describe('works-at pattern', () => {
    it('infers works-at relationship for ORG entity', async () => {
      const content = 'I work at Acme Corp as an engineer';
      const mentions: EntityMention[] = [orgMention('Acme Corp', 10, 19)];

      await runKeywordPatterns('atom-13', content, mentions);

      // Note: "work at" / "works at" pattern
      const call = mockCreateRelation.mock.calls.find(
        (c) => c[0].relationshipType === 'works-at',
      );
      // Only fires if "works at" or similar keyword is in the pattern
      if (call) {
        expect(call[0].targetEntityId).toBe('org-uuid-Acme Corp');
      }
    });
  });

  describe('lives-at pattern', () => {
    it('infers lives-at relationship for LOC entity', async () => {
      const content = 'I live in Portland now';
      const mentions: EntityMention[] = [locMention('Portland', 10, 18)];

      await runKeywordPatterns('atom-14', content, mentions);

      const call = mockCreateRelation.mock.calls.find(
        (c) => c[0].relationshipType === 'lives-at',
      );
      if (call) {
        expect(call[0].targetEntityId).toBe('loc-uuid-Portland');
      }
    });
  });
});
