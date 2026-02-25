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

import { createMemo, createSignal, untrack } from 'solid-js';
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
import type { CloudRequestLogEntry } from '../../ai/key-vault';
import { dispatchAI } from '../../ai/router';
import { BrowserAdapter } from '../../ai/adapters/browser';
import { triageInbox, cancelTriage } from '../../ai/triage';
import type { TriageSuggestion } from '../../ai/triage';

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
  // Phase 4: Feature toggles (UI-only in Phase 4, used by Phases 5-7)
  triageEnabled: boolean;
  reviewEnabled: boolean;
  compressionEnabled: boolean;
  // Phase 4: Cloud request preview state (wired by Shell.tsx -> CloudAdapter pre-send approval handler)
  pendingCloudRequest: CloudRequestLogEntry | null;
  pendingCloudRequestResolve: ((approved: boolean) => void) | null;
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
  // Phase 4: Feature toggles (default true so they're active when AI is first enabled)
  triageEnabled: true,
  reviewEnabled: true,
  compressionEnabled: true,
  // Phase 4: Cloud request preview state
  pendingCloudRequest: null,
  pendingCloudRequestResolve: null,
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
      // Phase 5: hydrate AI state from persisted settings (fixes aiFirstRunComplete not persisting)
      if (response.payload.aiSettings) {
        const s = response.payload.aiSettings;
        if (s.aiEnabled !== undefined) setState('aiEnabled', s.aiEnabled);
        if (s.browserLLMEnabled !== undefined) setState('browserLLMEnabled', s.browserLLMEnabled);
        if (s.cloudAPIEnabled !== undefined) setState('cloudAPIEnabled', s.cloudAPIEnabled);
        if (s.aiFirstRunComplete !== undefined) setState('aiFirstRunComplete', s.aiFirstRunComplete);
        if (s.triageEnabled !== undefined) setState('triageEnabled', s.triageEnabled);
        if (s.reviewEnabled !== undefined) setState('reviewEnabled', s.reviewEnabled);
        if (s.compressionEnabled !== undefined) setState('compressionEnabled', s.compressionEnabled);
        // Activate adapters that were enabled in a previous session
        if (s.browserLLMEnabled) void activateBrowserLLM();
        if (s.cloudAPIEnabled) void activateCloudAdapter();
      }
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

// --- Phase 4/5: AI UI state setters (Phase 5: also persist to Dexie via worker) ---

export function setAIEnabled(enabled: boolean): void {
  setState('aiEnabled', enabled);
  sendCommand({ type: 'SAVE_AI_SETTINGS', payload: { aiEnabled: enabled } });
}

export function setBrowserLLMEnabled(enabled: boolean): void {
  setState('browserLLMEnabled', enabled);
  sendCommand({ type: 'SAVE_AI_SETTINGS', payload: { browserLLMEnabled: enabled } });
  if (enabled) {
    void activateBrowserLLM();
  } else {
    void deactivateBrowserLLM();
  }
}

/**
 * Create a BrowserAdapter, initialize the LLM worker (downloads model on first run),
 * and set it as the active adapter. Status callbacks update the store reactively.
 */
export async function activateBrowserLLM(): Promise<void> {
  const { BrowserAdapter } = await import('../../ai/adapters/browser');
  const { setActiveAdapter } = await import('../../ai/router');
  const adapter = new BrowserAdapter();
  adapter.onStatusChange = (update) => {
    if (update.status !== undefined) setState('llmStatus', update.status);
    if (update.modelId !== undefined) setState('llmModelId', update.modelId);
    if (update.device !== undefined) setState('llmDevice', update.device as 'webgpu' | 'wasm' | null);
    if (update.downloadProgress !== undefined) setState('llmDownloadProgress', update.downloadProgress);
  };
  setState('llmStatus', 'loading');
  try {
    await adapter.initialize();
    setActiveAdapter(adapter);
  } catch (err) {
    console.error('[BinderOS] Browser LLM initialization failed:', err);
    setState('llmStatus', 'error');
  }
}

/**
 * Deactivate browser LLM — terminate worker, fall back to NoOp, reset status.
 */
export async function deactivateBrowserLLM(): Promise<void> {
  const { NoOpAdapter } = await import('../../ai/adapters/noop');
  const { setActiveAdapter, getActiveAdapter } = await import('../../ai/router');
  const current = getActiveAdapter();
  if (current?.id === 'browser') {
    current.dispose();
    setActiveAdapter(new NoOpAdapter());
  }
  setState('llmStatus', 'disabled');
  setState('llmModelId', null);
  setState('llmDevice', null);
  setState('llmDownloadProgress', null);
}

export function setCloudAPIEnabled(enabled: boolean): void {
  setState('cloudAPIEnabled', enabled);
  sendCommand({ type: 'SAVE_AI_SETTINGS', payload: { cloudAPIEnabled: enabled } });
  if (enabled) {
    void activateCloudAdapter();
  } else {
    void deactivateCloudAdapter();
  }
}

/**
 * Create a CloudAdapter, initialize it with the current memory key, and set it as the
 * active adapter. Updates cloudStatus reactively. Call after saving a key or toggling cloud on.
 */
export async function activateCloudAdapter(): Promise<void> {
  const { CloudAdapter } = await import('../../ai/adapters/cloud');
  const { setActiveAdapter } = await import('../../ai/router');
  const adapter = new CloudAdapter();
  adapter.initialize();
  setActiveAdapter(adapter);
  setState('cloudStatus', adapter.status);
}

/**
 * Deactivate cloud adapter — fall back to NoOp and reset cloud status.
 */
export async function deactivateCloudAdapter(): Promise<void> {
  const { NoOpAdapter } = await import('../../ai/adapters/noop');
  const { setActiveAdapter } = await import('../../ai/router');
  setActiveAdapter(new NoOpAdapter());
  setState('cloudStatus', 'disabled');
}

export function setAIFirstRunComplete(complete: boolean): void {
  setState('aiFirstRunComplete', complete);
  sendCommand({ type: 'SAVE_AI_SETTINGS', payload: { aiFirstRunComplete: complete } });
}

export function setTriageEnabled(enabled: boolean): void {
  setState('triageEnabled', enabled);
  sendCommand({ type: 'SAVE_AI_SETTINGS', payload: { triageEnabled: enabled } });
}

export function setReviewEnabled(enabled: boolean): void {
  setState('reviewEnabled', enabled);
  sendCommand({ type: 'SAVE_AI_SETTINGS', payload: { reviewEnabled: enabled } });
}

export function setCompressionEnabled(enabled: boolean): void {
  setState('compressionEnabled', enabled);
  sendCommand({ type: 'SAVE_AI_SETTINGS', payload: { compressionEnabled: enabled } });
}

export function setPendingCloudRequest(
  entry: CloudRequestLogEntry | null,
  resolve: ((approved: boolean) => void) | null,
): void {
  setState('pendingCloudRequest', entry);
  setState('pendingCloudRequestResolve', resolve);
}

// --- Phase 5: Triage suggestion state (ephemeral, main-thread only) ---
// NOT part of BinderState — worker reconcile must not touch these

type TriageStatus = 'idle' | 'running' | 'complete' | 'error' | 'cancelled';

const [triageSuggestions, setTriageSuggestions] = createSignal<Map<string, TriageSuggestion>>(
  new Map(),
);
const [triageStatus, setTriageStatus] = createSignal<TriageStatus>('idle');
const [triageError, setTriageError] = createSignal<string | null>(null);

export { triageSuggestions, triageStatus, triageError };

// --- Phase 5: Triage orchestration ---

/**
 * Start AI triage for all inbox items.
 *
 * Bridges the pure triage pipeline (triage.ts) to the store's reactive signals.
 * Drives the AI orb state: thinking -> streaming -> idle/error.
 *
 * If triage is already running, cancels the current batch (toggle behaviour).
 * Guards: AI must be available and triage must be enabled.
 *
 * Implements Plan 03 triage orchestration — replaces the Plan 01 stub.
 */
export async function startTriageInbox(): Promise<void> {
  // Lazy import to avoid circular dependency at module init time
  const { setOrbState } = await import('../components/AIOrb');

  // Guards: only run if AI is available and triage is enabled
  if (!anyAIAvailable() || !state.triageEnabled) return;
  if (state.inboxItems.length === 0) return;

  // Toggle: if already running, cancel current batch
  if (triageStatus() === 'running') {
    cancelTriage();
    setTriageStatus('cancelled');
    setOrbState('idle');
    return;
  }

  setTriageStatus('running');
  setTriageError(null);
  setTriageSuggestions(new Map());
  setOrbState('thinking');

  const atoms = state.atoms.map((a) => ({ id: a.id, title: a.title, content: a.content }));

  try {
    await triageInbox(
      state.inboxItems,
      state.scores,
      state.entropyScore,
      state.sectionItems,
      state.sections,
      atoms,
      (suggestion) => {
        // Each suggestion arrives (pending or complete) — update the Map reactively
        if (suggestion.status === 'complete' || suggestion.status === 'error') {
          setOrbState('streaming');
        }
        setTriageSuggestions((prev) => {
          const next = new Map(prev);
          next.set(suggestion.inboxItemId, suggestion);
          return next;
        });
      },
      (itemId, error) => {
        // Individual item error — record error status on that item
        setTriageSuggestions((prev) => {
          const next = new Map(prev);
          next.set(itemId, {
            inboxItemId: itemId,
            suggestedType: 'fact',
            suggestedSectionItemId: null,
            reasoning: '',
            confidence: 'low',
            relatedAtomIds: [],
            status: 'error',
            errorMessage: error,
          });
          return next;
        });
      },
    );
    setTriageStatus('complete');
    setOrbState('idle');
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      setTriageStatus('cancelled');
      setOrbState('idle');
    } else {
      setTriageStatus('error');
      setTriageError(err instanceof Error ? err.message : String(err));
      setOrbState('error');
    }
  }
}

/**
 * Accept an AI triage suggestion for the given inbox item.
 *
 * Applies the suggested type and section via the existing CLASSIFY_INBOX_ITEM
 * mutation pipeline with aiSourced: true. Removes the suggestion from the Map.
 */
export function acceptAISuggestion(itemId: string): void {
  const suggestions = triageSuggestions();
  const suggestion = suggestions.get(itemId);
  if (!suggestion || suggestion.status !== 'complete') return;

  // Apply via existing mutation pipeline — same path as manual classification
  sendCommand({
    type: 'CLASSIFY_INBOX_ITEM',
    payload: {
      id: itemId,
      type: suggestion.suggestedType,
      sectionItemId: suggestion.suggestedSectionItemId ?? undefined,
      aiSourced: true,
    },
  });

  // Remove from suggestion Map
  setTriageSuggestions((prev) => {
    const next = new Map(prev);
    next.delete(itemId);
    return next;
  });
}

/**
 * Dismiss an AI triage suggestion for the given inbox item.
 *
 * Removes the suggestion from the Map without affecting the inbox item.
 * The item remains in the inbox for manual classification.
 */
export function dismissAISuggestion(itemId: string): void {
  setTriageSuggestions((prev) => {
    const next = new Map(prev);
    next.delete(itemId);
    return next;
  });
}

/**
 * Accept all complete AI triage suggestions in bulk.
 *
 * Applies every complete suggestion via CLASSIFY_INBOX_ITEM with aiSourced: true,
 * then clears the entire suggestion Map.
 */
export function acceptAllAISuggestions(): void {
  const suggestions = triageSuggestions();
  for (const [itemId, suggestion] of suggestions) {
    if (suggestion.status === 'complete') {
      sendCommand({
        type: 'CLASSIFY_INBOX_ITEM',
        payload: {
          id: itemId,
          type: suggestion.suggestedType,
          sectionItemId: suggestion.suggestedSectionItemId ?? undefined,
          aiSourced: true,
        },
      });
    }
  }
  setTriageSuggestions(new Map());
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

/**
 * UI signal: controls AI settings panel visibility.
 * Shared here to avoid circular dependencies (Shell → AIOrb → AIRadialMenu → Shell).
 */
const [showAISettings, setShowAISettings] = createSignal(false);
export { showAISettings, setShowAISettings };

/** Capture overlay signal — shared between app.tsx and AIOrb double-tap */
const [showCapture, setShowCapture] = createSignal(false);
export { showCapture, setShowCapture };
