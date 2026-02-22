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
 * Singleton `db` is exported for use throughout the storage layer.
 * CRITICAL: UI components must NEVER import db directly — all writes
 * go through the Worker -> WriteQueue -> Dexie pipeline.
 */

import Dexie, { type Table } from 'dexie';
import type { Atom, InboxItem } from '../types/atoms';
import type { MutationLogEntry } from '../types/changelog';
import type { Section, SectionItem } from '../types/sections';
import { getDefaultSections } from './migrations/v1';

export interface ConfigEntry {
  key: string;
  value: unknown;
}

export class BinderDB extends Dexie {
  atoms!: Table<Atom, string>;
  inbox!: Table<InboxItem, string>;
  changelog!: Table<MutationLogEntry, string>;
  sections!: Table<Section, string>;
  sectionItems!: Table<SectionItem, string>;
  config!: Table<ConfigEntry, string>;

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
