# Phase 3: Pages, Navigation, and Search - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can navigate the full system by keyboard (desktop) and touch (mobile), find any atom via intelligent search with semantic understanding, view their atoms through built-in GTD-aligned query pages, and organize cross-cutting concerns with freeform tags, GTD contexts, backlinks, and saved filters that can become custom pages.

</domain>

<decisions>
## Implementation Decisions

### Default Pages — GTD-Aligned Query Views
- GTD methodology is the framework and lens for deciding what needs attention
- **Today page**: Smart focus list — due today + today's events + top 3-5 highest-priority open tasks surfaced by the compute engine + items at risk of being forgotten (approaching staleness thresholds, upcoming deadlines). Research-backed: tight daily lists with goal alignment reduce cognitive load and improve focus
- **This Week page**: Lookahead view — tasks due this week + events this week + items approaching deadlines
- **Active Projects page**: Tasks grouped by project section, GTD-style — each project shows its next action (highest-priority task)
- **Waiting page**: Tasks with "waiting" status — GTD waiting-for list with staleness alerts on long-waiting items
- **Insights page**: All Insight-type atoms sorted by recency
- Layout: Card list pattern (continues the existing AtomCard pattern from Inbox/Review — consistent, already built)
- **Empty states**: Compute-engine-driven contextual prompts, not static messages. Use existing scores, staleness, and cap data to generate GTD-aligned suggestions (e.g., "You have 3 stale items approaching critical. Review them?" or "Project [Y] has no next action defined. Add one?"). Data foundation for v2 AI learning.

### Search Experience — Intelligent, Multi-Signal
- **Invocation**: Spotlight-style overlay via Cmd/Ctrl+K — floating search box with instant type-ahead results
- **Full-text search**: Required (NAV-01) across all atom types
- **Graph-relationship awareness**: Search results boosted when linked to recent/active atoms — leverages existing atom links array
- **Local vector embeddings**: Ship a small ONNX model via WebAssembly for in-browser semantic search. Keeps local-first promise (zero network calls). Enables "find things about X" even without exact keyword match
- **Ranking**: Claude's discretion — blend text match, graph proximity, semantic similarity, and priority score into a single relevance score
- **Filterable inline**: Small filter chips below search input in the overlay for type, status, date range refinement
- **Interaction logging**: Log search queries, filter selections, and result clicks as interaction events. Extends the change log pattern. Data foundation for v2 learning — frequency-based ranking boosts in v1 (e.g., "user frequently filters by Tasks → boost Tasks")

### Keyboard Navigation & Command Palette
- **Navigation model**: Responsive from the start — keyboard shortcuts for desktop, touch-friendly equivalents for mobile. No rework needed for v2 mobile optimization
- **Keyboard shortcuts**: Standard web app conventions (Tab/Shift+Tab, Enter, arrow keys in lists) with common action shortcuts (Ctrl+N new atom, etc.)
- **Discoverability**: Both inline hints (tooltips show shortcuts) + dedicated shortcut reference sheet (? key)
- **Command palette**: Separate from search (search is Spotlight overlay). Claude's discretion on content — actions + recent atoms is recommended
- **Mobile command palette**: Floating action button (FAB) in bottom-right corner. Always accessible, standard mobile pattern
- **Design directive**: UI should feel like "the AI assistant of the future" — intelligent, anticipatory, sleek. The compute engine data powers this feeling even without an AI API

### Tags, Backlinks & Saved Filters
- **Tag model**: Freeform tags with autocomplete + a special "context" field with GTD-style values (@home, @office, @errands, etc.). Freeform for general categorization, GTD contexts for action-context filtering
- **Backlinks**: Collapsible "Linked from (N)" section at the bottom of atom detail view. Collapsed by default, expand to see linking atoms as compact cards
- **Saved filters**: Save as named page — user configures filters on any page, clicks "Save as page," and it appears as a new tab alongside default pages. Users create custom GTD views
- **Inline linking**: @mention syntax in atom content (type @atomName to create a link with autocomplete showing existing atoms). Like Notion/Obsidian [[links]] pattern

### Task Status & Date Fields (ORG-07, ORG-08)
- Task statuses: open, in-progress, waiting, done, cancelled — maps directly to GTD states
- Tasks support due date and scheduled date
- Events are dated by nature
- These fields power the query pages (Today, This Week, Waiting)

### Claude's Discretion
- Filter bar visibility per page context (always-visible vs toggle-reveal)
- Page switching integration with existing tab bar/sidebar layout
- Command palette content (actions + recent atoms recommended)
- Search result ranking algorithm (blended score recommended)
- Exact keyboard shortcut assignments
- Specific empty state prompt wording per page

</decisions>

<specifics>
## Specific Ideas

- "I want this to feel like the AI assistant of the future" — the UI should feel intelligent and anticipatory, like the system understands what you need
- GTD methodology as the operating framework — the system should bring GTD alive and make it practical through dynamic, intelligent views
- "Don't let things get lost is priority 1" — the Today page and contextual prompts must actively surface items needing attention
- Research-backed daily view: tight focus lists with goal alignment reduce cognitive load (Stajkovic & Stajkovic 2025, Atlassian research 2025)
- Interaction logging as data foundation — every user action in search/filter contexts is a signal for future learning. v1 uses frequency heuristics, v2 adds ML
- Proactive assistant design principles: valuable, pertinent, anticipatory, deferent — suggest but never force (World Scientific proactive agent research)

</specifics>

<deferred>
## Deferred Ideas

- **Vector embedding learning/adaptation**: v2 AI Orchestration can retrain or fine-tune embeddings based on user interaction patterns
- **Cross-context reasoning**: "You always filter by Tasks on Mondays" — true behavioral learning requires v2 AI
- **ML-based ranking personalization**: v1 uses frequency heuristics, v2 adds proper learning models
- **Full mobile-optimized UX (MOBL-01)**: Phase 3 is responsive from the start, but dedicated mobile UX optimization is v2. Responsive design prevents rework

</deferred>

---

*Phase: 03-pages-navigation-and-search*
*Context gathered: 2026-02-22*
