/**
 * Unit tests for the ring buffer logic in embedding-worker.ts.
 *
 * Tests the pure ring buffer functions extracted for testing:
 * - updateRingBuffer: adds embedding, caps at windowSize, evicts oldest
 * - getRingBuffer: returns current buffer contents
 * - Cold-start: getRingBuffer returns empty array when buffer is empty
 * - LOAD_RING_BUFFER: populates buffer from provided embeddings array
 *
 * Phase 33 Plan 01: SEQ-01
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { updateRingBuffer, getRingBuffer, setRingBuffer, clearRingBuffers } from '../ring-buffer';

describe('ring buffer', () => {
  beforeEach(() => {
    clearRingBuffers();
  });

  it('stores a single embedding in the buffer', () => {
    const embedding = new Array(384).fill(0.1);
    updateRingBuffer('binder-1', embedding, 5);
    const buf = getRingBuffer('binder-1');
    expect(buf).toHaveLength(1);
    expect(buf[0]).toEqual(embedding);
  });

  it('appends multiple embeddings', () => {
    const e1 = new Array(384).fill(0.1);
    const e2 = new Array(384).fill(0.2);
    updateRingBuffer('binder-1', e1, 5);
    updateRingBuffer('binder-1', e2, 5);
    const buf = getRingBuffer('binder-1');
    expect(buf).toHaveLength(2);
    expect(buf[0]).toEqual(e1);
    expect(buf[1]).toEqual(e2);
  });

  it('evicts oldest embedding when buffer exceeds windowSize', () => {
    // Fill buffer to capacity (5) then add a 6th
    for (let i = 0; i < 5; i++) {
      updateRingBuffer('binder-1', new Array(384).fill(i * 0.1), 5);
    }
    // Add 6th — should evict first (all 0.0)
    const newest = new Array(384).fill(0.99);
    updateRingBuffer('binder-1', newest, 5);

    const buf = getRingBuffer('binder-1');
    expect(buf).toHaveLength(5);
    // First element should now be the second insertion (0.1), not the first (0.0)
    expect(buf[0]![0]).toBeCloseTo(0.1);
    // Last element should be the newest
    expect(buf[4]).toEqual(newest);
  });

  it('caps buffer exactly at windowSize', () => {
    for (let i = 0; i < 10; i++) {
      updateRingBuffer('binder-1', new Array(384).fill(i * 0.1), 3);
    }
    const buf = getRingBuffer('binder-1');
    expect(buf).toHaveLength(3);
  });

  it('returns empty array for unknown binderId (cold-start)', () => {
    const buf = getRingBuffer('nonexistent-binder');
    expect(buf).toEqual([]);
  });

  it('maintains separate buffers per binderId', () => {
    updateRingBuffer('binder-A', new Array(384).fill(0.1), 5);
    updateRingBuffer('binder-B', new Array(384).fill(0.9), 5);

    expect(getRingBuffer('binder-A')).toHaveLength(1);
    expect(getRingBuffer('binder-B')).toHaveLength(1);
    expect(getRingBuffer('binder-A')[0]![0]).toBeCloseTo(0.1);
    expect(getRingBuffer('binder-B')[0]![0]).toBeCloseTo(0.9);
  });

  it('setRingBuffer (LOAD_RING_BUFFER) populates buffer from provided embeddings array', () => {
    const embeddings = [
      new Array(384).fill(0.1),
      new Array(384).fill(0.2),
      new Array(384).fill(0.3),
    ];
    setRingBuffer('binder-1', embeddings);
    const buf = getRingBuffer('binder-1');
    expect(buf).toHaveLength(3);
    expect(buf[0]).toEqual(embeddings[0]);
    expect(buf[2]).toEqual(embeddings[2]);
  });

  it('setRingBuffer overwrites any existing buffer', () => {
    updateRingBuffer('binder-1', new Array(384).fill(0.5), 5);
    const newEmbeddings = [new Array(384).fill(0.99)];
    setRingBuffer('binder-1', newEmbeddings);
    const buf = getRingBuffer('binder-1');
    expect(buf).toHaveLength(1);
    expect(buf[0]![0]).toBeCloseTo(0.99);
  });
});
