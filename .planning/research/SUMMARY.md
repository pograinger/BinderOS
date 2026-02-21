# Project Research Summary

**Project:** BinderOS
**Domain:** Local-first, browser-only personal information management (PIM) with Rust/WASM compute, information-theoretic entropy management, and pluggable AI
**Researched:** 2026-02-21
**Confidence:** MEDIUM-HIGH (stack and pitfalls HIGH; architecture and feature differentiators MEDIUM)

## Executive Summary

BinderOS is a fundamentally different PKM tool: it enforces information hygiene through hard caps, mandatory type classification, and staleness decay rather than allowing indefinite accumulation. The research confirms this thesis is technically viable and competitively distinct — no existing tool (Notion, Obsidian, Tana, Capacities) enforces caps, computes priority as a decay function, or surfaces entropy as a first-class health metric. The recommended build approach is a layered architecture: Rust/WASM compute engine for scoring and validation, a Web Worker bridge to keep compute off the main thread, Dexie.js/IndexedDB as the persistent atom store, and SolidJS for fine-grained reactive UI. The toolchain is modern but requires care: wasm-pack is dead (archived July 2025) and must be replaced with a three-step cargo/wasm-bindgen-cli/wasm-opt pipeline.

The biggest technical risk is not performance — it is browser storage durability. Safari's ITP will silently delete all user data after 7 days of inactivity without `navigator.storage.persist()`. This is a trust-destroying failure for a personal information system and must be addressed in Phase 1, not deferred. The second major risk is product risk: the entropy management system that makes BinderOS valuable (hard caps, decay scoring, compression prompts) is precisely what can make users feel punished and anxious rather than supported. The implementation must treat every enforcement mechanism as advisory-first, with soft warnings before hard blocks, forgiving decay curves for new users, and deferrable compression prompts. Getting this UX balance wrong kills the product regardless of technical quality.

IronCalc embedded spreadsheets and WebLLM in-browser AI are compelling differentiators but both carry meaningful uncertainty: IronCalc is pre-v1 with an incomplete feature set, and WebGPU-based AI is unavailable in Firefox and on most mobile. Both should be built behind the pluggable interfaces already planned (AI provider interface, on-demand WASM loading) and deferred to post-MVP validation phases. The MVP validation goal is singular and clear: prove that a system that forces you to throw things away is more useful than one that lets you keep everything.

## Key Findings

### Recommended Stack

The stack is SolidJS 1.9.x for the UI (fine-grained signal reactivity is critical at the WASM↔UI boundary — React's VDOM reconciler adds overhead that compounds with WASM state changes), Rust/WASM for compute-intensive logic (priority scoring, staleness decay, atom validation, link graph), and Dexie.js 4.0.x over IndexedDB for structured persistence. All WASM operations must live in a dedicated Web Worker to keep the main thread free for UI rendering. The three-step WASM build pipeline is cargo → wasm-bindgen-cli → wasm-opt; wasm-pack must not be used (archived July 2025). IronCalc 0.7.x is the planned embedded spreadsheet engine but is explicitly early-stage and should be loaded on demand, not bundled at startup.

**Core technologies:**
- **SolidJS 1.9.x**: UI framework — fine-grained signal reactivity with 7KB runtime; zero VDOM overhead at WASM state boundary; v2.0 is in development but not production-ready
- **Rust + wasm-bindgen 0.2.109**: WASM core — priority scoring, entropy engine, validation, mutation log; serde-wasm-bindgen for efficient boundary serialization (3-10x faster than JSON)
- **Dexie.js 4.0.x + solid-dexie**: IndexedDB persistence — schema versioning, typed queries, reactive live queries bridged to SolidJS signals
- **Zod 4.x**: Runtime schema validation — validates all atom mutations before they touch IndexedDB; single schema generates TS types and runtime validators
- **Vite 7.3.x + vite-plugin-wasm + vite-plugin-top-level-await**: Build toolchain — required plugin trio for ESM-compatible WASM loading
- **@solidjs/router 0.14.x**: Client-side routing — pure SPA mode, no server required
- **@mlc-ai/web-llm 0.2.x (optional)**: In-browser LLM — WebGPU-accelerated, plugged in as one implementation of the AI provider interface
- **@ironcalc/wasm 0.7.x (deferred)**: Embedded spreadsheets — Rust-native, load on demand only; treat as post-MVP differentiator

See `.planning/research/STACK.md` for full version matrix, build pipeline details, and alternatives considered.

### Expected Features

The PKM market has converged on two failure modes: accumulation tools (users add indefinitely, nothing gets removed) and over-engineered systems (too much friction, abandoned in 30 days). BinderOS's information-theory framing directly attacks failure mode #1. The MVP must validate that enforced caps and structured classification are liberating, not punishing.

**Must have — table stakes (v1):**
- Fast capture via global hotkey — frictionless entry is non-negotiable; users abandon tools that require navigation to capture
- Five typed atoms (Task, Fact, Event, Decision, Insight) with mandatory classification — the foundational differentiator; must be non-bypassable
- Inbox with hard cap — validates the cap mechanic; if users hate it, the thesis is wrong (learn fast)
- Sections (Projects, Areas, Resources, Archive) and Pages as queries — structural scaffolding; pages must never store data
- Staleness decay with per-atom visual indicator — validates entropy management thesis
- Entropy health indicator (green/yellow/red, always visible) — this IS the product's core concept made visible
- Computed priority scoring (P = f(deadline, importance, recency, dependencies, energy)) — replaces static manual flags
- Full-text search across all atom types — if you can't find it, it doesn't exist
- Data export (JSON + Markdown) — trust requires users know they can leave; ship on day one
- Offline operation, change log / undo — trust and data safety are table stakes

**Should have — competitive differentiators (v1.x after validation):**
- Link density tracking and backlinks UI — add once organic linking behavior is established
- Compression ritual suggestions (non-AI first) — surface stale + zero-link atoms as a list; validate the ritual concept before adding AI complexity
- Full keyboard-driven navigation and command palette — polish once structure is stable
- Tags and advanced saved filters — add when section + type proves insufficient

**Defer (v2+):**
- AI orchestration (compression, prioritization suggestions) — requires stable data model and enough user data for AI to act on meaningfully
- IronCalc embedded spreadsheets — high implementation cost, unclear user demand; validate via interviews first
- CRDT-based P2P sync and multi-device support — design data model to allow it, don't ship it in v1
- Mobile web optimization — post-MVP; design data model with future CRDT sync in mind

**Anti-features to avoid explicitly:** Unlimited inbox, free-form untyped notes, real-time collaboration, managed cloud sync, daily notes/journal, plugin ecosystem, AI-generated atom content.

See `.planning/research/FEATURES.md` for full feature dependency graph, competitor analysis, and prioritization matrix.

### Architecture Approach

The system uses four distinct layers: a SolidJS presentation layer on the main thread that reads only from signal stores (never touches WASM directly), a Web Worker thread that owns all WASM compute and IndexedDB writes, a Storage layer (IndexedDB for structured atoms, OPFS for future binary blobs), and a pluggable AI Adapter layer that defaults to a no-op and must be explicitly enabled per-provider. All state flows unidirectionally: IndexedDB (source of truth) → WASM in-memory store (operational truth) → SolidJS signal store (UI projection). All writes flow through the Worker via typed command messages; the UI never calls IndexedDB or WASM directly.

**Major components:**
1. **SolidJS UI (main thread)** — renders from signals only; sends typed commands to Worker; ESLint SolidJS plugin mandatory to catch destructuring reactivity bugs
2. **Web Worker + WASM Bridge** — owns all WASM calls; owns all IndexedDB reads/writes; the only path for state mutation
3. **WASM Core (Rust)** — atom schema enforcement, validation, mutation log, link graph, priority scoring, entropy scoring; built as Cargo workspace; panic = abort in release builds
4. **IndexedDB / Dexie** — structured atom persistence with schema versioning; write-queue pattern mandatory (never one transaction per write)
5. **AI Adapter Layer** — TypeScript interface; no-op by default; OpenAI, WebLLM, and Ollama adapters as optional implementations; AI suggestions are proposals only, never auto-commits

**Key patterns:**
- Worker-Owned WASM, Signal-Projected UI (foundational — WASM never imported in `ui/` code)
- Command Pattern with Mutation Log (every atom write is a typed, logged command)
- Pages as Queries, Never Storage (pages define filter + sort rules; no atom data stored per-page)
- AI Adapter Interface (pluggable from day one; no-op is the default; hardcoding breaks users without that provider)

See `.planning/research/ARCHITECTURE.md` for full data flow diagrams, component boundaries, and build order.

### Critical Pitfalls

1. **Browser storage eviction (Safari ITP)** — call `navigator.storage.persist()` at first launch, display grant status in the entropy health indicator, and ship data export in Phase 1 (not Phase 3). Without this, Safari deletes all user data after 7 days of inactivity with no warning.

2. **IndexedDB transaction batching** — never open one transaction per write. All IndexedDB writes must go through a write queue with debounce (200-500ms). Per-write transactions cause 10-25x slowdowns; SolidJS fine-grained reactivity makes this easy to trigger accidentally.

3. **WASM panic poisoning** — compile with `panic = "abort"` in release builds; wrap all public WASM functions in `catch_unwind`. After a panic, the module is in undefined state and will return silently incorrect results. Treat a thrown WASM exception as a dead module — reload it.

4. **SolidJS destructuring kills reactivity** — never destructure props or store paths; always use `props.value` and `store.atoms.list`. This is a silent failure (no warnings, no errors) where components render correctly once but never update. Install the `eslint-plugin-solid` ruleset in Phase 1 before any component is written.

5. **Entropy system as guilt machine** — hard caps and decay scoring will make users feel punished if implemented strictly. Use soft warnings at 80% of cap, hard block with resolution UI at 100%, forgiving decay curves for new users (first 30 days), and deferrable compression prompts. Test the emotional experience with real usage before enforcing any cap.

See `.planning/research/PITFALLS.md` for the full pitfall inventory including performance traps, security mistakes, UX pitfalls, and the "looks done but isn't" checklist.

## Implications for Roadmap

Architecture research defines a strict dependency chain that the roadmap must follow. Violating this order causes rework. The suggested phase structure maps directly onto that chain, front-loading the foundation that all differentiating features depend on.

### Phase 1: Foundation — Storage, Types, and UI Shell

**Rationale:** Every BinderOS differentiator (typed atoms, scored priority, entropy health) depends on the atom schema and the Worker/WASM architecture being in place first. The storage pitfalls (Safari eviction, IndexedDB batching, OPFS worker requirement) must be solved before any data is stored — they cannot be retrofitted. SolidJS ESLint rules must be installed before any component is written. This phase has no prerequisites and many dependents.

**Delivers:** Typed atom schema (TypeScript + Zod), IndexedDB/Dexie storage with write-queue pattern, Web Worker bridge, SolidJS signal store, UI shell (sidebar, tab bar, main pane), `navigator.storage.persist()` flow, and data export. A working inbox where atoms can be created, classified, and persisted.

**Addresses (from FEATURES.md):** Five atom types, Sections structure, fast capture, offline operation, change log, data export, full-text search foundation

**Avoids (from PITFALLS.md):** Safari storage eviction, IndexedDB transaction batching, OPFS Worker requirement, SolidJS destructuring bugs, atom link orphan problem

**Research flag:** Standard patterns — SolidJS + Dexie + Worker setup is well-documented; no phase-level research needed

### Phase 2: Compute Engine — Priority, Entropy, and Decay

**Rationale:** Priority scoring and staleness decay are the thesis of BinderOS. They can only be built meaningfully after the atom schema is stable (Phase 1) — scoring meaningless data proves nothing. WASM panic safety must be established before the scoring engine is wired to the UI, because a poisoned WASM module silently corrupts all subsequent scores. The entropy UX (soft warnings before hard blocks) must be designed and tested here, not after launch.

**Delivers:** Rust WASM priority scorer (P = f(deadline, importance, recency, dependencies, energy)), staleness decay engine with configurable decay curve, entropy health indicator (green/yellow/red), inbox hard cap with soft-warning at 80% + resolution UI at 100%, open task cap, per-atom staleness visual indicator. Entropy health visible on every view.

**Addresses (from FEATURES.md):** Computed priority scoring, staleness decay, entropy health indicator, inbox cap, hard caps enforcement

**Avoids (from PITFALLS.md):** WASM panic poisoning (catch_unwind, panic = abort), JS↔WASM chatty call pattern (batch API), entropy guilt machine (soft warnings first, UX observation before enforcement), link density pre-computation

**Research flag:** Needs deeper research during planning — priority scoring formula parameters, staleness decay curve calibration, and WASM panic recovery patterns are complex; consider a research-phase before building

### Phase 3: Pages, Queries, and Navigation

**Rationale:** Pages as queries depend on the WASM Core query engine being stable (Phase 1) and priority scores being meaningful (Phase 2). Building pages before scoring is complete means the "Today" and "Priority Queue" pages would display inaccurate data, undermining user trust from day one. Full-text search, command palette, and keyboard navigation belong here as the navigation layer is completed.

**Delivers:** Pages as query definitions (Today, This Week, Active Projects, Waiting, Insights), full-text search across all atom types, command palette, keyboard-driven navigation, filter and sort controls on page views, backlinks UI, atomic linking from the UI.

**Addresses (from FEATURES.md):** Pages as queries (not storage), full-text search, keyboard navigation, command palette, atomic linking, filtering and sorting

**Avoids (from PITFALLS.md):** Storing atoms in page-specific state (each page is a query, never a data container), query performance traps (indexed queries via Dexie, not full-atom-tree traversal)

**Research flag:** Standard patterns for query architecture and keyboard navigation; no phase-level research needed

### Phase 4: Link Density and Compression Rituals

**Rationale:** Link density tracking and compression rituals require that users have established organic atom linking behavior (Phase 3 must be used, not just built). Compression suggestions without sufficient data are noise. The non-AI compression ritual (surface stale + zero-link atoms as a list) validates the ritual concept before adding AI complexity and cloud/privacy concerns. Tags and advanced saved filters belong here as the user base discovers what cross-cutting labels they actually need.

**Delivers:** Link density tracking (pre-computed per-atom link count as indexed field), link density sort on list views, compression ritual suggestions (non-AI: stale + zero-link atom list with archive/delete/keep options), link integrity consistency check on startup, tags, advanced filtering and saved filters on pages.

**Addresses (from FEATURES.md):** Link density signal, compression rituals (non-AI), backlinks refinement, tags, advanced filtering

**Avoids (from PITFALLS.md):** Computing link density in JS per-atom render (pre-computed field), orphaned atom links (consistency check), entropy cap UX regressions

**Research flag:** Standard patterns; no phase-level research needed

### Phase 5: AI Orchestration Layer

**Rationale:** AI is last in the feature dependency chain (requires stable data model, established link graph, and meaningful staleness/priority data). Building AI before users have sufficient data produces useless suggestions. The pluggable AI interface (no-op default) should be scaffolded in Phase 1 or 2, but actual AI provider implementations ship here. AI key security (do not store in IndexedDB unencrypted) and explicit opt-in for data transmission must be designed upfront.

**Delivers:** Cloud LLM adapter (OpenAI), Ollama local server adapter, AI-assisted compression suggestions (surface candidates; user decides), AI-assisted prioritization hints, secure API key handling (in-memory session-only or encrypted), explicit opt-in data transmission UI.

**Addresses (from FEATURES.md):** AI orchestration (compression, prioritization), AI as orchestrator not author

**Avoids (from PITFALLS.md):** AI API key in localStorage unencrypted, AI auto-committing atoms, prompt injection from atom content, AI layer not gracefully disabled (all features must work with no-op adapter)

**Research flag:** Needs deeper research during planning — API key management via PasswordCredential API, prompt injection mitigation for user-authored atom content, and WebGPU feature detection and fallback patterns are niche and need specific research before implementation

### Phase 6: Embedded Content (IronCalc)

**Rationale:** IronCalc is explicitly early-stage (pre-v1 roadmap targeting Q2 2026). This phase should not begin until user interviews validate that computation inside atoms is actually wanted, and until IronCalc's v1 release provides a more stable API surface. Lazy loading is mandatory — IronCalc adds significant bundle weight and must not appear in the initial load waterfall.

**Delivers:** IronCalc spreadsheet atoms (embedded Rust/WASM spreadsheet engine, loaded on demand), OPFS blob storage for spreadsheet state, lazy load with "Loading spreadsheet engine..." state.

**Addresses (from FEATURES.md):** WASM-powered embedded content (IronCalc), computational atoms (budgets, metrics, scores)

**Avoids (from PITFALLS.md):** IronCalc loaded in initial bundle (use dynamic import), IronCalc feature-parity assumptions (missing array formulas, charts, merged cells in current version), OPFS Worker requirement for synchronous access

**Research flag:** Needs research during planning — IronCalc API has evolved; verify v1 WASM binding patterns, test WASM binary size against load budget before committing; defer the entire phase if IronCalc v1 is delayed past project schedule

### Phase Ordering Rationale

- **Foundation before everything** (Phase 1): The typed atom schema, Worker architecture, and write-queue storage pattern are dependencies for every subsequent feature. They also carry the highest-severity pitfalls (storage eviction, IndexedDB batching) that cannot be retrofitted.
- **Compute before views** (Phase 2 before Phase 3): Priority scores and entropy health are the differentiating content of every page view. Building pages before the compute layer is stable means displaying data users cannot trust.
- **Rituals before AI** (Phase 4 before Phase 5): Non-AI compression rituals validate the behavior at lower complexity and risk. They confirm whether users engage with entropy management at all before AI complexity is added.
- **AI before embedded content** (Phase 5 before Phase 6): AI features have more established patterns and higher user demand than embedded spreadsheets. IronCalc depends on external project maturity outside BinderOS's control.
- **Hard caps are UX, not just features**: The inbox cap and open task cap must be implemented with soft-warning states and resolution UIs in Phase 2, not as simple boolean blocks. These mechanics define the user's daily experience of the system.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Priority/Entropy Engine):** Priority scoring formula parameter calibration, staleness decay curve design, and WASM panic recovery patterns require specific technical research before implementation; community patterns are emerging but not standardized
- **Phase 5 (AI Layer):** PasswordCredential API for secure key storage, prompt injection mitigation strategies, and WebGPU feature detection with graceful fallback are niche areas with sparse documentation; research before spec

Phases with standard patterns (skip research-phase):
- **Phase 1 (Foundation):** SolidJS + Dexie + Web Worker + wasm-bindgen is well-documented; the three-step build pipeline (cargo → wasm-bindgen-cli → wasm-opt) is explicitly documented in source material
- **Phase 3 (Pages/Navigation):** Query architecture, command palette, and keyboard navigation are established patterns with extensive prior art
- **Phase 4 (Link Density/Rituals):** Pre-computed indexed fields and list-based compression UI are straightforward implementations

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core stack (SolidJS, Vite, Dexie, wasm-bindgen) verified against official sources and release blogs; wasm-pack deprecation confirmed via official Inside Rust Blog announcement; Zod v4 and TypeScript 5.9 confirmed; only IronCalc is LOW (self-described early-stage, API may shift) |
| Features | MEDIUM-HIGH | Table stakes (capture, search, export, offline) are HIGH — confirmed by market observation across all major PKM tools; BinderOS differentiators (typed atoms, entropy mechanics, hard caps) are MEDIUM — validated by first-principles reasoning and market gap analysis, not empirical user data |
| Architecture | MEDIUM | Worker-owned WASM and signal-projected UI patterns are well-supported by official wasm-bindgen docs and SolidJS docs; SolidJS + WASM integration at this specific architecture depth is community-emerging with limited production examples; data flow and component boundaries are HIGH confidence by design reasoning |
| Pitfalls | MEDIUM-HIGH | Browser storage pitfalls (Safari ITP, IndexedDB batching) are HIGH — official MDN, WebKit blog, and production benchmarks; WASM panic behavior is HIGH — confirmed via wasm-bindgen issue tracker; SolidJS destructuring is HIGH — official docs; IronCalc-specific integration is LOW; entropy UX pitfalls are MEDIUM — pattern-derived from community PKM research |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **IronCalc API stability**: The IronCalc v0.7.x API may change before BinderOS reaches Phase 6. Verify the WASM binding patterns and binary size against the load budget at Phase 6 planning time, not now. Do not architect Phase 1–4 around IronCalc specifics.
- **Priority scoring formula calibration**: The formula P = f(deadline, importance, recency, dependencies, energy) is defined conceptually but the specific weights and normalization approach are not determined. This requires either design research or initial implementation + feedback loop. Recommend defining v1 weights as simple constants and making them adjustable per user feedback.
- **Staleness decay curve shape**: The decay rate (weekly vs monthly as mentioned in FEATURES.md) needs a concrete mathematical form. An exponential decay with a configurable half-life is the natural approach, but the default half-life values need calibration against realistic usage data — start opinionated, adjust based on feedback.
- **WebGPU + WebLLM production readiness**: WebGPU remains unavailable in Firefox (as of early 2026) and on most mobile browsers. The AI adapter interface correctly isolates this, but the WebLLM user experience (model download size, first-inference latency) has not been validated. Defer integration until Phase 5 and prototype the download + loading UX before committing to it as a supported path.
- **`@solidjs/router` exact version**: The STACK.md notes version 0.14.x as general availability but this was not confirmed via npm at research time. Verify at install time.

## Sources

### Primary (HIGH confidence)
- [SolidJS Releases — GitHub](https://github.com/solidjs/solid/releases) — v1.9.x stable, v2.0 in development
- [Sunsetting the rustwasm GitHub org — Inside Rust Blog](https://blog.rust-lang.org/inside-rust/2025/07/21/sunsetting-the-rustwasm-github-org/) — wasm-pack deprecated, wasm-bindgen transferred to new org
- [wasm-bindgen Guide](https://rustwasm.github.io/docs/wasm-bindgen/) — authoritative WASM integration patterns
- [Storage quotas and eviction criteria — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) — Safari ITP and browser eviction behavior
- [Updates to Storage Policy — WebKit Blog](https://webkit.org/blog/14403/updates-to-storage-policy/) — official Apple/WebKit storage eviction documentation
- [Solving IndexedDB Slowness — RxDB](https://rxdb.info/slow-indexeddb.html) — transaction batching benchmarks (10-25x slowdown confirmed)
- [Vite 7.0 announcement](https://vite.dev/blog/announcing-vite7) — v7.3.x current, confirmed stable
- [Zod v4 release notes](https://zod.dev/v4) — v4.x released July 2025, TS 5.5+ required
- [wasm-bindgen Panic Recovery — GitHub Issue #4095](https://github.com/wasm-bindgen/wasm-bindgen/issues/4095) — WASM panic poisoning behavior documented
- [SolidJS Fine-grained reactivity docs](https://docs.solidjs.com/advanced-concepts/fine-grained-reactivity) — destructuring pitfall and prop access patterns
- [Dexie.js — dexie.org](https://dexie.org/) — v4.0.x, actively maintained

### Secondary (MEDIUM confidence)
- [Life after wasm-pack — nickb.dev](https://nickb.dev/blog/life-after-wasm-pack-an-opinionated-deconstruction/) — concrete three-step pipeline post wasm-pack
- [LocalStorage vs IndexedDB vs OPFS comparison — RxDB](https://rxdb.info/articles/localstorage-indexeddb-cookies-opfs-sqlite-wasm.html) — storage API trade-offs
- [LogRocket: Offline-first frontend apps 2025](https://blog.logrocket.com/offline-first-frontend-apps-2025-indexeddb-sqlite/) — IndexedDB vs OPFS use cases
- [Forte Labs: test-driving Obsidian, Tana, Mem](https://fortelabs.com/blog/test-driving-a-new-generation-of-second-brain-apps-obsidian-tana-and-mem/) — PKM market feature analysis
- [Local-first software essay — Ink & Switch](https://www.inkandswitch.com/essay/local-first/) — foundational local-first design principles
- [Downsides of Local First — RxDB](https://rxdb.info/downsides-of-offline-first.html) — documented local-first production pitfalls
- [IronCalc GitHub](https://github.com/ironcalc/IronCalc) — v0.7.1 (Jan 2026), early-stage

### Tertiary (LOW confidence)
- [Your Second Brain Is Broken — Medium](https://medium.com/@ann_p/your-second-brain-is-broken-why-most-pkm-tools-waste-your-time-76e41dfc6747) — PKM failure pattern analysis; pattern-derived, single author
- [The PKM Paradox — Medium](https://medium.com/@helloantonova/the-pkm-paradox-why-most-knowledge-management-tools-fail-to-meet-our-needs-d5042f08f99e) — PKM failure modes; community analysis
- [PWA on iOS — Current Status 2025 — Brainhub](https://brainhub.eu/library/pwa-on-ios) — iOS persistent storage behavior; third-party, corroborated by Apple forums
- [IronCalc Roadmap](https://www.ironcalc.com/roadmap.html) — Phase 6 planning context; subject to change (small team, side project)

---
*Research completed: 2026-02-21*
*Ready for roadmap: yes*
