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
 */

import { createMemo } from 'solid-js';
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

    case 'PONG':
      // No state update needed for ping/pong
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
