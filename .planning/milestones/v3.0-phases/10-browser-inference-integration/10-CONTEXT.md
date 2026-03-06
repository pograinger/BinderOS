# Phase 10: Browser Inference Integration - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire the fine-tuned ONNX type classifier (from Phase 9) into the browser's 3-Ring Binder tiered pipeline so inbox triage works fully offline. Covers model loading, Cache API caching, ONNX inference in the embedding worker, confidence-based escalation, ambiguous result display, and graceful fallback. No new model training, no settings panel (Phase 11), no section routing (Phase 12).

</domain>

<decisions>
## Implementation Decisions

### Model download experience
- Progress indicator appears in the existing status bar at bottom — non-intrusive, consistent with current AI status display
- If user triggers triage while model is still downloading, proceed with Tier 1 keyword heuristics immediately — user is never blocked
- Silent completion — status bar indicator disappears when download finishes, no toast or confirmation
- If download fails (network error, CORS), silent fallback to Tier 1 — no error shown to user, retry automatically next session

### Ambiguous classification display
- When top-2 type probabilities are within 0.15 of each other, show two side-by-side buttons (e.g., [Decision] [Insight]) — no pre-selection, user picks
- Subtle "could be either" label above the two buttons — explains why there are two options without being technical
- Record both top-1 and top-2 type + confidence in ClassificationEvent — contested examples are the most valuable retraining data
- When model IS confident (clear winner), pre-fill type as current behavior — different UX naturally signals confidence level

### Model loading timing
- Eager loading at app boot, alongside MiniLM embedding model — ~200-400KB, <100ms parse, ready before user ever opens inbox
- Load ONNX model in the existing embedding worker (same thread as MiniLM) — embeddings and classification in one worker, zero data transfer overhead
- ONNX classifier file committed to `public/models/classifiers/` — served as static asset by Vite, same pattern as MiniLM model
- Cache API cache key includes model version hash (e.g., "onnx-classifier-v1-abc123") — new model version = automatic re-download, old versions cleaned up

### Fallback and escalation behavior
- When ONNX model fails, degradation is completely invisible to the user — same triage card regardless of which tier answered
- Keep current tier and confidence display in triage suggestion card as-is — transparency for power users and debugging
- No model status info visible until Phase 11 settings panel — Phase 10 is pure plumbing, model just works silently
- Escalation from Tier 2 to Tier 3 (cloud LLM) is automatic when confidence below 0.78 — the existing pre-send approval modal IS the gate, no extra friction

### Claude's Discretion
- Exact Cache API implementation details (cache name, cleanup strategy for old versions)
- Status bar progress indicator visual design (spinner, bar, text)
- ONNX Runtime Web initialization config (threading, WASM backend settings)
- How to coordinate model readiness signal between embedding worker and store

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/search/embedding-worker.ts`: Production-ready Transformers.js wrapper with CLASSIFY_TYPE and ROUTE_SECTION message handlers. Already handles model loading, error recovery, and cosine similarity classification against centroids.
- `src/ai/tier2/tier2-handler.ts`: `createTier2Handler()` — pluggable Tier 2 handler that sends messages to embedding worker. Currently uses centroid similarity; needs upgrade to ONNX inference.
- `src/ai/tier2/pipeline.ts`: `dispatchTiered()` — escalation engine with handler registry. Stops at first handler meeting confidence threshold.
- `src/ai/tier2/centroid-builder.ts`: Centroid persistence to Dexie config table — same pattern can be used for model metadata.
- `src/storage/classification-log.ts`: ClassificationEvent with `modelSuggestion?: AtomType`, `tier?`, `confidence?`, `embedding?` fields already defined.
- `src/ui/signals/store.ts`: `tier2Status` and `tieredEnabled` signals already exist. `initTieredAI()` registers Tier 1 + 3; Tier 2 is registered on embedding worker MODEL_READY.

### Established Patterns
- Worker bridge: Singleton workers with `postMessage()` request / `addEventListener('message')` response, UUID-based correlation
- Pure modules: AI pipeline files import no store — all state passed by caller
- Tiered pipeline: Pluggable `TierHandler` interface with `canHandle()` / `handle()` methods
- Confidence formula: `bestScore * 0.7 + separation * 0.3` rewards clear separation between top candidates
- Sequential triage: Items processed one at a time to prevent rate limit exhaustion

### Integration Points
- `CONFIDENCE_THRESHOLDS['classify-type']` currently 0.65 — needs update to 0.78 per STATE.md decision
- `useTiered` flag in `triageInbox()` already gates tiered pipeline usage
- Embedding worker's `CLASSIFY_TYPE` handler currently does centroid cosine similarity — needs new `CLASSIFY_ONNX` message type for real model inference
- `tier2-handler.ts` needs to switch from centroid-based to ONNX-based classification when model is available
- onnxruntime-web already installed (v1.24.2) from Phase 9 validation harness

</code_context>

<specifics>
## Specific Ideas

- Two side-by-side buttons for ambiguous types is the key UX change — should feel like a natural fork in the triage card, not an error state
- "Could be either:" label should be small and understated — the buttons themselves communicate uncertainty
- The model should feel like it was always there — no fanfare on download, no visible degradation on failure, no extra friction on escalation

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-browser-inference-integration*
*Context gathered: 2026-03-04*
