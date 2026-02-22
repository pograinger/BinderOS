# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-21)

**Core value:** Every piece of stored information must encode predictive value about future actions, decisions, or understanding — if it doesn't change behavior, it's noise, and the system actively manages this boundary.
**Current focus:** Phase 3 — Pages, Navigation, and Search (context gathered, ready for planning)

## Current Position

Phase: 3 of 3 (Pages, Navigation, and Search) — CONTEXT GATHERED
Plan: 0 of TBD in current phase
Status: Phase 3 context gathered
Last activity: 2026-02-22 — Phase 3 context discussion complete: GTD-aligned pages, intelligent search with local embeddings, keyboard+mobile nav, tags/backlinks/saved filters

Progress: [█████████░] 88% (7/8 plans complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 6
- Average duration: 18 min
- Total execution time: 108 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation | 4/4 | 90 min | 23 min |
| 2. Compute Engine | 4/4 | 33 min | 8 min |

**Recent Trend:**
- Last 5 plans: 9 min, 20 min, 8 min, 10 min, 15 min
- Trend: fast execution continues; Phase 2 complete engine shipped in 4 plans averaging 8 min each

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Pre-phase]: wasm-pack is archived (July 2025) — use three-step pipeline: cargo → wasm-bindgen-cli → wasm-opt
- [Pre-phase]: SolidJS ESLint plugin is mandatory before any component is written (silent reactivity failure if missed)
- [Pre-phase]: All WASM calls must live in a Web Worker — UI never imports WASM directly
- [Pre-phase]: Safari ITP will silently delete data after 7 days without `navigator.storage.persist()` — must ship in Phase 1
- [Pre-phase]: IndexedDB writes must be batched through a write queue (200-500ms debounce) to avoid 10-25x slowdowns
- [Pre-phase]: Phase 2 entropy UX must be advisory-first: soft warning at 80% cap, resolution UI at 100%, forgiving decay for first 30 days
- [01-01]: wasm-bindgen 0.2.109 is yanked from crates.io — use 0.2 range, Cargo.lock resolves to 0.2.111
- [01-01]: Node.js 22.x required for Vite 7 (20.10 below minimum 20.19+) — installed as portable zip
- [01-01]: Windows MSVC toolchain requires VS Build Tools + Windows SDK + .cargo/config.toml lld-link.exe config
- [01-01]: ESLint v10 (not v9) installed; requires jiti package for TypeScript config file loading
- [01-01]: WASM pkg ignored in ESLint — generated files produce false-positive unused-disable-directive warnings
- [01-02]: Zod v4 must be imported via 'zod/v4' path — default 'zod' import in v4.x package exposes v3 compat layer
- [01-02]: Deterministic UUIDs hardcoded for seed sections (not computed from hash) for simplicity
- [01-02]: Device ID stored in localStorage (not IndexedDB) so it survives database deletion/recreation
- [01-02]: WriteQueue includes flushImmediate() for critical writes alongside normal 300ms debounce
- [01-03]: Undo reverts most recent changelog entry: deletes atom if before=null, restores before snapshot otherwise
- [01-03]: Status bar polls navigator.storage.estimate() every 30s (not per-update) for performance
- [01-03]: sendCommand() is the single entry point for all Worker commands from UI code
- [01-03]: Sidebar/BottomTabBar use _props prefix to avoid SolidJS reactivity warnings when CSS handles visibility
- [01-03]: PageTabStrip generates section tabs dynamically from store — future phases add query pages
- [01-04]: Raw touch handlers used for swipe (solid-gesture not installed) — scroll-vs-swipe disambiguation built in
- [01-04]: Classification events stored in Dexie config table as JSON array (no separate table)
- [01-04]: Pattern suggestion needs 60% confidence (3+ similar items) before overriding content heuristic
- [01-04]: Voice capture shows disclaimer — Web Speech API sends audio to external servers
- [02-01]: AtomLink[] flattened to string[] targetIds in flattenAtomLinksForWasm() before WASM calls (Rust expects Vec<String>)
- [02-01]: Three WASM calls per STATE_UPDATE acceptable — all off main thread in Worker, each in try/catch for graceful fallback
- [02-01]: createMemo (not plain function) for inboxCapStatus/taskCapStatus — ensures SolidJS fine-grained reactive dependency tracking
- [02-01]: Periodic re-scoring every 10 minutes via setInterval in INIT handler — staleness drifts over time without user mutations
- [02-02]: Switch/Match used in PriorityBadge TierIcon instead of multiple Show blocks — only one tier is active at a time
- [02-02]: DELETE_INBOX_ITEM added as new command (auto-fix Rule 2) — discard action in cap modal requires it
- [02-02]: untrack() wraps capExceeded clearing logic in STATE_UPDATE handler — reads intentionally non-reactive (one-shot check)
- [02-02]: Worker handlers return 'cap_exceeded' sentinel string rather than throwing — allows caller to distinguish cap rejection from errors
- [02-02]: CapEnforcementModal auto-closes via state.capExceeded=null in store on STATE_UPDATE when count drops below cap
- [02-03]: ARCHIVE_ATOM reused as UPDATE_ATOM with status='archived' — no new command needed (existing UPDATE_ATOM handles arbitrary field updates)
- [02-03]: MERGE_ATOMS de-duplicates links via Set spread: [...new Set([...target.links, ...source.links])]
- [02-03]: Merge appends source content to target with '\n\n---\nMerged from:' separator before deleting source
- [02-03]: Review tab badge shows live compressionCandidates.length — badge hidden when count is zero

### Pending Todos

None.

### Blockers/Concerns

- [Phase 2]: Priority scoring formula weights need calibration after real usage data — starting constants reasonable but unvalidated
- [Phase 3]: `@solidjs/router` version 0.15.4 verified at install (research said 0.14.x, actual was 0.15.x — API compatible)
- [Build]: pnpm build:wasm requires LIB env var set to MSVC + Windows SDK paths on Windows; see .planning/phases/01-foundation/01-01-SUMMARY.md User Setup section

## Session Continuity

Last session: 2026-02-22
Stopped at: Phase 3 context gathered
Resume file: .planning/phases/03-pages-navigation-and-search/03-CONTEXT.md
