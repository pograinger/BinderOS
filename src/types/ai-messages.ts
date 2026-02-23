/**
 * LLM worker message protocol types.
 *
 * Discriminated unions for communication between the main AI router
 * and a dedicated LLM web worker (Phase 5+).
 *
 * LLMCommand: main AI router -> LLM worker
 * LLMResponse: LLM worker -> main AI router
 *
 * Mirrors the pattern from src/types/messages.ts (Command/Response).
 */

import type { AIProviderStatus } from '../ai/adapters/adapter';

// --- LLM Worker Commands (router -> LLM worker) ---

export type LLMCommand =
  | { type: 'LLM_INIT' }
  | { type: 'LLM_REQUEST'; payload: { requestId: string; prompt: string; maxTokens?: number } }
  | { type: 'LLM_ABORT'; payload: { requestId: string } };

// --- LLM Worker Responses (LLM worker -> router) ---

export type LLMResponse =
  | { type: 'LLM_READY'; payload: { modelId: string; device: 'webgpu' | 'wasm'; tier: 'fast' | 'quality' } }
  | { type: 'LLM_PROGRESS'; payload: { requestId: string; chunk: string } }
  | { type: 'LLM_COMPLETE'; payload: { requestId: string; text: string } }
  | { type: 'LLM_STATUS'; payload: { status: AIProviderStatus; modelId?: string; device?: string } }
  | { type: 'LLM_ERROR'; payload: { requestId?: string; message: string } }
  | { type: 'LLM_DOWNLOAD_PROGRESS'; payload: { progress: number; loaded: number; total: number } };
