# Phase 6: Review Pre-Analysis - Context

**Gathered:** 2026-02-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can start a weekly review via the orb and receive an AI-generated briefing summarizing their entropy state, stale tasks, projects without next actions, and compression candidates. Incomplete reviews can be resumed. Analysis artifacts are stored as a new atom type. The full guided review flow (Get Clear / Get Current / Get Creative) and compression coach are Phase 7.

</domain>

<decisions>
## Implementation Decisions

### Review entry & briefing flow
- Entry point is the orb's existing "Review" radial menu button — no new UI surface needed
- Tapping Review navigates to a full-screen review view (like Today or Inbox) — not a modal or panel
- While the AI generates the briefing, show a progress indicator with summary stats appearing incrementally (e.g. "14 stale items found..." "3 projects missing next actions...")
- After the briefing is displayed, sections are tappable — items link to inline expanded views with quick actions. No guided flow yet (Phase 7), but the briefing is actionable
- A "Start Review" button is NOT needed in Phase 6; the briefing itself is the experience

### Briefing content & presentation
- AI-written summary sentence at the top — one natural language sentence describing overall system health based on analysis
- Below the summary: sectioned cards, one per category (stale tasks, projects without next actions, compression candidates)
- Each card has a header with count badge
- Items within cards show: atom title + metadata chips (staleness days, link count, entropy score, etc.) — no AI prose per item, just data
- Items are tappable — inline expand with quick action buttons (defer, archive, add next action) without leaving the briefing view

### Session resume experience
- Orb changes state (pulsing differently or badge dot) when an incomplete review session exists — tapping offers "Resume review" as the primary radial action
- Full restore on resume: exact briefing content, which items were expanded, scroll position, and which items were acted on
- Items the user acted on during the briefing are marked as "addressed" in the session — on resume they show a checkmark or muted style
- When session is older than 24 hours: still offer resume with a warning ("data may be outdated") plus option to start fresh — no silent discard, no hard cutoff

### Analysis artifact design
- New atom type: `analysis` — alongside task/note/resource/etc.
- Analysis atoms are read-only, AI-generated badge, non-editable (no edit button, no swipe actions on them)
- Visual treatment: frosted/glass card appearance — semi-transparent, distinct from solid user-authored cards. AI badge in corner
- Analysis atoms only appear within the review flow view — not shown in Inbox, Today, This Week, or other standard views. They exist as atoms (searchable, linkable) but are filtered out of page queries
- Retention: keep the 4 most recent review briefings. Older ones auto-delete when a 5th is created

### Claude's Discretion
- Exact frosted glass CSS treatment and opacity values
- Progress indicator animation design
- How metadata chips are styled within briefing cards
- Orb badge dot design for incomplete review indicator
- Briefing card sort order within categories
- Inline expand animation and quick action button set

</decisions>

<specifics>
## Specific Ideas

- The briefing should feel like a "state of your system" dashboard — scannable, data-driven, actionable
- Frosted glass cards should look clearly different from the solid-background user atoms — the visual distinction is the primary signal that this is AI-generated content
- The orb's review-pending indicator should be subtle enough to not be annoying but noticeable enough that the user remembers they have an incomplete review

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-review-pre-analysis*
*Context gathered: 2026-02-24*
