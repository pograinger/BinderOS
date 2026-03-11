/**
 * Main harness entry point.
 *
 * Loads synthetic-user.json and corpus.json, feeds atoms progressively,
 * scores at checkpoints [5, 10, 20, 30], and generates reports.
 *
 * Usage:
 *   npx tsx scripts/harness/run-harness.ts            # full run
 *   npx tsx scripts/harness/run-harness.ts --dry-run  # validate structure only
 *
 * Phase 28: HARN-01, HARN-02, HARN-03
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HarnessEntityStore } from './harness-entity-store.js';
import { runHarnessAtom } from './harness-pipeline.js';
import { flushHarnessCooccurrence, resetHarnessCooccurrence } from './harness-inference.js';
import { scoreEntityGraph } from './score-graph.js';
import { writeReports } from './write-reports.js';
import type { Corpus, CorpusItem } from './generate-corpus.js';
import type { GroundTruth } from './score-graph.js';
import type { CheckpointResult } from './write-reports.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHECKPOINTS = [5, 10, 20, 30];

// ---------------------------------------------------------------------------
// Load utilities
// ---------------------------------------------------------------------------

function loadJSON<T>(filePath: string, label: string): T {
  if (!fs.existsSync(filePath)) {
    console.error(`ERROR: ${label} not found at ${filePath}`);
    return null as unknown as T;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

// ---------------------------------------------------------------------------
// Dry-run mode
// ---------------------------------------------------------------------------

function dryRun(corpus: Corpus, groundTruth: GroundTruth): void {
  console.log('[run-harness] DRY-RUN MODE — validating structure, no processing');
  console.log('');

  // Validate corpus structure
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

  // Show expected checkpoints
  const actualCheckpoints = CHECKPOINTS.filter((c) => c <= corpus.items.length);
  console.log('Expected checkpoints:');
  for (const cp of actualCheckpoints) {
    console.log(`  After atom ${cp}: score entity graph + relationships`);
  }
  console.log(`  After atom ${corpus.items.length}: final score + reports`);
  console.log('');
  console.log('Dry-run PASSED — corpus structure valid');
  console.log('To run full harness: npx tsx scripts/harness/run-harness.ts');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');

  // Load files
  const syntheticUserPath = path.join(__dirname, 'synthetic-user.json');
  const corpusPath = path.join(__dirname, 'corpus.json');
  const reportsDir = path.join(__dirname, 'reports');

  const syntheticUser = loadJSON<{ personaName: string; groundTruth: GroundTruth }>(
    syntheticUserPath,
    'synthetic-user.json',
  );
  if (!syntheticUser) process.exit(1);

  const groundTruth = syntheticUser.groundTruth;

  if (isDryRun) {
    // Dry-run can work without corpus.json (just validate structure if present)
    if (!fs.existsSync(corpusPath)) {
      console.log('[run-harness] DRY-RUN MODE — corpus.json not found');
      console.log('');
      console.log(`Persona: ${syntheticUser.personaName}`);
      console.log(`Ground truth: ${groundTruth.entities.length} entities, ${groundTruth.relationships.length} relationships`);
      console.log('');
      console.log('corpus.json does not exist yet.');
      console.log('Generate it first: ANTHROPIC_API_KEY=<key> npx tsx scripts/harness/generate-corpus.ts');
      console.log('');
      console.log('Dry-run PASSED — synthetic-user.json structure valid');
      process.exit(0);
    }

    const corpus = loadJSON<Corpus>(corpusPath, 'corpus.json');
    if (!corpus) process.exit(1);
    dryRun(corpus, groundTruth);
    process.exit(0);
  }

  // Full run
  if (!fs.existsSync(corpusPath)) {
    console.error('ERROR: corpus.json not found.');
    console.error('Run generate-corpus.ts first:');
    console.error('  ANTHROPIC_API_KEY=<key> npx tsx scripts/harness/generate-corpus.ts');
    process.exit(1);
  }

  const corpus = loadJSON<Corpus>(corpusPath, 'corpus.json');
  if (!corpus) process.exit(1);

  console.log(`[run-harness] Starting harness run`);
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

    // Score at checkpoints
    if (CHECKPOINTS.includes(atomNumber)) {
      // Flush co-occurrence before scoring at checkpoint
      flushHarnessCooccurrence(store);

      const score = scoreEntityGraph(store, groundTruth, atomNumber);
      checkpointResults.push({ score, atomsProcessed: atomNumber });

      console.log(`  Checkpoint @ atom ${atomNumber}:`);
      console.log(`    Entities:      P=${(score.entityPrecision * 100).toFixed(1)}%  R=${(score.entityRecall * 100).toFixed(1)}%  F1=${(score.entityF1 * 100).toFixed(1)}%  (${score.correctEntities}/${score.totalGroundTruthEntities} found)`);
      console.log(`    Relationships: P=${(score.relationshipPrecision * 100).toFixed(1)}%  R=${(score.relationshipRecall * 100).toFixed(1)}%  F1=${(score.relationshipF1 * 100).toFixed(1)}%  (${score.correctRelations}/${score.totalGroundTruthRelations} found)`);
      console.log(`    Privacy score: ${(score.privacyScore * 100).toFixed(1)}%`);
    }
  }

  // Final score (if not already at a checkpoint)
  const finalAtomCount = corpus.items.length;
  const lastCheckpoint = checkpointResults[checkpointResults.length - 1];
  if (!lastCheckpoint || lastCheckpoint.score.checkpoint !== finalAtomCount) {
    flushHarnessCooccurrence(store);
    const finalScore = scoreEntityGraph(store, groundTruth, finalAtomCount);
    checkpointResults.push({ score: finalScore, atomsProcessed: finalAtomCount });

    console.log(`  Final @ atom ${finalAtomCount}:`);
    console.log(`    Entities:      P=${(finalScore.entityPrecision * 100).toFixed(1)}%  R=${(finalScore.entityRecall * 100).toFixed(1)}%  F1=${(finalScore.entityF1 * 100).toFixed(1)}%  (${finalScore.correctEntities}/${finalScore.totalGroundTruthEntities} found)`);
    console.log(`    Relationships: P=${(finalScore.relationshipPrecision * 100).toFixed(1)}%  R=${(finalScore.relationshipRecall * 100).toFixed(1)}%  F1=${(finalScore.relationshipF1 * 100).toFixed(1)}%  (${finalScore.correctRelations}/${finalScore.totalGroundTruthRelations} found)`);
    console.log(`    Privacy score: ${(finalScore.privacyScore * 100).toFixed(1)}%`);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  console.log(`[run-harness] Processed ${finalAtomCount} atoms in ${duration}s`);

  // Write reports
  const { jsonPath, mdPath } = writeReports(checkpointResults, reportsDir);

  console.log('');
  console.log('[run-harness] Reports written:');
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  Markdown: ${mdPath}`);
}

main().catch((err) => {
  console.error('[run-harness] Fatal error:', err);
  process.exit(1);
});
