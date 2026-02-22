/**
 * Worker command handlers for inbox operations.
 *
 * Inbox items are pre-classification atoms — type is optional.
 * Classification converts an inbox item into a fully typed atom.
 *
 * Phase 2 additions:
 * - handleCreateInboxItem checks inbox cap BEFORE inserting.
 *   Returns 'cap_exceeded' if count >= capConfig.inboxCap.
 */

import { db } from '../../storage/db';
import { writeQueue } from '../../storage/write-queue';
import { appendMutation } from '../../storage/changelog';
import { AtomSchema, InboxItemSchema } from '../../types/atoms';
import type { Atom, AtomType, InboxItem } from '../../types/atoms';
import { getCapConfig } from './config';

/**
 * Create a new inbox item, with cap enforcement.
 *
 * Returns 'cap_exceeded' if inbox count is at or above the configured cap.
 * Generates UUID, sets isInbox: true, type: undefined,
 * validates with InboxItemSchema, enqueues write.
 */
export async function handleCreateInboxItem(
  payload: { content: string; title?: string },
): Promise<InboxItem | 'cap_exceeded'> {
  // Phase 2: cap check — flush first to get accurate count, then check cap
  await writeQueue.flushImmediate();
  const capConfig = await getCapConfig();
  const currentCount = await db.inbox.count();
  if (currentCount >= capConfig.inboxCap) {
    return 'cap_exceeded';
  }

  const now = Date.now();
  const item: InboxItem = {
    id: crypto.randomUUID(),
    title: payload.title ?? '',
    content: payload.content,
    status: 'open',
    links: [],
    isInbox: true,
    created_at: now,
    updated_at: now,
  };

  // Validate
  InboxItemSchema.parse(item);

  // Enqueue write
  writeQueue.enqueue(async () => {
    await db.inbox.put(item);
  });

  return item;
}

/**
 * Delete an inbox item (discard without classifying).
 *
 * Used by the CapEnforcementModal discard action.
 * Directly removes from inbox without creating an atom or changelog entry.
 */
export async function handleDeleteInboxItem(
  payload: { id: string },
): Promise<void> {
  const item = await db.inbox.get(payload.id);
  if (!item) {
    throw new Error(`Inbox item not found: ${payload.id}`);
  }
  writeQueue.enqueue(async () => {
    await db.inbox.delete(payload.id);
  });
}

/**
 * Classify an inbox item into a typed atom.
 *
 * Reads the inbox item, converts to a full Atom with the given type,
 * deletes from inbox, adds to atoms, creates changelog entry.
 */
export async function handleClassifyInboxItem(
  payload: { id: string; type: AtomType; sectionItemId?: string },
): Promise<Atom> {
  const inboxItem = await db.inbox.get(payload.id);
  if (!inboxItem) {
    throw new Error(`Inbox item not found: ${payload.id}`);
  }

  const now = Date.now();

  // Convert to typed atom — remove isInbox, set type
  const atom: Atom = {
    id: inboxItem.id,
    title: inboxItem.title,
    content: inboxItem.content,
    type: payload.type,
    status: 'open',
    links: inboxItem.links,
    sectionItemId: payload.sectionItemId,
    created_at: inboxItem.created_at,
    updated_at: now,
  } as Atom;

  // Validate the new atom
  AtomSchema.parse(atom);

  // Create changelog entry for the new atom
  const logEntry = appendMutation(atom.id, 'create', null, atom);

  // Enqueue: delete from inbox, add to atoms, add changelog
  writeQueue.enqueue(async () => {
    await db.inbox.delete(payload.id);
  });
  writeQueue.enqueue(async () => {
    await db.atoms.put(atom);
  });
  writeQueue.enqueue(async () => {
    await db.changelog.put(logEntry);
  });

  return atom;
}
