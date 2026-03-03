/**
 * Dev-only seed data generator for Phase 7 UAT testing.
 *
 * Generates ~30 diverse atoms and inbox items through the worker bridge,
 * creating the exact conditions the guided review flow needs:
 *   - Inbox items for Get Clear phase
 *   - Stale items for Get Current
 *   - Projects without next actions
 *   - Compression candidates (stale + no links)
 *   - Area gaps for Get Creative
 *
 * Usage: window.__seedDevData() from browser console
 *
 * All atoms flow through the real dispatch pipeline (validation, changelog,
 * WASM scoring). Timestamp backdating for staleness is done via direct
 * Dexie access since UPDATE_ATOM always sets updated_at = Date.now().
 */

import { dispatch } from '../worker/bridge';
import { SECTION_IDS } from '../storage/migrations/v1';
import type { AtomLink } from '../types/atoms';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const daysAgo = (d: number): number => Date.now() - d * DAY_MS;
const daysFromNow = (d: number): number => Date.now() + d * DAY_MS;
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Section item definitions (3 projects + 3 areas)
// ---------------------------------------------------------------------------

const SECTION_ITEMS = [
  { name: 'Website Redesign', sectionId: SECTION_IDS.projects },
  { name: 'Learn Spanish', sectionId: SECTION_IDS.projects },
  { name: 'Home Office Setup', sectionId: SECTION_IDS.projects },
  { name: 'Health & Fitness', sectionId: SECTION_IDS.areas },
  { name: 'Personal Finance', sectionId: SECTION_IDS.areas },
  // "Community Involvement" has zero atoms → area gap for Get Creative
  { name: 'Community Involvement', sectionId: SECTION_IDS.areas },
] as const;

// ---------------------------------------------------------------------------
// Inbox item definitions (8)
// ---------------------------------------------------------------------------

interface InboxDef {
  title: string;
  content: string;
  staleDays?: number;
}

const INBOX_ITEMS: InboxDef[] = [
  {
    title: 'New productivity app recommendation',
    content: 'Check out that new productivity app Sarah mentioned — something like "Notion meets Todoist"',
  },
  {
    title: 'Renew passport',
    content: 'Remember to renew passport before June — processing times are long right now',
  },
  {
    title: 'Sleep optimization article',
    content: 'Great article about sleep optimization: consistent wake time matters more than bedtime. Save for reference.',
    staleDays: 7,
  },
  {
    title: 'Team standup notes 2/15',
    content: 'Meeting notes from team standup 2/15: Jake is blocked on API integration, need to help him this week.',
    staleDays: 15,
  },
  {
    title: "Gift ideas for Mom's birthday",
    content: 'Gift ideas for Mom: garden tool set, cooking class voucher, or that book she mentioned.',
  },
  {
    title: 'Research home insurance',
    content: 'Research home insurance providers — current policy renews in April, want to compare rates.',
    staleDays: 21,
  },
  {
    title: 'New coffee shop review',
    content: 'The new coffee shop on Main St has great reviews. Try their cold brew next week.',
  },
  {
    title: 'Schedule annual physical',
    content: 'Schedule annual physical exam — been over a year since the last one.',
    staleDays: 14,
  },
];

// ---------------------------------------------------------------------------
// Atom definitions (22)
// ---------------------------------------------------------------------------

interface AtomDef {
  type: 'task' | 'fact' | 'event' | 'decision' | 'insight';
  title: string;
  content: string;
  status: 'open' | 'in-progress' | 'waiting' | 'done' | 'cancelled' | 'archived';
  sectionItemName?: string;
  tags?: string[];
  dueDate?: number;
  eventDate?: number;
  staleDays?: number;
  linkTargets?: string[];
}

const ATOMS: AtomDef[] = [
  // ── Tasks (8) ─────────────────────────────────────────────────────────
  {
    type: 'task',
    title: 'Update portfolio website with recent projects',
    content: 'Add the three latest client projects to the portfolio page. Include screenshots and case study links.',
    status: 'open',
    sectionItemName: 'Website Redesign',
    tags: ['web', 'portfolio'],
  },
  {
    type: 'task',
    title: 'Review and merge pull request #47',
    content: 'PR #47 refactors the navigation component. Need to test mobile breakpoints before merging.',
    status: 'in-progress',
    sectionItemName: 'Website Redesign',
    tags: ['web', 'code-review'],
  },
  {
    type: 'task',
    title: 'Buy ergonomic keyboard',
    content: 'Looking at Kinesis Advantage360 or ZSA Moonlander. Budget: $400.',
    status: 'open',
    sectionItemName: 'Home Office Setup',
    tags: ['office-setup', 'purchase'],
    dueDate: daysFromNow(5),
  },
  {
    type: 'task',
    title: 'File quarterly tax estimates',
    content: 'Q1 2026 estimated taxes due April 15. Need to calculate based on freelance income.',
    status: 'open',
    sectionItemName: 'Personal Finance',
    tags: ['finance', 'taxes'],
    staleDays: 45, // stale + no links → compression candidate
  },
  {
    type: 'task',
    title: 'Waiting for contractor quote on desk',
    content: "Custom standing desk build. Contractor said he'd have quote by end of week.",
    status: 'waiting',
    sectionItemName: 'Home Office Setup',
    tags: ['office-setup'],
  },
  {
    // Only task for Learn Spanish, and it's done → project has no next action
    type: 'task',
    title: 'Complete Spanish lesson 12',
    content: 'Lesson 12 covers subjunctive mood. Practice exercises in workbook.',
    status: 'done',
    sectionItemName: 'Learn Spanish',
    tags: ['language', 'learning'],
  },
  {
    type: 'task',
    title: 'Schedule dentist appointment',
    content: "Overdue for 6-month cleaning. Dr. Patel's office: 555-0198.",
    status: 'open',
    sectionItemName: 'Health & Fitness',
    tags: ['health', 'appointments'],
    staleDays: 50,
    linkTargets: ['Annual physical exam Feb 10'], // linked → stale but NOT compression candidate
  },
  {
    type: 'task',
    title: 'Run 5K three times this week',
    content: 'Training for April half-marathon. Target pace: 5:30/km.',
    status: 'open',
    sectionItemName: 'Health & Fitness',
    tags: ['health', 'fitness', 'running'],
  },

  // ── Facts (4) ─────────────────────────────────────────────────────────
  {
    type: 'fact',
    title: 'Passport expires June 2027',
    content: 'US passport #123456789 expires June 15, 2027. Renewal takes 6-8 weeks.',
    status: 'open',
    sectionItemName: 'Personal Finance',
    tags: ['documents', 'travel'],
  },
  {
    type: 'fact',
    title: 'Contractor phone: 555-0147',
    content: 'Mike from Custom Woodworks. Does desks, shelving, and cabinetry. Recommended by Jake.',
    status: 'open',
    sectionItemName: 'Home Office Setup',
    tags: ['office-setup', 'contacts'],
    linkTargets: ['Buy ergonomic keyboard'],
  },
  {
    type: 'fact',
    title: 'Max 401k contribution is $23,500 for 2026',
    content: 'IRS limit for 2026 employee contributions. Catch-up contribution available at 50+.',
    status: 'open',
    tags: ['finance'],
    staleDays: 60, // orphaned + stale → compression candidate
  },
  {
    type: 'fact',
    title: 'Spanish verb conjugation cheat sheet',
    content: 'Regular -ar verbs: -o, -as, -a, -amos, -áis, -an. Irregular: ser, estar, ir, haber.',
    status: 'open',
    sectionItemName: 'Learn Spanish',
    tags: ['language', 'reference'],
  },

  // ── Events (3) ────────────────────────────────────────────────────────
  {
    type: 'event',
    title: 'Team offsite March 15-17',
    content: 'Annual team offsite at the lake house. Bring laptop and presentation materials.',
    status: 'open',
    sectionItemName: 'Website Redesign',
    tags: ['work', 'travel'],
    eventDate: daysFromNow(13),
    linkTargets: ['Review and merge pull request #47'],
  },
  {
    type: 'event',
    title: "Mom's birthday April 12",
    content: 'Planning a family dinner. Need to coordinate with siblings on gift.',
    status: 'open',
    tags: ['family'],
    eventDate: daysFromNow(41),
  },
  {
    type: 'event',
    title: 'Annual physical exam Feb 10',
    content: 'Results: all clear. Blood pressure 118/76. Follow up in 12 months.',
    status: 'done',
    sectionItemName: 'Health & Fitness',
    tags: ['health', 'appointments'],
    eventDate: daysAgo(20),
  },

  // ── Decisions (3) ─────────────────────────────────────────────────────
  {
    type: 'decision',
    title: 'Chose React over Vue for website redesign',
    content: 'Team has more React experience. Ecosystem is larger. Next.js gives SSR out of the box.',
    status: 'open',
    sectionItemName: 'Website Redesign',
    tags: ['web', 'architecture'],
    linkTargets: ['Update portfolio website with recent projects'],
  },
  {
    type: 'decision',
    title: 'Decided to switch to credit union for checking',
    content: 'Lower fees, better interest rates, local branch. Will keep savings at current bank for now.',
    status: 'open',
    sectionItemName: 'Personal Finance',
    tags: ['finance', 'banking'],
    staleDays: 55, // stale + no links → compression candidate
  },
  {
    type: 'decision',
    title: 'Going with 27-inch monitor for home office',
    content: 'LG 27UN850-W. 4K, USB-C, good color accuracy. $450 at current sale price.',
    status: 'open',
    sectionItemName: 'Home Office Setup',
    tags: ['office-setup', 'purchase'],
  },

  // ── Insights (4) ──────────────────────────────────────────────────────
  {
    type: 'insight',
    title: 'Morning workouts are 2x more consistent than evening ones',
    content: 'Tracked for 3 months. Morning sessions: 85% completion. Evening: 42%. Schedule accordingly.',
    status: 'open',
    sectionItemName: 'Health & Fitness',
    tags: ['health', 'fitness', 'habits'],
    linkTargets: ['Run 5K three times this week'],
  },
  {
    type: 'insight',
    title: 'Pomodoro technique works better for coding than writing',
    content: 'Coding: 25min focus works great. Writing: need longer uninterrupted blocks (45-60min).',
    status: 'open',
    tags: ['productivity'],
    staleDays: 50, // orphaned + stale → compression candidate
  },
  {
    type: 'insight',
    title: 'Team velocity increases 30% after retrospectives',
    content: 'Measured over 6 sprints. Retrospective action items directly correlated with velocity bumps.',
    status: 'open',
    sectionItemName: 'Website Redesign',
    tags: ['work', 'agile'],
  },
  {
    type: 'insight',
    title: 'Spanish immersion podcasts more effective than textbook',
    content: 'After 4 weeks of daily podcast listening, comprehension improved more than 2 months of textbook study.',
    status: 'open',
    sectionItemName: 'Learn Spanish',
    tags: ['language', 'learning'],
  },
];

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

export async function seedDevData(): Promise<void> {
  if (!import.meta.env.DEV) {
    console.warn('[seed] Refusing to seed outside dev mode');
    return;
  }

  console.log('[seed] Starting dev data seed...');

  // Read current state directly from Dexie (avoids SolidJS reactive-context issues)
  const { db } = await import('../storage/db');

  const existingAtoms = await db.atoms.count();
  if (existingAtoms > 5) {
    console.warn(`[seed] Database already has ${existingAtoms} atoms. Skipping to avoid duplicates.`);
    console.warn('[seed] To re-seed, clear IndexedDB first (Application > Storage > Clear site data)');
    throw new Error(`Database already has ${existingAtoms} atoms — clear data first`);
  }

  // ── Step 1: Create section items (skip any that already exist) ────────
  const existingSectionItems = await db.sectionItems.toArray();
  const existingNames = new Set(existingSectionItems.map((si) => si.name));

  let createdSI = 0;
  for (const si of SECTION_ITEMS) {
    if (existingNames.has(si.name)) {
      console.log(`[seed] Section item "${si.name}" already exists, skipping`);
      continue;
    }
    dispatch({
      type: 'CREATE_SECTION_ITEM',
      payload: { sectionId: si.sectionId, name: si.name },
    });
    createdSI++;
  }
  console.log(`[seed] Dispatched ${createdSI} new section items (${existingNames.size} already existed)`);

  // Wait for worker to process, then read fresh data from Dexie
  await wait(1000);

  // ── Step 2: Resolve section item IDs from Dexie ───────────────────────
  const allSectionItems = await db.sectionItems.toArray();
  const siMap = new Map<string, { id: string; sectionId: string }>();
  for (const item of allSectionItems) {
    siMap.set(item.name, { id: item.id, sectionId: item.sectionId });
  }
  for (const si of SECTION_ITEMS) {
    if (!siMap.has(si.name)) {
      console.error(`[seed] Section item "${si.name}" not found after creation. Available:`, [...siMap.keys()]);
      throw new Error(`Section item "${si.name}" not found`);
    }
  }
  console.log('[seed] All section items resolved');

  // ── Step 3: Create inbox items ────────────────────────────────────────
  for (const inbox of INBOX_ITEMS) {
    dispatch({
      type: 'CREATE_INBOX_ITEM',
      payload: { content: inbox.content, title: inbox.title },
    });
  }
  console.log(`[seed] Dispatched ${INBOX_ITEMS.length} inbox items`);

  // ── Step 4: Create atoms ──────────────────────────────────────────────
  for (const def of ATOMS) {
    const payload: Record<string, unknown> = {
      type: def.type,
      title: def.title,
      content: def.content,
      status: def.status,
      links: [],
      tags: def.tags ?? [],
      source: 'user',
    };

    if (def.sectionItemName) {
      const si = siMap.get(def.sectionItemName);
      if (si) {
        payload.sectionItemId = si.id;
        payload.sectionId = si.sectionId;
      }
    }

    if (def.dueDate != null) payload.dueDate = def.dueDate;
    if (def.eventDate != null) payload.eventDate = def.eventDate;

    dispatch({ type: 'CREATE_ATOM', payload: payload as never });
  }
  console.log(`[seed] Dispatched ${ATOMS.length} atoms`);

  // Wait for worker to process all creations
  await wait(2000);

  // ── Step 5: Add cross-links ───────────────────────────────────────────
  // Read atom IDs from Dexie (reliable, not dependent on reactive store)
  const allAtoms = await db.atoms.toArray();
  const atomIdByTitle = new Map<string, string>();
  for (const a of allAtoms) {
    atomIdByTitle.set(a.title, a.id);
  }
  console.log(`[seed] Found ${allAtoms.length} atoms in DB for linking`);

  for (const def of ATOMS) {
    if (!def.linkTargets?.length) continue;
    const sourceId = atomIdByTitle.get(def.title);
    if (!sourceId) continue;

    const links: AtomLink[] = [];
    for (const targetTitle of def.linkTargets) {
      const targetId = atomIdByTitle.get(targetTitle);
      if (targetId) {
        links.push({ targetId, relationshipType: 'relates-to', direction: 'forward' });
      } else {
        console.warn(`[seed] Link target "${targetTitle}" not found`);
      }
    }
    if (links.length > 0) {
      dispatch({
        type: 'UPDATE_ATOM',
        payload: { id: sourceId, changes: { links } },
      });
    }
  }
  console.log('[seed] Cross-links dispatched');
  await wait(1000);

  // ── Step 6: Backdate timestamps for staleness ─────────────────────────
  // UPDATE_ATOM always sets updated_at = Date.now(), so we bypass it
  // via direct Dexie access for timestamp backdating only.

  let backdated = 0;
  for (const def of ATOMS) {
    if (!def.staleDays) continue;
    const id = atomIdByTitle.get(def.title);
    if (!id) continue;
    const staleTs = daysAgo(def.staleDays);
    await db.atoms.update(id, { created_at: staleTs, updated_at: staleTs });
    backdated++;
  }

  // Backdate stale inbox items
  const allInbox = await db.inbox.toArray();
  const inboxIdByTitle = new Map<string, string>();
  for (const item of allInbox) {
    inboxIdByTitle.set(item.title, item.id);
  }
  for (const def of INBOX_ITEMS) {
    if (!def.staleDays) continue;
    const id = inboxIdByTitle.get(def.title);
    if (!id) continue;
    const staleTs = daysAgo(def.staleDays);
    await db.inbox.update(id, { created_at: staleTs, updated_at: staleTs });
    backdated++;
  }
  console.log(`[seed] Backdated ${backdated} items`);

  // ── Step 7: Trigger recomputation so worker picks up backdated data ───
  dispatch({ type: 'RECOMPUTE_SCORES' });
  await wait(500);

  // ── Summary ───────────────────────────────────────────────────────────
  const staleAtomCount = ATOMS.filter((a) => a.staleDays).length;
  const linkedAtomCount = ATOMS.filter((a) => a.linkTargets?.length).length;
  const compressionCount = ATOMS.filter((a) => a.staleDays && !a.linkTargets?.length).length;

  console.log('[seed] Dev data seed complete!');
  console.log('[seed] Summary:');
  console.log(`  ${SECTION_ITEMS.length} section items (3 projects, 3 areas)`);
  console.log(`  ${INBOX_ITEMS.length} inbox items`);
  console.log(`  ${ATOMS.length} atoms`);
  console.log(`  ${staleAtomCount} stale atoms, ${linkedAtomCount} with cross-links`);
  console.log(`  ${compressionCount} compression candidates (stale + no links)`);
  console.log('[seed] Test conditions:');
  console.log('  - Compression candidates: stale items with no cross-links');
  console.log('  - Project without next action: "Learn Spanish"');
  console.log('  - Area gap: "Community Involvement" (zero atoms)');
  console.log('  - Inbox items ready for Get Clear phase');
}
