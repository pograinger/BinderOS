/**
 * Debounced write queue for batched IndexedDB transactions.
 *
 * All writes are buffered and flushed in a single Dexie transaction
 * after 300ms of inactivity. This avoids the ~2ms per-transaction
 * overhead of IndexedDB and batches rapid successive writes
 * (typing, swipe gestures, triage actions).
 *
 * CRITICAL: All storage writes MUST go through this queue.
 * No direct db.atoms.put() calls from outside the storage layer.
 */

import { db } from './db';

export type WriteOperation = () => Promise<void>;

export class WriteQueue {
  private queue: WriteOperation[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushPromise: Promise<void> | null = null;
  readonly DEBOUNCE_MS: number;

  constructor(debounceMs = 300) {
    this.DEBOUNCE_MS = debounceMs;
  }

  /**
   * Enqueue a write operation. The operation will be executed
   * in a batched transaction after the debounce period.
   */
  enqueue(op: WriteOperation): void {
    this.queue.push(op);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.DEBOUNCE_MS);
  }

  /**
   * Flush all queued operations in a single Dexie transaction.
   * Called automatically after debounce period, or manually via flushImmediate().
   */
  async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    // Splice out current queue so new enqueues during flush go to a fresh batch
    const ops = this.queue.splice(0);

    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    this.flushPromise = db.transaction(
      'rw',
      [db.atoms, db.changelog, db.inbox, db.sections, db.sectionItems, db.config],
      async () => {
        for (const op of ops) {
          await op();
        }
      }
    );

    try {
      await this.flushPromise;
    } finally {
      this.flushPromise = null;
    }
  }

  /**
   * Force an immediate flush without waiting for the debounce timer.
   * Used for critical writes like export preparation.
   */
  async flushImmediate(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    // Wait for any in-progress flush to complete first
    if (this.flushPromise) {
      await this.flushPromise;
    }

    await this.flush();
  }

  /**
   * Get the number of pending operations in the queue.
   */
  get pending(): number {
    return this.queue.length;
  }
}

export const writeQueue = new WriteQueue();
