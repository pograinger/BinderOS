/**
 * Helpers for concatenating MiniLM embeddings with sequence context vectors.
 *
 * The Phase 33 classifier input shape is 512-dim:
 *   [384-dim MiniLM] + [128-dim LSTM sequence context]
 *
 * When sequence context is unavailable (cold-start, model not loaded), the
 * sequence context portion is zero-padded so classifiers remain backward-
 * compatible with 384-dim-only models until they are retrained on 512-dim input.
 *
 * Phase 33 Plan 01: SEQ-01, SEQ-03
 */

const MINILM_DIM = 384;
const SEQ_CTX_DIM = 128;
const COMBINED_DIM = MINILM_DIM + SEQ_CTX_DIM; // 512

/**
 * Concatenate a 384-dim MiniLM embedding with a 128-dim sequence context vector.
 * Returns a 512-dim Float32Array: [miniLM[0..383], seqCtx[0..127]].
 *
 * @param miniLM    384-dim MiniLM embedding (Float32Array)
 * @param seqCtx   128-dim sequence context embedding (Float32Array)
 */
export function concatSequenceContext(miniLM: Float32Array, seqCtx: Float32Array): Float32Array {
  const result = new Float32Array(COMBINED_DIM);
  result.set(miniLM, 0);
  result.set(seqCtx, MINILM_DIM);
  return result;
}

/**
 * Return a 512-dim Float32Array with the MiniLM values in [0..383]
 * and zeros in [384..511] (cold-start / model-not-loaded fallback).
 *
 * @param miniLM 384-dim MiniLM embedding (Float32Array)
 */
export function zeroPadSequenceContext(miniLM: Float32Array): Float32Array {
  const result = new Float32Array(COMBINED_DIM);
  result.set(miniLM, 0);
  // Positions 384..511 remain 0 (TypedArray default)
  return result;
}
