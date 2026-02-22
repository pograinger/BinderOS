/**
 * SearchOverlay — Spotlight-style full-text + semantic search overlay.
 *
 * Opened via Ctrl+K / Cmd+K. Searches all atoms using MiniSearch with:
 * - Instant type-ahead text search (debounced 150ms)
 * - Blended ranking: text match + semantic similarity + graph proximity + priority
 * - Filter chips for type (task/fact/event/decision/insight), status, and date range
 * - Keyboard navigation (ArrowUp/Down to navigate, Enter to open, Escape to close)
 * - Semantic re-ranking via ONNX embedding worker (lazy-loaded, graceful degradation)
 *
 * LOCKED DECISIONS (CONTEXT.md):
 * - Search is SEPARATE from command palette (different shortcut, different overlay)
 * - Zero network calls: embedding worker loads model from local public/models/
 * - Worker failure never blocks search — always show text-only results as fallback
 * - Interaction events logged for future learning (search, click, filter)
 *
 * CRITICAL: Never destructure props or state — breaks SolidJS fine-grained reactivity.
 */

import { createSignal, createEffect, For, Show, onCleanup } from 'solid-js';
import { state, sendCommand, setSelectedAtomId } from '../signals/store';
import { rebuildIndex, searchAtoms, autoSuggest } from '../../search/search-index';
import {
  normalizeTextScore,
  blendedScore,
  computeGraphProximity,
  cosineSimilarity,
} from '../../search/ranking';
import type { SearchResult, SearchFilter } from '../../search/search-index';
import type { AtomType, AtomStatus } from '../../types/atoms';

interface SearchOverlayProps {
  onClose: () => void;
}

// --- Types ---

interface RankedResult extends SearchResult {
  blendedScore: number;
}

type DateRangePreset = 'today' | 'this-week' | 'this-month' | 'all';

// --- Worker message types ---

interface EmbedResultMessage {
  type: 'EMBED_RESULT';
  id: string;
  vectors: number[][];
  atomIds?: string[]; // present when id === '__atoms__'
}

interface EmbedErrorMessage {
  type: 'EMBED_ERROR';
  id: string;
  error: string;
}

type WorkerMessage =
  | EmbedResultMessage
  | EmbedErrorMessage
  | { type: 'MODEL_READY' }
  | { type: 'MODEL_LOADING' };

// --- Worker singleton (module-level, persists across overlay open/close) ---

let embeddingWorker: Worker | null = null;
let atomVectorMap = new Map<string, number[]>();
let workerReady = false;

function getOrCreateWorker(): Worker {
  if (!embeddingWorker) {
    embeddingWorker = new Worker(
      new URL('../../search/embedding-worker.ts', import.meta.url),
      { type: 'module' },
    );
  }
  return embeddingWorker;
}

// --- Date range helpers ---

function getDateRange(preset: DateRangePreset): { from: number; to: number } | undefined {
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  switch (preset) {
    case 'today':
      return { from: startOfToday.getTime(), to: now };
    case 'this-week': {
      const d = new Date(startOfToday);
      d.setDate(d.getDate() - d.getDay());
      return { from: d.getTime(), to: now };
    }
    case 'this-month': {
      const d = new Date(startOfToday);
      d.setDate(1);
      return { from: d.getTime(), to: now };
    }
    case 'all':
    default:
      return undefined;
  }
}

// --- Component ---

export function SearchOverlay(props: SearchOverlayProps) {
  const [query, setQuery] = createSignal('');
  const [results, setResults] = createSignal<RankedResult[]>([]);
  const [suggestions, setSuggestions] = createSignal<string[]>([]);
  const [focusedIndex, setFocusedIndex] = createSignal(-1);
  const [workerLoading, setWorkerLoading] = createSignal(false);

  // Filter state
  const [activeTypes, setActiveTypes] = createSignal<AtomType[]>([]);
  const [activeStatuses, setActiveStatuses] = createSignal<AtomStatus[]>([]);
  const [datePreset, setDatePreset] = createSignal<DateRangePreset>('all');

  let inputRef: HTMLInputElement | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let queryEmbeddingId = 0; // unique id per query for debounce

  // --- Rebuild index when atoms change ---

  createEffect(() => {
    const atoms = state.atoms;
    rebuildIndex(atoms);
  });

  // --- Worker setup on mount ---

  const worker = getOrCreateWorker();

  const handleWorkerMessage = (event: MessageEvent<WorkerMessage>) => {
    const msg = event.data;

    if (msg.type === 'MODEL_LOADING') {
      setWorkerLoading(true);
    }

    if (msg.type === 'MODEL_READY') {
      workerReady = true;
      setWorkerLoading(false);
      // Pre-compute atom embeddings
      const atomsToEmbed = state.atoms.map((a) => ({
        id: a.id,
        text: `${a.title} ${a.content}`.slice(0, 500),
      }));
      if (atomsToEmbed.length > 0) {
        worker.postMessage({ type: 'EMBED_ATOMS', atoms: atomsToEmbed });
      }
    }

    if (msg.type === 'EMBED_RESULT') {
      if (msg.id === '__atoms__' && msg.atomIds) {
        // Store atom vectors for later similarity computation
        msg.atomIds.forEach((id, i) => {
          const vec = msg.vectors[i];
          if (vec) atomVectorMap.set(id, vec);
        });
      } else if (msg.id !== '__atoms__') {
        // Query embedding result — re-rank current results
        const queryVector = msg.vectors[0];
        if (!queryVector) return;

        setResults((prev) => {
          const reranked = prev.map((r) => {
            const atomVector = atomVectorMap.get(r.id);
            const semantic = atomVector
              ? cosineSimilarity(queryVector, atomVector)
              : 0;
            const graphProx = computeGraphProximity(r.id, state.atoms);
            const priorityScore = state.scores[r.id]?.priorityScore ?? 0;

            return {
              ...r,
              blendedScore: blendedScore({
                textScore: r.score,
                semanticScore: semantic,
                graphProximity: graphProx,
                priorityScore,
              }),
            };
          });

          // Sort by blended score descending (stable, no flash)
          return [...reranked].sort((a, b) => b.blendedScore - a.blendedScore);
        });
      }
    }

    if (msg.type === 'EMBED_ERROR') {
      // Graceful degradation: log but don't break search
      console.warn('[SearchOverlay] Embedding error:', msg.error);
      setWorkerLoading(false);
    }
  };

  worker.addEventListener('message', handleWorkerMessage);

  // Pre-load worker on first open (triggers MODEL_LOADING / MODEL_READY cycle)
  if (!workerReady) {
    const atomsToEmbed = state.atoms.map((a) => ({
      id: a.id,
      text: `${a.title} ${a.content}`.slice(0, 500),
    }));
    if (atomsToEmbed.length > 0) {
      worker.postMessage({ type: 'EMBED_ATOMS', atoms: atomsToEmbed });
    }
  }

  onCleanup(() => {
    worker.removeEventListener('message', handleWorkerMessage);
    if (debounceTimer) clearTimeout(debounceTimer);
  });

  // --- Focus input on open ---

  createEffect(() => {
    if (inputRef) {
      setTimeout(() => inputRef!.focus(), 10);
    }
  });

  // --- Search execution ---

  const runSearch = (q: string) => {
    if (!q.trim()) {
      setResults([]);
      setSuggestions([]);
      return;
    }

    const filter: SearchFilter = {};
    if (activeTypes().length > 0) filter.types = activeTypes();
    if (activeStatuses().length > 0) filter.statuses = activeStatuses();
    const dr = getDateRange(datePreset());
    if (dr) filter.dateRange = dr;

    let rawResults = searchAtoms(q, filter);
    rawResults = normalizeTextScore(rawResults);

    // Compute blended scores (text only initially; semantic added when worker responds)
    const ranked: RankedResult[] = rawResults.map((r) => {
      const graphProx = computeGraphProximity(r.id, state.atoms);
      const priorityScore = state.scores[r.id]?.priorityScore ?? 0;
      return {
        ...r,
        blendedScore: blendedScore({
          textScore: r.score,
          semanticScore: 0,
          graphProximity: graphProx,
          priorityScore,
        }),
      };
    });

    ranked.sort((a, b) => b.blendedScore - a.blendedScore);
    setResults(ranked.slice(0, 20));
    setFocusedIndex(-1);

    // Log search interaction
    sendCommand({
      type: 'LOG_INTERACTION',
      payload: { type: 'search', query: q, ts: Date.now() },
    });

    // Empty state suggestions
    if (rawResults.length === 0) {
      setSuggestions(autoSuggest(q));
    } else {
      setSuggestions([]);
    }

    // Request semantic embedding for this query
    if (workerReady) {
      const embedId = `query-${++queryEmbeddingId}`;
      worker.postMessage({ type: 'EMBED', id: embedId, texts: [q] });
    }
  };

  const handleInput = (e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    setQuery(value);

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => runSearch(value), 150);
  };

  // --- Filter chip toggles ---

  const toggleType = (type: AtomType) => {
    setActiveTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type],
    );
    sendCommand({
      type: 'LOG_INTERACTION',
      payload: { type: 'filter', filters: { types: activeTypes() }, ts: Date.now() },
    });
    runSearch(query());
  };

  const toggleStatus = (status: AtomStatus) => {
    setActiveStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
    );
    sendCommand({
      type: 'LOG_INTERACTION',
      payload: { type: 'filter', filters: { statuses: activeStatuses() }, ts: Date.now() },
    });
    runSearch(query());
  };

  const setDateFilter = (preset: DateRangePreset) => {
    setDatePreset(preset);
    sendCommand({
      type: 'LOG_INTERACTION',
      payload: { type: 'filter', filters: { datePreset: preset }, ts: Date.now() },
    });
    runSearch(query());
  };

  // --- Keyboard navigation ---

  const handleKeyDown = (e: KeyboardEvent) => {
    const count = results().length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((prev) => (prev + 1) % Math.max(count, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((prev) => (prev - 1 + Math.max(count, 1)) % Math.max(count, 1));
    } else if (e.key === 'Enter') {
      const idx = focusedIndex();
      const res = results()[idx];
      if (res) openResult(res);
    } else if (e.key === 'Escape') {
      props.onClose();
    }
  };

  const openResult = (result: SearchResult) => {
    sendCommand({
      type: 'LOG_INTERACTION',
      payload: { type: 'click', atomId: result.id, query: query(), ts: Date.now() },
    });
    setSelectedAtomId(result.id);
    props.onClose();
  };

  // --- Type icon helper ---

  const typeIcon = (type: string): string => {
    switch (type) {
      case 'task': return 'T';
      case 'fact': return 'F';
      case 'event': return 'E';
      case 'decision': return 'D';
      case 'insight': return 'I';
      default: return '?';
    }
  };

  const ALL_TYPES: AtomType[] = ['task', 'fact', 'event', 'decision', 'insight'];
  const ALL_STATUSES: AtomStatus[] = ['open', 'in-progress', 'waiting', 'done'];
  const DATE_PRESETS: { value: DateRangePreset; label: string }[] = [
    { value: 'all', label: 'All time' },
    { value: 'today', label: 'Today' },
    { value: 'this-week', label: 'This week' },
    { value: 'this-month', label: 'This month' },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        class="search-overlay-backdrop"
        onClick={props.onClose}
        aria-hidden="true"
      />

      {/* Search container */}
      <div
        class="search-overlay-container"
        role="dialog"
        aria-label="Search"
        aria-modal="true"
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <input
          ref={inputRef}
          class="search-input"
          type="text"
          placeholder="Search atoms..."
          value={query()}
          onInput={handleInput}
          aria-label="Search query"
          autocomplete="off"
          autocorrect="off"
          spellcheck={false}
        />

        {/* Filter chips */}
        <div class="search-filter-chips">
          {/* Type filters */}
          <For each={ALL_TYPES}>
            {(type) => (
              <button
                class={`search-chip${activeTypes().includes(type) ? ' active' : ''}`}
                onClick={() => toggleType(type)}
                aria-pressed={activeTypes().includes(type)}
                title={`Filter by ${type}`}
              >
                {type}
              </button>
            )}
          </For>

          <span class="search-chip-separator" aria-hidden="true">|</span>

          {/* Status filters */}
          <For each={ALL_STATUSES}>
            {(status) => (
              <button
                class={`search-chip${activeStatuses().includes(status) ? ' active' : ''}`}
                onClick={() => toggleStatus(status)}
                aria-pressed={activeStatuses().includes(status)}
                title={`Filter by ${status}`}
              >
                {status}
              </button>
            )}
          </For>

          <span class="search-chip-separator" aria-hidden="true">|</span>

          {/* Date range */}
          <For each={DATE_PRESETS}>
            {(preset) => (
              <button
                class={`search-chip${datePreset() === preset.value ? ' active' : ''}`}
                onClick={() => setDateFilter(preset.value)}
                aria-pressed={datePreset() === preset.value}
                title={`Filter by date: ${preset.label}`}
              >
                {preset.label}
              </button>
            )}
          </For>
        </div>

        {/* Loading indicator */}
        <Show when={workerLoading()}>
          <div class="search-loading" role="status" aria-live="polite">
            Enhancing with semantic search...
          </div>
        </Show>

        {/* Results list */}
        <Show when={results().length > 0}>
          <div
            class="search-results"
            role="listbox"
            aria-label="Search results"
          >
            <For each={results()}>
              {(result, i) => (
                <div
                  class={`search-result-item${focusedIndex() === i() ? ' focused' : ''}`}
                  role="option"
                  aria-selected={focusedIndex() === i()}
                  tabindex={focusedIndex() === i() ? 0 : -1}
                  onClick={() => openResult(result)}
                  onMouseEnter={() => setFocusedIndex(i())}
                >
                  <span class="search-result-type-icon" title={result.type}>
                    {typeIcon(result.type)}
                  </span>
                  <span class="search-result-title">
                    {result.title || result.id}
                  </span>
                  <span class="search-result-status">{result.status}</span>
                  <span class="search-result-score" title="Relevance score">
                    {Math.round(result.blendedScore * 100)}%
                  </span>
                </div>
              )}
            </For>
          </div>
        </Show>

        {/* Empty state / suggestions */}
        <Show when={query().trim() && results().length === 0 && suggestions().length === 0}>
          <div class="search-empty" role="status">
            No results found
          </div>
        </Show>

        <Show when={suggestions().length > 0}>
          <div class="search-suggestions">
            <div class="search-suggestions-label">Did you mean:</div>
            <For each={suggestions()}>
              {(suggestion) => (
                <button
                  class="search-suggestion-item"
                  onClick={() => {
                    setQuery(suggestion);
                    runSearch(suggestion);
                  }}
                >
                  {suggestion}
                </button>
              )}
            </For>
          </div>
        </Show>

        {/* Keyboard hints */}
        <div class="search-hints">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>Esc</kbd> close</span>
        </div>
      </div>
    </>
  );
}
