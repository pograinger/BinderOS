# BinderOS

## What This Is

A local-first, browser-based personal information management system built on information theory principles. BinderOS treats your life data as a compressible model — structured atoms (tasks, facts, events, decisions, insights) organized into a 3-ring binder metaphor with sections, pages, and entropy management. AI orchestrates knowledge and surfaces suggestions while the user stays in the driver's seat. Open-source, self-hostable, designed for people who want a "thinking surface" for their life, not another dumping ground.

## Core Value

Every piece of stored information must encode predictive value about your future actions, decisions, or understanding — if it doesn't change behavior, it's noise, and the system actively manages this boundary.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

(None yet — ship to validate)

### Active

- [ ] Atom system — five atomic types (Task, Fact, Event, Decision, Insight) with ID, type, timestamps, links, status, and priority score
- [ ] Section structure — stable low-entropy scaffolding (Projects, Areas, Resources, Archive) that rarely changes
- [ ] Page system — contextual views (Today, This Week, Active Projects, Waiting, Insights) as queries over atoms, not separate storage
- [ ] Inbox with hard cap — forces classification, scheduling, or discard; no infinite accumulation
- [ ] Staleness decay — relevance scores decay over time unless items are touched, linked to active items, or pinned
- [ ] Open task cap — maximum active tasks enforced; adding beyond cap requires replacing, scheduling, or merging
- [ ] Entropy health indicator — green/yellow/red system health showing open loops, stale data, and budget status
- [ ] Compression prompts — system surfaces candidates for summarization, archiving, or deletion
- [ ] Link density tracking — items with many links are core; zero-link stale items are entropy candidates
- [ ] Structured input — every item must be typed (no free-form dumping without classification)
- [ ] Change logging — all mutations are local, logged, and reversible
- [ ] Pluggable AI layer — abstract AI interface that users can connect to cloud APIs, local LLMs, or disable entirely
- [ ] AI orchestration — AI facilitates prioritization, summarization, compression suggestions, and life management while keeping user in control
- [ ] Rich embedded content — support for WASM-powered content types (e.g., IronCalc spreadsheets) embedded within atoms
- [ ] Local-first storage — IndexedDB/OPFS with typed schema enforcement, no server required
- [ ] Dynamic priority scoring — computed function of deadline, importance, recency, dependencies, energy required (not static labels)

### Out of Scope

- Mobile native app — web-first, mobile later
- Real-time collaboration — this is a personal tool
- Cloud-hosted SaaS — local-first, self-hosted only
- Account/auth system — no user accounts needed for v1 (single-user local)
- Daily/weekly ritual automation — defer to post-MVP (compression prompts are in, automated rituals are not)
- Rich dashboard views — defer to post-MVP (basic views first)

## Context

**The problem:** Existing chatbot-based life management tools create chaos. They lack structured, trustworthy storage for life data that AI can reason over. The "claude-bot" approaches dump unstructured content without the invariants needed for a reliable personal system. People need to trust how the facts of their life are stored and protected.

**The insight:** Just as GSD (get-shit-done) catalogs project state for code — structured, compressed, queryable — BinderOS does the same for life. The binder is a compressed model of your life's event stream, not an attempt to store everything.

**Information theory foundations:**
- Signal over noise: every stored item must encode predictive value
- Compression as health metric: good state = short, high-fidelity summaries
- Invariants as anchors: stable section structure prevents system destabilization
- Event log vs state: store the model that matters, not the raw stream
- Entropy budget: hard caps on open loops and unstructured content

**Architecture model:**
- Three layers: Sections (stable) → Pages (views/queries) → Atoms (minimal info units)
- Five atom types: Task, Fact, Event, Decision, Insight
- Each atom: ID, type, created_at, updated_at, links, status, priority/relevance score
- Pages are queries + layout, never separate data silos

**UI vision:** Command-center feel ("Tony Stark / Star Trek") — rich dashboards and multi-modal elements that let the user control their life with ease, but get out of the way when unnecessary. Binder metaphor: left sidebar (sections), top tabs (pages), main pane (atom list + detail).

## Constraints

- **Browser-only**: Must run entirely in the browser — no server, no native dependencies
- **Local-first**: All data stored in IndexedDB/OPFS, never leaves the device unless user opts into sync
- **WASM-first performance**: Heavy compute (priority scoring, entropy metrics, embedded content) runs in WASM modules
- **Minimal JS**: Prefer Rust→WASM for core logic; JS/TypeScript only for UI layer and glue
- **Pluggable AI**: AI layer is an interface — no hard dependency on any specific LLM provider
- **Open-source**: MIT or similar license, self-hostable, community-adaptable
- **No schema drift**: Schema evolution only via explicit migrations, not ad-hoc fields

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| SolidJS for UI framework | Lightweight (7KB), signals-based reactivity plays well with WASM state, TypeScript-first, less ceremony than React, fine-grained updates avoid unnecessary re-renders on WASM↔UI bridges | — Pending |
| IronCalc for embedded spreadsheets | Rust→WASM, high-performance, enables rich computational content embedded in atoms | — Pending |
| IndexedDB/OPFS for storage | Browser-native, local-first, no server dependency, structured data support | — Pending |
| Five atom types only | Task, Fact, Event, Decision, Insight cover the full "information alphabet" — forces classification, prevents free-form dumping | — Pending |
| Priority as computed function | `P = f(deadline, importance, recency, dependencies, energy)` avoids stale static labels, reflects real-time life state | — Pending |

---
*Last updated: 2026-02-21 after initialization*
