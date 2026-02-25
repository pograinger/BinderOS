/**
 * CloudAdapter — Anthropic cloud AI adapter with streaming.
 *
 * Requires: pnpm add @anthropic-ai/sdk
 *
 * Architecture:
 *   Main thread (CloudAdapter) -> Anthropic API (HTTPS)
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
 * Pre-send approval:
 *   Every cloud request triggers a CloudRequestPreview modal before data leaves the device.
 *   Shell.tsx wires setPreSendApprovalHandler() to store state to trigger the modal.
 *   The adapter awaits the user's approve/cancel decision before proceeding.
 *
 * Communication log:
 *   All requests are logged to the session-scoped cloud request log in key-vault.ts.
 *   Accessible in AI Settings > Communication Log for user review.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { AIAdapter, AIRequest, AIResponse, AIProviderStatus } from './adapter';
import {
  getMemoryKey,
  hasSessionConsent,
  addCloudRequestLog,
  type CloudRequestLogEntry,
} from '../key-vault';
import { sanitizeForCloud } from '../privacy-proxy';
import { isOnline } from './browser';

// --- Destructive action guard (AIST-03) ---

/**
 * Actions that require explicit user confirmation before AI execution.
 * Used by Phase 5+ triage/review handlers before dispatching mutations.
 */
export const DESTRUCTIVE_ACTIONS = ['delete', 'archive', 'overwrite'] as const;
export type DestructiveAction = typeof DESTRUCTIVE_ACTIONS[number];

/**
 * Check whether an action string is a destructive action requiring user confirmation.
 * Phase 5+ triage/review handlers call this before executing AI-suggested mutations.
 */
export function isDestructiveAction(action: string): boolean {
  return (DESTRUCTIVE_ACTIONS as readonly string[]).includes(action);
}

// --- CloudAdapter ---

export class CloudAdapter implements AIAdapter {
  readonly id = 'cloud' as const;
  private _status: AIProviderStatus = 'disabled';
  private client: Anthropic | null = null;

  /**
   * Optional pre-send approval handler.
   * Set by Shell.tsx to trigger the CloudRequestPreview modal.
   * If not set, requests proceed without user approval (use in tests only).
   */
  private onPreSendApproval:
    | ((entry: CloudRequestLogEntry) => Promise<boolean>)
    | null = null;

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

  /**
   * Initialize the adapter using the current memory key.
   * Sets status to 'available' if a key exists, 'unavailable' otherwise.
   */
  initialize(): void {
    const apiKey = getMemoryKey();
    if (!apiKey) {
      this._status = 'unavailable';
      return;
    }
    this.client = new Anthropic({
      apiKey,
      dangerouslyAllowBrowser: true,
      // dangerouslyAllowBrowser is safe here because:
      // - User provides their own key (not embedded in source)
      // - Key is memory-only by default (AIST-02)
      // - Key never leaves the browser except to Anthropic's API
    });
    this._status = 'available';
  }

  async execute(request: AIRequest): Promise<AIResponse> {
    if (!this.client) throw new Error('Cloud adapter not initialized — no API key');
    if (this._status !== 'available') {
      throw new Error(`Cloud adapter status: ${this._status}`);
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
    // Type boundary enforces this: AIRequest.prompt is string, not Atom
    const sanitizedPrompt = sanitizeForCloud(request.prompt, 'structured');

    // Create log entry before sending — logged regardless of outcome
    const logEntry: CloudRequestLogEntry = {
      id: request.requestId,
      timestamp: Date.now(),
      sanitizedPrompt,
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
      status: 'pending',
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
      const stream = this.client.messages.stream({
        model: 'claude-haiku-4-5-20251001',  // Cost-efficient for classification/routing
        max_tokens: request.maxTokens ?? 512,
        messages: [{ role: 'user', content: sanitizedPrompt }],
      });

      stream.on('text', (text) => request.onChunk?.(text));

      if (request.signal) {
        request.signal.addEventListener('abort', () => stream.abort());
      }

      const message = await stream.finalMessage();
      const text =
        message.content[0]?.type === 'text' ? message.content[0].text : '';

      logEntry.status = 'completed';
      logEntry.responseSummary = text.slice(0, 100) + (text.length > 100 ? '...' : '');

      return {
        requestId: request.requestId,
        text,
        provider: 'cloud',
        model: 'claude-haiku-4-5-20251001',
      };
    } catch (err) {
      logEntry.status = 'error';
      throw err;
    }
  }

  /**
   * Reinitialize after API key change.
   * Called when the user enters or updates their API key in AI Settings.
   */
  reinitialize(): void {
    this.client = null;
    this._status = 'disabled';
    this.initialize();
  }

  dispose(): void {
    this.client = null;
    this._status = 'disabled';
  }
}
