/**
 * Worker command handlers for atom CRUD operations.
 *
 * All handlers validate input with Zod BEFORE touching Dexie.
 * Every mutation creates a CRDT-compatible changelog entry.
 * Writes are enqueued to the write queue, never direct db.put() calls.
 */

import { db } from '../../storage/db';
import { writeQueue } from '../../storage/write-queue';
import { appendMutation } from '../../storage/changelog';
import { AtomSchema, CreateAtomInputSchema } from '../../types/atoms';
import type { Atom, CreateAtomInput } from '../../types/atoms';
import type { MutationLogEntry } from '../../types/changelog';

/**
 * Create a new atom.
 *
 * Generates UUID, sets timestamps, validates with Zod,
 * creates changelog entry, and enqueues writes.
 */
export async function handleCreateAtom(
  payload: CreateAtomInput,
): Promise<{ atom: Atom; logEntry: MutationLogEntry }> {
  // Validate input shape
  CreateAtomInputSchema.parse(payload);

  const now = Date.now();
  const atom: Atom = {
    ...payload,
    id: crypto.randomUUID(),
    created_at: now,
    updated_at: now,
  } as Atom;

  // Validate the full atom
  AtomSchema.parse(atom);

  // Create changelog entry
  const logEntry = appendMutation(atom.id, 'create', null, atom);

  // Enqueue writes
  writeQueue.enqueue(async () => {
    await db.atoms.put(atom);
  });
  writeQueue.enqueue(async () => {
    await db.changelog.put(logEntry);
  });

  return { atom, logEntry };
}

/**
 * Update an existing atom.
 *
 * Reads current atom, merges changes, validates,
 * creates changelog entry, and enqueues writes.
 */
export async function handleUpdateAtom(
  payload: { id: string; changes: Partial<Atom> },
): Promise<{ atom: Atom; logEntry: MutationLogEntry }> {
  const existing = await db.atoms.get(payload.id);
  if (!existing) {
    throw new Error(`Atom not found: ${payload.id}`);
  }

  const updated: Atom = {
    ...existing,
    ...payload.changes,
    id: existing.id, // Prevent id override
    type: existing.type, // Prevent type change via update
    updated_at: Date.now(),
  } as Atom;

  // Validate the merged atom
  AtomSchema.parse(updated);

  // Create changelog entry with before/after snapshots
  const logEntry = appendMutation(updated.id, 'update', existing, updated);

  // Enqueue writes
  writeQueue.enqueue(async () => {
    await db.atoms.put(updated);
  });
  writeQueue.enqueue(async () => {
    await db.changelog.put(logEntry);
  });

  return { atom: updated, logEntry };
}

/**
 * Delete an atom.
 *
 * Reads current atom for changelog snapshot,
 * creates changelog entry, and enqueues delete.
 */
export async function handleDeleteAtom(
  payload: { id: string },
): Promise<{ logEntry: MutationLogEntry }> {
  const existing = await db.atoms.get(payload.id);
  if (!existing) {
    throw new Error(`Atom not found: ${payload.id}`);
  }

  // Create changelog entry with before snapshot
  const logEntry = appendMutation(existing.id, 'delete', existing, null);

  // Enqueue delete + changelog write
  writeQueue.enqueue(async () => {
    await db.atoms.delete(payload.id);
  });
  writeQueue.enqueue(async () => {
    await db.changelog.put(logEntry);
  });

  return { logEntry };
}
