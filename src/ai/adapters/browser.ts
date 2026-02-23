/**
 * BrowserAdapter — routes AI requests through the dedicated LLM worker.
 *
 * Implements AIAdapter. Uses the llm-bridge to communicate with the
 * LLM worker (src/worker/llm-worker.ts) which runs SmolLM2 via Transformers.js.
 *
 * Architecture:
 *   Main thread (BrowserAdapter) -> llm-bridge.ts -> llm-worker.ts (SmolLM2)
 *
 * The LLM worker is completely isolated from the BinderCore worker. This prevents
 * OOM crashes during model inference from affecting atom mutations.
 *
 * Browser LLM works fully offline after initial model download. When offline,
 * the BrowserAdapter status remains 'available' — the model is cached locally.
 * Cloud features (CloudAdapter) handle their own offline status separately.
 *
 * Status flow:
 *   disabled -> loading (initialize() called) -> available (LLM_READY received)
 *   disabled -> loading -> error (init failed)
 *
 * LLM worker status changes flow:
 *   LLM_STATUS/LLM_READY/LLM_DOWNLOAD_PROGRESS -> onStatusChange callback -> setState in store
 */

import type { AIAdapter, AIRequest, AIResponse, AIProviderStatus } from './adapter';
import { dispatchLLM, onLLMMessage, initLLMWorker, terminateLLMWorker } from '../../worker/llm-bridge';
import type { LLMResponse } from '../../types/ai-messages';

export class BrowserAdapter implements AIAdapter {
  readonly id = 'browser' as const;
  private _status: AIProviderStatus = 'disabled';
  private pendingRequests = new Map<
    string,
    {
      resolve: (response: AIResponse) => void;
      reject: (error: Error) => void;
      onChunk?: (chunk: string) => void;
    }
  >();

  get status(): AIProviderStatus {
    return this._status;
  }

  /**
   * Optional callback for forwarding status changes to the store.
   * Set by the caller (e.g., store initialization code) before calling initialize().
   * Receives partial updates — only fields present in the update object are set.
   */
  onStatusChange?: (update: {
    status?: AIProviderStatus;
    device?: string;
    modelId?: string;
    downloadProgress?: number | null;
  }) => void;

  async initialize(): Promise<void> {
    this._status = 'loading';
    this.onStatusChange?.({ status: 'loading' });

    // Set up message handler BEFORE init so download progress is captured during model load
    onLLMMessage((response: LLMResponse) => {
      this.handleWorkerMessage(response);
    });

    try {
      await initLLMWorker();
      this._status = 'available';
      this.onStatusChange?.({ status: 'available' });
    } catch (err) {
      this._status = 'error';
      this.onStatusChange?.({ status: 'error' });
      throw err;
    }
  }

  private handleWorkerMessage(response: LLMResponse): void {
    switch (response.type) {
      case 'LLM_COMPLETE': {
        const pending = this.pendingRequests.get(response.payload.requestId);
        if (pending) {
          this.pendingRequests.delete(response.payload.requestId);
          pending.resolve({
            requestId: response.payload.requestId,
            text: response.payload.text,
            provider: 'browser',
          });
        }
        break;
      }
      case 'LLM_PROGRESS': {
        const pending = this.pendingRequests.get(response.payload.requestId);
        pending?.onChunk?.(response.payload.chunk);
        break;
      }
      case 'LLM_ERROR': {
        if (response.payload.requestId) {
          const pending = this.pendingRequests.get(response.payload.requestId);
          if (pending) {
            this.pendingRequests.delete(response.payload.requestId);
            pending.reject(new Error(response.payload.message));
          }
        }
        break;
      }
      case 'LLM_STATUS': {
        this._status = response.payload.status;
        this.onStatusChange?.({ status: response.payload.status });
        break;
      }
      case 'LLM_READY': {
        // Forward model identity to the store so StatusBar and AISettingsPanel can display it
        this.onStatusChange?.({
          status: 'available',
          modelId: response.payload.modelId,
          device: response.payload.device,
          downloadProgress: null, // download complete
        });
        break;
      }
      case 'LLM_DOWNLOAD_PROGRESS': {
        // Forward download progress to the store for the progress bar
        this.onStatusChange?.({
          downloadProgress: response.payload.progress,
        });
        break;
      }
    }
  }

  async execute(request: AIRequest): Promise<AIResponse> {
    if (this._status !== 'available') {
      throw new Error('Browser LLM not available');
    }

    return new Promise<AIResponse>((resolve, reject) => {
      this.pendingRequests.set(request.requestId, {
        resolve,
        reject,
        onChunk: request.onChunk,
      });

      dispatchLLM({
        type: 'LLM_REQUEST',
        payload: {
          requestId: request.requestId,
          prompt: request.prompt,
          maxTokens: request.maxTokens,
        },
      });

      // Handle abort signal (best-effort — LLM worker abort is not guaranteed mid-inference)
      if (request.signal) {
        request.signal.addEventListener('abort', () => {
          dispatchLLM({ type: 'LLM_ABORT', payload: { requestId: request.requestId } });
          this.pendingRequests.delete(request.requestId);
          reject(new Error('Request aborted'));
        });
      }
    });
  }

  dispose(): void {
    terminateLLMWorker();
    this.pendingRequests.clear();
    this._status = 'disabled';
  }
}

// --- Offline detection utilities ---

/**
 * Check whether the browser currently has network access.
 * Note: navigator.onLine can be unreliable (VPN, captive portals) —
 * treat as a hint, not a guarantee.
 *
 * Browser LLM works offline (model is cached) — this utility is primarily
 * used to gate cloud API features.
 */
export function isOnline(): boolean {
  return navigator.onLine;
}

/**
 * Register callbacks for online/offline events.
 * Returns an unregister function — call it on cleanup to avoid memory leaks.
 *
 * Usage:
 *   const unsubscribe = registerOnlineListener(
 *     () => setState('cloudStatus', 'unavailable'),
 *     () => setState('cloudStatus', 'available'),
 *   );
 *   onCleanup(unsubscribe);
 */
export function registerOnlineListener(
  onOffline: () => void,
  onOnline: () => void,
): () => void {
  window.addEventListener('offline', onOffline);
  window.addEventListener('online', onOnline);
  return () => {
    window.removeEventListener('offline', onOffline);
    window.removeEventListener('online', onOnline);
  };
}
