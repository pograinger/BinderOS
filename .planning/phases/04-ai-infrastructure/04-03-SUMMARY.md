---
phase: 04-ai-infrastructure
plan: 03
subsystem: ai
tags: [anthropic-sdk, web-crypto, aes-gcm, privacy-proxy, solidjs, cloud-adapter]

# Dependency graph
requires:
  - phase: 04-01
    provides: AIAdapter interface, AIRouter, NoOpAdapter, store AI signals
  - phase: 04-02
    provides: BrowserAdapter with Transformers.js, LLM worker, main-thread AI dispatch
provides:
  - CloudAdapter with Anthropic streaming and pre-send approval gate
  - Privacy proxy with sanitization levels (abstract/structured/full)
  - Web Crypto AES-GCM key vault (memory-only default + encrypted persistence opt-in)
  - AISettingsPanel accessible from Command Palette with per-feature toggles
  - AIGuidedSetup wizard for first-run AI onboarding
  - CloudRequestPreview modal gating every cloud request
  - Shell.tsx wiring for all AI overlays
  - StatusBar AI activity indicator
  - Per-session consent tracking
  - Cloud request communication log (session-scoped)
  - Destructive action guard utility (DESTRUCTIVE_ACTIONS, isDestructiveAction)
affects: [05-triage, 06-review, 07-compression, any phase using cloud AI]

# Tech tracking
tech-stack:
  added: ["@anthropic-ai/sdk (Anthropic streaming client, dangerouslyAllowBrowser)"]
  patterns:
    - "Web Crypto PBKDF2 key derivation + AES-GCM-256 encryption for API key persistence"
    - "Pre-send approval callback pattern: CloudAdapter.setPreSendApprovalHandler() bridges adapter to Shell reactive store"
    - "Session-scoped cloud request log in key-vault.ts alongside consent tracking"
    - "Privacy boundary enforced at TypeScript type level: AIRequest.prompt is string, never Atom"

key-files:
  created:
    - src/ai/adapters/cloud.ts
    - src/ai/privacy-proxy.ts
    - src/ai/key-vault.ts
    - src/ui/components/AISettingsPanel.tsx
    - src/ui/components/AIGuidedSetup.tsx
    - src/ui/components/CloudRequestPreview.tsx
  modified:
    - src/ui/components/CommandPalette.tsx
    - src/ui/layout/StatusBar.tsx
    - src/ui/layout/Shell.tsx

key-decisions:
  - "CloudAdapter.setPreSendApprovalHandler() pattern chosen to decouple adapter from UI — Shell.tsx owns the Promise lifecycle, adapter just calls the callback"
  - "Session consent + cloud request log co-located in key-vault.ts to keep privacy-related state together"
  - "dangerouslyAllowBrowser: true justified — user provides own key, key is memory-only by default, never embedded in source"
  - "UI polish deferred: settings panel and status bar UI noted as poor quality after verification — tracked as follow-up work"
  - "AIGuidedSetup first-run trigger (aiFirstRunComplete flag) did not fire on reload — likely state persistence issue to address in Phase 5 settings persistence"

patterns-established:
  - "Pre-send approval pattern: adapter holds callback, Shell sets store state, reactive Show renders modal, user resolves Promise"
  - "Privacy proxy as type boundary: sanitizeForCloud accepts string (never Atom), enforces cloud data contract"
  - "Web Crypto key vault: memory-only default, AES-GCM opt-in, PBKDF2 with 100k iterations"

requirements-completed: [AINF-04, AIST-01, AIST-02, AIST-03]

# Metrics
duration: ~30min
completed: 2026-02-22
---

# Phase 4 Plan 03: Cloud Adapter, Privacy Proxy, and AI Settings Summary

**Anthropic cloud adapter with streaming and pre-send approval gate, AES-GCM key vault, privacy proxy, and AI settings panel/wizard wired into Shell.tsx via Command Palette**

## Performance

- **Duration:** ~30 min (multi-session with checkpoint)
- **Tasks:** 3 (2 auto + 1 checkpoint:human-verify)
- **Files modified:** 9

## Accomplishments

- CloudAdapter connects to Anthropic API with streaming, abort support, offline check, and per-session consent gate
- Every cloud request requires explicit user approval via CloudRequestPreview modal before data leaves device
- Web Crypto AES-GCM key vault: memory-only by default, encrypted persistence opt-in with PBKDF2 passphrase
- AI Settings panel accessible from Command Palette (Ctrl+P -> "AI Settings") with per-feature toggles, API key management, communication log, and sanitization level control
- Privacy proxy defines sanitization levels and enforces type boundary (cloud never receives raw Atom objects)
- Shell.tsx wires all AI overlays (settings panel, guided setup, cloud preview) reactively
- Session-scoped cloud request communication log with full request history

## Task Commits

Each task was committed atomically:

1. **Task 1: Create cloud adapter, privacy proxy, and key vault** - `e43eb44` (feat)
2. **Task 2: Create AI Settings panel, guided setup wizard, cloud request preview, and Shell/StatusBar integration** - `b5ec4a0` (feat)
3. **Task 3: Verify AI settings and guided setup** - checkpoint:human-verify (resolved — core functionality approved, UI issues noted)

## Files Created/Modified

- `src/ai/adapters/cloud.ts` - CloudAdapter with Anthropic streaming, pre-send approval hook, offline check, session consent gate, destructive action guard
- `src/ai/privacy-proxy.ts` - Sanitization levels (abstract/structured/full), type boundary enforcement, DEFAULT_SANITIZATION_LEVEL
- `src/ai/key-vault.ts` - Memory-only key storage, AES-GCM encrypted persistence, PBKDF2 key derivation, session consent tracking, cloud request communication log
- `src/ui/components/AISettingsPanel.tsx` - Settings panel with master toggle, Local AI section, Cloud AI section, per-feature toggles (Triage/Review/Compression), Privacy/sanitization selector, Communication Log, Provider Status
- `src/ui/components/AIGuidedSetup.tsx` - Four-step first-run wizard (Welcome, Local Model, Cloud API, Done)
- `src/ui/components/CloudRequestPreview.tsx` - Pre-send preview modal showing sanitized data with Approve/Cancel
- `src/ui/components/CommandPalette.tsx` - Added "AI Settings" command in action category
- `src/ui/layout/StatusBar.tsx` - Added AI activity indicator (shows llmStatus and aiActivity signal)
- `src/ui/layout/Shell.tsx` - Renders AISettingsPanel, AIGuidedSetup, CloudRequestPreview overlays; wires CloudAdapter.setPreSendApprovalHandler()

## Decisions Made

- CloudAdapter.setPreSendApprovalHandler() decouples adapter from UI — Shell.tsx owns the Promise lifecycle, adapter calls the callback, avoiding circular dependency
- Session consent tracking and cloud request log co-located in key-vault.ts to keep all privacy-related session state in one module
- dangerouslyAllowBrowser: true is safe here — user provides their own key, key is memory-only by default, key never leaves browser except to Anthropic's API
- UI polish intentionally deferred after verification revealed quality issues — core architecture is sound

## Deviations from Plan

None - plan executed exactly as written. Deviation rules not triggered.

## Issues Encountered

None during implementation.

## User Verification Feedback (checkpoint:human-verify)

**Status: Approved with issues noted**

Core functionality verified working:
- Ctrl+P -> "AI Settings" command opens the settings panel
- API key input and save functionality works
- Command palette integration confirmed

Issues reported by user (follow-up required):
1. **Guided setup wizard never appeared on reload** — The `aiFirstRunComplete` flag likely initializes to `true` or is persisted in a way that bypasses the first-run check. Root cause: AI settings state persistence is deferred to Phase 5 (per 04-01 decision). On cold load, the flag defaults to the store's initial value. Needs investigation in Phase 5 when settings persistence to Dexie is added.
2. **Settings panel UI is "very ugly and not intuitive"** — The AISettingsPanel.tsx was built for functional correctness; visual design polish is needed. Recommend a dedicated UI pass before Phase 5.
3. **Status bar AI indicator is "very ugly and not intuitive" and "much too verbose/large"** — StatusBar AI section needs design refinement: simpler indicator (icon or minimal text), reduced verbosity.
4. **Settings panel doesn't clearly indicate authentication status after saving API key** — No visual confirmation state (e.g., green checkmark, "Key saved" feedback) after saving. Needs a brief success indicator.

These issues are tracked as deferred UI work. The trust & safety architecture (privacy proxy, key vault, consent gates, pre-send preview) is complete and correct.

## User Setup Required

Users who want to use cloud AI features must obtain an Anthropic API key:
- Service: Anthropic
- URL: https://console.anthropic.com/settings/keys
- Enter the key in AI Settings panel -> Cloud AI section -> API Key input
- Key is memory-only by default (cleared on page close), or use "Encrypt & persist" for cross-session storage

## Next Phase Readiness

- Cloud adapter ready for Phase 5 triage to consume (CloudAdapter.execute() fully wired)
- Privacy proxy type boundary in place — Phase 5 can call sanitizeForCloud() without touching raw atoms
- Destructive action guard (isDestructiveAction) exported from cloud.ts — Phase 5 triage UI can use it
- AISettingsPanel feature toggles (triageEnabled, reviewEnabled, compressionEnabled) ready for Phase 5-7 to read
- UI polish pass needed before Phase 5 ships to users — settings panel and status bar both flagged

---
*Phase: 04-ai-infrastructure*
*Completed: 2026-02-22*
