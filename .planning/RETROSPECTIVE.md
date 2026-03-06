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

## Milestone: v3.0 — Local AI + Polish

**Shipped:** 2026-03-05
**Phases:** 3 | **Plans:** 8 | **Commits:** 47
**Timeline:** 2 days (2026-03-03 to 2026-03-04)

### What Was Built
- Python training pipeline: synthetic data generation (Claude Haiku), MiniLM embedding, MLP classifier with Platt calibration, ONNX export
- Browser-runtime ONNX validation harness with >95% top-1 parity gate
- Fully offline atom type classification via fine-tuned ONNX model in embedding worker
- Classifier download progress indicator, Cache API persistence, ambiguous two-button classification UX
- Correction export utility for retraining, model info card in settings panel
- Tech debt cleanup: StatusBar simplified, AIOrb cleaned, isReadOnly enforced, review resume toast

### What Worked
- Placeholder ONNX strategy (random-weight model committed first) let Phase 10 browser wiring proceed independently of Phase 9 training
- Embedding worker reuse: MiniLM worker handles both search embeddings and ONNX classification without a second worker
- Cache API for model persistence was the right abstraction — survives IndexedDB clears, one-time download UX
- 0.78 confidence threshold calibrated via Platt scaling produced correct Tier 2→3 escalation rates
- Phase 11 tech debt cleanup was efficient — targeted items from v2.0 UAT were well-scoped

### What Was Inefficient
- Milestone audit ran before Phase 11 was executed, showing stale gaps — timing of audit should be after all phases complete
- Section routing (Phase 12) was planned, researched, then deferred — could have been excluded from initial roadmap
- Summary one-liners not populated in SUMMARY.md frontmatter — summary-extract returns null, requiring manual extraction

### Patterns Established
- ONNX opset 17 + zipmap=False as standard for browser-compatible ML models
- `CLASSIFY_ONNX` worker message pattern: send text, worker embeds + classifies in one step
- Platt-calibrated confidence thresholds stored in STATE.md as locked decisions
- createEffect (not onMount) for async-hydrated state from Dexie

### Key Lessons
1. Placeholder models are a powerful decoupling tool — validate worker wiring before real training completes
2. ONNX Runtime Web threading (SharedArrayBuffer) is fragile — `numThreads = 1` avoids COOP/COEP issues
3. Synthetic training data from Claude Haiku is cost-effective ($0.50-2.00 for full corpus) and quality is sufficient for 5-class classification
4. Milestone audits should run after all phases are executed, not mid-milestone
5. Summary one-liners should be explicitly written in SUMMARY.md frontmatter for automated extraction

### Cost Observations
- Model mix: Primarily Sonnet for execution (balanced profile), Opus for planning
- Sessions: ~6 sessions across 2 days
- Notable: Fastest milestone — 8 plans in 2 days. Python training scripts and ONNX wiring were well-scoped and self-contained.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Timeline | Key Change |
|-----------|--------|-------|----------|------------|
| v1.0 | 3 | 11 | — | Established worker architecture + pure module pattern |
| v2.0 | 4 | 14 | 9 days | Added AI adapter abstraction + tiered pipeline + staged mutations |
| v3.0 | 3 | 8 | 2 days | Upgraded Tier 2 to real ONNX classifiers + Python training pipeline |

### Top Lessons (Verified Across Milestones)

1. Pure modules with no store imports scale well — confirmed in v1.0 (scoring), v2.0 (AI pipeline), v3.0 (training scripts)
2. Worker isolation prevents coupling — BinderCore, LLM, Embedding workers all independent; v3.0 added ONNX to embedding worker cleanly
3. Advisory-first patterns build trust — soft caps in v1.0, staged AI mutations in v2.0, ambiguous two-button UX in v3.0
4. Placeholder/decoupling strategies pay off — v2.0 adapter pattern enabled v3.0 tiered upgrade; v3.0 placeholder ONNX enabled parallel development
5. Milestone velocity increases as architecture matures — v1.0 (11 plans), v2.0 (14 plans/9 days), v3.0 (8 plans/2 days)
