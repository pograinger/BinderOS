---
phase: 03-pages-navigation-and-search
plan: 02
subsystem: ui-pages
tags: [solid-js, gtd-pages, atom-detail, date-editing, status-editing, keyboard-nav]
dependency_graph:
  requires: [03-01]
  provides: [today-page, this-week-page, active-projects-page, waiting-page, insights-page, atom-detail-view, atom-status-editing, atom-date-editing]
  affects: [MainPane, PageTabStrip, AtomCard]
tech_stack:
  added: []
  patterns: [roving-tabindex, slide-in-panel, compute-engine-empty-states, update-atom-command]
key_files:
  created:
    - src/ui/views/pages/TodayPage.tsx
    - src/ui/views/pages/ThisWeekPage.tsx
    - src/ui/views/pages/ActiveProjectsPage.tsx
    - src/ui/views/pages/WaitingPage.tsx
    - src/ui/views/pages/InsightsPage.tsx
    - src/ui/views/AtomDetailView.tsx
    - src/ui/hooks/useRovingTabindex.ts
  modified:
    - src/ui/layout/MainPane.tsx
    - src/ui/layout/PageTabStrip.tsx
    - src/ui/components/AtomCard.tsx
    - src/ui/layout/layout.css
decisions:
  - AtomCard removes inline expand toggle — click now opens detail panel via setSelectedAtomId; keeps swipe gestures intact
  - Page components use onKeyDown directly from useRovingTabindex (not containerProps) — Plan 03's full implementation differs from stub API
  - ActiveProjectsPage tracks a mutable running index for roving tabindex across grouped atoms — flat index space covering all groups
  - AtomDetailView uses onCleanup to remove Escape keydown listener — avoids memory leak when panel is closed and reopened
  - Empty states read live state signals (entropyScore, compressionCandidates, scores) at render time — no caching needed since they're createMemo-based
metrics:
  duration_minutes: 13
  completed_date: 2026-02-22
  tasks_completed: 2
  files_created: 7
  files_modified: 4
---

# Phase 3 Plan 02: Default Pages and Atom Detail View Summary

Five GTD-aligned page views, atom detail panel with status/date editing, and enhanced AtomCard with due date display.

## What Was Built

### Task 1: Five Default Page Components + MainPane Routing + PageTabStrip

**TodayPage** (`src/ui/views/pages/TodayPage.tsx`)
- Consumes `todayAtoms` memo from queries.ts
- FilterBar with status, priority, sort visible; type and section filters hidden (cross-type by design)
- Compute-engine-driven empty states: green entropy = "All clear", stale items = link to Review, projects without next action = link to Active Projects, fallback = generic message
- Shows overdue count hint below atom list

**ThisWeekPage** (`src/ui/views/pages/ThisWeekPage.tsx`)
- Consumes `thisWeekAtoms` memo; header shows Mon-Sun date range
- FilterBar shows all filters except section
- Empty state references `compressionCandidates.length` to suggest Review if items exist

**ActiveProjectsPage** (`src/ui/views/pages/ActiveProjectsPage.tsx`)
- Consumes `activeProjectAtoms` which returns `{ sectionItemId, sectionItemName, atoms }[]` grouped data
- Renders project group headers with atom count, then atoms per group
- First atom per group gets a "Next Action" badge (blue pill, absolute-positioned)
- Roving tabindex uses flat index across all groups

**WaitingPage** (`src/ui/views/pages/WaitingPage.tsx`)
- Consumes `waitingAtoms` memo; FilterBar shows sort only
- Long Wait badge (amber) on atoms with staleness > 0.5
- Page-level hint shows how many items have long waits

**InsightsPage** (`src/ui/views/pages/InsightsPage.tsx`)
- Consumes `insightAtoms` memo; FilterBar shows sort and date range only
- Empty state shows lightbulb icon with capture prompt

**MainPane** (`src/ui/layout/MainPane.tsx`)
- Added Switch/Match branches for all five new page IDs
- `AtomDetailView` rendered as overlay via `Show when={state.selectedAtomId !== null}`

**PageTabStrip** (`src/ui/layout/PageTabStrip.tsx`)
- `staticTabs` array updated to include: Inbox, Today, This Week, Active Projects, Waiting, Insights, All Items
- Saved filter tabs appended with id `filter-{filter.id}` for Plan 04 compatibility
- Review tab and section-derived tabs retained

### Task 2: Atom Detail View + AtomCard Enhancements

**AtomDetailView** (`src/ui/views/AtomDetailView.tsx`)
- Fixed panel: `position: fixed; right: 0; width: 400px`, full-width on mobile
- Semi-transparent overlay behind panel; click overlay to close
- Escape key closes panel via `document.addEventListener` + `onCleanup`
- Editable title: click to activate inline input, saves on blur or Enter via UPDATE_ATOM
- Status buttons row for tasks (open, in-progress, waiting, done, cancelled) — active state highlighted blue
- Non-task atoms show read-only status badge
- Task date inputs: Due date + Scheduled date (type="date")
- Event date input for event atoms
- Content textarea: saves on blur via UPDATE_ATOM
- Metadata: created/updated dates, section name, project name, link count
- Backlinks and tags placeholder divs with Plan 04 annotations
- PriorityBadge and staleness percentage shown in score row

**AtomCard** (`src/ui/components/AtomCard.tsx`)
- Added `onClick`, `tabindex`, `focused` props for page component integration
- Click now calls `props.onClick` if provided, else calls `setSelectedAtomId(props.atom.id)`
- Removed inline expanded content toggle (detail panel replaces it)
- Due date display: `atom-card-due` span for tasks, red `.overdue` class when past due
- Event date display: `atom-card-event-date` span for events

**useRovingTabindex** (`src/ui/hooks/useRovingTabindex.ts`)
- Full Plan 03 implementation was already present when this plan executed
- Returns: `focusedIndex`, `setFocusedIndex`, `onKeyDown`, `itemTabindex`, `isItemFocused`
- Arrow up/down, Home/End navigation; Enter = select; optional Escape handler

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Type Error] Adapted page components to full useRovingTabindex API**
- **Found during:** Task 1 TypeScript check after Task 2 commit
- **Issue:** Plan stub returned `containerProps` object; Plan 03's full implementation returns `onKeyDown` function directly. The two ran in the same wave; Plan 03 replaced the stub before this plan's type check ran.
- **Fix:** Updated all five page components to destructure `onKeyDown` instead of `containerProps`, and added explicit `role="listbox" tabindex={0}` on container divs.
- **Files modified:** TodayPage.tsx, ThisWeekPage.tsx, ActiveProjectsPage.tsx, WaitingPage.tsx, InsightsPage.tsx
- **Commit:** 0247fe9

## Self-Check: PASSED

All created files verified present on disk. All commits verified in git log.

| File | Status |
|------|--------|
| src/ui/views/pages/TodayPage.tsx | FOUND |
| src/ui/views/pages/ThisWeekPage.tsx | FOUND |
| src/ui/views/pages/ActiveProjectsPage.tsx | FOUND |
| src/ui/views/pages/WaitingPage.tsx | FOUND |
| src/ui/views/pages/InsightsPage.tsx | FOUND |
| src/ui/views/AtomDetailView.tsx | FOUND |
| src/ui/hooks/useRovingTabindex.ts | FOUND |

| Commit | Message |
|--------|---------|
| bccef1b | feat(03-02): five default page views + MainPane routing + PageTabStrip update |
| 942d3ea | feat(03-02): atom detail view with status/date editing + roving tabindex hook |
| 0247fe9 | fix(03-02): adapt pages to full useRovingTabindex API |

TypeScript: zero errors in all plan-modified files (`npx tsc --noEmit` passes for our scope).
