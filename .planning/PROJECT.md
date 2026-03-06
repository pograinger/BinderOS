# BinderOS

## What This Is

A local-first, browser-based personal information management system built on information theory principles. BinderOS treats your life data as a compressible model — structured atoms (tasks, facts, events, decisions, insights) organized into a 3-ring binder metaphor with sections, pages, and entropy management. AI orchestrates knowledge reviews through a floating orb with conversational question flows, tiered ML inference (fully offline via ONNX classifiers), and a compression coach — while the user stays in the driver's seat. Open-source, self-hostable, designed for people who want a "thinking surface" for their life, not another dumping ground.

## Core Value

Every piece of stored information must encode predictive value about your future actions, decisions, or understanding — if it doesn't change behavior, it's noise, and the system actively manages this boundary.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- Atom system — five atomic types with full CRUD, Zod validation, IndexedDB persistence (v1.0)
- Section structure — stable PARA scaffolding (v1.0)
- Page system — query-based views: Today, This Week, Active Projects, Waiting, Insights (v1.0)
- Inbox with hard cap — classification required, advisory-first enforcement (v1.0)
- Entropy engine — staleness decay, priority scoring, health indicator, compression prompts (v1.0)
- Full navigation — search, command palette, keyboard nav, tags, backlinks, saved filters (v1.0)
- Trust & safety — offline-only, export, changelog, undo, persistent storage (v1.0)
- Tiered LLM infrastructure — pluggable adapters (NoOp, Browser/WebLLM, Cloud/Anthropic) with WebGPU detection and offline degradation (v2.0)
- Floating orb — context-aware AI trigger on every view with 5-action GTD radial menu (v2.0)
- Conversational AI UX — AIQuestionFlow + ConversationTurnCard: structured options + freeform input (v2.0)
- AI-powered GTD reviews — guided weekly review (Get Clear / Get Current / Get Creative) with AI briefings (v2.0)
- Smart inbox triage — AI suggests type, section with entropy-informed reasoning and related atoms (v2.0)
- Compression coach — AI explains staleness per candidate with contextual signals, staged for approval (v2.0)
- Additive AI mutations — AI suggestions tagged with `source: 'ai'`, staged in approval area, fully reversible (v2.0)
- AI mutation tracking — changelog extended with source/aiRequestId fields, undo system works unchanged (v2.0)
- Reproducible training pipeline — synthetic data generation, MiniLM embedding, MLP training, ONNX export via `scripts/train/` (v3.0)
- Fully offline type classification — fine-tuned ONNX classifier in embedding worker replaces centroid matching (v3.0)
- Calibrated confidence — Platt-scaled ONNX probabilities drive correct Tier 2→3 escalation and ambiguous two-button UX (v3.0)
- Classification correction export — JSONL export for retraining with synthetic corpus preserved as floor (v3.0)
- Model lifecycle UX — download progress, Cache API persistence, model info in settings, correction count (v3.0)
- Tech debt cleanup — StatusBar simplified, AIOrb cleaned, isReadOnly enforced, review resume toast (v3.0)

### Active

<!-- Next milestone scope TBD -->

- Section routing offline via embedding nearest-neighbor (deferred from v3.0)
- PARA section views — full section-specific experiences
- Advanced classifiers — staleness score, compression candidate, priority prediction models

### Out of Scope

- CRDT sync — P2P multi-device sync (deferred to future)
- Data encryption at rest — IndexedDB encryption (deferred to future)
- Mobile optimization — touch-first responsive experience (deferred to future)
- IronCalc spreadsheets — embedded computational content (deferred to future)
- AI-generated content — AI proposes, never authors; auto-generated atoms undermine trust
- Autonomous AI actions — AI never modifies/deletes atoms without user approval for destructive changes
- In-browser model retraining — ONNX Runtime Web is inference-only; use Python offline pipeline
- Per-user personalized models — privacy surface too large without backend

## Context

**v1.0 shipped** (2026-02-22) — 45/45 requirements, 23/23 UAT tests, 3 phases, 11 plans.

**v2.0 shipped** (2026-03-03) — 30/30 requirements, 4 phases, 14 plans, 9 days. AI orchestration layer with tiered LLM inference, floating orb, guided reviews, compression coaching, and staged mutation approval.

**v3.0 shipped** (2026-03-05) — 18/18 requirements, 3 phases, 8 plans, 2 days. Fine-tuned ONNX classifiers replace centroid matching for full offline GTD intelligence. Python training pipeline for model reproduction. Tech debt cleanup from v2.0.

**Architecture:** 28,169 LOC across TS/TSX/Python/CSS. 3 workers (BinderCore, LLM/WebLLM, Embedding/MiniLM+ONNX), 3 AI adapters, tiered pipeline (Tier 1 deterministic → Tier 2 ONNX classifier → Tier 3 LLM), review state machine, Cache API model persistence.

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
| Tiered LLM (browser + cloud) | Small WASM model for fast tasks, cloud API for complex reasoning | Validated v2.0 |
| GSD-style question flows for AI UX | 3-4 options + freeform is effective interaction pattern | Validated v2.0 |
| Additive AI mutations with changelog tracking | AI adds suggestions (tagged), destructive changes need approval, everything reversible | Validated v2.0 |
| Floating orb as AI entry point | Context-aware + GTD menu, always available, non-intrusive | Validated v2.0 |
| Dedicated LLM worker separate from BinderCore | Prevents OOM crashes and unblocks atom mutations during inference | Validated v2.0 |
| 3-Ring Binder tiered pipeline | Tier 1 deterministic → Tier 2 ONNX → Tier 3 LLM escalation | Validated v2.0/v3.0 |
| Fine-tuned ONNX for Tier 2 | Real ML classifiers replace centroid matching, full offline capability | Validated v3.0 |
| Synthetic-then-curated training pipeline | Bootstrap labeled data from cloud LLM, refine with curated examples | Validated v3.0 |
| 0.78 confidence threshold for ONNX | Platt-calibrated; balances Tier 2 accuracy vs Tier 3 escalation rate | Validated v3.0 |
| Cache API for model persistence | Browser-native, survives IndexedDB clears, one-time download UX | Validated v3.0 |

---
*Last updated: 2026-03-05 — after v3.0 milestone completion*
