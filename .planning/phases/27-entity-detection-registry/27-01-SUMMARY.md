---
phase: 27-entity-detection-registry
plan: 01
subsystem: ai
tags: [ner, entity-detection, distilbert, onnx, dexie, entity-registry, dedup]

requires:
  - phase: 26-intelligence-sidecar-schema
    provides: "AtomIntelligence sidecar table, Entity table, entity-helpers stubs, intelligence types"
provides:
  - "distilbert-NER-ONNX model bundled for PER/LOC/ORG/MISC detection"
  - "DETECT_ENTITIES worker message handler alongside SANITIZE"
  - "detectEntitiesForKnowledgeGraph bridge function with DATE regex merge"
  - "Entity matcher framework with PER/LOC/ORG type-specific normalization"
  - "findOrCreateEntity dedup with confidence-based matching and alias resolution"
  - "detectEntitiesForAtom orchestrator: NER -> registry -> sidecar pipeline"
  - "Fire-and-forget entity detection on atom classify, update, and delete"
affects: [28-relationship-inference, 29-entity-consumers]

tech-stack:
  added: [onnx-community/distilbert-NER-ONNX]
  patterns: ["dual-path NER: SANITIZE maps to PII categories, DETECT_ENTITIES preserves raw labels", "type-specific entity matcher framework with pluggable normalizers", "fire-and-forget entity detection via void operator"]

key-files:
  created:
    - src/entity/types.ts
    - src/entity/entity-matcher.ts
    - src/entity/entity-detector.ts
    - public/models/onnx-community/distilbert-NER-ONNX/onnx/model_quantized.onnx
  modified:
    - src/workers/sanitization-worker.ts
    - src/ai/sanitization/sanitizer.ts
    - src/ai/sanitization/regex-patterns.ts
    - src/types/intelligence.ts
    - src/storage/atom-intelligence.ts
    - src/storage/entity-helpers.ts
    - src/ui/signals/store.ts

key-decisions:
  - "distilbert-NER-ONNX replaces sanitize-check for NER -- same architecture, gains ORG/MISC detection"
  - "DETECT_ENTITIES returns raw PER/LOC/ORG/MISC labels; SANITIZE still maps to PERSON/LOCATION for PII"
  - "DATE detection via regex (ISO, US, named month formats) merged into knowledge graph detection results"
  - "Entity dedup uses MERGE_CANDIDATE_THRESHOLD=0.7 for auto-merge in Phase 27; Phase 29 adds UX refinement"
  - "Entity detection hooked at triage acceptance and clarification completion, not STATE_UPDATE reconcile"

patterns-established:
  - "Dual NER output path: same model, different label mapping per message type"
  - "Type-specific EntityMatcher interface: normalize() + matchScore() per entity type"
  - "Fire-and-forget detection: void detectEntitiesForAtom() never blocks atom operations"
  - "Full-replace sidecar writes: writeEntityMentions replaces all mentions on re-scan"

requirements-completed: [ENTD-01, ENTD-02, ENTD-03, ENTR-03, ENTR-04]

duration: 10min
completed: 2026-03-11
---

# Phase 27 Plan 01: NER Model Swap + Entity Detection Pipeline Summary

**distilbert-NER model swap with dual-path SANITIZE/DETECT_ENTITIES worker, type-specific entity matcher framework, confidence-based registry dedup, and fire-and-forget detection lifecycle hooks**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-11T07:02:45Z
- **Completed:** 2026-03-11T07:12:52Z
- **Tasks:** 2
- **Files modified:** 15 (4 created, 11 modified/expanded, 5 model files bundled)

## Accomplishments
- Bundled distilbert-NER-ONNX (65.8MB q8) replacing custom sanitize-check, gaining ORG/MISC entity detection
- Built complete entity detection pipeline: NER worker -> sanitizer bridge -> orchestrator -> registry dedup -> sidecar write
- Implemented type-specific entity matcher framework with title stripping (PER), suffix removal (ORG), and alias resolution
- Wired fire-and-forget entity detection into atom classify, content update, and delete lifecycle

## Task Commits

Each task was committed atomically:

1. **Task 1: NER model swap, worker DETECT_ENTITIES handler, sanitizer bridge, type expansions** - `a9b4e4a` (feat)
2. **Task 2: Entity matcher framework, registry dedup, detection orchestrator, lifecycle hooks** - `8a0856a` (feat)

## Files Created/Modified
- `public/models/onnx-community/distilbert-NER-ONNX/` - Bundled NER model (model_quantized.onnx, config, tokenizer files)
- `src/workers/sanitization-worker.ts` - Model ID swap, DETECT_ENTITIES handler returning raw PER/LOC/ORG/MISC labels
- `src/ai/sanitization/sanitizer.ts` - detectEntitiesForKnowledgeGraph bridge with DATE regex merge, RawEntityMention type
- `src/ai/sanitization/regex-patterns.ts` - DATE_PATTERNS and detectDates() for ISO/US/named month date extraction
- `src/types/intelligence.ts` - EntityMention expanded with MISC/DATE types and optional entityId
- `src/storage/atom-intelligence.ts` - writeEntityMentions for full-replace sidecar persistence
- `src/entity/types.ts` - EntityDetectionResult, MatchResult, confidence threshold constants
- `src/entity/entity-matcher.ts` - personMatcher, locationMatcher, orgMatcher with normalize/matchScore
- `src/entity/entity-detector.ts` - detectEntitiesForAtom orchestrator (NER -> registry -> sidecar)
- `src/storage/entity-helpers.ts` - findOrCreateEntity with dedup, decrementEntityMentionCount, cleanupEntityMentionsForAtom
- `src/ui/signals/store.ts` - Entity detection lifecycle hooks at triage accept, clarification complete, atom delete

## Decisions Made
- distilbert-NER-ONNX chosen over bert-base-NER (65.8MB vs 108MB, same architecture as sanitize-check)
- DETECT_ENTITIES returns raw labels (PER/LOC/ORG/MISC) while SANITIZE still maps to PERSON/LOCATION for PII redaction
- DATE detection via regex only (structured patterns); natural language dates out of scope
- Entity dedup auto-merges at >= 0.7 match score in Phase 27; Phase 29 adds user confirmation UX
- Lifecycle hooks placed at triage acceptance and clarification completion points in store.ts

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- HuggingFace CLI tool (@huggingface/transformers-cli) does not exist on npm; used Python huggingface_hub.snapshot_download instead for model download

## User Setup Required
None - model files are pre-bundled in the build.

## Next Phase Readiness
- Entity detection pipeline complete and wired to atom lifecycle
- Entity registry populates automatically as atoms are classified
- Ready for Phase 27 Plan 02 (entity badge UI) and Phase 28 (relationship inference)
- Old sanitize-check model can be deleted once PII regression is validated in production

---
*Phase: 27-entity-detection-registry*
*Completed: 2026-03-11*
