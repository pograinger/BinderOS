/**
 * Web Worker entry point.
 *
 * Owns all WASM computation. The main thread never imports WASM directly.
 * This is the foundational architectural pattern — all atom operations,
 * priority scoring, and entropy computation run here.
 *
 * Message flow:
 *   Main thread sends Command → Worker dispatches → Worker sends Response
 */
import type { Command, Response } from '../types/messages';
import init, { BinderCore } from '../wasm/pkg/binderos_core';

let core: BinderCore | null = null;

self.onmessage = async (event: MessageEvent<Command>) => {
  const msg = event.data;

  try {
    switch (msg.type) {
      case 'INIT': {
        await init();
        core = new BinderCore();
        const response: Response = {
          type: 'READY',
          payload: { version: core.version() },
        };
        self.postMessage(response);
        break;
      }

      case 'PING': {
        if (!core) throw new Error('WASM not initialized — send INIT first');
        const result = core.ping();
        const response: Response = { type: 'PONG', payload: result };
        self.postMessage(response);
        break;
      }

      case 'CREATE_ATOM': {
        // Placeholder: real handler added in Plan 02 when Dexie schema is defined
        const response: Response = {
          type: 'ATOM_CREATED',
          payload: { id: `placeholder-${Date.now()}` },
        };
        self.postMessage(response);
        break;
      }

      case 'UPDATE_ATOM': {
        const response: Response = {
          type: 'ATOM_UPDATED',
          payload: { id: msg.payload.id },
        };
        self.postMessage(response);
        break;
      }

      case 'DELETE_ATOM': {
        // Placeholder: real handler added in Plan 02
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
    const errorResponse: Response = { type: 'ERROR', payload: { message } };
    self.postMessage(errorResponse);
  }
};
