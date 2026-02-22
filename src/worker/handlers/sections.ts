/**
 * Worker command handlers for section item management.
 *
 * Sections themselves are stable (Projects, Areas, Resources, Archive).
 * SectionItems within sections are mutable — users can create, rename, and archive them.
 */

import { db } from '../../storage/db';
import { writeQueue } from '../../storage/write-queue';
import { SectionItemSchema } from '../../types/sections';
import type { SectionItem } from '../../types/sections';

/**
 * Create a new section item within a section.
 *
 * Generates UUID, validates, enqueues write.
 */
export async function handleCreateSectionItem(
  payload: { sectionId: string; name: string },
): Promise<SectionItem> {
  const now = Date.now();
  const item: SectionItem = {
    id: crypto.randomUUID(),
    sectionId: payload.sectionId,
    name: payload.name,
    archived: false,
    created_at: now,
    updated_at: now,
  };

  // Validate
  SectionItemSchema.parse(item);

  // Verify the section exists
  const section = await db.sections.get(payload.sectionId);
  if (!section) {
    throw new Error(`Section not found: ${payload.sectionId}`);
  }

  // Enqueue write
  writeQueue.enqueue(async () => {
    await db.sectionItems.put(item);
  });

  return item;
}

/**
 * Rename an existing section item.
 *
 * Reads current item, updates name and timestamp, enqueues write.
 */
export async function handleRenameSectionItem(
  payload: { id: string; name: string },
): Promise<SectionItem> {
  const existing = await db.sectionItems.get(payload.id);
  if (!existing) {
    throw new Error(`Section item not found: ${payload.id}`);
  }

  const updated: SectionItem = {
    ...existing,
    name: payload.name,
    updated_at: Date.now(),
  };

  // Validate
  SectionItemSchema.parse(updated);

  // Enqueue write
  writeQueue.enqueue(async () => {
    await db.sectionItems.put(updated);
  });

  return updated;
}

/**
 * Archive a section item.
 *
 * Reads current item, sets archived: true, enqueues write.
 */
export async function handleArchiveSectionItem(
  payload: { id: string },
): Promise<SectionItem> {
  const existing = await db.sectionItems.get(payload.id);
  if (!existing) {
    throw new Error(`Section item not found: ${payload.id}`);
  }

  const updated: SectionItem = {
    ...existing,
    archived: true,
    updated_at: Date.now(),
  };

  // Validate
  SectionItemSchema.parse(updated);

  // Enqueue write
  writeQueue.enqueue(async () => {
    await db.sectionItems.put(updated);
  });

  return updated;
}
