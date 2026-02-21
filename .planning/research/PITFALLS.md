# Pitfalls Research

**Domain:** Local-first browser-based personal information management (WASM, IndexedDB/OPFS, SolidJS, pluggable AI, entropy management)
**Researched:** 2026-02-21
**Confidence:** MEDIUM — Browser storage and WASM pitfalls are HIGH (well-documented); PKM/entropy management pitfalls are MEDIUM (pattern-derived from community wisdom); IronCalc-specific integration is LOW (early-stage project, limited production reports)

---

## Critical Pitfalls

### Pitfall 1: Browser Storage Eviction Destroys User Trust

**What goes wrong:**
Safari's Intelligent Tracking Prevention (ITP) deletes all browser storage — including IndexedDB and OPFS — after 7 days of inactivity. Chrome and Firefox also evict storage under disk pressure via an LRU policy where the least-recently-used origin is wiped entirely (not partially). When eviction occurs, ALL storage types for the origin are deleted simultaneously, meaning IndexedDB + Cache API data disappear together. There is no warning to the user and no partial recovery — the entire binder is gone.

**Why it happens:**
Browsers were not designed with "personal information management" as a first-class use case. ITP was designed to prevent advertising abuse, not to protect PIM tools. Developers assume browser storage is durable; it is not — it is best-effort.

**How to avoid:**
- Call `navigator.storage.persist()` at first launch and prompt the user to grant persistent storage; this disables ITP-based eviction for the origin in Chrome. In Safari 17+, persistent storage requires notification permission to grant — document this explicitly.
- Display the persistent storage grant status visually (green/yellow/red in the entropy health indicator). Users must know if their data is protected.
- Build an explicit export-to-file feature (JSON dump) in Phase 1 — not Phase 3. This is the last-resort backup and must exist before users store anything meaningful.
- Show a startup banner if `navigator.storage.persisted()` returns false, explaining the risk and prompting action.
- For iOS/Safari specifically: document that users must add the app to their Home Screen to receive elevated storage quotas (80% of disk vs 50%).

**Warning signs:**
- App has no persistent storage grant request at startup
- No export/backup functionality
- Users on iOS or Safari with no Home Screen installation path
- No error handling for `QuotaExceededError`

**Phase to address:** Phase 1 — Storage Foundation. This must be solved before any data is stored.

---

### Pitfall 2: IndexedDB Transaction Batching Failures Cause 10–25x Slowdowns

**What goes wrong:**
Every write to IndexedDB that opens its own transaction incurs substantial overhead. Writing 1,000 atoms individually (one transaction per write) takes ~2 seconds; writing the same 1,000 atoms in a single batched transaction takes ~80ms. This is the number-one IndexedDB performance mistake. For BinderOS, the priority scoring engine, staleness decay, and entropy health recalculations all trigger writes — if these are done naively (one atom at a time), the UI will stall noticeably even with 200–300 atoms.

**Why it happens:**
Developers treat IndexedDB like a key-value store and write on every state change. SolidJS fine-grained reactivity makes this easy to trigger accidentally — each signal update can fire a write if not properly debounced.

**How to avoid:**
- Treat IndexedDB as a persistence layer, not an active database. Keep the working set in memory (signals/stores in SolidJS) and flush to IndexedDB in batched transactions on a write-queue with debounce (e.g., 200–500ms after last change, or explicit "save" events).
- Use a single transaction for bulk operations (import, decay batch, entropy sweep).
- Use `getAll()` instead of `openCursor()` for reads — cursor-based reads are 5–10x slower for bulk retrieval.
- Shard large object stores (e.g., separate stores for each atom type) — documented 28–43% performance improvement.
- Never trigger IndexedDB writes directly from SolidJS reactive effects; route through a write queue.

**Warning signs:**
- Write operations called inside `createEffect` without debounce
- A "save" triggered on every keypress or signal change
- Perceived UI lag when the atom list exceeds ~500 items
- Profiler shows many short IndexedDB transactions in DevTools

**Phase to address:** Phase 1 — Storage Foundation. Establish the write-queue pattern before building any features on top of it.

---

### Pitfall 3: WASM Module Panic Corrupts All Subsequent Calls

**What goes wrong:**
When a Rust WASM module panics (e.g., array out of bounds, unwrap on None), wasm-bindgen's default behavior is to throw a JavaScript exception and leave the module in an undefined state. Subsequent calls to the module will produce incorrect results or hang silently. This is documented in wasm-bindgen issue #4095: re-initializing a WASM module after a panic leads to "spooky behavior/UB" because module-level globals are not reset. For BinderOS, this means a panic in the priority scoring engine could silently corrupt all subsequent priority scores without any visible error.

**Why it happens:**
Rust's panic model is "abort or unwind." In WASM, the default is to throw a JS exception, but the module's linear memory and global state are not cleaned up. The module is effectively poisoned. Developers assume exception = handled; it is not.

**How to avoid:**
- Compile all Rust WASM modules with `panic = "abort"` in `[profile.release]` in Cargo.toml. This makes panics deterministic (the tab crashes or throws) rather than leaving the module in an unknown state.
- Wrap all public WASM API functions in `catch_unwind` (Rust's panic boundary primitive) and return a `Result` type to JavaScript — never let panics escape into the JS boundary.
- Test panic paths explicitly: write integration tests that feed invalid input to every public WASM function.
- In the JS layer, if a WASM call throws, treat the module as dead and reload it (or reload the page with an error banner).

**Warning signs:**
- Priority scores stuck at a fixed value after an error elsewhere
- Entropy calculations returning NaN or 0 after an exception was swallowed
- WASM functions succeeding after a previously thrown exception without page reload

**Phase to address:** Phase 2 — WASM Core Engine. Establish panic safety before connecting to the UI.

---

### Pitfall 4: SolidJS Destructuring Kills Reactivity Silently

**What goes wrong:**
SolidJS props and stores use JavaScript getters for reactivity. Destructuring converts getters to static values evaluated at destructure time. The component renders correctly on first load, then never updates when the underlying signal changes. This is the most common SolidJS mistake and produces no warnings or errors — it is a silent reactivity failure. For BinderOS, where atom data flows from a WASM computation result into SolidJS UI components, destructuring at the boundary will cause stale priority scores, stale entropy indicators, and stale page views.

**Why it happens:**
Developers coming from React destructure props instinctively. The pattern looks identical but has fundamentally different semantics in SolidJS. There is no runtime warning.

**How to avoid:**
- Never destructure props: use `props.value` not `const { value } = props`.
- Never destructure store paths: use `store.atoms.list` not `const { list } = store.atoms`.
- Install and run the official SolidJS ESLint plugin (`eslint-plugin-solid`) from day one — it catches this specific mistake at development time.
- When bridging WASM results into SolidJS state, always go through a signal setter (`setAtoms(result)`) and access via the getter (`atoms()`), never by destructuring the result object.

**Warning signs:**
- Component shows correct data on first render but never updates
- ESLint plugin not installed
- Props accessed via destructuring in component signatures
- WASM results spread into component props

**Phase to address:** Phase 1 — UI Foundation. Establish ESLint + SolidJS rules before any component is written.

---

### Pitfall 5: Entropy System Becomes a Guilt Machine, Not a Guide

**What goes wrong:**
The core premise of BinderOS — active entropy management with hard caps, staleness decay, and compression prompts — is powerful in theory but easy to implement in a way that makes users feel constantly behind. If the entropy health indicator is always red, if compression prompts are too frequent or too aggressive, or if the hard cap on active tasks is too rigid, users experience the system as adversarial. Studies of PKM tools consistently show that systems that create anxiety or maintenance burden are abandoned within 30 days, regardless of theoretical value. The open task cap and inbox hard cap are especially high-risk: if adding a new task forces immediate triage of old tasks, users stop adding tasks.

**Why it happens:**
Developers build the theoretical ideal (strict information-theoretic hygiene) without UX-testing the emotional experience of living inside hard constraints. The system is correct but punishing. This is the most common failure mode for opinionated productivity tools.

**How to avoid:**
- Make entropy warnings advisory first, enforcement second. Show the red indicator, but allow exceeding caps with a visible "over budget" state before blocking input entirely.
- Introduce caps incrementally: soft warning at 80% of cap, hard block at 100%, with a graceful resolution UI (not just an error).
- Compression prompts must be deferrable. Users need to say "not now" without penalty.
- Frame entropy health positively: "Your binder is focused" (green) vs. "Your binder needs attention" (yellow) — not "ENTROPY CRITICAL."
- Design the staleness decay curve to be forgiving over the first 30 days of use (new users need time to build the habit before decay punishes inactivity).
- Build a "vacation mode" that pauses decay scoring when the user marks themselves as away.

**Warning signs:**
- Entropy indicator is red in development testing with realistic data
- Adding a task is blocked without showing what to do instead
- User testing reveals feelings of guilt or avoidance
- No way to defer compression prompts

**Phase to address:** Phase 2 — Entropy Engine. Design with UX guardrails; validate with user observation (even informal) before enforcing caps.

---

### Pitfall 6: OPFS Synchronous API Requires Web Worker — Blocking Main Thread Kills UX

**What goes wrong:**
OPFS's high-performance synchronous methods (`createSyncAccessHandle()`, synchronous `read()`/`write()`) are only available inside a Web Worker — they cannot be called from the main thread, iframes, or SharedWorkers. If BinderOS uses OPFS for heavy storage operations (e.g., large embedded WASM content blobs, export/import) and calls these APIs from the main thread, it either falls back to the slower async API (losing the performance advantage) or blocks entirely. Additionally, concurrent access to OPFS files across multiple tabs is a documented pain point.

**Why it happens:**
The OPFS API surface looks similar between main thread and worker contexts but behaves fundamentally differently. Developers read the fast path docs and assume it works everywhere.

**How to avoid:**
- All OPFS operations must be routed through a dedicated Web Worker with a message-passing interface. Design the worker boundary explicitly in Phase 1.
- Use the synchronous API (`createSyncAccessHandle()`) inside the worker for maximum performance.
- Implement a worker-side write queue to serialize writes and avoid concurrent-access corruption.
- For multi-tab scenarios (user opens BinderOS in two tabs), use the Web Locks API to serialize OPFS access.
- Firefox does not support OPFS as of early 2026 — fall back to IndexedDB for Firefox users, or detect and warn.

**Warning signs:**
- OPFS calls in main thread JS files
- No Web Worker file in the project
- Multi-tab scenario untested
- Firefox used for development without cross-browser testing

**Phase to address:** Phase 1 — Storage Foundation. The worker architecture must be designed before any storage code is written.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| One IndexedDB transaction per write | Simple code, easy to reason about | 10–25x slower writes; UI jank at scale | Never — write queue from day one |
| Storing priority scores in IndexedDB instead of recomputing | Avoids WASM call on load | Stale scores after schema change; migration complexity | Never — always recompute from source data |
| Skipping `navigator.storage.persist()` request | Fewer permissions dialogs | User data loss on Safari/iOS with no warning | Never — always request on first launch |
| Hard-coding a single AI provider instead of interface | Faster to ship | Vendor lock-in; users without that provider can't use AI features | Never — interface from day one |
| Storing AI API keys in localStorage/IndexedDB unencrypted | Simple implementation | API key theft via XSS or malicious extensions | Never — use encrypted storage or in-memory only |
| Skipping ESLint SolidJS plugin | Less tooling setup | Silent reactivity bugs that look like logic errors | Never — install in Phase 1 |
| Treating atom links as denormalized copies | Simpler reads | Link rot when an atom is updated; orphaned references | Never — always store links as IDs only |
| Panic = unwind in WASM debug builds only | Easier local debugging | Developers build against behavior that doesn't exist in production | Acceptable during initial dev if panic = abort in release |
| IronCalc embedded before atom core is stable | Impressive demo | WASM module interactions untested; size budget blown | Defer IronCalc to post-MVP validation phase |

---

## Integration Gotchas

Common mistakes when connecting to external services.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Cloud LLM APIs (OpenAI, Anthropic, etc.) | Storing raw API keys in IndexedDB or localStorage | Store in memory only for the session; let users paste key each session, OR use the browser's PasswordCredential API for encrypted credential storage |
| Local LLM (WebLLM/WebGPU) | Assuming WebGPU is available; no fallback path | Feature-detect WebGPU; degrade gracefully to "AI unavailable" state; test in Firefox where WebGPU support is inconsistent |
| IronCalc WASM | Loading IronCalc as part of initial bundle | Lazy-load IronCalc only when a spreadsheet atom is opened; it adds significant bundle weight |
| IronCalc WASM | Assuming feature parity with Excel | IronCalc is pre-v1 (roadmap targets Q2 2026 for v1); missing: array formulas, charts, conditional formatting, merged cells, collaborative editing |
| WASM modules (multiple) | Loading all WASM modules on startup | Use dynamic `import()` with code splitting; only load the priority engine and entropy engine at startup; load IronCalc on demand |
| IndexedDB + SolidJS | Updating a SolidJS signal inside an IndexedDB callback | IndexedDB callbacks run outside SolidJS reactive scope; wrap in `batch()` or use explicit scheduling to avoid partial reactivity updates |

---

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Querying all atoms for each page view | Fast at 50 atoms, slow at 500+ | Build indexed queries using IndexedDB indexes; cache page query results in memory | ~300 atoms |
| Running entropy/staleness decay for all atoms synchronously on load | Startup blocks for 2–5 seconds | Run decay in a Web Worker; stagger computation; skip atoms touched recently | ~200 atoms |
| Computing link density in JS for each atom display | Renders slowly as link count grows | Pre-compute link density as an indexed field; update on link creation/deletion only | ~100 atoms with >10 links each |
| Full atom tree traversal for priority score | Dependency chain causes O(n²) recomputation | Use topological sort + dirty-flag pattern; only recompute atoms whose dependencies changed | ~50 interdependent atoms |
| Crossing the JS↔WASM boundary per-atom in a loop | Chatty call pattern; boundary overhead exceeds computation benefit | Batch: pass all atoms to WASM in one call, get all scores back in one call | ~20 atoms per render cycle |
| WASM binary loaded synchronously blocking first render | Blank screen for 1–3 seconds on first load | Use streaming compilation (`WebAssembly.instantiateStreaming`) with correct MIME type; show loading state | Any WASM module >100KB |

---

## Security Mistakes

Domain-specific security issues beyond general web security.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing LLM API keys in IndexedDB or localStorage unencrypted | Malicious browser extensions can read all storage for an origin; 95%+ of extensions with storage permission can exfiltrate keys | Store in memory (session-only) or use the Web Crypto API to encrypt before writing; display a visible warning about the risk |
| Sending local atom data to cloud LLM APIs without explicit user action | User's personal information (tasks, decisions, health data) transmitted without informed consent | All AI calls must be explicit, opt-in, and show exactly what data is being sent before sending |
| No Content Security Policy header | XSS attacks can read localStorage/IndexedDB | Set strict CSP on the hosting page; local-first does not mean XSS-safe |
| Trusting AI-generated atom classifications blindly | AI can misclassify or inject malformed data into the atom schema | Validate all AI-generated content against the typed schema before writing to storage; AI suggestions are proposals, not commits |
| Prompt injection from atom content into AI context | If atom bodies contain adversarial text, it can manipulate the AI layer's behavior | Sanitize atom content before including in prompts; use structured message formats that separate content from instructions |

---

## UX Pitfalls

Common user experience mistakes in this domain.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Forcing atom type selection before capture | Users abandon capture when classification is required upfront; ideas are lost | Allow inbox-to-untyped capture; require classification only when promoting from inbox |
| Entropy indicator always in red/yellow state | Users stop looking at it; anxiety and avoidance; system abandoned within 30 days | Calibrate thresholds so green is achievable with normal use; start new users in green state |
| No "undo" on atom deletion or archiving | Users afraid to use compression prompts; entropy management frozen | All mutations must be reversible (change log is in-scope per PROJECT.md); expose undo prominently |
| Priority scoring formula exposed to users without explanation | Users distrust the system; try to game it; stop using structured data | Show contributing factors ("high priority because: overdue, linked to 3 active projects") not the raw score |
| Compression prompts interrupting work | Users dismiss them permanently; entropy grows unchecked | Surface compression prompts in a sidebar or end-of-session review, not as modal interruptions during capture |
| Hard block when inbox cap is hit | User is mid-thought, cannot capture; abandons | Allow capture with a visible "over capacity" badge; triage prompt appears after capture completes |
| Command-center UI complexity before trust is established | Overwhelming for new users; wrong defaults | Progressive disclosure: start with minimal view, reveal advanced entropy/priority UI only after first week of use |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Persistent storage:** App stores data but `navigator.storage.persisted()` returns false — Safari will delete everything after 7 days of inactivity. Verify: call `navigator.storage.persisted()` in console on each target browser.
- [ ] **WASM panic safety:** Module computes priority scores but panics on edge-case input (e.g., atom with no deadlines, circular dependency chain). Verify: fuzz the WASM API with invalid/edge-case atoms in tests.
- [ ] **IndexedDB migration:** Schema works on fresh install but fails on upgrade from previous version. Verify: test upgrade path from version 1 to version 2 with real data in the DB.
- [ ] **Atom link integrity:** Deleting an atom removes it from storage but orphaned link IDs persist in other atoms. Verify: delete an atom, then query all atoms containing a link to it.
- [ ] **AI layer disabled gracefully:** All features work when AI is not configured (key not provided). Verify: clear API key, exercise every feature, confirm no errors.
- [ ] **SolidJS reactivity:** Priority score updates in WASM reflected in UI without page reload. Verify: update an atom's deadline via keyboard, confirm priority score re-renders within 500ms.
- [ ] **Export completeness:** Export file contains all atoms, links, section structure, and is re-importable without data loss. Verify: export → clear storage → import → diff atom count and link count.
- [ ] **Firefox compatibility:** App functions (with IndexedDB fallback) in Firefox — OPFS not available. Verify: run full smoke test in Firefox.
- [ ] **iOS Safari persistence:** Data persists across 7+ days of inactivity after persistent storage is granted (or Home Screen installation). Verify: add to Home Screen on iOS, store data, wait 7 days (or simulate via Safari developer settings).
- [ ] **IronCalc lazy loading:** Spreadsheet WASM module not included in initial bundle. Verify: check network tab on cold load — no IronCalc WASM request until a spreadsheet atom is opened.

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Data evicted by browser without user consent | HIGH | If export existed: reimport from file. If no export: data is gone. Prevention is the only real solution. |
| WASM module in poisoned state after panic | LOW | Reload the WASM module (or the full page); show user a "something went wrong, refreshing engine" message |
| IndexedDB schema migration failure | HIGH | Must maintain rollback migration: version N-1 must be restorable from version N data. Test in staging before release. |
| SolidJS reactivity broken (signals returning stale data) | MEDIUM | Identify the destructured prop/store path; wrap in accessor function. ESLint plugin usually catches this before it ships. |
| AI API key exposed via extension | HIGH | User must revoke key at the provider immediately. App should provide a "revoke and re-enter key" flow with instructions. |
| Entropy caps set too aggressively, users abandoning | HIGH | Hotfix: raise caps or make them advisory-only; send in-app notification explaining the change |
| IronCalc WASM too large, blowing load time budget | MEDIUM | Move IronCalc to a separate dynamic import; add explicit "Loading spreadsheet engine..." state |
| Orphaned atom links causing phantom references | MEDIUM | Run a consistency check on startup: scan all links, remove any that point to non-existent atoms; log to change log |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Browser storage eviction (Safari ITP) | Phase 1 — Storage Foundation | `navigator.storage.persisted()` returns true after onboarding; export feature exists |
| IndexedDB transaction batching | Phase 1 — Storage Foundation | Write-queue architecture established; no per-write transactions in codebase |
| OPFS Worker requirement | Phase 1 — Storage Foundation | All OPFS calls isolated in Web Worker; multi-tab lock test passes |
| SolidJS destructuring reactivity | Phase 1 — UI Foundation | ESLint SolidJS plugin passes on all files; no destructured props |
| WASM panic poisoning | Phase 2 — WASM Core Engine | All public WASM functions wrapped in catch_unwind; fuzz tests pass |
| JS↔WASM chatty call pattern | Phase 2 — WASM Core Engine | Batch API design; benchmark shows < 16ms for 500 atom score computation |
| Entropy system as guilt machine | Phase 2 — Entropy Engine | UX observation: new user with 20 atoms sees green health indicator |
| AI API key security | Phase 3 — AI Layer | API keys not written to IndexedDB/localStorage; key entry flow has security warning |
| AI layer not gracefully disabled | Phase 3 — AI Layer | Full smoke test with no API key configured passes with zero errors |
| Atom link integrity (orphans) | Phase 1 — Storage Foundation | Startup consistency check implemented; delete-atom test verifies link cleanup |
| Entropy cap UX (hard blocks) | Phase 2 — Entropy Engine | Soft warning at 80%; resolution UI before hard block; all caps deferrable |
| IronCalc lazy load | Phase 4 — Embedded Content | Network waterfall shows IronCalc absent from initial load |
| IndexedDB schema migration | Phase 1 — Storage Foundation | Upgrade path from v1→v2 tested with seeded data before each release |
| WASM module size | Phase 2 — WASM Core Engine | Bundle size audit: initial WASM load < 500KB; IronCalc loaded on demand |
| PKM capture friction | Phase 1 — UI Foundation | Atom capture requires < 3 keystrokes from any context; inbox accepts untyped items |

---

## Sources

- [The pain and anguish of using IndexedDB: problems, bugs and oddities (pesterhazy)](https://gist.github.com/pesterhazy/4de96193af89a6dd5ce682ce2adff49a) — HIGH confidence: primary source, widely cited
- [Downsides of Local First / Offline First — RxDB](https://rxdb.info/downsides-of-offline-first.html) — HIGH confidence: documented production experience
- [Solving IndexedDB Slowness — RxDB](https://rxdb.info/slow-indexeddb.html) — HIGH confidence: benchmarked findings
- [Storage quotas and eviction criteria — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) — HIGH confidence: official specification
- [Origin private file system — MDN](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system) — HIGH confidence: official specification
- [SolidJS Fine-grained reactivity docs](https://docs.solidjs.com/advanced-concepts/fine-grained-reactivity) — HIGH confidence: official docs
- [SolidJS intro to reactivity](https://docs.solidjs.com/concepts/intro-to-reactivity) — HIGH confidence: official docs
- [wasm-bindgen Memory leak when repeatedly instantiating a WASM module — GitHub Issue #3130](https://github.com/rustwasm/wasm-bindgen/issues/3130) — HIGH confidence: official tracker
- [wasm-bindgen Panic Recovery and Module Re-loadability — GitHub Issue #4095](https://github.com/wasm-bindgen/wasm-bindgen/issues/4095) — HIGH confidence: official tracker
- [Shrinking .wasm Size — Rust and WebAssembly book](https://rustwasm.github.io/docs/book/reference/code-size.html) — HIGH confidence: official documentation
- [Updates to Storage Policy — WebKit Blog](https://webkit.org/blog/14403/updates-to-storage-policy/) — HIGH confidence: official Apple/WebKit documentation
- [IronCalc Roadmap](https://www.ironcalc.com/roadmap.html) — MEDIUM confidence: official but subject to change (small team, side project)
- [Your Second Brain Is Broken — Medium/Ann P.](https://medium.com/@ann_p/your-second-brain-is-broken-why-most-pkm-tools-waste-your-time-76e41dfc6747) — MEDIUM confidence: community analysis, patterns corroborated by other sources
- [Decay vs Permanence: Should PKMs Forget to Stay Useful? — Medium](https://medium.com/@ann_p/decay-vs-permanence-should-pkms-forget-to-stay-useful-5069da096023) — MEDIUM confidence: community analysis
- [PWA on iOS — Current Status & Limitations 2025 — Brainhub](https://brainhub.eu/library/pwa-on-ios) — MEDIUM confidence: third-party but corroborated by Apple developer forums
- [Small Tools, Big Risk: Browser Extensions Stealing API Keys — Obsidian Security](https://www.obsidiansecurity.com/blog/small-tools-big-risk-when-browser-extensions-start-stealing-api-keys) — MEDIUM confidence: security research, specific incident documented
- [The PKM Paradox: Why Most Knowledge Management Tools Fail — Medium](https://medium.com/@helloantonova/the-pkm-paradox-why-most-knowledge-management-tools-fail-to-meet-our-needs-d5042f08f99e) — LOW confidence: single author opinion, but patterns match broader research

---
*Pitfalls research for: BinderOS — local-first browser-based PIM with WASM, IndexedDB/OPFS, SolidJS, pluggable AI, entropy management*
*Researched: 2026-02-21*
