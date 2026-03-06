# Milestones

## v3.0 Local AI + Polish (Shipped: 2026-03-05)

**Phases completed:** 3 phases (9-11), 8 plans
**Timeline:** 2 days (2026-03-03 → 2026-03-04)
**Scope:** 68 files changed, +10,278 / -1,634 lines (28,169 LOC total)
**Requirements:** 18/18 satisfied (3 ROUTE deferred to v3.x)
**Audit:** gaps_found (stale — gaps were Phase 11 pre-execution; all resolved)
**Git range:** 26006ee..3183117

**Delivered:** Full offline GTD intelligence via fine-tuned ONNX classifiers, Python training pipeline for model reproduction, and v2.0 tech debt cleanup — cloud LLM becomes optional quality boost, not a dependency.

**Key accomplishments:**
- Python training pipeline: synthetic data generation via Claude Haiku, MiniLM embedding, MLP classifier with Platt calibration, ONNX export
- Browser-runtime ONNX validation harness ensuring >95% top-1 parity with Python inference
- Fully offline atom type classification via ONNX model in embedding worker (Tier 2 upgraded from centroid matching)
- Classifier download progress indicator, Cache API persistence, ambiguous two-button classification UX
- Correction export utility for retraining cycles, model info card in settings panel
- Tech debt cleanup: StatusBar simplified, AIOrb cleaned, isReadOnly enforced, review resume toast added

---

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
