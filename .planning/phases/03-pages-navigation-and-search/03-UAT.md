---
status: passed
phase: 03-pages-navigation-and-search
source: [03-01-SUMMARY.md, 03-02-SUMMARY.md, 03-03-SUMMARY.md, 03-04-SUMMARY.md]
started: 2026-02-22T19:00:00Z
updated: 2026-02-22T22:30:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: complete
name: All tests passed
expected: N/A
awaiting: none

## Tests

### 1. Today Page Displays Correct Atoms
expected: Navigate to the Today tab. Page shows atoms due today, today's events, and top critical/high-priority tasks. FilterBar shows status and priority filters (no type/section). Empty state references entropy score or stale items if no atoms match.
result: PASS — Tasks with due dates and atoms show on correct pages after date timezone fixes.

### 2. This Week Page Shows Weekly View
expected: Navigate to This Week tab. Header shows Mon-Sun date range for current week. Page lists tasks and events due this week. Empty state mentions compression candidates if they exist.
result: PASS — Rewritten with Last Week / This Week / Next Week tabs, Sun-Sat weeks, renamed to "Weekly".

### 3. Active Projects Page Groups by Project
expected: Navigate to Active Projects tab. Atoms are grouped under project headers with atom count. First atom in each group has a "Next Action" badge (blue pill).
result: PASS — Project management added: create/rename/delete projects, assign atoms via detail panel dropdown.

### 4. Waiting Page with Staleness Alerts
expected: Navigate to Waiting tab. Shows atoms with "waiting" status. Atoms with staleness > 0.5 show a "Long Wait" amber badge. Page hint shows count of long-wait items.
result: PASS — Empty state correct. Task set to waiting status appears on page.

### 5. Insights Page Shows Insight Atoms
expected: Navigate to Insights tab. Only insight-type atoms appear. FilterBar shows sort and date range controls. Empty state shows capture prompt.
result: PASS — Insights page works correctly.

### 6. Page Tab Navigation Works
expected: PageTabStrip shows tabs: Inbox, Today, This Week, Active Projects, Waiting, Insights, All Items. Clicking each tab switches the main content to that page.
result: PASS — All tabs and More dropdown items switch content correctly.

### 7. Atom Detail Panel Opens on Card Click
expected: Click any AtomCard in a page list. A 400px slide-in panel appears from the right with editable title, metadata, content, and action controls. Click overlay or press Escape to close.
result: PASS — Confirmed during testing.

### 8. Task Status Editing in Detail View
expected: Open detail view for a task atom. Status buttons show: open, in-progress, waiting, done, cancelled. Click a status button — it highlights and the atom's status updates.
result: PASS — User changed task to "waiting" status successfully.

### 9. Date Editing in Detail View
expected: Open a task atom's detail view. Due date and scheduled date inputs are visible. Set a due date — it persists. For event atoms, an event date input appears instead.
result: PASS — Fixed reactivity (SolidJS proxy), timezone (UTC), and onInput issues.

### 10. AtomCard Shows Due Date and Overdue Indicator
expected: A task atom with a due date shows the date on its card. If the due date is past, the date appears in red. Events show their event date on the card.
result: PASS — Fixed timezone display with UTC methods.

### 11. Full-Text Search via Ctrl+K
expected: Press Ctrl+K (or Cmd+K). A spotlight-style search overlay appears. Type a query — results appear ranked by relevance. Results update as you type (debounced).
result: PASS — Works. Gap noted: needs mobile-first floating button UX redesign.

### 12. Search Filter Chips
expected: In the search overlay, filter chips appear for type (task/fact/event/decision/insight), status, and date range. Toggle a chip to narrow results to that filter.
result: PASS — Functional. Will be redesigned with search UX overhaul.

### 13. Command Palette via Ctrl+P
expected: Press Ctrl+P. A command palette opens (separate from search). Shows navigation commands (pages), action commands, and recent atoms. Type to fuzzy-filter commands. Select a command to execute it.
result: PASS

### 14. Keyboard Shortcut Reference via ?
expected: Press ? (when not in a text input). A shortcut reference overlay appears showing all keyboard shortcuts organized by category (Global, Navigation, Lists, Search, Detail Panel). Press Escape to close.
result: PASS — Shortcut reference overlay works.

### 15. Number Keys Switch Pages
expected: Press 1-5 on the keyboard (when not in a text input). Each number switches to a different page (1=Today, 2=This Week, etc.).
result: PASS — 0-6 keys switch pages (0=Inbox through 6=All Items).

### 16. Arrow Key Navigation in Page Lists
expected: On any page with an atom list, press ArrowDown/ArrowUp to move focus between AtomCard items. Press Enter to open the focused atom's detail view. Home/End jump to first/last item.
result: PASS — Global document-level arrow keys, consistent across all pages. Left/Right switches week tabs on Weekly.

### 17. Tags on Atoms
expected: Open an atom's detail view. A tag input area is visible. Type a tag name and press Enter or comma to add it. Tags appear as chips. Autocomplete suggests existing tags as you type. A GTD context dropdown (@home, @office, etc.) is available.
result: PASS

### 18. Tags Display on AtomCard
expected: Atoms with tags show the first 3 tags as small chips on their card. If more than 3 tags, a "+N" overflow badge appears. GTD context indicator is visible.
result: PASS

### 19. Backlinks Panel in Detail View
expected: Open an atom's detail view. A collapsible "Linked from (N)" section appears (collapsed by default). Expand it to see all atoms that link to this one. Click a backlink to navigate to that atom.
result: PASS — Backlinks panel works. Tested via @mention linking flow.

### 20. Save Current Filter as Named Page
expected: On any page with FilterBar, apply some filters. A "Save as page" button appears. Click it, enter a name, and confirm. A new tab appears in the PageTabStrip with that name. Click the tab to load the saved filter view.
result: PASS — Fixed duplicate creation bug (Enter + blur double-fire). FilterBar also added to All Items page.

### 21. Delete Saved Filter Tab
expected: Hover over a saved filter tab in PageTabStrip. An X delete button appears. Click it — the tab is removed and you're redirected to inbox if that was the active tab.
result: PASS — Delete button (×) appears next to saved filter entries in More dropdown.

### 22. @Mention Inline Linking
expected: In the atom detail view content textarea, type @ followed by text. A dropdown of matching atoms appears (up to 8). Select one — the mention is inserted and a link to that atom is created.
result: PASS — Fixed Enter key reliability (contentDraft race condition). Links shown as chips, not inline text. Self-linking prevented.

### 23. Quick Capture Still Works from All Pages
expected: From any page (Today, This Week, etc.), press Ctrl+N or tap the FAB. The capture overlay opens. Create an atom — it works the same as before from any page context.
result: PASS — Confirmed working from all pages.

## Summary

total: 23
passed: 23
issues: 0
pending: 0
skipped: 0

## Gaps

1. **Global consistent filtering**: Every view should have quick, consistent filtering by context, tags, priority, etc. FilterBar added to All Items but could be more uniform across all pages. Need consistent filtering UX.
2. **Search UX overhaul**: Replace Ctrl+K-only search with a global floating button (mobile-first) that explodes into suggested search groups. Should be accessible from every page, not just a keyboard shortcut. Current spotlight-style search is desktop-centric.
