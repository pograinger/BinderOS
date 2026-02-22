/**
 * Worker command handlers for inbox operations.
 *
 * Inbox items are pre-classification atoms — type is optional.
 * Classification converts an inbox item into a fully typed atom.
 */

import { db } from '../../storage/db';
import { writeQueue } from '../../storage/write-queue';
import { appendMutation } from '../../storage/changelog';
import { AtomSchema, InboxItemSchema } from '../../types/atoms';
import type { Atom, AtomType, InboxItem } from '../../types/atoms';

/**
 * Create a new inbox item.
 *
 * Generates UUID, sets isInbox: true, type: undefined,
 * validates with InboxItemSchema, enqueues write.
 */
export async function handleCreateInboxItem(
  payload: { content: string; title?: string },
): Promise<InboxItem> {
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
