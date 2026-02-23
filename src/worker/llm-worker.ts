/**
 * Dedicated LLM Web Worker — SmolLM2 inference via Transformers.js.
 *
 * ISOLATION NOTE: This is a DedicatedWorker, NOT a ServiceWorker.
 * It is completely separate from the BinderCore worker (src/worker/worker.ts).
 * This separation prevents OOM crashes and unblocks atom mutations during inference.
 *
 * WebGPU detection runs INSIDE this worker (not the main thread) per RESEARCH.md
 * anti-pattern guidance. This avoids importing GPU-detection logic into app bootstrap.
 *
 * Model tiers:
 *   webgpu — HuggingFaceTB/SmolLM2-360M-Instruct ("Quality") — fp16
 *   wasm   — HuggingFaceTB/SmolLM2-135M-Instruct  ("Fast")    — q8
 *
 * CAVEAT: Dev mode may re-download models on full reload (RESEARCH.md Pitfall 2).
 * This is expected behaviour during development. Production uses the service worker cache.
 *
 * navigator.storage.persist() is NOT called here — it is already called by the
 * BinderCore persistence module (RESEARCH.md Open Question 2). Do not add a second call.
 */

import { pipeline, env } from '@huggingface/transformers';
import type { ProgressInfo } from '@huggingface/transformers';
import type { LLMCommand, LLMResponse } from '../types/ai-messages';

// Use remote Hugging Face Hub models only — no local model paths
env.allowLocalModels = false;

const MODEL_TIERS = {
  webgpu: 'HuggingFaceTB/SmolLM2-360M-Instruct', // "Quality" tier
  wasm: 'HuggingFaceTB/SmolLM2-135M-Instruct', // "Fast" tier
} as const;

// Active pipeline — null until initModel() completes
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let generator: any | null = null;

// Pending abort controllers keyed by requestId
// NOTE: Transformers.js pipeline does not natively support abort.
// If the request is still queued, it will be removed; if executing, it will complete.
const abortControllers = new Map<string, AbortController>();

/**
 * WebGPU GPU adapter interface (subset used for device detection).
 * Not in TypeScript's default lib because tsconfig uses browser lib, not webworker.
 */
interface GPUInterface {
  requestAdapter(): Promise<unknown | null>;
}

/**
 * Detect available compute device inside the worker.
 * Runs inside the dedicated worker — NOT on the main thread.
 *
 * Uses the same check as Transformers.js `apis.IS_WEBGPU_AVAILABLE`:
 *   typeof navigator !== 'undefined' && 'gpu' in navigator
 */
async function detectDevice(): Promise<'webgpu' | 'wasm'> {
  // Canonical WebGPU availability check (mirrors Transformers.js env.js)
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) return 'wasm';

  try {
    const gpu = (navigator as unknown as { gpu: GPUInterface }).gpu;
    const adapter = await gpu.requestAdapter();
    return adapter !== null ? 'webgpu' : 'wasm';
  } catch {
    return 'wasm';
  }
}

/**
 * Send a typed LLMResponse to the main thread.
 */
function postResponse(response: LLMResponse): void {
  self.postMessage(response);
}

/**
 * Initialize the SmolLM2 pipeline with download progress reporting.
 */
async function initModel(modelId: string, device: 'webgpu' | 'wasm'): Promise<void> {
  generator = await pipeline('text-generation', modelId, {
    device,
    dtype: device === 'webgpu' ? 'fp16' : 'q8',
    progress_callback: (progressInfo: ProgressInfo) => {
      // Only ProgressStatusInfo has progress/loaded/total fields
      if (progressInfo.status === 'progress') {
        postResponse({
          type: 'LLM_DOWNLOAD_PROGRESS',
          payload: {
            progress: Math.round(progressInfo.progress ?? 0),
            loaded: progressInfo.loaded ?? 0,
            total: progressInfo.total ?? 0,
          },
        });
      }
    },
  });
}

self.onmessage = async (event: MessageEvent<LLMCommand>) => {
  const msg = event.data;

  try {
    switch (msg.type) {
      case 'LLM_INIT': {
        postResponse({
          type: 'LLM_STATUS',
          payload: { status: 'loading' },
        });

        const device = await detectDevice();
        const modelId = MODEL_TIERS[device];
        const tier: 'fast' | 'quality' = device === 'webgpu' ? 'quality' : 'fast';

        await initModel(modelId, device);

        postResponse({
          type: 'LLM_READY',
          payload: { modelId, device, tier },
        });
        break;
      }

      case 'LLM_REQUEST': {
        if (!generator) {
          postResponse({
            type: 'LLM_ERROR',
            payload: {
              requestId: msg.payload.requestId,
              message: 'LLM not initialized — send LLM_INIT first',
            },
          });
          break;
        }

        const { requestId, prompt, maxTokens } = msg.payload;

        // Register abort controller for this request (best-effort — pipeline does not support native abort)
        const controller = new AbortController();
        abortControllers.set(requestId, controller);

        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const output: any = await generator(prompt, {
            max_new_tokens: maxTokens ?? 256,
          });

          // Check if aborted before sending response
          if (!abortControllers.has(requestId)) {
            // Request was aborted — already handled, do not send response
            break;
          }
          abortControllers.delete(requestId);

          // Extract generated text from pipeline output
          // Transformers.js text-generation returns: [{ generated_text: string }]
          const generatedText: string =
            Array.isArray(output) && output.length > 0
              ? (output[0].generated_text as string) ?? ''
              : String(output);

          postResponse({
            type: 'LLM_COMPLETE',
            payload: { requestId, text: generatedText },
          });
        } catch (err) {
          abortControllers.delete(requestId);
          postResponse({
            type: 'LLM_ERROR',
            payload: {
              requestId,
              message: err instanceof Error ? err.message : String(err),
            },
          });
        }
        break;
      }

      case 'LLM_ABORT': {
        const { requestId } = msg.payload;
        const controller = abortControllers.get(requestId);
        if (controller) {
          controller.abort();
          abortControllers.delete(requestId);
        }
        break;
      }

      default: {
        // TypeScript exhaustiveness check
        const _exhaustive: never = msg;
        void _exhaustive;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    postResponse({
      type: 'LLM_ERROR',
      payload: { message },
    });
  }
};
