/**
 * Tests for quality gate composite scoring.
 *
 * Phase 24: ENRICH-10
 */

import { describe, it, expect } from 'vitest';
import { computeQuality, isAboveMinimum, MIN_QUALITY_THRESHOLD } from './quality-gate';
import { MODEL_IDS } from './provenance';

describe('computeQuality', () => {
  it('returns lowest quality with no provenance, no maturity, no user content', () => {
    const result = computeQuality({ provenance: 0, maturityScore: 0, hasUserContent: false });
    expect(result.score).toBe(0);
    expect(result.level).toBe('insufficient');
  });

  it('returns highest quality with cloud provenance + full maturity + user content', () => {
    const result = computeQuality({
      provenance: MODEL_IDS.CLOUD_LLM,
      maturityScore: 1.0,
      hasUserContent: true,
    });
    // cloud=0.4 + maturity=0.4 + user=0.2 = 1.0
    expect(result.score).toBe(1.0);
    expect(result.level).toBe('high');
  });

  it('returns moderate quality with ONNX-only provenance + partial maturity', () => {
    const result = computeQuality({
      provenance: MODEL_IDS.TYPE_ONNX,
      maturityScore: 0.6,
      hasUserContent: false,
    });
    // onnx=0.2 + maturity=0.24 + user=0.0 = 0.44
    expect(result.score).toBeCloseTo(0.44);
    expect(result.level).toBe('low');
  });

  it('WASM LLM scores higher than ONNX-only but lower than cloud', () => {
    const onnxResult = computeQuality({
      provenance: MODEL_IDS.TYPE_ONNX,
      maturityScore: 0.5,
      hasUserContent: false,
    });
    const wasmResult = computeQuality({
      provenance: MODEL_IDS.WASM_LLM,
      maturityScore: 0.5,
      hasUserContent: false,
    });
    const cloudResult = computeQuality({
      provenance: MODEL_IDS.CLOUD_LLM,
      maturityScore: 0.5,
      hasUserContent: false,
    });

    expect(wasmResult.score).toBeGreaterThan(onnxResult.score);
    expect(cloudResult.score).toBeGreaterThan(wasmResult.score);
  });

  it('user-provided freeform content boosts quality by 0.2', () => {
    const without = computeQuality({
      provenance: MODEL_IDS.TYPE_ONNX,
      maturityScore: 0.5,
      hasUserContent: false,
    });
    const withUser = computeQuality({
      provenance: MODEL_IDS.TYPE_ONNX,
      maturityScore: 0.5,
      hasUserContent: true,
    });
    expect(withUser.score - without.score).toBeCloseTo(0.2);
  });

  it('quality levels at boundaries', () => {
    // >= 0.7 = high
    expect(computeQuality({ provenance: MODEL_IDS.CLOUD_LLM, maturityScore: 0.75, hasUserContent: false }).level).toBe('high');
    // >= 0.5 = moderate
    expect(computeQuality({ provenance: MODEL_IDS.WASM_LLM, maturityScore: 0.5, hasUserContent: false }).level).toBe('moderate');
    // >= 0.3 = low
    expect(computeQuality({ provenance: MODEL_IDS.TYPE_ONNX, maturityScore: 0.25, hasUserContent: false }).level).toBe('low');
    // < 0.3 = insufficient
    expect(computeQuality({ provenance: 0, maturityScore: 0.5, hasUserContent: false }).level).toBe('insufficient');
  });
});

describe('isAboveMinimum', () => {
  it('returns true for score >= MIN_QUALITY_THRESHOLD', () => {
    expect(isAboveMinimum(MIN_QUALITY_THRESHOLD)).toBe(true);
    expect(isAboveMinimum(0.8)).toBe(true);
  });

  it('returns false for score < MIN_QUALITY_THRESHOLD', () => {
    expect(isAboveMinimum(MIN_QUALITY_THRESHOLD - 0.01)).toBe(false);
    expect(isAboveMinimum(0)).toBe(false);
  });
});
