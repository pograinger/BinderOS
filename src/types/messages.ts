/**
 * Worker message protocol types.
 *
 * Command: main thread -> Worker
 * Response: Worker -> main thread
 *
 * All atom operations are typed using the real Zod-inferred types.
 * Commands represent user intents; Responses represent state updates.
 */

import type { Atom, AtomType, CreateAtomInput, InboxItem } from './atoms';
import type { Section, SectionItem } from './sections';

// --- Commands (main thread -> Worker) ---

export type Command =
  | { type: 'INIT' }
  | { type: 'PING' }
  | { type: 'CREATE_ATOM'; payload: CreateAtomInput }
  | { type: 'UPDATE_ATOM'; payload: { id: string; changes: Partial<Atom> } }
  | { type: 'DELETE_ATOM'; payload: { id: string } }
  | { type: 'CREATE_INBOX_ITEM'; payload: { content: string; title?: string } }
  | { type: 'CLASSIFY_INBOX_ITEM'; payload: { id: string; type: AtomType; sectionItemId?: string } }
  | { type: 'CREATE_SECTION_ITEM'; payload: { sectionId: string; name: string } }
  | { type: 'RENAME_SECTION_ITEM'; payload: { id: string; name: string } }
  | { type: 'ARCHIVE_SECTION_ITEM'; payload: { id: string } }
  | { type: 'EXPORT_DATA' }
  | { type: 'REQUEST_PERSISTENCE' }
  | { type: 'UNDO' };

// --- Responses (Worker -> main thread) ---

export type Response =
  | {
      type: 'READY';
      payload: {
        version: string;
        sections: Section[];
        atoms: Atom[];
        inboxItems: InboxItem[];
      };
    }
  | {
      type: 'STATE_UPDATE';
      payload: {
        atoms?: Atom[];
        inboxItems?: InboxItem[];
        sections?: Section[];
        sectionItems?: SectionItem[];
      };
    }
  | { type: 'PONG'; payload: string }
  | { type: 'ERROR'; payload: { message: string; command?: string } }
  | { type: 'EXPORT_READY'; payload: { blob: Blob } }
  | { type: 'PERSISTENCE_STATUS'; payload: { granted: boolean } };
