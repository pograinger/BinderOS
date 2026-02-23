/**
 * Main-thread Worker bridge.
 *
 * Provides typed dispatch and message handling for the Web Worker.
 * The main thread (SolidJS components) uses this bridge exclusively —
 * no direct Worker construction or postMessage calls in UI code.
 */
import type { Command, Response } from '../types/messages';

// Create Worker instance with ESM module type
// Vite resolves the import.meta.url correctly for bundling
const worker = new Worker(new URL('./worker.ts', import.meta.url), {
  type: 'module',
});

/**
 * Send a typed command to the Worker.
 */
export function dispatch(command: Command): void {
  worker.postMessage(command);
}

/**
 * Register a handler for Worker responses.
 * Pass the handler directly to worker.onmessage — no destructuring.
 */
export function onMessage(handler: (response: Response) => void): void {
  worker.onmessage = (event: MessageEvent<Response>) => {
    handler(event.data);
  };
}

/**
 * Initialize the Worker: send INIT, return a Promise that resolves
 * when the Worker responds with READY.
 *
 * Call once at app startup (onMount in App component).
 * Rejects if Worker responds with ERROR instead.
 */
export function initWorker(): Promise<Response> {
  return new Promise((resolve, reject) => {
    const originalHandler = worker.onmessage;

    worker.onmessage = (event: MessageEvent<Response>) => {
      const response = event.data;

      // Restore original handler before resolving/rejecting
      worker.onmessage = originalHandler;

      if (response.type === 'READY') {
        // Forward READY to the store handler so state.ready becomes true
        if (originalHandler) {
          originalHandler.call(worker, event);
        }
        resolve(response);
      } else if (response.type === 'ERROR') {
        reject(new Error(response.payload.message));
      } else {
        // Unexpected response during init — still resolve so app can proceed
        resolve(response);
      }
    };

    worker.onerror = (err) => {
      worker.onmessage = originalHandler;
      reject(new Error(`Worker error: ${err.message}`));
    };

    dispatch({ type: 'INIT' });
  });
}
