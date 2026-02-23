/**
 * Main-thread bridge for the dedicated LLM worker.
 *
 * Mirrors the pattern of src/worker/bridge.ts (BinderCore bridge).
 * The main thread (BrowserAdapter and store) uses this bridge exclusively —
 * no direct Worker construction or postMessage calls in AI adapter code.
 *
 * Message flow:
 *   Main thread calls dispatchLLM(command) -> LLM Worker processes -> postMessage response
 *   onLLMMessage handler receives response -> BrowserAdapter handles result
 */

import type { LLMCommand, LLMResponse } from '../types/ai-messages';

let worker: Worker | null = null;
let messageHandler: ((response: LLMResponse) => void) | null = null;

/**
 * Initialize the LLM worker and send LLM_INIT.
 * Returns a Promise that resolves with the LLM_READY response.
 * Rejects if the worker errors or sends LLM_ERROR during initialization.
 *
 * Call once when the user enables browser LLM (e.g., setBrowserLLMEnabled(true)).
 * Download progress and status updates are forwarded to the messageHandler during init.
 */
export function initLLMWorker(): Promise<LLMResponse> {
  worker = new Worker(new URL('./llm-worker.ts', import.meta.url), {
    type: 'module',
  });

  return new Promise((resolve, reject) => {
    if (!worker) return reject(new Error('LLM Worker failed to create'));

    worker.onmessage = (event: MessageEvent<LLMResponse>) => {
      const response = event.data;

      if (response.type === 'LLM_READY') {
        // Swap to the persistent handler so all subsequent messages are routed to it
        worker!.onmessage = (evt: MessageEvent<LLMResponse>) => {
          messageHandler?.(evt.data);
        };
        // Forward READY to the persistent handler (BrowserAdapter tracks model identity)
        messageHandler?.(response);
        resolve(response);
      } else if (response.type === 'LLM_ERROR' && !response.payload.requestId) {
        // Init-time error (no requestId means it's not a per-request error)
        reject(new Error(response.payload.message));
      } else {
        // Forward download progress, status updates etc. during initialization
        messageHandler?.(response);
      }
    };

    worker.onerror = (err) => reject(new Error(`LLM Worker error: ${err.message}`));

    // Kick off initialization
    dispatchLLM({ type: 'LLM_INIT' });
  });
}

/**
 * Send a typed command to the LLM Worker.
 * No-op if the worker has not been initialized.
 */
export function dispatchLLM(command: LLMCommand): void {
  worker?.postMessage(command);
}

/**
 * Register a persistent message handler for LLM Worker responses.
 * Set this BEFORE calling initLLMWorker() so download progress is captured.
 */
export function onLLMMessage(handler: (response: LLMResponse) => void): void {
  messageHandler = handler;
}

/**
 * Terminate the LLM Worker and reset bridge state.
 * Call when the user disables browser LLM or on app teardown.
 */
export function terminateLLMWorker(): void {
  worker?.terminate();
  worker = null;
  messageHandler = null;
}
