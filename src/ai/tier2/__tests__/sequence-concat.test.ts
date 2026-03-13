/**
 * Unit tests for sequence context concatenation helper and TieredFeatures extension.
 *
 * Tests:
 * - 384-dim MiniLM + 128-dim sequence context = 512-dim Float32Array at correct positions
 * - Zero-pad fallback: undefined sequenceContext → 128 zeros appended
 * - Dimension validation: resulting array is exactly 512 elements
 * - TieredFeatures.sequenceContext field is typed as optional Float32Array
 *
 * Phase 33 Plan 01: SEQ-01, SEQ-03
 */

import { describe, it, expect } from 'vitest';
import { concatSequenceContext, zeroPadSequenceContext } from '../sequence-context-concat';
import type { TieredFeatures } from '../types';

describe('sequence context concatenation', () => {
  it('concatenates 384-dim MiniLM with 128-dim sequence context to produce 512-dim Float32Array', () => {
    const miniLM = new Float32Array(384).fill(0.5);
    const seqCtx = new Float32Array(128).fill(0.25);
    const result = concatSequenceContext(miniLM, seqCtx);

    expect(result).toHaveLength(512);
    expect(result instanceof Float32Array).toBe(true);
    // First 384 elements should be MiniLM values
    expect(result[0]).toBeCloseTo(0.5);
    expect(result[383]).toBeCloseTo(0.5);
    // Last 128 elements should be sequence context values
    expect(result[384]).toBeCloseTo(0.25);
    expect(result[511]).toBeCloseTo(0.25);
  });

  it('preserves exact values at boundary positions', () => {
    const miniLM = new Float32Array(384);
    miniLM[0] = 0.1;
    miniLM[383] = 0.9;
    const seqCtx = new Float32Array(128);
    seqCtx[0] = 0.2;
    seqCtx[127] = 0.8;

    const result = concatSequenceContext(miniLM, seqCtx);
    expect(result[0]).toBeCloseTo(0.1);
    expect(result[383]).toBeCloseTo(0.9);
    expect(result[384]).toBeCloseTo(0.2);
    expect(result[511]).toBeCloseTo(0.8);
  });

  it('zero-pad: returns 512-dim array with zeros in positions 384-511 when sequenceContext is undefined', () => {
    const miniLM = new Float32Array(384).fill(0.7);
    const result = zeroPadSequenceContext(miniLM);

    expect(result).toHaveLength(512);
    expect(result instanceof Float32Array).toBe(true);
    // MiniLM portion preserved
    expect(result[0]).toBeCloseTo(0.7);
    expect(result[383]).toBeCloseTo(0.7);
    // Sequence context portion is zeros
    expect(result[384]).toBe(0);
    expect(result[511]).toBe(0);
  });

  it('resulting array is exactly 512 elements', () => {
    const miniLM = new Float32Array(384).fill(0);
    const seqCtx = new Float32Array(128).fill(0);
    const result = concatSequenceContext(miniLM, seqCtx);
    expect(result.length).toBe(512);
  });
});

describe('TieredFeatures.sequenceContext type', () => {
  it('allows TieredFeatures without sequenceContext (optional field)', () => {
    const features: TieredFeatures = { content: 'test' };
    expect(features.sequenceContext).toBeUndefined();
  });

  it('allows TieredFeatures with Float32Array sequenceContext', () => {
    const features: TieredFeatures = {
      content: 'test',
      sequenceContext: new Float32Array(128).fill(0),
    };
    expect(features.sequenceContext).toHaveLength(128);
    expect(features.sequenceContext instanceof Float32Array).toBe(true);
  });
});
