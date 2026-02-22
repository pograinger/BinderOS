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
 * run WASM scoring (compute_scores, compute_entropy, filter_compression_candidates),
 * postMessage STATE_UPDATE with full state snapshot including scoring results.
 *
 * Phase 2 additions:
 * - flushAndSendState() calls all three WASM scoring functions
 * - RECOMPUTE_SCORES command triggers re-score without mutation
 * - UPDATE_CAP_CONFIG command updates cap config in Dexie then re-scores
 * - 10-minute periodic re-scoring interval (staleness changes over time)
 */
import type { Command, Response } from '../types/messages';
import type { Atom } from '../types/atoms';
import type { AtomScore, EntropyScore, CompressionCandidate } from '../types/config';
import init, { BinderCore } from '../wasm/pkg/binderos_core';
import { db } from '../storage/db';
import { writeQueue } from '../storage/write-queue';
import { initLamportClock, appendMutation } from '../storage/changelog';
import { initStoragePersistence } from '../storage/persistence';
import { exportAllData } from '../storage/export';
import { handleCreateAtom, handleUpdateAtom, handleDeleteAtom, handleMergeAtoms } from './handlers/atoms';
import { handleCreateInboxItem, handleDeleteInboxItem, handleClassifyInboxItem } from './handlers/inbox';
import {
  handleCreateSectionItem,
  handleRenameSectionItem,
  handleArchiveSectionItem,
} from './handlers/sections';
import { getCapConfig, setCapConfig } from './handlers/config';

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
 * Prepare atoms for WASM scoring by flattening AtomLink[] to string[] of targetIds.
 *
 * The Rust AtomInput struct expects links as Vec<String> (target IDs),
 * but our TypeScript Atom type uses AtomLink[] with {targetId, relationshipType, direction}.
 */
function flattenAtomLinksForWasm(atoms: Atom[]): unknown[] {
  return atoms.map((atom) => ({
    id: atom.id,
    type: atom.type,
    updated_at: atom.updated_at,
    created_at: atom.created_at,
    status: atom.status,
    links: atom.links.map((l) => l.targetId),
    due_date: 'dueDate' in atom ? atom.dueDate ?? null : null,
    pinned_tier: atom.pinned_tier ?? null,
    pinned_staleness: atom.pinned_staleness ?? false,
    importance: atom.importance ?? null,
    energy: atom.energy ?? null,
    content: atom.content,
  }));
}

/**
 * Flush the write queue and send a STATE_UPDATE with fresh state + scoring results.
 *
 * Scoring is non-blocking: if WASM scoring fails, STATE_UPDATE is still sent
 * with empty/null scoring fields rather than failing the entire update.
 */
async function flushAndSendState(): Promise<void> {
  await writeQueue.flushImmediate();
  const state = await getFullState();

  const capConfig = await getCapConfig();
  const now = Date.now();

  let scores: Record<string, AtomScore> = {};
  let entropyScore: EntropyScore | undefined;
  let compressionCandidates: CompressionCandidate[] = [];

  if (core) {
    const atomsForWasm = flattenAtomLinksForWasm(state.atoms);

    try {
      scores = core.compute_scores(atomsForWasm, now) as Record<string, AtomScore>;
    } catch (err) {
      console.error('[Worker] compute_scores failed:', err);
    }

    try {
      entropyScore = core.compute_entropy(
        atomsForWasm,
        state.inboxItems.length,
        capConfig.inboxCap,
        capConfig.taskCap,
        now,
      ) as EntropyScore;
    } catch (err) {
      console.error('[Worker] compute_entropy failed:', err);
    }

    try {
      compressionCandidates = core.filter_compression_candidates(
        atomsForWasm,
        now,
      ) as CompressionCandidate[];
    } catch (err) {
      console.error('[Worker] filter_compression_candidates failed:', err);
    }
  }

  const response: Response = {
    type: 'STATE_UPDATE',
    payload: {
      ...state,
      scores,
      entropyScore,
      compressionCandidates,
      capConfig,
    },
  };
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

        // Schedule periodic re-scoring every 10 minutes
        // (staleness changes over time even without user mutations)
        setInterval(() => {
          void flushAndSendState();
        }, 10 * 60 * 1000);

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
        // Phase 2: cap enforcement — handler returns 'cap_exceeded' if over task cap
        const createResult = await handleCreateAtom(msg.payload);
        if (createResult === 'cap_exceeded') {
          const capConfig = await getCapConfig();
          const capResponse: Response = {
            type: 'CAP_EXCEEDED',
            payload: { capType: 'task', cap: capConfig.taskCap },
          };
          self.postMessage(capResponse);
          break;
        }
        await flushAndSendState();
        break;
      }

      case 'UPDATE_ATOM': {
        // Phase 2: cap enforcement — handler returns 'cap_exceeded' if reopening task at cap
        const updateResult = await handleUpdateAtom(msg.payload);
        if (updateResult === 'cap_exceeded') {
          const capConfig = await getCapConfig();
          const capResponse: Response = {
            type: 'CAP_EXCEEDED',
            payload: { capType: 'task', cap: capConfig.taskCap },
          };
          self.postMessage(capResponse);
          break;
        }
        await flushAndSendState();
        break;
      }

      case 'DELETE_ATOM': {
        await handleDeleteAtom(msg.payload);
        await flushAndSendState();
        break;
      }

      case 'CREATE_INBOX_ITEM': {
        // Phase 2: cap enforcement — handler returns 'cap_exceeded' if inbox is at cap
        const inboxResult = await handleCreateInboxItem(msg.payload);
        if (inboxResult === 'cap_exceeded') {
          const capConfig = await getCapConfig();
          const capResponse: Response = {
            type: 'CAP_EXCEEDED',
            payload: { capType: 'inbox', cap: capConfig.inboxCap },
          };
          self.postMessage(capResponse);
          break;
        }
        await flushAndSendState();
        break;
      }

      case 'DELETE_INBOX_ITEM': {
        await handleDeleteInboxItem(msg.payload);
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

      case 'RECOMPUTE_SCORES': {
        // Re-trigger full scoring without any mutation
        await flushAndSendState();
        break;
      }

      case 'UPDATE_CAP_CONFIG': {
        await setCapConfig(msg.payload);
        await flushAndSendState();
        break;
      }

      case 'MERGE_ATOMS': {
        await handleMergeAtoms(msg.payload);
        await flushAndSendState();
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
