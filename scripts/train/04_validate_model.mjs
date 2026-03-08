/**
 * 04_validate_model.mjs — Node.js ONNX validation harness.
 *
 * Uses onnxruntime-node to validate that triage-type.onnx predictions match
 * Python onnxruntime inference at >95% top-1 accuracy. The same ONNX model
 * is used at runtime via onnxruntime-web in the browser.
 *
 * Pipeline position: After 03_train_classifier.py (ONNX + test artifacts must exist).
 *
 * Usage:
 *   node scripts/train/04_validate_model.mjs
 *
 * Prerequisites:
 *   pnpm add -D onnxruntime-node         (Node.js ONNX runtime)
 *   python scripts/train/03_train_classifier.py  (generates ONNX + test artifacts)
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// File paths
// ---------------------------------------------------------------------------
const ONNX_MODEL_PATH = resolve(REPO_ROOT, 'public', 'models', 'classifiers', 'triage-type.onnx');
const CLASSES_JSON_PATH = resolve(REPO_ROOT, 'public', 'models', 'classifiers', 'triage-type-classes.json');
const TEST_EMBEDDINGS_PATH = resolve(__dirname, 'test_embeddings.json');
const PYTHON_PREDICTIONS_PATH = resolve(__dirname, 'python_predictions.json');
const PYTHON_PROBABILITIES_PATH = resolve(__dirname, 'python_probabilities.json');

const MATCH_THRESHOLD = 95;   // percent — hard pass/fail gate (TRAIN-03)
const MIN_SAMPLES = 50;        // minimum test inputs required
const MAX_PROB_DIFF_WARN = 0.01; // warn but don't fail if max probability diff exceeds this

// ---------------------------------------------------------------------------
// Prerequisite checks
// ---------------------------------------------------------------------------
function checkPrerequisites() {
  const errors = [];

  if (!existsSync(ONNX_MODEL_PATH)) {
    errors.push(
      `ONNX model not found at public/models/classifiers/triage-type.onnx\n` +
      `  Run: python scripts/train/03_train_classifier.py`
    );
  }

  const artifactFiles = [TEST_EMBEDDINGS_PATH, PYTHON_PREDICTIONS_PATH, PYTHON_PROBABILITIES_PATH];
  const artifactMissing = artifactFiles.some(p => !existsSync(p));
  if (artifactMissing) {
    errors.push(
      `Test artifacts not found. Run scripts/train/03_train_classifier.py first.\n` +
      `  Expected:\n` +
      `    ${TEST_EMBEDDINGS_PATH}\n` +
      `    ${PYTHON_PREDICTIONS_PATH}\n` +
      `    ${PYTHON_PROBABILITIES_PATH}`
    );
  }

  if (errors.length > 0) {
    console.error('\nVALIDATION SETUP ERROR — Missing prerequisites:\n');
    errors.forEach((e, i) => console.error(`  ${i + 1}. ${e}`));
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Load test artifacts from Python script 03
// ---------------------------------------------------------------------------
function loadArtifacts() {
  console.log('\n=== Loading Test Artifacts ===');

  const testEmbeddings = JSON.parse(readFileSync(TEST_EMBEDDINGS_PATH, 'utf8'));
  const pythonPredictions = JSON.parse(readFileSync(PYTHON_PREDICTIONS_PATH, 'utf8'));
  const pythonProbabilities = JSON.parse(readFileSync(PYTHON_PROBABILITIES_PATH, 'utf8'));
  const classMap = JSON.parse(readFileSync(CLASSES_JSON_PATH, 'utf8'));

  console.log(`  Test embeddings: ${testEmbeddings.length} samples of dim ${testEmbeddings[0]?.length ?? 'unknown'}`);
  console.log(`  Python predictions: ${pythonPredictions.length}`);
  console.log(`  Python probabilities: ${pythonProbabilities.length} × ${pythonProbabilities[0]?.length ?? 'unknown'}`);
  console.log(`  Class map: ${JSON.stringify(classMap)}`);

  if (testEmbeddings.length < MIN_SAMPLES) {
    console.error(`\nERROR: Only ${testEmbeddings.length} test samples — minimum ${MIN_SAMPLES} required.`);
    console.error('Run 03_train_classifier.py with a larger dataset.');
    process.exit(1);
  }

  if (testEmbeddings.length !== pythonPredictions.length) {
    console.error('\nERROR: Mismatch between test embeddings and Python predictions count.');
    process.exit(1);
  }

  return { testEmbeddings, pythonPredictions, pythonProbabilities, classMap };
}

// ---------------------------------------------------------------------------
// Create ONNX inference session with WASM backend
// ---------------------------------------------------------------------------
async function createSession() {
  let ort;
  try {
    ort = await import('onnxruntime-node');
  } catch (importErr) {
    console.error('\nERROR: Failed to import onnxruntime-node.');
    console.error('  Run: pnpm add -D onnxruntime-node');
    console.error(`  Details: ${importErr.message}`);
    process.exit(1);
  }

  console.log('\n=== Creating ONNX Inference Session ===');
  console.log(`  Model: ${ONNX_MODEL_PATH}`);

  // onnxruntime-node can load directly from file path
  const session = await ort.InferenceSession.create(ONNX_MODEL_PATH, {
    executionProviders: ['cpu'],
  });

  console.log(`  Input names:  ${JSON.stringify(session.inputNames)}`);
  console.log(`  Output names: ${JSON.stringify(session.outputNames)}`);

  return { session, ort };
}

// ---------------------------------------------------------------------------
// Argmax helper
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
// Run validation loop
// ---------------------------------------------------------------------------
async function runValidation(session, ort, testEmbeddings, pythonPredictions, pythonProbabilities, classMap) {
  console.log('\n=== Running Validation ===');

  // Locate probability output — typically index 1 for CalibratedClassifierCV with zipmap=False
  const outputNames = session.outputNames;
  let probaOutputName = outputNames.find(n => n.toLowerCase().includes('prob'));
  if (!probaOutputName) {
    // Fallback: use index 1 (standard skl2onnx convention: [label, probability])
    probaOutputName = outputNames.length > 1 ? outputNames[1] : outputNames[0];
  }
  console.log(`  Using probability output: "${probaOutputName}"`);

  let matchCount = 0;
  let totalCount = testEmbeddings.length;
  let maxProbDiff = 0;
  let sumProbDiff = 0;
  const mismatches = [];

  process.stdout.write('  Progress: ');
  const reportInterval = Math.floor(totalCount / 10);

  for (let i = 0; i < totalCount; i++) {
    if (i > 0 && i % reportInterval === 0) {
      process.stdout.write('.');
    }

    const embedding = testEmbeddings[i];
    const pythonPred = pythonPredictions[i];
    const pythonProba = pythonProbabilities[i] || null;

    // Create input tensor: [1, 384] float32
    const inputData = Float32Array.from(embedding);
    const inputTensor = new ort.Tensor('float32', inputData, [1, 384]);

    // Run inference
    const results = await session.run({ [session.inputNames[0]]: inputTensor });

    // Extract probability output — shape [1, num_classes]
    const probaOutput = results[probaOutputName];
    const probabilities = Array.from(probaOutput.data);

    // Top-1 prediction from Node.js probabilities
    const nodePred = argmax(probabilities);

    // Compare with Python top-1
    const isMatch = nodePred === pythonPred;
    if (isMatch) {
      matchCount++;
    } else {
      mismatches.push({
        index: i,
        pythonPred,
        nodePred,
        nodeProba: probabilities,
        pythonProba: pythonProba,
      });
    }

    // Calculate max absolute probability difference vs Python
    if (pythonProba && pythonProba.length === probabilities.length) {
      let sampleMaxDiff = 0;
      let sampleSumDiff = 0;
      for (let j = 0; j < probabilities.length; j++) {
        const diff = Math.abs(probabilities[j] - pythonProba[j]);
        if (diff > sampleMaxDiff) sampleMaxDiff = diff;
        sampleSumDiff += diff;
      }
      if (sampleMaxDiff > maxProbDiff) maxProbDiff = sampleMaxDiff;
      sumProbDiff += sampleSumDiff / probabilities.length;
    }
  }
  process.stdout.write('\n');

  return { matchCount, totalCount, maxProbDiff, meanProbDiff: sumProbDiff / totalCount, mismatches };
}

// ---------------------------------------------------------------------------
// Report results
// ---------------------------------------------------------------------------
function reportResults({ matchCount, totalCount, maxProbDiff, meanProbDiff, mismatches }, classMap) {
  console.log('\n=== Validation Results ===');

  // Print mismatches
  if (mismatches.length > 0) {
    console.log(`\n  Mismatches (${mismatches.length}):`);
    mismatches.forEach(m => {
      const pythonLabel = classMap[String(m.pythonPred)] ?? `class_${m.pythonPred}`;
      const nodeLabel = classMap[String(m.nodePred)] ?? `class_${m.nodePred}`;
      console.log(`    [${m.index}] Python="${pythonLabel}" (${m.pythonPred}), Node="${nodeLabel}" (${m.nodePred})`);
      if (m.pythonProba && m.nodeProba) {
        const pythonStr = m.pythonProba.map(v => v.toFixed(4)).join(', ');
        const nodeStr = m.nodeProba.map(v => v.toFixed(4)).join(', ');
        console.log(`         Python proba: [${pythonStr}]`);
        console.log(`         Node   proba: [${nodeStr}]`);
      }
    });
  }

  const matchRate = (matchCount / totalCount) * 100;

  console.log(`\n  Top-1 match rate:   ${matchRate.toFixed(2)}% (${matchCount}/${totalCount})`);
  console.log(`  Max probability diff:  ${maxProbDiff.toFixed(6)}`);
  console.log(`  Mean probability diff: ${meanProbDiff.toFixed(6)}`);

  if (maxProbDiff > MAX_PROB_DIFF_WARN) {
    console.log(`\n  WARNING: Max probability diff ${maxProbDiff.toFixed(6)} > ${MAX_PROB_DIFF_WARN} threshold.`);
    console.log('  Small differences are expected due to WASM float32 vs Python float64 rounding.');
    console.log('  If differences are large (>0.05), inspect the ONNX export parameters.');
  }

  // Pass/fail gate (TRAIN-03)
  console.log('');
  if (matchRate < MATCH_THRESHOLD) {
    console.error(`VALIDATION FAILED: match rate ${matchRate.toFixed(2)}% is below ${MATCH_THRESHOLD}% threshold.`);
    console.error('Troubleshooting:');
    console.error('  1. Verify ONNX export used opset=17 and zipmap=False');
    console.error('  2. Check that embeddings are float32 (not float64) — see 02_embed_data.py');
    console.error('  3. Re-run 03_train_classifier.py to regenerate model and test artifacts');
    process.exit(1);
  } else {
    console.log(`VALIDATION PASSED: model ready for Phase 10 integration.`);
    console.log(`  Top-1 match rate: ${matchRate.toFixed(2)}% >= ${MATCH_THRESHOLD}% threshold.`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== BinderOS triage-type.onnx Validation ===');
  console.log('Backend: onnxruntime-node (CPU)');

  checkPrerequisites();

  const { testEmbeddings, pythonPredictions, pythonProbabilities, classMap } = loadArtifacts();

  const { session, ort } = await createSession();

  const validationResults = await runValidation(
    session, ort, testEmbeddings, pythonPredictions, pythonProbabilities, classMap
  );

  reportResults(validationResults, classMap);
}

main().catch(err => {
  console.error('\nUnhandled error:', err.message ?? err);
  process.exit(1);
});
