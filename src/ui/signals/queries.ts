/**
 * Reactive query functions for Phase 3 default pages.
 *
 * All exports are createMemo-based derived values from state.atoms and
 * state.scores. Pages consume these memos directly — no separate database
 * queries needed since all atoms are already in the reactive store.
 *
 * CRITICAL SolidJS patterns:
 * - Never destructure atoms or state — always access via state.atoms, a.type, etc.
 * - Access state.scores inside the memo body so SolidJS tracks the dependency.
 * - Use createMemo for all derived data (not plain functions).
 *
 * Page memos exported:
 * - todayAtoms: due today, overdue, Critical priority, or near-critical staleness
 * - thisWeekAtoms: due this week, overdue tasks, events this week
 * - activeProjectAtoms: tasks grouped by project, sorted by priority
 * - waitingAtoms: tasks with status 'waiting', oldest first
 * - insightAtoms: atoms of type 'insight', newest first
 *
 * Generic utility:
 * - filteredAndSortedAtoms: higher-order function wrapping any source memo
 *   with additional type/status/tag/date/section/priority filter and sort logic
 * - FilterState interface: shape of filter parameters
 * - createFilterState: factory for page-level filter signal management
 */

import { createMemo, createSignal } from 'solid-js';
import { state } from './store';
import type { Atom } from '../../types/atoms';

// --- Date helpers (module-level, not exported) ---

/** Timestamp for 00:00:00.000 today (local time). */
function startOfDay(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Timestamp for 23:59:59.999 today (local time). */
function endOfDay(): number {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** Timestamp for 00:00:00.000 on the Monday of the current week (local time). */
function startOfWeek(): number {
  const d = new Date();
  const day = d.getDay(); // 0=Sun, 1=Mon, ...
  const diff = (day === 0 ? -6 : 1 - day); // adjust to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Timestamp for 23:59:59.999 on the Sunday of the current week (local time). */
function endOfWeek(): number {
  const d = new Date();
  const day = d.getDay(); // 0=Sun, 1=Mon, ...
  const diff = (day === 0 ? 0 : 7 - day); // adjust to Sunday
  d.setDate(d.getDate() + diff);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

// --- Filter state interface ---

/**
 * Shape of filter parameters consumed by filteredAndSortedAtoms
 * and managed by createFilterState factory.
 */
export interface FilterState {
  types: string[];
  statuses: string[];
  tags: string[];
  context: string | null;
  dateRange: { from: number; to: number } | null;
  sectionId: string | null;
  priorityTiers: string[];
  sortBy: 'date' | 'priority' | 'updated' | 'staleness';
  sortOrder: 'asc' | 'desc';
}

const DEFAULT_FILTER_STATE: FilterState = {
  types: [],
  statuses: [],
  tags: [],
  context: null,
  dateRange: null,
  sectionId: null,
  priorityTiers: [],
  sortBy: 'priority',
  sortOrder: 'desc',
};

// --- Page-specific query memos ---

/**
 * Today page atoms.
 *
 * Includes: tasks due today or overdue, events today, Critical-tier tasks,
 * and atoms approaching critical staleness (staleness > 0.6).
 * Excludes: done, cancelled, archived atoms.
 * Sorted by: priorityScore descending (most urgent first).
 */
export const todayAtoms = createMemo((): Atom[] => {
  const now = startOfDay();
  const eod = endOfDay();

  return state.atoms
    .filter((a) => {
      // Exclude terminal states
      if (a.status === 'done' || a.status === 'cancelled' || a.status === 'archived') {
        return false;
      }
      // Task due today or overdue
      if (a.type === 'task' && 'dueDate' in a && a.dueDate !== undefined) {
        if (a.dueDate <= eod) return true;
      }
      // Event happening today
      if (a.type === 'event' && 'eventDate' in a && a.eventDate !== undefined) {
        if (a.eventDate >= now && a.eventDate <= eod) return true;
      }
      // Critical priority task
      if (a.type === 'task' && state.scores[a.id]?.priorityTier === 'Critical') return true;
      // Near-critical staleness
      if ((state.scores[a.id]?.staleness ?? 0) > 0.6) return true;
      return false;
    })
    .sort((a, b) => {
      const scoreA = state.scores[a.id]?.priorityScore ?? 0;
      const scoreB = state.scores[b.id]?.priorityScore ?? 0;
      return scoreB - scoreA; // descending
    });
});

/**
 * This Week page atoms.
 *
 * Includes: tasks due this week, overdue tasks (dueDate < today),
 * and events happening this week.
 * Excludes: done, cancelled, archived atoms.
 * Sorted by: dueDate/eventDate ascending (soonest first), then priorityScore desc.
 */
export const thisWeekAtoms = createMemo((): Atom[] => {
  const sow = startOfWeek();
  const eow = endOfWeek();
  const sod = startOfDay();

  return state.atoms
    .filter((a) => {
      if (a.status === 'done' || a.status === 'cancelled' || a.status === 'archived') {
        return false;
      }
      if (a.type === 'task' && 'dueDate' in a && a.dueDate !== undefined) {
        // Due this week (soonest upcoming tasks)
        if (a.dueDate >= sod && a.dueDate <= eow) return true;
        // Overdue tasks need attention
        if (a.dueDate < sod) return true;
      }
      if (a.type === 'event' && 'eventDate' in a && a.eventDate !== undefined) {
        if (a.eventDate >= sow && a.eventDate <= eow) return true;
      }
      return false;
    })
    .sort((a, b) => {
      // Extract date field for each atom type
      const dateA = ('dueDate' in a ? a.dueDate : undefined) ?? ('eventDate' in a ? a.eventDate : undefined) ?? Infinity;
      const dateB = ('dueDate' in b ? b.dueDate : undefined) ?? ('eventDate' in b ? b.eventDate : undefined) ?? Infinity;
      if (dateA !== dateB) return dateA - dateB; // ascending by date
      // Tie-break: priorityScore descending
      const scoreA = state.scores[a.id]?.priorityScore ?? 0;
      const scoreB = state.scores[b.id]?.priorityScore ?? 0;
      return scoreB - scoreA;
    });
});

/**
 * Active Projects page atoms.
 *
 * Groups active tasks by project (sectionItemId), sorted within each group
 * by priorityScore descending (first item = "next action").
 * Groups sorted by highest priorityScore in the group (most urgent project first).
 * Only includes groups with at least one open/in-progress atom.
 * Resolves project names from state.sectionItems.
 */
export const activeProjectAtoms = createMemo(
  (): { sectionItemId: string; sectionItemName: string; atoms: Atom[] }[] => {
    // Find the Projects section id
    const projectsSection = state.sections.find((s) => s.type === 'projects');
    if (!projectsSection) return [];

    // Gather atoms that belong to a project section item
    const projectAtoms = state.atoms.filter((a) => {
      return (
        a.sectionId === projectsSection.id &&
        a.sectionItemId !== undefined &&
        (a.status === 'open' || a.status === 'in-progress')
      );
    });

    // Group by sectionItemId
    const grouped = new Map<string, Atom[]>();
    for (const atom of projectAtoms) {
      if (!atom.sectionItemId) continue;
      const existing = grouped.get(atom.sectionItemId);
      if (existing) {
        existing.push(atom);
      } else {
        grouped.set(atom.sectionItemId, [atom]);
      }
    }

    // Build result with resolved names, sorted atoms per group
    const result: { sectionItemId: string; sectionItemName: string; atoms: Atom[]; topScore: number }[] = [];

    for (const [sectionItemId, atoms] of grouped.entries()) {
      const sectionItem = state.sectionItems.find((si) => si.id === sectionItemId);
      const sectionItemName = sectionItem?.name ?? sectionItemId;

      // Sort atoms within group by priorityScore descending
      const sortedAtoms = atoms.slice().sort((a, b) => {
        const scoreA = state.scores[a.id]?.priorityScore ?? 0;
        const scoreB = state.scores[b.id]?.priorityScore ?? 0;
        return scoreB - scoreA;
      });

      const topScore = state.scores[sortedAtoms[0]?.id ?? '']?.priorityScore ?? 0;

      result.push({ sectionItemId, sectionItemName, atoms: sortedAtoms, topScore });
    }

    // Sort groups by topScore descending (most urgent project first)
    result.sort((a, b) => b.topScore - a.topScore);

    return result.map(({ sectionItemId, sectionItemName, atoms }) => ({
      sectionItemId,
      sectionItemName,
      atoms,
    }));
  },
);

/**
 * Waiting page atoms.
 *
 * Tasks with status 'waiting', sorted oldest-first (longest-waiting first).
 * Consumers can use state.scores[a.id]?.staleness > 0.5 to flag overdue waits.
 */
export const waitingAtoms = createMemo((): Atom[] => {
  return state.atoms
    .filter((a) => a.type === 'task' && a.status === 'waiting')
    .sort((a, b) => a.updated_at - b.updated_at); // ascending: oldest first
});

/**
 * Insights page atoms.
 *
 * Atoms of type 'insight' that are not archived, newest first.
 */
export const insightAtoms = createMemo((): Atom[] => {
  return state.atoms
    .filter((a) => a.type === 'insight' && a.status !== 'archived')
    .sort((a, b) => b.created_at - a.created_at); // descending: newest first
});

// --- Generic filter/sort ---

/**
 * Higher-order function that wraps a source atom memo with additional
 * filter/sort logic driven by a reactive FilterState signal.
 *
 * Returns a new derived () => Atom[] that updates whenever source or filters change.
 *
 * Usage:
 *   const [filters, setFilter] = createFilterState();
 *   const atoms = filteredAndSortedAtoms(todayAtoms, () => filters.filters);
 */
export function filteredAndSortedAtoms(
  source: () => Atom[],
  filters: () => FilterState,
): () => Atom[] {
  return createMemo(() => {
    const f = filters();
    let result = source();

    // Type filter
    if (f.types.length > 0) {
      result = result.filter((a) => f.types.includes(a.type));
    }

    // Status filter
    if (f.statuses.length > 0) {
      result = result.filter((a) => f.statuses.includes(a.status));
    }

    // Tags filter (atom must have ALL specified tags)
    if (f.tags.length > 0) {
      result = result.filter((a) => {
        const atomTags = a.tags ?? [];
        return f.tags.every((tag) => atomTags.includes(tag));
      });
    }

    // Context filter
    if (f.context !== null) {
      result = result.filter((a) => a.context === f.context);
    }

    // Date range filter (by created_at)
    if (f.dateRange !== null) {
      result = result.filter(
        (a) => a.created_at >= f.dateRange!.from && a.created_at <= f.dateRange!.to,
      );
    }

    // Section filter
    if (f.sectionId !== null) {
      result = result.filter((a) => a.sectionId === f.sectionId);
    }

    // Priority tier filter
    if (f.priorityTiers.length > 0) {
      result = result.filter((a) => {
        const tier = state.scores[a.id]?.priorityTier;
        return tier !== null && tier !== undefined && f.priorityTiers.includes(tier);
      });
    }

    // Sort — access state.scores inside memo body for reactive tracking
    result = result.slice().sort((a, b) => {
      let valA: number;
      let valB: number;

      switch (f.sortBy) {
        case 'date':
          valA = a.created_at;
          valB = b.created_at;
          break;
        case 'priority':
          valA = state.scores[a.id]?.priorityScore ?? 0;
          valB = state.scores[b.id]?.priorityScore ?? 0;
          break;
        case 'updated':
          valA = a.updated_at;
          valB = b.updated_at;
          break;
        case 'staleness':
          valA = state.scores[a.id]?.staleness ?? 0;
          valB = state.scores[b.id]?.staleness ?? 0;
          break;
        default:
          valA = 0;
          valB = 0;
      }

      return f.sortOrder === 'asc' ? valA - valB : valB - valA;
    });

    return result;
  });
}

// --- Filter state factory ---

/**
 * Factory for page-level filter signal management.
 *
 * Returns:
 * - filters: getter () => FilterState (reactive signal)
 * - setFilter: update a single filter key
 * - resetFilters: restore all filters to defaults
 *
 * Recommended usage in page components:
 *   const { filters, setFilter, resetFilters } = createFilterState();
 *   const atoms = filteredAndSortedAtoms(todayAtoms, filters);
 */
export function createFilterState(): {
  filters: () => FilterState;
  setFilter: (key: keyof FilterState, value: unknown) => void;
  resetFilters: () => void;
} {
  const [filters, setFilters] = createSignal<FilterState>({ ...DEFAULT_FILTER_STATE });

  function setFilter(key: keyof FilterState, value: unknown): void {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function resetFilters(): void {
    setFilters({ ...DEFAULT_FILTER_STATE });
  }

  return { filters, setFilter, resetFilters };
}
