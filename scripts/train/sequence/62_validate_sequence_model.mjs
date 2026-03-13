/**
 * 62_validate_sequence_model.mjs — Node.js validation for sequence-context.onnx.
 *
 * Uses onnxruntime-node to validate that sequence-context.onnx:
 *   1. Loads successfully
 *   2. Accepts variable seq_len inputs (1, 3, 5, 7)
 *   3. Produces non-zero 128-dim output for each seq_len
 *   4. Output values are in reasonable range (not exploding/vanishing)
 *
 * Pipeline position: After 61_train_sequence_model.py
 *
 * Usage:
 *   node scripts/train/sequence/62_validate_sequence_model.mjs
 */

import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const ONNX_MODEL_PATH = resolve(REPO_ROOT, 'public', 'models', 'sequence-context.onnx');
const INPUT_DIM = 384;
const OUTPUT_DIM = 128;
const MAX_SIZE_BYTES = 512_000; // 500 KB

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeRandomFloat32(size) {
  const arr = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    arr[i] = (Math.random() * 2 - 1) * 0.1; // small random values
  }
  return arr;
}

function isAllZero(arr) {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] !== 0) return false;
  }
  return true;
}

function hasExplodingValues(arr, threshold = 1e4) {
  for (let i = 0; i < arr.length; i++) {
    if (!isFinite(arr[i]) || Math.abs(arr[i]) > threshold) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Main validation
// ---------------------------------------------------------------------------
async function main() {
  console.log('='.repeat(60));
  console.log('62_validate_sequence_model.mjs');
  console.log('='.repeat(60));

  // Check model file exists
  if (!existsSync(ONNX_MODEL_PATH)) {
    console.error(`FAIL: Model not found at ${ONNX_MODEL_PATH}`);
    console.error('Run: python -u scripts/train/sequence/61_train_sequence_model.py');
    process.exit(1);
  }

  // Check model file size
  const { statSync } = await import('fs');
  const stats = statSync(ONNX_MODEL_PATH);
  const sizeKB = (stats.size / 1024).toFixed(1);
  if (stats.size > MAX_SIZE_BYTES) {
    console.error(`FAIL: Model is ${sizeKB} KB — exceeds 500KB limit (${stats.size} bytes)`);
    process.exit(1);
  }
  console.log(`\nModel file: ${ONNX_MODEL_PATH}`);
  console.log(`File size:  ${sizeKB} KB — PASS (under 500KB)`);

  // Load ONNX runtime
  let ort;
  try {
    ort = await import('onnxruntime-node');
  } catch (e) {
    console.error('FAIL: onnxruntime-node not installed.');
    console.error('Run: pnpm add -D onnxruntime-node');
    process.exit(1);
  }

  // Create inference session
  let session;
  try {
    session = await ort.InferenceSession.create(ONNX_MODEL_PATH);
    console.log(`\nSession loaded: PASS`);
    console.log(`Input names:  ${session.inputNames.join(', ')}`);
    console.log(`Output names: ${session.outputNames.join(', ')}`);
  } catch (e) {
    console.error(`FAIL: Could not create inference session — ${e.message}`);
    process.exit(1);
  }

  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];

  // Test variable seq_len
  const seqLens = [1, 3, 5, 7];
  let allPassed = true;

  console.log('\n--- Variable seq_len inference tests ---');

  for (const seqLen of seqLens) {
    try {
      const totalElements = seqLen * 1 * INPUT_DIM;
      const inputData = makeRandomFloat32(totalElements);
      const inputTensor = new ort.Tensor('float32', inputData, [seqLen, 1, INPUT_DIM]);

      const results = await session.run({ [inputName]: inputTensor });
      const output = results[outputName];

      // Check output dimensions
      const lastDim = output.dims[output.dims.length - 1];
      if (lastDim !== OUTPUT_DIM) {
        console.error(`FAIL seq_len=${seqLen}: expected last dim ${OUTPUT_DIM}, got ${lastDim} (dims=${output.dims})`);
        allPassed = false;
        continue;
      }

      const outData = output.data;

      // Check not all zeros
      if (isAllZero(outData)) {
        console.error(`FAIL seq_len=${seqLen}: output is all zeros`);
        allPassed = false;
        continue;
      }

      // Check no exploding values
      if (hasExplodingValues(outData)) {
        console.error(`FAIL seq_len=${seqLen}: output has NaN/Inf or very large values`);
        allPassed = false;
        continue;
      }

      // Compute output stats for info
      const dataArr = Array.from(outData);
      const mean = dataArr.reduce((a, b) => a + b, 0) / dataArr.length;
      const max = Math.max(...dataArr);
      const min = Math.min(...dataArr);

      console.log(
        `  seq_len=${seqLen}: shape=[${output.dims.join(',')}] ` +
        `mean=${mean.toFixed(4)} min=${min.toFixed(4)} max=${max.toFixed(4)} — PASS`
      );
    } catch (e) {
      console.error(`FAIL seq_len=${seqLen}: runtime error — ${e.message}`);
      allPassed = false;
    }
  }

  // Test zero-padded input (cold-start case)
  console.log('\n--- Cold-start zero-padded input test ---');
  try {
    const seqLen = 7;
    const inputData = new Float32Array(seqLen * 1 * INPUT_DIM); // all zeros
    const inputTensor = new ort.Tensor('float32', inputData, [seqLen, 1, INPUT_DIM]);
    const results = await session.run({ [inputName]: inputTensor });
    const output = results[outputName];
    const outData = output.data;
    const nonZeroCount = Array.from(outData).filter(v => v !== 0).length;
    // With zero input, LSTM output may be small but typically not all zero
    console.log(`  Zero input (seq_len=7): ${nonZeroCount}/${OUTPUT_DIM} non-zero outputs — INFO`);
  } catch (e) {
    console.error(`  Zero input test error: ${e.message}`);
  }

  // Final verdict
  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log('RESULT: ALL TESTS PASSED');
    console.log(`  - Model under 500KB: PASS`);
    console.log(`  - Variable seq_len inference (1,3,5,7): PASS`);
    console.log(`  - Output shape [128]: PASS`);
    console.log(`  - Non-zero output: PASS`);
  } else {
    console.error('RESULT: SOME TESTS FAILED — review output above');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
