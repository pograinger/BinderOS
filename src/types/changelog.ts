/**
 * Mutation log entry types with Zod schemas.
 *
 * CRDT-compatible change log from day one (CONTEXT.md decision).
 * Each entry stores full before/after snapshots for undo and conflict resolution.
 * lamportClock + deviceId enable causal ordering for future sync.
 */

import { z } from 'zod/v4';
import { AtomSchema } from './atoms';

// --- Mutation operation enum ---

export const MutationOperation = z.enum([
  'create',
  'update',
  'delete',
  'archive',
  'link',
  'unlink',
]);
export type MutationOperation = z.infer<typeof MutationOperation>;

// --- Mutation log entry schema ---

export const MutationLogEntrySchema = z.object({
  id: z.string().uuid(),
  atomId: z.string(),
  operation: MutationOperation,
  before: AtomSchema.nullable(), // Full snapshot before mutation; null for create
  after: AtomSchema.nullable(),  // Full snapshot after mutation; null for delete
  timestamp: z.number(),         // Unix ms — causal ordering
  lamportClock: z.number(),      // Monotonic device counter
  deviceId: z.string(),          // UUID from localStorage — CRDT device identity
  // Phase 5: AI-sourced mutations tagged
  source: z.enum(['user', 'ai']).optional(),
  // Phase 5: links back to the AI request that triggered this
  aiRequestId: z.string().optional(),
});
export type MutationLogEntry = z.infer<typeof MutationLogEntrySchema>;
