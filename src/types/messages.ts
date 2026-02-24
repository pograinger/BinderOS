/**
 * Worker message protocol types.
 *
 * Command: main thread -> Worker
 * Response: Worker -> main thread
 *
 * All atom operations are typed using the real Zod-inferred types.
 * Commands represent user intents; Responses represent state updates.
 *
 * Phase 2 additions:
 * - RECOMPUTE_SCORES command (triggers re-score without mutation)
 * - UPDATE_CAP_CONFIG command (updates inbox/task caps in Dexie)
 * - STATE_UPDATE extended with scores, entropyScore, compressionCandidates, capConfig
 * - CAP_EXCEEDED response (fires when inbox or open task count hits cap)
 *
 * Phase 3 additions:
 * - SAVE_FILTER command (persists a named filter configuration)
 * - DELETE_FILTER command (removes a saved filter by id)
 * - LOG_INTERACTION command (records a search/filter/click interaction event)
 * - STATE_UPDATE extended with savedFilters array
 *
 * Phase 4 additions:
 * - AI_DISPATCH command (user-initiated AI request through adapter router)
 * - AI_RESPONSE response (adapter result back to store)
 * - AI_STATUS response (provider status updates: loading, available, error, etc.)
 *
 * Phase 5 additions:
 * - SAVE_AI_SETTINGS command (persists AI settings to Dexie config table)
 * - READY payload extended with aiSettings (loaded from Dexie on INIT)
 */

import type { Atom, AtomType, CreateAtomInput, InboxItem } from './atoms';
import type { AISettings } from '../storage/ai-settings';
import type { Section, SectionItem } from './sections';
import type {
  AtomScore,
  EntropyScore,
  CompressionCandidate,
  CapConfig,
} from './config';
import type { SavedFilter, InteractionEvent } from '../storage/db';
import type { AIProviderStatus } from '../ai/adapters/adapter';

// --- Commands (main thread -> Worker) ---

export type Command =
  | { type: 'INIT' }
  | { type: 'PING' }
  | { type: 'CREATE_ATOM'; payload: CreateAtomInput }
  | { type: 'UPDATE_ATOM'; payload: { id: string; changes: Partial<Atom> } }
  | { type: 'DELETE_ATOM'; payload: { id: string } }
  | { type: 'CREATE_INBOX_ITEM'; payload: { content: string; title?: string } }
  | { type: 'DELETE_INBOX_ITEM'; payload: { id: string } }
  | { type: 'CLASSIFY_INBOX_ITEM'; payload: { id: string; type: AtomType; sectionItemId?: string; aiSourced?: boolean } }
  | { type: 'CREATE_SECTION_ITEM'; payload: { sectionId: string; name: string } }
  | { type: 'RENAME_SECTION_ITEM'; payload: { id: string; name: string } }
  | { type: 'ARCHIVE_SECTION_ITEM'; payload: { id: string } }
  | { type: 'EXPORT_DATA' }
  | { type: 'REQUEST_PERSISTENCE' }
  | { type: 'UNDO' }
  | { type: 'RECOMPUTE_SCORES' }
  | { type: 'UPDATE_CAP_CONFIG'; payload: CapConfig }
  | { type: 'MERGE_ATOMS'; payload: { sourceId: string; targetId: string } }
  // Phase 3: filter and interaction commands
  | { type: 'SAVE_FILTER'; payload: SavedFilter }
  | { type: 'DELETE_FILTER'; payload: { id: string } }
  | { type: 'LOG_INTERACTION'; payload: Omit<InteractionEvent, 'id'> }
  // Phase 4: AI dispatch (always user-initiated per AIST-04)
  | { type: 'AI_DISPATCH'; payload: { requestId: string; prompt: string; maxTokens?: number } }
  // Phase 5: persist AI settings to Dexie config table
  | { type: 'SAVE_AI_SETTINGS'; payload: Partial<AISettings> };

// --- Responses (Worker -> main thread) ---

export type Response =
  | {
      type: 'READY';
      payload: {
        version: string;
        sections: Section[];
        sectionItems?: SectionItem[];
        atoms: Atom[];
        inboxItems: InboxItem[];
        savedFilters: SavedFilter[];
        // Phase 5: persisted AI settings loaded from Dexie on startup
        aiSettings?: AISettings | null;
      };
    }
  | {
      type: 'STATE_UPDATE';
      payload: {
        atoms?: Atom[];
        inboxItems?: InboxItem[];
        sections?: Section[];
        sectionItems?: SectionItem[];
        scores?: Record<string, AtomScore>;
        entropyScore?: EntropyScore;
        compressionCandidates?: CompressionCandidate[];
        capConfig?: CapConfig;
        savedFilters?: SavedFilter[];
      };
    }
  | { type: 'PONG'; payload: string }
  | { type: 'ERROR'; payload: { message: string; command?: string } }
  | { type: 'EXPORT_READY'; payload: { blob: Blob; filename: string } }
  | { type: 'PERSISTENCE_STATUS'; payload: { granted: boolean } }
  | { type: 'CAP_EXCEEDED'; payload: { capType: 'inbox' | 'task'; cap: number } }
  // Phase 4: AI responses
  | {
      type: 'AI_RESPONSE';
      payload: {
        requestId: string;
        text: string;
        provider: 'noop' | 'browser' | 'cloud';
        model?: string;
        llmStatus?: AIProviderStatus;
        cloudStatus?: AIProviderStatus;
      };
    }
  | {
      type: 'AI_STATUS';
      payload: {
        llmStatus?: AIProviderStatus;
        cloudStatus?: AIProviderStatus;
        llmModelId?: string | null;
        llmDevice?: 'webgpu' | 'wasm' | null;
        llmDownloadProgress?: number | null;
        aiActivity?: string | null;
      };
    };
