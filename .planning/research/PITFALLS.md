# Pitfalls Research

**Domain:** Adding AI orchestration to existing browser-based PKM (SolidJS + Rust/WASM + Dexie.js)
**Researched:** 2026-02-22
**Confidence:** HIGH for browser LLM memory/CORS/Worker pitfalls (verified against official docs and multiple sources); MEDIUM for GTD-specific AI UX pitfalls (community wisdom + first-principles derivation); LOW for specific WebLLM + existing WASM thread contention numbers (architecture-specific, limited production reports)

---

## Critical Pitfalls

### Pitfall 1: Browser LLM Model Download Blocks First Use Without Progressive UX

**What goes wrong:**
A WebLLM-based in-browser model (e.g., Phi-3-mini, SmolLM) requires downloading 500MB–3GB of model weights on first use. Without explicit progress feedback and a non-blocking loading path, the user clicks the orb, nothing appears to happen for 30–120 seconds, then the UI either errors or silently succeeds. Users who reach this dead end do not try again. Chrome tabs crash when model downloads are interrupted mid-session and then retried without proper cache cleanup. Even on fast connections, DeepSeek-8B takes 2–3 minutes to initialize on first load.

**Why it happens:**
Developers test on their own fast hardware with models already cached. The first-run experience on a fresh install — a slow connection, a 4-year-old laptop, or a mobile device — is never tested. WebLLM's `CreateMLCEngine()` is async but does not communicate progress by default unless the developer wires up `initProgressCallback`.

**How to avoid:**
- Defer browser LLM loading entirely: do not start model download until the user explicitly enables "local AI" in settings. Never download silently on app load.
- Use WebLLM's `initProgressCallback` to show a percentage progress bar (bytes downloaded / total bytes). This is a first-class API — use it.
- Cache models in the Cache API (not IndexedDB — Google's storage team explicitly recommends Cache API for AI model files). Call `navigator.storage.persist()` before the download to prevent cache eviction from wiping a 2GB model.
- Show estimated download size before the user commits: "Downloading SmolLM2-135M (270 MB). This only happens once."
- For users whose hardware cannot run local inference (WebGPU unavailable, <4GB RAM), show an immediate, friendly degradation: "Local AI unavailable on this device — connect a cloud API in settings instead."

**Warning signs:**
- No `initProgressCallback` in model initialization code
- Model download starts at app launch, not on explicit user action
- No size disclosure to the user before download begins
- No Cache API persistence call (`navigator.storage.persist()`) before model caching

**Phase to address:** Phase 1 — LLM Infrastructure Foundation. The progressive loading and fallback architecture must be designed before any AI feature is built on top of it.

---

### Pitfall 2: Browser LLM Memory Pressure Crashes the Existing WASM Engine

**What goes wrong:**
BinderOS already has a WASM module (BinderCore) running inside the Worker thread with its own memory budget. Adding a WebLLM model in the same Worker — or even in a separate Worker on the same page — creates memory competition. The existing WASM module uses wasm-bindgen's default linear memory (typically 64MB initial, expandable). A quantized 3B-parameter model requires approximately 2–3GB of memory including KV cache during inference. On devices with 8GB RAM, Chrome will terminate tabs under memory pressure. The BinderCore module and IndexedDB write queue can be corrupted mid-operation when the tab is killed and restarted.

Reported behavior: Chrome tabs crash when multiple WebLLM instances are initialized simultaneously without explicit cleanup. Switching between model variants without calling `engine.unload()` and `engine.reload()` causes cumulative memory growth until crash.

**Why it happens:**
WASM modules do not share memory by default — each module gets its own linear memory heap. Developers add the LLM worker without measuring the combined memory footprint. The existing WASM module is invisible when testing the LLM feature in isolation.

**How to avoid:**
- Run browser LLM inference in a fully separate dedicated Worker from the BinderCore Worker. This isolates memory pressure and prevents a crashed LLM Worker from corrupting BinderCore state.
- Use only quantized models for browser inference: SmolLM2-135M (270MB) for fast triage, Phi-3-mini-Q4 (~1.5GB) for heavier classification. Never load a non-quantized model.
- Before initializing any browser LLM, check available memory: `if (performance.memory) { const available = performance.memory.jsHeapSizeLimit - performance.memory.usedJSHeapSize; if (available < 2_000_000_000) { fallbackToCloud(); } }`. Note: `performance.memory` is Chrome-only and non-standard, so gate on availability.
- Call `engine.unload()` explicitly when the user dismisses the AI panel or after a configurable idle timeout (e.g., 5 minutes). This returns the VRAM and model memory.
- Test the combined memory footprint: load BinderOS with 500 atoms scored by BinderCore, then trigger WebLLM model load. Measure peak memory before shipping.

**Warning signs:**
- LLM Worker initialized in same Worker as BinderCore
- No `engine.unload()` call on AI panel close
- Memory not checked before model load
- Only tested in isolation (LLM without BinderCore running, or BinderCore without LLM)

**Phase to address:** Phase 1 — LLM Infrastructure Foundation. Worker isolation architecture must be established before any LLM feature is wired to the UI.

---

### Pitfall 3: WebGPU Unavailability Silently Breaks Browser LLM with No User Explanation

**What goes wrong:**
WebGPU is now enabled by default in Chrome, Edge, Firefox, and Safari (as of early 2026). However, "enabled" does not mean functional: Chrome's WebGPU is blocked on virtual machines, many corporate networks with GPU-less machines, and specific driver combinations. Firefox's implementation has a 10% crash rate with complex shader workloads. Safari on iOS blocks WebGPU for third-party browsers. `navigator.gpu` exists but `navigator.gpu.requestAdapter()` can return `null` even when the API is "available." A null adapter causes WebLLM to throw with a cryptic error about device initialization, not a user-friendly "GPU not available" message.

**Why it happens:**
Developers test on their own machine (GPU, latest drivers, good RAM). `typeof navigator.gpu !== 'undefined'` returns true on all modern browsers, so a simple existence check passes while the adapter is still unusable. The actual check requires an async `requestAdapter()` call.

**How to avoid:**
- Use the correct feature detection pattern before any WebLLM initialization:
  ```typescript
  async function isWebGPUAvailable(): Promise<boolean> {
    if (!navigator.gpu) return false;
    try {
      const adapter = await navigator.gpu.requestAdapter();
      return adapter !== null;
    } catch {
      return false;
    }
  }
  ```
- Run this check at settings panel load, not at inference time. Store the result in the AI provider config so the UI can show the correct options immediately.
- If WebGPU unavailable: show "Local AI requires WebGPU, which is not available on this device. Connect a cloud API instead." Do not show this as an error — it is a capability gap, not a failure.
- Never attempt to fall back to CPU-based WASM inference for LLMs silently: CPU inference of even small models runs at <1 token/second, which is unusable. It is better to surface the cloud API option clearly.

**Warning signs:**
- `if (navigator.gpu)` used as the sole check instead of `requestAdapter()`
- No GPU unavailability message in the settings UI
- No test in a headless or VM environment where WebGPU returns null adapter

**Phase to address:** Phase 1 — LLM Infrastructure Foundation. WebGPU feature detection is a prerequisite for all browser LLM features.

---

### Pitfall 4: Anthropic API Requires a Special Header for Direct Browser Access; OpenAI Does Not Support It

**What goes wrong:**
Anthropic added direct browser CORS support in August 2024, but it requires an explicit opt-in header: `anthropic-dangerous-direct-browser-access: true`. Without this header, all `fetch()` calls to `api.anthropic.com` from the browser fail with a CORS error. OpenAI's API does NOT support direct browser CORS as of February 2026 — calls to `api.openai.com` from browser code are blocked by CORS policy regardless of any headers. Developers who see Anthropic working assume OpenAI works the same way, then spend hours debugging a fundamental platform difference.

**Why it happens:**
The two providers have made different architectural decisions about browser access. Documentation for each is siloed — OpenAI's docs do not warn about CORS explicitly in the "getting started" path, and Anthropic's header requirement is easy to miss.

**How to avoid:**
- For Anthropic: add the `anthropic-dangerous-direct-browser-access: true` header to every request from the AI provider layer. Make this explicit in the provider implementation (`ai/anthropic.ts`) with a comment explaining why.
- For OpenAI: do not attempt direct browser calls. The correct pattern for local-first apps with "bring your own key" is to proxy through a locally-running proxy OR accept that the OpenAI provider can only be used via Ollama or LM Studio (which do support CORS from localhost). Document this limitation clearly in the settings UI.
- Alternatively: implement a tiny optional relay server (single file, self-hostable) that holds the OpenAI key server-side. For v2.0 scope, it is more pragmatic to focus on Anthropic (CORS-native) + Ollama (localhost, no CORS) + WebLLM (in-browser) and defer OpenAI direct support.

**Warning signs:**
- `fetch('https://api.openai.com/...')` called directly from browser code without a proxy
- No `anthropic-dangerous-direct-browser-access` header in the Anthropic adapter
- Single generic `CloudAIProvider` that assumes all cloud APIs behave the same

**Phase to address:** Phase 1 — LLM Infrastructure Foundation (provider interface + CORS-correct implementations).

---

### Pitfall 5: API Keys Stored in localStorage Are Readable by Every Browser Extension

**What goes wrong:**
If the user's OpenAI or Anthropic API key is written to `localStorage`, `sessionStorage`, or IndexedDB, any browser extension with the `storage` permission can read it. This is not a theoretical attack: documented incidents show malicious extensions specifically targeting API keys from AI productivity tools. If a key is exfiltrated, the user faces unauthorized API usage and billing charges before they notice.

The architecture document currently notes "User provides API key; stored in localStorage/config only" — this is the dangerous default.

**Why it happens:**
localStorage is the path of least resistance for persisting user-provided configuration. Developers think "it's the user's own key, they accepted the risk" — but users do not understand that localStorage is extension-readable, and the app implicitly creates that risk by storing there.

**How to avoid:**
- **Preferred approach:** Store the key in memory only for the session lifetime. On app reload, the user must re-enter it. For a personal productivity app opened once per session, this is an acceptable UX trade-off.
- **If persistence is required:** Use the `PasswordCredential` API (Chrome only, limited support) or encrypt the key with a user-provided passphrase using the Web Crypto API (`AES-GCM`) before writing to IndexedDB. The passphrase must be entered at each session — defeating the convenience, which is intentional.
- **Always show:** A visible security notice in the settings panel: "Your API key is stored in your browser. Be cautious of browser extensions from untrusted sources." Link to instructions for revoking and rotating the key.
- **Implement key rotation UX:** "Revoke and re-enter key" flow that clears the stored key and provides a link to the provider's key management page.
- **Never log the key:** No console.log, no error message, no network request should ever include the API key value.

**Warning signs:**
- `localStorage.setItem('apiKey', key)` anywhere in the codebase
- No security disclosure in the API key settings UI
- No key rotation flow
- API key included in error messages or logged to console

**Phase to address:** Phase 1 — LLM Infrastructure Foundation. Security model for key storage must be decided before any key entry UI is built.

---

### Pitfall 6: Worker Thread Contention — AI Requests Block WASM Scoring During Active Use

**What goes wrong:**
The existing Worker (`worker.ts`) owns WASM scoring (`compute_scores`, `compute_entropy`, `filter_compression_candidates`) and all storage operations. If AI inference requests are routed through the same Worker, a cloud API call (2–10 seconds with streaming) or browser LLM inference (5–60 seconds) blocks the Worker's message queue. During that block:
- `CREATE_ATOM` commands wait
- `flushAndSendState()` is delayed
- The 10-minute periodic re-scoring interval skips
- Cap enforcement responses are delayed

Users who type in a task mid-review will see the UI freeze until the AI call completes.

**Why it happens:**
The Worker already handles AI-adjacent operations (compression candidates, entropy scoring) so developers assume adding AI calls there is natural. JavaScript Workers are single-threaded — `await`ing a long API call blocks all other message processing in that Worker.

**How to avoid:**
- Run cloud API calls and WebLLM inference in a dedicated AI Worker, completely separate from the BinderCore Worker. The AI Worker communicates with the main thread via its own message channel.
- The main thread coordinates: user action triggers BinderCore Worker (fast, ms-range) OR AI Worker (slow, seconds-range) based on operation type. They never block each other.
- The AI Worker receives a snapshot of relevant atoms (passed by value, not reference) from the main thread's store. It does not touch IndexedDB or the BinderCore WASM module directly.
- For streaming responses: the AI Worker emits incremental `AI_CHUNK` responses to the main thread which updates the UI. The BinderCore Worker remains unblocked.
- Message protocol additions for the AI Worker should be in a separate type file (`types/ai-messages.ts`) to avoid contaminating the existing `types/messages.ts` contract. This prevents the risk of breaking the TypeScript exhaustiveness check in `worker.ts` (`const _exhaustive: never = msg`).

**Warning signs:**
- `fetch()` to an LLM API called inside the existing `worker.ts`
- `AI_REQUEST` message type added to the existing `Command` union in `messages.ts`
- No separate AI Worker file in `src/worker/`
- Tests only check AI feature in isolation (not concurrent with atom mutations)

**Phase to address:** Phase 1 — LLM Infrastructure Foundation. Worker separation must be architectural, not retrofitted.

---

### Pitfall 7: Extending the Existing Message Protocol Breaks the Exhaustiveness Check

**What goes wrong:**
The existing `worker.ts` uses a TypeScript exhaustiveness check:
```typescript
default: {
  const _exhaustive: never = msg;
  void _exhaustive;
}
```
If AI-related commands are added to the `Command` union in `messages.ts`, the TypeScript compiler will correctly flag missing handlers — but if a developer adds the union member without handling it, the build fails. More dangerously: if new message types are added to `Response` in `messages.ts` without updating every `onmessage` handler in the main thread (e.g., in `bridge.ts` and signal store), those messages will be silently ignored.

**Why it happens:**
The message protocol is a stable contract established in Phase 1–3. Adding AI features under time pressure leads to cramming new message types into the existing union rather than designing a clean separation. Each addition makes the union larger and the handler switch in `worker.ts` longer.

**How to avoid:**
- Create a separate `types/ai-messages.ts` with its own `AICommand` and `AIResponse` union types. The AI Worker uses these exclusively.
- Never add AI command types to the existing `Command` union. The BinderCore Worker handles BinderCore commands. The AI Worker handles AI commands.
- When adding to the existing `Response` union (e.g., `AI_SUGGESTION` might legitimately flow through the main bridge), add a handling case in all `onmessage` handlers simultaneously — never add a union member without handling it everywhere.
- Run TypeScript strict mode (`"strict": true` in tsconfig) at all times — this catches union exhaustiveness failures at compile time.

**Warning signs:**
- `types/messages.ts` has more than 20 command types
- AI-related types mixed with atom CRUD types in same union
- `switch (msg.type)` in `worker.ts` has a `default` case that silently does nothing (swallowed type)

**Phase to address:** Phase 1 — LLM Infrastructure Foundation (establish the AI Worker message protocol) before any AI feature is implemented.

---

### Pitfall 8: SharedArrayBuffer Headers Break the Existing App if Required by WASM Threads

**What goes wrong:**
WebLLM's multi-threaded WASM mode requires `SharedArrayBuffer`, which requires two HTTP response headers:
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

These headers change how the browser handles cross-origin resources on the entire page. If BinderOS loads any cross-origin resources without proper CORP/COEP headers (CDN assets, Google Fonts, external images, third-party scripts), those resources will fail to load after enabling these headers. This is a page-wide breaking change, not scoped to the LLM Worker.

**Why it happens:**
Developers enable multi-threaded mode for better LLM performance without auditing all cross-origin resource loads. The headers are set at the hosting server level, affecting all pages, not just the AI feature.

**How to avoid:**
- Use WebLLM in single-threaded mode by default (no SharedArrayBuffer required). Performance is lower but the app architecture remains unchanged.
- Audit all cross-origin resource loads before enabling COOP/COEP: fonts, analytics, icons, CDN assets. If any are present without CORP headers, multi-threaded mode is blocked.
- For a local-first PWA: all assets should be self-hosted anyway (font files bundled, no CDN). If this is already the case, COOP/COEP can be enabled without external resource breakage.
- If enabling: test with `Cross-Origin-Embedder-Policy: credentialless` first (more permissive, Chrome 96+, less CORS breakage) before stepping up to `require-corp`.

**Warning signs:**
- External CDN URLs in `index.html` or Vite config
- Google Fonts `<link>` in `index.html`
- Third-party analytics script loaded without `crossorigin` attribute
- App tested with COOP/COEP locally but not with all production assets

**Phase to address:** Phase 1 — LLM Infrastructure Foundation. Audit the asset baseline before deciding on WebLLM threading model.

---

### Pitfall 9: Cloud API Rate Limit Retries Without Backoff Exhaust the User's Quota

**What goes wrong:**
During a guided weekly review, the app may make 5–15 API calls in rapid sequence (one per review question). Without explicit rate limit handling, a 429 response causes an immediate retry, which triggers another 429, which triggers another retry. Exponential without jitter causes retry storms: all queued review steps retry at the same intervals, overwhelming the user's per-minute token budget. Anthropic and OpenAI both use token-bucket systems — a burst that empties the bucket means all retries are rejected for up to 60 seconds.

Additionally: failed requests still count against the per-minute request limit. Aggressive retries can consume the entire request quota, blocking all AI features for the remainder of the minute.

**Why it happens:**
Review flows feel like they should be reliable and sequential, so developers implement simple retry logic. Jitter is not intuitive — developers expect exponential backoff alone to solve the problem.

**How to avoid:**
- Implement exponential backoff with jitter for all cloud API calls:
  ```typescript
  async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        if (err.status !== 429 || attempt === maxRetries - 1) throw err;
        const delay = Math.min(1000 * 2 ** attempt + Math.random() * 1000, 32000);
        await new Promise(r => setTimeout(r, delay));
      }
    }
    throw new Error('Max retries exceeded');
  }
  ```
- Queue review steps sequentially, never in parallel. One API call at a time for conversational flows.
- Show the user a visible "AI is thinking..." state with a cancel button during each step. If rate limited, show "Taking longer than expected — the AI service is busy" rather than a raw error.
- Implement a session-level call counter. If >20 calls in 60 seconds, pause and show "Slow down — you're making requests quickly. Continue?" This prevents accidental cost runaway from rapid repeated review triggers.

**Warning signs:**
- `Promise.all()` used to fire multiple AI calls simultaneously during review
- No retry delay or immediate retry on 429
- No visible AI loading state with cancel option
- No per-session call count tracking

**Phase to address:** Phase 1 — LLM Infrastructure Foundation (retry infrastructure) and Phase 2 — Review UX (sequential flow enforcement).

---

### Pitfall 10: Streaming Response Errors Leave the UI in a Partial State

**What goes wrong:**
Streaming AI responses (via `fetch()` with `ReadableStream` or Anthropic/OpenAI streaming SDK) deliver tokens incrementally. If the network drops, the tab loses focus and is throttled, or the user's API quota expires mid-stream, the stream terminates abruptly. Without an `AbortController` and stream cleanup, the UI shows a partial response — sometimes ending mid-sentence — with no error indicator and no retry option. The suggestion pipeline receives an incomplete suggestion and may attempt to parse it as valid JSON (for structured outputs), producing a parse error that the user sees as a cryptic failure.

**Why it happens:**
Streaming is added for perceived responsiveness but error paths are tested with happy-path networks. Mid-stream termination is common on mobile connections and battery-throttled browsers.

**How to avoid:**
- Always attach an `AbortController` to streaming fetches. Tie the controller to the component/panel lifecycle: when the AI panel closes, abort the stream.
- Track stream state machine: `idle` → `streaming` → `complete` | `aborted` | `error`. Only process the response buffer in `complete` state.
- For structured outputs (JSON classifications, suggestion lists): use streaming only for display; parse the full accumulated content only after `[DONE]`. Never attempt to parse intermediate chunks.
- Implement a stream timeout: if no chunk arrives for 15 seconds, abort and show "AI response timed out — try again."
- On error: show the partial response grayed out with a "Response was cut off" notice and a "Retry" button. Do not discard the partial content silently.

**Warning signs:**
- No `AbortController` attached to AI fetch calls
- JSON parsing attempted on streaming chunks
- No timeout for stalled streams
- AI panel close does not cancel in-progress stream

**Phase to address:** Phase 2 — Cloud AI Integration.

---

### Pitfall 11: AI Suggestions Applied to Atom Data Without Schema Validation Create Silent Corruption

**What goes wrong:**
When the AI suggests a classification (atom type, section, priority), the LLM may return values outside the valid schema: an atom type not in the `AtomType` union, a sectionItemId that no longer exists in the database, a priority value of "high" instead of the expected numeric tier, or a `dueDate` in an unrecognized format. If suggestions are passed directly to `dispatch({ type: 'CREATE_ATOM', payload: aiSuggestion })` without validation, Zod will throw a schema error in the Worker, which surfaces as a generic `ERROR` response with a cryptic message like "Expected 'task' | 'fact' | 'event' | 'decision' | 'insight', received 'Task'". The atom is not created, but the user sees an error that looks like a bug in the app, not in the AI output.

**Why it happens:**
AI outputs feel authoritative — the response is structured JSON, it looks right, so it gets passed through. Zod validation exists but runs inside the Worker after the dispatch, making errors hard to attribute to the AI response.

**How to avoid:**
- Validate AI suggestions at the boundary of the AI adapter layer (in `ai/anthropic.ts` or `ai/noop.ts`) using the same Zod schemas used for user input. Return a typed result with an `error` field if validation fails.
- Use a dedicated `AISuggestion` type that is a subset of valid atom fields — do not let the AI adapter return a full `CreateAtomInput` directly; have the UI merge the suggestion with user-confirmed defaults.
- Log validation failures from AI responses with the full raw LLM output. This is the primary debugging tool for improving prompts.
- For sectionItemId suggestions: validate that the ID exists in the current store before surfacing the suggestion. Stale IDs (user deleted a project) should degrade to "no section" rather than failing.

**Warning signs:**
- `dispatch(aiSuggestion)` without intermediate validation
- No Zod parse on AI response before use
- AI errors showing Zod validation messages to users
- No logging of raw AI response on validation failure

**Phase to address:** Phase 2 — AI Suggestion Pipeline.

---

### Pitfall 12: Conversation State Lost on Tab Refresh Destroys In-Progress Reviews

**What goes wrong:**
A guided weekly review involves 5–15 sequential AI-assisted questions. If the user refreshes the tab, navigates away, or the browser restores the session, the entire conversation state is lost. The user is returned to the beginning of the review with no memory of their earlier answers. For a 15-minute review session, losing state at minute 12 is catastrophically frustrating and will cause users to stop using the review feature entirely.

Additionally: multi-turn conversations accumulate context window usage. A 15-question review with full history re-sent at each step can consume 8,000–12,000 tokens per review, creating unexpected cost.

**Why it happens:**
In-memory conversation state is the path of least resistance. Developers defer "persist conversation" as a nice-to-have until users report the loss.

**How to avoid:**
- Persist conversation state to IndexedDB at each review step via a lightweight `db.reviewSession` table. Structure: `{ id, phase, questionIndex, answers: [{question, answer, atomIds}], startedAt, lastActiveAt }`.
- On app load: check for an unfinished review session. If found (less than 24 hours old): show "Resume your weekly review from where you left off?" prompt.
- For cost management: do not re-send the full conversation history with each step. Summarize completed steps into a compact context: "User has completed: inbox triage (7 items classified), project review (3 projects active)." Send summary + current question only.
- Cap context: if the review conversation exceeds 6,000 tokens, compress earlier turns before sending. Implement a `summarizeEarlierTurns()` function in the AI adapter.

**Warning signs:**
- Conversation state stored only in a SolidJS `createSignal` (ephemeral)
- No `db.reviewSession` or equivalent persistence table
- Full conversation history re-sent with every API call
- No resume prompt on app load when a review is in progress

**Phase to address:** Phase 2 — Review UX.

---

### Pitfall 13: Unclear AI vs. User Content Erodes Trust Over Weeks of Use

**What goes wrong:**
When AI suggestions are accepted and written to atoms, users lose track of which content they authored and which the AI suggested. After two weeks of use, users look at their task list and realize they cannot remember making several of those decisions. This "whose is it?" ambiguity undermines ownership of the system. Users begin to distrust the AI suggestions because they cannot evaluate the AI's track record — they don't know which atoms were AI-suggested.

Separately: if AI suggestions look visually identical to user content, users scan past them without engaging. The suggestion does not communicate "this requires your attention."

**Why it happens:**
Displaying AI suggestions in the same visual style as user content is easier to implement. Source metadata is added to the schema but not surfaced in the UI because "it feels cluttered."

**How to avoid:**
- Every AI-suggested atom or AI-modified field must carry a `source: 'ai'` tag in the atom schema alongside a `suggestedAt` timestamp. This was already planned (additive AI mutations with changelog tracking).
- In the atom list and atom detail views: show a persistent, subtle but visible AI badge (e.g., a small orb icon with "AI" label) on all AI-sourced content. Never make it invisible.
- In the atom detail: show "Suggested by AI on [date] · [Accept suggestion | Review | Dismiss]" for any pending AI suggestion.
- Allow bulk "accept" for routine suggestions (inbox triage) but require individual confirmation for anything that modifies an existing atom (compression, merging).
- Make the AI attribution dismissible per atom: after the user explicitly reviews and confirms an AI suggestion, remove the badge. The user has taken ownership.

**Warning signs:**
- No `source` or `aiMetadata` field in the atom schema
- AI suggestions display in the same visual style as user-created atoms
- No badge or attribution in the atom list
- No way to distinguish AI-suggested from user-created atoms in the changelog

**Phase to address:** Phase 2 — AI Suggestion Pipeline (schema + visual attribution together, before any suggestion is surfaced to users).

---

### Pitfall 14: AI Over-Automating GTD Reviews Causes Users to Lose System Awareness

**What goes wrong:**
The core GTD principle is that the review is a thinking process, not a sorting process. If the AI pre-classifies all inbox items, pre-suggests all next actions, and pre-identifies all stale projects before the user sees them, the user's role becomes "approve" clicks. Weeks of approving AI suggestions without thinking builds automation bias: the user stops evaluating whether suggestions are correct. When the AI makes a wrong suggestion (and it will), the user approves it reflexively, and trust collapses when they notice the error later.

"The most common reason GTD fails is skipping the weekly review — without regular reviews, your trusted system becomes outdated and unreliable." An AI that makes reviews feel automatic will cause users to stop engaging mentally, producing the same failure mode as skipping reviews entirely.

**Why it happens:**
AI capability benchmarks reward automation. Developers show how many clicks the AI saves. The metric of "clicks eliminated" conflicts with the GTD goal of "thinking practiced."

**How to avoid:**
- Design reviews as question-flows (GSD-style), not decision streams. The AI presents analysis and a question; the user answers. The AI does not answer for the user.
- Limit AI pre-analysis per session: surface 3–5 AI insights at the start of a review ("I found 4 stale projects and 12 unclassified inbox items"), then let the user navigate. Do not front-load all AI suggestions at once.
- Never auto-accept any suggestion without explicit user confirmation — not even high-confidence classifications. The act of confirmation is the thinking practice.
- Show a "Why is this suggested?" explanation for every AI suggestion (e.g., "This task has been unmodified for 45 days and has no linked project"). Explanation engagement is a leading indicator of healthy AI use.
- Track the ratio of AI suggestions accepted vs. modified vs. rejected. If accept rate is >90% over 3+ sessions, show a gentle prompt: "You're accepting most suggestions — take a moment to see if they still match your priorities."

**Warning signs:**
- Review flow starts by displaying all AI suggestions before any user input
- No "why" explanation for AI suggestions
- AI accept rate not tracked
- Single "Accept all" button prominent in review UI

**Phase to address:** Phase 2 — Review UX (question-flow design must be deliberate from the start, not retrofitted after an "accept all" flow is built).

---

### Pitfall 15: AI Suggestion Fatigue from Proactive Orb Interruptions

**What goes wrong:**
A floating orb that proactively surfaces suggestions ("You have 3 items to review" badge, pulsing animation, nudges) trains users to ignore it within two weeks — identical to browser notification permission fatigue. Once the orb is mentally dismissed, the primary AI entry point is dead. Worse: if the orb fires during focused deep work, it breaks flow. Users who value BinderOS for focus management will disable the orb entirely if it interrupts them.

2025 UX research shows AI suggestion fatigue is accelerating: 46% of developers do not trust AI accuracy (Stack Overflow 2025), and unsolicited suggestions that turn out to be wrong accelerate distrust by roughly 3x compared to solicited suggestions that are wrong.

**Why it happens:**
The orb's value is measured by engagement. Product instincts push toward more nudges, more badges, more proactive moments. The orb is visible confirmation that the AI is "working." Developers confuse "the AI is active" with "the user wants to be interrupted."

**How to avoid:**
- The orb must be opt-in for all proactive behavior. Default: orb is static (no pulsing, no badges) and responds only when clicked.
- Allow proactive nudges only when the user has explicitly enabled "smart reminders" in settings. Even then: maximum one nudge per session, at the end of a natural stopping point (not mid-task).
- Orb appearance variations should be minimal: idle, active (AI thinking), has-result (new suggestions available). Never use urgency animations (fast pulse, red badge) for routine suggestions.
- After the user dismisses a suggestion: respect it for 24 hours. Do not resurface the same suggestion category in the same day.
- Implement a snooze: "Remind me in 2 hours / Tomorrow / Never." "Never" removes the suggestion category from proactive surfacing permanently.

**Warning signs:**
- Orb pulses or animates by default on app load
- Badge count appears on orb without user enabling proactive mode
- Dismissed suggestions reappear in the same session
- No way to disable proactive nudges per category

**Phase to address:** Phase 3 — Floating Orb + Conversational UX.

---

### Pitfall 16: Local-First Offline Mode Has No Graceful AI Degradation Strategy

**What goes wrong:**
BinderOS is local-first: all data lives in IndexedDB, the WASM engine scores atoms offline, the full app works without network. But v2.0 AI features require network (cloud APIs) or a working WebGPU setup. If the user is offline, or their API key is expired, or WebGPU failed to initialize, every AI feature silently fails with either a generic error or a loading spinner that never resolves. The user cannot tell if the AI is loading, unavailable, or broken.

**Why it happens:**
AI features are developed with network available. The offline case is forgotten or tested manually and works "well enough" — but "well enough" in testing means "shows a red X"; in production it means "spins forever" on a spotty connection.

**How to avoid:**
- Implement a clear `AIProviderStatus` enum surfaced in the UI: `available` | `unavailable` | `loading` | `error` | `disabled`. Show this status in the orb's visual state.
- When any AI feature is requested and the provider is `unavailable`: immediately surface the unavailability reason ("No network connection" / "API key not configured" / "Local model not loaded") and the appropriate action ("Check network" / "Add API key in Settings" / "Download local model").
- For offline detection: use `navigator.onLine` as a fast pre-check before any API call. Show "AI requires network — currently offline. Your data and scoring work normally offline." This sets correct expectations.
- The entropy engine, priority scoring, and all atom operations must work completely without the AI layer. Verify this with an explicit test: disconnect network + clear API key + verify all non-AI features pass.
- For the browser LLM provider: if the model is not downloaded yet, show "Local AI not ready — download the model first in Settings (270MB)." Do not show this as an error.

**Warning signs:**
- AI features show a loading spinner that runs indefinitely when offline
- No check of `navigator.onLine` before cloud API calls
- No `AIProviderStatus` enum or visual status in the orb
- Tests do not include an offline + no-key scenario

**Phase to address:** Phase 1 — LLM Infrastructure Foundation (the no-op provider and status reporting must exist before any AI feature is built).

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Add AI commands to existing `Command` union in `messages.ts` | One fewer file, less architecture | BinderCore Worker handles AI; long AI calls block atom mutations; exhaustiveness check becomes unmaintainable | Never — separate AI message protocol from day one |
| Store API key in `localStorage` | Survives page refresh without user re-entry | Readable by browser extensions; no audit trail; user has no understanding of the risk | Never — memory-only or encrypted if persistence is required |
| Call cloud AI API from inside the existing BinderCore Worker | Simpler code, fewer Workers | AI latency blocks atom CRUD; 10-minute scoring interval disrupted; single-threaded Worker serializes everything | Never — separate AI Worker always |
| Use same Worker for WebLLM + BinderCore | Fewer Workers, simpler postMessage routing | LLM memory pressure crashes BinderCore; GPU + WASM memory compete for same heap | Never — dedicated LLM Worker always |
| Start browser model download at app startup | Model ready immediately when user wants it | 2GB background download on every fresh install; surprises user; may compete with initial atom hydration | Never — explicit user opt-in only |
| Trust LLM JSON output without schema validation | Faster pipeline, less code | Silent schema violations corrupt IndexedDB; cryptic Zod errors surface as app bugs | Never — always validate at the AI adapter boundary |
| Proactive AI suggestions by default | Higher engagement metrics | Suggestion fatigue within 2 weeks; orb becomes mentally invisible; users disable it | Never — opt-in for proactive behavior |
| Send full conversation history with every API call | Simplest context management | Token cost grows quadratically with review length; 15-step review consumes 12K+ tokens | Acceptable for reviews up to 5 steps; compress for longer flows |
| Accept all AI suggestions with one button | Reduced friction in review | Automation bias; users stop thinking; trust collapse when AI is wrong | Never for destructive operations; acceptable only for low-stakes classifications (inbox tagging) with easy undo |

---

## Integration Gotchas

Common mistakes when connecting to external services or existing internal systems.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Anthropic API (browser) | Missing `anthropic-dangerous-direct-browser-access: true` header → silent CORS failure | Add header to every Anthropic fetch in `ai/anthropic.ts`; document why in a comment |
| OpenAI API (browser) | Direct `fetch()` to `api.openai.com` → CORS blocked (no browser CORS support as of Feb 2026) | Use Ollama localhost proxy or self-hosted relay; do not support OpenAI direct in v2.0 |
| WebLLM + BinderCore WASM | Both modules in same Worker → combined memory pressure, mutual interference | Dedicated LLM Worker; BinderCore Worker unchanged |
| WebLLM model cache | Using IndexedDB for model storage → 3–10x slower than Cache API for large binary blobs | Use Cache API for model weights; call `navigator.storage.persist()` before caching |
| AI suggestions → atom store | Passing raw LLM JSON to `dispatch()` → Zod schema errors in Worker | Validate with Zod at AI adapter boundary; transform before dispatch |
| Cloud API + review flow | `Promise.all()` for concurrent review questions → rate limit 429s | Sequential queue; one API call at a time; exponential backoff with jitter on 429 |
| Streaming response + SolidJS | Updating a signal inside each stream chunk callback → too-frequent reactivity updates, UI jitter | Batch signal updates with `batch()` or debounce stream chunks (e.g., update every 50ms) |
| AI suggestion + changelog | AI mutations not tagged with `source: 'ai'` → undo behavior indistinguishable from user actions | Extend `MutationLogEntry` with `source: 'user' \| 'ai'` before v2.0 first suggestion lands |

---

## Performance Traps

Patterns that work at small scale but fail under realistic review conditions.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Sending full atom graph to cloud API in prompt | Works with 50 atoms; exceeds context window with 500 | Select only relevant atoms (compression candidates, inbox items) for each API call; never send all atoms | ~150 atoms at 500 tokens each = 75K tokens, exceeds most model context windows |
| Browser LLM inference on same thread as rendering | Works on M3 MacBook; freezes on 4-year-old laptop | Dedicated LLM Worker; all inference off main thread and off BinderCore Worker | Any device with <discrete GPU or <8GB RAM |
| Loading full WebLLM model eagerly | Smooth demo; 3-minute wait on first real user session | Explicit user opt-in; progress bar; model download behind settings toggle | First user session on any machine without cached model |
| Re-initializing WebLLM engine on every review session | Works for single review; second review takes 2 minutes | Keep engine alive for the session; only unload after idle timeout (5 min) | Any user who triggers two reviews in the same session |
| Rebuilding conversation context from scratch each API call | Works for 3-step flow; 429s at step 8 of 15-step review | Summarize completed steps; send summary + current question only | Review flows longer than ~5 steps |
| Streaming response buffering full history in memory | Works for 1 review session; memory grows for power user doing daily reviews | Clear conversation buffer after each review session completes; do not accumulate across sessions | Users doing multiple reviews per day over a week |

---

## Security Mistakes

Domain-specific security issues for adding AI to a browser-based PKM.

| Mistake | Risk | Prevention |
|---------|------|------------|
| API key in `localStorage` | Any browser extension with storage permission reads all localStorage for the origin; documented real-world theft from AI productivity tools | Memory-only by default; Web Crypto AES-GCM encryption if persistence required; visible security disclosure |
| Sending atom content to cloud API without explicit user confirmation | User's private tasks, decisions, health notes transmitted to third-party LLM without informed consent | All cloud API calls must be gated behind an explicit "send to AI?" confirmation or a persistent opt-in setting; show exactly what data will be sent |
| Prompt injection via atom content | If atom bodies contain adversarial text ("Ignore previous instructions and..."), the LLM's behavior can be hijacked | Sanitize atom content before including in prompts; use structured message formats that separate system instructions from content; wrap content in XML-style tags (`<content>...</content>`) |
| AI-generated atom data bypassing Zod validation | Malformed LLM output written to IndexedDB corrupts schema; hard to detect until rendering fails | Always validate AI-generated payloads with Zod before writing; treat AI output as untrusted external input |
| Logging conversation content to console in development | Developer leaves `console.log(prompt)` in production → user's private data visible in browser DevTools | Strip all prompt/response logging before production build; use conditional dev-only logging with `import.meta.env.DEV` guard |
| WebGPU model extraction | Cached browser LLM model weights are trivially extractable from the Cache API | Do not use proprietary or sensitive models in browser; only use open-weight models distributed for browser use |

---

## UX Pitfalls

Common user experience mistakes specific to AI orchestration in GTD/PKM tools.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| AI latency not communicated | User clicks orb, nothing happens for 3 seconds, clicks again, receives duplicate response | Show "AI thinking..." skeleton or progress immediately on click (within 100ms); disable trigger button during inference |
| Conversation state not persisted | 12 minutes into weekly review, browser refresh loses all progress | Persist each answer to IndexedDB at submission; resume prompt on next load |
| AI suggestions look identical to user content | Users lose track of what they decided vs. what AI suggested; accountability erodes | Persistent AI badge on all AI-sourced content; badge removable only after explicit user review |
| All AI suggestions surfaced before user engages | Cognitive overload; user approves suggestions reflexively | Question-flow pattern: AI presents one question at a time; user must answer before seeing the next |
| AI errors shown as technical messages | "Zod validation failed: Expected 'task'" tells user nothing actionable | All errors translated to user-facing language: "AI suggested an unrecognized item type — please classify manually" |
| No "why" explanation for suggestions | Users cannot evaluate suggestion quality; trust remains fragile | Every AI suggestion includes a brief explanation: "Suggested because this task is 45 days old with no activity" |
| Orb obscures content it references | Floating orb sits over the atom the user is trying to read | Orb repositions automatically to avoid covering focused content; user can drag to any corner |
| Hard-coded position for floating orb | Works at 1440×900; obscures critical UI at 1280×800 | Orb position respects viewport edges; remembers last user-dragged position in localStorage |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces for production readiness.

- [ ] **AI provider disabled gracefully:** App exercised with no API key, no WebLLM model, and network disconnected — all non-AI features work normally with zero errors or loading spinners. Verify: disconnect network, clear key, exercise every atom CRUD and entropy feature.
- [ ] **Memory footprint measured:** BinderOS with 500 atoms + BinderCore scoring + WebLLM model loaded simultaneously — tab does not crash on a device with 8GB RAM. Verify: Chrome Memory tab peak reading during combined use.
- [ ] **AI suggestions schema-validated:** Every path that applies an AI suggestion to an atom passes through Zod validation before `dispatch()`. Verify: send malformed LLM output (wrong type strings, missing fields) — app shows user-friendly error, not a Worker error.
- [ ] **API key not in localStorage:** Confirm `localStorage` and `sessionStorage` contain no API key values after key entry and app reload. Verify: `Object.keys(localStorage)` and `Object.keys(sessionStorage)` in console — no key value present.
- [ ] **Stream aborted on panel close:** Open AI orb, start a streaming response, close the orb — no further network requests are made. Verify: Network tab shows request cancelled.
- [ ] **Review session resumable:** Start a 5-step review, close at step 3, reopen app — "Resume review?" prompt appears and resumes at step 3 with previous answers. Verify: manual test.
- [ ] **Rate limit handled gracefully:** Manually trigger a 429 response (via a mock) — app shows user-friendly message, waits with exponential backoff, does not hammer the API. Verify: mock test.
- [ ] **AI badge visible on AI-sourced atoms:** Accept an AI suggestion, navigate away, return — AI badge is visible on the accepted atom. Verify: visual inspection after accept.
- [ ] **Orb not covering content:** On a 1280×800 viewport, the floating orb does not cover the inbox, atom list, or any primary interactive area. Verify: resize browser to 1280×800.
- [ ] **WebGPU unavailability handled:** In a VM or with `navigator.gpu` mocked to `null` — settings panel shows "Local AI requires WebGPU, not available on this device." Verify: mock `navigator.gpu = undefined` in DevTools.
- [ ] **Anthropic header present:** Verify `anthropic-dangerous-direct-browser-access: true` header in every request to `api.anthropic.com` via Network tab.
- [ ] **Conversation state persisted per step:** Mid-review, force-quit the browser — reopen app and verify review session can be resumed at the last completed step.

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| WebLLM model download corrupted in Cache API | LOW | `caches.delete('webllm-model-cache')` or Settings → "Clear AI model cache" button; re-download |
| API key exfiltrated via malicious extension | HIGH | User must revoke key at provider immediately. App provides "Revoke key" button with direct link to OpenAI/Anthropic key management. Clear stored key from app. |
| AI suggestion with schema violation written to IndexedDB | MEDIUM | Undo via the existing changelog (mutation log + undo command); run consistency check on startup. Prevention is the correct solution. |
| Review session conversation state lost on crash | MEDIUM | If `db.reviewSession` persisted: resume. If not persisted: restart review; this is the motivation for persistence. |
| Worker contention added AI to BinderCore Worker | HIGH | Refactor AI calls to dedicated Worker; this is an architectural reversal — plan is expensive. Prevention is the only good answer. |
| Suggestion fatigue drove users to disable orb | MEDIUM | Hotfix: change proactive nudges to disabled-by-default; in-app message explaining the change; settings re-introduction path. |
| Memory crash from combined WASM + LLM load | MEDIUM | Add explicit memory check before model load; fallback to cloud API automatically; show "Switching to cloud AI — insufficient memory for local model." |
| Prompt injection via atom content | HIGH | Audit and sanitize all prompt construction; review all atoms created during the injection window via changelog; notify user of potential manipulation. |

---

## Pitfall-to-Phase Mapping

How v2.0 roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Browser LLM first-load UX (Pitfall 1) | Phase 1 — LLM Infrastructure | Progress bar shows during model download; size disclosed before download starts |
| WASM + LLM memory pressure (Pitfall 2) | Phase 1 — LLM Infrastructure | Memory footprint test: 500 atoms + WebLLM simultaneous, no tab crash |
| WebGPU unavailability (Pitfall 3) | Phase 1 — LLM Infrastructure | `isWebGPUAvailable()` implemented; settings panel shows correct status on GPU-less machine |
| CORS differences between providers (Pitfall 4) | Phase 1 — LLM Infrastructure | Anthropic adapter has required header; OpenAI direct call not present in browser code |
| API key security (Pitfall 5) | Phase 1 — LLM Infrastructure | `localStorage` search finds no API key values; security notice shown in settings |
| Worker thread contention (Pitfall 6) | Phase 1 — LLM Infrastructure | AI Worker is a separate file; no AI-related calls in `worker.ts` |
| Message protocol contamination (Pitfall 7) | Phase 1 — LLM Infrastructure | `types/ai-messages.ts` exists; `types/messages.ts` has no AI-related types |
| SharedArrayBuffer header breakage (Pitfall 8) | Phase 1 — LLM Infrastructure | Audit cross-origin resources; document COOP/COEP decision before enabling |
| Rate limit retry storms (Pitfall 9) | Phase 1 — LLM Infrastructure + Phase 2 — Review UX | Retry helper with backoff+jitter present; sequential review step queue enforced |
| Streaming errors (Pitfall 10) | Phase 2 — Cloud AI Integration | AbortController on all streams; stream timeout after 15s; partial response shown on abort |
| AI suggestion schema violations (Pitfall 11) | Phase 2 — AI Suggestion Pipeline | Zod validation at AI adapter boundary; malformed output test passes with user-friendly error |
| Conversation state loss (Pitfall 12) | Phase 2 — Review UX | `db.reviewSession` table exists; resume prompt shown after simulated crash at step 3 |
| AI vs. user content confusion (Pitfall 13) | Phase 2 — AI Suggestion Pipeline | `source: 'ai'` in atom schema; AI badge visible on all AI-sourced atoms |
| GTD review over-automation (Pitfall 14) | Phase 2 — Review UX | Question-flow pattern; no "accept all" for destructive operations; "why" shown per suggestion |
| Orb suggestion fatigue (Pitfall 15) | Phase 3 — Floating Orb + Conversational UX | Proactive nudges opt-in by default; dismissed suggestions not resurfaced within 24h |
| Offline AI degradation (Pitfall 16) | Phase 1 — LLM Infrastructure | Offline + no-key smoke test passes; `AIProviderStatus` enum visible in orb; no infinite spinner |

---

## Sources

- [Mozilla AI Blog: 3W for In-Browser AI: WebLLM + WASM + WebWorkers](https://blog.mozilla.ai/3w-for-in-browser-ai-webllm-wasm-webworkers/) — MEDIUM confidence: documented memory crash behavior and Worker architecture patterns
- [WebLLM arxiv paper: A High-Performance In-Browser LLM Inference Engine](https://arxiv.org/html/2412.15803v1) — HIGH confidence: academic paper with specific performance numbers
- [WebLLM Documentation: Basic Usage](https://webllm.mlc.ai/docs/user/basic_usage.html) — HIGH confidence: official docs
- [Chrome for Developers: Cache models in the browser](https://developer.chrome.com/docs/ai/cache-models) — HIGH confidence: official Chrome team recommendation; Cache API for model storage
- [Simon Willison: Claude's API now supports CORS requests](https://simonwillison.net/2024/Aug/23/anthropic-dangerous-direct-browser-access/) — HIGH confidence: primary source analysis; `anthropic-dangerous-direct-browser-access` header documented
- [Anthropic GitHub Issue #342: CORS issue](https://github.com/anthropics/anthropic-sdk-typescript/issues/342) — HIGH confidence: official issue tracker
- [OpenAI Community: How to Fix CORS Policy Error](https://community.openai.com/t/how-to-fix-cors-policy-error-when-fetching-openai-api-from-localhost/1140420) — MEDIUM confidence: community confirmation of OpenAI CORS limitation
- [OpenAI API: Rate limits guide](https://developers.openai.com/api/docs/guides/rate-limits) — HIGH confidence: official docs; exponential backoff recommendation
- [Codinhood: Ultimate Guide to Handling AI API Rate Limits](https://codinhood.com/post/ultimate-guide-ai-api-rate-limiting) — MEDIUM confidence: verified against official docs
- [OpenAI Help Center: Best Practices for API Key Safety](https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety) — HIGH confidence: official guidance; localStorage explicitly discouraged
- [WebGPU bugs holding back browser AI — Medium/Marcelo Emmerich](https://medium.com/@marcelo.emmerich/webgpu-bugs-are-holding-back-the-browser-ai-revolution-27d5f8c1dfca) — MEDIUM confidence: documented Firefox crash rates and VM GPU blocking
- [MDN: AbortSignal.timeout()](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static) — HIGH confidence: official MDN docs; stream timeout pattern
- [MDN: Server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) — HIGH confidence: official MDN docs; 6-connection SSE limitation documented
- [Floating UI: FloatingFocusManager](https://floating-ui.com/docs/floatingfocusmanager) — HIGH confidence: official Floating UI docs; focus trap implementation
- [Getting Things Done podcast ep #318: AI in your GTD Practice](https://gettingthingsdone.com/2025/07/ai-in-your-gtd-practice/) — MEDIUM confidence: official GTD brand content; weekly review importance emphasized
- [GTD Forums: AI and GTD](https://forum.gettingthingsdone.com/threads/ai-and-gtd.17430/) — MEDIUM confidence: community discussion; automation bias concerns documented
- [Stack Overflow Developer Survey 2025: AI trust statistics](https://www.baytechconsulting.com/blog/the-ai-trust-paradox-software-development-2025) — MEDIUM confidence: survey data cited; 46% distrust figure
- [think.design: What UX for AI Products Must Solve in 2025](https://think.design/blog/what-ux-for-ai-products-must-solve-in-2025/) — MEDIUM confidence: UX research synthesis; suggestion fatigue patterns
- [getmaxim.ai: How context drift impacts conversational coherence](https://www.getmaxim.ai/articles/how-context-drift-impacts-conversational-coherence-in-ai-systems/) — MEDIUM confidence: multi-turn context management research
- [Emscripten: pthreads + COOP/COEP requirement](https://emscripten.org/docs/porting/pthreads.html) — HIGH confidence: official Emscripten docs; SharedArrayBuffer header requirements
- [Obsidian Security: Small Tools, Big Risk — Browser Extensions Stealing API Keys](https://www.obsidiansecurity.com/blog/small-tools-big-risk-when-browser-extensions-start-stealing-api-keys) — MEDIUM confidence: documented real-world key theft incident relevant to browser-stored AI keys

---
*Pitfalls research for: BinderOS v2.0 — Adding AI orchestration to an existing browser-based PKM (SolidJS + Rust/WASM + Dexie.js)*
*Researched: 2026-02-22*
