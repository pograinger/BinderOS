---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: Device-Adaptive AI
status: executing
stopped_at: Completed 24-05-PLAN.md
last_updated: "2026-03-10T00:50:51.910Z"
last_activity: 2026-03-10 — Phase 24 Plan 05 complete (Enrichment wizard UI + InboxView integration)
progress:
  total_phases: 13
  completed_phases: 7
  total_plans: 28
  completed_plans: 27
  percent: 98
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-05)

**Core value:** Every piece of stored information must encode predictive value about future actions, decisions, or understanding — if it doesn't change behavior, it's noise, and the system actively manages this boundary.
**Current focus:** Phase 14 — Prompt Sanitization (Plans 01+02 complete, Plan 03 next)

## Current Position

Phase: 24 (Unified Enrichment Wizard)
Plan: 06 complete (all plans done)
Status: Complete
Last activity: 2026-03-10 — Phase 24 Plan 06 complete (graduation flow UI with quality gates)

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
| Phase 23 P01 | 12 | 2 tasks | 4 files |
| Phase 23 P02 | 6 | 2 tasks | 2 files |
| Phase 23 P03 | 5 | 2 tasks | 2 files |
| Phase 24 P02 | 2 | 2 tasks | 2 files |
| Phase 24 P01 | 6 | 2 tasks | 14 files |
| Phase 24 P04 | 2 | 2 tasks | 3 files |
| Phase 24 P03 | 5 | 2 tasks | 5 files |
| Phase 24 P06 | 8 | 2 tasks | 3 files |
| Phase 24 P05 | 12 | 3 tasks | 4 files |

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
- [Phase 23-01]: Classifier registry lazy-loads class names from classes JSON for decomposition (35) and context-tagging (6)
- [Phase 23-01]: Expert exam batch schema (array per API call) for efficiency; 57.5% accuracy on actionability validates genuine difficulty
- [Phase 23-02]: Indirect adversarial prompts (scenarios, not labels) prevent label leakage; F1-weighted budget allocation (40%/35%/25%)
- [Phase 23-02]: Gap analysis extracts suggested examples into training JSONL automatically (dual output: report + data)
- [Phase 23]: Only corrections (Claude disagrees with model) appended to training JSONL; confirmations logged but not duplicated
- [Phase 23]: Retrain orchestrator calls existing train scripts via subprocess without modifying them; 0.5% regression threshold
- [Phase 24]: Local stubs for getTiersUsed/getModelNames pending Plan 01 provenance.ts creation
- [Phase 24]: SVG numeric attributes passed as String() for SolidJS JSX type compatibility
- [Phase 24]: Provenance uses 32-bit bitmask: bits 0-7 for 8 model IDs, bits 8-14 for 7 operation types
- [Phase 24]: Quality gate weights: tier source 0.4, maturity 0.4, user content 0.2; level thresholds at 0.7/0.5/0.3
- [Phase 24]: Pipeline dedup by tier+name (not tier alone) to support T2A+T2B coexistence at tier 2
- [Phase 24]: T2B returns confidence:0 when no WASM worker — natural fallback, no special error path
- [Phase 24]: Added originalContent to EnrichmentSession for re-evaluation; generateTemplateOptions per-category replaces non-existent getQuestionsForCategories
- [Phase 24]: Graduation children skip re-triage via immediate CLASSIFY_INBOX_ITEM after CREATE_INBOX_ITEM
- [Phase 24]: Soft quality gate warns but allows force-create; user always has final say on graduation
- [Phase 24]: Inline wizard replaces suggestion strip area (not modal); Enrich button always visible on all cards; each answer persists immediately to Dexie

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
- Phase 24 added: Unified Enrichment Wizard

### Pending Todos

- Lightweight local computation validation sidecar (math.js + date-fns)
- Wolfram computation engine integration (local + cloud)

## Session Continuity

Last session: 2026-03-10T00:50:51.907Z
Stopped at: Completed 24-05-PLAN.md
Resume file: None
