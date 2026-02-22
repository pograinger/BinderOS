/**
 * Web Worker entry point — full command dispatcher.
 *
 * Owns all WASM computation and storage operations.
 * The main thread never imports WASM or Dexie directly.
 *
 * Message flow:
 *   Main thread sends Command -> Worker dispatches to handler -> Worker sends Response
 *
 * After each mutation: flush write queue, read fresh state from Dexie,
 * postMessage STATE_UPDATE with full state snapshot.
 */
import type { Command, Response } from '../types/messages';
import type { Atom } from '../types/atoms';
import init, { BinderCore } from '../wasm/pkg/binderos_core';
import { db } from '../storage/db';
import { writeQueue } from '../storage/write-queue';
import { initLamportClock, appendMutation } from '../storage/changelog';
import { initStoragePersistence } from '../storage/persistence';
import { exportAllData } from '../storage/export';
import { handleCreateAtom, handleUpdateAtom, handleDeleteAtom } from './handlers/atoms';
import { handleCreateInboxItem, handleClassifyInboxItem } from './handlers/inbox';
import {
  handleCreateSectionItem,
  handleRenameSectionItem,
  handleArchiveSectionItem,
} from './handlers/sections';

let core: BinderCore | null = null;

/**
 * Read the full state from Dexie for STATE_UPDATE responses.
 */
async function getFullState() {
  const [atoms, inboxItems, sections, sectionItems] = await Promise.all([
    db.atoms.toArray(),
    db.inbox.toArray(),
    db.sections.toArray(),
    db.sectionItems.toArray(),
  ]);
  return { atoms, inboxItems, sections, sectionItems };
}

/**
 * Flush the write queue and send a STATE_UPDATE with fresh state.
 */
async function flushAndSendState(): Promise<void> {
  await writeQueue.flushImmediate();
  const state = await getFullState();
  const response: Response = { type: 'STATE_UPDATE', payload: state };
  self.postMessage(response);
}

self.onmessage = async (event: MessageEvent<Command>) => {
  const msg = event.data;

  try {
    switch (msg.type) {
      case 'INIT': {
        await init();
        core = new BinderCore();

        // Initialize lamport clock from existing changelog
        await initLamportClock();

        // Load all data from Dexie for initial state
        const state = await getFullState();

        const response: Response = {
          type: 'READY',
          payload: {
            version: core.version(),
            sections: state.sections,
            atoms: state.atoms,
            inboxItems: state.inboxItems,
          },
        };
        self.postMessage(response);
        break;
      }

      case 'PING': {
        if (!core) throw new Error('WASM not initialized -- send INIT first');
        const result = core.ping();
        const response: Response = { type: 'PONG', payload: result };
        self.postMessage(response);
        break;
      }

      case 'CREATE_ATOM': {
        await handleCreateAtom(msg.payload);
        await flushAndSendState();
        break;
      }

      case 'UPDATE_ATOM': {
        await handleUpdateAtom(msg.payload);
        await flushAndSendState();
        break;
      }

      case 'DELETE_ATOM': {
        await handleDeleteAtom(msg.payload);
        await flushAndSendState();
        break;
      }

      case 'CREATE_INBOX_ITEM': {
        await handleCreateInboxItem(msg.payload);
        await flushAndSendState();
        break;
      }

      case 'CLASSIFY_INBOX_ITEM': {
        await handleClassifyInboxItem(msg.payload);
        await flushAndSendState();
        break;
      }

      case 'CREATE_SECTION_ITEM': {
        await handleCreateSectionItem(msg.payload);
        await flushAndSendState();
        break;
      }

      case 'RENAME_SECTION_ITEM': {
        await handleRenameSectionItem(msg.payload);
        await flushAndSendState();
        break;
      }

      case 'ARCHIVE_SECTION_ITEM': {
        await handleArchiveSectionItem(msg.payload);
        await flushAndSendState();
        break;
      }

      case 'UNDO': {
        // Read the most recent changelog entry
        const lastEntry = await db.changelog
          .orderBy('lamportClock')
          .last();

        if (!lastEntry) {
          // Nothing to undo
          await flushAndSendState();
          break;
        }

        if (lastEntry.before === null) {
          // Was a create — delete the atom to undo
          const atom = await db.atoms.get(lastEntry.atomId);
          if (atom) {
            const undoLogEntry = appendMutation(lastEntry.atomId, 'delete', atom, null);
            writeQueue.enqueue(async () => {
              await db.atoms.delete(lastEntry.atomId);
            });
            writeQueue.enqueue(async () => {
              await db.changelog.put(undoLogEntry);
            });
          }
        } else {
          // Was an update or delete — restore the before snapshot
          const currentAtom = await db.atoms.get(lastEntry.atomId);
          const undoLogEntry = appendMutation(
            lastEntry.atomId,
            'update',
            currentAtom ?? null,
            lastEntry.before,
          );
          writeQueue.enqueue(async () => {
            await db.atoms.put(lastEntry.before as Atom);
          });
          writeQueue.enqueue(async () => {
            await db.changelog.put(undoLogEntry);
          });
        }

        await flushAndSendState();
        break;
      }

      case 'EXPORT_DATA': {
        // Flush any pending writes first
        await writeQueue.flushImmediate();
        await exportAllData();
        break;
      }

      case 'REQUEST_PERSISTENCE': {
        const result = await initStoragePersistence();
        const response: Response = {
          type: 'PERSISTENCE_STATUS',
          payload: { granted: result.granted },
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
    const errorResponse: Response = {
      type: 'ERROR',
      payload: { message, command: msg.type },
    };
    self.postMessage(errorResponse);
  }
};
