# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-21)

**Core value:** Every piece of stored information must encode predictive value about future actions, decisions, or understanding — if it doesn't change behavior, it's noise, and the system actively manages this boundary.
**Current focus:** Phase 1 — Foundation

## Current Position

Phase: 1 of 3 (Foundation)
Plan: 3 of 4 in current phase
Status: In progress
Last activity: 2026-02-22 — Plan 01-03 complete: Worker handlers + binder UI shell

Progress: [████░░░░░░] 38% (3/8 plans complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 3
- Average duration: 23 min
- Total execution time: 70 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Foundation | 3/4 | 70 min | 23 min |

**Recent Trend:**
- Last 5 plans: 54 min, 7 min, 9 min
- Trend: accelerating (handler + UI plan fast due to established patterns)

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

### Pending Todos

None.

### Blockers/Concerns

- [Phase 2]: Priority scoring formula weights (P = f(deadline, importance, recency, dependencies, energy)) need calibration — start with simple constants, adjust after user feedback
- [Phase 2]: Staleness decay curve half-life default values are undefined — use configurable exponential decay, tune after real usage data
- [Phase 3]: `@solidjs/router` version 0.15.4 verified at install (research said 0.14.x, actual was 0.15.x — API compatible)
- [Build]: pnpm build:wasm requires LIB env var set to MSVC + Windows SDK paths on Windows; see .planning/phases/01-foundation/01-01-SUMMARY.md User Setup section

## Session Continuity

Last session: 2026-02-22
Stopped at: Completed 01-03-PLAN.md — Worker handlers + binder UI shell
Resume file: None
