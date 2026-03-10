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
 *
 * Phase 6 additions:
 * - reviewBriefing (BriefingResult | null): latest generated briefing
 * - reviewStatus ('idle' | 'analyzing' | 'ready' | 'error'): pipeline state
 * - reviewProgress (string | null): incremental progress messages
 * - reviewError (string | null): error message if pipeline fails
 * - startReviewBriefing(): orchestrates two-phase briefing pipeline (AIRV-01, AIRV-02)
 * - cancelReviewBriefing(): cancels in-flight briefing via AbortController
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
import type { DetectedEntity } from '../../ai/sanitization/types';
import { dispatchAI } from '../../ai/router';
import { BrowserAdapter, DEFAULT_MODEL_ID } from '../../ai/adapters/browser';
import { triageInbox, cancelTriage } from '../../ai/triage';
import type { TriageSuggestion } from '../../ai/triage';
import type { ClarificationResult } from '../../ai/clarification/types';
import { seedEntityRelationship } from '../../storage/entity-graph';
import { logClarification } from '../../storage/classification-log';
import type { BriefingResult } from '../../ai/analysis';
import type { ReviewSession } from '../../storage/review-session';
import { saveReviewSession, loadReviewSession, clearReviewSession, REVIEW_SESSION_STALE_MS } from '../../storage/review-session';
import type { ReviewPhaseContext, ReviewFlowStep, ReviewAction, ReviewPhase, StagingAction } from '../../types/review';

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
  // Phase 14: Sanitization entity data for pre-send modal
  pendingCloudRequestEntities: DetectedEntity[];
  pendingCloudRequestEntityMap: Map<string, string>;
  // Phase 13: Multi-provider cloud settings
  activeCloudProvider: string;  // ProviderId, default 'anthropic'
  providerModels: Record<string, string>;  // user-overridden models per provider
  customEndpointConfig: { label: string; baseURL: string; model: string } | null;
  // Phase 6: Review pre-analysis state
  reviewBriefing: BriefingResult | null;
  reviewStatus: 'idle' | 'analyzing' | 'ready' | 'error';
  reviewProgress: string | null;
  reviewError: string | null;
  // Phase 6: Review session persistence (AIRV-05)
  reviewSession: ReviewSession | null;
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
  // Phase 14: Sanitization entity data for pre-send modal
  pendingCloudRequestEntities: [],
  pendingCloudRequestEntityMap: new Map(),
  // Phase 13: Multi-provider cloud settings
  activeCloudProvider: 'anthropic',
  providerModels: {},
  customEndpointConfig: null,
  // Phase 6: Review pre-analysis state
  reviewBriefing: null,
  reviewStatus: 'idle',
  reviewProgress: null,
  reviewError: null,
  reviewSession: null,
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
        // Phase 6: hydrate selected WebLLM model ID so activateBrowserLLM uses it
        if ((s as { selectedModelId?: string }).selectedModelId !== undefined) {
          setState('llmModelId', (s as { selectedModelId?: string }).selectedModelId ?? null);
        }
        // Phase 13: hydrate multi-provider cloud settings
        if (s.activeCloudProvider) setState('activeCloudProvider', s.activeCloudProvider);
        if (s.providerModels) setState('providerModels', s.providerModels);
        if (s.customEndpointConfig !== undefined) setState('customEndpointConfig', s.customEndpointConfig ?? null);
        // Activate adapters that were enabled in a previous session
        if (s.browserLLMEnabled) void activateBrowserLLM();
        if (s.cloudAPIEnabled) void activateCloudAdapter();
        // Phase 8: Initialize tiered pipeline when AI is enabled
        if (s.aiEnabled) void initTieredAI();
      }
      // Phase 6: hydrate review session from Dexie (AIRV-05)
      loadReviewSession().then((session) => {
        if (session) {
          setState('reviewSession', session);
          // Also restore briefing from session for immediate rendering
          setState('reviewBriefing', session.briefingResult);
          setState('reviewStatus', 'ready');
        }
      });
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
  // Phase 8: Initialize tiered pipeline when AI is first enabled
  if (enabled) void initTieredAI();
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
  const { BrowserAdapter, DEFAULT_MODEL_ID: DEFAULT_MODEL } = await import('../../ai/adapters/browser');
  const { setActiveAdapter } = await import('../../ai/router');
  // Read selected model from store (set by model selector or hydrated from persisted settings)
  const modelId = state.llmModelId ?? DEFAULT_MODEL;
  const adapter = new BrowserAdapter(modelId);
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
 * Switch the active cloud provider. Persists via SAVE_AI_SETTINGS.
 * If cloud API is currently enabled, immediately re-creates the adapter.
 */
export function setActiveCloudProvider(providerId: string): void {
  setState('activeCloudProvider', providerId);
  sendCommand({ type: 'SAVE_AI_SETTINGS', payload: { activeCloudProvider: providerId } });
  if (state.cloudAPIEnabled) {
    void activateCloudAdapter();
  }
}

/**
 * Override the model for a specific provider. Persists via SAVE_AI_SETTINGS.
 */
export function setProviderModel(providerId: string, model: string): void {
  setState('providerModels', providerId, model);
  sendCommand({ type: 'SAVE_AI_SETTINGS', payload: { providerModels: { ...state.providerModels, [providerId]: model } } });
}

/**
 * Set or clear the custom endpoint configuration. Persists via SAVE_AI_SETTINGS.
 */
export function setCustomEndpointConfig(
  config: { label: string; baseURL: string; model: string } | null,
): void {
  setState('customEndpointConfig', config);
  sendCommand({ type: 'SAVE_AI_SETTINGS', payload: { customEndpointConfig: config } });
}

/**
 * Create the active cloud adapter (factory pattern), initialize it with the current
 * memory key for the active provider, and set it as the active adapter.
 * Updates cloudStatus reactively. Call after saving a key, toggling cloud on, or switching provider.
 */
export async function activateCloudAdapter(): Promise<void> {
  const { AnthropicCloudAdapter } = await import('../../ai/adapters/cloud');
  const { OpenAICompatibleAdapter } = await import('../../ai/adapters/cloud-openai');
  const { PROVIDER_REGISTRY } = await import('../../ai/provider-registry');
  const { getMemoryKeyForProvider } = await import('../../ai/key-vault');
  const { setActiveAdapter } = await import('../../ai/router');

  const providerId = state.activeCloudProvider ?? 'anthropic';
  const config = PROVIDER_REGISTRY[providerId as keyof typeof PROVIDER_REGISTRY];
  const apiKey = getMemoryKeyForProvider(providerId as import('../../ai/provider-registry').ProviderId);

  if (!apiKey) {
    setState('cloudStatus', 'unavailable');
    return;
  }

  let adapter: import('../../ai/adapters/adapter').AIAdapter;
  if (providerId === 'anthropic') {
    const a = new AnthropicCloudAdapter();
    a.initialize();
    adapter = a;
  } else {
    const baseURL = providerId === 'custom'
      ? state.customEndpointConfig?.baseURL ?? ''
      : config?.baseURL ?? '';
    const model = providerId === 'custom'
      ? state.customEndpointConfig?.model ?? ''
      : state.providerModels[providerId] ?? config?.defaultModel ?? '';
    const displayName = providerId === 'custom'
      ? state.customEndpointConfig?.label ?? 'Custom'
      : config?.displayName ?? providerId;
    adapter = new OpenAICompatibleAdapter({
      id: providerId,
      displayName,
      apiKey,
      baseURL,
      model,
    });
  }

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

/**
 * Set the selected WebLLM model ID for local AI inference.
 * Persists via SAVE_AI_SETTINGS so the model choice survives reload.
 * Note: changing the model takes effect on the next activateBrowserLLM() call.
 */
export function setSelectedLLMModel(modelId: string): void {
  setState('llmModelId', modelId);
  sendCommand({ type: 'SAVE_AI_SETTINGS', payload: { selectedModelId: modelId } });
}

export function setPendingCloudRequest(
  entry: CloudRequestLogEntry | null,
  resolve: ((approved: boolean) => void) | null,
  entities?: DetectedEntity[],
  entityMap?: Map<string, string>,
): void {
  setState('pendingCloudRequest', entry);
  setState('pendingCloudRequestResolve', resolve);
  setState('pendingCloudRequestEntities', entities ?? []);
  setState('pendingCloudRequestEntityMap', entityMap ?? new Map());
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

// --- Phase 24: Enrichment session state (ephemeral, main-thread only) ---

import type { EnrichmentSession, ClarificationAnswer, GraduationProposal, MissingInfoCategory } from '../../ai/enrichment/types';
import {
  createEnrichmentSession,
  applyAnswer as engineApplyAnswer,
  applyDecompositionStep as engineApplyDecompStep,
  advanceSession as engineAdvanceSession,
  computeGraduationReadiness,
} from '../../ai/enrichment/enrichment-engine';
import { buildGraduationProposal, toggleChildInclusion, getGraduationActions } from '../../ai/enrichment/graduation';
import { parseEnrichment, appendEnrichment } from '../../ai/clarification/enrichment';
import { computeMaturity } from '../../ai/enrichment/maturity';
import { TEMPLATE_TIER_COUNT } from '../../ai/enrichment/types';
import { selectSemanticFollowUp } from '../../ai/enrichment/semantic-selector';

const [enrichmentSession, setEnrichmentSession] = createSignal<EnrichmentSession | null>(null);
const [graduationProposal, setGraduationProposal] = createSignal<GraduationProposal | null>(null);

export { enrichmentSession, graduationProposal };

/**
 * Start enrichment for an inbox item.
 * Creates a session via the enrichment engine with the item's content and existing enrichments.
 * Passes depthMap from the item's enrichmentDepth to enable iterative deepening.
 */
export function startEnrichment(inboxItemId: string): void {
  const item = state.inboxItems.find((i) => i.id === inboxItemId);
  if (!item) return;

  const parsed = parseEnrichment(item.content);
  const session = createEnrichmentSession({
    inboxItemId,
    content: item.content,
    atomType: item.type,
    existingEnrichments: parsed.enrichments,
    depthMap: item.enrichmentDepth ?? {},
    cognitiveSignals: null, // Future: pass cached cognitive signals when available
  });
  setEnrichmentSession(session);
}

/**
 * Handle a clarification answer during enrichment.
 * Applies the answer, updates maturity, and persists to Dexie immediately.
 */
export async function handleEnrichmentAnswer(answer: ClarificationAnswer): Promise<void> {
  const session = enrichmentSession();
  if (!session) return;

  const updated = engineApplyAnswer(session, answer);
  setEnrichmentSession(updated);

  // Compute maturity from all answers so far
  const enrichments: Record<string, string> = {};
  for (const a of updated.answers) {
    if (a.wasSkipped) continue;
    const KEYS: Record<string, string> = {
      'missing-outcome': 'Outcome',
      'missing-next-action': 'Next Action',
      'missing-timeframe': 'Deadline',
      'missing-context': 'Context',
      'missing-reference': 'Reference',
    };
    const key = KEYS[a.category] ?? a.category;
    const val = a.wasFreeform ? a.freeformText : a.selectedOption;
    if (key && val) enrichments[key] = val;
  }

  const maturityScore = computeMaturity(enrichments);
  const maturityFilled = Object.keys(enrichments);

  // Persist maturity + provenance + enriched content to Dexie immediately.
  // Rebuild content from original + all answers so partial enrichment survives close.
  const { original } = parseEnrichment(session.originalContent);
  const enrichedContent = appendEnrichment(original, updated.answers);

  try {
    const { db: dexie } = await import('../../storage/db');
    await dexie.inbox.update(session.inboxItemId, {
      content: enrichedContent,
      maturityScore,
      maturityFilled,
      provenance: updated.provenance,
      enrichmentDepth: updated.categoryDepth,
    });
  } catch (err) {
    console.warn('[handleEnrichmentAnswer] Dexie update failed:', err);
  }
}

/**
 * Handle a decomposition step action during enrichment.
 */
export function handleDecompositionStep(
  index: number,
  action: 'accept' | 'edit' | 'skip',
  text?: string,
): void {
  const session = enrichmentSession();
  if (!session) return;
  const updated = engineApplyDecompStep(session, index, action, text);
  setEnrichmentSession(updated);
}

/**
 * Advance the enrichment session to the next phase.
 *
 * When reaching 'graduating' phase, auto-builds the graduation proposal.
 * When phase is 'done', cleans up session and proposal.
 */
export function advanceEnrichment(choice?: 'accept' | 'decline'): void {
  const session = enrichmentSession();
  if (!session) return;
  const updated = engineAdvanceSession(session, choice);
  setEnrichmentSession(updated);

  // Build graduation proposal when entering graduating phase
  if (updated.phase === 'graduating') {
    const proposal = buildGraduationProposal(updated);
    setGraduationProposal(proposal);
  }

  // Clean up when done
  if (updated.phase === 'done') {
    setEnrichmentSession(null);
    setGraduationProposal(null);
  }
}

/**
 * Close/cancel enrichment session.
 */
export function closeEnrichment(): void {
  setEnrichmentSession(null);
}

/**
 * Handle "Ask more on this topic": generate another follow-up for a category.
 * Increments the depth for the category. At depths 1-2, uses template tiers.
 * At depth 3+, uses MiniLM semantic selection to pick the most novel question
 * from the question bank based on embedding distance from previously asked questions.
 */
export function handleAskMore(category: MissingInfoCategory): void {
  const session = enrichmentSession();
  if (!session) return;

  const item = state.inboxItems.find((i) => i.id === session.inboxItemId);
  if (!item) return;

  // Increment depth for the requested category
  const updatedDepth = { ...session.categoryDepth };
  const newDepth = (updatedDepth[category] ?? 0) + 1;
  updatedDepth[category] = newDepth;

  if (newDepth <= TEMPLATE_TIER_COUNT) {
    // Depths 1-2: use template tiers (sync, zero inference cost)
    const parsed = parseEnrichment(item.content);
    const newSession = createEnrichmentSession({
      inboxItemId: session.inboxItemId,
      content: item.content,
      atomType: item.type,
      existingEnrichments: parsed.enrichments,
      depthMap: updatedDepth,
      cognitiveSignals: session.cognitiveSignals,
    });

    setEnrichmentSession({
      ...newSession,
      answers: session.answers,
      provenance: session.provenance,
      activeDeepening: category,
    });
  } else {
    // Depth 3+: semantic selection via MiniLM embeddings
    const worker = getEmbeddingWorker();
    if (!worker) {
      // No worker available — fall back to template cycling
      const parsed = parseEnrichment(item.content);
      const newSession = createEnrichmentSession({
        inboxItemId: session.inboxItemId,
        content: item.content,
        atomType: item.type,
        existingEnrichments: parsed.enrichments,
        depthMap: updatedDepth,
        cognitiveSignals: session.cognitiveSignals,
      });
      setEnrichmentSession({
        ...newSession,
        answers: session.answers,
        provenance: session.provenance,
        activeDeepening: category,
      });
      return;
    }

    // Collect previously asked question texts for this category
    const askedQuestions = session.questions
      .filter(q => q.category === category)
      .map(q => q.questionText);

    // Get the user's latest answer for slot-filling
    const lastAnswer = session.answers
      .filter(a => a.category === category && !a.wasSkipped)
      .pop();
    const priorAnswer = lastAnswer
      ? (lastAnswer.wasFreeform ? lastAnswer.freeformText : lastAnswer.selectedOption) ?? ''
      : '';

    // Async: select the most semantically novel question
    void selectSemanticFollowUp(worker, category, priorAnswer, askedQuestions).then(question => {
      const currentSession = enrichmentSession();
      if (!currentSession || currentSession.inboxItemId !== session.inboxItemId) return;

      // Replace the current question with the semantically selected one
      setEnrichmentSession({
        ...currentSession,
        questions: [question],
        currentQuestionIndex: 0,
        categoryDepth: updatedDepth,
        activeDeepening: category,
        phase: 'questions',
      });
    });
  }
}

/**
 * Handle "Move to next area": advance to the next question in the session.
 * Clears activeDeepening and moves the question index forward.
 */
export function handleMoveNext(): void {
  const session = enrichmentSession();
  if (!session) return;

  setEnrichmentSession({
    ...session,
    activeDeepening: null,
    currentQuestionIndex: session.currentQuestionIndex + 1,
  });
}

/**
 * Compute prior answers from an inbox item's content for display in the enrichment wizard.
 * Returns a Record keyed by display name (e.g., "Outcome", "Next Action").
 */
export function computePriorAnswers(inboxItemId: string): Record<string, string> {
  const item = state.inboxItems.find((i) => i.id === inboxItemId);
  if (!item) return {};
  const parsed = parseEnrichment(item.content);
  return parsed.enrichments;
}

/**
 * Toggle a child atom's inclusion in the graduation proposal.
 */
export function toggleGraduationChild(childIndex: number): void {
  const proposal = graduationProposal();
  if (!proposal) return;
  setGraduationProposal(toggleChildInclusion(proposal, childIndex));
}

/**
 * Handle graduation confirmation: create parent + child atoms.
 *
 * 1. Gets action descriptors from the graduation module
 * 2. For classify-parent: classifies the existing inbox item
 * 3. For create-child: creates new inbox item then immediately classifies
 *    (children skip re-triage -- go directly to suggested sections)
 * 4. Closes enrichment session
 */
export function handleGraduationConfirm(): void {
  const proposal = graduationProposal();
  const session = enrichmentSession();
  if (!proposal || !session) return;

  const actions = getGraduationActions(proposal);
  let createdCount = 0;

  for (const action of actions) {
    if (action.action === 'classify-parent') {
      // Classify the existing inbox item as the parent atom type
      sendCommand({
        type: 'CLASSIFY_INBOX_ITEM',
        payload: {
          id: session.inboxItemId,
          type: action.type,
          sectionItemId: action.sectionItemId ?? undefined,
        },
      });
      createdCount++;
    } else if (action.action === 'create-child') {
      // Create child as new inbox item, then immediately classify
      // (skipTriage: children go directly to their suggested section)
      sendCommand({
        type: 'CREATE_INBOX_ITEM',
        payload: {
          content: action.content,
        },
      });
      // Deferred classify: wait for worker to sync the new item into state
      const childAction = action;
      setTimeout(() => {
        const items = state.inboxItems;
        const match = items.find((item) => item.content === childAction.content);
        if (match) {
          sendCommand({
            type: 'CLASSIFY_INBOX_ITEM',
            payload: {
              id: match.id,
              type: childAction.type,
              sectionItemId: childAction.sectionItemId ?? undefined,
            },
          });
        }
      }, 200);
      createdCount++;
    }
  }

  // Close enrichment session
  setEnrichmentSession(null);
  setGraduationProposal(null);

  console.log(`[Graduation] Created ${createdCount} atoms from enrichment`);
}

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
      tieredEnabled(),  // Phase 8: use tiered pipeline when initialized
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

// --- Phase 7: Staging area (ephemeral — NOT in BinderState) ---

export type StagingProposalType = 'new-atom' | 'mutation' | 'deletion';

export interface NewAtomProposal {
  type: 'new-atom';
  id: string;                         // ephemeral proposal ID
  proposedTitle: string;
  proposedContent: string;
  proposedType: 'task' | 'fact' | 'event' | 'decision' | 'insight';
  proposedSection?: string;
  proposedTags?: string[];
  reasoning: string;
  source: 'get-clear' | 'get-current' | 'get-creative';
}

export interface MutationProposal {
  type: 'mutation';
  id: string;                         // ephemeral proposal ID
  atomId: string;                     // real atom to mutate
  currentAtomTitle: string;           // snapshot for display
  proposedChanges: Partial<Atom>;     // what to change
  reasoning: string;
  source: 'compression-coach' | 'get-current' | 'get-creative';
}

export interface DeletionProposal {
  type: 'deletion';
  id: string;                         // ephemeral proposal ID
  atomId: string;
  atomTitle: string;                  // snapshot for display
  proposedAction: 'archive' | 'delete';
  reasoning: string;
  source: 'compression-coach';
}

export type StagingProposal = NewAtomProposal | MutationProposal | DeletionProposal;

// Module-level signals (NOT in BinderState — ephemeral per review session)
const [stagingProposals, setStagingProposals] = createSignal<StagingProposal[]>([]);
export { stagingProposals };

export function addStagingProposal(proposal: StagingProposal): void {
  setStagingProposals((prev) => [...prev, proposal]);
}

export function removeStagingProposal(proposalId: string): void {
  setStagingProposals((prev) => prev.filter((p) => p.id !== proposalId));
}

export function clearStagingArea(): void {
  setStagingProposals([]);
}

export function approveProposal(proposalId: string): void {
  const proposals = stagingProposals();
  const proposal = proposals.find((p) => p.id === proposalId);
  if (!proposal) return;

  switch (proposal.type) {
    case 'new-atom':
      sendCommand({
        type: 'CREATE_INBOX_ITEM',
        payload: {
          content: proposal.proposedContent,
          title: proposal.proposedTitle,
        },
      });
      break;

    case 'mutation': {
      // Re-read current atom from state to avoid stale snapshot (Pitfall 3 from research)
      const currentAtom = state.atoms.find((a) => a.id === proposal.atomId);
      if (!currentAtom) break;
      sendCommand({
        type: 'UPDATE_ATOM',
        payload: {
          id: proposal.atomId,
          changes: proposal.proposedChanges,
          source: 'ai',
          aiRequestId: proposal.id,
        },
      });
      break;
    }

    case 'deletion':
      if (proposal.proposedAction === 'archive') {
        sendCommand({
          type: 'UPDATE_ATOM',
          payload: {
            id: proposal.atomId,
            changes: { status: 'archived' },
            source: 'ai',
            aiRequestId: proposal.id,
          },
        });
      } else {
        sendCommand({
          type: 'DELETE_ATOM',
          payload: {
            id: proposal.atomId,
            source: 'ai',
            aiRequestId: proposal.id,
          },
        });
      }
      break;
  }

  removeStagingProposal(proposalId);
}

export function approveAllProposals(): void {
  // Copy array because approveProposal removes items
  const allProposals = [...stagingProposals()];
  for (const proposal of allProposals) {
    approveProposal(proposal.id);
  }
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

// Phase 8: Tiered pipeline state (declared early — referenced by anyAIAvailable)
export type Tier2Status = 'inactive' | 'initializing' | 'ready' | 'error';
const [tier2Status, setTier2Status] = createSignal<Tier2Status>('inactive');
const [tieredEnabled, setTieredEnabledSignal] = createSignal(false);
export { tier2Status, tieredEnabled };

/**
 * Reactive signal: true when any AI capability is available (browser LLM, cloud, or ONNX tier-2).
 */
export const anyAIAvailable = createMemo(() => llmReady() || cloudReady() || tieredEnabled());

/**
 * UI signal: controls AI settings panel visibility.
 * Shared here to avoid circular dependencies (Shell → AIOrb → AIRadialMenu → Shell).
 */
const [showAISettings, setShowAISettings] = createSignal(false);
export { showAISettings, setShowAISettings };

/** Capture overlay signal — shared between app.tsx and AIOrb double-tap */
const [showCapture, setShowCapture] = createSignal(false);
export { showCapture, setShowCapture };

// --- Phase 10: Classifier load state ---

/**
 * Download progress for the ONNX classifier model.
 * null = not loading / already ready
 * 0-100 = download progress percentage
 * -1 = indeterminate (loading from cache or unknown progress)
 */
const [classifierLoadProgress, setClassifierLoadProgress] = createSignal<number | null>(null);

/**
 * Whether the ONNX classifier session is loaded and ready in the embedding worker.
 */
const [classifierReady, setClassifierReady] = createSignal(false);

/**
 * Version string for the loaded ONNX classifier model.
 * Set to 'v1' on CLASSIFIER_READY — hardcoded until triage-type-classes.json
 * includes a version field from the training pipeline.
 * null = classifier not yet loaded.
 */
const [classifierVersion, setClassifierVersion] = createSignal<string | null>(null);

export { classifierLoadProgress, classifierReady, classifierVersion };

// --- Phase 10: Shared embedding worker singleton ---
// Single instance shared between SearchOverlay (semantic search) and Tier 2 handler (classification).
// Avoids duplicate model downloads and double memory usage.

let _embeddingWorker: Worker | null = null;

/**
 * Get the shared embedding worker, or null if not yet created.
 * Used by Tier 2 handler to send CLASSIFY_ONNX / CLASSIFY_TYPE messages.
 */
export function getEmbeddingWorker(): Worker | null {
  return _embeddingWorker;
}

/**
 * Get or create the shared embedding worker singleton.
 * Attaches lifecycle listeners for CLASSIFIER_PROGRESS/READY/ERROR on first creation.
 * Called by initTieredAI() and by SearchOverlay.tsx on first open.
 */
export function ensureEmbeddingWorker(): Worker {
  if (!_embeddingWorker) {
    _embeddingWorker = new Worker(
      new URL('../../search/embedding-worker.ts', import.meta.url),
      { type: 'module' },
    );

    // Listen for classifier lifecycle events from the ONNX loader
    _embeddingWorker.addEventListener('message', (event: MessageEvent) => {
      const msg = event.data as { type: string; percent?: number; error?: string };
      switch (msg.type) {
        case 'CLASSIFIER_PROGRESS':
          setClassifierLoadProgress(msg.percent ?? -1);
          break;
        case 'CLASSIFIER_READY':
          setClassifierLoadProgress(null);  // Hide progress indicator once ready
          setClassifierReady(true);
          setClassifierVersion('v1');  // Hardcoded until triage-type-classes.json includes version field
          break;
        case 'CLASSIFIER_ERROR':
          // Silent fallback per locked decision — ONNX errors degrade to centroid path
          setClassifierLoadProgress(null);
          console.warn('[BinderOS] Classifier load failed:', msg.error);
          break;
      }
    });
  }
  return _embeddingWorker;
}

/**
 * Initialize the tiered AI pipeline (Phase 8 + Phase 10: 3-Ring Binder).
 *
 * Registers Tier 1 (deterministic) + Tier 2 (ONNX/centroid) + Tier 3 (generative) handlers.
 * Phase 10: Creates shared embedding worker, sends LOAD_CLASSIFIER for eager ONNX loading,
 * registers Tier 2 handler with classifierReady getter for ONNX path when ready.
 *
 * Called once after AI is first enabled and classification history is available.
 */
export async function initTieredAI(): Promise<void> {
  if (tier2Status() !== 'inactive') return;
  setTier2Status('initializing');

  try {
    const { initTieredPipeline, registerHandler } = await import('../../ai/tier2');
    const { createTier2Handler } = await import('../../ai/tier2/tier2-handler');
    const { getClassificationHistory } = await import('../../storage/classification-log');
    const { loadTypeCentroids, loadSectionCentroids } = await import('../../ai/tier2/centroid-builder');

    const history = await getClassificationHistory();
    initTieredPipeline(history);

    // Load persisted centroids for the centroid fallback path
    const typeCentroids = await loadTypeCentroids();
    const sectionCentroids = await loadSectionCentroids();

    // Module-level centroid references (updated after each rebuild)
    let _typeCentroids = typeCentroids;
    let _sectionCentroids = sectionCentroids;

    // Create and configure shared embedding worker
    const worker = ensureEmbeddingWorker();

    // Send LOAD_CLASSIFIER to trigger eager ONNX model loading
    worker.postMessage({ type: 'LOAD_CLASSIFIER' });

    // Register Tier 2 handler with both ONNX and centroid capabilities
    const tier2 = createTier2Handler(
      getEmbeddingWorker,
      () => _typeCentroids,
      () => _sectionCentroids,
      () => classifierReady(),
    );
    registerHandler(tier2);

    // Expose centroid update function for post-classification rebuilds
    // (store on module scope so classification-log callbacks can call it)
    _updateTier2Centroids = (type, section) => {
      _typeCentroids = type;
      _sectionCentroids = section;
    };

    setTieredEnabledSignal(true);
    setTier2Status('ready');
  } catch (err) {
    console.error('[BinderOS] Tiered pipeline init failed:', err);
    setTier2Status('error');
  }
}

/** Internal: update centroid references after rebuild. Set by initTieredAI. */
let _updateTier2Centroids: ((type: import('../../ai/tier2/centroid-builder').CentroidSet | null, section: import('../../ai/tier2/centroid-builder').CentroidSet | null) => void) | null = null;

/**
 * Update Tier 2 centroid references after a classification event triggers a rebuild.
 * Called by the centroid rebuild pipeline (outside this module) via dynamic import.
 */
export function updateTier2Centroids(
  typeCentroids: import('../../ai/tier2/centroid-builder').CentroidSet | null,
  sectionCentroids: import('../../ai/tier2/centroid-builder').CentroidSet | null,
): void {
  _updateTier2Centroids?.(typeCentroids, sectionCentroids);
}

// --- Phase 6: Review briefing orchestration ---

/** Module-level AbortController for in-flight briefing (same pattern as triage). */
let reviewAbortController: AbortController | null = null;

/**
 * Start review briefing pipeline.
 *
 * Two-phase: sync pre-analysis (stale items, missing next actions, compression candidates)
 * followed by a template-driven summary sentence from entropy signals. Emits incremental
 * progress via reviewProgress, creates an analysis atom on completion, and navigates to review page.
 *
 * Runs fully from local data — no AI adapter required.
 * Cancels any in-progress briefing before starting.
 *
 * Phase 6: AIRV-01, AIRV-02
 * Phase 12: Removed AI guard — briefing works fully offline
 */
export async function startReviewBriefing(): Promise<void> {
  // 1. Cancel any in-progress briefing
  if (reviewAbortController) {
    reviewAbortController.abort();
  }
  reviewAbortController = new AbortController();

  // 2. Set review state
  setState('reviewStatus', 'analyzing');
  setState('reviewProgress', 'Analyzing system entropy...');
  setState('reviewError', null);
  setState('reviewBriefing', null);

  try {
    // 5. Import and call analysis pipeline
    // Retention: prune old briefings before creating a new one (keep 4 most recent)
    await pruneOldBriefings();

    const { generateBriefing } = await import('../../ai/analysis');
    const result = await generateBriefing(
      state.atoms,
      state.scores,
      state.entropyScore,
      state.sectionItems,
      state.sections,
      (msg) => setState('reviewProgress', msg),
      reviewAbortController.signal,
    );

    // 6. Store result
    setState('reviewBriefing', result);
    setState('reviewStatus', 'ready');
    setState('reviewProgress', null);

    // 6b. Save review session to Dexie (AIRV-05)
    const session: ReviewSession = {
      briefingResult: result,
      expandedItemIds: [],
      addressedItemIds: [],
      scrollPosition: 0,
      startedAt: Date.now(),
      lastActiveAt: Date.now(),
    };
    setState('reviewSession', session);
    await saveReviewSession(session);

    // 7. Create analysis atom via worker command
    sendCommand({
      type: 'CREATE_ATOM',
      payload: {
        type: 'analysis',
        analysisKind: 'review-briefing',
        isReadOnly: true,
        title: `Review Briefing — ${new Date().toLocaleDateString()}`,
        content: result.summaryText,
        status: 'open',
        links: [],
        tags: [],
        provenance: 0,
        aiSourced: true,
        briefingData: result,
      },
    });

    // 8. Navigate to review page
    setActivePage('review');
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      setState('reviewStatus', 'idle');
      setState('reviewProgress', null);
    } else {
      setState('reviewStatus', 'error');
      setState('reviewError', err instanceof Error ? err.message : 'Briefing failed');
    }
  } finally {
    reviewAbortController = null;
  }
}

/**
 * Cancel any in-flight review briefing.
 *
 * Aborts the AbortController, which halts the generateBriefing pipeline.
 * reviewStatus returns to 'idle'.
 */
export function cancelReviewBriefing(): void {
  if (reviewAbortController) {
    reviewAbortController.abort();
    reviewAbortController = null;
  }
}

/**
 * Prune old analysis briefing atoms to keep only the 3 most recent
 * (we're about to add a 4th, so total stays at 4).
 *
 * Called before creating a new analysis atom in startReviewBriefing.
 */
async function pruneOldBriefings(): Promise<void> {
  const { db: dexie } = await import('../../storage/db');
  const allAnalysis = await dexie.atoms
    .where('type').equals('analysis')
    .sortBy('created_at');
  // Keep the 3 most recent — we're about to add one more (total = 4)
  const toDelete = allAnalysis.slice(0, Math.max(0, allAnalysis.length - 3));
  for (const a of toDelete) {
    sendCommand({ type: 'DELETE_ATOM', payload: { id: a.id } });
  }
}

/**
 * Update the current review session with partial data.
 *
 * Called by ReviewBriefingView when items are expanded, addressed, or scrolled.
 * Updates store state and persists to Dexie.
 */
export async function updateReviewSession(updates: Partial<ReviewSession>): Promise<void> {
  const current = state.reviewSession;
  if (!current) return;
  const updated: ReviewSession = { ...current, ...updates, lastActiveAt: Date.now() };
  setState('reviewSession', updated);
  await saveReviewSession(updated);
}

/**
 * Complete the review session — clears session state and Dexie entry.
 *
 * Called by "Finish Review" button in ReviewBriefingView.
 * After this, the orb badge dot disappears and review state resets.
 */
export async function finishReviewSession(): Promise<void> {
  setState('reviewSession', null);
  setState('reviewBriefing', null);
  setState('reviewStatus', 'idle');
  await clearReviewSession();
}

// --- Phase 7: Review flow state (ephemeral) ---

export type ReviewFlowStatus = 'idle' | 'get-clear' | 'get-current' | 'get-creative' | 'staging' | 'complete';

const [reviewFlowStatus, setReviewFlowStatus] = createSignal<ReviewFlowStatus>('idle');
const [reviewFlowStep, setReviewFlowStep] = createSignal<ReviewFlowStep | null>(null);
const [reviewFlowQueue, setReviewFlowQueue] = createSignal<ReviewFlowStep[]>([]);
const [reviewPhaseContext, setReviewPhaseContext] = createSignal<ReviewPhaseContext | null>(null);
const [reviewStepIndex, setReviewStepIndex] = createSignal(0);
const [reviewTotalSteps, setReviewTotalSteps] = createSignal(0);

export { reviewFlowStatus, reviewFlowStep, reviewPhaseContext, reviewStepIndex, reviewTotalSteps };

/** Module-level AbortController for in-flight review flow. */
let reviewFlowAbortController: AbortController | null = null;

/**
 * Start a guided GTD weekly review.
 *
 * Initializes the review flow state machine, builds Get Clear steps from inbox items,
 * and navigates to the review-flow page.
 *
 * Phase 7: AIRV-03
 * Phase 12: Removed AI guard — guided review works without AI adapter
 */
export async function startGuidedReview(): Promise<void> {
  // 1. Cancel any in-flight review flow
  reviewFlowAbortController?.abort();
  reviewFlowAbortController = new AbortController();

  // 3. Set orb state to 'thinking'
  const { setOrbState } = await import('../components/AIOrb');
  setOrbState('thinking');

  // 4. Build Get Clear step queue from current inbox items
  const { buildGetClearSteps } = await import('../../ai/review-flow');
  const steps = buildGetClearSteps(state.inboxItems);

  // 5. Initialize ReviewPhaseContext
  const context: ReviewPhaseContext = {
    phase: 'get-clear',
    phaseSummaries: [],
    currentStep: 0,
    atomsReviewed: [],
    actionsTaken: [],
  };

  // 6. Set signals
  setReviewFlowStatus('get-clear');
  setReviewFlowQueue(steps);
  setReviewFlowStep(steps[0] ?? null);
  setReviewPhaseContext(context);
  setReviewStepIndex(0);
  setReviewTotalSteps(steps.length);

  // 7. Persist phase state to review session
  await updateReviewSession({ reviewPhase: 'get-clear', reviewPhaseContext: context });

  // 8. Navigate to review-flow page
  setActivePage('review-flow');
  setOrbState('idle');
}

/**
 * Advance the review flow to the next step.
 *
 * Records the user's action, executes any staging action from the selected option,
 * and either dequeues the next step or transitions to the next phase.
 *
 * Phase 7: AIRV-03
 */
export async function advanceReviewStep(selectedOptionId: string, freeformText?: string): Promise<void> {
  const currentStep = reviewFlowStep();
  const ctx = reviewPhaseContext();
  if (!currentStep || !ctx) return;

  // 1. Record action
  const action: ReviewAction = {
    stepId: currentStep.stepId,
    selectedOptionId,
    selectedLabel: currentStep.options.find(o => o.id === selectedOptionId)?.label ?? selectedOptionId,
    freeformText,
    phase: ctx.phase,
    timestamp: Date.now(),
  };

  const updatedContext: ReviewPhaseContext = {
    ...ctx,
    actionsTaken: [...ctx.actionsTaken, action],
    currentStep: ctx.currentStep + 1,
    atomsReviewed: currentStep.atomId
      ? [...ctx.atomsReviewed, currentStep.atomId]
      : ctx.atomsReviewed,
  };
  setReviewPhaseContext(updatedContext);

  // 2. Execute staging action from selected option (if applicable)
  const selectedOption = currentStep.options.find(o => o.id === selectedOptionId);
  if (selectedOption?.stagingAction) {
    await executeStagingAction(selectedOption.stagingAction, freeformText);
  } else if (freeformText && currentStep.allowFreeform) {
    // Freeform text submitted without a specific option — treat as capture
    await executeStagingAction({ type: 'capture', content: freeformText });
  }

  // 3. Dequeue next step
  const queue = reviewFlowQueue();
  const nextIndex = queue.indexOf(currentStep) + 1;

  if (nextIndex < queue.length) {
    // More steps in current phase
    setReviewFlowStep(queue[nextIndex] ?? null);
    setReviewStepIndex(nextIndex);
    await updateReviewSession({ reviewPhaseContext: updatedContext });
  } else {
    // Phase complete — transition
    await transitionToNextPhase(updatedContext);
  }
}

/**
 * Execute a staging action from a review step option.
 * Destructive actions (archive, delete) are staged during Get Current/Creative.
 * Non-destructive actions (defer, capture, add-next-action) execute immediately.
 */
async function executeStagingAction(action: StagingAction, freeformText?: string): Promise<void> {
  const currentPhase = reviewPhaseContext()?.phase;

  switch (action.type) {
    case 'archive':
      // During Get Current or Get Creative, stage; during Get Clear, execute immediately
      if (currentPhase === 'get-current' || currentPhase === 'get-creative') {
        const atom = state.atoms.find((a) => a.id === action.atomId);
        addStagingProposal({
          type: 'deletion',
          id: crypto.randomUUID(),
          atomId: action.atomId,
          atomTitle: atom?.title || atom?.content.slice(0, 60) || action.atomId,
          proposedAction: 'archive',
          reasoning: 'Flagged during guided review',
          source: 'compression-coach',
        });
      } else {
        sendCommand({ type: 'UPDATE_ATOM', payload: { id: action.atomId, changes: { status: 'archived' } } });
      }
      break;

    case 'delete': {
      // Always stage deletions for safety
      const delAtom = state.atoms.find((a) => a.id === action.atomId);
      addStagingProposal({
        type: 'deletion',
        id: crypto.randomUUID(),
        atomId: action.atomId,
        atomTitle: delAtom?.title || delAtom?.content.slice(0, 60) || action.atomId,
        proposedAction: 'delete',
        reasoning: 'Marked for deletion during guided review',
        source: 'compression-coach',
      });
      break;
    }

    case 'defer':
      // Defers execute immediately (non-destructive — just touches timestamp)
      sendCommand({ type: 'UPDATE_ATOM', payload: { id: action.atomId, changes: { updated_at: Date.now() } } });
      break;

    case 'add-next-action': {
      const content = freeformText || `Next action for: ${action.projectName}`;
      sendCommand({ type: 'CREATE_INBOX_ITEM', payload: { content } });
      break;
    }

    case 'capture':
      if (freeformText) {
        sendCommand({ type: 'CREATE_INBOX_ITEM', payload: { content: freeformText } });
      }
      break;

    case 'skip':
    case 'none':
      break;
  }
}

/**
 * Transition from one review phase to the next.
 *
 * Generates a phase summary via AI, builds the next phase's step queue,
 * and updates all review flow signals.
 */
async function transitionToNextPhase(context: ReviewPhaseContext): Promise<void> {
  const signal = reviewFlowAbortController?.signal;

  // 1. Generate phase summary via AI
  const { generatePhaseSummary, buildGetCurrentSteps, buildGetCreativeSteps } = await import('../../ai/review-flow');
  const summary = await generatePhaseSummary(context.phase, context.actionsTaken, signal);

  const updatedSummaries = [...context.phaseSummaries, summary];
  const currentPhase = context.phase;

  // 2. Determine next phase
  let nextPhase: ReviewPhase | 'staging';
  if (currentPhase === 'get-clear') nextPhase = 'get-current';
  else if (currentPhase === 'get-current') nextPhase = 'get-creative';
  else nextPhase = 'staging'; // get-creative is done → go to staging review

  if (nextPhase === 'staging') {
    // Review complete — show staging area
    setReviewFlowStatus('staging');
    setReviewFlowStep(null);
    setReviewPhaseContext({ ...context, phaseSummaries: updatedSummaries });
    await updateReviewSession({ reviewPhase: null, reviewCompleted: true, reviewPhaseContext: { ...context, phaseSummaries: updatedSummaries } });
    return;
  }

  // 3. Build next phase step queue
  let steps: ReviewFlowStep[];
  if (nextPhase === 'get-current') {
    // Build from briefing data (already computed in Phase 6)
    const briefing = state.reviewBriefing;
    const staleAtoms = briefing?.staleItems.map(si => state.atoms.find(a => a.id === si.atomId)).filter((a): a is NonNullable<typeof a> => a != null) ?? [];
    const projectsMissing = briefing?.projectsMissingNextAction.map(p => state.sectionItems.find(si => si.id === p.atomId)).filter((si): si is NonNullable<typeof si> => si != null) ?? [];
    steps = buildGetCurrentSteps(staleAtoms, projectsMissing, state.compressionCandidates);

    // Generate compression explanations and add to staging if candidates exist
    if (state.compressionCandidates.length > 0) {
      try {
        const { generateCompressionExplanations } = await import('../../ai/compression');
        const explanations = await generateCompressionExplanations(
          state.compressionCandidates,
          state.atoms,
          state.scores,
          signal,
        );

        for (const exp of explanations) {
          if (exp.recommendedAction === 'tag-someday') {
            // Tag-someday → mutation proposal (add tag)
            const atom = state.atoms.find((a) => a.id === exp.atomId);
            addStagingProposal({
              type: 'mutation',
              id: crypto.randomUUID(),
              atomId: exp.atomId,
              currentAtomTitle: exp.title,
              proposedChanges: { tags: [...(atom?.tags ?? []), 'someday-maybe'] },
              reasoning: exp.explanation,
              source: 'compression-coach',
            });
          } else if (exp.recommendedAction === 'add-link') {
            // Add-link → mutation proposal with empty link (deferred)
            addStagingProposal({
              type: 'mutation',
              id: crypto.randomUUID(),
              atomId: exp.atomId,
              currentAtomTitle: exp.title,
              proposedChanges: {},
              reasoning: exp.explanation,
              source: 'compression-coach',
            });
          } else {
            // Archive or delete → deletion proposal
            const proposedAction = exp.recommendedAction === 'delete' ? 'delete' : 'archive';
            addStagingProposal({
              type: 'deletion',
              id: crypto.randomUUID(),
              atomId: exp.atomId,
              atomTitle: exp.title,
              proposedAction,
              reasoning: exp.explanation,
              source: 'compression-coach',
            });
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') throw err;
        console.warn('[review-flow] Compression explanation generation failed:', err);
        // Non-critical — review continues without AI explanations
      }
    }
  } else {
    // get-creative — trigger prompts enriched with section context, pattern surfacing is deterministic
    const { setOrbState } = await import('../components/AIOrb');
    setOrbState('thinking');
    const recentDecisions = state.atoms.filter(a => a.type === 'decision').slice(-10);
    const recentInsights = state.atoms.filter(a => a.type === 'insight').slice(-10);
    steps = await buildGetCreativeSteps(
      state.sections,
      recentDecisions,
      recentInsights,
      updatedSummaries,
      state.atoms,
      state.inboxItems,
      signal,
    );
    setOrbState('idle');
  }

  // 4. Initialize new phase context
  const newContext: ReviewPhaseContext = {
    phase: nextPhase,
    phaseSummaries: updatedSummaries,
    currentStep: 0,
    atomsReviewed: context.atomsReviewed, // carry forward
    actionsTaken: [], // reset per phase
  };

  // 5. Set signals
  setReviewFlowStatus(nextPhase);
  setReviewFlowQueue(steps);
  setReviewFlowStep(steps[0] ?? null);
  setReviewPhaseContext(newContext);
  setReviewStepIndex(0);
  setReviewTotalSteps(steps.length);

  // 6. Persist
  await updateReviewSession({ reviewPhase: nextPhase, reviewPhaseContext: newContext });
}

/**
 * Cancel the guided review flow and reset all state.
 * Clears staging area — unapproved proposals are discarded per ephemeral design.
 */
export function cancelGuidedReview(): void {
  reviewFlowAbortController?.abort();
  reviewFlowAbortController = null;
  clearStagingArea();
  setReviewFlowStatus('idle');
  setReviewFlowStep(null);
  setReviewFlowQueue([]);
  setReviewPhaseContext(null);
  setReviewStepIndex(0);
  setReviewTotalSteps(0);
}

/**
 * Complete the guided review — saves a final analysis atom summarizing the review,
 * clears flow state, and navigates back to inbox.
 */
export async function completeGuidedReview(): Promise<void> {
  // Save a final analysis atom summarizing the review
  const ctx = reviewPhaseContext();
  if (ctx && ctx.phaseSummaries.length > 0) {
    const summaryContent = ctx.phaseSummaries.join('\n\n');
    sendCommand({
      type: 'CREATE_ATOM',
      payload: {
        type: 'analysis',
        analysisKind: 'review-briefing',
        isReadOnly: true,
        title: `Weekly Review Summary — ${new Date().toLocaleDateString()}`,
        content: summaryContent,
        status: 'open',
        links: [],
        tags: ['weekly-review'],
        provenance: 0,
        aiSourced: true,
      },
    });
  }

  // Clear staging area (unapproved proposals are discarded — ephemeral design)
  clearStagingArea();

  // Clear flow state
  cancelGuidedReview();
  setReviewFlowStatus('complete');

  // Clean up session
  await finishReviewSession();

  // Navigate back
  setActivePage('inbox');
}

// --- Phase 7: GTD analysis orchestration ---

/**
 * Start GTD next-action analysis for a specific atom.
 *
 * Finds the atom, gets related atoms via keyword similarity,
 * kicks off the first GTD step, and opens GTDAnalysisFlow.
 *
 * Guards: requires the atom to exist. Works without AI (fallback questions).
 */
export async function startGTDAnalysis(atomId: string): Promise<void> {
  const atom = state.atoms.find(a => a.id === atomId);
  if (!atom) return;

  // Lazy imports to avoid circular dependencies
  const { findRelatedAtoms } = await import('../../ai/similarity');
  const { executeGTDStep, createGTDAbortController } = await import('../../ai/gtd-analysis');
  const { setShowGTDFlow, setGTDFlowState } = await import('../components/GTDAnalysisFlow');

  // Find related atoms for context
  const allAtoms = state.atoms
    .filter(a => a.id !== atomId)
    .map(a => ({ id: a.id, title: a.title, content: a.content }));
  const relatedIds = findRelatedAtoms(atom.content + ' ' + atom.title, allAtoms);
  const relatedAtoms = relatedIds
    .map(id => state.atoms.find(a => a.id === id))
    .filter((a): a is typeof state.atoms[0] => a != null);

  // Create abort controller for this session
  const controller = createGTDAbortController();

  // Initialize flow state (loading first step)
  setGTDFlowState({
    atom: { ...atom },
    relatedAtoms: relatedAtoms.map(a => ({ ...a })),
    currentStep: null,
    answers: [],
    recommendation: null,
    status: 'loading',
    error: null,
  });
  setShowGTDFlow(true);

  // Execute first step
  try {
    const step = await executeGTDStep(
      'actionable',
      atom,
      relatedAtoms,
      [],
      controller.signal,
    );
    setGTDFlowState(prev => prev ? {
      ...prev,
      currentStep: step,
      status: 'asking',
    } : null);
  } catch {
    setGTDFlowState(prev => prev ? {
      ...prev,
      status: 'error',
      error: 'Failed to start analysis',
    } : null);
  }
}

/**
 * Apply a GTD recommendation to an atom.
 *
 * Dispatches UPDATE_ATOM with the recommended changes.
 */
export function applyGTDRecommendation(atomId: string, changes: Record<string, unknown>): void {
  if (Object.keys(changes).length === 0) return;
  sendCommand({
    type: 'UPDATE_ATOM',
    payload: { id: atomId, changes: changes as Partial<import('../../types/atoms').Atom> },
  });
}

// --- Phase 19: Clarification completion handler ---

/** Category-to-entity mappings for entity graph seeding. */
const CATEGORY_ENTITY_MAP: Record<string, { entityType: string; relationship: string }> = {
  'missing-outcome': { entityType: 'outcome', relationship: 'has-outcome' },
  'missing-next-action': { entityType: 'next-action', relationship: 'has-next-action' },
  'missing-timeframe': { entityType: 'deadline', relationship: 'has-deadline' },
  'missing-context': { entityType: 'context', relationship: 'has-context' },
  'missing-reference': { entityType: 'reference', relationship: 'has-reference' },
};

/**
 * Handle completion of a clarification session.
 *
 * 1. Updates atom content with enriched text
 * 2. Persists to Dexie via UPDATE_ATOM
 * 3. Logs clarification events to classification log
 * 4. Sets wasClarified on the TriageSuggestion
 * 5. Seeds entity graph for each answered category
 * 6. Triggers re-triage of the updated atom
 */
export function handleClarificationComplete(result: ClarificationResult): void {
  const atomId = result.atomId;

  // 1+2. Update atom content and persist via UPDATE_ATOM
  sendCommand({
    type: 'UPDATE_ATOM',
    payload: {
      id: atomId,
      changes: { content: result.enrichedContent } as Partial<import('../../types/atoms').Atom>,
      source: 'ai',
    },
  });

  // 3. Log clarification events -- one per category (including skips for pattern learning)
  const suggestion = triageSuggestions().get(atomId);
  const atomType = suggestion?.suggestedType ?? 'task';
  const content = result.enrichedContent;

  for (const answer of result.answers) {
    logClarification({
      inboxItemId: atomId,
      content,
      atomType,
      detectedCategory: answer.category,
      optionsShown: [], // options were displayed at question time; not tracked in answer
      optionSelected: answer.wasSkipped ? null : answer.selectedOption,
      wasFreeform: answer.wasSkipped ? false : answer.wasFreeform,
      freeformText: answer.wasSkipped ? null : answer.freeformText,
      tier: 2,
    });
  }

  // 4. Set wasClarified on the TriageSuggestion
  if (suggestion) {
    setTriageSuggestions((prev) => {
      const next = new Map(prev);
      next.set(atomId, { ...suggestion, wasClarified: true });
      return next;
    });
  }

  // 5. Seed entity graph for each answered category
  for (const answer of result.answers) {
    if (answer.wasSkipped) continue;
    const mapping = CATEGORY_ENTITY_MAP[answer.category];
    if (!mapping) continue;
    const value = answer.wasFreeform ? answer.freeformText : answer.selectedOption;
    if (!value) continue;

    seedEntityRelationship({
      sourceAtomId: atomId,
      entityType: mapping.entityType,
      entityValue: value,
      relationship: mapping.relationship,
      targetValue: '',
    });
  }

  // 6. Trigger re-triage of the updated atom
  // Find the inbox item and run single-item triage
  const inboxItem = state.inboxItems.find((item) => item.id === atomId);
  if (inboxItem && tieredEnabled()) {
    const atoms = state.atoms.map((a) => ({ id: a.id, title: a.title, content: a.content }));
    triageInbox(
      [{ ...inboxItem, content: result.enrichedContent }],
      state.scores,
      state.entropyScore,
      state.sectionItems,
      state.sections,
      atoms,
      (retriageSuggestion) => {
        if (retriageSuggestion.status === 'complete') {
          // Preserve wasClarified flag on the new suggestion
          retriageSuggestion.wasClarified = true;
        }
        setTriageSuggestions((prev) => {
          const next = new Map(prev);
          next.set(retriageSuggestion.inboxItemId, retriageSuggestion);
          return next;
        });
      },
      (itemId, error) => {
        console.warn('[handleClarificationComplete] Re-triage failed for', itemId, error);
      },
      true, // useTiered
    );
  }
}

