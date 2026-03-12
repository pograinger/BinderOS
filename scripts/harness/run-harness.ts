/**
 * Main harness entry point.
 *
 * Loads synthetic-user.json and corpus.json, feeds atoms progressively,
 * scores at checkpoints, and generates reports.
 *
 * Usage:
 *   npx tsx scripts/harness/run-harness.ts                    # run default persona
 *   npx tsx scripts/harness/run-harness.ts --persona maria-santos
 *   npx tsx scripts/harness/run-harness.ts --all              # run ALL personas
 *   npx tsx scripts/harness/run-harness.ts --all --debug      # all personas with debug
 *   npx tsx scripts/harness/run-harness.ts --dry-run          # validate structure only
 *
 * Phase 28: HARN-01, HARN-02, HARN-03
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HarnessEntityStore } from './harness-entity-store.js';
import { runHarnessAtom } from './harness-pipeline.js';
import { flushHarnessCooccurrence, resetHarnessCooccurrence, cleanSuppressedRelations } from './harness-inference.js';
import { scoreEntityGraph } from './score-graph.js';
import { writeReports } from './write-reports.js';
import type { Corpus, CorpusItem } from './generate-corpus.js';
import type { GroundTruth } from './score-graph.js';
import type { CheckpointResult } from './write-reports.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PERSONAS_DIR = path.join(__dirname, 'personas');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Generate checkpoint positions: every 25% of corpus size, minimum at 5 */
function computeCheckpoints(corpusSize: number): number[] {
  const points: number[] = [];
  const step = Math.max(5, Math.floor(corpusSize / 4));
  for (let i = step; i < corpusSize; i += step) {
    points.push(i);
  }
  return points;
}

// ---------------------------------------------------------------------------
// Load utilities
// ---------------------------------------------------------------------------

function loadJSON<T>(filePath: string, label: string): T | null {
  if (!fs.existsSync(filePath)) {
    console.error(`ERROR: ${label} not found at ${filePath}`);
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

// ---------------------------------------------------------------------------
// Persona resolution
// ---------------------------------------------------------------------------

interface PersonaPaths {
  name: string;
  syntheticUserPath: string;
  corpusPath: string;
  reportsDir: string;
}

function resolvePersona(personaName?: string): PersonaPaths {
  if (personaName) {
    const personaDir = path.join(PERSONAS_DIR, personaName);
    if (!fs.existsSync(personaDir)) {
      console.error(`ERROR: Persona directory not found: ${personaDir}`);
      console.error(`Available personas: ${listPersonas().join(', ') || '(none)'}`);
      process.exit(1);
    }
    return {
      name: personaName,
      syntheticUserPath: path.join(personaDir, 'synthetic-user.json'),
      corpusPath: path.join(personaDir, 'corpus.json'),
      reportsDir: path.join(personaDir, 'reports'),
    };
  }

  // Default: legacy paths (scripts/harness/ root)
  return {
    name: 'default',
    syntheticUserPath: path.join(__dirname, 'synthetic-user.json'),
    corpusPath: path.join(__dirname, 'corpus.json'),
    reportsDir: path.join(__dirname, 'reports'),
  };
}

function listPersonas(): string[] {
  if (!fs.existsSync(PERSONAS_DIR)) return [];
  return fs.readdirSync(PERSONAS_DIR).filter((d) => {
    const dir = path.join(PERSONAS_DIR, d);
    return fs.statSync(dir).isDirectory() && fs.existsSync(path.join(dir, 'synthetic-user.json'));
  });
}

// ---------------------------------------------------------------------------
// Dry-run mode
// ---------------------------------------------------------------------------

function dryRun(corpus: Corpus, groundTruth: GroundTruth): void {
  console.log('[run-harness] DRY-RUN MODE — validating structure, no processing');
  console.log('');

  if (!corpus.items || !Array.isArray(corpus.items)) {
    console.error('ERROR: corpus.json missing items array');
    process.exit(1);
  }

  let valid = true;
  for (const item of corpus.items) {
    if (!item.id || !item.content || !Array.isArray(item.entityMentions)) {
      console.error(`ERROR: item ${item.id ?? '?'} missing required fields`);
      valid = false;
    }
  }

  if (!valid) {
    console.error('Corpus validation FAILED');
    process.exit(1);
  }

  console.log(`Corpus: ${corpus.items.length} items (generated: ${corpus.generatedAt})`);
  console.log(`Ground truth: ${groundTruth.entities.length} entities, ${groundTruth.relationships.length} relationships`);
  console.log('');
  console.log('Dry-run PASSED — corpus structure valid');
}

// ---------------------------------------------------------------------------
// Single persona run
// ---------------------------------------------------------------------------

interface PersonaResult {
  personaName: string;
  finalScore: {
    entityPrecision: number;
    entityRecall: number;
    entityF1: number;
    relationshipPrecision: number;
    relationshipRecall: number;
    relationshipF1: number;
    privacyScore: number;
  };
  totalAtoms: number;
}

async function runPersona(
  persona: PersonaPaths,
  args: string[],
): Promise<PersonaResult | null> {
  const isDebug = args.includes('--debug');

  const syntheticUser = loadJSON<{ personaName: string; groundTruth: GroundTruth }>(
    persona.syntheticUserPath,
    `${persona.name}/synthetic-user.json`,
  );
  if (!syntheticUser) return null;

  const groundTruth = syntheticUser.groundTruth;

  if (!fs.existsSync(persona.corpusPath)) {
    console.error(`  SKIP: ${persona.name} — corpus.json not found`);
    return null;
  }

  const corpus = loadJSON<Corpus>(persona.corpusPath, `${persona.name}/corpus.json`);
  if (!corpus) return null;

  console.log(`[${persona.name}] Starting harness run`);
  console.log(`  Persona: ${syntheticUser.personaName}`);
  console.log(`  Corpus: ${corpus.items.length} items`);
  console.log(`  Ground truth: ${groundTruth.entities.length} entities, ${groundTruth.relationships.length} relationships`);
  console.log('');

  const startTime = Date.now();
  const store = new HarnessEntityStore();
  resetHarnessCooccurrence();

  const checkpointResults: CheckpointResult[] = [];

  for (let i = 0; i < corpus.items.length; i++) {
    const item = corpus.items[i];
    const atomNumber = i + 1;

    await runHarnessAtom(item, store);

    const checkpoints = computeCheckpoints(corpus.items.length);
    if (checkpoints.includes(atomNumber)) {
      flushHarnessCooccurrence(store);
      cleanSuppressedRelations(store);

      const score = scoreEntityGraph(store, groundTruth, atomNumber);
      checkpointResults.push({ score, atomsProcessed: atomNumber });

      console.log(`  Checkpoint @ atom ${atomNumber}:`);
      console.log(`    Entities:      P=${(score.entityPrecision * 100).toFixed(1)}%  R=${(score.entityRecall * 100).toFixed(1)}%  F1=${(score.entityF1 * 100).toFixed(1)}%  (${score.correctEntities}/${score.totalGroundTruthEntities} found)`);
      console.log(`    Relationships: P=${(score.relationshipPrecision * 100).toFixed(1)}%  R=${(score.relationshipRecall * 100).toFixed(1)}%  F1=${(score.relationshipF1 * 100).toFixed(1)}%  (${score.correctRelations}/${score.totalGroundTruthRelations} found)`);
      console.log(`    Privacy score: ${(score.privacyScore * 100).toFixed(1)}%`);
    }
  }

  // Final score
  const finalAtomCount = corpus.items.length;
  const lastCheckpoint = checkpointResults[checkpointResults.length - 1];
  if (!lastCheckpoint || lastCheckpoint.score.checkpoint !== finalAtomCount) {
    flushHarnessCooccurrence(store);
    cleanSuppressedRelations(store);
    const finalScore = scoreEntityGraph(store, groundTruth, finalAtomCount);
    checkpointResults.push({ score: finalScore, atomsProcessed: finalAtomCount });

    console.log(`  Final @ atom ${finalAtomCount}:`);
    console.log(`    Entities:      P=${(finalScore.entityPrecision * 100).toFixed(1)}%  R=${(finalScore.entityRecall * 100).toFixed(1)}%  F1=${(finalScore.entityF1 * 100).toFixed(1)}%  (${finalScore.correctEntities}/${finalScore.totalGroundTruthEntities} found)`);
    console.log(`    Relationships: P=${(finalScore.relationshipPrecision * 100).toFixed(1)}%  R=${(finalScore.relationshipRecall * 100).toFixed(1)}%  F1=${(finalScore.relationshipF1 * 100).toFixed(1)}%  (${finalScore.correctRelations}/${finalScore.totalGroundTruthRelations} found)`);
    console.log(`    Privacy score: ${(finalScore.privacyScore * 100).toFixed(1)}%`);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  console.log(`[${persona.name}] Processed ${finalAtomCount} atoms in ${duration}s`);

  // Debug: dump relations
  if (isDebug) {
    console.log(`\n[debug] All inferred relations for ${persona.name}:`);
    for (const rel of store.getRelations()) {
      const target = store.getEntity(rel.targetEntityId);
      const source = rel.sourceEntityId === '[SELF]' ? '[SELF]' : store.getEntity(rel.sourceEntityId)?.canonicalName ?? rel.sourceEntityId;
      console.log(`  ${source} → ${target?.canonicalName ?? rel.targetEntityId}: ${rel.relationshipType} (${rel.sourceAttribution}, conf=${rel.confidence.toFixed(2)}, evidence=${rel.evidence.length})`);
      if (rel.evidence.length <= 2) {
        for (const ev of rel.evidence) {
          console.log(`    snippet: "${ev.snippet}"`);
        }
      }
    }
  }

  // Write reports
  if (!fs.existsSync(persona.reportsDir)) {
    fs.mkdirSync(persona.reportsDir, { recursive: true });
  }
  const { jsonPath, mdPath } = writeReports(checkpointResults, persona.reportsDir);
  console.log('');
  console.log(`[${persona.name}] Reports written:`);
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  Markdown: ${mdPath}`);

  const final = checkpointResults[checkpointResults.length - 1].score;
  return {
    personaName: syntheticUser.personaName,
    finalScore: {
      entityPrecision: final.entityPrecision,
      entityRecall: final.entityRecall,
      entityF1: final.entityF1,
      relationshipPrecision: final.relationshipPrecision,
      relationshipRecall: final.relationshipRecall,
      relationshipF1: final.relationshipF1,
      privacyScore: final.privacyScore,
    },
    totalAtoms: finalAtomCount,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const runAll = args.includes('--all');
  const personaIdx = args.indexOf('--persona');
  const personaName = personaIdx >= 0 ? args[personaIdx + 1] : undefined;

  if (runAll) {
    // Run all personas
    const personas = listPersonas();
    if (personas.length === 0) {
      console.error('ERROR: No personas found in scripts/harness/personas/');
      process.exit(1);
    }

    console.log(`[run-harness] Running ALL ${personas.length} personas: ${personas.join(', ')}`);
    console.log('='.repeat(70));
    console.log('');

    const results: PersonaResult[] = [];
    for (const name of personas) {
      const persona = resolvePersona(name);
      const result = await runPersona(persona, args);
      if (result) results.push(result);
      console.log('');
      console.log('='.repeat(70));
      console.log('');
    }

    // Summary table
    if (results.length > 0) {
      console.log('[run-harness] CROSS-PERSONA SUMMARY');
      console.log('');
      console.log(
        'Persona'.padEnd(20) +
        'Atoms'.padStart(6) +
        'E-P'.padStart(8) +
        'E-R'.padStart(8) +
        'E-F1'.padStart(8) +
        'R-P'.padStart(8) +
        'R-R'.padStart(8) +
        'R-F1'.padStart(8) +
        'Priv'.padStart(8),
      );
      console.log('-'.repeat(82));
      for (const r of results) {
        const s = r.finalScore;
        console.log(
          r.personaName.padEnd(20) +
          String(r.totalAtoms).padStart(6) +
          `${(s.entityPrecision * 100).toFixed(0)}%`.padStart(8) +
          `${(s.entityRecall * 100).toFixed(0)}%`.padStart(8) +
          `${(s.entityF1 * 100).toFixed(0)}%`.padStart(8) +
          `${(s.relationshipPrecision * 100).toFixed(0)}%`.padStart(8) +
          `${(s.relationshipRecall * 100).toFixed(0)}%`.padStart(8) +
          `${(s.relationshipF1 * 100).toFixed(0)}%`.padStart(8) +
          `${(s.privacyScore * 100).toFixed(0)}%`.padStart(8),
        );
      }
      console.log('-'.repeat(82));

      // Averages
      const avg = (key: keyof PersonaResult['finalScore']) =>
        results.reduce((sum, r) => sum + r.finalScore[key], 0) / results.length;
      console.log(
        'AVERAGE'.padEnd(20) +
        ''.padStart(6) +
        `${(avg('entityPrecision') * 100).toFixed(0)}%`.padStart(8) +
        `${(avg('entityRecall') * 100).toFixed(0)}%`.padStart(8) +
        `${(avg('entityF1') * 100).toFixed(0)}%`.padStart(8) +
        `${(avg('relationshipPrecision') * 100).toFixed(0)}%`.padStart(8) +
        `${(avg('relationshipRecall') * 100).toFixed(0)}%`.padStart(8) +
        `${(avg('relationshipF1') * 100).toFixed(0)}%`.padStart(8) +
        `${(avg('privacyScore') * 100).toFixed(0)}%`.padStart(8),
      );
    }

    return;
  }

  // Single persona run
  const persona = resolvePersona(personaName);

  if (isDryRun) {
    const syntheticUser = loadJSON<{ personaName: string; groundTruth: GroundTruth }>(
      persona.syntheticUserPath,
      'synthetic-user.json',
    );
    if (!syntheticUser) process.exit(1);

    if (!fs.existsSync(persona.corpusPath)) {
      console.log('[run-harness] DRY-RUN MODE — corpus.json not found');
      console.log(`  Persona: ${syntheticUser.personaName}`);
      console.log('  Dry-run PASSED — synthetic-user.json structure valid');
      process.exit(0);
    }

    const corpus = loadJSON<Corpus>(persona.corpusPath, 'corpus.json');
    if (!corpus) process.exit(1);
    dryRun(corpus, syntheticUser.groundTruth);
    process.exit(0);
  }

  await runPersona(persona, args);
}

main().catch((err) => {
  console.error('[run-harness] Fatal error:', err);
  process.exit(1);
});
