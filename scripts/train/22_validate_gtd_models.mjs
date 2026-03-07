/**
 * 22_validate_gtd_models.mjs -- Node.js ONNX validation for GTD classifiers.
 *
 * Uses onnxruntime-node to validate that GTD ONNX model predictions match
 * Python onnxruntime inference at >95% top-1 accuracy.
 *
 * Usage:
 *   node scripts/train/22_validate_gtd_models.mjs --classifier gtd-routing
 *   node scripts/train/22_validate_gtd_models.mjs --all
 *
 * Prerequisites:
 *   pnpm add -D onnxruntime-node
 *   python -u scripts/train/21_train_gtd_classifier.py --classifier <name>
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

const MATCH_THRESHOLD = 95; // percent -- hard pass/fail gate
const MIN_SAMPLES = 20;

const CLASSIFIERS = ['gtd-routing', 'actionability', 'project-detection', 'context-tagging'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function argmax(arr) {
  let maxIdx = 0;
  let maxVal = arr[0];
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] > maxVal) {
      maxVal = arr[i];
      maxIdx = i;
    }
  }
  return maxIdx;
}

function safeName(classifierName) {
  return classifierName.replace(/-/g, '_');
}

// ---------------------------------------------------------------------------
// Validate single classifier
// ---------------------------------------------------------------------------
async function validateClassifier(classifierName, ort) {
  const safe = safeName(classifierName);

  const onnxPath = resolve(REPO_ROOT, 'public', 'models', 'classifiers', `${classifierName}.onnx`);
  const classesPath = resolve(REPO_ROOT, 'public', 'models', 'classifiers', `${classifierName}-classes.json`);
  const embPath = resolve(__dirname, `gtd_${safe}_test_embeddings.json`);
  const predPath = resolve(__dirname, `gtd_${safe}_python_predictions.json`);
  const probaPath = resolve(__dirname, `gtd_${safe}_python_probabilities.json`);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Validating: ${classifierName}`);
  console.log('='.repeat(60));

  // Check prerequisites
  const missing = [onnxPath, classesPath, embPath, predPath, probaPath].filter(p => !existsSync(p));
  if (missing.length > 0) {
    console.error(`  SKIPPED: Missing files:`);
    missing.forEach(m => console.error(`    ${m}`));
    return { name: classifierName, status: 'skipped', matchRate: 0 };
  }

  // Load artifacts
  const testEmbeddings = JSON.parse(readFileSync(embPath, 'utf8'));
  const pythonPredictions = JSON.parse(readFileSync(predPath, 'utf8'));
  const pythonProbabilities = JSON.parse(readFileSync(probaPath, 'utf8'));
  const classMap = JSON.parse(readFileSync(classesPath, 'utf8'));

  console.log(`  Test samples: ${testEmbeddings.length}`);
  console.log(`  Classes: ${JSON.stringify(classMap)}`);

  if (testEmbeddings.length < MIN_SAMPLES) {
    console.error(`  FAILED: Only ${testEmbeddings.length} samples (min ${MIN_SAMPLES})`);
    return { name: classifierName, status: 'failed', matchRate: 0 };
  }

  // Create session
  const session = await ort.InferenceSession.create(onnxPath, {
    executionProviders: ['cpu'],
  });
  console.log(`  Input names:  ${JSON.stringify(session.inputNames)}`);
  console.log(`  Output names: ${JSON.stringify(session.outputNames)}`);

  // Find probability output
  let probaOutputName = session.outputNames.find(n => n.toLowerCase().includes('prob'));
  if (!probaOutputName) {
    probaOutputName = session.outputNames.length > 1 ? session.outputNames[1] : session.outputNames[0];
  }

  // Run validation
  let matchCount = 0;
  let maxProbDiff = 0;
  const mismatches = [];

  for (let i = 0; i < testEmbeddings.length; i++) {
    const embedding = testEmbeddings[i];
    const pythonPred = pythonPredictions[i];
    const pythonProba = pythonProbabilities[i] || null;

    const inputData = Float32Array.from(embedding);
    const inputTensor = new ort.Tensor('float32', inputData, [1, 384]);

    const results = await session.run({ [session.inputNames[0]]: inputTensor });
    const probaOutput = results[probaOutputName];
    const probabilities = Array.from(probaOutput.data);

    const nodePred = argmax(probabilities);

    if (nodePred === pythonPred) {
      matchCount++;
    } else {
      if (mismatches.length < 5) {
        mismatches.push({
          index: i,
          pythonPred,
          nodePred,
          pythonLabel: classMap[String(pythonPred)] ?? `class_${pythonPred}`,
          nodeLabel: classMap[String(nodePred)] ?? `class_${nodePred}`,
        });
      }
    }

    if (pythonProba && pythonProba.length === probabilities.length) {
      for (let j = 0; j < probabilities.length; j++) {
        const diff = Math.abs(probabilities[j] - pythonProba[j]);
        if (diff > maxProbDiff) maxProbDiff = diff;
      }
    }
  }

  const matchRate = (matchCount / testEmbeddings.length) * 100;

  // Report
  if (mismatches.length > 0) {
    console.log(`\n  Mismatches (showing up to 5 of ${testEmbeddings.length - matchCount}):`);
    mismatches.forEach(m => {
      console.log(`    [${m.index}] Python="${m.pythonLabel}", Node="${m.nodeLabel}"`);
    });
  }

  console.log(`\n  Top-1 match rate: ${matchRate.toFixed(2)}% (${matchCount}/${testEmbeddings.length})`);
  console.log(`  Max probability diff: ${maxProbDiff.toFixed(6)}`);

  const passed = matchRate >= MATCH_THRESHOLD;
  if (passed) {
    console.log(`  PASSED: ${matchRate.toFixed(2)}% >= ${MATCH_THRESHOLD}%`);
  } else {
    console.error(`  FAILED: ${matchRate.toFixed(2)}% < ${MATCH_THRESHOLD}%`);
  }

  return { name: classifierName, status: passed ? 'passed' : 'failed', matchRate };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  let classifiersToValidate = [];

  if (args.includes('--all')) {
    classifiersToValidate = [...CLASSIFIERS];
  } else {
    const idx = args.indexOf('--classifier');
    if (idx >= 0 && args[idx + 1]) {
      classifiersToValidate = [args[idx + 1]];
    } else {
      console.error('Usage: node 22_validate_gtd_models.mjs --classifier <name> | --all');
      process.exit(1);
    }
  }

  let ort;
  try {
    ort = await import('onnxruntime-node');
  } catch (err) {
    console.error('ERROR: Failed to import onnxruntime-node.');
    console.error('  Run: pnpm add -D onnxruntime-node');
    process.exit(1);
  }

  console.log('=== BinderOS GTD Classifier Validation ===');
  console.log(`Backend: onnxruntime-node (CPU)`);
  console.log(`Classifiers: ${classifiersToValidate.join(', ')}`);

  const results = [];
  for (const name of classifiersToValidate) {
    const result = await validateClassifier(name, ort);
    results.push(result);
  }

  // Overall summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('OVERALL RESULTS');
  console.log('='.repeat(60));

  let allPassed = true;
  for (const r of results) {
    const icon = r.status === 'passed' ? 'PASS' : r.status === 'skipped' ? 'SKIP' : 'FAIL';
    console.log(`  [${icon}] ${r.name}: ${r.matchRate.toFixed(2)}%`);
    if (r.status !== 'passed') allPassed = false;
  }

  if (allPassed) {
    console.log('\nALL VALIDATIONS PASSED');
  } else {
    console.error('\nSOME VALIDATIONS FAILED');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\nUnhandled error:', err.message ?? err);
  process.exit(1);
});
