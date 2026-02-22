/**
 * MiniSearch full-text search index for BinderOS atoms.
 *
 * Singleton index that indexes all atoms with:
 * - Full-text search on title and content fields
 * - Title matches weighted 2x for relevance
 * - Fuzzy matching with 20% tolerance for typos
 * - Prefix matching for type-ahead suggestions
 * - Optional filter by type, status, and date range
 *
 * Key functions:
 * - rebuildIndex(atoms): rebuilds index from scratch on state change
 * - searchAtoms(query, filter): full-text search with optional filters
 * - autoSuggest(query): returns type-ahead suggestion strings
 */

import MiniSearch from 'minisearch';
import type { Atom } from '../types/atoms';

// --- Types ---

export interface SearchFilter {
  types?: string[];
  statuses?: string[];
  dateRange?: { from: number; to: number };
}

export interface SearchResult {
  id: string;
  score: number;
  match: Record<string, string[]>;
  terms: string[];
  // Stored fields for display without re-lookup
  type: string;
  status: string;
  title: string;
  updated_at: number;
  sectionId?: string;
}

// --- MiniSearch instance ---

const miniSearch = new MiniSearch<Atom>({
  idField: 'id',
  fields: ['title', 'content'],
  storeFields: ['id', 'type', 'status', 'title', 'updated_at', 'sectionId'],
  searchOptions: {
    boost: { title: 2 },
    fuzzy: 0.2,
    prefix: true,
  },
});

// --- Exported functions ---

/**
 * Rebuild the search index from scratch.
 * Call this whenever state.atoms changes (via createEffect at app level).
 */
export function rebuildIndex(atoms: Atom[]): void {
  miniSearch.removeAll();
  miniSearch.addAll(atoms);
}

/**
 * Full-text search across all indexed atoms.
 * Optionally filter results by type, status, or date range.
 *
 * @param query - Search query string
 * @param filter - Optional filter criteria
 * @returns Array of search results ordered by MiniSearch score (descending)
 */
export function searchAtoms(query: string, filter?: SearchFilter): SearchResult[] {
  if (!query.trim()) return [];

  const results = miniSearch.search(query, {
    filter: (result) => {
      if (filter?.types && filter.types.length > 0) {
        if (!filter.types.includes(result['type'] as string)) return false;
      }
      if (filter?.statuses && filter.statuses.length > 0) {
        if (!filter.statuses.includes(result['status'] as string)) return false;
      }
      if (filter?.dateRange) {
        const updatedAt = result['updated_at'] as number;
        if (updatedAt < filter.dateRange.from || updatedAt > filter.dateRange.to) return false;
      }
      return true;
    },
  });

  return results as unknown as SearchResult[];
}

/**
 * Returns type-ahead suggestion strings for the given query.
 * Used for empty-state suggestions in the search overlay.
 */
export function autoSuggest(query: string): string[] {
  if (!query.trim()) return [];
  const suggestions = miniSearch.autoSuggest(query, { fuzzy: 0.2 });
  return suggestions.map((s) => s.suggestion);
}
