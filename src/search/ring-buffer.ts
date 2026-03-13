/**
 * Ring buffer implementation for sequence context storage.
 *
 * Maintains a per-binder FIFO buffer of MiniLM embeddings (384-dim each).
 * Used by the embedding worker to accumulate atom sequence history for LSTM inference.
 *
 * Exported as pure functions operating on a module-level Map so they can be
 * unit-tested without a Worker environment.
 *
 * Phase 33 Plan 01: SEQ-01
 */

/** In-memory ring buffers keyed by binderId. */
const ringBuffers = new Map<string, number[][]>();

/**
 * Append an embedding to the ring buffer for a binder.
 * When the buffer exceeds windowSize, the oldest entry is evicted (FIFO).
 *
 * @param binderId  Binder identifier
 * @param embedding 384-dim MiniLM embedding vector
 * @param windowSize Maximum number of embeddings to retain
 */
export function updateRingBuffer(
  binderId: string,
  embedding: number[],
  windowSize: number,
): void {
  const current = ringBuffers.get(binderId) ?? [];
  const updated = [...current, embedding];
  // Evict oldest entries when over capacity
  const capped = updated.length > windowSize ? updated.slice(updated.length - windowSize) : updated;
  ringBuffers.set(binderId, capped);
}

/**
 * Return the current buffer contents for a binder.
 * Returns an empty array when no buffer has been initialised (cold-start).
 *
 * @param binderId Binder identifier
 */
export function getRingBuffer(binderId: string): number[][] {
  return ringBuffers.get(binderId) ?? [];
}

/**
 * Overwrite (or initialise) the buffer for a binder from an external source.
 * Called when handling LOAD_RING_BUFFER to hydrate from persisted Dexie state.
 *
 * @param binderId   Binder identifier
 * @param embeddings Array of 384-dim embedding vectors
 */
export function setRingBuffer(binderId: string, embeddings: number[][]): void {
  ringBuffers.set(binderId, embeddings);
}

/**
 * Clear all ring buffers. Used in tests to reset state between runs.
 */
export function clearRingBuffers(): void {
  ringBuffers.clear();
}
