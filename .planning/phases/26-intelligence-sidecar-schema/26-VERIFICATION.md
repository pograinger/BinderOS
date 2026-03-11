---
phase: 26-intelligence-sidecar-schema
verified: 2026-03-11T06:00:00Z
status: gaps_found
score: 9/10 must-haves verified
re_verification: false
gaps:
  - truth: "smartLinks field on atoms does not cause new TypeScript errors in atom construction sites"
    status: partial
    reason: "Adding smartLinks to BaseAtomFields introduced 3 new TS errors where atoms are manually constructed without the field (store.ts:1883, store.ts:2317, inbox.ts:38). Vite build passes but tsc --noEmit fails."
    artifacts:
      - path: "src/ui/signals/store.ts"
        issue: "Lines 1883, 2317: analysis atom construction missing smartLinks property"
      - path: "src/worker/handlers/inbox.ts"
        issue: "Line 38: inbox item construction missing smartLinks property"
    missing:
      - "Add smartLinks: [] to all manual atom/inbox construction sites (store.ts lines 1883, 2317 and inbox.ts line 38)"
---

# Phase 26: Intelligence Sidecar + Schema Verification Report

**Phase Goal:** All AI-generated knowledge lives in a structured sidecar table separate from atom content, with entity and relationship tables ready for the knowledge graph, and enrichment answers rendered from structured records instead of parsed content text
**Verified:** 2026-03-11T06:00:00Z
**Status:** gaps_found
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | atomIntelligence table exists in IndexedDB with enrichment[], entityMentions[], cognitiveSignals[], records[] arrays and CRDT metadata | VERIFIED | `src/types/intelligence.ts` lines 93-105: AtomIntelligenceSchema with all fields. `src/storage/migrations/v9.ts` line 30: `'&atomId, lastUpdated'` index. `src/storage/db.ts` line 93: table declaration. |
| 2 | entities table exists with canonicalName, type, aliases, mentionCount, CRDT fields | VERIFIED | `src/types/intelligence.ts` lines 111-124: EntitySchema with all fields. `src/storage/migrations/v9.ts` line 32: compound index `[type+canonicalName]`. `src/storage/db.ts` line 94: table declaration. |
| 3 | entityRelations table exists with typed edges, confidence, sourceAttribution, evidence[] | VERIFIED | `src/types/intelligence.ts` lines 136-149: EntityRelationSchema with all fields. `src/storage/migrations/v9.ts` lines 33-34: compound index `[sourceEntityId+relationshipType]`. `src/storage/db.ts` line 95: table declaration. |
| 4 | Existing enrichment text stripped from all atom/inbox content after v9 migration | VERIFIED | `src/storage/migrations/v9.ts` lines 36-68: truncates at `\n---\n` separator for both atoms and inbox items, resets maturityScore/maturityFilled/enrichmentDepth. |
| 5 | Old entityGraph table dropped | VERIFIED | `src/storage/migrations/v9.ts` line 28: `entityGraph: null`. `src/storage/entity-graph.ts` is DELETED. No remaining imports of `entity-graph` in src/ (only a comment in store.ts). |
| 6 | Atom schema includes smartLinks[] field with typed discriminator | VERIFIED | `src/types/atoms.ts` line 79: `smartLinks: z.array(SmartLinkSchema).default([])`. SmartLinkSchema imported from `./intelligence` (line 17). Schema has type discriminator `z.enum(['url', 'ms-graph', 'photo-share', 'app-deep-link'])`. |
| 7 | Enrichment answer written to atomIntelligence.enrichment[] as structured record | VERIFIED | `src/ui/signals/store.ts` line 838: `await writeEnrichmentRecord(session.inboxItemId, enrichRecord)`. ClarificationFlow.tsx line 193: `void writeEnrichmentRecord(atom.id, enrichRecord)`. |
| 8 | Enrichment UI reads from sidecar, not content parsing | VERIFIED | `src/ui/signals/store.ts` line 653: `enrichmentPriorAnswers` signal populated from sidecar. Lines 743, 981, 1066, 1161: `getIntelligence()` calls. InboxView.tsx line 481: passes `enrichmentPriorAnswers()` to wizard. |
| 9 | appendEnrichment and parseEnrichment functions deleted from codebase | VERIFIED | `src/ai/clarification/enrichment.ts` is DELETED. Only 2 comment references remain (maturity.ts:59 and enrichment-engine.ts:116 -- both are explanatory comments, not imports/calls). |
| 10 | smartLinks field does not break existing atom construction | FAILED | `npx tsc --noEmit` shows 3 new errors: store.ts:1883, store.ts:2317 (analysis atoms), inbox.ts:38 (inbox item) -- all missing `smartLinks` property. Vite build passes but strict type checking fails. |

**Score:** 9/10 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/types/intelligence.ts` | Type system + Zod schemas | VERIFIED | 164 lines, exports AtomIntelligence, Entity, EntityRelation, SmartLink, EnrichmentRecord, RELATIONSHIP_TYPES, all Zod schemas |
| `src/storage/migrations/v9.ts` | v9 migration | VERIFIED | 70 lines, drops entityGraph, creates 3 tables, strips enrichment, resets maturity |
| `src/storage/db.ts` | Updated table declarations | VERIFIED | imports applyV9Migration (line 33), calls it (line 131), declares 3 new tables (lines 93-95) |
| `src/storage/atom-intelligence.ts` | Sidecar CRUD helpers | VERIFIED | 93 lines, exports getIntelligence, getOrCreateIntelligence, writeEnrichmentRecord, writeCognitiveSignals |
| `src/storage/entity-helpers.ts` | Entity CRUD stubs | VERIFIED | 45 lines, exports createEntity, findEntityByName, createRelation |
| `src/ai/enrichment/enrichment-engine.ts` | Sidecar-based session creation | VERIFIED | accepts `sidecarEnrichment?: EnrichmentRecord[]` param, no parseEnrichment import |
| `src/ai/enrichment/graduation.ts` | Clean parent content | VERIFIED | line 78: `session.originalContent` used directly, no appendEnrichment |
| `src/ai/clarification/enrichment.ts` | DELETED | VERIFIED | File does not exist |
| `src/storage/entity-graph.ts` | DELETED | VERIFIED | File does not exist |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/storage/db.ts` | `src/storage/migrations/v9.ts` | `applyV9Migration` import | WIRED | Line 33: import, Line 131: `applyV9Migration(this)` |
| `src/storage/atom-intelligence.ts` | `src/storage/db.ts` | `db.atomIntelligence` access | WIRED | 5 references to `db.atomIntelligence` (get/put operations) |
| `src/types/atoms.ts` | `src/types/intelligence.ts` | SmartLinkSchema import | WIRED | Line 17: import, Line 79: used in `z.array(SmartLinkSchema)` |
| `src/ui/signals/store.ts` | `src/storage/atom-intelligence.ts` | writeEnrichmentRecord import | WIRED | Line 635: import, Line 838: write call |
| `src/ai/enrichment/enrichment-engine.ts` | sidecar param | sidecarEnrichment[] | WIRED | Lines 101, 110, 118-119: param accepted and iterated |
| `src/ui/signals/store.ts` | `src/storage/atom-intelligence.ts` | getIntelligence | WIRED | Line 635: import, Lines 743, 981, 1066, 1161: read calls |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SIDE-01 | 26-01 | atomIntelligence table stores all AI knowledge per atom | SATISFIED | Table created in v9 migration, CRUD helpers operational, used by enrichment pipeline |
| SIDE-02 | 26-01 | Enrichment migrated from content text to sidecar records | SATISFIED | v9 migration strips content, all reads/writes use sidecar |
| SIDE-03 | 26-02 | Enrichment engine writes/reads structured records to/from sidecar | SATISFIED | writeEnrichmentRecord for writes, getIntelligence for reads, UI uses enrichmentPriorAnswers signal |
| SIDE-04 | 26-01 | Atom schema gains structured links[] field for smart links | SATISFIED | smartLinks field on BaseAtomFields with SmartLink Zod schema (note: 3 construction sites need updating) |
| ENTR-01 | 26-01 | entities Dexie table with dedup, normalization, aliases, CRDT | SATISFIED | EntitySchema + table with compound indexes in v9 migration |
| ENTR-02 | 26-01 | entityRelations Dexie table with typed edges, confidence, attribution | SATISFIED | EntityRelationSchema + table with compound indexes in v9 migration |

No orphaned requirements found. All 6 requirement IDs (SIDE-01, SIDE-02, SIDE-03, SIDE-04, ENTR-01, ENTR-02) mapped in REQUIREMENTS.md to Phase 26 are covered by plans 26-01 and 26-02.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/ui/signals/store.ts` | 1883, 2317 | Missing `smartLinks` in manual atom construction | Warning | TypeScript strict check fails; Vite build passes |
| `src/worker/handlers/inbox.ts` | 38 | Missing `smartLinks` in manual inbox item construction | Warning | TypeScript strict check fails; Vite build passes |
| `src/storage/entity-helpers.ts` | all | Entity stubs are intentionally minimal for Phase 27 | Info | Expected -- stubs documented as Phase 27 preparation |

### Human Verification Required

### 1. Enrichment Sidecar Persistence

**Test:** Open an inbox item, run enrichment wizard, answer 2-3 questions, navigate away, return to the item
**Expected:** Prior answers visible in the wizard; data persists in atomIntelligence table (check IndexedDB via DevTools)
**Why human:** Requires runtime Dexie interaction and UI rendering that cannot be verified statically

### 2. v9 Migration on Existing Data

**Test:** Load the app with pre-existing enriched atoms (with `\n---\n` content sections), verify migration strips enrichment text
**Expected:** Atom content is clean (no `---` sections); maturityScore reset to 0; atomIntelligence table exists in IndexedDB
**Why human:** Migration runs once on database open; requires actual IndexedDB state

### 3. Smart Links Schema Validation

**Test:** Add a smartLinks entry to an atom via console (`db.atoms.update(id, { smartLinks: [{id: crypto.randomUUID(), type: 'url', uri: 'https://example.com', addedAt: Date.now()}] })`)
**Expected:** Value persists and can be read back with correct structure
**Why human:** No UI for smart links yet; need manual IndexedDB verification

### Gaps Summary

One gap found: the `smartLinks` field added to `BaseAtomFields` introduced 3 new TypeScript errors where atoms are manually constructed without the field. The Vite build still succeeds (it does not run strict tsc), but `npx tsc --noEmit` fails at these locations. The fix is trivial: add `smartLinks: []` to the 3 construction sites in `src/ui/signals/store.ts` (lines 1883, 2317) and `src/worker/handlers/inbox.ts` (line 38).

All other must-haves are fully verified. The phase goal is substantially achieved: intelligence sidecar is operational, entity/relation tables are ready, enrichment pipeline is fully migrated to sidecar writes, and the old content-parsing approach is deleted.

---

_Verified: 2026-03-11T06:00:00Z_
_Verifier: Claude (gsd-verifier)_
