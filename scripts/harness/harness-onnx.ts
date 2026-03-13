/**
 * ONNX session management for the harness Node.js context.
 *
 * Loads specialist risk models via onnxruntime-node (not a Worker).
 * The harness runs in Node.js where Workers are unavailable, so sessions
 * are created directly in the main process.
 *
 * Specialist models (4):
 *   - time-pressure-risk
 *   - dependency-risk
 *   - staleness-risk
 *   - energy-context-risk
 *
 * These are the same models trained by Phase 36 and loaded in the consensus
 * worker in production. The harness uses them directly for ablation runs.
 *
 * runSpecialistInference():
 *   - Extracts a feature slice from the full 84-dim canonical vector.
 *   - Returns probability from result['probabilities'].data[1]
 *     (positive class, matching consensus-worker.ts output[1] pattern).
 *
 * Phase 37: EII-01
 */

import * as path from 'path';
import * as ort from 'onnxruntime-node';

// ---------------------------------------------------------------------------
// HarnessONNXSessions — loaded specialist sessions
// ---------------------------------------------------------------------------

/**
 * Container for loaded ONNX InferenceSession instances.
 *
 * Only specialist models (4) — NOT all 14 T2 classifiers.
 * The existing harness pipeline handles T2 classifiers through its own path.
 */
export interface HarnessONNXSessions {
  specialists: Record<string, ort.InferenceSession>;
}

// ---------------------------------------------------------------------------
// Specialist model names
// ---------------------------------------------------------------------------

const SPECIALIST_MODEL_NAMES = [
  'time-pressure-risk',
  'dependency-risk',
  'staleness-risk',
  'energy-context-risk',
] as const;

// ---------------------------------------------------------------------------
// loadSpecialistSessions — load all specialist ONNX models in parallel
// ---------------------------------------------------------------------------

/**
 * Load all specialist ONNX models from the given models root directory.
 *
 * @param modelsRoot - Path to the directory containing specialist .onnx files.
 *   Defaults to public/models/specialists relative to the project root.
 */
export async function loadSpecialistSessions(
  modelsRoot: string = path.join(__dirname, '../../public/models/specialists'),
): Promise<HarnessONNXSessions> {
  const entries = await Promise.all(
    SPECIALIST_MODEL_NAMES.map(async (name) => {
      const modelPath = path.join(modelsRoot, `${name}.onnx`);
      const session = await ort.InferenceSession.create(modelPath);
      return [name, session] as const;
    }),
  );

  const specialists = Object.fromEntries(entries) as Record<string, ort.InferenceSession>;
  console.log(`[harness-onnx] Loaded ${entries.length} specialist models`);

  return { specialists };
}

// ---------------------------------------------------------------------------
// runSpecialistInference — run one specialist on a vector slice
// ---------------------------------------------------------------------------

/**
 * Run inference for a named specialist on the given full canonical vector.
 *
 * Extracts the specialist's feature slice from fullVector using featureIndices,
 * creates a Float32Array tensor, runs the session, and returns the positive-class
 * probability (index 1 of the 'probabilities' output).
 *
 * @param sessions      - Loaded HarnessONNXSessions
 * @param fullVector    - Full 84-dim canonical vector (task + person + calendar)
 * @param sliceName     - Specialist name key (must match sessions.specialists key)
 * @param featureIndices - Indices into fullVector for this specialist's slice
 */
export async function runSpecialistInference(
  sessions: HarnessONNXSessions,
  fullVector: number[],
  sliceName: string,
  featureIndices: number[],
): Promise<number> {
  const session = sessions.specialists[sliceName];
  if (!session) {
    throw new Error(`[harness-onnx] No session loaded for specialist: ${sliceName}`);
  }

  // Extract the feature slice
  const sliceData = new Float32Array(featureIndices.map((i) => fullVector[i] ?? 0));

  // Create input tensor: shape [1, sliceLength]
  const tensor = new ort.Tensor('float32', sliceData, [1, featureIndices.length]);

  // Run inference
  const result = await session.run({ X: tensor });

  // Return positive-class probability (index 1 of probabilities output)
  // Matches consensus-worker.ts output[1] pattern (Phase 36 decision)
  const probabilities = result['probabilities'];
  if (!probabilities) {
    throw new Error(`[harness-onnx] No 'probabilities' output from specialist: ${sliceName}`);
  }

  return (probabilities.data as Float32Array)[1] ?? 0;
}
