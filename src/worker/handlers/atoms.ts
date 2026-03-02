/**
 * Worker command handlers for atom CRUD operations.
 *
 * All handlers validate input with Zod BEFORE touching Dexie.
 * Every mutation creates a CRDT-compatible changelog entry.
 * Writes are enqueued to the write queue, never direct db.put() calls.
 *
 * Phase 2 additions:
 * - handleCreateAtom checks task cap BEFORE inserting if type='task' and
 *   status is open/in-progress. Returns 'cap_exceeded' if at cap.
 * - handleUpdateAtom checks task cap when status is being set to open/in-progress.
 */

import { db } from '../../storage/db';
import { writeQueue } from '../../storage/write-queue';
import { appendMutation } from '../../storage/changelog';
import { AtomSchema, CreateAtomInputSchema } from '../../types/atoms';
import type { Atom, CreateAtomInput } from '../../types/atoms';
import type { MutationLogEntry } from '../../types/changelog';
import { getCapConfig } from './config';

/** Count open/in-progress tasks from Dexie. */
async function countOpenTasks(): Promise<number> {
  return db.atoms
    .filter((a) => a.type === 'task' && (a.status === 'open' || a.status === 'in-progress'))
    .count();
}

/**
 * Create a new atom, with task cap enforcement.
 *
 * Returns 'cap_exceeded' if the atom is a task in open/in-progress status
 * and the open task count has reached the configured taskCap.
 *
 * Generates UUID, sets timestamps, validates with Zod,
 * creates changelog entry, and enqueues writes.
 */
export async function handleCreateAtom(
  payload: CreateAtomInput & { source?: 'user' | 'ai'; aiRequestId?: string },
): Promise<{ atom: Atom; logEntry: MutationLogEntry } | 'cap_exceeded'> {
  // Extract source/aiRequestId before atom validation — they're not part of AtomSchema
  const { source, aiRequestId, ...atomPayload } = payload;

  // Phase 2: task cap check
  if (atomPayload.type === 'task') {
    const status = atomPayload.status ?? 'open';
    if (status === 'open' || status === 'in-progress') {
      await writeQueue.flushImmediate();
      const capConfig = await getCapConfig();
      const openCount = await countOpenTasks();
      if (openCount >= capConfig.taskCap) {
        return 'cap_exceeded';
      }
    }
  }

  // Validate input shape (without source/aiRequestId)
  CreateAtomInputSchema.parse(atomPayload);

  const now = Date.now();
  const atom: Atom = {
    ...atomPayload,
    id: crypto.randomUUID(),
    created_at: now,
    updated_at: now,
  } as Atom;

  // Validate the full atom
  AtomSchema.parse(atom);

  // Create changelog entry with source tracking
  const logEntry = appendMutation(atom.id, 'create', null, atom, source, aiRequestId);

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
 * Update an existing atom, with task cap enforcement.
 *
 * Returns 'cap_exceeded' if updating a task's status to open/in-progress
 * would push the open task count over the configured taskCap.
 *
 * Reads current atom, merges changes, validates,
 * creates changelog entry, and enqueues writes.
 */
export async function handleUpdateAtom(
  payload: { id: string; changes: Partial<Atom>; source?: 'user' | 'ai'; aiRequestId?: string },
): Promise<{ atom: Atom; logEntry: MutationLogEntry } | 'cap_exceeded'> {
  const existing = await db.atoms.get(payload.id);
  if (!existing) {
    throw new Error(`Atom not found: ${payload.id}`);
  }

  // Phase 2: task cap check when reopening a task
  if (existing.type === 'task' && payload.changes.status !== undefined) {
    const newStatus = payload.changes.status;
    const wasActive = existing.status === 'open' || existing.status === 'in-progress';
    const willBeActive = newStatus === 'open' || newStatus === 'in-progress';

    // Only check cap if transitioning FROM inactive TO active
    if (!wasActive && willBeActive) {
      await writeQueue.flushImmediate();
      const capConfig = await getCapConfig();
      const openCount = await countOpenTasks();
      if (openCount >= capConfig.taskCap) {
        return 'cap_exceeded';
      }
    }
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

  // Create changelog entry with before/after snapshots and source tracking
  const logEntry = appendMutation(updated.id, 'update', existing, updated, payload.source, payload.aiRequestId);

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
  payload: { id: string; source?: 'user' | 'ai'; aiRequestId?: string },
): Promise<{ logEntry: MutationLogEntry }> {
  const existing = await db.atoms.get(payload.id);
  if (!existing) {
    throw new Error(`Atom not found: ${payload.id}`);
  }

  // Create changelog entry with before snapshot and source tracking
  const logEntry = appendMutation(existing.id, 'delete', existing, null, payload.source, payload.aiRequestId);

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
