---
phase: 26-intelligence-sidecar-schema
plan: 01
subsystem: database
tags: [dexie, indexeddb, zod, schema, migration, intelligence-sidecar, entity-registry, smart-links]

requires:
  - phase: 25-iterative-enrichment-deepening
    provides: "enrichmentDepth fields, v8 migration, enrichment persistence"
provides:
  - "AtomIntelligence sidecar type and Dexie table for all AI-generated knowledge"
  - "Entity and EntityRelation types and Dexie tables for entity registry"
  - "SmartLink Zod schema and smartLinks[] field on all atoms"
  - "Sidecar CRUD helpers (getIntelligence, writeEnrichmentRecord, writeCognitiveSignals)"
  - "Entity CRUD stubs (createEntity, findEntityByName, createRelation)"
  - "v9 migration: drops entityGraph, strips enrichment from content, resets maturity"
affects: [27-entity-detection-registry, 28-relationship-inference, 29-entity-consumers]

tech-stack:
  added: []
  patterns: ["intelligence sidecar pattern: AI knowledge stored separately from atom.content", "direct Dexie writes for sidecar (not WriteQueue)"]

key-files:
  created:
    - src/types/intelligence.ts
    - src/storage/migrations/v9.ts
    - src/storage/atom-intelligence.ts
    - src/storage/entity-helpers.ts
  modified:
    - src/types/atoms.ts
    - src/storage/db.ts
    - src/ui/signals/store.ts

key-decisions:
  - "Sidecar CRUD uses direct db.put() not WriteQueue -- sidecar writes are independent of atom content pipeline"
  - "Entity graph seeding removed from store.ts clarification handler -- will be rewired in Phase 27 with new entity tables"
  - "CRDT fields initialized with deviceId='' and schemaVersion=1 -- real CRDT comes in v7.0"

patterns-established:
  - "Intelligence sidecar: all AI knowledge in atomIntelligence table, never in atom.content"
  - "getOrCreateIntelligence pattern: lazy-create empty sidecar row on first access"

requirements-completed: [SIDE-01, SIDE-02, SIDE-04, ENTR-01, ENTR-02]

duration: 5min
completed: 2026-03-11
---

# Phase 26 Plan 01: Intelligence Sidecar Schema Summary

**Dexie v9 migration with atomIntelligence/entities/entityRelations tables, SmartLink schema, sidecar CRUD helpers, and entity-graph replacement**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-11T05:15:19Z
- **Completed:** 2026-03-11T05:20:26Z
- **Tasks:** 2
- **Files modified:** 7 (4 created, 2 modified, 1 deleted)

## Accomplishments
- Complete intelligence type system with Zod schemas for AtomIntelligence, Entity, EntityRelation, SmartLink
- v9 migration that drops old entityGraph table, creates 3 new tables with compound indexes, strips enrichment text from content
- Sidecar CRUD helpers with category+depth dedup for enrichment records
- Entity CRUD stubs proving new tables work for Phase 27

## Task Commits

Each task was committed atomically:

1. **Task 1: Create intelligence type system and smart link schema** - `3a9a9bc` (feat)
2. **Task 2: Create v9 migration and update database schema** - `c2ccb20` (feat)

## Files Created/Modified
- `src/types/intelligence.ts` - All v5.0 type definitions: AtomIntelligence, Entity, EntityRelation, SmartLink, RELATIONSHIP_TYPES
- `src/types/atoms.ts` - Added smartLinks[] field to BaseAtomFields
- `src/storage/migrations/v9.ts` - Dexie v9 migration: drop entityGraph, create 3 tables, strip enrichment, reset maturity
- `src/storage/db.ts` - Updated table declarations, v9 migration call, removed entityGraph
- `src/storage/atom-intelligence.ts` - Sidecar CRUD: get, getOrCreate, writeEnrichment, writeCognitiveSignals
- `src/storage/entity-helpers.ts` - Entity stubs: createEntity, findEntityByName, createRelation
- `src/storage/entity-graph.ts` - DELETED (replaced by entity-helpers.ts)
- `src/ui/signals/store.ts` - Removed seedEntityRelationship import and call, removed CATEGORY_ENTITY_MAP

## Decisions Made
- Sidecar CRUD uses direct db.put() not WriteQueue -- sidecar writes are independent of atom content pipeline
- Entity graph seeding removed from store.ts clarification handler -- will be rewired in Phase 27 with new entity tables
- CRDT fields initialized with deviceId='' and schemaVersion=1 -- real CRDT comes in v7.0

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed seedEntityRelationship usage from store.ts**
- **Found during:** Task 2 (entity-graph.ts deletion)
- **Issue:** store.ts imported and called seedEntityRelationship from entity-graph.ts which was being deleted
- **Fix:** Removed import, call site, and unused CATEGORY_ENTITY_MAP constant; added comment noting Phase 27 will rewire
- **Files modified:** src/ui/signals/store.ts
- **Verification:** TypeScript compile and Vite build pass
- **Committed in:** c2ccb20 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential fix -- deleting entity-graph.ts required updating its consumer. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All sidecar types and tables ready for Phase 26 Plan 02 (enrichment migration to sidecar)
- Entity stubs ready for Phase 27 (entity detection and registry)
- SmartLink schema ready for UI integration
- Existing enrichment data will be wiped by v9 migration (intentional -- sidecar replaces content-embedded enrichment)

---
*Phase: 26-intelligence-sidecar-schema*
*Completed: 2026-03-11*
