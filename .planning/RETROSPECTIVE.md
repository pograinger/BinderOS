# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — Foundation

**Shipped:** 2026-02-22
**Phases:** 3 | **Plans:** 11

### What Was Built
- Five atomic types with full CRUD, Zod validation, IndexedDB persistence
- Rust/WASM compute engine with staleness decay, priority scoring, entropy health
- 5 query-based pages, search overlay, command palette, keyboard nav, tags, backlinks, saved filters

### What Worked
- WASM compute engine kept scoring off main thread from the start
- Dexie.js abstraction made IndexedDB manageable with typed queries
- SolidJS signals made fine-grained reactivity natural for atom state

### Patterns Established
- Worker-based architecture: main thread UI, BinderCore worker for mutations
- Pure module pattern: computation modules import no store, all state passed by caller
- Advisory-first enforcement: soft warnings before hard blocks

### Key Lessons
1. Zod validation at the boundary catches type drift early — worth the upfront cost
2. Rust/WASM for scoring was the right abstraction — petgraph handles graph traversal efficiently

---

## Milestone: v2.0 — AI Orchestration

**Shipped:** 2026-03-03
**Phases:** 4 | **Plans:** 14 | **Commits:** 29 feat commits
**Timeline:** 9 days (2026-02-22 to 2026-03-02)

### What Was Built
- Pluggable AI adapter system (NoOp, Browser/WebLLM, Cloud/Anthropic) with WebGPU detection
- Floating orb with 5-state machine and context-aware GTD radial menu
- AI-powered inbox triage with suggestions, entropy reasoning, and related atoms
- Weekly review briefing with AI-generated entropy analysis
- Full GTD guided review flow (Get Clear / Get Current / Get Creative)
- Compression coach with per-candidate AI explanations and staging area
- 3-Ring Binder tiered AI pipeline (deterministic, ONNX centroid, LLM escalation)
- AI mutation tracking with source/aiRequestId in changelog, fully reversible

### What Worked
- Pure module pattern continued to pay off: triage.ts, compression.ts, analysis.ts, review-flow.ts all import no store
- Dynamic imports for adapter activation kept bundle size manageable and avoided circular deps
- Sequential triage processing with AbortController prevented rate limits and enabled clean cancellation
- Single batched prompt for compression candidates = one approval modal (avoids approval fatigue)
- Ephemeral module-level signals for review/staging state prevented worker reconcile conflicts
- Phase 8 (tiered pipeline) fit naturally because the adapter pattern was already established

### What Was Inefficient
- SmolLM2 (Transformers.js) was built in Phase 4 then replaced by WebLLM in Phase 6 — could have started with WebLLM
- AIUX-03 and AIUX-04 were left unchecked in REQUIREMENTS.md despite being verified — bookkeeping drift
- Store.ts grew to 1500+ lines as orchestration hub — may need splitting in v3.0
- Settings panel shipped functional but "ugly" per UAT — UX polish deferred creates friction for testers
- Phase 5 ROADMAP.md still showed "3/4 plans" and unchecked boxes despite completion — state sync gap

### Patterns Established
- AI adapter interface: `execute(request: AIRequest): Promise<AIResponse>` — all providers implement this
- Privacy boundary: AIRequest.prompt is always string, never raw Atom data
- Staged mutations: AI proposes → staging area → user approves → mutation pipeline → changelog
- Tiered pipeline: Tier 1 (deterministic) → Tier 2 (ONNX/embedding) → Tier 3 (LLM) with escalation
- Pre-send approval: CloudRequestPreview modal for every cloud request
- Classification log: Dexie config table for pattern learning across sessions

### Key Lessons
1. Start with the right abstraction (WebLLM) instead of the simplest one (Transformers.js) when you know the target architecture
2. Ephemeral signals outside BinderState are the right pattern for UI-only transient state (review flow, staging)
3. Bookkeeping (REQUIREMENTS.md checkboxes, ROADMAP.md plan checkboxes) drifts when execution moves fast — needs automation or per-plan checklist
4. The adapter pattern makes adding new AI capabilities (tiered pipeline) frictionless — Phase 8 slotted in cleanly
5. AI trust model (propose → stage → approve) works — never auto-apply, always let the user decide

### Cost Observations
- Model mix: Primarily Opus for planning/execution, Sonnet for verification/integration checks
- Sessions: ~14 sessions across 9 days
- Notable: Average plan execution ~10 min — fast because pure modules are self-contained and testable in isolation

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 3 | 11 | Established worker architecture + pure module pattern |
| v2.0 | 4 | 14 | Added AI adapter abstraction + tiered pipeline + staged mutations |

### Top Lessons (Verified Across Milestones)

1. Pure modules with no store imports scale well — confirmed in both v1.0 (scoring) and v2.0 (AI pipeline)
2. Worker isolation prevents coupling — BinderCore worker, LLM worker, embedding worker all run independently
3. Advisory-first patterns build trust — soft caps in v1.0, staged AI mutations in v2.0
