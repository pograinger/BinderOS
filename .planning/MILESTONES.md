# Milestones

## v1.0 Foundation (Shipped: 2026-02-22)

**Phases completed:** 3 phases (1-3), 11 plans
**Delivered:** Typed atoms, IndexedDB persistence, WASM compute engine, 5 page views, search, command palette, tags, backlinks, saved filters

**Key accomplishments:**
- Five atomic types (task, fact, event, decision, insight) with full CRUD and Zod validation
- Rust/WASM scoring engine with staleness decay, priority scoring, entropy health
- 5 query-based pages: Today, This Week, Active Projects, Waiting, Insights
- Search overlay, command palette, keyboard nav, tags, backlinks, saved filters

---

## v2.0 AI Orchestration (Shipped: 2026-03-03)

**Phases completed:** 4 phases (4-7), 14 plans
**Timeline:** 9 days (2026-02-22 → 2026-03-02)
**Scope:** 113 files changed, +23,262 lines, 106 TS/TSX files (~19,680 LOC total)
**Requirements:** 30/30 satisfied
**Audit:** tech_debt (no blockers, 12 non-critical items)
**Git range:** ce3ad25..603dd83

**Delivered:** AI-powered GTD review cycles with tiered LLM infrastructure, floating orb interaction, conversational question flows, and compression coaching — all privacy-first with explicit user approval.

**Key accomplishments:**
- Pluggable AI adapter system with NoOp, Browser (WebLLM/WebGPU), and Cloud (Anthropic) providers
- Floating orb with context-aware 5-action GTD radial menu on every page
- AI-powered inbox triage with type/section suggestions, entropy reasoning, and related atoms
- Weekly review briefing with AI-generated entropy analysis (stale tasks, orphaned projects, compression candidates)
- Full GTD guided review flow (Get Clear / Get Current / Get Creative) via conversational question cards
- Compression coach with per-candidate AI explanations and staging area for approve/reject
- 3-Ring Binder tiered AI pipeline (Tier 1 deterministic → Tier 2 ONNX centroid → Tier 3 LLM escalation)
- All AI mutations tracked with `source: 'ai'` in changelog, fully reversible via undo

---
