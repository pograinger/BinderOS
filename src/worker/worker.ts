/**
 * Web Worker entry point.
 *
 * Owns all WASM computation. The main thread never imports WASM directly.
 * This is the foundational architectural pattern — all atom operations,
 * priority scoring, and entropy computation run here.
 *
 * Message flow:
 *   Main thread sends Command -> Worker dispatches -> Worker sends Response
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
          payload: {
            version: core.version(),
            sections: [],
            atoms: [],
            inboxItems: [],
          },
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
        // Placeholder: real handler wired in Plan 03 when full worker dispatch is built
        const response: Response = {
          type: 'STATE_UPDATE',
          payload: { atoms: [] },
        };
        self.postMessage(response);
        break;
      }

      case 'UPDATE_ATOM': {
        // Placeholder: real handler wired in Plan 03
        const response: Response = {
          type: 'STATE_UPDATE',
          payload: { atoms: [] },
        };
        self.postMessage(response);
        break;
      }

      case 'DELETE_ATOM': {
        // Placeholder: real handler wired in Plan 03
        const response: Response = {
          type: 'STATE_UPDATE',
          payload: { atoms: [] },
        };
        self.postMessage(response);
        break;
      }

      case 'CREATE_INBOX_ITEM': {
        // Placeholder: real handler wired in Plan 03
        const response: Response = {
          type: 'STATE_UPDATE',
          payload: { inboxItems: [] },
        };
        self.postMessage(response);
        break;
      }

      case 'CLASSIFY_INBOX_ITEM': {
        // Placeholder: real handler wired in Plan 03
        const response: Response = {
          type: 'STATE_UPDATE',
          payload: { atoms: [], inboxItems: [] },
        };
        self.postMessage(response);
        break;
      }

      case 'CREATE_SECTION_ITEM': {
        // Placeholder: real handler wired in Plan 03
        const response: Response = {
          type: 'STATE_UPDATE',
          payload: { sectionItems: [] },
        };
        self.postMessage(response);
        break;
      }

      case 'RENAME_SECTION_ITEM': {
        // Placeholder: real handler wired in Plan 03
        const response: Response = {
          type: 'STATE_UPDATE',
          payload: { sectionItems: [] },
        };
        self.postMessage(response);
        break;
      }

      case 'ARCHIVE_SECTION_ITEM': {
        // Placeholder: real handler wired in Plan 03
        const response: Response = {
          type: 'STATE_UPDATE',
          payload: { sectionItems: [] },
        };
        self.postMessage(response);
        break;
      }

      case 'EXPORT_DATA': {
        // Placeholder: triggers export flow (storage/export.ts)
        break;
      }

      case 'REQUEST_PERSISTENCE': {
        // Placeholder: triggers persistence request (storage/persistence.ts)
        const response: Response = {
          type: 'PERSISTENCE_STATUS',
          payload: { granted: false },
        };
        self.postMessage(response);
        break;
      }

      case 'UNDO': {
        // Placeholder: real undo wired in Plan 03 using changelog
        const response: Response = {
          type: 'STATE_UPDATE',
          payload: {},
        };
        self.postMessage(response);
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
