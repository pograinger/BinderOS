/**
 * Dexie database instance with all tables and indexes.
 *
 * BinderDB is the single IndexedDB database for the application.
 * All tables, indexes, and schema versions are defined here.
 * Never mutate an existing version definition — always increment.
 *
 * The `*links` multi-entry index on atoms enables link traversal
 * queries without loading all atoms into memory (RESEARCH.md Pitfall 6).
 *
 * Phase 3 additions:
 * - v2 migration adds *tags and context indexes on atoms
 * - savedFilters table for persisted filter configs (NAV-07)
 * - interactions table for interaction event logging
 *
 * Singleton `db` is exported for use throughout the storage layer.
 * CRITICAL: UI components must NEVER import db directly — all writes
 * go through the Worker -> WriteQueue -> Dexie pipeline.
 */

import Dexie, { type Table } from 'dexie';
import type { Atom, InboxItem } from '../types/atoms';
import type { MutationLogEntry } from '../types/changelog';
import type { Section, SectionItem } from '../types/sections';
import { getDefaultSections } from './migrations/v1';
import { applyV2Migration } from './migrations/v2';
import { applyV3Migration } from './migrations/v3';

export interface ConfigEntry {
  key: string;
  value: unknown;
}

/**
 * Filter configuration saved by the user.
 * Used in savedFilters table and as the payload for SAVE_FILTER command.
 */
export interface FilterConfig {
  types?: string[];
  statuses?: string[];
  tags?: string[];
  context?: string | null;
  dateRange?: { from: number; to: number } | null;
  sectionId?: string | null;
  priorityTiers?: string[];
  sortBy?: 'date' | 'priority' | 'updated' | 'staleness';
  sortOrder?: 'asc' | 'desc';
}

/**
 * A saved filter definition — user-named filter preset stored in Dexie.
 */
export interface SavedFilter {
  id: string;
  name: string;
  filter: FilterConfig;
}

/**
 * An interaction event — logs search queries, filter changes, and atom clicks.
 * Used for analytics and future personalization features.
 */
export interface InteractionEvent {
  id: string;
  type: 'search' | 'filter' | 'click';
  query?: string;
  atomId?: string;
  filters?: Record<string, unknown>;
  ts: number;
}

export class BinderDB extends Dexie {
  atoms!: Table<Atom, string>;
  inbox!: Table<InboxItem, string>;
  changelog!: Table<MutationLogEntry, string>;
  sections!: Table<Section, string>;
  sectionItems!: Table<SectionItem, string>;
  config!: Table<ConfigEntry, string>;
  // Phase 3 tables
  savedFilters!: Table<SavedFilter, string>;
  interactions!: Table<InteractionEvent, string>;

  constructor() {
    super('BinderOS');

    this.version(1).stores({
      atoms:        '&id, type, status, sectionId, sectionItemId, updated_at, *links',
      inbox:        '&id, created_at',
      changelog:    '&id, atomId, timestamp, lamportClock',
      sections:     '&id, type',
      sectionItems: '&id, sectionId, name, archived',
      config:       '&key',
    });

    // Phase 3: v2 migration — tags, context, savedFilters, interactions
    applyV2Migration(this);

    // Phase 5: v3 migration — aiSourced index on atoms
    applyV3Migration(this);

    // Seed the four stable sections on first database creation
    this.on('populate', (tx) => {
      const sections = getDefaultSections();
      for (const section of sections) {
        void tx.table('sections').add(section);
      }
    });
  }
}

export const db = new BinderDB();
