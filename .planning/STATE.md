---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: Device-Adaptive AI
status: completed
stopped_at: Completed 19-05-PLAN.md
last_updated: "2026-03-09T03:00:32.463Z"
last_activity: 2026-03-09 — Phase 19 Plan 05 complete (self-learning option ranking and end-to-end verification)
progress:
  total_phases: 12
  completed_phases: 5
  total_plans: 19
  completed_plans: 19
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-05)

**Core value:** Every piece of stored information must encode predictive value about future actions, decisions, or understanding — if it doesn't change behavior, it's noise, and the system actively manages this boundary.
**Current focus:** Phase 14 — Prompt Sanitization (Plans 01+02 complete, Plan 03 next)

## Current Position

Phase: 19 of 19 (Tier 2 Clarification Wizard Model)
Plan: 5 of 5
Status: Complete
Last activity: 2026-03-09 — Phase 19 Plan 05 complete (self-learning option ranking and end-to-end verification)

Progress: [██████████] 98%

## Performance Metrics

**Velocity (v3.0 baseline):**
- Total plans completed (v3.0): 8
- v3.0 timeline: 2 days

**By Phase (v3.0):**

| Phase | Plans | Completed |
|-------|-------|-----------|
| 9. Python Training | 2 | 2026-03-04 |
| 10. Browser Inference | 3 | 2026-03-04 |
| 11. Tech Debt + Settings | 3 | 2026-03-05 |

*v4.0 metrics will populate as plans complete.*
| Phase 12 P01 | 15 | 2 tasks | 4 files |
| Phase 12 P02 | 10 | 2 tasks | 3 files |
| Phase 12 P03 | 5 | 1 tasks | 2 files |
| Phase 13-multi-provider-cloud P01 | 12 | 2 tasks | 9 files |
| Phase 13-multi-provider-cloud P02 | 4 | 3 tasks (incl. human-verify) | 4 files |
| Phase 14-sanitization-classifier P01 | 48 | 2 tasks | 10 files |
| Phase 14-sanitization-classifier P02 | 9 | 2 tasks | 11 files |
| Phase 17 P01 | 10 | 2 tasks | 26 files |
| Phase 17 P02 | 7 | 2 tasks | 4 files |
| Phase 17 P03 | 45 | 2 tasks | 5 files |
| Phase 18 P01 | 18 | 2 tasks | 6 files |
| Phase 18 P02 | 10 | 2 tasks | 6 files |
| Phase 18 P03 | 5 | 2 tasks (incl. human-verify) | 3 files |
| Phase 19 P01 | 8 | 2 tasks | 39 files |
| Phase 19 P02 | 5 | 2 tasks | 8 files |
| Phase 19 P03 | 7 | 2 tasks | 6 files |
| Phase 19 P04 | 6 | 3 tasks | 4 files |
| Phase 19 P05 | 8 | 2 tasks | 3 files |

## Accumulated Context

### Decisions

Recent decisions affecting v4.0:
- [v3.0] Fine-tuned ONNX replaces centroid matching; 0.78 confidence threshold (Platt-calibrated)
- [v4.0 research] iOS explicitly excluded from WASM LLM — route to Tier 2 + cloud only
- [v4.0 research] Sanitization must use FP16/Q8 quantization (INT8 collapses recall 30-40%)
- [v4.0 research] CloudAdapter refactor must precede sanitization wiring (avoids double-refactor)
- [v4.0 research] Sanitization runs in embedding worker or dedicated sanitization-worker (memory budget TBD)
- [v4.0 research] SanitizedPrompt branded type enforces sanitization-before-logEntry at compile time
- [Phase 12]: Template engine uses TypeScript template literals (not Eta.js) — zero dependencies, matches codebase pattern
- [Phase 12]: Briefing is fully offline — anyAIAvailable() guard removed from startReviewBriefing and startGuidedReview
- [Phase 12]: compression.ts dead code removed (buildCompressionBatchPrompt, parseCompressionBatchResponse, buildFallbackExplanations, tier1PreFilter) -- all replaced by template path
- [Phase 12]: generatePhaseSummary stays LLM-eligible -- intentionally not replaced by templates (phase transition summaries benefit from AI synthesis)
- [Phase 12]: Fixed dead sectionAtoms filter in derivePatternSteps: a.sectionId === section.id replaces return false, enabling real per-section empty detection
- [Phase 13-01]: OpenAI SDK used for OpenAI-compatible providers — streaming support via for-await loop
- [Phase 13-01]: v2 key storage format: per-provider encrypted entries; v1 (single Anthropic key) auto-migrated on decryptAllFromStore
- [Phase 13-01]: Duck-typing replaces CloudAdapter type-cast in Shell.tsx — both adapters supported via setPreSendApprovalHandler check
- [Phase 13-02]: Provider badge in communication log uses inline-block badge style with border for visual distinction
- [Phase 13-02]: StatusBar shows two distinct mutually exclusive segments: 'Cloud: {ProviderName}' vs 'Local AI'
- [Phase 13-02]: Model override field hidden for Custom provider — model set in endpoint form instead
- [Phase 14-02]: Dedicated sanitization worker for NER (not reusing embedding worker) — isolates memory footprint
- [Phase 14-02]: SanitizedPrompt branded type with unique symbol prevents raw string assignment to CloudRequestLogEntry
- [Phase 14-02]: Entity registry compound Dexie index [normalizedText+category] for efficient dedup
- [Phase 14-02]: NER model loaded lazily on first SANITIZE message — zero memory until cloud dispatch used
- [Phase 14-02]: Regex CONTACT precedence over NER PERSON in overlap resolution
- [Phase 17]: MLP (256,128) for multi-class GTD classifiers, (128,64) for binary; all exceed 98% accuracy with 100% Python/Node parity
- [Phase 17]: Classifier registry pattern (ClassifierConfig) replaces single-session globals; TYPE_CLASSIFIER loads eagerly, GTD_CLASSIFIERS load lazily
- [Phase 17]: ONNX wasmPaths must use object form { wasm } in Vite workers — string form triggers broken dynamic import()
- [Phase 17]: GTD classifiers must run sequentially (not Promise.all) — single-threaded WASM backend errors on concurrent sessions
- [Phase 18]: MLP(256,128) for 35-class decomposition classifier; 99.6% accuracy, 100% Node parity; 0.70 confidence threshold
- [Phase 18]: Decomposition uses 0.60 confidence threshold (lower than type classification) — 35 classes + user-triggered = acceptable
- [Phase 18]: Slot extractor reuses sanitization regex-patterns for PERSON/LOCATION — no duplicate entity detection
- [Phase 18]: Decomposer uses classifyFn injection so tier2 handler provides pre-computed ONNX scores without double inference
- [Phase 18]: Accepted decomposition steps created as CREATE_INBOX_ITEM (enter normal triage flow with AI classification)
- [Phase 18]: Project marking is user-decided per instance (not auto-marked)
- [Phase 19]: MLP(128,64) for all 6 binary clarification classifiers; all exceed 98% accuracy, 100% Node parity
- [Phase 19]: Enriched text examples in completeness training data prevent re-triage infinite loops
- [Phase 19]: 0.75 completeness gate threshold, 0.60 for 5 missing-info classifiers
- [Phase 19]: Single-direction entity graph storage with bidirectional query helpers (fewer records, simpler CRDT)
- [Phase 19]: Binder type config as JSON at src/config/binder-types/, loaded at build time via Vite import
- [Phase 19]: handleClarificationComplete in store.ts: enrichment, entity graph seeding, classification log, and re-triage in one focused function
- [Phase 19]: Cloud clarification options bypass self-learning ranking (already contextual); template options ranked by frequency with 70% skip threshold

### Phase Ordering Note

Phase 15 (Device-Adaptive LLM) is independent of Phases 13-14 and can execute on a parallel branch. Default execution order is 12 → 13 → 14 → 15 → 16.

### Blockers/Concerns

- Worker memory budget for sanitization model needs measurement (now using dedicated worker — architecture decided)
- Android WASM LLM sentinel threshold (2 tokens/sec) needs validation on real mid-range hardware during Phase 15

### Roadmap Evolution

- Phase 17 added: Tier 2 GTD classification models
- Phase 18 added: Tier 2 next action decomposition model
- Phase 19 added: Tier 2 clarification wizard model
- Phase 23 added: Cloud-tutored local model reinforcement

### Pending Todos

- Lightweight local computation validation sidecar (math.js + date-fns)
- Wolfram computation engine integration (local + cloud)

## Session Continuity

Last session: 2026-03-09T03:00:04.786Z
Stopped at: Completed 19-05-PLAN.md
Resume file: None
