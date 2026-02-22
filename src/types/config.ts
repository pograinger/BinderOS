/**
 * Scoring and configuration types for the Phase 2 compute engine.
 *
 * These types mirror the Rust WASM output structs exactly.
 * PriorityTier and EnergyLevel enums use camelCase serialization
 * matching Rust serde rename_all = "camelCase" on enum variants.
 */

import { z } from 'zod/v4';

// --- Enums ---

export type PriorityTier = 'Critical' | 'High' | 'Medium' | 'Low' | 'Someday';
export type EnergyLevel = 'Quick' | 'Medium' | 'Deep';

// --- Atom scoring output ---

export interface AtomScore {
  staleness: number;
  priorityTier: PriorityTier | null;
  priorityScore: number;
  energy: EnergyLevel;
  opacity: number;
}

// --- Entropy health score ---

export interface EntropyScore {
  score: number;
  level: 'green' | 'yellow' | 'red';
  openTasks: number;
  staleCount: number;
  zeroLinkCount: number;
  inboxCount: number;
}

// --- Compression candidate ---

export interface CompressionCandidate {
  id: string;
  reason: string;
  staleness: number;
}

// --- Cap configuration ---

export const CAP_CONFIG_KEY = 'cap-config';

export const CapConfigSchema = z.object({
  inboxCap: z.number().int().min(10).max(30),
  taskCap: z.number().int().min(15).max(50),
});

export type CapConfig = z.infer<typeof CapConfigSchema>;

export const DEFAULT_CAP_CONFIG: CapConfig = {
  inboxCap: 20,
  taskCap: 30,
};
