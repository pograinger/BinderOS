/**
 * 12_validate_sanitizer.mjs — Browser-compatible ONNX NER validation.
 *
 * Uses @huggingface/transformers to load the exported sanitization NER model
 * and validate that it can detect PII entities in a Node.js environment.
 * This validates the model works with Transformers.js — the same pipeline
 * that will run in the sanitization worker in the browser.
 *
 * Pipeline position: After 11_train_sanitizer.py (ONNX model must exist).
 *
 * Usage:
 *   node scripts/train/12_validate_sanitizer.mjs
 *
 * Prerequisites:
 *   python scripts/train/11_train_sanitizer.py  (exports ONNX model)
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// File paths
// ---------------------------------------------------------------------------
const MODEL_DIR = resolve(REPO_ROOT, 'public', 'models', 'sanitization');
const ONNX_DIR = resolve(MODEL_DIR, 'onnx');

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------
const TEST_CASES = [
  {
    input: 'Meeting with John Smith at the office',
    expectedCategories: ['PERSON'],
    description: 'Should detect PERSON "John Smith"',
  },
  {
    input: 'Call sarah.jones@gmail.com about the project',
    expectedCategories: ['CONTACT'],
    description: 'Should detect CONTACT (email)',
  },
  {
    input: 'Invoice for $5,000.00 from Acme Corp',
    expectedCategories: ['FINANCIAL'],
    description: 'Should detect FINANCIAL amount',
  },
  {
    input: 'API key: sk-abc123def456ghi789jkl012mno345pqr678stu901vwx',
    expectedCategories: ['CREDENTIAL'],
    description: 'Should detect CREDENTIAL (API key)',
  },
  {
    input: 'Buy groceries and clean the house',
    expectedCategories: [],
    description: 'Should detect NO entities (negative case)',
  },
];

// ---------------------------------------------------------------------------
// Prerequisite checks
// ---------------------------------------------------------------------------
function checkPrerequisites() {
  const errors = [];

  if (!existsSync(MODEL_DIR)) {
    errors.push(
      `Model directory not found: ${MODEL_DIR}\n` +
      `  Run: python scripts/train/11_train_sanitizer.py`
    );
  }

  const requiredFiles = ['config.json', 'tokenizer.json', 'tokenizer_config.json'];
  for (const file of requiredFiles) {
    if (!existsSync(resolve(MODEL_DIR, file))) {
      errors.push(`Missing model file: ${file}`);
    }
  }

  // Check for ONNX model (could be model.onnx or model_quantized.onnx)
  const hasOnnx = existsSync(resolve(ONNX_DIR, 'model.onnx')) ||
                  existsSync(resolve(ONNX_DIR, 'model_quantized.onnx'));
  if (!hasOnnx) {
    errors.push(
      `No ONNX model found in ${ONNX_DIR}\n` +
      `  Expected: model.onnx or model_quantized.onnx`
    );
  }

  if (errors.length > 0) {
    console.error('\nVALIDATION SETUP ERROR -- Missing prerequisites:\n');
    errors.forEach((e, i) => console.error(`  ${i + 1}. ${e}`));
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Map NER label to entity category
// ---------------------------------------------------------------------------
function mapLabelToCategory(label) {
  // Labels from model: B-PERSON, I-PERSON, B-LOCATION, etc.
  // entity_group from aggregation_strategy='simple': PERSON, LOCATION, etc.
  const clean = label.replace(/^[BI]-/, '');
  const categories = ['PERSON', 'LOCATION', 'FINANCIAL', 'CONTACT', 'CREDENTIAL'];
  if (categories.includes(clean)) return clean;
  return label; // Return as-is if unknown
}

// ---------------------------------------------------------------------------
// Main validation
// ---------------------------------------------------------------------------
async function main() {
  console.log('=== BinderOS Sanitization NER Model Validation ===');
  console.log('Backend: @huggingface/transformers (Transformers.js)\n');

  checkPrerequisites();

  // Dynamically import Transformers.js
  let transformers;
  try {
    transformers = await import('@huggingface/transformers');
  } catch (err) {
    console.error('ERROR: Failed to import @huggingface/transformers');
    console.error('  Ensure it is installed: pnpm add @huggingface/transformers');
    console.error(`  Details: ${err.message}`);
    process.exit(1);
  }

  const { pipeline, env } = transformers;

  // Configure for local model loading (no remote fetches)
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = resolve(REPO_ROOT, 'public', 'models') + '/';

  console.log('=== Loading Model ===');
  console.log(`  Model path: ${MODEL_DIR}`);
  console.log(`  Local model path: ${env.localModelPath}`);

  const loadStart = performance.now();

  let nerPipeline;
  try {
    // Try q8 first, then default
    try {
      nerPipeline = await pipeline('token-classification', 'sanitization', {
        dtype: 'q8',
        local_files_only: true,
      });
    } catch {
      // Fall back to default dtype
      nerPipeline = await pipeline('token-classification', 'sanitization', {
        local_files_only: true,
      });
    }
  } catch (err) {
    console.error(`\nERROR: Failed to load NER model: ${err.message}`);
    console.error('  Check that public/models/sanitization/ contains:');
    console.error('    config.json, tokenizer.json, tokenizer_config.json, onnx/model*.onnx');
    process.exit(1);
  }

  const loadTime = performance.now() - loadStart;
  console.log(`  Model loaded in ${loadTime.toFixed(0)}ms\n`);

  // Run test cases
  console.log('=== Running Test Cases ===\n');

  let passed = 0;
  let failed = 0;
  const results = [];

  for (let i = 0; i < TEST_CASES.length; i++) {
    const tc = TEST_CASES[i];
    console.log(`Test ${i + 1}: ${tc.description}`);
    console.log(`  Input: "${tc.input}"`);

    const inferStart = performance.now();
    let entities;
    try {
      entities = await nerPipeline(tc.input, { aggregation_strategy: 'simple' });
    } catch (err) {
      console.log(`  ERROR: ${err.message}`);
      failed++;
      results.push({ ...tc, entities: [], error: err.message, pass: false });
      continue;
    }
    const inferTime = performance.now() - inferStart;

    // Map to categories
    const detectedCategories = entities.map(e => mapLabelToCategory(e.entity_group || e.entity));
    const uniqueCategories = [...new Set(detectedCategories)];

    console.log(`  Entities detected: ${entities.length}`);
    for (const e of entities) {
      const category = mapLabelToCategory(e.entity_group || e.entity);
      const word = e.word || tc.input.slice(e.start, e.end);
      console.log(`    ${category}: "${word}" (confidence: ${(e.score * 100).toFixed(1)}%, span: ${e.start}-${e.end})`);
    }
    console.log(`  Inference time: ${inferTime.toFixed(0)}ms`);

    // Check expectations
    let testPass;
    if (tc.expectedCategories.length === 0) {
      // Negative case: should detect no entities (or very low confidence)
      const significantEntities = entities.filter(e => e.score > 0.5);
      testPass = significantEntities.length === 0;
      if (!testPass) {
        console.log(`  WARN: Expected no entities but found ${significantEntities.length} with confidence > 0.5`);
        // Still pass if entities are low confidence
        testPass = entities.every(e => e.score < 0.3);
      }
    } else {
      // Positive case: at least one expected category should be detected
      testPass = tc.expectedCategories.some(expected =>
        uniqueCategories.includes(expected)
      );
    }

    console.log(`  Result: ${testPass ? 'PASS' : 'FAIL'}\n`);

    if (testPass) passed++;
    else failed++;

    results.push({ ...tc, entities, pass: testPass, inferTime });
  }

  // Summary
  console.log('=== Validation Summary ===');
  console.log(`  Total tests: ${TEST_CASES.length}`);
  console.log(`  Passed:      ${passed}`);
  console.log(`  Failed:      ${failed}`);
  console.log(`  Model load:  ${loadTime.toFixed(0)}ms`);

  const avgInfer = results
    .filter(r => r.inferTime)
    .reduce((sum, r) => sum + r.inferTime, 0) / results.filter(r => r.inferTime).length;
  console.log(`  Avg inference: ${avgInfer.toFixed(0)}ms per test case`);

  console.log('');
  if (failed > 0) {
    console.error(`VALIDATION FAILED: ${failed} test(s) did not produce expected entity categories.`);
    console.error('Check model training quality and entity coverage.');
    process.exit(1);
  } else {
    console.log('VALIDATION PASSED: NER model is browser-inference-ready.');
    console.log('  All entity categories detected as expected.');
  }
}

main().catch(err => {
  console.error('\nUnhandled error:', err.message ?? err);
  process.exit(1);
});
