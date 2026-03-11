/**
 * Integration tests for the relationship inference orchestrator.
 *
 * Tests that inferRelationshipsForAtom correctly wires keyword patterns
 * and co-occurrence tracking, handles edge cases, and is error-resilient.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EntityMention } from '../types/intelligence';

// Mock dependencies before importing the module under test
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
      }),
      put: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

vi.mock('../storage/entity-helpers', () => ({
  createRelation: vi.fn().mockResolvedValue('mock-relation-id'),
}));

// Mock cooccurrence-tracker so we can spy on it
vi.mock('./cooccurrence-tracker', async (importOriginal) => {
  const original = await importOriginal<typeof import('./cooccurrence-tracker')>();
  return {
    ...original,
    updateCooccurrence: vi.fn(),
    maybeFlushCooccurrence: vi.fn().mockResolvedValue(undefined),
    registerCooccurrenceFlushHandlers: vi.fn(),
  };
});

import { inferRelationshipsForAtom } from './relationship-inference';
import { createRelation } from '../storage/entity-helpers';
import { updateCooccurrence, maybeFlushCooccurrence } from './cooccurrence-tracker';

const mockCreateRelation = vi.mocked(createRelation);
const mockUpdateCooccurrence = vi.mocked(updateCooccurrence);
const mockMaybeFlush = vi.mocked(maybeFlushCooccurrence);

function perMention(
  entityText: string,
  spanStart: number,
  spanEnd: number,
  entityId: string,
): EntityMention {
  return { entityText, entityType: 'PER', spanStart, spanEnd, confidence: 0.9, entityId };
}

describe('inferRelationshipsForAtom', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('keyword relation creation', () => {
    it('creates keyword relation when sentence contains entity + keyword', async () => {
      const content = 'My wife Sarah called this morning.';
      const mentions: EntityMention[] = [perMention('Sarah', 8, 13, 'uuid-sarah')];

      await inferRelationshipsForAtom({ atomId: 'atom-1', content, entityMentions: mentions });

      expect(mockCreateRelation).toHaveBeenCalled();
      const call = mockCreateRelation.mock.calls[0][0];
      expect(call.relationshipType).toBe('spouse');
    });
  });

  describe('co-occurrence tracking', () => {
    it('calls updateCooccurrence for entity mentions', async () => {
      const content = 'Sarah and Bob are working on the project.';
      const mentions: EntityMention[] = [
        perMention('Sarah', 0, 5, 'uuid-sarah'),
        perMention('Bob', 10, 13, 'uuid-bob'),
      ];

      await inferRelationshipsForAtom({ atomId: 'atom-2', content, entityMentions: mentions });

      expect(mockUpdateCooccurrence).toHaveBeenCalledWith(content, mentions);
    });

    it('calls maybeFlushCooccurrence after tracking', async () => {
      const content = 'Sarah is working on the project.';
      const mentions: EntityMention[] = [perMention('Sarah', 0, 5, 'uuid-sarah')];

      await inferRelationshipsForAtom({ atomId: 'atom-3', content, entityMentions: mentions });

      expect(mockMaybeFlush).toHaveBeenCalled();
    });
  });

  describe('early return for empty mentions', () => {
    it('returns immediately when no registry mentions (no entityId)', async () => {
      const content = 'Some text with no entities.';
      const mentions: EntityMention[] = [
        {
          entityText: 'unknown',
          entityType: 'PER',
          spanStart: 0,
          spanEnd: 7,
          confidence: 0.5,
          entityId: undefined, // No registry ID
        },
      ];

      await inferRelationshipsForAtom({ atomId: 'atom-4', content, entityMentions: mentions });

      expect(mockCreateRelation).not.toHaveBeenCalled();
      expect(mockUpdateCooccurrence).not.toHaveBeenCalled();
    });

    it('returns immediately when entityMentions is empty', async () => {
      await inferRelationshipsForAtom({
        atomId: 'atom-5',
        content: 'No entities here.',
        entityMentions: [],
      });

      expect(mockCreateRelation).not.toHaveBeenCalled();
      expect(mockUpdateCooccurrence).not.toHaveBeenCalled();
    });
  });

  describe('error resilience', () => {
    it('does not throw when keyword patterns fail', async () => {
      // Force createRelation to throw
      mockCreateRelation.mockRejectedValueOnce(new Error('DB error'));

      const content = 'My wife Sarah called.';
      const mentions: EntityMention[] = [perMention('Sarah', 8, 13, 'uuid-sarah')];

      // Should not throw — fire-and-forget pattern
      await expect(
        inferRelationshipsForAtom({ atomId: 'atom-6', content, entityMentions: mentions }),
      ).resolves.toBeUndefined();
    });

    it('does not throw when co-occurrence update fails', async () => {
      mockUpdateCooccurrence.mockImplementationOnce(() => {
        throw new Error('co-occurrence error');
      });

      const content = 'Sarah and Bob are working.';
      const mentions: EntityMention[] = [
        perMention('Sarah', 0, 5, 'uuid-sarah'),
        perMention('Bob', 10, 13, 'uuid-bob'),
      ];

      await expect(
        inferRelationshipsForAtom({ atomId: 'atom-7', content, entityMentions: mentions }),
      ).resolves.toBeUndefined();
    });
  });
});
