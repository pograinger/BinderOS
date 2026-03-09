---
phase: 19-tier-2-clarification-wizard-model
plan: 02
subsystem: database, ai
tags: [dexie, entity-graph, clarification, binder-config, json, types]

# Dependency graph
requires:
  - phase: 14-sanitization-classifier
    provides: v5 Dexie migration pattern, entityRegistry table pattern
  - phase: 18-tier-2-decomposition-model
    provides: pure module patterns for AI pipeline files
provides:
  - ClarificationResult, MissingInfoCategory, ClarificationQuestion type definitions
  - GTD Personal binder type config with 5 categories and question templates
  - Build-time binder config loader (getBinderConfig)
  - Template-based option generation with slot-filling (generateTemplateOptions)
  - Enrichment utility (appendEnrichment, parseEnrichment)
  - Dexie v6 migration with entityGraph table and compound index
  - Entity graph seeding helpers (seedEntityRelationship, getRelationships, getRelationshipsByType)
affects: [19-03, 19-04, 19-05]

# Tech tracking
tech-stack:
  added: []
  patterns: [binder-type-config-json, entity-graph-single-direction-storage, enrichment-separator-pattern]

key-files:
  created:
    - src/ai/clarification/types.ts
    - src/ai/clarification/enrichment.ts
    - src/ai/clarification/question-templates.ts
    - src/config/binder-types/index.ts
    - src/config/binder-types/gtd-personal.json
    - src/storage/migrations/v6.ts
    - src/storage/entity-graph.ts
  modified:
    - src/storage/db.ts

key-decisions:
  - "Single-direction entity graph storage with bidirectional query helpers (fewer records, simpler CRDT)"
  - "Non-null assertion for default binder config to satisfy noUncheckedIndexedAccess"

patterns-established:
  - "Binder type config: JSON files at src/config/binder-types/ loaded at build time via Vite import"
  - "Entity graph: single-direction storage + getRelationships bidirectional query"
  - "Enrichment separator: \\n---\\n divides original content from structured key:value enrichment lines"

requirements-completed: [CLAR-08, CLAR-09]

# Metrics
duration: 5min
completed: 2026-03-09
---

# Phase 19 Plan 02: Foundations Summary

**Clarification type definitions, GTD Personal binder config with slot-filling templates, Dexie v6 entity graph table, and enrichment utility**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-09T02:12:18Z
- **Completed:** 2026-03-09T02:17:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- All clarification interfaces defined (ClarificationResult, ClarificationQuestion, ClarificationAnswer, etc.) for Plans 03-05
- GTD Personal binder config with 5 categories, atom-type-specific question templates, and {topic}/{person}/{location} slot placeholders
- Dexie v6 migration adds entityGraph table with compound index [sourceAtomId+entityType] for efficient per-atom queries
- Entity graph helpers support seeding from any source and bidirectional querying with single-direction storage
- Enrichment utility appends structured key:value lines and parses them back

## Task Commits

Each task was committed atomically:

1. **Task 1: Create clarification types, binder config, and question templates** - `407a3de` (feat)
2. **Task 2: Create entity graph Dexie table and seeding helpers** - `0566502` (feat)

## Files Created/Modified
- `src/ai/clarification/types.ts` - All clarification system type definitions
- `src/ai/clarification/enrichment.ts` - Atom content enrichment (append/parse structured key:value lines)
- `src/ai/clarification/question-templates.ts` - Template-based option generation with slot-filling from binder config
- `src/config/binder-types/index.ts` - Build-time binder config loader exporting getBinderConfig()
- `src/config/binder-types/gtd-personal.json` - Default GTD Personal binder type config
- `src/storage/migrations/v6.ts` - Dexie v6 migration adding entityGraph table
- `src/storage/entity-graph.ts` - Graph seeding and query helpers
- `src/storage/db.ts` - Wired v6 migration and entityGraph table declaration

## Decisions Made
- Single-direction entity graph storage with bidirectional query helper (getRelationships queries both sourceAtomId and targetValue) -- fewer records and simpler CRDT conflict resolution
- Used non-null assertion for default binder config access to satisfy noUncheckedIndexedAccess strict mode

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All type contracts ready for Plans 03-05 to implement against
- Entity graph table ready for seeding in Plan 04
- Binder config architecture extensible for future binder types
- Question template generator ready for ClarificationFlow UX in Plan 04

---
*Phase: 19-tier-2-clarification-wizard-model*
*Completed: 2026-03-09*
