/**
 * SolidJS reactive store fed by Worker message bridge.
 *
 * The store receives state snapshots from the Worker via postMessage
 * and applies them using SolidJS reconcile for fine-grained updates.
 *
 * CRITICAL: Never destructure state or payload. Always access via
 * state.atoms, state.inboxItems, etc. Destructuring breaks reactivity
 * (RESEARCH.md Pitfall 2).
 *
 * Phase 2 additions:
 * - scores (Record<string, AtomScore>): per-atom scoring results
 * - entropyScore (EntropyScore | null): system health indicator
 * - compressionCandidates (CompressionCandidate[]): review page feed
 * - capConfig (CapConfig): inbox + task cap configuration
 * - capExceeded ('inbox' | 'task' | null): cap overflow signal
 * - inboxCapStatus() / taskCapStatus() derived signals for StatusBar
 *
 * Phase 3 additions:
 * - savedFilters (SavedFilter[]): user-persisted filter presets
 * - selectedAtomId (string | null): currently selected atom for detail view
 * - selectedAtom derived memo: resolves selectedAtomId to Atom | null
 * - setSelectedAtomId() setter for navigation and detail views
 *
 * Phase 4 additions:
 * - aiEnabled / browserLLMEnabled / cloudAPIEnabled: user AI settings (all disabled by default per AIST-01)
 * - llmStatus / cloudStatus: provider lifecycle status
 * - llmModelId / llmDevice / llmDownloadProgress: LLM worker metadata
 * - aiActivity: current in-progress AI request description (null when idle)
 * - aiFirstRunComplete: whether user has completed initial AI onboarding
 * - llmReady / cloudReady / anyAIAvailable: derived reactive signals
 */

import { createMemo, untrack } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import { dispatch, onMessage } from '../../worker/bridge';
import type { Atom, InboxItem } from '../../types/atoms';
import type { Section, SectionItem } from '../../types/sections';
import type { Command } from '../../types/messages';
import type {
  AtomScore,
  EntropyScore,
  CompressionCandidate,
  CapConfig,
} from '../../types/config';
import { DEFAULT_CAP_CONFIG } from '../../types/config';
import type { SavedFilter } from '../../storage/db';
import type { AIProviderStatus } from '../../ai/adapters/adapter';
import { dispatchAI } from '../../ai/router';
import { BrowserAdapter } from '../../ai/adapters/browser';

// --- State interface ---

export interface BinderState {
  ready: boolean;
  version: string;
  atoms: Atom[];
  inboxItems: InboxItem[];
  sections: Section[];
  sectionItems: SectionItem[];
  persistenceGranted: boolean;
  activeSection: string | null;
  activePage: string;
  lastError: string | null;
  // Phase 2: scoring and cap management
  scores: Record<string, AtomScore>;
  entropyScore: EntropyScore | null;
  compressionCandidates: CompressionCandidate[];
  capConfig: CapConfig;
  capExceeded: 'inbox' | 'task' | null;
  // Phase 3: filters and selection
  savedFilters: SavedFilter[];
  selectedAtomId: string | null;
  // Phase 4: AI infrastructure
  aiEnabled: boolean;
  browserLLMEnabled: boolean;
  cloudAPIEnabled: boolean;
  llmStatus: AIProviderStatus;
  cloudStatus: AIProviderStatus;
  llmModelId: string | null;
  llmDevice: 'webgpu' | 'wasm' | null;
  llmDownloadProgress: number | null;
  aiActivity: string | null;
  aiFirstRunComplete: boolean;
}

const initialState: BinderState = {
  ready: false,
  version: '',
  atoms: [],
  inboxItems: [],
  sections: [],
  sectionItems: [],
  persistenceGranted: false,
  activeSection: null,
  activePage: 'inbox',
  lastError: null,
  // Phase 2 defaults
  scores: {},
  entropyScore: null,
  compressionCandidates: [],
  capConfig: { ...DEFAULT_CAP_CONFIG },
  capExceeded: null,
  // Phase 3 defaults
  savedFilters: [],
  selectedAtomId: null,
  // Phase 4 defaults (all AI disabled by default per AIST-01)
  aiEnabled: false,
  browserLLMEnabled: false,
  cloudAPIEnabled: false,
  llmStatus: 'disabled',
  cloudStatus: 'disabled',
  llmModelId: null,
  llmDevice: null,
  llmDownloadProgress: null,
  aiActivity: null,
  aiFirstRunComplete: false,
};

// --- Create the store ---

const [state, setState] = createStore<BinderState>(initialState);

// --- Worker message handler ---

onMessage((response) => {
  switch (response.type) {
    case 'READY':
      setState('ready', true);
      setState('version', response.payload.version);
      setState('atoms', reconcile(response.payload.atoms));
      setState('inboxItems', reconcile(response.payload.inboxItems));
      setState('sections', reconcile(response.payload.sections));
      if (response.payload.sectionItems !== undefined) {
        setState('sectionItems', reconcile(response.payload.sectionItems));
      }
      setState('savedFilters', reconcile(response.payload.savedFilters));
      setState('lastError', null);
      break;

    case 'STATE_UPDATE':
      // Reconcile only the fields that came in the payload
      if (response.payload.atoms !== undefined) {
        setState('atoms', reconcile(response.payload.atoms));
      }
      if (response.payload.inboxItems !== undefined) {
        setState('inboxItems', reconcile(response.payload.inboxItems));
      }
      if (response.payload.sections !== undefined) {
        setState('sections', reconcile(response.payload.sections));
      }
      if (response.payload.sectionItems !== undefined) {
        setState('sectionItems', reconcile(response.payload.sectionItems));
      }
      if (response.payload.scores !== undefined) {
        setState('scores', reconcile(response.payload.scores));
      }
      if (response.payload.entropyScore !== undefined) {
        setState('entropyScore', response.payload.entropyScore ?? null);
      }
      if (response.payload.compressionCandidates !== undefined) {
        setState('compressionCandidates', reconcile(response.payload.compressionCandidates));
      }
      if (response.payload.capConfig !== undefined) {
        setState('capConfig', reconcile(response.payload.capConfig));
      }
      if (response.payload.savedFilters !== undefined) {
        setState('savedFilters', reconcile(response.payload.savedFilters));
      }
      // Phase 2: clear capExceeded if counts are now below cap after an action.
      // untrack() prevents the ESLint solid/reactivity warning — this is intentionally
      // a one-shot check in a message handler, not a reactive computation.
      untrack(() => {
        if (state.capExceeded === 'inbox' && response.payload.inboxItems !== undefined) {
          if (state.inboxItems.length < state.capConfig.inboxCap) {
            setState('capExceeded', null);
          }
        }
        if (state.capExceeded === 'task' && response.payload.atoms !== undefined) {
          const openCount = state.atoms.filter(
            (a) => a.type === 'task' && (a.status === 'open' || a.status === 'in-progress'),
          ).length;
          if (openCount < state.capConfig.taskCap) {
            setState('capExceeded', null);
          }
        }
      });
      break;

    case 'CAP_EXCEEDED':
      setState('capExceeded', response.payload.capType);
      break;

    case 'ERROR':
      console.error('[BinderOS Worker Error]', response.payload.message, response.payload.command);
      setState('lastError', response.payload.message);
      break;

    case 'PERSISTENCE_STATUS':
      setState('persistenceGranted', response.payload.granted);
      break;

    case 'EXPORT_READY': {
      // Trigger file download on the main thread (Worker has no DOM access)
      const { blob, filename } = response.payload;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      break;
    }

    case 'PONG':
      // No state update needed for ping/pong
      break;

    case 'AI_RESPONSE':
      // Clear activity indicator on completion
      setState('aiActivity', null);
      // Update provider status fields if included in response
      if (response.payload.llmStatus !== undefined) {
        setState('llmStatus', response.payload.llmStatus);
      }
      if (response.payload.cloudStatus !== undefined) {
        setState('cloudStatus', response.payload.cloudStatus);
      }
      break;

    case 'AI_STATUS':
      // Update AI status fields from payload (partial update — only set fields present)
      if (response.payload.llmStatus !== undefined) {
        setState('llmStatus', response.payload.llmStatus);
      }
      if (response.payload.cloudStatus !== undefined) {
        setState('cloudStatus', response.payload.cloudStatus);
      }
      if (response.payload.llmModelId !== undefined) {
        setState('llmModelId', response.payload.llmModelId ?? null);
      }
      if (response.payload.llmDevice !== undefined) {
        setState('llmDevice', response.payload.llmDevice ?? null);
      }
      if (response.payload.llmDownloadProgress !== undefined) {
        setState('llmDownloadProgress', response.payload.llmDownloadProgress ?? null);
      }
      if (response.payload.aiActivity !== undefined) {
        setState('aiActivity', response.payload.aiActivity ?? null);
      }
      break;
  }
});

// --- Exported store (readonly) and dispatch ---

export { state };

export function sendCommand(command: Command): void {
  dispatch(command);
}

// --- UI state setters (local, not worker) ---

export function setActiveSection(sectionId: string | null): void {
  setState('activeSection', sectionId);
}

export function setActivePage(page: string): void {
  setState('activePage', page);
}

/**
 * Set the currently selected atom id for detail view navigation.
 * Pass null to deselect / close the detail panel.
 */
export function setSelectedAtomId(id: string | null): void {
  setState('selectedAtomId', id);
}

/**
 * Set persistence granted status (called from main thread persistence check).
 */
export function setPersistenceGranted(granted: boolean): void {
  setState('persistenceGranted', granted);
}

// --- Phase 4: AI UI state setters ---

export function setAIEnabled(enabled: boolean): void {
  setState('aiEnabled', enabled);
}

export function setBrowserLLMEnabled(enabled: boolean): void {
  setState('browserLLMEnabled', enabled);
}

export function setCloudAPIEnabled(enabled: boolean): void {
  setState('cloudAPIEnabled', enabled);
}

export function setAIFirstRunComplete(complete: boolean): void {
  setState('aiFirstRunComplete', complete);
}

/**
 * Dispatch an AI request directly from the main thread.
 *
 * Phase 4 architecture: AI dispatch bypasses the BinderCore worker entirely.
 * The BrowserAdapter (SmolLM2) manages its own dedicated LLM worker via llm-bridge.ts.
 * This prevents Transformers.js contamination of the BinderCore WASM worker.
 *
 * All dispatch is user-initiated — never called autonomously (AIST-04).
 */
export async function dispatchAICommand(prompt: string, maxTokens?: number): Promise<void> {
  const requestId = crypto.randomUUID();
  setState('aiActivity', 'Processing...');
  try {
    await dispatchAI({ requestId, prompt, maxTokens });
    // AI activity cleared on completion — further result handling added in Phase 5 (triage, review)
    setState('aiActivity', null);
  } catch (err) {
    setState('aiActivity', null);
    setState('lastError', err instanceof Error ? err.message : String(err));
  }
}

/**
 * Initialize the BrowserAdapter and wire its status changes into the store.
 *
 * Call when the user enables browser LLM (browserLLMEnabled becomes true).
 * The adapter's onStatusChange callback forwards llmStatus, llmDevice, llmModelId,
 * and llmDownloadProgress updates from the LLM worker into reactive store state.
 *
 * Returns the initialized adapter so the caller can call setActiveAdapter(adapter)
 * on the router (e.g., in App.tsx initialization flow).
 */
export async function initBrowserAdapter(): Promise<BrowserAdapter> {
  const browserAdapter = new BrowserAdapter();

  // Wire LLM worker status changes into the store
  browserAdapter.onStatusChange = (update) => {
    if (update.status !== undefined) setState('llmStatus', update.status);
    if (update.device !== undefined) setState('llmDevice', update.device as 'webgpu' | 'wasm');
    if (update.modelId !== undefined) setState('llmModelId', update.modelId);
    if (update.downloadProgress !== undefined) setState('llmDownloadProgress', update.downloadProgress);
  };

  await browserAdapter.initialize();
  return browserAdapter;
}

// --- Derived signals ---

export function atomCount(): number {
  return state.atoms.length;
}

export function inboxCount(): number {
  return state.inboxItems.length;
}

export function atomsBySection(sectionId: string): Atom[] {
  return state.atoms.filter((a) => a.sectionId === sectionId);
}

export function atomsBySectionItem(sectionItemId: string): Atom[] {
  return state.atoms.filter((a) => a.sectionItemId === sectionItemId);
}

// --- Phase 2 derived cap status signals ---

/**
 * Reactive signal: inbox cap status based on current inbox count vs configured cap.
 *
 * 'full'    — inbox.length >= capConfig.inboxCap (hard cap reached)
 * 'warning' — inbox.length >= capConfig.inboxCap * 0.8 (soft 80% threshold)
 * 'ok'      — below warning threshold
 */
export const inboxCapStatus = createMemo((): 'ok' | 'warning' | 'full' => {
  const cap = state.capConfig.inboxCap;
  const count = state.inboxItems.length;
  if (count >= cap) return 'full';
  if (count >= cap * 0.8) return 'warning';
  return 'ok';
});

/**
 * Reactive signal: task cap status based on open + in-progress task count vs configured cap.
 *
 * 'full'    — openTaskCount >= capConfig.taskCap (hard cap reached)
 * 'warning' — openTaskCount >= capConfig.taskCap * 0.8 (soft 80% threshold)
 * 'ok'      — below warning threshold
 */
export const taskCapStatus = createMemo((): 'ok' | 'warning' | 'full' => {
  const cap = state.capConfig.taskCap;
  const openCount = state.atoms.filter(
    (a) => a.type === 'task' && (a.status === 'open' || a.status === 'in-progress'),
  ).length;
  if (openCount >= cap) return 'full';
  if (openCount >= cap * 0.8) return 'warning';
  return 'ok';
});

// --- Phase 3 derived signals ---

/**
 * Reactive memo: resolves selectedAtomId to the full Atom object.
 * Returns null if no atom is selected or if the id is not found in state.atoms.
 */
export const selectedAtom = createMemo((): Atom | null => {
  return state.atoms.find((a) => a.id === state.selectedAtomId) ?? null;
});

// Phase 4: AI derived signals

/**
 * Reactive signal: true when the browser LLM adapter is ready to serve requests.
 */
export const llmReady = createMemo(() => state.llmStatus === 'available');

/**
 * Reactive signal: true when the cloud API adapter is ready to serve requests.
 */
export const cloudReady = createMemo(() => state.cloudStatus === 'available');

/**
 * Reactive signal: true when any AI adapter is available (browser or cloud).
 */
export const anyAIAvailable = createMemo(() => llmReady() || cloudReady());
