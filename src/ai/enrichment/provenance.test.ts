/**
 * Tests for provenance bitmask system.
 *
 * Phase 24: ENRICH-06
 */

import { describe, it, expect } from 'vitest';
import {
  MODEL_IDS,
  OPERATION_IDS,
  addProvenance,
  getTiersUsed,
  getModelNames,
  getOperationNames,
} from './provenance';

describe('provenance bitmask', () => {
  describe('addProvenance', () => {
    it('sets a single model bit from zero', () => {
      const result = addProvenance(0, MODEL_IDS.TYPE_ONNX);
      expect(result).toBe(MODEL_IDS.TYPE_ONNX);
      expect(result & MODEL_IDS.TYPE_ONNX).not.toBe(0);
    });

    it('sets multiple bits via combined flags', () => {
      const existing = addProvenance(0, MODEL_IDS.TYPE_ONNX);
      const result = addProvenance(existing, MODEL_IDS.CLOUD_LLM | OPERATION_IDS.ENRICH);
      expect(result & MODEL_IDS.TYPE_ONNX).not.toBe(0);
      expect(result & MODEL_IDS.CLOUD_LLM).not.toBe(0);
      expect(result & OPERATION_IDS.ENRICH).not.toBe(0);
    });

    it('is idempotent -- setting same bit twice is unchanged', () => {
      const a = addProvenance(0, MODEL_IDS.WASM_LLM);
      const b = addProvenance(a, MODEL_IDS.WASM_LLM);
      expect(a).toBe(b);
    });
  });

  describe('getTiersUsed', () => {
    it('returns all false for 0', () => {
      expect(getTiersUsed(0)).toEqual({ t1: false, t2a: false, t2b: false, t3: false });
    });

    it('detects t1 from TYPE_ONNX', () => {
      const bitmask = MODEL_IDS.TYPE_ONNX;
      const tiers = getTiersUsed(bitmask);
      expect(tiers.t1).toBe(true);
      expect(tiers.t2a).toBe(false);
    });

    it('detects t1 from GTD_ROUTING', () => {
      const bitmask = MODEL_IDS.GTD_ROUTING;
      expect(getTiersUsed(bitmask).t1).toBe(true);
    });

    it('detects t2a from DECOMPOSE_ONNX', () => {
      const bitmask = MODEL_IDS.TYPE_ONNX | MODEL_IDS.DECOMPOSE_ONNX;
      const tiers = getTiersUsed(bitmask);
      expect(tiers.t1).toBe(true);
      expect(tiers.t2a).toBe(true);
      expect(tiers.t2b).toBe(false);
      expect(tiers.t3).toBe(false);
    });

    it('detects t2b from WASM_LLM', () => {
      const bitmask = MODEL_IDS.WASM_LLM;
      expect(getTiersUsed(bitmask).t2b).toBe(true);
    });

    it('detects t3 from CLOUD_LLM', () => {
      const bitmask = MODEL_IDS.CLOUD_LLM;
      expect(getTiersUsed(bitmask).t3).toBe(true);
    });
  });

  describe('getModelNames', () => {
    it('returns empty array for 0', () => {
      expect(getModelNames(0)).toEqual([]);
    });

    it('returns human-readable names for active model bits', () => {
      const bitmask = MODEL_IDS.TYPE_ONNX | MODEL_IDS.CLOUD_LLM;
      const names = getModelNames(bitmask);
      expect(names).toContain('Type ONNX');
      expect(names).toContain('Cloud LLM');
      expect(names).toHaveLength(2);
    });

    it('does not include operation bits in model names', () => {
      const bitmask = MODEL_IDS.TYPE_ONNX | OPERATION_IDS.CLASSIFY;
      const names = getModelNames(bitmask);
      expect(names).toEqual(['Type ONNX']);
    });
  });

  describe('getOperationNames', () => {
    it('returns empty array for 0', () => {
      expect(getOperationNames(0)).toEqual([]);
    });

    it('returns operation names for active bits', () => {
      const bitmask = OPERATION_IDS.CLASSIFY | OPERATION_IDS.ENRICH;
      const names = getOperationNames(bitmask);
      expect(names).toContain('Classify');
      expect(names).toContain('Enrich');
      expect(names).toHaveLength(2);
    });
  });

  describe('roundtrip', () => {
    it('encodes multiple models and all are present on decode', () => {
      let bitmask = 0;
      bitmask = addProvenance(bitmask, MODEL_IDS.TYPE_ONNX);
      bitmask = addProvenance(bitmask, MODEL_IDS.DECOMPOSE_ONNX);
      bitmask = addProvenance(bitmask, MODEL_IDS.WASM_LLM);
      bitmask = addProvenance(bitmask, OPERATION_IDS.CLASSIFY);
      bitmask = addProvenance(bitmask, OPERATION_IDS.DECOMPOSE);

      const tiers = getTiersUsed(bitmask);
      expect(tiers.t1).toBe(true);
      expect(tiers.t2a).toBe(true);
      expect(tiers.t2b).toBe(true);
      expect(tiers.t3).toBe(false);

      const modelNames = getModelNames(bitmask);
      expect(modelNames).toContain('Type ONNX');
      expect(modelNames).toContain('Decompose ONNX');
      expect(modelNames).toContain('WASM LLM');
      expect(modelNames).toHaveLength(3);

      const opNames = getOperationNames(bitmask);
      expect(opNames).toContain('Classify');
      expect(opNames).toContain('Decompose');
      expect(opNames).toHaveLength(2);
    });
  });
});
