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

// Safe property access for type-specific fields on SolidJS store proxies.
// The `in` operator uses the `has` trap which does NOT create reactive subscriptions.
// Bracket access uses the `get` trap which SolidJS tracks properly.
function getDate(a: Atom, field: 'dueDate' | 'scheduledDate' | 'eventDate'): number | undefined {
  return (a as Record<string, unknown>)[field] as number | undefined;
}

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

/** Timestamp for 00:00:00.000 on the Sunday of the current week (local time). Sun-Sat weeks. */
function startOfWeek(): number {
  const d = new Date();
  const day = d.getDay(); // 0=Sun, 1=Mon, ...
  d.setDate(d.getDate() - day); // back to Sunday
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Timestamp for 23:59:59.999 on the Saturday of the current week (local time). Sun-Sat weeks. */
function endOfWeek(): number {
  const d = new Date();
  const day = d.getDay(); // 0=Sun, 1=Mon, ...
  d.setDate(d.getDate() + (6 - day)); // forward to Saturday
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** Start/end of a Sun-Sat week offset by N weeks from the current week. 0 = this week, -1 = last, +1 = next. */
function weekBounds(offset: number): { start: number; end: number } {
  const now = new Date();
  const day = now.getDay();
  const sun = new Date(now);
  sun.setDate(now.getDate() - day + offset * 7);
  sun.setHours(0, 0, 0, 0);
  const sat = new Date(sun);
  sat.setDate(sun.getDate() + 6);
  sat.setHours(23, 59, 59, 999);
  return { start: sun.getTime(), end: sat.getTime() };
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
      // Exclude analysis atoms from all page queries (Phase 6: AIGN-01)
      if (a.type === 'analysis') return false;
      // Exclude terminal states
      if (a.status === 'done' || a.status === 'cancelled' || a.status === 'archived') {
        return false;
      }
      // Task due today or overdue
      const dueDateVal = a.type === 'task' ? getDate(a, 'dueDate') : undefined;
      if (dueDateVal !== undefined) {
        if (dueDateVal <= eod) return true;
      }
      // Event happening today
      const eventDateVal = a.type === 'event' ? getDate(a, 'eventDate') : undefined;
      if (eventDateVal !== undefined) {
        if (eventDateVal >= now && eventDateVal <= eod) return true;
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
 * Week view offset: -1 = last week, 0 = this week, 1 = next week.
 */
export type WeekOffset = -1 | 0 | 1;

/**
 * Weekly page atoms (parameterized by week offset signal).
 *
 * Includes: tasks due in the target Sun-Sat range (+ overdue for current/next),
 * and events happening in that range.
 * Excludes: done, cancelled, archived atoms.
 * Sorted by: dueDate/eventDate ascending (soonest first), then priorityScore desc.
 */
export function createWeeklyAtoms(offset: () => WeekOffset) {
  return createMemo((): Atom[] => {
    const bounds = weekBounds(offset());
    const sod = startOfDay();

    return state.atoms
      .filter((a) => {
        // Exclude analysis atoms from all page queries (Phase 6: AIGN-01)
        if (a.type === 'analysis') return false;
        if (a.status === 'done' || a.status === 'cancelled' || a.status === 'archived') {
          return false;
        }
        const dueDateVal = a.type === 'task' ? getDate(a, 'dueDate') : undefined;
        if (dueDateVal !== undefined) {
          // Due in range
          if (dueDateVal >= bounds.start && dueDateVal <= bounds.end) return true;
          // Overdue tasks (only for current/next week views, not last week)
          if (offset() >= 0 && dueDateVal < sod) return true;
        }
        const eventDateVal = a.type === 'event' ? getDate(a, 'eventDate') : undefined;
        if (eventDateVal !== undefined) {
          if (eventDateVal >= bounds.start && eventDateVal <= bounds.end) return true;
        }
        return false;
      })
      .sort((a, b) => {
        const dateA = getDate(a, 'dueDate') ?? getDate(a, 'eventDate') ?? Infinity;
        const dateB = getDate(b, 'dueDate') ?? getDate(b, 'eventDate') ?? Infinity;
        if (dateA !== dateB) return dateA - dateB;
        const scoreA = state.scores[a.id]?.priorityScore ?? 0;
        const scoreB = state.scores[b.id]?.priorityScore ?? 0;
        return scoreB - scoreA;
      });
  });
}

/** Compute Sun-Sat date range label for a given week offset. */
export function weekRangeLabel(offset: number): string {
  const bounds = weekBounds(offset);
  const fmt = (ts: number) =>
    new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${fmt(bounds.start)} – ${fmt(bounds.end)}`;
}

/** Default this-week memo for backward compatibility (current calendar week). */
export const thisWeekAtoms = createWeeklyAtoms(() => 0);

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
    // Exclude analysis atoms from all page queries (Phase 6: AIGN-01)
    const projectAtoms = state.atoms.filter((a) => {
      return (
        a.type !== 'analysis' &&
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
    // type === 'task' already excludes analysis atoms; explicit filter for clarity (Phase 6: AIGN-01)
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
    // type === 'insight' already excludes analysis atoms; explicit filter for clarity (Phase 6: AIGN-01)
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

    // Exclude analysis atoms from saved filter views (Phase 6: AIGN-01)
    result = result.filter((a) => a.type !== 'analysis');

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
