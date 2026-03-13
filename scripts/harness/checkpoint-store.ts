/**
 * Checkpoint persistence for adversarial cycle resume capability.
 *
 * Saves per-persona-cycle checkpoints so that a failed run can be
 * resumed without reprocessing completed cycles.
 *
 * Paths:
 *   scripts/harness/personas/{name}/graphs/cycle_{N}.json   — per-cycle
 *   scripts/harness/experiments/{name}/state.json           — experiment-level
 *
 * Phase 29: TVAL-01
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Entity, EntityRelation, AtomIntelligence } from '../../src/types/intelligence.js';
import type { CycleState, PersonaAdversarialResult, ComponentAttributionSerialized } from './harness-types.js';
import { serializeAttribution, deserializeAttribution } from './harness-types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PERSONAS_DIR = path.join(__dirname, 'personas');
const EXPERIMENTS_DIR = path.join(__dirname, 'experiments');

// ---------------------------------------------------------------------------
// Store snapshot type (serializable)
// ---------------------------------------------------------------------------

export interface StoreSnapshot {
  entities: Entity[];
  relations: EntityRelation[];
  atomIntelligence: AtomIntelligence[];
}

// ---------------------------------------------------------------------------
// Per-cycle checkpoint
// ---------------------------------------------------------------------------

interface CycleCheckpointData {
  personaName: string;
  cycleNumber: number;
  savedAt: string;
  storeSnapshot: StoreSnapshot;
  cycleState: {
    personaName: string;
    cycleNumber: number;
    score: unknown;
    gaps: unknown[];
    enrichmentEmulations: unknown[];
    corrections: unknown[];
    attribution: ComponentAttributionSerialized;
    durationMs: number;
    syntheticStartTimestamp: string;
    graphDiff: unknown;
    graphSnapshot: unknown;
    // corpus excluded for size — can be regenerated
    /** EII snapshot stored as 4 numbers — full consensusResults[] excluded for size (Research pitfall 5) */
    cycleEII?: { coherence: number; stability: number; impact: number; eii: number };
  };
}

export interface LoadedCheckpoint {
  storeSnapshot: StoreSnapshot;
  cycleState: CycleState;
}

function getCycleCheckpointPath(personaName: string, cycleNumber: number): string {
  return path.join(PERSONAS_DIR, personaName, 'graphs', `cycle_${cycleNumber}.json`);
}

/**
 * Save a completed cycle checkpoint.
 * Stores full entity store state + cycle metadata for resume.
 */
export function saveCheckpoint(
  personaName: string,
  cycleNumber: number,
  storeSnapshot: StoreSnapshot,
  cycleState: CycleState,
): void {
  const checkpointPath = getCycleCheckpointPath(personaName, cycleNumber);
  const dir = path.dirname(checkpointPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const data: CycleCheckpointData = {
    personaName,
    cycleNumber,
    savedAt: new Date().toISOString(),
    storeSnapshot,
    cycleState: {
      personaName: cycleState.personaName,
      cycleNumber: cycleState.cycleNumber,
      score: cycleState.score,
      gaps: cycleState.gaps,
      enrichmentEmulations: cycleState.enrichmentEmulations,
      corrections: cycleState.corrections,
      attribution: serializeAttribution(cycleState.attribution),
      durationMs: cycleState.durationMs,
      syntheticStartTimestamp: cycleState.syntheticStartTimestamp,
      graphDiff: cycleState.graphDiff,
      graphSnapshot: cycleState.graphSnapshot,
      // Store cycleEII (4 numbers) but NOT full consensusResults[] — avoids checkpoint bloat
      cycleEII: cycleState.cycleEII
        ? {
            coherence: cycleState.cycleEII.coherence,
            stability: cycleState.cycleEII.stability,
            impact: cycleState.cycleEII.impact,
            eii: cycleState.cycleEII.eii,
          }
        : undefined,
    },
  };

  fs.writeFileSync(checkpointPath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`  [checkpoint] Saved cycle ${cycleNumber} for ${personaName} → ${checkpointPath}`);
}

/**
 * Load a cycle checkpoint, or return null if not found.
 */
export function loadCheckpoint(
  personaName: string,
  cycleNumber: number,
): LoadedCheckpoint | null {
  const checkpointPath = getCycleCheckpointPath(personaName, cycleNumber);
  if (!fs.existsSync(checkpointPath)) return null;

  try {
    const raw = JSON.parse(fs.readFileSync(checkpointPath, 'utf-8')) as CycleCheckpointData;

    // Reconstruct CycleState (corpus not stored — caller must regenerate or skip)
    const cycleState: CycleState = {
      personaName: raw.cycleState.personaName,
      cycleNumber: raw.cycleState.cycleNumber,
      corpus: [], // not persisted — too large
      score: raw.cycleState.score as CycleState['score'],
      gaps: raw.cycleState.gaps as CycleState['gaps'],
      enrichmentEmulations: raw.cycleState.enrichmentEmulations as CycleState['enrichmentEmulations'],
      corrections: raw.cycleState.corrections as CycleState['corrections'],
      attribution: deserializeAttribution(raw.cycleState.attribution),
      durationMs: raw.cycleState.durationMs,
      syntheticStartTimestamp: raw.cycleState.syntheticStartTimestamp,
      graphDiff: raw.cycleState.graphDiff as CycleState['graphDiff'],
      graphSnapshot: raw.cycleState.graphSnapshot as CycleState['graphSnapshot'],
    };

    return { storeSnapshot: raw.storeSnapshot, cycleState };
  } catch (err) {
    console.warn(`  [checkpoint] Failed to load cycle ${cycleNumber} for ${personaName}: ${err}`);
    return null;
  }
}

/**
 * Find the latest completed cycle for a persona (for resume logic).
 * Returns 0 if no checkpoints exist.
 */
export function findLastCompletedCycle(personaName: string): number {
  for (let cycle = 5; cycle >= 1; cycle--) {
    const checkpointPath = getCycleCheckpointPath(personaName, cycle);
    if (fs.existsSync(checkpointPath)) return cycle;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Experiment-level state
// ---------------------------------------------------------------------------

interface ExperimentStateData {
  experimentName: string;
  startedAt: string;
  updatedAt: string;
  completedPersonas: string[];
  partialResults: Array<{
    personaDirName: string;
    personaName: string;
    completedCycles: number;
    finalScore?: unknown;
    totalDurationMs?: number;
  }>;
}

function getExperimentStatePath(experimentName: string): string {
  return path.join(EXPERIMENTS_DIR, experimentName, 'state.json');
}

/**
 * Save (or update) experiment-level state.
 * Call after each persona completes to enable resume.
 */
export function saveExperimentState(
  experimentName: string,
  personaResults: Array<{
    personaDirName: string;
    personaName: string;
    result: PersonaAdversarialResult | null;
    completedCycles: number;
  }>,
): void {
  const statePath = getExperimentStatePath(experimentName);
  const dir = path.dirname(statePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Load existing state if present
  let existing: ExperimentStateData | null = null;
  if (fs.existsSync(statePath)) {
    try {
      existing = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as ExperimentStateData;
    } catch {
      // ignore corrupt state
    }
  }

  const completedPersonas: string[] = [];
  const partialResults: ExperimentStateData['partialResults'] = [];

  for (const pr of personaResults) {
    if (pr.result) {
      completedPersonas.push(pr.personaDirName);
      partialResults.push({
        personaDirName: pr.personaDirName,
        personaName: pr.personaName,
        completedCycles: pr.result.cycles.length,
        finalScore: pr.result.finalScore,
        totalDurationMs: pr.result.totalDurationMs,
      });
    } else if (pr.completedCycles > 0) {
      partialResults.push({
        personaDirName: pr.personaDirName,
        personaName: pr.personaName,
        completedCycles: pr.completedCycles,
      });
    }
  }

  const stateData: ExperimentStateData = {
    experimentName,
    startedAt: existing?.startedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedPersonas,
    partialResults,
  };

  fs.writeFileSync(statePath, JSON.stringify(stateData, null, 2), 'utf-8');
}

/**
 * Load experiment state for resume logic.
 * Returns null if no experiment state exists.
 */
export function loadExperimentState(experimentName: string): {
  completedPersonas: string[];
  partialCycles: Record<string, number>; // personaDirName → last completed cycle
} | null {
  const statePath = getExperimentStatePath(experimentName);
  if (!fs.existsSync(statePath)) return null;

  try {
    const raw = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as ExperimentStateData;
    const partialCycles: Record<string, number> = {};
    for (const pr of raw.partialResults) {
      partialCycles[pr.personaDirName] = pr.completedCycles;
    }
    return {
      completedPersonas: raw.completedPersonas,
      partialCycles,
    };
  } catch {
    return null;
  }
}
