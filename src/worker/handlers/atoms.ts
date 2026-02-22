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

/**
 * Merge source atom into target atom.
 *
 * Transfers all links from source to target (de-duplicated by targetId).
 * Appends source content to target content with a separator.
 * Deletes source atom after merging.
 * Both writes go through the write queue with changelog entries.
 */
export async function handleMergeAtoms(
  payload: { sourceId: string; targetId: string },
): Promise<void> {
  const [source, target] = await Promise.all([
    db.atoms.get(payload.sourceId),
    db.atoms.get(payload.targetId),
  ]);

  if (!source) throw new Error(`Source atom not found: ${payload.sourceId}`);
  if (!target) throw new Error(`Target atom not found: ${payload.targetId}`);

  // Combine links: merge source links into target, de-duplicate by targetId
  const existingTargetIds = new Set(target.links.map((l) => l.targetId));
  const newLinks = source.links.filter((l) => !existingTargetIds.has(l.targetId));
  const mergedLinks = [...target.links, ...newLinks];

  // Append source content to target with separator
  const sourceLabel = source.content.split('\n')[0]?.slice(0, 60) ?? payload.sourceId;
  const mergedContent = source.content
    ? `${target.content}\n\n---\nMerged from: ${sourceLabel}\n${source.content}`
    : target.content;

  const updatedTarget: Atom = {
    ...target,
    links: mergedLinks,
    content: mergedContent,
    updated_at: Date.now(),
  } as Atom;

  // Validate updated target
  AtomSchema.parse(updatedTarget);

  // Changelog: update target
  const updateLogEntry = appendMutation(updatedTarget.id, 'update', target, updatedTarget);

  // Changelog: delete source
  const deleteLogEntry = appendMutation(source.id, 'delete', source, null);

  // Enqueue writes
  writeQueue.enqueue(async () => {
    await db.atoms.put(updatedTarget);
  });
  writeQueue.enqueue(async () => {
    await db.changelog.put(updateLogEntry);
  });
  writeQueue.enqueue(async () => {
    await db.atoms.delete(payload.sourceId);
  });
  writeQueue.enqueue(async () => {
    await db.changelog.put(deleteLogEntry);
  });
}
