/**
 * CRDT-compatible change log functions.
 *
 * Every atom mutation appends a MutationLogEntry with:
 * - lamportClock: monotonic counter per device (causal ordering)
 * - deviceId: UUID from localStorage (identifies sync peer)
 * - before/after: full atom snapshots (undo + conflict resolution)
 *
 * The lamport clock is initialized from the max value in the changelog
 * table on startup, ensuring monotonicity across app restarts.
 */

import { db } from './db';
import type { Atom } from '../types/atoms';
import type { MutationOperation, MutationLogEntry } from '../types/changelog';

const DEVICE_ID_KEY = 'binderos-device-id';

// Module-level lamport clock counter
let lamportClockCounter = 0;

// Cached device ID (loaded from Dexie config table on init)
let cachedDeviceId: string | null = null;

/**
 * Get the device ID. Must call initLamportClock() first to load from Dexie.
 * Falls back to generating a new UUID if not yet initialized.
 */
export function getDeviceId(): string {
  if (cachedDeviceId) return cachedDeviceId;
  // Fallback: generate and cache (will be persisted on next initLamportClock)
  cachedDeviceId = crypto.randomUUID();
  return cachedDeviceId;
}

/**
 * Get the current lamport clock value.
 * This is a monotonically incrementing counter per device.
 */
export function getLamportClock(): number {
  return lamportClockCounter;
}

/**
 * Initialize the lamport clock from the max value in the changelog table,
 * and load (or create) the device ID from the Dexie config table.
 * Must be called once on worker initialization before any mutations.
 *
 * Uses the config table instead of localStorage because this runs
 * in a Web Worker where localStorage is not available.
 */
export async function initLamportClock(): Promise<void> {
  const maxEntry = await db.changelog
    .orderBy('lamportClock')
    .last();

  lamportClockCounter = maxEntry ? maxEntry.lamportClock : 0;

  // Load or create device ID from Dexie config table
  const entry = await db.config.get(DEVICE_ID_KEY);
  if (entry && typeof entry.value === 'string') {
    cachedDeviceId = entry.value;
  } else {
    cachedDeviceId = crypto.randomUUID();
    await db.config.put({ key: DEVICE_ID_KEY, value: cachedDeviceId });
  }
}

/**
 * Create a mutation log entry for an atom operation.
 *
 * Increments the lamport clock and returns the complete entry.
 * The caller is responsible for adding this to the write queue.
 *
 * @param atomId - The atom being mutated
 * @param operation - The type of mutation
 * @param before - Full atom state before mutation (null for create)
 * @param after - Full atom state after mutation (null for delete)
 * @returns The complete MutationLogEntry ready for persistence
 */
export function appendMutation(
  atomId: string,
  operation: MutationOperation,
  before: Atom | null,
  after: Atom | null,
): MutationLogEntry {
  lamportClockCounter += 1;

  return {
    id: crypto.randomUUID(),
    atomId,
    operation,
    before,
    after,
    timestamp: Date.now(),
    lamportClock: lamportClockCounter,
    deviceId: getDeviceId(),
  };
}
