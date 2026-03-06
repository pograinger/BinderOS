/**
 * OpenAICompatibleAdapter — cloud AI adapter for OpenAI-compatible APIs.
 *
 * Handles OpenAI, Grok (xAI), and custom OpenAI-compatible endpoints.
 * All three share the same chat/completions streaming API format.
 *
 * Requires: pnpm add openai
 *
 * Architecture:
 *   Main thread (OpenAICompatibleAdapter) -> OpenAI-compatible API (HTTPS)
 *
 * Privacy:
 *   ALL prompts must be pre-sanitized strings from the privacy proxy.
 *   Cloud models NEVER receive raw atom objects (enforced at type level).
 *
 * Safety gates (in order):
 *   1. API key must be set in memory vault (AIST-02)
 *   2. Browser must be online (AINF-06 graceful degradation)
 *   3. User must have granted session consent (AIST-01)
 *   4. Pre-send approval handler must approve the request (CONTEXT.md locked decision)
 *
 * Pure module — NO store imports.
 */

import OpenAI from 'openai';
import type { AIAdapter, AIRequest, AIResponse, AIProviderStatus } from './adapter';
import {
  hasSessionConsent,
  addCloudRequestLog,
  type CloudRequestLogEntry,
} from '../key-vault';
import { sanitizeForCloud } from '../privacy-proxy';
import { isOnline } from './browser';

export interface OpenAICompatibleAdapterConfig {
  id: string;
  displayName: string;
  apiKey: string;
  baseURL: string;
  model: string;
}

export class OpenAICompatibleAdapter implements AIAdapter {
  readonly id: string;
  readonly displayName: string;
  private readonly model: string;
  private readonly baseURL: string;
  private _status: AIProviderStatus = 'available';
  private client: OpenAI | null;

  /**
   * Optional pre-send approval handler.
   * Set by Shell.tsx to trigger the CloudRequestPreview modal.
   * If not set, requests proceed without user approval (use in tests only).
   */
  private onPreSendApproval:
    | ((entry: CloudRequestLogEntry) => Promise<boolean>)
    | null = null;

  constructor(config: OpenAICompatibleAdapterConfig) {
    this.id = config.id;
    this.displayName = config.displayName;
    this.model = config.model;
    this.baseURL = config.baseURL;

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      dangerouslyAllowBrowser: true,
      // dangerouslyAllowBrowser is safe here because:
      // - User provides their own key (not embedded in source)
      // - Key is memory-only by default (AIST-02)
      // - Key never leaves the browser except to the provider's API
    });
    this._status = 'available';
  }

  get status(): AIProviderStatus {
    return this._status;
  }

  /**
   * Register the pre-send approval handler.
   * Shell.tsx calls this in a createEffect when cloudAPIEnabled becomes true.
   *
   * The handler receives the pending CloudRequestLogEntry and returns a Promise<boolean>:
   *   true  — user approved (request proceeds)
   *   false — user cancelled (request throws)
   */
  setPreSendApprovalHandler(
    handler: (entry: CloudRequestLogEntry) => Promise<boolean>,
  ): void {
    this.onPreSendApproval = handler;
  }

  async execute(request: AIRequest): Promise<AIResponse> {
    if (!this.client) throw new Error(`${this.displayName} adapter not initialized — no API key`);
    if (this._status !== 'available') {
      throw new Error(`${this.displayName} adapter status: ${this._status}`);
    }

    // AINF-06: Graceful offline degradation
    if (!isOnline()) {
      throw new Error(
        'Cloud AI unavailable — you are currently offline. Local AI features still work.',
      );
    }

    // AIST-01: Per-session consent check
    if (!hasSessionConsent()) {
      throw new Error('Cloud AI requires session consent. Open AI Settings to continue.');
    }

    // prompt is ALWAYS pre-sanitized — never raw atom data
    const sanitizedPrompt = sanitizeForCloud(request.prompt, 'structured');

    // Create log entry before sending — logged regardless of outcome
    const logEntry: CloudRequestLogEntry = {
      id: request.requestId,
      timestamp: Date.now(),
      sanitizedPrompt,
      provider: this.displayName,
      model: this.model,
      status: 'pending',
      ...(this.baseURL ? { baseURL: this.baseURL } : {}),
    };
    addCloudRequestLog(logEntry);

    // Pre-send preview: user must approve before data leaves device (CONTEXT.md locked decision)
    if (this.onPreSendApproval) {
      const approved = await this.onPreSendApproval(logEntry);
      if (!approved) {
        logEntry.status = 'cancelled';
        throw new Error('Cloud request cancelled by user');
      }
    }
    logEntry.status = 'approved';

    try {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        max_tokens: request.maxTokens ?? 512,
        messages: [{ role: 'user', content: sanitizedPrompt }],
        stream: true,
      });

      let fullText = '';

      if (request.signal) {
        request.signal.addEventListener('abort', () => stream.controller.abort());
      }

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? '';
        if (delta) {
          fullText += delta;
          request.onChunk?.(delta);
        }
      }

      logEntry.status = 'completed';
      logEntry.responseSummary = fullText.slice(0, 100) + (fullText.length > 100 ? '...' : '');

      return {
        requestId: request.requestId,
        text: fullText,
        provider: this.displayName,
        model: this.model,
      };
    } catch (err) {
      logEntry.status = 'error';
      throw err;
    }
  }

  dispose(): void {
    this.client = null;
    this._status = 'disabled';
  }
}
