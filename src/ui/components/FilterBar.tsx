/**
 * FilterBar — shared filter/sort controls component.
 *
 * Provides type, status, priority tier, date range, section, and sort controls
 * for any page that needs filtering. All controls are reactive via SolidJS signals.
 *
 * Usage:
 *   const { filters, setFilter, resetFilters } = createFilterState();
 *   <FilterBar filters={filters()} onFilterChange={setFilter} />
 *
 * Chip toggle pattern: clicking an active chip removes it from the array;
 * clicking an inactive chip adds it. This matches the FilterState array fields.
 *
 * Each filter section is shown by default and can be hidden via props:
 *   showTypeFilter={false}     — hide type chips
 *   showStatusFilter={false}   — hide status chips
 *   showPriorityFilter={false} — hide priority tier chips
 *   showDateRange={false}      — hide date inputs
 *   showSectionFilter={false}  — hide section dropdown
 *   showSort={false}           — hide sort controls
 */

import { For, Show } from 'solid-js';
import { state } from '../signals/store';
import type { FilterState } from '../signals/queries';

// --- Props ---

interface FilterBarProps {
  filters: FilterState;
  onFilterChange: (key: keyof FilterState, value: unknown) => void;
  showTypeFilter?: boolean;
  showStatusFilter?: boolean;
  showDateRange?: boolean;
  showSectionFilter?: boolean;
  showPriorityFilter?: boolean;
  showSort?: boolean;
}

// --- Constants ---

const ATOM_TYPES = ['task', 'fact', 'event', 'decision', 'insight'] as const;
const ATOM_STATUSES = ['open', 'in-progress', 'waiting', 'done', 'cancelled'] as const;
const PRIORITY_TIERS = ['Critical', 'High', 'Medium', 'Low', 'Someday'] as const;
const SORT_OPTIONS = [
  { value: 'priority', label: 'Priority' },
  { value: 'date', label: 'Date' },
  { value: 'updated', label: 'Last Updated' },
  { value: 'staleness', label: 'Staleness' },
] as const;

// --- Helper: toggle value in array ---

function toggleArrayValue(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

// --- Helper: format date for input value ---

function tsToDateInput(ts: number | null | undefined): string {
  if (!ts) return '';
  return new Date(ts).toISOString().slice(0, 10);
}

// --- Component ---

export function FilterBar(props: FilterBarProps) {
  // Toggle a type chip
  function toggleType(type: string) {
    props.onFilterChange('types', toggleArrayValue(props.filters.types, type));
  }

  // Toggle a status chip
  function toggleStatus(status: string) {
    props.onFilterChange('statuses', toggleArrayValue(props.filters.statuses, status));
  }

  // Toggle a priority tier chip
  function toggleTier(tier: string) {
    props.onFilterChange('priorityTiers', toggleArrayValue(props.filters.priorityTiers, tier));
  }

  // Handle date range changes — convert date string to timestamp
  function handleDateFrom(e: Event) {
    const input = e.target as HTMLInputElement;
    const ts = input.value ? new Date(input.value).getTime() : null;
    const current = props.filters.dateRange;
    props.onFilterChange('dateRange', ts ? { from: ts, to: current?.to ?? Date.now() } : null);
  }

  function handleDateTo(e: Event) {
    const input = e.target as HTMLInputElement;
    const ts = input.value ? new Date(input.value + 'T23:59:59').getTime() : null;
    const current = props.filters.dateRange;
    props.onFilterChange('dateRange', ts ? { from: current?.from ?? 0, to: ts } : null);
  }

  // Handle section select change
  function handleSectionChange(e: Event) {
    const select = e.target as HTMLSelectElement;
    props.onFilterChange('sectionId', select.value || null);
  }

  // Handle sort by change
  function handleSortByChange(e: Event) {
    const select = e.target as HTMLSelectElement;
    props.onFilterChange('sortBy', select.value);
  }

  // Toggle sort order
  function toggleSortOrder() {
    props.onFilterChange('sortOrder', props.filters.sortOrder === 'asc' ? 'desc' : 'asc');
  }

  return (
    <div class="filter-bar">

      {/* Type filter chips */}
      <Show when={props.showTypeFilter !== false}>
        <div class="filter-bar__group">
          <span class="filter-bar__label">Type</span>
          <div class="filter-bar__chips">
            <For each={ATOM_TYPES}>
              {(type) => (
                <button
                  class={`filter-chip${props.filters.types.includes(type) ? ' active' : ''}`}
                  onClick={() => toggleType(type)}
                  aria-pressed={props.filters.types.includes(type)}
                >
                  {type}
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* Status filter chips */}
      <Show when={props.showStatusFilter !== false}>
        <div class="filter-bar__group">
          <span class="filter-bar__label">Status</span>
          <div class="filter-bar__chips">
            <For each={ATOM_STATUSES}>
              {(status) => (
                <button
                  class={`filter-chip${props.filters.statuses.includes(status) ? ' active' : ''}`}
                  onClick={() => toggleStatus(status)}
                  aria-pressed={props.filters.statuses.includes(status)}
                >
                  {status}
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* Priority tier chips */}
      <Show when={props.showPriorityFilter !== false}>
        <div class="filter-bar__group">
          <span class="filter-bar__label">Priority</span>
          <div class="filter-bar__chips">
            <For each={PRIORITY_TIERS}>
              {(tier) => (
                <button
                  class={`filter-chip${props.filters.priorityTiers.includes(tier) ? ' active' : ''}`}
                  onClick={() => toggleTier(tier)}
                  aria-pressed={props.filters.priorityTiers.includes(tier)}
                >
                  {tier}
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* Date range inputs */}
      <Show when={props.showDateRange !== false}>
        <div class="filter-bar__group">
          <span class="filter-bar__label">Date</span>
          <div class="filter-bar__date-range">
            <input
              type="date"
              class="filter-date-input"
              value={tsToDateInput(props.filters.dateRange?.from)}
              onInput={handleDateFrom}
              aria-label="From date"
            />
            <span class="filter-bar__date-sep">to</span>
            <input
              type="date"
              class="filter-date-input"
              value={tsToDateInput(props.filters.dateRange?.to)}
              onInput={handleDateTo}
              aria-label="To date"
            />
          </div>
        </div>
      </Show>

      {/* Section filter dropdown */}
      <Show when={props.showSectionFilter !== false}>
        <div class="filter-bar__group">
          <span class="filter-bar__label">Section</span>
          <select
            class="filter-select"
            value={props.filters.sectionId ?? ''}
            onChange={handleSectionChange}
            aria-label="Filter by section"
          >
            <option value="">All sections</option>
            <For each={state.sections}>
              {(section) => (
                <option value={section.id}>{section.name}</option>
              )}
            </For>
          </select>
        </div>
      </Show>

      {/* Sort controls */}
      <Show when={props.showSort !== false}>
        <div class="filter-bar__group filter-bar__group--sort">
          <span class="filter-bar__label">Sort</span>
          <select
            class="filter-select"
            value={props.filters.sortBy}
            onChange={handleSortByChange}
            aria-label="Sort by"
          >
            <For each={SORT_OPTIONS}>
              {(opt) => (
                <option value={opt.value}>{opt.label}</option>
              )}
            </For>
          </select>
          <button
            class="filter-sort-direction"
            onClick={toggleSortOrder}
            aria-label={`Sort ${props.filters.sortOrder === 'asc' ? 'ascending' : 'descending'}`}
            title={props.filters.sortOrder === 'asc' ? 'Ascending' : 'Descending'}
          >
            {props.filters.sortOrder === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </Show>

    </div>
  );
}

/*
 * CSS additions needed in global stylesheet (src/index.css or equivalent):
 *
 * .filter-bar {
 *   display: flex;
 *   flex-wrap: nowrap;
 *   align-items: center;
 *   gap: 12px;
 *   padding: 8px 12px;
 *   background: var(--bg-secondary);
 *   overflow-x: auto;
 *   -webkit-overflow-scrolling: touch;
 *   scrollbar-width: none;
 * }
 * .filter-bar::-webkit-scrollbar { display: none; }
 *
 * .filter-bar__group {
 *   display: flex;
 *   align-items: center;
 *   gap: 6px;
 *   flex-shrink: 0;
 * }
 *
 * .filter-bar__label {
 *   font-size: 11px;
 *   font-weight: 600;
 *   color: var(--text-secondary);
 *   text-transform: uppercase;
 *   letter-spacing: 0.04em;
 *   white-space: nowrap;
 * }
 *
 * .filter-bar__chips {
 *   display: flex;
 *   gap: 4px;
 * }
 *
 * .filter-chip {
 *   height: 24px;
 *   padding: 0 8px;
 *   border: 1px solid var(--border-primary);
 *   border-radius: 12px;
 *   background: transparent;
 *   color: var(--text-secondary);
 *   font-size: 12px;
 *   cursor: pointer;
 *   white-space: nowrap;
 *   transition: background 0.1s, color 0.1s;
 * }
 * .filter-chip.active {
 *   background: var(--accent-primary);
 *   border-color: var(--accent-primary);
 *   color: #fff;
 * }
 * .filter-chip:hover:not(.active) {
 *   background: var(--bg-hover);
 *   color: var(--text-primary);
 * }
 *
 * .filter-date-input {
 *   height: 24px;
 *   padding: 0 6px;
 *   border: 1px solid var(--border-primary);
 *   border-radius: 4px;
 *   background: var(--bg-primary);
 *   color: var(--text-primary);
 *   font-size: 12px;
 * }
 *
 * .filter-bar__date-sep {
 *   font-size: 12px;
 *   color: var(--text-secondary);
 * }
 *
 * .filter-select {
 *   height: 24px;
 *   padding: 0 6px;
 *   border: 1px solid var(--border-primary);
 *   border-radius: 4px;
 *   background: var(--bg-primary);
 *   color: var(--text-primary);
 *   font-size: 12px;
 *   cursor: pointer;
 * }
 *
 * .filter-sort-direction {
 *   width: 24px;
 *   height: 24px;
 *   border: 1px solid var(--border-primary);
 *   border-radius: 4px;
 *   background: transparent;
 *   color: var(--text-primary);
 *   font-size: 14px;
 *   cursor: pointer;
 *   display: flex;
 *   align-items: center;
 *   justify-content: center;
 * }
 * .filter-sort-direction:hover {
 *   background: var(--bg-hover);
 * }
 */
