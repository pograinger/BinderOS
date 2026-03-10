/**
 * Dev-only test binder import function.
 *
 * Loads a Claude-generated test binder JSON file into BinderOS via direct
 * Dexie writes (bypasses dispatch caps and timestamp overrides).
 *
 * Usage: window.__importTestBinder() from browser console in dev mode
 *
 * Prerequisite: Run scripts/train/05_generate_test_binder.py first to
 * generate scripts/train/test-binder.json.
 */

import { db } from '../storage/db';
import { dispatch } from '../worker/bridge';

const DAY_MS = 86_400_000;

interface TestBinderMeta {
  generatedAt: string;
  personaName: string;
  atomCount: number;
  version: number;
}

interface TestBinderAtom {
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

interface TestBinderData {
  meta: TestBinderMeta;
  sectionItems: Array<{
    id: string;
    sectionId: string;
    name: string;
    description?: string;
  }>;
  atoms: TestBinderAtom[];
  inboxItems: Array<{
    id: string;
    title: string;
    content: string;
    staleDays?: number;
  }>;
}

export async function importTestBinder(): Promise<void> {
  if (!import.meta.env.DEV) {
    console.warn('[import] Refusing to import outside dev mode');
    return;
  }

  // Fetch the JSON file (Vite serves project root in dev mode)
  const response = await fetch('/scripts/train/test-binder.json');
  if (!response.ok) {
    throw new Error(
      `Failed to fetch test-binder.json (${response.status}). ` +
      `Run: python scripts/train/05_generate_test_binder.py`,
    );
  }
  const data: TestBinderData = await response.json();

  console.log(`[import] Loading binder: "${data.meta.personaName}" (${data.meta.atomCount} atoms)`);

  // Clear existing data (preserve default sections — they're stable)
  await db.transaction('rw', [db.atoms, db.inbox, db.sectionItems, db.changelog], async () => {
    await db.atoms.clear();
    await db.inbox.clear();
    await db.sectionItems.clear();
    await db.changelog.clear();
  });
  console.log('[import] Cleared existing data');

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
  console.log(`[import] Inserted ${sectionItems.length} section items`);

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
  console.log(`[import] Inserted ${atoms.length} atoms`);

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
  console.log(`[import] Inserted ${inboxItems.length} inbox items`);

  // Trigger worker recomputation (reads fresh from Dexie)
  dispatch({ type: 'RECOMPUTE_SCORES' });

  // Summary
  const staleCount = data.atoms.filter((a) => (a.staleDays ?? 0) > 30).length;
  const orphanStale = data.atoms.filter(
    (a) => (a.staleDays ?? 0) > 30 && a.links.length === 0,
  ).length;
  const linkedCount = data.atoms.filter((a) => a.links.length > 0).length;

  console.log('[import] Test binder loaded!');
  console.log(`[import] Summary:`);
  console.log(`  ${sectionItems.length} section items`);
  console.log(`  ${atoms.length} atoms (${linkedCount} linked, ${staleCount} stale)`);
  console.log(`  ${orphanStale} compression candidates`);
  console.log(`  ${inboxItems.length} inbox items`);
  console.log('[import] Refresh the page for best results.');
}
