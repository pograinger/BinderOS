/**
 * Tests for the v10 Dexie migration.
 * Verifies that the three new tables are created with correct index specs
 * and that the migration follows the established v9 pattern.
 */
import { describe, it, expect } from 'vitest';
import { applyV10Migration } from '../migrations/v10';

describe('applyV10Migration', () => {
  it('is a function with the correct signature', () => {
    expect(typeof applyV10Migration).toBe('function');
  });

  it('calls db.version(10).stores() with the three new tables', () => {
    // Track calls made to the mock db
    let versionCalled = false;
    let storesCalled = false;
    let storesArg: Record<string, string> | null = null;

    const mockDb = {
      version: (v: number) => {
        expect(v).toBe(10);
        versionCalled = true;
        return {
          stores: (arg: Record<string, string>) => {
            storesCalled = true;
            storesArg = arg;
            return { upgrade: () => {} };
          },
        };
      },
    };

    applyV10Migration(mockDb as never);

    expect(versionCalled).toBe(true);
    expect(storesCalled).toBe(true);
    expect(storesArg).not.toBeNull();
  });

  it('registers gateActivationLog with compound indexes', () => {
    let storesArg: Record<string, string> = {};

    const mockDb = {
      version: (_v: number) => ({
        stores: (arg: Record<string, string>) => {
          storesArg = arg;
          return { upgrade: () => {} };
        },
      }),
    };

    applyV10Migration(mockDb as never);

    expect(storesArg['gateActivationLog']).toBeDefined();
    const spec = storesArg['gateActivationLog'];
    // Must include unique id, compound indexes, and timestamp
    expect(spec).toContain('&id');
    expect(spec).toContain('[predicateName+timestamp]');
    expect(spec).toContain('[atomId+timestamp]');
    expect(spec).toContain('timestamp');
  });

  it('registers sequenceContext with binderId as primary key', () => {
    let storesArg: Record<string, string> = {};

    const mockDb = {
      version: (_v: number) => ({
        stores: (arg: Record<string, string>) => {
          storesArg = arg;
          return { upgrade: () => {} };
        },
      }),
    };

    applyV10Migration(mockDb as never);

    expect(storesArg['sequenceContext']).toBeDefined();
    const spec = storesArg['sequenceContext'];
    expect(spec).toContain('&binderId');
    expect(spec).toContain('lastUpdated');
  });

  it('registers binderTypeConfig with slug as primary key', () => {
    let storesArg: Record<string, string> = {};

    const mockDb = {
      version: (_v: number) => ({
        stores: (arg: Record<string, string>) => {
          storesArg = arg;
          return { upgrade: () => {} };
        },
      }),
    };

    applyV10Migration(mockDb as never);

    expect(storesArg['binderTypeConfig']).toBeDefined();
    const spec = storesArg['binderTypeConfig'];
    expect(spec).toContain('&slug');
    expect(spec).toContain('updatedAt');
  });

  it('does not modify existing tables (additive-only migration)', () => {
    let storesArg: Record<string, string> = {};

    const mockDb = {
      version: (_v: number) => ({
        stores: (arg: Record<string, string>) => {
          storesArg = arg;
          return { upgrade: () => {} };
        },
      }),
    };

    applyV10Migration(mockDb as never);

    // Should only have the 3 new tables — no existing table redefinitions
    const tableNames = Object.keys(storesArg);
    expect(tableNames).toHaveLength(3);
    expect(tableNames).toContain('gateActivationLog');
    expect(tableNames).toContain('sequenceContext');
    expect(tableNames).toContain('binderTypeConfig');

    // Existing tables must NOT appear
    expect(tableNames).not.toContain('atoms');
    expect(tableNames).not.toContain('atomIntelligence');
    expect(tableNames).not.toContain('entities');
    expect(tableNames).not.toContain('entityRelations');
  });
});
