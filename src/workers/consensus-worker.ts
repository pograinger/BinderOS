/**
 * Consensus Worker — ONNX specialist risk model inference.
 *
 * Loads 4 specialist ONNX models lazily on the first RUN_SPECIALISTS request.
 * Sessions are cached in a Map after first load (model load is expensive).
 *
 * Message protocol:
 * Incoming:
 *   { type: 'RUN_SPECIALISTS'; id: string; fullVector: number[]; slices: Array<{ name: string; indices: number[] }> }
 * Outgoing:
 *   { type: 'SPECIALIST_RESULTS'; id: string; results: Array<{ name: string; probability: number }> }
 *   { type: 'SPECIALIST_ERROR'; id: string; error: string }
 *
 * The worker is stateless except for the cached ONNX sessions.
 * fullVector: 84-dim concatenated [task(27) | person(23) | calendar(34)] canonical vector.
 * slices: per-specialist index arrays into fullVector — passed by the runner so the
 *         worker remains generic (no TypeScript src/ imports needed in workers).
 *
 * ONNX output layout (zipmap=False):
 *   output[0] = label  (N,)       — predicted class
 *   output[1] = probs  (N, 2)     — [p_class0, p_class1] per sample
 * Positive-class probability: result[1][1] (second element of probs for the single sample).
 *
 * Phase 36: CONS-04
 */

import * as ort from 'onnxruntime-web';

// Disable proxy (same pattern as embedding-worker.ts)
ort.env.wasm.proxy = false;
ort.env.wasm.numThreads = 1;

// ---------------------------------------------------------------------------
// Cached ONNX inference sessions — loaded lazily on first RUN_SPECIALISTS
// ---------------------------------------------------------------------------

const sessions = new Map<string, ort.InferenceSession>();
let sessionsLoading = false;
let sessionsReady = false;

/**
 * Load all 4 specialist ONNX sessions lazily.
 * Idempotent: subsequent calls return immediately after first load.
 */
async function ensureSessionsLoaded(specialistNames: string[]): Promise<void> {
  if (sessionsReady) return;
  if (sessionsLoading) {
    // Wait for the in-flight load to complete
    while (sessionsLoading) {
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }
    return;
  }

  sessionsLoading = true;
  try {
    for (const name of specialistNames) {
      if (!sessions.has(name)) {
        const path = `/models/specialists/${name}-risk.onnx`;
        const session = await ort.InferenceSession.create(path, {
          executionProviders: ['wasm'],
          graphOptimizationLevel: 'all',
        });
        sessions.set(name, session);
      }
    }
    sessionsReady = true;
  } finally {
    sessionsLoading = false;
  }
}

// ---------------------------------------------------------------------------
// Run a single specialist
// ---------------------------------------------------------------------------

/**
 * Extract feature slice from fullVector and run inference.
 * Returns the positive-class probability (class 1 probability).
 */
async function runSpecialist(
  name: string,
  fullVector: number[],
  indices: number[],
): Promise<number> {
  const session = sessions.get(name);
  if (!session) {
    throw new Error(`[consensus-worker] No session loaded for specialist: ${name}`);
  }

  // Extract the feature slice
  const slicedFeatures = new Float32Array(indices.length);
  for (let i = 0; i < indices.length; i++) {
    slicedFeatures[i] = fullVector[indices[i]!] ?? 0;
  }

  // Build input tensor: shape [1, feature_count]
  const inputTensor = new ort.Tensor('float32', slicedFeatures, [1, slicedFeatures.length]);
  const feeds: Record<string, ort.Tensor> = { X: inputTensor };

  const results = await session.run(feeds);

  // ONNX output layout (zipmap=False):
  //   output[0] = label  (N,)    — predicted class label
  //   output[1] = probs  (N, 2)  — [[p_class0, p_class1]]
  // Positive-class (class 1) probability = output[1].data[1]
  const outputKeys = Object.keys(results);
  if (outputKeys.length < 2) {
    throw new Error(`[consensus-worker] Expected 2 outputs from ${name}, got ${outputKeys.length}`);
  }
  const probsOutput = results[outputKeys[1]!];
  if (!probsOutput) {
    throw new Error(`[consensus-worker] Missing probability output from ${name}`);
  }

  // probsOutput.data is Float32Array with layout [p_class0, p_class1] for 1 sample
  const probData = probsOutput.data as Float32Array;
  const positiveClassProb = probData[1] ?? 0;
  return positiveClassProb;
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

interface RunSpecialistsMessage {
  type: 'RUN_SPECIALISTS';
  id: string;
  fullVector: number[];
  slices: Array<{ name: string; indices: number[] }>;
}

self.onmessage = async (event: MessageEvent<RunSpecialistsMessage>) => {
  const msg = event.data;

  if (msg.type !== 'RUN_SPECIALISTS') return;

  const { id, fullVector, slices } = msg;

  try {
    const specialistNames = slices.map((s) => s.name);
    await ensureSessionsLoaded(specialistNames);

    const results: Array<{ name: string; probability: number }> = [];
    for (const slice of slices) {
      const probability = await runSpecialist(slice.name, fullVector, slice.indices);
      results.push({ name: slice.name, probability });
    }

    self.postMessage({ type: 'SPECIALIST_RESULTS', id, results });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    self.postMessage({ type: 'SPECIALIST_ERROR', id, error });
  }
};
