/**
 * Binder import from JSON file.
 *
 * Accepts a File object (from file picker), validates shape, clears existing
 * data (preserves sections), and bulk-inserts atoms, sectionItems, and inbox.
 * After write, dispatches RECOMPUTE_SCORES so the worker picks up fresh data.
 */

import { db } from './db';
import { dispatch } from '../worker/bridge';

const DAY_MS = 86_400_000;

interface ImportBinderMeta {
  generatedAt: string;
  personaName: string;
  atomCount: number;
  version: number;
}

interface ImportBinderAtom {
  id: string;
  type: 'task' | 'fact' | 'event' | 'decision' | 'insight';
  title: string;
  content: string;
  status: 'open' | 'in-progress' | 'waiting' | 'done' | 'cancelled';
  sectionId?: string;
  sectionItemId?: string;
  links: Array<{
    targetId: string;
    relationshipType: string;
    direction: 'forward' | 'backward';
  }>;
  tags: string[];
  dueDate?: number | null;
  eventDate?: number | null;
  energy?: 'Quick' | 'Medium' | 'Deep' | null;
  staleDays?: number;
}

interface ImportBinderData {
  meta: ImportBinderMeta;
  sectionItems: Array<{
    id: string;
    sectionId: string;
    name: string;
    description?: string;
  }>;
  atoms: ImportBinderAtom[];
  inboxItems: Array<{
    id: string;
    title: string;
    content: string;
    staleDays?: number;
  }>;
}

export interface ImportResult {
  atoms: number;
  sectionItems: number;
  inboxItems: number;
}

/**
 * Import a binder JSON file, replacing all current data.
 * Sections are preserved (stable defaults); atoms, sectionItems, inbox, and changelog are cleared.
 */
export async function importBinderFromFile(file: File): Promise<ImportResult> {
  const text = await file.text();
  const data: ImportBinderData = JSON.parse(text);

  // Validate shape
  if (!data.meta || !Array.isArray(data.atoms) || !Array.isArray(data.sectionItems) || !Array.isArray(data.inboxItems)) {
    throw new Error('Invalid binder file: missing meta, atoms, sectionItems, or inboxItems');
  }

  // Clear existing data (preserve sections — they're stable defaults)
  await db.transaction('rw', [db.atoms, db.inbox, db.sectionItems, db.changelog], async () => {
    await db.atoms.clear();
    await db.inbox.clear();
    await db.sectionItems.clear();
    await db.changelog.clear();
  });

  const now = Date.now();

  // Insert section items
  const sectionItems = data.sectionItems.map((si) => ({
    id: si.id,
    sectionId: si.sectionId,
    name: si.name,
    description: si.description ?? '',
    archived: false,
    created_at: now,
    updated_at: now,
  }));
  await db.sectionItems.bulkPut(sectionItems);

  // Insert atoms with computed timestamps
  const atoms = data.atoms.map((a) => {
    const staleDays = a.staleDays ?? 0;
    const ts = staleDays > 0 ? now - staleDays * DAY_MS : now;
    return {
      id: a.id,
      type: a.type,
      title: a.title,
      content: a.content,
      status: a.status,
      sectionId: a.sectionId ?? undefined,
      sectionItemId: a.sectionItemId ?? undefined,
      links: a.links,
      tags: a.tags ?? [],
      dueDate: a.dueDate ?? undefined,
      eventDate: a.eventDate ?? undefined,
      energy: a.energy ?? undefined,
      provenance: 0,
      created_at: ts,
      updated_at: ts,
    };
  });
  await db.atoms.bulkPut(atoms);

  // Insert inbox items
  const inboxItems = data.inboxItems.map((item) => {
    const staleDays = item.staleDays ?? 0;
    const ts = staleDays > 0 ? now - staleDays * DAY_MS : now;
    return {
      id: item.id,
      title: item.title,
      content: item.content,
      status: 'open' as const,
      links: [] as never[],
      isInbox: true as const,
      tags: [] as string[],
      provenance: 0,
      maturityScore: 0,
      maturityFilled: [] as string[],
      enrichmentDepth: {} as Record<string, number>,
      created_at: ts,
      updated_at: ts,
    };
  });
  await db.inbox.bulkPut(inboxItems);

  // Trigger worker recomputation
  dispatch({ type: 'RECOMPUTE_SCORES' });

  return {
    atoms: atoms.length,
    sectionItems: sectionItems.length,
    inboxItems: inboxItems.length,
  };
}
