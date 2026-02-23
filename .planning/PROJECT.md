# BinderOS

## What This Is

A local-first, browser-based personal information management system built on information theory principles. BinderOS treats your life data as a compressible model — structured atoms (tasks, facts, events, decisions, insights) organized into a 3-ring binder metaphor with sections, pages, and entropy management. Open-source, self-hostable, designed for people who want a "thinking surface" for their life, not another dumping ground.

## Core Value

Every piece of stored information must encode predictive value about your future actions, decisions, or understanding — if it doesn't change behavior, it's noise, and the system actively manages this boundary.

## Current State

**v1.0 shipped** (2026-02-22) — Full MVP with:
- Five typed atoms (Task, Fact, Event, Decision, Insight) with Zod-validated schema
- IndexedDB persistence with CRDT-compatible changelog and JSON/Markdown export
- Rust/WASM compute engine: priority scoring, staleness decay, entropy health
- Advisory-first caps: inbox (20) and task (30) with soft warnings and hard blocks
- Query-based pages: Today, This Week, Active Projects, Waiting, Insights
- Full-text search (MiniSearch + ONNX semantic embeddings) with blended ranking
- Command palette, keyboard navigation, shortcut reference
- Tags, backlinks, @mention inline linking, saved filters
- 45/45 requirements complete, 23/23 UAT tests passed

## Next Milestone Goals

v2.0 candidates (not yet prioritized):
- **PARA section views** — Full Projects, Areas, Resources, Archive page experiences
- **AI orchestration** — Pluggable AI layer for prioritization, compression, and suggestions
- **IronCalc embedded spreadsheets** — Rich computational content within atoms
- **CRDT sync** — P2P multi-device sync with E2E encryption
- **Mobile optimization** — Touch-first responsive experience
- **Data encryption** — Encrypt IndexedDB at rest

## Constraints

- **Browser-only**: Must run entirely in the browser — no server, no native dependencies
- **Local-first**: All data stored in IndexedDB/OPFS, never leaves the device unless user opts into sync
- **WASM-first performance**: Heavy compute runs in WASM modules
- **Pluggable AI**: AI layer is an interface — no hard dependency on any specific LLM provider
- **Open-source**: MIT license, self-hostable, community-adaptable
- **No schema drift**: Schema evolution only via explicit migrations

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| SolidJS for UI framework | Lightweight (7KB), signals-based reactivity, TypeScript-first, fine-grained updates | Validated v1.0 |
| IndexedDB/OPFS for storage | Browser-native, local-first, no server dependency | Validated v1.0 |
| Five atom types only | Forces classification, prevents free-form dumping | Validated v1.0 |
| Priority as computed function | Avoids stale static labels, reflects real-time state | Validated v1.0 |
| Rust/WASM for scoring | Off main thread, performant, type-safe | Validated v1.0 |
| Advisory-first cap enforcement | Soft warnings before hard blocks, user stays in control | Validated v1.0 |
| IronCalc for embedded spreadsheets | Rust→WASM, high-performance embedded content | Pending v2.0 |
| IndexedDB + in-memory graph | Dexie.js for persistence, Rust petgraph for traversal | Validated v1.0 |

---
*Last updated: 2026-02-22 — v1.0 shipped*
