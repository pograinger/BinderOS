/**
 * LLM Web Worker — WebLLM inference engine (Phase 6 migration).
 *
 * Runs @mlc-ai/web-llm's WebWorkerMLCEngineHandler. The main thread
 * communicates via WebWorkerMLCEngine (in browser.ts), which sends
 * structured messages to this worker.
 *
 * WebLLM compiles models to WebGPU shaders using TVM; inference runs
 * entirely on the GPU. No CPU/WASM fallback — WebGPU is required.
 *
 * Replaces Phase 4's Transformers.js + SmolLM2 worker (src/worker/llm-worker.ts).
 */
import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

const handler = new WebWorkerMLCEngineHandler();

self.onmessage = (msg: MessageEvent) => {
  handler.onmessage(msg);
};
