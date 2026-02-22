---
phase: 01-foundation
plan: 02
subsystem: database
tags: [zod, dexie, indexeddb, crdt, write-queue, atom-schema, persistence, export]

# Dependency graph
requires:
  - phase: 01-01
    provides: "Vite + SolidJS + TypeScript scaffold, Worker bridge, ESLint config"
provides:
  - Zod schemas for five atom types (task, fact, event, decision, insight) via discriminated union
  - InboxItem schema with optional type for pre-classification
  - CreateAtomInput schema (omits worker-generated id/timestamps)
  - Section and SectionItem schemas with four stable section types
  - MutationLogEntry schema with CRDT fields (lamportClock, deviceId, before/after)
  - Worker message protocol with all command/response variants
  - Dexie database with all tables and multi-entry indexes
  - Write queue with 300ms debounce for batched IndexedDB transactions
  - CRDT-compatible changelog with lamport clock and device ID
  - Storage persistence request and status checking
  - JSON export via dexie-export-import and Markdown export
  - Four stable sections seeded on first database creation
affects:
  - 01-03 (UI shell uses atom types, sections, message protocol)
  - 01-04 (worker handlers use storage layer, write queue, changelog)
  - Phase 2 (compute engine uses atom types, changelog for scoring/entropy)
  - All future plans (Zod schemas are single source of truth for all atom data)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Zod discriminated union for five atom types: single schema generates both runtime validators and TypeScript types"
    - "Write queue pattern: 300ms debounce, all writes batched in single Dexie transaction"
    - "CRDT change log from day one: lamportClock + deviceId on every mutation entry"
    - "Multi-entry index *links on atoms table for link traversal queries"
    - "Deterministic UUIDs for seed data (consistent across fresh installs)"
    - "Storage persistence check on init with graceful degradation for unsupported browsers"
    - "Zod v4 import via 'zod/v4' path (not 'zod' default which is v3 compat)"

key-files:
  created:
    - src/types/atoms.ts (Zod schemas: AtomSchema, InboxItemSchema, CreateAtomInputSchema)
    - src/types/sections.ts (Zod schemas: SectionSchema, SectionItemSchema)
    - src/types/changelog.ts (Zod schema: MutationLogEntrySchema)
    - src/types/atoms.test.ts (15 verification tests for schema validation)
    - src/storage/db.ts (BinderDB class with all tables, indexes, seed data)
    - src/storage/write-queue.ts (WriteQueue with 300ms debounce)
    - src/storage/changelog.ts (appendMutation, initLamportClock, getDeviceId)
    - src/storage/export.ts (exportAllData JSON, exportAsMarkdown)
    - src/storage/persistence.ts (initStoragePersistence, checkPersistenceStatus, getStorageEstimate)
    - src/storage/migrations/v1.ts (seed data: four stable sections with deterministic UUIDs)
  modified:
    - src/types/messages.ts (refactored with real atom types and full command/response protocol)
    - src/worker/worker.ts (updated dispatch for all new command types as placeholders)

key-decisions:
  - "Zod v4 imported via 'zod/v4' path — the 'zod' import exposes v3 compat layer in 4.x package"
  - "Deterministic section UUIDs hardcoded (not computed) for zero runtime dependencies and simplicity"
  - "WriteQueue includes flushImmediate() for critical writes (export, shutdown) alongside normal debounce"
  - "Lamport clock stored at module level, initialized from max changelog entry on startup"
  - "Device ID stored in localStorage under 'binderos-device-id' key"
  - "Export as both JSON (machine-readable backup) and Markdown (human-readable archive)"

patterns-established:
  - "Zod schemas are single source of truth: define schema, infer TypeScript type, validate at write boundary"
  - "All IndexedDB writes go through WriteQueue — no direct db.table.put() calls from outside storage layer"
  - "Every mutation creates a MutationLogEntry with before/after snapshots and CRDT fields"
  - "Sections are stable (not user-deletable); SectionItems within sections are mutable"
  - "Storage API calls wrapped with feature detection and graceful degradation"

requirements-completed: [DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06, TRST-03, TRST-05, TRST-06, ORG-01, ORG-02]

# Metrics
duration: 7min
completed: 2026-02-22
---

# Phase 1 Plan 02: Atom Schema + Storage Summary

**Zod-validated five-type atom schema with Dexie.js IndexedDB persistence, 300ms write queue, CRDT-compatible changelog, and JSON/Markdown export**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-22T02:57:44Z
- **Completed:** 2026-02-22T03:05:03Z
- **Tasks:** 2 of 2
- **Files modified:** 12

## Accomplishments
- Five atom types (task, fact, event, decision, insight) defined as Zod discriminated union with full TypeScript type inference
- Dexie database with all 6 tables, multi-entry `*links` index for link traversal, and four stable sections seeded on first creation
- Write queue with 300ms debounce batches all IndexedDB writes into single transactions for performance
- CRDT-compatible changelog stores lamportClock, deviceId, and full before/after snapshots on every mutation
- Worker message protocol fully typed with all command/response variants for atom CRUD, inbox, sections, export, persistence, and undo
- 15 verification tests confirm schema validates correct atoms and rejects invalid ones

## Task Commits

Each task was committed atomically:

1. **Task 1: Define Zod schemas for atoms, sections, changelog, and message protocol** - `4031046` (feat)
2. **Task 2: Implement Dexie database, write queue, changelog, persistence, and export** - `a552d90` (feat)

**Plan metadata:** (created after this summary)

## Files Created/Modified
- `src/types/atoms.ts` - Zod schemas for five atom types via discriminated union, InboxItem, CreateAtomInput
- `src/types/sections.ts` - Section (four stable types) and SectionItem Zod schemas
- `src/types/changelog.ts` - MutationLogEntry schema with CRDT fields
- `src/types/messages.ts` - Refined Worker protocol with real atom types and all command/response variants
- `src/types/atoms.test.ts` - 15 vitest tests validating schema correctness
- `src/worker/worker.ts` - Updated dispatch to handle all new command types (placeholder handlers)
- `src/storage/db.ts` - BinderDB class extending Dexie with 6 tables, indexes, and seed data
- `src/storage/write-queue.ts` - WriteQueue class with 300ms debounce, flush, and flushImmediate
- `src/storage/changelog.ts` - appendMutation, initLamportClock, getDeviceId functions
- `src/storage/export.ts` - exportAllData (JSON via dexie-export-import) and exportAsMarkdown
- `src/storage/persistence.ts` - initStoragePersistence, checkPersistenceStatus, getStorageEstimate
- `src/storage/migrations/v1.ts` - Seed data for four stable sections with deterministic UUIDs

## Decisions Made
- Used `zod/v4` import path because the `zod` default in v4.x package maps to v3 compatibility layer
- Hardcoded deterministic UUIDs for the four seed sections rather than computing from hash (simpler, no runtime dependency)
- Added `flushImmediate()` to WriteQueue for critical writes that cannot wait for debounce (export, shutdown)
- Markdown export formats each atom as a section with metadata, links, and full content (single .md file)
- Device ID for CRDT stored in localStorage (not IndexedDB) so it survives database deletion/recreation

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None - all files compiled, linted, and tested on first attempt.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 01-03 can begin: binder UI shell with storage safety signals
- All atom types and storage layer are ready for Worker handler wiring (Plan 01-04)
- Message protocol is fully typed — Worker dispatch cases are placeholder stubs ready for real implementation
- Storage persistence functions ready to be called from app initialization flow
- Export functions ready to be triggered from UI export button

## Self-Check: PASSED

All key files verified:
- src/types/atoms.ts, src/types/sections.ts, src/types/changelog.ts, src/types/messages.ts: FOUND
- src/types/atoms.test.ts: FOUND
- src/storage/db.ts, src/storage/write-queue.ts, src/storage/changelog.ts: FOUND
- src/storage/export.ts, src/storage/persistence.ts, src/storage/migrations/v1.ts: FOUND
- src/worker/worker.ts: FOUND

All commits verified:
- 4031046 (Task 1: schemas): FOUND
- a552d90 (Task 2: storage): FOUND

---
*Phase: 01-foundation*
*Completed: 2026-02-22*
