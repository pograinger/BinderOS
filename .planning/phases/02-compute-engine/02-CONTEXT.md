# Phase 2: Compute Engine - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Rust/WASM priority scoring, staleness decay, entropy health indicator, and advisory-first hard caps (inbox + open tasks). This phase gives atoms meaning: computed priority, visible staleness, system health, and the discipline engine that prevents accumulation. No AI orchestration, no new UI views beyond what's needed for cap enforcement and compression prompts. The review page is the only new view.

</domain>

<decisions>
## Implementation Decisions

### Priority Score Display
- **Tier labels** (not numeric scores or color-only) — five tiers: Critical, High, Medium, Low, Someday
- **Atom type color + tier badge** — keep atom type as primary color identity, add a small tier icon+color badge alongside
- **Tier icons**: flame (Critical), arrow-up (High), dash (Medium), arrow-down (Low), clock (Someday) with tier-specific colors
- **Auto-sort by priority** within all views — highest priority always at top
- **Live updates** — priority tier changes immediately when underlying factors change (deadline, dependency completion, etc.)
- **Tasks and Events only** get priority tiers — Facts, Decisions, and Insights show staleness only (no priority scoring)
- **Importance**: hybrid approach — system infers default importance from link density and section type, user can override with a quick tap
- **Energy required**: included in v1 — three levels (Quick / Medium / Deep), inferred from content heuristics with user override
- **Priority pinning allowed** — user can pin an atom to a specific tier, overriding the computed score. Pinned items show a pin icon.

### Staleness Visualization
- **Opacity fade** — stale atoms gradually become more transparent (100% fresh to ~60% at max staleness). Fresh items pop, stale ones recede.
- **14-day half-life** — moderate decay. Noticeable fade after two weeks without meaningful interaction.
- **Meaningful actions only** reset staleness — editing content, changing status, or adding/removing links. Viewing alone does NOT reset.
- **Link freshness boost** — atoms linked to active (non-stale) items decay slower. Rewards good linking behavior.
- **Pinning allowed** — user can pin atoms to prevent staleness decay entirely. No cap on pins.
- **Max staleness**: nothing automatic — fully faded atoms stay visible, appear in compression prompt candidates. Never auto-archived or auto-deleted.
- **Show staleness from day 1** — no hiding during onboarding. 30-day forgiveness means slower decay rate, not hidden decay.

### Cap Enforcement UX
- **Soft warning at 80%**: status bar color shift only (inbox segment shifts green to yellow). Ambient, no modal, no banner, no badge.
- **Hard block at 100%**: modal dialog with triage. Shows inbox/task items as a list with quick-action buttons (classify, schedule, discard for inbox; complete, archive, merge for tasks). Modal is dismissable only after freeing at least one slot.
- **Same pattern for both caps** — inbox cap and open task cap use identical UX (status bar warning at 80%, modal resolution at 100%)
- **Configurable with guardrails** — users can adjust caps within bounds (inbox: 10-30, tasks: 15-50). Can tighten but not infinitely loosen.

### Compression Prompts
- **Dedicated review page** — "Review" tab in the page tab strip. Shows all compression prompt candidates.
- **Card-by-card triage** — same Tinder-like pattern as inbox triage. One candidate at a time. Forces a decision per item.
- **Four actions**: Archive, Delete, Keep (resets staleness), Merge (combine with another atom)
- **Show specific reason** per card — "Stale: 45 days since last edit" or "Orphan: no links to active items". Helps user decide.
- **Candidates**: stale atoms (past max staleness threshold), zero-link atoms not recently created, semantically similar atoms (deferred to AI layer)

### Claude's Discretion
- Exact tier color palette (complementary to dark theme and atom type colors)
- Priority formula weight calibration (starting constants for deadline, importance, recency, dependencies, energy)
- Staleness decay curve shape (linear vs exponential within the 14-day half-life)
- Energy inference heuristic specifics (what content patterns map to Quick/Medium/Deep)
- Merge UX flow details (how to select target atom, what happens to links)
- Review page empty state when no candidates exist

</decisions>

<specifics>
## Specific Ideas

- "I am a terrible procrastinator. Every productivity tool has failed me." — the cap enforcement must be firm, not easily dismissed
- Priority tier icons should feel like a command center — small, iconic, information-dense
- Staleness opacity fade should be gradual enough to notice trends, not jarring enough to distract
- The review page should feel rewarding to process (same micro-animation philosophy as inbox triage)
- Cap enforcement modal should feel like "the system helping you" not "the system blocking you" — tone matters

</specifics>

<deferred>
## Deferred Ideas

- **AI-powered compression suggestions** — AI identifies semantically similar atoms for merge candidates. Requires AI orchestration layer. (Future phase — AI layer)
- **Energy inference via AI** — more sophisticated energy estimation from content analysis. Use simple heuristics for now. (Future phase — AI layer)
- **Scheduled decay pauses** — pause staleness decay during vacations or planned breaks. (Future phase — settings/preferences)
- **Per-section cap limits** — different task caps per section (more for Projects, fewer for Areas). (Future phase — advanced configuration)

</deferred>

---

*Phase: 02-compute-engine*
*Context gathered: 2026-02-22*
