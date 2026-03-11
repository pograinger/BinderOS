/**
 * Dependency injection shim for harness execution.
 *
 * Exports the same function signatures as src/storage/entity-helpers.ts
 * and the db.entityRelations interface used by keyword-patterns.ts and
 * cooccurrence-tracker.ts — but backed by a HarnessEntityStore instance.
 *
 * Usage: import from this file in harness-pipeline.ts, then call
 * setActiveStore(store) before running atoms.
 *
 * Phase 28: HARN-01, HARN-02
 */

import type { Entity, EntityRelation } from '../../src/types/intelligence.js';
import { HarnessEntityStore } from './harness-entity-store.js';

// ---------------------------------------------------------------------------
// Active store (set by harness before each run)
// ---------------------------------------------------------------------------

let _store: HarnessEntityStore | null = null;

export function setActiveStore(store: HarnessEntityStore): void {
  _store = store;
}

function store(): HarnessEntityStore {
  if (!_store) throw new Error('[mock-db] No active store. Call setActiveStore() first.');
  return _store;
}

// ---------------------------------------------------------------------------
// entity-helpers.ts equivalents
// ---------------------------------------------------------------------------

export async function findOrCreateEntity(
  text: string,
  type: 'PER' | 'LOC' | 'ORG',
): Promise<string> {
  return Promise.resolve(store().findOrCreateEntity(text, type));
}

export async function createRelation(relation: Omit<EntityRelation, 'id'>): Promise<string> {
  return Promise.resolve(store().createRelation(relation));
}

// ---------------------------------------------------------------------------
// db.entityRelations mock — matches the Dexie table interface used by
// keyword-patterns.ts (upsertKeywordRelation) and
// cooccurrence-tracker.ts (flushCooccurrenceToDexie).
//
// Only the subset actually used by those modules is implemented.
// ---------------------------------------------------------------------------

type FilterFn = (r: EntityRelation) => boolean;

class WhereClause {
  private _index: string;
  private _value: unknown;
  private _filterFn: FilterFn | null = null;

  constructor(index: string) {
    this._index = index;
    this._value = undefined;
  }

  equals(value: unknown): this {
    this._value = value;
    return this;
  }

  filter(fn: FilterFn): this {
    this._filterFn = fn;
    return this;
  }

  async first(): Promise<EntityRelation | undefined> {
    return this.toArray().then((arr) => arr[0]);
  }

  async toArray(): Promise<EntityRelation[]> {
    const s = store();
    let results = Array.from(s.entityRelations.values());

    // Handle compound index '[sourceEntityId+targetEntityId]'
    if (this._index === '[sourceEntityId+targetEntityId]') {
      const [sourceId, targetId] = this._value as [string, string];
      results = results.filter(
        (r) => r.sourceEntityId === sourceId && r.targetEntityId === targetId,
      );
    } else if (this._index === 'sourceAttribution') {
      results = results.filter((r) => r.sourceAttribution === this._value);
    }

    if (this._filterFn) {
      results = results.filter(this._filterFn);
    }

    return results;
  }
}

export const mockEntityRelations = {
  where(index: string): WhereClause {
    return new WhereClause(index);
  },

  async update(id: string, patch: Partial<EntityRelation>): Promise<number> {
    const s = store();
    const existing = s.getRelation(id);
    if (!existing) return 0;
    s.updateRelation(id, patch);
    return 1;
  },

  async put(record: EntityRelation): Promise<string> {
    store().entityRelations.set(record.id, record);
    return record.id;
  },
};

// ---------------------------------------------------------------------------
// Entity table mock (for findOrCreateEntity db calls)
// ---------------------------------------------------------------------------

export const mockEntities = {
  async where(index: string): Promise<Entity[]> {
    return store().getEntities();
  },

  async update(id: string, patch: Partial<Entity>): Promise<number> {
    const s = store();
    const existing = s.getEntity(id);
    if (!existing) return 0;
    s.updateEntity(id, patch);
    return 1;
  },

  async put(record: Entity): Promise<string> {
    store().entities.set(record.id, record);
    return record.id;
  },
};
