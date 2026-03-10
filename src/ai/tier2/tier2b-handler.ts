/**
 * Tier 2B handler — WASM LLM for enrichment tasks.
 *
 * Handles enrichment-specific task types (enrich-questions, enrich-options,
 * decompose-contextual, synthesize-enrichment) on devices with WASM LLM capability.
 *
 * When no WASM worker is available, returns confidence: 0 to trigger natural
 * fallback to T2A templates or T3 cloud LLM.
 *
 * Actual WASM LLM integration deferred to Phase 15 — this provides the
 * routing infrastructure and handler stub.
 */

import type { TierHandler } from './handler';
import type { AITaskType, TieredRequest, TieredResult } from './types';

// --- Tier 2B task types ---

/**
 * Task types handled by Tier 2B (WASM LLM).
 * These are enrichment-specific tasks that benefit from generative capability
 * but can fall back to templates when WASM LLM is unavailable.
 */
export const TIER2B_TASKS: AITaskType[] = [
  'enrich-questions',
  'enrich-options',
  'decompose-contextual',
  'synthesize-enrichment',
];

/**
 * Check if WASM LLM capability is available on this device.
 * Stub: always returns false until Phase 15 implements real detection
 * (checks WebGPU/WASM support, memory budget, model availability).
 */
export function isTier2BAvailable(): boolean {
  // TODO: Phase 15 — implement real device capability check:
  //   - WebGPU or WASM SIMD support
  //   - Sufficient memory (>= 2GB available)
  //   - Model files downloaded/cached
  //   - Android sentinel: >= 2 tokens/sec throughput
  return false;
}

/**
 * Create a Tier 2B handler for WASM LLM enrichment tasks.
 *
 * @param wasmWorker - Optional Web Worker running the WASM LLM.
 *   If null/undefined, handler returns confidence: 0 for all tasks,
 *   causing natural fallback through the pipeline.
 */
export function createTier2BHandler(wasmWorker?: Worker): TierHandler {
  return {
    tier: 2,
    name: 'Tier2B-WASM-LLM',

    canHandle(task: AITaskType): boolean {
      return TIER2B_TASKS.includes(task);
    },

    async handle(request: TieredRequest): Promise<TieredResult> {
      // No WASM worker — return zero confidence for natural fallback
      if (!wasmWorker) {
        return {
          tier: 2,
          confidence: 0,
          reasoning: 'WASM LLM not available on this device',
        };
      }

      // TODO: Phase 15 — implement WASM LLM protocol:
      //   1. Send request to wasmWorker via postMessage
      //   2. Await response with generated content
      //   3. Parse response based on request.task type
      //   4. Return TieredResult with appropriate fields populated
      //
      // Protocol shape (planned):
      //   wasmWorker.postMessage({ type: 'GENERATE', task: request.task, features: request.features })
      //   response: { type: 'RESULT', content: string, confidence: number }

      // Stub: worker exists but protocol not implemented yet
      return {
        tier: 2,
        confidence: 0,
        reasoning: 'WASM LLM protocol not yet implemented (Phase 15)',
      };
    },
  };
}
