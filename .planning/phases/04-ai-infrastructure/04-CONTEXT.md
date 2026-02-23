# Phase 4: AI Infrastructure - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

The AI backbone: worker isolation, pluggable multi-model adapter interface, store extension, trust & safety model, and first-run guided setup. All verified end-to-end with a no-op adapter before connecting real AI. No user-facing AI features (triage, review) — those are Phases 5-7.

</domain>

<decisions>
## Implementation Decisions

### Settings UX
- AI settings accessible via **Ctrl+P command palette** — opens a settings panel/overlay
- **Per-feature toggles**: separate toggles for Browser LLM, Cloud API, Triage suggestions, Review analysis, Compression coach
- **Guided setup on first v2.0 launch**: step-by-step wizard walks through enabling AI, model download, cloud API key entry
- Status bar shows **activity indicator**: "Analyzing inbox...", "Preparing review...", "Idle". Model details on hover/click
- Simple labels for normal use ("Local AI: Ready") with expandable model details for power users

### Model Download
- Model downloads **during guided setup** — first-run wizard offers download with progress indicator
- **AI features blocked until model is ready** — clear message: "Downloading AI model (45%)..."
- **Simple choice**: two options — "Fast (150MB)" and "Quality (300MB)" — recommended option highlighted based on hardware detection
- **Cache API** for model storage (automatic, not user-managed). Uses navigator.storage.persist() to prevent eviction

### Security Model — Privacy Proxy Architecture
- **CRITICAL DECISION: Multi-model with privacy boundary**
  - Local LLMs have direct access to atoms (trusted, on-device)
  - Cloud/remote LLMs NEVER see raw atom data
  - Local LLM acts as **privacy proxy** — summarizes/anonymizes data before sending to cloud
  - Cloud models communicate through the local LLM, not directly with the atom store
- **User-controlled sanitization levels**: from "abstract patterns only" (counts, types, scores) to "structured summaries" (metadata without content) to "full context" (titles and content). Default is most private.
- **API keys encrypted locally**: Web Crypto AES-GCM encryption in localStorage with user passphrase. Persists across sessions.
- **Per-session consent**: each new session that uses cloud API shows brief reminder: "Cloud AI will be used via local proxy. [Continue / Disable]"
- **Full transparency on cloud requests**: every cloud request shows a preview of what the local LLM is sending. User can see exactly what data leaves the device and can cancel before sending.
- Communication log accessible in settings for review.
- **Graceful degradation without cloud key**: features work with browser LLM only at lower quality. Subtle hint: "Cloud API would improve this."

### Provider Tiers
- **Multi-provider support**: user can configure multiple cloud providers (Anthropic, Ollama, LM Studio, etc.)
- System routes to best available provider
- **Auto-upgrade on GPU detection**: if WebGPU available, automatically use larger/faster model. User sees "GPU detected — using enhanced model."
- Status bar shows activity indicator with current model engagement
- Provider adapter interface designed for extensibility from day one

### Claude's Discretion
- Exact adapter interface design and message routing
- No-op adapter implementation details
- WebGPU feature detection implementation
- Store extension field naming and structure
- Guided setup wizard step ordering and visual design

</decisions>

<specifics>
## Specific Ideas

- "I want the AI to be multi-model as a first principle" — the system should always think in terms of multiple models collaborating, not one monolithic AI
- Privacy proxy pattern inspired by how the user wants local-first privacy: "any remote, cloud models can only talk to the local LLMs about the data in a way that protects the user"
- Status bar should show "which models are being engaged" — user wants visibility into the AI pipeline, not a black box
- GSD-style guided setup: step-by-step with clear choices, not a wall of settings
- Per-feature toggles: user wants granular control over exactly which AI capabilities are active

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-ai-infrastructure*
*Context gathered: 2026-02-22*
