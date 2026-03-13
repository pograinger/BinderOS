/**
 * Main entry point for the multi-cycle adversarial training loop.
 *
 * Runs 5 adversarial cycles per persona, with gap-targeted corpus
 * generation, enrichment emulation, corrections, and aggregate reporting.
 * After all personas complete: runs ablation suite, auto-tunes patterns,
 * and generates the investment report.
 *
 * Usage:
 *   npx tsx scripts/harness/run-adversarial.ts --dry-run --personas all
 *   npx tsx scripts/harness/run-adversarial.ts --personas alex-jordan,dev-kumar --cycles 5
 *   npx tsx scripts/harness/run-adversarial.ts --personas all --resume --experiment my-run
 *   npx tsx scripts/harness/run-adversarial.ts --generate-personas --dry-run
 *   npx tsx scripts/harness/run-adversarial.ts --personas all --skip-ablation
 *   npx tsx scripts/harness/run-adversarial.ts --personas all --skip-report
 *
 * Flags:
 *   --personas <names>      Comma-separated persona names, or 'all'
 *   --cycles <n>            Number of cycles per persona (default: 5)
 *   --experiment <name>     Experiment name (auto-generated if omitted)
 *   --resume                Resume from last checkpoint
 *   --delay-ms <n>          Throttle between API calls (default: 100)
 *   --dry-run               Validate personas, print run plan, exit
 *   --generate-personas     Generate all 9 new personas before running
 *   --skip-ablation         Skip ablation suite after persona runs (faster)
 *   --skip-report           Skip investment report generation
 *
 * CI exit codes:
 *   0 — all personas achieved >= 80% relationship F1 after final cycle
 *   1 — one or more personas below threshold
 *
 * Phase 29: TVAL-01
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { HarnessEntityStore } from './harness-entity-store.js';
import { resetHarnessCooccurrence } from './harness-inference.js';
import { runAdversarialCycle } from './adversarial-cycle.js';
import type { PersonaConfig } from './adversarial-cycle.js';
import {
  loadCheckpoint,
  findLastCompletedCycle,
  saveExperimentState,
  loadExperimentState,
} from './checkpoint-store.js';
import { computeAggregateScore, computeLearningCurve } from './score-graph.js';
import { writeExperimentReport } from './write-reports.js';
import type { EIIReportData } from './write-reports.js';
import { runFullAblationSuite, runSpecialistAblation } from './ablation-engine.js';
import { autoTunePatterns } from './auto-tune-patterns.js';
import { generateInvestmentReport } from './generate-investment-report.js';
import type {
  PersonaAdversarialResult,
  ExperimentResult,
  CycleState,
  RelationshipGap,
  GraphSnapshot,
} from './harness-types.js';
import type { GroundTruth, GraphScore } from './score-graph.js';
import { loadSpecialistSessions } from './harness-onnx.js';
import type { HarnessONNXSessions } from './harness-onnx.js';
import { runHarnessConsensus, deriveRiskLabels, computeHarnessImpact } from './harness-consensus.js';
import { computeEII } from '../../src/ai/eii/index.js';
import type { ConsensusResult } from '../../src/ai/consensus/types.js';
import type { CorpusItem } from './generate-corpus.js';
import {
  TASK_DIMENSION_NAMES,
  PERSON_DIMENSION_NAMES,
  CALENDAR_DIMENSION_NAMES,
  TASK_VECTOR_DIM,
  PERSON_VECTOR_DIM,
  CALENDAR_VECTOR_DIM,
} from '../../src/ai/feature-vectors/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PERSONAS_DIR = path.join(__dirname, 'personas');
const EXPERIMENTS_DIR = path.join(__dirname, 'experiments');

// ---------------------------------------------------------------------------
// Total canonical vector dimension (task + person + calendar)
// ---------------------------------------------------------------------------

const FULL_VECTOR_DIM = TASK_VECTOR_DIM + PERSON_VECTOR_DIM + CALENDAR_VECTOR_DIM;

// ---------------------------------------------------------------------------
// buildMinimalVector — construct 84-dim vector from corpus metadata
// ---------------------------------------------------------------------------

/**
 * Build an 84-dim canonical flat vector from CorpusItem metadata.
 *
 * Uses Claude's Discretion (per plan): construct the simplest representation
 * that produces correct specialist feature slices. Missing metadata fields
 * default to 0 (neutral/unknown state). Person and calendar dims are zero-padded
 * when no person/calendar data is available in the corpus item.
 *
 * Vector layout: [task(0-26) | person(27-49) | calendar(50-83)]
 *
 * @param item - CorpusItem with optional metadata from adversarial corpus
 */
function buildMinimalVector(item: CorpusItem): number[] {
  const vector = new Array<number>(FULL_VECTOR_DIM).fill(0);
  const meta = (item as CorpusItem & { metadata?: Record<string, unknown> }).metadata;

  if (!meta) return vector;

  const now = Date.now();

  // --- Task dims (indices 0-26) ---

  // age_norm: normalize atom age to [0, 1] using 90 days as "old"
  const createdAtStr = meta['createdAt'] as string | undefined;
  const createdAt = createdAtStr ? new Date(createdAtStr).getTime() : now;
  const ageMs = now - createdAt;
  const AGE_NORM_IDX = TASK_DIMENSION_NAMES.indexOf('age_norm');
  if (AGE_NORM_IDX >= 0) vector[AGE_NORM_IDX] = Math.min(1, ageMs / (90 * 24 * 60 * 60 * 1000));

  // staleness_norm: use age as a proxy
  const STALENESS_NORM_IDX = TASK_DIMENSION_NAMES.indexOf('staleness_norm');
  if (STALENESS_NORM_IDX >= 0) vector[STALENESS_NORM_IDX] = Math.min(1, ageMs / (90 * 24 * 60 * 60 * 1000));

  // has_deadline
  const deadlineStr = (meta['deadline'] ?? meta['dueDate']) as string | undefined;
  const HAS_DEADLINE_IDX = TASK_DIMENSION_NAMES.indexOf('has_deadline');
  if (deadlineStr && HAS_DEADLINE_IDX >= 0) {
    const deadlineMs = new Date(deadlineStr).getTime();
    if (!isNaN(deadlineMs)) {
      vector[HAS_DEADLINE_IDX] = 1;

      // days_to_deadline_norm: days remaining, normalized to [0,1] using 30 days
      const daysToDeadline = (deadlineMs - now) / (24 * 60 * 60 * 1000);
      const DAYS_NORM_IDX = TASK_DIMENSION_NAMES.indexOf('days_to_deadline_norm');
      if (DAYS_NORM_IDX >= 0) {
        vector[DAYS_NORM_IDX] = Math.max(0, Math.min(1, daysToDeadline / 30));
      }

      // time_pressure_score: sigmoid centered at 7 days
      const TIME_PRESSURE_IDX = TASK_DIMENSION_NAMES.indexOf('time_pressure_score');
      if (TIME_PRESSURE_IDX >= 0) {
        vector[TIME_PRESSURE_IDX] = 1.0 / (1.0 + Math.exp(0.3 * (daysToDeadline - 7)));
      }
    }
  }

  // status dims
  const status = meta['status'] as string | undefined;
  const STATUS_OPEN_IDX = TASK_DIMENSION_NAMES.indexOf('status_open');
  const STATUS_DONE_IDX = TASK_DIMENSION_NAMES.indexOf('status_done');
  const STATUS_DROPPED_IDX = TASK_DIMENSION_NAMES.indexOf('status_dropped');
  if (status === 'done' && STATUS_DONE_IDX >= 0) vector[STATUS_DONE_IDX] = 1;
  else if (status === 'dropped' && STATUS_DROPPED_IDX >= 0) vector[STATUS_DROPPED_IDX] = 1;
  else if (STATUS_OPEN_IDX >= 0) vector[STATUS_OPEN_IDX] = 1; // default: open

  // is_waiting_for
  const IS_WAITING_IDX = TASK_DIMENSION_NAMES.indexOf('is_waiting_for');
  if (IS_WAITING_IDX >= 0 && (meta['waitingFor'] || status === 'waiting')) {
    vector[IS_WAITING_IDX] = 1;
  }

  // has_person_dep (proxy: has expectedRelationships mentioning a person)
  const HAS_PERSON_DEP_IDX = TASK_DIMENSION_NAMES.indexOf('has_person_dep');
  if (HAS_PERSON_DEP_IDX >= 0 && item.expectedRelationships.length > 0) {
    vector[HAS_PERSON_DEP_IDX] = 1;
  }

  // has_project
  const HAS_PROJECT_IDX = TASK_DIMENSION_NAMES.indexOf('has_project');
  if (HAS_PROJECT_IDX >= 0 && meta['project']) {
    vector[HAS_PROJECT_IDX] = 1;
  }

  // energy dims
  const energy = meta['energy'] as string | undefined;
  const ENERGY_LOW_IDX = TASK_DIMENSION_NAMES.indexOf('energy_low');
  const ENERGY_MED_IDX = TASK_DIMENSION_NAMES.indexOf('energy_medium');
  const ENERGY_HIGH_IDX = TASK_DIMENSION_NAMES.indexOf('energy_high');
  if (energy === 'low' && ENERGY_LOW_IDX >= 0) vector[ENERGY_LOW_IDX] = 1;
  else if (energy === 'high' && ENERGY_HIGH_IDX >= 0) vector[ENERGY_HIGH_IDX] = 1;
  else if (ENERGY_MED_IDX >= 0) vector[ENERGY_MED_IDX] = 1; // default: medium

  // ctx_anywhere default (harness items don't have specific context)
  const CTX_ANYWHERE_IDX = TASK_DIMENSION_NAMES.indexOf('ctx_anywhere');
  if (CTX_ANYWHERE_IDX >= 0) vector[CTX_ANYWHERE_IDX] = 1;

  // entity_resp_unknown (default: unknown response time)
  const ENTITY_RESP_UNKNOWN_IDX = TASK_DIMENSION_NAMES.indexOf('entity_resp_unknown');
  if (ENTITY_RESP_UNKNOWN_IDX >= 0) vector[ENTITY_RESP_UNKNOWN_IDX] = 1;

  // Person dims (27-49): zero-padded — harness corpus doesn't model individual persons
  // Calendar dims (50-83): zero-padded — harness corpus doesn't have calendar context

  return vector;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PASS_THRESHOLD = 0.80; // 80% relationship F1 = CI pass

const NEW_ARCHETYPES = [
  'margaret-chen',
  'james-okafor',
  'priya-nair',
  'tyler-kowalski',
  'sunita-patel',
  'rafael-moreno',
  'anna-liu',
  'sam-park',
  'olivia-hassan',
];

// ---------------------------------------------------------------------------
// Persona loading
// ---------------------------------------------------------------------------

interface PersonaData {
  dirName: string;
  syntheticUser: {
    personaName: string;
    bio: string;
    groundTruth: GroundTruth;
  };
}

function listAllPersonas(): string[] {
  if (!fs.existsSync(PERSONAS_DIR)) return [];
  return fs.readdirSync(PERSONAS_DIR).filter((d) => {
    const dir = path.join(PERSONAS_DIR, d);
    return (
      fs.statSync(dir).isDirectory() &&
      fs.existsSync(path.join(dir, 'synthetic-user.json'))
    );
  });
}

function loadPersonaData(personaDirName: string): PersonaData | null {
  const syntheticUserPath = path.join(PERSONAS_DIR, personaDirName, 'synthetic-user.json');
  if (!fs.existsSync(syntheticUserPath)) {
    console.error(`  MISSING: ${personaDirName}/synthetic-user.json`);
    return null;
  }

  try {
    const syntheticUser = JSON.parse(
      fs.readFileSync(syntheticUserPath, 'utf-8'),
    ) as PersonaData['syntheticUser'];
    return { dirName: personaDirName, syntheticUser };
  } catch (err) {
    console.error(`  ERROR loading ${personaDirName}: ${err}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Persona generation
// ---------------------------------------------------------------------------

async function generateMissingPersonas(apiKey: string, isDryRun: boolean): Promise<void> {
  console.log('[run-adversarial] Checking for missing personas...');

  const generateScriptPath = path.join(__dirname, 'generate-persona.ts');

  for (const archetype of NEW_ARCHETYPES) {
    const outputPath = path.join(PERSONAS_DIR, archetype, 'synthetic-user.json');
    if (fs.existsSync(outputPath)) {
      console.log(`  SKIP: ${archetype} (already exists)`);
      continue;
    }

    if (isDryRun) {
      console.log(`  WOULD GENERATE: ${archetype}`);
      continue;
    }

    console.log(`  Generating: ${archetype}...`);
    const complexity = ['priya-nair', 'sunita-patel', 'margaret-chen', 'olivia-hassan'].includes(archetype)
      ? 'high'
      : ['james-okafor'].includes(archetype)
        ? 'low'
        : 'medium';

    try {
      execSync(
        `npx tsx "${generateScriptPath}" --archetype ${archetype} --complexity ${complexity}`,
        {
          env: { ...process.env, ANTHROPIC_API_KEY: apiKey },
          stdio: 'inherit',
        },
      );
    } catch (err) {
      console.error(`  ERROR generating ${archetype}: ${err}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Dry-run mode
// ---------------------------------------------------------------------------

function dryRun(personas: PersonaData[], cycleCount: number): void {
  console.log('[run-adversarial] DRY-RUN MODE');
  console.log('');
  console.log(`Personas found: ${personas.length}`);
  console.log('');

  let totalAtoms = 0;
  let totalEnrichmentCalls = 0;

  for (const p of personas) {
    const relCount = p.syntheticUser.groundTruth.relationships.length;
    const estAtoms = 35 * cycleCount;
    const estEnrichment = estAtoms; // 1 enrichment per atom
    totalAtoms += estAtoms;
    totalEnrichmentCalls += estEnrichment;

    console.log(
      `  ${p.dirName.padEnd(20)} | ${p.syntheticUser.personaName.padEnd(20)} | ${relCount} GT rels | ~${estAtoms} atoms`,
    );
  }

  console.log('');
  console.log(`Total cycles: ${personas.length * cycleCount}`);
  console.log(`Estimated atoms: ~${totalAtoms}`);
  console.log(`Estimated Haiku calls (enrichment): ~${totalEnrichmentCalls}`);
  console.log(`Estimated Sonnet calls (corpus gen): ~${personas.length * cycleCount}`);
  console.log(`Estimated Haiku calls (corrections): ~${personas.length * cycleCount}`);
  console.log('');
  console.log('[run-adversarial] Dry-run PASSED');
}

// ---------------------------------------------------------------------------
// Single persona adversarial run
// ---------------------------------------------------------------------------

async function runPersonaAdversarial(
  personaData: PersonaData,
  cycleCount: number,
  client: Anthropic,
  resumeFromCycle: number,
  delayMs: number,
  specialistSessions?: HarnessONNXSessions,
): Promise<PersonaAdversarialResult & { _personaConfig: PersonaConfig; _allConsensusResults: ConsensusResult[]; _allCorpusItems: CorpusItem[] }> {
  const { dirName, syntheticUser } = personaData;
  const personaConfig: PersonaConfig = {
    personaName: syntheticUser.personaName,
    personaDirName: dirName,
    bio: syntheticUser.bio,
    groundTruth: syntheticUser.groundTruth,
  };

  console.log(`\n[${dirName}] Starting adversarial run (${cycleCount} cycles)`);
  console.log(`  Persona: ${syntheticUser.personaName}`);
  console.log(`  Ground truth: ${syntheticUser.groundTruth.entities.length} entities, ${syntheticUser.groundTruth.relationships.length} relationships`);

  const startTime = Date.now();
  const completedCycles: CycleState[] = [];

  // Accumulated consensus results and corpus items across all cycles (for EII)
  const allConsensusResults: ConsensusResult[] = [];
  const allCorpusItems: CorpusItem[] = [];

  // Initialize store from checkpoint if resuming
  const store = new HarnessEntityStore();
  resetHarnessCooccurrence();

  let previousGaps: RelationshipGap[] = [];
  let previousSnapshot: GraphSnapshot | null = null;
  let previousScore: GraphScore | null = null;

  // Resume: load last checkpoint
  if (resumeFromCycle > 0) {
    console.log(`  Resuming from cycle ${resumeFromCycle}`);
    const checkpoint = loadCheckpoint(dirName, resumeFromCycle);
    if (checkpoint) {
      store.restore(checkpoint.storeSnapshot);
      completedCycles.push(checkpoint.cycleState);
      previousGaps = checkpoint.cycleState.gaps;
      previousSnapshot = checkpoint.cycleState.graphSnapshot;
      previousScore = checkpoint.cycleState.score;
      console.log(`  Restored store from cycle ${resumeFromCycle} checkpoint`);
    }
  }

  // Run remaining cycles
  const startCycle = resumeFromCycle + 1;
  for (let cycle = startCycle; cycle <= cycleCount; cycle++) {
    try {
      const cycleState = await runAdversarialCycle(
        personaConfig,
        cycle,
        previousGaps,
        previousSnapshot,
        previousScore,
        store,
        client,
        undefined, // no ablation
        delayMs,
      );

      // --- Consensus pass over this cycle's corpus ---
      if (specialistSessions && cycleState.corpus && cycleState.corpus.length > 0) {
        try {
          const cycleConsensusResults: ConsensusResult[] = [];
          for (const item of cycleState.corpus) {
            const vector = buildMinimalVector(item);
            const consensusResult = await runHarnessConsensus(specialistSessions, vector);
            cycleConsensusResults.push(consensusResult);
          }

          // Accumulate corpus items and consensus results across all cycles
          allCorpusItems.push(...cycleState.corpus);
          allConsensusResults.push(...cycleConsensusResults);

          // Store just this cycle's results (not the accumulated set)
          cycleState.consensusResults = cycleConsensusResults;

          // Compute EII from ALL accumulated results so far
          const riskLabels = deriveRiskLabels(allCorpusItems);
          const allProbs = allConsensusResults.map((r) => r.weightedProbability);
          const impact = computeHarnessImpact(riskLabels, allProbs);
          cycleState.cycleEII = computeEII(allConsensusResults, impact);

          console.log(
            `  [${dirName}] Cycle ${cycle} EII: ${cycleState.cycleEII.eii.toFixed(3)} ` +
            `(coherence=${cycleState.cycleEII.coherence.toFixed(3)}, ` +
            `stability=${cycleState.cycleEII.stability.toFixed(3)}, ` +
            `impact=${cycleState.cycleEII.impact.toFixed(3)})`,
          );
        } catch (err) {
          console.warn(`  [${dirName}] Consensus pass failed for cycle ${cycle}: ${err}`);
        }
      }

      completedCycles.push(cycleState);
      previousGaps = cycleState.gaps;
      previousSnapshot = cycleState.graphSnapshot;
      previousScore = cycleState.score;
    } catch (err) {
      console.error(`  [${dirName}] Cycle ${cycle} failed: ${err}`);
      break;
    }
  }

  const totalDurationMs = Date.now() - startTime;
  const finalScore = completedCycles[completedCycles.length - 1]?.score ??
    { entityF1: 0, relationshipF1: 0, privacyScore: 0 } as GraphScore;

  console.log(`\n[${dirName}] Complete — ${(totalDurationMs / 1000).toFixed(1)}s`);
  console.log(`  Final: Ent F1=${(finalScore.entityF1 * 100).toFixed(1)}% Rel F1=${(finalScore.relationshipF1 * 100).toFixed(1)}% Privacy=${(finalScore.privacyScore * 100).toFixed(1)}%`);
  const passed = finalScore.relationshipF1 >= PASS_THRESHOLD;
  console.log(`  CI: ${passed ? 'PASS' : 'FAIL'} (threshold: ${PASS_THRESHOLD * 100}%)`);

  // Store EII progression across cycles
  const eiiProgression = completedCycles
    .map((c) => c.cycleEII)
    .filter((e): e is NonNullable<typeof e> => e !== undefined);

  return {
    personaName: syntheticUser.personaName,
    personaDirName: dirName,
    cycles: completedCycles,
    totalDurationMs,
    finalScore,
    eiiProgression,
    _personaConfig: personaConfig,
    _allConsensusResults: allConsensusResults,
    _allCorpusItems: allCorpusItems,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isResume = args.includes('--resume');
  const isGeneratePersonas = args.includes('--generate-personas');
  const skipAblation = args.includes('--skip-ablation');
  const skipReport = args.includes('--skip-report');

  const getArg = (flag: string) => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  };

  const personasArg = getArg('--personas') ?? 'all';
  const cycleCount = parseInt(getArg('--cycles') ?? '5', 10);
  const delayMs = parseInt(getArg('--delay-ms') ?? '100', 10);

  const now = new Date();
  const defaultExperimentName = `exp-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
  const experimentName = getArg('--experiment') ?? defaultExperimentName;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey && !isDryRun) {
    console.error('ERROR: ANTHROPIC_API_KEY environment variable not set.');
    process.exit(1);
  }

  // Generate missing personas if requested
  if (isGeneratePersonas) {
    await generateMissingPersonas(apiKey ?? '', isDryRun);
    if (isDryRun) {
      process.exit(0);
    }
  }

  // Resolve persona list
  const allPersonaDirs = listAllPersonas();
  let selectedDirs: string[];

  if (personasArg === 'all') {
    selectedDirs = allPersonaDirs;
  } else {
    selectedDirs = personasArg.split(',').map((s) => s.trim()).filter(Boolean);
    // Validate all requested personas exist
    for (const dir of selectedDirs) {
      if (!allPersonaDirs.includes(dir)) {
        console.error(`ERROR: Persona not found: ${dir}`);
        console.error(`Available: ${allPersonaDirs.join(', ')}`);
        process.exit(1);
      }
    }
  }

  // Load persona data
  const personas: PersonaData[] = [];
  for (const dirName of selectedDirs) {
    const data = loadPersonaData(dirName);
    if (data) personas.push(data);
  }

  if (personas.length === 0) {
    console.error('ERROR: No valid personas found.');
    console.error('Run --generate-personas first, or create persona directories manually.');
    process.exit(1);
  }

  // Dry-run mode
  if (isDryRun) {
    dryRun(personas, cycleCount);
    process.exit(0);
  }

  const client = new Anthropic({ apiKey });

  // Load specialist ONNX sessions once at startup (used for consensus in each cycle)
  let specialistSessions: HarnessONNXSessions | undefined;
  try {
    console.log('[run-adversarial] Loading specialist ONNX sessions...');
    specialistSessions = await loadSpecialistSessions();
    console.log('[run-adversarial] Specialist sessions loaded');
  } catch (err) {
    console.warn(`[run-adversarial] Could not load specialist sessions (consensus will be skipped): ${err}`);
  }

  // Load experiment state for resume
  const experimentState = isResume ? loadExperimentState(experimentName) : null;
  const completedPersonaDirs = new Set(experimentState?.completedPersonas ?? []);

  console.log(`[run-adversarial] Starting experiment: ${experimentName}`);
  console.log(`Personas: ${personas.length} | Cycles: ${cycleCount} | Delay: ${delayMs}ms`);
  console.log('='.repeat(70));

  const startedAt = new Date().toISOString();
  const personaResults: PersonaAdversarialResult[] = [];
  const personaConfigs = new Map<string, PersonaConfig>();
  const personaStates: Array<{
    personaDirName: string;
    personaName: string;
    result: PersonaAdversarialResult | null;
    completedCycles: number;
  }> = [];

  // Accumulate consensus results and corpus items across all personas for EII reporting
  const globalConsensusResults: ConsensusResult[] = [];
  const globalCorpusItems: CorpusItem[] = [];

  for (const personaData of personas) {
    const { dirName } = personaData;

    // Skip completed personas when resuming
    if (completedPersonaDirs.has(dirName)) {
      console.log(`\n[${dirName}] SKIP — already completed in this experiment`);
      continue;
    }

    // Find resume point for this persona
    const resumeFromCycle = isResume ? findLastCompletedCycle(dirName) : 0;

    const result = await runPersonaAdversarial(
      personaData,
      cycleCount,
      client,
      resumeFromCycle,
      delayMs,
      specialistSessions,
    );

    personaResults.push(result);
    personaConfigs.set(dirName, result._personaConfig);

    // Accumulate for global EII reporting
    globalConsensusResults.push(...result._allConsensusResults);
    globalCorpusItems.push(...result._allCorpusItems);

    personaStates.push({
      personaDirName: dirName,
      personaName: result.personaName,
      result,
      completedCycles: result.cycles.length,
    });

    // Save experiment state after each persona
    saveExperimentState(experimentName, personaStates);

    console.log('='.repeat(70));
  }

  if (personaResults.length === 0) {
    console.log('\nNo personas were run.');
    process.exit(0);
  }

  // Compute aggregate score and learning curves
  const aggregateScore = computeAggregateScore(personaResults);
  const learningCurves: Record<string, ReturnType<typeof computeLearningCurve>> = {};
  for (const result of personaResults) {
    learningCurves[result.personaName] = computeLearningCurve(result.cycles);
  }

  const completedAt = new Date().toISOString();
  const experimentResult: ExperimentResult = {
    experimentName,
    startedAt,
    completedAt,
    personas: personaResults,
    aggregateScore,
    learningCurves,
  };

  // Write experiment report
  const experimentDir = path.join(EXPERIMENTS_DIR, experimentName);
  if (!fs.existsSync(experimentDir)) {
    fs.mkdirSync(experimentDir, { recursive: true });
  }

  // --- EII Report Data ---
  let eiiReportData: EIIReportData | undefined;
  if (globalConsensusResults.length > 0 && specialistSessions) {
    try {
      console.log('\n[run-adversarial] Computing EII report data...');
      const globalRiskLabels = deriveRiskLabels(globalCorpusItems);
      const globalProbs = globalConsensusResults.map((r) => r.weightedProbability);
      const globalImpact = computeHarnessImpact(globalRiskLabels, globalProbs);
      const EII_DIAGNOSTIC_THRESHOLD = 0.80;

      // Per-persona EII summary
      const personaEIIs: EIIReportData['personaEIIs'] = [];
      for (const personaResult of personaResults) {
        // Collect consensus results for this persona from its cycles
        const personaConsensusResults: ConsensusResult[] = [];
        const personaCorpusItems: CorpusItem[] = [];
        for (const cycle of personaResult.cycles) {
          if (cycle.consensusResults) personaConsensusResults.push(...cycle.consensusResults);
          if (cycle.corpus) personaCorpusItems.push(...cycle.corpus);
        }

        if (personaConsensusResults.length === 0) continue;

        const personaRiskLabels = deriveRiskLabels(personaCorpusItems);
        const personaProbs = personaConsensusResults.map((r) => r.weightedProbability);
        const personaImpact = computeHarnessImpact(personaRiskLabels, personaProbs);
        const personaEII = computeEII(personaConsensusResults, personaImpact);
        personaEIIs.push({
          personaName: personaResult.personaName,
          atomCount: personaCorpusItems.length,
          finalEII: personaEII,
          meetsThreshold: personaEII.eii > EII_DIAGNOSTIC_THRESHOLD,
        });
      }

      // Corpus size curves: per-persona, 5 levels
      const corpusCurves: EIIReportData['corpusCurves'] = [];
      const CURVE_FRACTIONS = [0.10, 0.25, 0.50, 0.75, 1.00];
      const COLD_START_MIN = 15;

      for (const personaResult of personaResults) {
        const personaConsensusResults: ConsensusResult[] = [];
        const personaCorpusItems: CorpusItem[] = [];
        for (const cycle of personaResult.cycles) {
          if (cycle.consensusResults) personaConsensusResults.push(...cycle.consensusResults);
          if (cycle.corpus) personaCorpusItems.push(...cycle.corpus);
        }

        const curvePoints: EIIReportData['corpusCurves'][0]['curvePoints'] = [];
        for (const fraction of CURVE_FRACTIONS) {
          const subsetSize = Math.round(personaConsensusResults.length * fraction);
          if (subsetSize < COLD_START_MIN) continue; // cold-start guard

          const subset = personaConsensusResults.slice(0, subsetSize);
          const subsetCorpus = personaCorpusItems.slice(0, subsetSize);
          const subsetRiskLabels = deriveRiskLabels(subsetCorpus);
          const subsetProbs = subset.map((r) => r.weightedProbability);
          const subsetImpact = computeHarnessImpact(subsetRiskLabels, subsetProbs);
          const subsetEII = computeEII(subset, subsetImpact);

          curvePoints.push({
            fraction,
            coherence: subsetEII.coherence,
            stability: subsetEII.stability,
            impact: subsetEII.impact,
            eii: subsetEII.eii,
          });
        }

        corpusCurves.push({ personaName: personaResult.personaName, curvePoints });
      }

      // Specialist ablation (post-hoc, zero re-inference)
      const specialistAblation = runSpecialistAblation(globalConsensusResults, globalRiskLabels);

      eiiReportData = {
        personaEIIs,
        corpusCurves,
        ablation: specialistAblation,
        allConsensusResults: globalConsensusResults,
      };

      // Save EII JSON
      const eiiJsonPath = path.join(experimentDir, 'eii-report.json');
      fs.writeFileSync(eiiJsonPath, JSON.stringify({
        personaEIIs: eiiReportData.personaEIIs,
        corpusCurves: eiiReportData.corpusCurves,
        ablation: eiiReportData.ablation,
        totalAtoms: globalCorpusItems.length,
        globalImpact,
        globalEII: computeEII(globalConsensusResults, globalImpact),
      }, null, 2), 'utf-8');

      console.log(`[run-adversarial] EII report data computed (${globalConsensusResults.length} atoms)`);
    } catch (err) {
      console.error(`[run-adversarial] EII report computation failed: ${err}`);
    }
  }

  const { jsonPath, mdPath } = writeExperimentReport(experimentResult, experimentDir, undefined, eiiReportData);

  // Post-run analysis: ablation, auto-tune, investment report
  let ablationSuiteResult = null;
  let tuneResult = null;

  if (!skipAblation && personaResults.length >= 2) {
    console.log('\n[run-adversarial] Running ablation suite...');
    console.log('='.repeat(70));
    try {
      ablationSuiteResult = await runFullAblationSuite(personaResults, personaConfigs, client);

      // Save ablation results
      const ablationPath = path.join(experimentDir, 'ablation-results.json');
      // Serialize Map for JSON output
      const ablationJson = {
        fullRunScores: ablationSuiteResult.fullRunScores,
        perComponentResults: Object.fromEntries(ablationSuiteResult.perComponentResults),
        componentRanking: ablationSuiteResult.componentRanking,
      };
      fs.writeFileSync(ablationPath, JSON.stringify(ablationJson, null, 2), 'utf-8');
      console.log(`[run-adversarial] Ablation results saved: ${ablationPath}`);
    } catch (err) {
      console.error(`[run-adversarial] Ablation suite failed: ${err}`);
    }
  } else if (skipAblation) {
    console.log('\n[run-adversarial] Skipping ablation suite (--skip-ablation)');
  } else {
    console.log('\n[run-adversarial] Skipping ablation suite (need >= 2 personas)');
  }

  console.log('\n[run-adversarial] Auto-tuning patterns...');
  try {
    tuneResult = await autoTunePatterns(personaResults, client);
    // Save tuned patterns to experiment dir as well
    const tunedPath = path.join(experimentDir, 'tuned-patterns.json');
    const harnessTunedPath = path.join(__dirname, 'tuned-patterns.json');
    if (fs.existsSync(harnessTunedPath)) {
      fs.copyFileSync(harnessTunedPath, tunedPath);
    }
  } catch (err) {
    console.error(`[run-adversarial] Auto-tune failed: ${err}`);
  }

  if (!skipReport && tuneResult) {
    console.log('\n[run-adversarial] Generating investment report...');
    try {
      const stubAblation = ablationSuiteResult ?? {
        fullRunScores: {},
        perComponentResults: new Map(),
        componentRanking: [],
      };
      const reportPath = await generateInvestmentReport(
        experimentResult,
        stubAblation,
        tuneResult,
        experimentDir,
        client,
      );
      console.log(`[run-adversarial] Investment report: ${reportPath}`);
    } catch (err) {
      console.error(`[run-adversarial] Investment report failed: ${err}`);
    }
  } else if (skipReport) {
    console.log('[run-adversarial] Skipping investment report (--skip-report)');
  }

  // Print summary table
  console.log('\n[run-adversarial] FINAL SUMMARY');
  console.log('');
  console.log(
    'Persona'.padEnd(22) +
    'Cycles'.padStart(7) +
    'Ent F1'.padStart(8) +
    'Rel F1'.padStart(8) +
    'Privacy'.padStart(9) +
    'Status'.padStart(7),
  );
  console.log('-'.repeat(61));

  let allPassed = true;
  for (const result of personaResults) {
    const s = result.finalScore;
    const passed = s.relationshipF1 >= PASS_THRESHOLD;
    if (!passed) allPassed = false;
    console.log(
      result.personaName.padEnd(22) +
      String(result.cycles.length).padStart(7) +
      `${(s.entityF1 * 100).toFixed(0)}%`.padStart(8) +
      `${(s.relationshipF1 * 100).toFixed(0)}%`.padStart(8) +
      `${(s.privacyScore * 100).toFixed(0)}%`.padStart(9) +
      (passed ? ' PASS' : ' FAIL').padStart(7),
    );
  }
  console.log('-'.repeat(61));
  console.log(
    'AGGREGATE'.padEnd(22) +
    ''.padStart(7) +
    `${(aggregateScore.entityF1.mean * 100).toFixed(0)}%`.padStart(8) +
    `${(aggregateScore.relationshipF1.mean * 100).toFixed(0)}%`.padStart(8) +
    `${(aggregateScore.privacyScore.mean * 100).toFixed(0)}%`.padStart(9) +
    (allPassed ? ' PASS' : ' FAIL').padStart(7),
  );

  console.log('');
  console.log(`[run-adversarial] Reports:`);
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  Markdown: ${mdPath}`);
  console.log('');
  console.log(`[run-adversarial] ${allPassed ? 'CI: PASS' : 'CI: FAIL'}`);

  // CI exit codes
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('[run-adversarial] Fatal error:', err);
  process.exit(1);
});
