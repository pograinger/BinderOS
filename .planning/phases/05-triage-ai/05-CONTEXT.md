# Phase 5: Triage AI - Context

**Gathered:** 2026-02-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Floating AI orb available on every page with a radial menu of context-aware AI actions. Primary deliverable is inbox triage: AI suggests atom type and section for each inbox item with reasoning, user accepts or dismisses via swipe gestures, all changes tagged as AI-sourced. Streaming responses from the AI adapters built in Phase 4. Review, compression coach, and weekly review flows are separate phases (6-7).

</domain>

<decisions>
## Implementation Decisions

### Orb appearance & behavior
- Orb is a glowing circle styled to look like it opens like a 3-ring binder ring (on-brand for BinderOS)
- Animation-based state indicators: idle = gentle pulse, thinking = ring rotates/spins, streaming = ring opens with particles flowing, expanded = ring fully open revealing radial menu
- Context-aware positioning: orb smoothly animates to different screen positions based on current page layout (e.g., near inbox list on Inbox page, near detail panel on atom view)
- Always visible — never auto-hides. May shrink to a subtle dot during focus activities but remains on screen and one tap away
- When tapped, orb takes full focus and opens a radial/circular menu (pie menu style) — user can spin around to different groups of options
- 4-5 segments in the radial menu (e.g., Triage, Review, Compress, Discuss, Settings)
- Context-aware primary action is highlighted: the segment relevant to the current page is larger/brighter than the others
- One of the radial actions is a "Discuss" option that asks the user a series of preferences about the current atom or page being viewed

### Suggestion presentation
- Suggestions appear inline on each inbox card — directly on the card where the atom is, not in a separate tray
- One-liner reasoning visible by default (e.g., "This looks like a Project — has multiple next actions and a deadline."). Expandable for more detail
- 2-3 semantically related atoms shown as compact clickable chips below the suggestion line. Tapping a chip opens the linked atom
- Batch processing: when user taps "Triage Inbox" on the orb, AI processes all inbox items and suggestions appear on every card simultaneously
- Subtle confidence signal: high-confidence suggestions have a solid suggestion line; lower-confidence ones have a dotted/lighter treatment. No numbers or labels

### Accept/dismiss interaction
- Swipe gestures: swipe right to accept, swipe left to dismiss. Buttons as fallback for accessibility
- On accept: card animates off-screen (satisfying "done" feeling), and the accepted type/section is applied via existing mutation pipeline
- On dismiss: suggestion disappears from the card without affecting the atom
- Persistent AI badge on accepted atoms: subtle indicator (small icon or colored dot), visible if you look but doesn't dominate. Tooltip shows "AI-suggested"
- "Accept all" batch button available after reviewing a few suggestions — applies all remaining pending suggestions at once. Speeds up large inboxes

### Streaming & error states
- Orb indicates processing (spinning ring animation), cards populate one by one as each suggestion completes. No per-token typing animation on individual cards
- On cancel mid-stream: keep suggestions that are already complete, remaining cards show nothing. User can re-trigger for the rest
- On error (model failure, network, timeout): orb ring turns red/amber briefly with a small message near it: "Triage failed — tap to retry". Cards remain untouched
- Retry is always available from the orb's error state

### Claude's Discretion
- Exact CSS animations and transitions for the orb states
- Radial menu implementation approach (CSS transforms vs canvas vs SVG)
- Exact positioning algorithm for context-aware orb placement per page
- Swipe gesture sensitivity and thresholds
- Card exit animation timing and easing
- How the "Discuss" radial action gathers preferences (question flow design)

</decisions>

<specifics>
## Specific Ideas

- Orb should look like a binder ring that opens — core brand identity of BinderOS carried into the AI interaction
- Radial menu interaction inspired by pie menus / ring selectors where you can spin around to options
- Card swipe-to-accept/dismiss similar to email triage apps (Tinder-like swipe UX but for GTD)
- The "Discuss" action on the orb is like running a mini /gsd:discuss session but for the current atom or page — asking preferences contextually

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-triage-ai*
*Context gathered: 2026-02-23*
