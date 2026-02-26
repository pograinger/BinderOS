/**
 * BrowserAdapter — local AI via WebLLM (Phase 6 migration).
 *
 * Uses @mlc-ai/web-llm's WebWorkerMLCEngine for GPU-accelerated inference
 * with guaranteed structured JSON output via XGrammar.
 *
 * Replaces Phase 4's Transformers.js + SmolLM2 BrowserAdapter.
 *
 * Architecture:
 *   Main thread (BrowserAdapter) -> WebWorkerMLCEngine -> llm-worker.ts (WebLLM/WebGPU)
 *
 * WebGPU is required — no CPU/WASM fallback (WebLLM does not support WASM inference).
 *
 * Status flow:
 *   disabled -> loading (initialize() called) -> available (engine ready)
 *   disabled -> loading -> error (init failed)
 *
 * LLM worker status changes flow:
 *   initProgressCallback -> onStatusChange callback -> setState in store
 */
import {
  CreateWebWorkerMLCEngine,
  type MLCEngineInterface,
  type InitProgressReport,
} from '@mlc-ai/web-llm';
import type { AIAdapter, AIRequest, AIResponse, AIProviderStatus } from './adapter';

// Model presets — label includes VRAM guidance shown in AI Settings panel
export const WEBLLM_MODELS = [
  { id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC', label: '1B (Low VRAM ~900MB)', vram: '~900MB' },
  { id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', label: '3B (Default ~2.2GB)', vram: '~2.2GB' },
  { id: 'Phi-3.5-mini-instruct-q4f16_1-MLC', label: '3.8B (High VRAM ~3.7GB)', vram: '~3.7GB' },
] as const;

export const DEFAULT_MODEL_ID = 'Llama-3.2-3B-Instruct-q4f16_1-MLC';

export class BrowserAdapter implements AIAdapter {
  readonly id = 'browser' as const;

  private engine: MLCEngineInterface | null = null;
  private modelId: string;
  private _status: AIProviderStatus = 'disabled';

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

  constructor(modelId: string = DEFAULT_MODEL_ID) {
    this.modelId = modelId;
  }

  get status(): AIProviderStatus {
    return this._status;
  }

  async initialize(): Promise<void> {
    this._status = 'loading';
    this.onStatusChange?.({ status: 'loading' });

    try {
      const worker = new Worker(
        new URL('../llm-worker.ts', import.meta.url),
        { type: 'module' },
      );

      this.engine = await CreateWebWorkerMLCEngine(worker, this.modelId, {
        initProgressCallback: (report: InitProgressReport) => {
          // report.progress is 0-1; multiply by 100 for percentage display
          this.onStatusChange?.({
            downloadProgress: Math.round(report.progress * 100),
          });
        },
      });

      this._status = 'available';
      this.onStatusChange?.({
        status: 'available',
        downloadProgress: null, // download complete
        modelId: this.modelId,
        device: 'webgpu',
      });
    } catch (err) {
      console.error('[BrowserAdapter] WebLLM init failed:', err);
      this._status = 'error';
      this.onStatusChange?.({ status: 'error' });
      throw err;
    }
  }

  async execute(request: AIRequest): Promise<AIResponse> {
    if (!this.engine || this._status !== 'available') {
      throw new Error('BrowserAdapter not initialized — call initialize() first');
    }

    // Explicit non-streaming request — response_format with JSON schema for XGrammar constrained generation
    const completionParams: {
      messages: { role: string; content: string }[];
      max_tokens: number;
      temperature: number;
      stream?: false;
      response_format?: { type: string; schema: string };
    } = {
      messages: [
        { role: 'system', content: 'You are a helpful GTD productivity assistant.' },
        { role: 'user', content: request.prompt },
      ],
      max_tokens: request.maxTokens ?? 512,
      temperature: 0.3,
      stream: false,
    };

    // Structured JSON output via XGrammar constrained generation
    if (request.jsonSchema) {
      completionParams.response_format = {
        type: 'json_object',
        schema: JSON.stringify(request.jsonSchema),
      };
    }

    // Use chatCompletion directly to get typed non-streaming response
    const reply = await this.engine.chatCompletion(completionParams as Parameters<typeof this.engine.chatCompletion>[0]);
    // At runtime, non-streaming returns ChatCompletion (has .choices); streaming returns AsyncIterable
    const chatCompletion = reply as { choices: { message: { content: string | null } }[] };
    const content = chatCompletion.choices?.[0]?.message?.content ?? '';

    return {
      requestId: request.requestId,
      text: content,
      provider: 'browser',
      model: this.modelId,
    };
  }

  dispose(): void {
    if (this.engine) {
      void this.engine.unload();
      this.engine = null;
    }
    this._status = 'disabled';
    this.onStatusChange?.({ status: 'disabled' });
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
