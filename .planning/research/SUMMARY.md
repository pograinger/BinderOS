# Project Research Summary

**Project:** BinderOS v2.0 — AI Orchestration Layer
**Domain:** Local-first browser PKM/GTD tool with in-browser LLM + cloud API AI integration
**Researched:** 2026-02-22 (v2.0 AI milestone; see v1.0 entry at bottom for prior core research)
**Confidence:** MEDIUM-HIGH (infrastructure patterns HIGH; GTD-specific AI UX MEDIUM; browser LLM performance numbers MEDIUM)

## Executive Summary

BinderOS v2.0 adds an AI orchestration layer on top of a fully operational v1.0 foundation (SolidJS 1.9 + Rust/WASM + Dexie.js + semantic embeddings + entropy engine). The central design challenge is not building AI features — it is integrating AI as an advisor into a system whose primary value proposition is that the user remains the sole author of all knowledge. Every AI capability must fit an additive, approval-gated model: AI suggests, user decides, changes flow through the existing mutation pipeline, and are tagged with `source: 'ai'` in the changelog. This constraint is non-negotiable and must drive every architecture decision from the start.

The recommended approach is a tiered AI infrastructure: `@huggingface/transformers` (already installed at v3.8.1) running SmolLM2-135M/360M-Instruct in a dedicated `llm-worker.ts` for fast classification tasks, with Anthropic Claude (Haiku) via raw `fetch` + `fetch-event-stream` as the cloud tier for conversational review flows. The floating orb is the single AI entry point — a context-aware, always-visible trigger that reads the existing SolidJS reactive store and surfaces the most relevant AI action based on current page, selected atom, and entropy level. The orb dispatches commands through the existing bridge protocol; AI adapters live entirely in the worker scope; the BinderCore WASM module and all existing handlers remain untouched.

The top risks are architectural and must be solved in Phase 1 before any feature is built: running AI inference in the existing data worker (blocks all atom mutations during LLM calls), skipping the dedicated LLM worker isolation (LLM OOM crashes take down IndexedDB), missing the required Anthropic CORS header (silent failure), and building proactive orb nudges by default (suggestion fatigue within two weeks). Retrofitting the correct architecture after building features on top of the wrong foundation is expensive enough to invalidate the entire milestone.

---

## Key Findings

### Recommended Stack

The v1.0 stack is confirmed stable and requires no changes. v2.0 stack additions are minimal by design. Only `fetch-event-stream` (741 bytes) is a new required dependency; `@mlc-ai/web-llm` is optional and user opt-in only. See [STACK.md](.planning/research/STACK.md) for full details.

**Core technologies (new in v2.0):**
- `fetch-event-stream` 0.1.6 — SSE streaming for cloud API; replaces any SDK; 741 bytes, zero dependencies
- `@huggingface/transformers` 3.8.1 (already installed) — SmolLM2-135M/360M-Instruct for browser LLM classification; same pipeline API already used for semantic embeddings
- Raw `fetch` (no OpenAI/Anthropic SDKs) — Anthropic supports direct browser CORS; OpenAI does not; `openai` npm (~17KB) and `@anthropic-ai/sdk` (~15KB) are unnecessary bloat for a browser-only app
- `@mlc-ai/web-llm` 0.2.81 — optional, user opt-in only; WebGPU-accelerated; NOT loaded by default

**Critical constraints:**
- Do NOT upgrade `@huggingface/transformers` to v4 (`@next`) — preview only as of Feb 9 2026; API unstable
- SmolLM2-135M for fast triage classification (~150MB download, ~100-300ms/token on CPU); SmolLM2-360M for higher-quality tasks (~300MB); neither bundled — fetched from HuggingFace CDN on first use
- Use Cache API (not IndexedDB) for model weight storage; call `navigator.storage.persist()` before caching
- WebLLM in single-threaded mode by default — multi-threaded requires COOP/COEP headers that can break cross-origin assets across the entire page

### Expected Features

The v2.0 AI feature set builds directly on v1.0's entropy engine and semantic embeddings — BinderOS's AI reads the entropy state before making suggestions, which no competitor does. See [FEATURES.md](.planning/research/FEATURES.md) for full competitor analysis and prioritization matrix.

**Must have (table stakes) — v2.0 launch:**
- Pluggable AI interface — abstract provider routing to browser WASM, cloud API, or null (no-op); everything degrades gracefully
- AI-suggested atom type and section during inbox triage — expected by any user who knows the system has typed atoms
- Accept / dismiss per-suggestion — missing this means users feel railroaded
- Visual distinction of AI-generated content — persistent AI badge on all AI-sourced atoms (never look identical to user content)
- AI changelog tagging (`source: 'user' | 'ai'`) — foundation for reversibility and trust; low effort, high trust
- Opt-in / opt-out control over AI (privacy-first audience expects explicit control)
- Reasoning shown per suggestion — "Suggested because this task is 45 days old with no activity"
- Floating orb as single AI entry point with GTD action menu
- Review pre-analysis briefing — AI-generated entropy state summary before weekly review begins

**Should have (differentiators) — v2.x after validation:**
- Guided GTD weekly review (Get Clear / Get Current / Get Creative conversational flow via cloud API)
- Compression coach with AI explanations (why an atom is stale — today it's mechanical, AI adds reasoning)
- Related atoms surface during triage (2-3 semantically similar existing atoms alongside classification suggestion)
- AI-suggested priority signal overlay (shown during review only, never persistently)

**Defer (v3+):**
- On-device model selection UI and model download management
- Review history and trend analysis (requires data accumulation over time)
- AI-assisted natural language capture (high risk of bypassing the classification ritual that defines BinderOS)

**Anti-features — explicitly do not build:**
- AI auto-creates or auto-classifies atoms without approval (defeats the classification ritual)
- AI-generated atom content — AI suggests metadata only, never content; user is sole author
- Autonomous review agents running on a schedule
- AI priority override of the deterministic entropy engine
- Persistent AI behavioral learning model (privacy surface, complexity, not needed for good classification)
- Chat sidebar as primary AI interface — structured question flows are the correct model for GTD reviews

### Architecture Approach

The integration is additive: 6 existing files are extended (types, store, worker, app), all existing handlers remain unchanged, and 3 new worker files plus 3 new UI components are created. The key structural decision is three separate worker threads: the existing BinderCore worker (WASM + Dexie), a new dedicated LLM worker (Transformers.js inference), and cloud API calls routed through the AI adapter inside a separate AI adapter scope. See [ARCHITECTURE.md](.planning/research/ARCHITECTURE.md) for the full component diagram and all data flow sequences.

**Major components:**
1. **Floating Orb** (`FloatingOrb.tsx`) — Portal-rendered, always-visible; reads `state.activePage`, `selectedAtom()`, `state.entropyScore` reactively from existing store via `createMemo`; dispatches typed AI commands; never receives props (portal boundary)
2. **AI Adapter layer** (`src/worker/ai/`) — `interface.ts` + `noop.ts` + `browser-llm.ts` + `cloud-api.ts`; lives entirely in worker scope; UI never calls AI directly
3. **LLM Worker** (`llm-worker.ts`) — dedicated Transformers.js worker; owns SmolLM2 model; typed `INFER / INFER_RESULT` protocol; separate from existing `embedding-worker.ts`
4. **AI Suggestion Tray** (`AISuggestionTray.tsx`) — approve/reject UI; dispatches `AI_APPLY_SUGGESTION` which calls the same existing handlers user commands call, tagged `source: 'ai'` in changelog
5. **Extended store** (`store.ts`) — new `aiState` slice (`aiStatus`, `aiSuggestions[]`, `conversationTurn`) added to existing `BinderState`; no restructuring of existing state
6. **Separate AI message protocol** (`types/ai-messages.ts`) — AI command/response types in a SEPARATE file from `types/messages.ts` to preserve the exhaustiveness check in worker.ts

**Build order (violating this causes rework):**
Protocol + store extensions → no-op AI adapter → LLM Worker + browser adapter → cloud API adapter → Floating Orb UI → Suggestion Tray UI → feature-specific flows (triage, review, compression).

### Critical Pitfalls

See [PITFALLS.md](.planning/research/PITFALLS.md) for all 16 pitfalls with prevention checklists, recovery strategies, and production verification steps. Top 5 requiring Phase 1 resolution:

1. **Running AI inference in the existing BinderCore worker** — Cloud API calls (2-10s) and LLM inference (5-60s) block the worker event loop, freezing all atom mutations and scoring. Prevention: dedicated AI Worker separate from data worker; AI commands in `types/ai-messages.ts` not `types/messages.ts`; data worker never awaits LLM.

2. **Missing `anthropic-dangerous-direct-browser-access: true` header** — Anthropic requires this exact header for direct browser CORS; without it every call silently fails with a CORS error. OpenAI has no browser CORS support at all — do not attempt direct browser calls to `api.openai.com`. Prevention: hardcode the Anthropic header in `ai/cloud-api.ts` with a comment explaining why.

3. **Combining LLM Worker memory with BinderCore Worker** — SmolLM2-360M at q8 = ~180MB RAM; on 8GB devices combined with BinderCore WASM, Chrome OOM-kills the tab. Prevention: dedicated `llm-worker.ts`; check `performance.memory` before model load; call `engine.unload()` on idle timeout (5 minutes).

4. **API key stored in `localStorage`** — readable by any browser extension with storage permission; documented real-world theft targeting AI productivity tools. Prevention: memory-only by default (re-enter each session); if persistence required, encrypt with Web Crypto AES-GCM; always show security disclosure in settings UI.

5. **Proactive orb nudges enabled by default** — 46% of developers distrust AI accuracy (Stack Overflow 2025); unsolicited wrong suggestions accelerate distrust 3x vs. solicited ones. Fatigue builds within 2 weeks. Prevention: orb is static (no pulse, no badge) by default; all proactive behavior is explicit opt-in in settings; dismissed suggestions respect 24-hour cooldown.

---

## Implications for Roadmap

The research defines a natural 4-phase build order driven by the dependency graph: infrastructure before features, features before the orb's full depth, and lower-stakes features before higher-stakes ones. Building the floating orb before the features it surfaces are ready creates a hollow first impression.

### Phase 1: AI Infrastructure Foundation

**Rationale:** Every AI feature depends on the same foundations: worker isolation, AI adapter interface, message protocol extension, store extension, security model, WebGPU detection, and offline degradation strategy. Building any AI feature before these exist means rebuilding that feature when the architecture is corrected. This phase has zero user-visible AI — it delivers the backbone everything else plugs into.

**Delivers:**
- `types/ai-messages.ts` — separate AI command/response protocol; preserves exhaustiveness check in `worker.ts`
- `aiState` slice added to `BinderState` (`aiStatus`, `aiSuggestions[]`, `conversationTurn`)
- `source: 'user' | 'ai'` field added to `MutationLogEntry` in `changelog.ts`
- `src/worker/ai/` with `interface.ts` + `noop.ts`; AI commands routed in `worker.ts` to no-op (end-to-end message flow proven with no real AI)
- `llm-worker.ts` with SmolLM2-360M-Instruct via Transformers.js; typed `INFER / INFER_RESULT` protocol
- `src/worker/ai/browser-llm.ts` — postMessage bridge to LLM worker with request-ID pending map and 30s timeout
- `src/worker/ai/cloud-api.ts` — Anthropic fetch with required CORS header + BYOK pattern + exponential backoff with jitter for 429s
- `AIProviderStatus` enum (`available | unavailable | loading | error | disabled`) surfaced in store and orb visual state
- WebGPU feature detection: `requestAdapter()` check (not just `navigator.gpu` existence); settings panel shows correct status on GPU-less machines
- `navigator.onLine` pre-check before cloud API calls; friendly offline messaging
- API key: memory-only by default; security disclosure and key rotation flow in settings
- `pnpm add fetch-event-stream`

**Avoids:** Pitfalls 1-8 (all infrastructure-level), Pitfall 16 (offline degradation)

**Research flag:** SKIP — well-documented patterns (Worker isolation, Transformers.js, Anthropic CORS, WebGPU detection). Verification is integration testing, not research.

### Phase 2: Triage AI — Validate the Suggestion Pattern

**Rationale:** Inbox triage is the highest-frequency, lowest-stakes AI interaction. Every inbox card the user processes is an opportunity to accept or dismiss a suggestion. This is where the accept/dismiss UX pattern gets validated before being applied to higher-stakes review flows. The Suggestion Tray and AI badge must ship here — not later — because any AI suggestion surfaced without visual distinction and changelog tagging is a trust failure from the first interaction.

**Delivers:**
- `FloatingOrb.tsx` — Portal-rendered at `document.body`; context-aware primary action via `createMemo` (reads `activePage`, `selectedAtom()`, `entropyScore`); idle/thinking/streaming/expanded states; pure CSS animation (no animation library); `overlayState` extended with `'ai-orb'`
- `ConversationTurnCard.tsx` — shared question-flow component (3-4 options + freeform); used by triage, review, and compression coach
- `AISuggestionTray.tsx` — approve/reject queue; persistent AI badge; `AI_APPLY_SUGGESTION` calls existing handlers with `source: 'ai'` in changelog; rejected suggestions removed from state only
- `AI_TRIAGE_INBOX` handler in worker — collects inbox items + scores; calls AI adapter; yields `AISuggestion` objects for type + section per card
- Zod validation at AI adapter boundary — LLM JSON output validated before `dispatch()`; sectionItemId existence check against current store; user-friendly error messages (never raw Zod errors)
- Streaming: `ReadableStream` → `AI_TOKEN` messages → SolidJS `batch()` signal accumulation; JSON parsed from fully accumulated content only after `[DONE]`
- `AbortController` tied to orb overlay lifecycle; stream timeout after 15 seconds; partial response shown on abort with "Retry" option

**Implements (from FEATURES.md):** Pluggable AI interface (P1), triage type suggestion (P1), triage section suggestion (P1), AI mutation changelog tagging (P1), conversational question-flow UX (P1), floating orb (P1)

**Avoids:** Pitfalls 10 (stream errors), 11 (schema validation), 13 (AI vs. user content confusion)

**Research flag:** SKIP — Portal rendering, signal accumulation for streaming, AbortController, and Zod at adapter boundary are standard SolidJS/web platform patterns with clear precedent.

### Phase 3: Review Pre-Analysis + Cloud API Integration

**Rationale:** Once the triage suggestion pattern is validated (users are accepting/dismissing correctly, the AI badge is trusted), escalate to the review use case. The pre-analysis briefing is the entry point — lower stakes than a full guided review because it is read-only (AI summarizes entropy state, no suggestions to apply). This phase also validates the cloud API path end-to-end with BYOK key flow, streaming error handling, and rate-limit recovery.

**Delivers:**
- `AI_START_REVIEW` handler (mode: `'pre-analysis'`) — reads aggregate entropy state + stale task count + projects without next actions + compression candidates; uses browser LLM (SmolLM2 sufficient for summarization); formatted briefing streamed to orb
- Sequential review step queue — one API call at a time for conversational flows (no `Promise.all()` for parallel questions)
- Rate limit UI: "AI is thinking..." skeleton with cancel button; user-friendly 429 message; session call counter (>20 calls in 60s → user prompt)
- `db.reviewSession` table in Dexie — persists review state at each completed step; resume prompt on app load when unfinished session <24h old
- Anthropic cloud adapter end-to-end tested with streaming response, 15s timeout, and abort on panel close
- API key settings panel with security disclosure, visible current provider status, and key rotation flow with link to Anthropic key management

**Implements (from FEATURES.md):** Review pre-analysis briefing (P1), tiered LLM infrastructure (P1 — browser for classification, cloud for reasoning)

**Avoids:** Pitfalls 9 (rate limit retry storms), 10 (streaming errors), 12 (conversation state loss)

**Research flag:** NEEDS RESEARCH — Dexie table schema for branching review session state (which fields, how to handle partial completion and phase-skipping) and context summarization strategy to keep token costs manageable for 10-15 step reviews need design work before implementation.

### Phase 4: Guided Weekly Review + Compression Coach

**Rationale:** The full guided GTD review (Get Clear / Get Current / Get Creative with multi-turn AI conversation) is the highest-value and highest-complexity feature. It requires everything from Phases 1-3 to be stable first. The compression coach upgrade (AI explains why atoms are stale) is lower complexity and can be developed in parallel with the review flow.

**Delivers:**
- Full `AI_START_REVIEW` handler (mode: `'weekly'`) — multi-turn `ConversationTurn` flow through three GTD phases; escalates to cloud API for Get Creative (nuanced reasoning)
- `summarizeEarlierTurns()` — context summarization for reviews longer than 5 steps; prevents quadratic token cost growth
- AI accept rate tracking — if >90% over 3+ sessions, gentle prompt: "You're accepting most suggestions — take a moment to see if they still match your priorities"
- Per-session max suggestion cap (like inbox cap enforcement) — prevents suggestion queue overload during bulk triage
- Compression coach: `AI_SUGGEST_COMPRESSION` handler — reads staleness decay + semantic embeddings + link density; explains why an atom is a compression candidate with specific reasoning ("This Fact hasn't been linked since October, has 3 semantically similar Facts, and predates your decision to switch to X")
- Related atoms surface during triage — upgrade triage UI to show 2-3 semantically similar existing atoms alongside classification suggestion (existing embeddings infrastructure; UI upgrade only)

**Implements (from FEATURES.md):** Guided GTD weekly review flow (P2), compression coach with AI explanations (P2), related atoms during triage (P2)

**Avoids:** Pitfall 14 (GTD review over-automation — question-flow pattern enforced; no "accept all" for destructive operations; "why" shown per suggestion), Pitfall 15 (orb suggestion fatigue — proactive nudges opt-in only; dismissed suggestions 24h cooldown)

**Research flag:** NEEDS RESEARCH — the specific question flow design for each GTD review phase (what questions to ask, what 3-4 options to present, how to prevent Get Creative from becoming open-ended chat) has no direct precedent. FacileThings is the closest reference but manual-only; this is novel territory requiring deliberate design work before implementation spec.

---

### Phase Ordering Rationale

- **Infrastructure before features:** The architecture explicitly identifies running AI in the BinderCore worker as an anti-pattern requiring an expensive architectural reversal to fix. Phase 1 prevents this by establishing the correct worker isolation and message protocol separation from the start.
- **Triage before review:** Triage validates the accept/dismiss pattern and AI badge at the lowest stakes before they are applied to review flows where mistakes are more consequential. The `ConversationTurnCard` built for triage is reused by all subsequent AI interactions.
- **Pre-analysis before full guided review:** Pre-analysis briefing validates the cloud API path and streaming infrastructure without requiring multi-turn conversation state management. It is a natural stepping stone.
- **Features before orb depth:** The orb's GTD menu should deliver real features. Building a deeply animated orb before the underlying features are ready creates a hollow first impression. The orb UI is built in Phase 2 but its depth grows with each phase.
- **Changelog tagging in Phase 2 (not later):** Any AI suggestion surfaced without `source: 'ai'` tagging and without the AI badge is a trust failure. Both must ship with the first suggestion, not as a later addition.

### Research Flags

Phases needing `/gsd:research-phase` during planning:
- **Phase 3** — review session persistence: Dexie table schema for branching review flows and the context summarization strategy for keeping multi-step review costs reasonable. The patterns exist but BinderOS-specific implementation decisions need design work.
- **Phase 4** — GTD question flow design: specific questions for each review phase, how to structure the conversational turns for Get Creative without it becoming open-ended chat. Novel territory relative to existing tools.

Phases with standard patterns (skip research):
- **Phase 1** — Worker isolation, Transformers.js, Anthropic CORS, and WebGPU feature detection are all well-documented with verified patterns in STACK.md and ARCHITECTURE.md.
- **Phase 2** — Portal rendering, signal accumulation for streaming, AbortController, and Zod validation at adapter boundary are standard SolidJS/web platform patterns.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified against npm, official blogs, and GitHub releases. Transformers.js v3/v4 distinction is critical and well-sourced. wasm-pack deprecation confirmed via official Inside Rust Blog July 2025. OpenAI browser CORS limitation confirmed across multiple community and official sources. |
| Features | MEDIUM-HIGH | Competitor analysis from multiple sources; GTD phases from official David Allen/FacileThings docs. Anti-features are first-principles but validated by HBR research on AI fatigue (2025-2026). Differentiator claims (entropy-informed suggestions) are novel by design — no empirical validation yet. |
| Architecture | HIGH | Verified directly against existing BinderOS codebase (`worker.ts`, `bridge.ts`, `store.ts`, `messages.ts`, `embedding-worker.ts`). All integration points confirmed against actual source files. LLM Worker isolation pattern from official WebLLM and MDN docs. |
| Pitfalls | HIGH (infrastructure) / MEDIUM (GTD UX) | Browser LLM memory/CORS/Worker pitfalls are from official docs, official incident reports (Obsidian Security), and real production behavior. GTD-specific AI UX pitfalls (suggestion fatigue, automation bias) are community wisdom + first-principles; solid reasoning but less empirical backing specific to BinderOS. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **SmolLM2 CPU inference speed on real hardware:** Research gives approximate figures (100-300ms/token for 135M on modern CPU). Performance on a 4-year-old laptop or a device without discrete GPU is unknown until measured. Do not commit to "instant" classification UX before benchmarking on representative hardware; design for graceful degradation to cloud API if browser LLM is too slow.

- **OpenAI in v2.0:** ARCHITECTURE.md recommends Anthropic + Ollama/LM Studio and deferring OpenAI direct support (no browser CORS). Users with only an OpenAI key cannot use cloud AI without a proxy. Accept this constraint for v2.0 and document it clearly in the settings panel. Revisit for v2.x with a lightweight CORS relay option.

- **Review question flow design:** What questions does the AI ask in each GTD phase? What 3-4 options does the user see? How are answers accumulated into the next-turn context without growing token cost quadratically? This is the most content-design-heavy part of the system and has no direct precedent. Needs deliberate design work before Phase 4 implementation.

- **Dexie schema for review session persistence:** The `db.reviewSession` table needs a schema that supports partial completion, phase-skipping, and context summarization. Design before Phase 3 implementation begins.

- **Suggestion cap policy:** ARCHITECTURE.md recommends a `maxSuggestions` cap on `state.aiSuggestions[]`. The right number and the UX for communicating it are unresolved. Validate during Phase 2 UX design with realistic triage scenarios.

---

## Sources

### Primary (HIGH confidence)
- Official SolidJS GitHub releases — v1.9.11 confirmed stable
- [Inside Rust Blog: Sunsetting the rustwasm org](https://blog.rust-lang.org/inside-rust/2025/07/21/sunsetting-the-rustwasm-github-org/) — wasm-pack deprecated; wasm-bindgen transferred to new org
- [Transformers.js v4 preview announcement](https://huggingface.co/blog/transformersjs-v4) — v4 is `@next` only as of Feb 9 2026; use v3.8.1
- [SmolLM2 model collection — HuggingFace](https://huggingface.co/collections/HuggingFaceTB/smollm2-6723884218bcda64b34d7db9) — ONNX + Transformers.js support confirmed; 135M, 360M, 1.7B
- [fetch-event-stream GitHub](https://github.com/lukeed/fetch-event-stream) — v0.1.6, 741 bytes, Oct 2025
- [Simon Willison: Anthropic direct browser CORS](https://simonwillison.net/2024/Aug/23/anthropic-dangerous-direct-browser-access/) — `anthropic-dangerous-direct-browser-access` header confirmed required
- [Chrome Developers: Cache models in the browser](https://developer.chrome.com/docs/ai/cache-models) — Cache API (not IndexedDB) for model storage
- [MDN WorkerNavigator.gpu](https://developer.mozilla.org/en-US/docs/Web/API/WorkerNavigator/gpu) — WebGPU in dedicated workers confirmed; `requestAdapter()` check required
- [WebLLM Documentation](https://webllm.mlc.ai/docs/) — model lifecycle, `initProgressCallback`, `engine.unload()`
- [OpenAI: Best Practices for API Key Safety](https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety) — localStorage explicitly discouraged
- [OpenAI API: Rate limits guide](https://developers.openai.com/api/docs/guides/rate-limits) — exponential backoff with jitter recommended
- Existing BinderOS codebase — `worker.ts`, `bridge.ts`, `store.ts`, `messages.ts`, `embedding-worker.ts` verified directly (ground truth for integration points)

### Secondary (MEDIUM confidence)
- [Mozilla AI Blog: 3W for in-browser AI](https://blog.mozilla.ai/3w-for-in-browser-ai-webllm-wasm-webworkers/) — Worker isolation architecture; memory crash behavior documented
- [Simon Willison: SmolLM2-360M browser demo](https://simonwillison.net/2024/Nov/29/structured-generation-smollm2-webgpu/) — confirmed browser-runnable with WebGPU, Nov 2024
- [HBR Feb 2026: AI doesn't reduce work, it intensifies it](https://hbr.org/2026/02/ai-doesnt-reduce-work-it-intensifies-it) — anti-automation research
- [HBR Sep 2025: AI-generated workslop](https://hbr.org/2025/09/ai-generated-workslop-is-destroying-productivity) — AI content authorship risks
- [Stack Overflow Developer Survey 2025](https://www.baytechconsulting.com/blog/the-ai-trust-paradox-software-development-2025) — 46% distrust AI accuracy
- [FacileThings: GTD weekly review](https://facilethings.com/blog/en/the-weekly-review-updated) — Get Clear/Get Current/Get Creative structure; closest reference for review flow design
- [Obsidian Security: Browser extensions stealing API keys](https://www.obsidiansecurity.com/blog/small-tools-big-risk-when-browser-extensions-start-stealing-api-keys) — documented real-world key theft from AI productivity tools
- [OpenAI community: CORS limitation](https://community.openai.com/t/cross-origin-resource-sharing-cors/28905) — OpenAI does not support direct browser CORS confirmed

### Tertiary (LOW confidence)
- SmolLM2 CPU inference speed figures (100-300ms/token for 135M) — community benchmarks; measure at integration time before committing to UX expectations
- WebLLM + existing WASM thread contention numbers — architecture analysis from Mozilla AI blog; no BinderOS-specific measurements
- IronCalc (spreadsheet WASM) — self-described early-stage; deferred to v3.0; no evaluation needed for v2.0

---

## v1.0 Research Reference

The prior SUMMARY.md covering the core v1.0 stack (SolidJS, Rust/WASM, Dexie, entropy engine, typed atoms) was written 2026-02-21. Key conclusions from that research that remain relevant to v2.0:

- **Safari ITP storage eviction** — `navigator.storage.persist()` must already be called at app startup (v1.0 concern); v2.0 adds a separate concern: `navigator.storage.persist()` before caching LLM model weights in the Cache API
- **IndexedDB write-queue pattern** — all v2.0 mutations (including AI-applied suggestions) must route through the existing write queue; this is already the architecture
- **wasm-pack is deprecated** — already addressed in v1.0 build pipeline; no change for v2.0
- **SolidJS destructuring kills reactivity** — applies equally to all new v2.0 components (FloatingOrb, ConversationTurnCard, AISuggestionTray)
- **Entropy guilt machine risk** — the AI overlay must not make the entropy system feel more punishing; AI suggestions should reduce friction during reviews, not add new pressure

*See `.planning/research/STACK.md`, `.planning/research/FEATURES.md`, `.planning/research/ARCHITECTURE.md`, `.planning/research/PITFALLS.md` for full v2.0 research detail.*

---
*Research completed: 2026-02-22*
*Ready for roadmap: yes*
