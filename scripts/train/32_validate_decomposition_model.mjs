/**
 * 32_validate_decomposition_model.mjs -- Node.js ONNX validation for decomposition classifier.
 *
 * Uses onnxruntime-node to validate that the decomposition ONNX model predictions
 * match Python onnxruntime inference at >95% top-1 accuracy.
 *
 * Usage:
 *   node scripts/train/32_validate_decomposition_model.mjs
 *
 * Prerequisites:
 *   pnpm add -D onnxruntime-node
 *   python -u scripts/train/31_train_decomposition_classifier.py
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

const MATCH_THRESHOLD = 95; // percent -- hard pass/fail gate
const MIN_SAMPLES = 20;

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

// ---------------------------------------------------------------------------
// Validate decomposition classifier
// ---------------------------------------------------------------------------
async function validate(ort) {
  const onnxPath = resolve(REPO_ROOT, 'public', 'models', 'classifiers', 'decomposition.onnx');
  const classesPath = resolve(REPO_ROOT, 'public', 'models', 'classifiers', 'decomposition-classes.json');
  const embPath = resolve(__dirname, 'decomposition_test_embeddings.json');
  const predPath = resolve(__dirname, 'decomposition_python_predictions.json');
  const probaPath = resolve(__dirname, 'decomposition_python_probabilities.json');

  console.log(`\n${'='.repeat(60)}`);
  console.log('Validating: decomposition');
  console.log('='.repeat(60));

  // Check prerequisites
  const paths = { onnxPath, classesPath, embPath, predPath, probaPath };
  const missing = Object.entries(paths).filter(([, p]) => !existsSync(p));
  if (missing.length > 0) {
    console.error('  FAILED: Missing files:');
    missing.forEach(([name, p]) => console.error(`    ${name}: ${p}`));
    process.exit(1);
  }

  // Load artifacts
  const testEmbeddings = JSON.parse(readFileSync(embPath, 'utf8'));
  const pythonPredictions = JSON.parse(readFileSync(predPath, 'utf8'));
  const pythonProbabilities = JSON.parse(readFileSync(probaPath, 'utf8'));
  const classMap = JSON.parse(readFileSync(classesPath, 'utf8'));

  const numClasses = Object.keys(classMap).length;
  console.log(`  Test samples: ${testEmbeddings.length}`);
  console.log(`  Classes (${numClasses}): ${Object.values(classMap).join(', ')}`);

  if (testEmbeddings.length < MIN_SAMPLES) {
    console.error(`  FAILED: Only ${testEmbeddings.length} samples (min ${MIN_SAMPLES})`);
    process.exit(1);
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
      if (mismatches.length < 10) {
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
    console.log(`\n  Mismatches (showing up to 10 of ${testEmbeddings.length - matchCount}):`);
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

  console.log(`\n${'='.repeat(60)}`);
  console.log('OVERALL RESULT');
  console.log('='.repeat(60));

  if (passed) {
    console.log(`  [PASS] decomposition: ${matchRate.toFixed(2)}%`);
    console.log('\nVALIDATION PASSED');
  } else {
    console.error(`  [FAIL] decomposition: ${matchRate.toFixed(2)}%`);
    console.error('\nVALIDATION FAILED');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  let ort;
  try {
    ort = await import('onnxruntime-node');
  } catch (err) {
    console.error('ERROR: Failed to import onnxruntime-node.');
    console.error('  Run: pnpm add -D onnxruntime-node');
    process.exit(1);
  }

  console.log('=== BinderOS Decomposition Classifier Validation ===');
  console.log('Backend: onnxruntime-node (CPU)');

  await validate(ort);
}

main().catch(err => {
  console.error('\nUnhandled error:', err.message ?? err);
  process.exit(1);
});
