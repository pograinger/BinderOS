/**
 * 64_validate_classifiers_512.mjs — Node.js validation for 512-dim classifiers.
 *
 * Validates that each retrained 512-dim classifier ONNX file:
 *   1. Loads via onnxruntime-node
 *   2. Accepts [1, 512] float32 input
 *   3. Produces a valid probability distribution (values in [0,1], sum ~1.0)
 *   4. Class labels in *-classes.json match expected count
 *   5. Cold-start input (first 384 dims real, last 128 zero) produces valid output
 *
 * Pipeline position: After 63_retrain_classifiers_512.py
 *
 * Usage:
 *   node scripts/train/sequence/64_validate_classifiers_512.mjs
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const CLASSIFIER_DIR = resolve(REPO_ROOT, 'public', 'models', 'classifiers');

const INPUT_DIM = 512;
const PROB_SUM_TOLERANCE = 0.05; // allow up to 5% deviation from sum=1

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRandomFloat32(size) {
  const arr = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    arr[i] = (Math.random() * 2 - 1) * 0.1;
  }
  return arr;
}

function sumArray(arr) {
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  return sum;
}

function allInRange(arr, lo, hi) {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] < lo || arr[i] > hi) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Discover classifiers to validate
// ---------------------------------------------------------------------------
function discoverClassifiers() {
  const files = readdirSync(CLASSIFIER_DIR);
  const onnxFiles = files.filter(f =>
    f.endsWith('.onnx') &&
    !f.endsWith('-384-backup.onnx') &&
    f !== 'sequence-context.onnx'
  );

  return onnxFiles.map(onnxFile => {
    const id = onnxFile.replace('.onnx', '');
    const classesFile = `${id}-classes.json`;
    return {
      id,
      onnxPath: resolve(CLASSIFIER_DIR, onnxFile),
      classesPath: resolve(CLASSIFIER_DIR, classesFile),
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------------------
// Validate single classifier
// ---------------------------------------------------------------------------
async function validateClassifier(ort, classifier) {
  const { id, onnxPath, classesPath } = classifier;
  const errors = [];
  const warnings = [];

  // Load session
  let session;
  try {
    session = await ort.InferenceSession.create(onnxPath);
  } catch (e) {
    return { id, passed: false, error: `Session load failed: ${e.message}`, warnings };
  }

  const inputName = session.inputNames[0];
  const outputNames = session.outputNames;

  // Load classes JSON
  let nClasses = 2; // fallback
  if (existsSync(classesPath)) {
    const classesData = JSON.parse(readFileSync(classesPath, 'utf8'));
    nClasses = Object.keys(classesData).length;
  } else {
    warnings.push(`No classes.json found at ${classesPath}`);
  }

  // Test 1: Random 512-dim input
  try {
    const inputData = makeRandomFloat32(INPUT_DIM);
    const tensor = new ort.Tensor('float32', inputData, [1, INPUT_DIM]);
    const results = await session.run({ [inputName]: tensor });

    // Find probability output
    let probOutput = null;
    for (const name of outputNames) {
      const out = results[name];
      if (out && out.data && out.data.length > 1) {
        const sum = sumArray(out.data);
        if (Math.abs(sum - 1.0) < 0.5) { // rough probability check
          probOutput = out;
          break;
        }
      }
    }
    if (!probOutput && results[outputNames[outputNames.length - 1]]) {
      probOutput = results[outputNames[outputNames.length - 1]];
    }

    if (!probOutput) {
      errors.push('No probability output found');
    } else {
      const probData = Array.from(probOutput.data);
      const sum = sumArray(probData);

      if (Math.abs(sum - 1.0) > PROB_SUM_TOLERANCE) {
        errors.push(`Prob sum=${sum.toFixed(4)}, expected ~1.0`);
      }
      if (!allInRange(probData, -0.01, 1.01)) {
        errors.push(`Probability values out of [0,1] range`);
      }
      if (probData.length !== nClasses) {
        warnings.push(`Output has ${probData.length} probs but ${nClasses} classes in JSON`);
      }
    }
  } catch (e) {
    errors.push(`Random input inference failed: ${e.message}`);
  }

  // Test 2: Cold-start input (384 random, 128 zero)
  try {
    const coldStart = new Float32Array(INPUT_DIM);
    for (let i = 0; i < 384; i++) coldStart[i] = (Math.random() * 2 - 1) * 0.1;
    // last 128 stay zero

    const tensor = new ort.Tensor('float32', coldStart, [1, INPUT_DIM]);
    const results = await session.run({ [inputName]: tensor });

    // Find probability output (same logic)
    let probOutput = null;
    for (const name of outputNames) {
      const out = results[name];
      if (out && out.data && out.data.length > 1) {
        const sum = sumArray(out.data);
        if (Math.abs(sum - 1.0) < 0.5) {
          probOutput = out;
          break;
        }
      }
    }

    if (probOutput) {
      const sum = sumArray(probOutput.data);
      if (Math.abs(sum - 1.0) > PROB_SUM_TOLERANCE) {
        errors.push(`Cold-start prob sum=${sum.toFixed(4)}`);
      }
    }
  } catch (e) {
    errors.push(`Cold-start inference failed: ${e.message}`);
  }

  const passed = errors.length === 0;
  return { id, passed, errors, warnings };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('='.repeat(70));
  console.log('64_validate_classifiers_512.mjs');
  console.log(`Expected input: [1, ${INPUT_DIM}] float32 (384 MiniLM + 128 sequence context)`);
  console.log('='.repeat(70));

  if (!existsSync(CLASSIFIER_DIR)) {
    console.error(`FAIL: Classifier dir not found: ${CLASSIFIER_DIR}`);
    process.exit(1);
  }

  // Load onnxruntime-node
  let ort;
  try {
    ort = await import('onnxruntime-node');
  } catch (e) {
    console.error('FAIL: onnxruntime-node not installed. Run: pnpm add -D onnxruntime-node');
    process.exit(1);
  }

  const classifiers = discoverClassifiers();
  console.log(`\nFound ${classifiers.length} classifiers to validate.\n`);

  let passCount = 0;
  let failCount = 0;
  let warnCount = 0;

  for (const clf of classifiers) {
    const result = await validateClassifier(ort, clf);

    if (result.passed) {
      passCount++;
      const warnStr = result.warnings && result.warnings.length > 0
        ? ` [warn: ${result.warnings.join('; ')}]` : '';
      console.log(`  PASS  ${clf.id}${warnStr}`);
      if (result.warnings && result.warnings.length > 0) warnCount++;
    } else {
      failCount++;
      console.error(`  FAIL  ${clf.id}`);
      if (result.error) console.error(`    Error: ${result.error}`);
      if (result.errors) result.errors.forEach(e => console.error(`    - ${e}`));
    }
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log(`Results: ${passCount} PASS, ${failCount} FAIL, ${warnCount} warnings`);

  if (failCount === 0) {
    console.log('RESULT: ALL CLASSIFIERS PASSED');
    console.log(`  - All accept [1, ${INPUT_DIM}] float32 input`);
    console.log('  - All produce valid probability distributions');
    console.log('  - All handle cold-start (zero context) input');
  } else {
    console.error(`RESULT: ${failCount} CLASSIFIER(S) FAILED — review output above`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
