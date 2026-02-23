# BinderOS

## What This Is

A local-first, browser-based personal information management system built on information theory principles. BinderOS treats your life data as a compressible model — structured atoms (tasks, facts, events, decisions, insights) organized into a 3-ring binder metaphor with sections, pages, and entropy management. AI orchestrates knowledge reviews and surfaces insights while the user stays in the driver's seat. Open-source, self-hostable, designed for people who want a "thinking surface" for their life, not another dumping ground.

## Core Value

Every piece of stored information must encode predictive value about your future actions, decisions, or understanding — if it doesn't change behavior, it's noise, and the system actively manages this boundary.

## Current Milestone: v2.0 AI Orchestration

**Goal:** Make GTD review cycles effortless through AI-powered triage, guided reviews, and proactive suggestions — all accessible via a floating orb with conversational question flows.

**Target features:**
- Tiered LLM infrastructure: small WASM model for fast tasks + cloud API for conversations/reviews
- Floating orb: always-available, context-aware AI trigger with GTD menu
- Conversational AI UX: GSD-style question flows (3-4 options + freeform) for all AI interactions
- AI-powered GTD reviews: guided weekly review, smart inbox triage, proactive suggestions
- Smart triage: AI suggests type, section, priority, related atoms when classifying inbox items
- Compression coach: AI identifies stale/redundant atoms with explanations, surfaced during reviews
- Additive AI mutations: AI suggestions tagged, visually distinct, non-destructive, reversible via changelog

## Requirements

### Validated

<!-- Shipped and confirmed valuable in v1.0. -->

- Atom system — five atomic types with full CRUD, Zod validation, IndexedDB persistence (v1.0)
- Section structure — stable PARA scaffolding (v1.0)
- Page system — query-based views: Today, This Week, Active Projects, Waiting, Insights (v1.0)
- Inbox with hard cap — classification required, advisory-first enforcement (v1.0)
- Entropy engine — staleness decay, priority scoring, health indicator, compression prompts (v1.0)
- Full navigation — search, command palette, keyboard nav, tags, backlinks, saved filters (v1.0)
- Trust & safety — offline-only, export, changelog, undo, persistent storage (v1.0)

### Active

<!-- v2.0 scope — AI orchestration. -->

- [ ] Tiered LLM infrastructure — small browser WASM model + pluggable cloud API escalation
- [ ] Floating orb — context-aware AI trigger available on every view, with GTD action menu
- [ ] Conversational AI UX — question-flow interaction pattern (3-4 options + freeform input)
- [ ] AI-powered GTD reviews — guided weekly/daily review cycles with AI insights
- [ ] Smart inbox triage — AI suggests classification, priority, section, related atoms
- [ ] Compression coach — AI identifies and explains stale/redundant atoms during reviews
- [ ] Additive AI mutations — AI suggestions tagged as AI-generated, destructive changes require approval
- [ ] AI mutation tracking — changelog extended with source field, AI changes reversible

### Out of Scope

- PARA section views — full section-specific experiences (deferred to v3.0)
- CRDT sync — P2P multi-device sync (deferred to v3.0+)
- Data encryption at rest — IndexedDB encryption (deferred to v3.0+)
- Mobile optimization — touch-first responsive experience (deferred to v3.0+)
- IronCalc spreadsheets — embedded computational content (deferred to v3.0+)
- AI-generated content — AI proposes, never authors; auto-generated atoms undermine trust
- Autonomous AI actions — AI never modifies/deletes atoms without user approval for destructive changes

## Context

**v1.0 shipped** (2026-02-22) — 45/45 requirements, 23/23 UAT tests, 3 phases, 11 plans.

**The AI opportunity:** v1.0's entropy engine (staleness decay, compression candidates, caps) provides the signal. v2.0 adds intelligence that acts on that signal — AI reads the entropy state and helps the user maintain low-entropy through guided reviews instead of manual triage.

**GTD review friction:** The weekly review is where most GTD practitioners fall off. By making reviews conversational (question-flow UX) and AI-assisted (pre-analyzed suggestions), BinderOS can make the review the most valuable 10 minutes of the week instead of a dreaded chore.

**Browser LLM landscape:** Small language models (Phi-3-mini, TinyLlama, SmolLM) can run in-browser via WASM/WebGPU. Good enough for classification, tagging, and routing. Conversational reviews and nuanced reasoning escalate to cloud APIs.

**Floating orb interaction model:** Always-present, context-aware entry point. Reads current page/atom state, offers relevant AI-powered action at top, GTD menu below. Modeled on the GSD AskUserQuestion pattern that the user finds highly effective.

## Constraints

- **Browser-only**: Must run entirely in the browser — no server, no native dependencies
- **Local-first**: All data stored in IndexedDB/OPFS, never leaves the device unless user opts into AI cloud APIs
- **WASM-first performance**: Heavy compute (scoring, LLM inference) runs in WASM modules off main thread
- **Pluggable AI**: Abstract AI interface — user can connect cloud APIs, use browser LLM, or disable entirely
- **Explicit AI opt-in**: Any data sent to external AI services requires explicit user consent
- **AI as advisor**: AI never writes atoms directly — only proposes; user explicitly accepts
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
| IndexedDB + in-memory graph | Dexie.js for persistence, Rust petgraph for traversal | Validated v1.0 |
| Tiered LLM (browser + cloud) | Small WASM model for fast tasks, cloud API for complex reasoning | — Pending v2.0 |
| GSD-style question flows for AI UX | User validated this pattern through GSD usage; 3-4 options + freeform is effective | — Pending v2.0 |
| Additive AI mutations with changelog tracking | AI adds suggestions (tagged), destructive changes need approval, everything reversible | — Pending v2.0 |
| Floating orb as AI entry point | Context-aware + GTD menu, always available, non-intrusive | — Pending v2.0 |

---
*Last updated: 2026-02-22 — v2.0 milestone started*
