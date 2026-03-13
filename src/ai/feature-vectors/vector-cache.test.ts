/**
 * Tests for vector-cache module.
 *
 * Verifies:
 * - shouldRecomputeVector returns true/false based on staleness
 * - dirtyCheckTaskFields detects vector-feeding field changes, ignores cosmetic changes
 * - writeCanonicalVector persists CanonicalVector to atomIntelligence sidecar
 * - writeCanonicalVector is non-fatal on Dexie failure
 *
 * Phase 35: CFVEC-04
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CanonicalVector } from './types';
import type { TaskAtom } from '../../types/atoms';

// ---------------------------------------------------------------------------
// Mock Dexie / atom-intelligence module
// ---------------------------------------------------------------------------

const mockGetOrCreate = vi.fn();
const mockDbPut = vi.fn();

vi.mock('../../storage/atom-intelligence', () => ({
  getOrCreateIntelligence: mockGetOrCreate,
}));

// ---------------------------------------------------------------------------
// Import module under test AFTER mocks are set up
// ---------------------------------------------------------------------------

const { shouldRecomputeVector, dirtyCheckTaskFields, writeCanonicalVector } = await import('./vector-cache');

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const NOW = 1_000_000_000_000; // fixed timestamp for determinism

function makeCachedVector(overrides: Partial<CanonicalVector> = {}): CanonicalVector {
  return {
    vectorType: 'task',
    data: [0.1, 0.2, 0.3],
    lastComputed: NOW - 10_000, // computed 10 seconds ago
    schemaVersion: 1,
    ...overrides,
  };
}

function makeTaskAtom(overrides: Partial<TaskAtom> = {}): TaskAtom {
  return {
    id: 'atom-1',
    type: 'task',
    content: 'Buy groceries',
    title: 'Buy groceries',
    status: 'open',
    links: [],
    created_at: NOW - 86_400_000,
    updated_at: NOW - 5_000, // updated 5 seconds ago (after lastComputed)
    tags: [],
    provenance: 0,
    smartLinks: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// shouldRecomputeVector
// ---------------------------------------------------------------------------

describe('shouldRecomputeVector', () => {
  it('returns true when no cached vector exists (undefined)', () => {
    const atom = makeTaskAtom();
    expect(shouldRecomputeVector(atom, undefined)).toBe(true);
  });

  it('returns true when atom.updated_at > cached.lastComputed', () => {
    const atom = makeTaskAtom({ updated_at: NOW - 5_000 });
    const cached = makeCachedVector({ lastComputed: NOW - 10_000 }); // older than atom update
    expect(shouldRecomputeVector(atom, cached)).toBe(true);
  });

  it('returns false when atom.updated_at <= cached.lastComputed (vector is fresh)', () => {
    const atom = makeTaskAtom({ updated_at: NOW - 20_000 }); // atom updated 20s ago
    const cached = makeCachedVector({ lastComputed: NOW - 10_000 }); // cached more recently
    expect(shouldRecomputeVector(atom, cached)).toBe(false);
  });

  it('returns false when atom.updated_at equals cached.lastComputed', () => {
    const atom = makeTaskAtom({ updated_at: NOW - 10_000 });
    const cached = makeCachedVector({ lastComputed: NOW - 10_000 });
    expect(shouldRecomputeVector(atom, cached)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// dirtyCheckTaskFields
// ---------------------------------------------------------------------------

// Fixed dueDate epoch values (Unix ms)
const DUE_APRIL = NOW + 19 * 86_400_000;  // ~19 days from NOW
const DUE_MAY   = NOW + 49 * 86_400_000;  // ~49 days from NOW

describe('dirtyCheckTaskFields', () => {
  const base = makeTaskAtom({
    status: 'open',
    energy: 'Quick',
    context: '@home',
    dueDate: DUE_APRIL,
    links: [],
  });

  it('returns true when status changes', () => {
    expect(dirtyCheckTaskFields({ status: 'open' }, { ...base, status: 'in-progress' })).toBe(true);
  });

  it('returns true when energy changes', () => {
    expect(dirtyCheckTaskFields({ energy: 'Quick' }, { ...base, energy: 'Deep' })).toBe(true);
  });

  it('returns true when context changes', () => {
    expect(dirtyCheckTaskFields({ context: '@home' }, { ...base, context: '@office' })).toBe(true);
  });

  it('returns true when dueDate changes', () => {
    expect(dirtyCheckTaskFields({ dueDate: DUE_APRIL }, { ...base, dueDate: DUE_MAY })).toBe(true);
  });

  it('returns true when links count changes', () => {
    const withLink = {
      ...base,
      links: [{ targetId: '00000000-0000-0000-0000-000000000001', relationshipType: 'relates-to', direction: 'forward' as const }],
    };
    expect(dirtyCheckTaskFields({ links: [] }, withLink)).toBe(true);
  });

  it('returns false when only title changes (cosmetic)', () => {
    // prev must include all vector-feeding fields so only title differs
    expect(
      dirtyCheckTaskFields(
        { title: 'Old Title', status: 'open', energy: 'Quick', context: '@home', dueDate: DUE_APRIL, links: [] },
        { ...base, title: 'New Title' },
      ),
    ).toBe(false);
  });

  it('returns false when only content changes (cosmetic)', () => {
    // prev must include all vector-feeding fields so only content differs
    expect(
      dirtyCheckTaskFields(
        { content: 'Old content', status: 'open', energy: 'Quick', context: '@home', dueDate: DUE_APRIL, links: [] },
        { ...base, content: 'New content' },
      ),
    ).toBe(false);
  });

  it('returns false when no vector-feeding fields differ', () => {
    expect(
      dirtyCheckTaskFields(
        { status: 'open', energy: 'Quick', context: '@home', dueDate: DUE_APRIL },
        base,
      ),
    ).toBe(false);
  });

  it('returns true when dueDate changes from undefined to defined', () => {
    expect(dirtyCheckTaskFields({ dueDate: undefined }, { ...base, dueDate: DUE_APRIL })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// writeCanonicalVector
// ---------------------------------------------------------------------------

describe('writeCanonicalVector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrCreate.mockResolvedValue({
      atomId: 'atom-1',
      enrichment: [],
      entityMentions: [],
      cognitiveSignals: [],
      records: [],
      version: 1,
      deviceId: '',
      lastUpdated: 1000,
      schemaVersion: 1,
    });
    mockDbPut.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls getOrCreateIntelligence with the given atomId', async () => {
    const vector = new Float32Array([0.1, 0.2, 0.3]);
    writeCanonicalVector('atom-1', 'task', vector);

    // Wait for fire-and-forget microtask
    await new Promise((r) => setTimeout(r, 10));

    expect(mockGetOrCreate).toHaveBeenCalledWith('atom-1');
  });

  it('persists canonicalVector with correct shape (Float32Array → number[])', async () => {
    const vector = new Float32Array([1.0, 0.5, 0.25]);

    // Import db to spy on put — cast to bypass strict Dexie overload signature
    const { db } = await import('../../storage/db');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const origPut = (db.atomIntelligence as any).put;
    const putCapture = vi.fn().mockResolvedValue('atom-1');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.atomIntelligence as any).put = putCapture;

    try {
      writeCanonicalVector('atom-2', 'task', vector);
      await new Promise((r) => setTimeout(r, 10));

      expect(putCapture).toHaveBeenCalled();
      const writtenSidecar = putCapture.mock.calls[0]?.[0] as Record<string, unknown>;
      const cv = writtenSidecar?.['canonicalVector'] as CanonicalVector | undefined;
      expect(cv).toBeDefined();
      expect(cv?.vectorType).toBe('task');
      expect(cv?.data).toEqual([1.0, 0.5, 0.25]);
      expect(cv?.schemaVersion).toBe(1);
      expect(typeof cv?.lastComputed).toBe('number');
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.atomIntelligence as any).put = origPut;
    }
  });

  it('logs console.warn on failure, does not throw', async () => {
    mockGetOrCreate.mockRejectedValue(new Error('Dexie exploded'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Should not throw
    expect(() => {
      writeCanonicalVector('atom-fail', 'calendar', new Float32Array([0.1]));
    }).not.toThrow();

    // Wait for async failure to propagate
    await new Promise((r) => setTimeout(r, 20));

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[vector-cache]'),
      expect.anything(),
    );

    warnSpy.mockRestore();
  });

  it('converts Float32Array to plain number[] (not TypedArray)', async () => {
    const { db } = await import('../../storage/db');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const origPut = (db.atomIntelligence as any).put;
    const putCapture = vi.fn().mockResolvedValue('atom-1');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.atomIntelligence as any).put = putCapture;

    try {
      const vector = new Float32Array([0.5, 0.75, 1.0]);
      writeCanonicalVector('atom-3', 'calendar', vector);
      await new Promise((r) => setTimeout(r, 10));

      const writtenSidecar = putCapture.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
      const cv = writtenSidecar?.['canonicalVector'] as CanonicalVector | undefined;
      // data must be a plain Array, not Float32Array
      expect(Array.isArray(cv?.data)).toBe(true);
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (db.atomIntelligence as any).put = origPut;
    }
  });
});
