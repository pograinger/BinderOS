# Phase 1: Foundation - Context

**Gathered:** 2026-02-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Typed atom schema (five types), local-first IndexedDB storage with browser durability guarantees, and the binder UI shell with fast capture. This phase delivers: atoms can be created, classified, persisted, exported, and undone. The UI shell establishes the mobile-first PWA layout with sections, pages (as tabs), and the main pane. No compute engine (priority scoring, entropy) — that's Phase 2.

</domain>

<decisions>
## Implementation Decisions

### Atom Graph Model
- Links are **typed edges** — each link has a relationship type (e.g., "belongs-to", "depends-on", "relates-to")
- Links are **directional** — A → B is a forward link; B sees A as a backlink
- Relationship types are **extensible** — start with a minimal built-in set, users can define custom relationship types
- **Type-aware link rules** — some edge types only make sense between certain atom types (e.g., "blocks" only between Tasks); system enforces valid combinations
- In-memory graph traversal via Rust petgraph in WASM; Dexie.js multi-entry indexes on links for persistence

### Binder UI Shell
- **Mobile-first PWA** — responsive design that works on phones first, scales up to desktop
- **Full PWA** — installable with app icon, splash screen, runs standalone (no browser chrome), service worker for offline
- **Dark theme by default** — command-center feel inspired by Warp terminal
- **Subtle binder hints** — clean modern UI with subtle binder-inspired elements (tab shapes, divider lines), not literal skeuomorphic binder
- **Distinct colors per atom type** — each of the 5 atom types gets a signature color for instant visual identification
- **Hybrid density** — compact rows by default, expand on click/hover to show detail inline
- **Mobile navigation** — bottom tab bar for sections (like iOS apps)
- **Page tabs** — horizontal scrollable strip below header on mobile (Material-style tabs)
- **Swipe gestures** — swipe left to archive, swipe right to complete on atom rows
- **Status bar** — bottom status bar (IDE-style) with entropy health + atom count + inbox count + storage used + persistence status
- **Entropy in status bar only** — no badges anywhere; entropy health communicated through status bar color shifts (green → yellow → red)

### Claude's Discretion
- Sidebar item layout (collapsible tree vs flat list vs icon rail)
- Atom detail view pattern (side panel vs modal vs inline expand)
- Page tab ordering and default visibility
- Atom block visual treatment (discrete blocks vs continuous list)
- Exact spacing, typography, component library choices

### Inbox & Classify Flow
- **Text-based rich content for v1** — Markdown, JSON, code blocks supported; data model designed for future multi-modal content (voice, images, video)
- **Voice capture in v1** — Web Speech API for speech-to-text; mic button inside the capture overlay
- **Voice transcripts land as raw text** — no smart parsing in v1; AI layer will handle structure detection later
- **Instant capture mechanism** — prioritize speed above all; something effortless that's always accessible
- **PWA Share Target** — register as share target so text/links from any app land directly in inbox
- **Card-by-card triage** — show one inbox item at a time, fullscreen-ish; classify, link, then next (Tinder-like swipe pattern on mobile)
- **Type-ahead search for linking** — during triage, start typing a project/area name, suggestions appear for linking
- **System suggests atom type** — analyze content and pre-select a type; user confirms or changes with one tap
- **Pattern learning** — track classification patterns over time to improve suggestions (e.g., "HVAC items usually go to Home area")
- **No snooze** — inbox forces decisions (classify or discard). No deferral mechanism. Scheduled dates on Tasks handle future timing. Snooze becomes a procrastination heap.
- **Micro-animation rewards** — subtle particle effect or checkmark animation on triage completion; system rewards compression, not accumulation
- **No badges anywhere** — the system communicates through the status bar and contextual UI, never badges

### Storage Trust Signals
- **Prominent first-run warning** if browser denies persistent storage — full-screen explanation of data risk + how to fix (add to home screen, change browser settings)
- **Time-bounded undo** — full mutation history for 30 days, then compress old changes into snapshots
- **Change log as full snapshots** — each mutation stores the complete atom state after mutation (simple, debuggable, CRDT-compatible)
- **CRDT-compatible event stream** — design the change log from day one as a CRDT-compatible event stream (timestamps, causal ordering) even though sync server is a future phase
- **Manual export + periodic reminders** — export button always available; periodic reminder to export (browser can't auto-write without user gesture)
- **Empty + hint onboarding** — first-run shows empty binder with contextual hints pointing to the capture button ("Capture your first thought")

### Claude's Discretion
- Editor type for atom content (plain textarea vs live preview vs WYSIWYG-light)
- Triage card actions (classify + link + done vs quick classify only)
- Export format structure (single JSON dump vs per-section, single MD vs zipped folder)
- Storage size display in status bar (always, when concerning, or settings only)

</decisions>

<specifics>
## Specific Ideas

- "Warp terminal" — the UI should feel like Warp's dark, information-dense, command-center aesthetic
- "Tony Stark / Star Trek" — the overall product should feel like a personal command center, not a notes app
- "Ready at a moment's notice to remember some fact" — capture must be effortless, zero-friction, always available
- "I hate badges. They never work well for me." — no notification badges; communicate through ambient status bar changes
- Reward interaction — use UI elements known to reward completion (micro-animations, satisfying transitions)
- "I am a terrible procrastinator. Every productivity tool has failed me." — the system must be the anti-procrastination tool: no snooze, hard caps, forced decisions, entropy decay
- Atom types should have distinct colors for instant visual scanning in the dark theme

</specifics>

<deferred>
## Deferred Ideas

- **Context-aware notifications** — system should know where you are, what you're doing, and nudge appropriately based on real-world context. Requires AI orchestration layer + device sensors. (Future phase — AI layer)
- **Photo/video capture** — capture pictures and video as atom content. Requires OPFS blob storage and camera API. (Future phase — rich content)
- **Voice message storage** — store original audio alongside transcription. (Future phase — rich content)
- **AI-assisted task grouping** — AI analyzes all tasks and finds efficiencies, groups related items, helps get things done (GSD-style). (Future phase — AI orchestration)
- **CRDT sync to private cloud server** — sync PWA across devices via lightweight private server. Change log is designed for this from Phase 1. (v2 — SYNC-01, SYNC-02)
- **AI type suggestion with smart parsing** — parse voice transcripts and shared content into structured atoms automatically. (Future phase — AI layer)

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-02-21*
