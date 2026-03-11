---
phase: 28
plan: 02
subsystem: cognitive-harness
tags: [harness, scoring, entity-graph, relationship-inference, offline, node, headless]
dependency_graph:
  requires:
    - 28-01 (keyword-patterns.ts, cooccurrence-tracker.ts, relationship-inference.ts)
    - 27-01 (entity-helpers.ts, entity-matcher.ts, EntityRelation schema)
    - 26-01 (AtomIntelligence sidecar types)
  provides:
    - scripts/harness/synthetic-user.json (Alex Jordan persona, 15 entities, 14 relationships)
    - scripts/harness/generate-corpus.ts (Anthropic API corpus generation)
    - scripts/harness/harness-entity-store.ts (HarnessEntityStore — in-memory Dexie mock)
    - scripts/harness/harness-inference.ts (harness-specific keyword + co-occurrence wrappers)
    - scripts/harness/harness-pipeline.ts (runHarnessAtom — headless pipeline)
    - scripts/harness/score-graph.ts (scoreEntityGraph — P/R/F1 + privacy score)
    - scripts/harness/write-reports.ts (JSON + Markdown reports with ASCII learning curve)
    - scripts/harness/run-harness.ts (main entry point with checkpoint scoring)
  affects:
    - .gitignore (scripts/harness/reports/ excluded)
    - Phase 29 adversarial training loop (uses this harness as foundation)
tech_stack:
  added: []
  patterns:
    - In-memory Map-backed Dexie mock (HarnessEntityStore) for headless execution
    - Harness-specific inference wrappers reusing splitIntoSentences/buildKeywordRegex from production
    - Progressive atom feeding with checkpoint scoring at [5, 10, 20, 30]
    - ASCII bar chart learning curve visualization in Markdown reports
    - Dry-run mode validates corpus structure without processing
key_files:
  created:
    - scripts/harness/synthetic-user.json
    - scripts/harness/generate-corpus.ts
    - scripts/harness/harness-entity-store.ts
    - scripts/harness/mock-db.ts
    - scripts/harness/harness-inference.ts
    - scripts/harness/harness-pipeline.ts
    - scripts/harness/score-graph.ts
    - scripts/harness/write-reports.ts
    - scripts/harness/run-harness.ts
  modified:
    - .gitignore (added scripts/harness/reports/)
decisions:
  - "Harness-specific inference wrappers (harness-inference.ts) instead of modifying production inference modules — production code stays clean, harness reuses splitIntoSentences/buildKeywordRegex utilities"
  - "HarnessEntityStore uses synchronous Map operations — no async overhead, deterministic execution for scoring"
  - "Corpus generation uses claude-sonnet-4-20250514 with structured JSON output including pre-annotated entity spans — makes harness runs deterministic (no NER model required in Node)"
  - "findRelation() checks both (a,b) and (b,a) orderings — symmetric relation lookup without compound index"
  - "Privacy score = entities with inferred relationships / GT entities with relationships — measures semantic sanitization readiness"
metrics:
  duration_seconds: 480
  tasks_completed: 3
  tasks_total: 3
  files_created: 9
  files_modified: 1
  completed_date: "2026-03-11"
---

# Phase 28 Plan 02: Cognitive Harness Summary

Headless cognitive harness that validates the full local inference pipeline against a synthetic GTD user profile (Alex Jordan), measuring how well keyword pattern matching and co-occurrence tracking learn entity relationships from progressive atom processing — with precision/recall/F1 scoring at checkpoints and ASCII learning curve reports.

## What Was Built

### Task 1: Synthetic User Profile and Corpus Generation

**`scripts/harness/synthetic-user.json`** — Alex Jordan persona:
- 15 ground truth entities: 12 PER (Pam, Dr. Chen, Marcus Webb, Linda Jordan, Ethan, Priya, Jake, Dr. Rivera, Tom Nguyen, Sandra Kim, Dr. Patel, Brian Foster), 2 ORG (Acme Corp, Lincoln Elementary), 1 LOC (Portland)
- 14 ground truth relationships: spouse, reports-to, parent, child, healthcare-provider (x2), colleague, friend, neighbor, lawyer, veterinarian, client, works-at, lives-at
- Each entity has canonical name + aliases (e.g., "Pam" → "Pam Jordan", "Pamela", "Pamela Jordan")

**`scripts/harness/generate-corpus.ts`** — One-time Anthropic API corpus generator:
- Calls `claude-sonnet-4-20250514` to generate 35 inbox items (28 natural + 7 edge cases)
- Edge cases: alias usage, title variations, multi-entity sentences, entity-free items
- Each item includes pre-annotated `entityMentions[]` with character-level span positions
- Dry-run mode (`--dry-run`) validates structure without API call
- Output: `scripts/harness/corpus.json`

### Task 2: Harness Entity Store and Headless Pipeline

**`scripts/harness/harness-entity-store.ts`** — `HarnessEntityStore` class:
- Synchronous Map-backed storage for entities, entityRelations, atomIntelligence
- `findOrCreateEntity()` replicates dedup logic from entity-helpers.ts using entity-matcher.ts
- `findRelation()` checks both (a,b) and (b,a) orderings for symmetric lookup
- `reset()` clears all state between runs

**`scripts/harness/harness-inference.ts`** — Harness-specific inference wrappers:
- `runHarnessKeywordPatterns()`: reuses `splitIntoSentences`, `buildKeywordRegex` from production, writes to HarnessEntityStore
- `updateHarnessCooccurrence()`: sentence-level co-occurrence tracking into module-level Map
- `flushHarnessCooccurrence()`: writes pairs >= threshold to HarnessEntityStore
- No browser-only imports (no Worker, no DOM, no SolidJS)

**`scripts/harness/harness-pipeline.ts`** — `runHarnessAtom()`:
- Resolves pre-annotated entity mentions to registry IDs via `findOrCreateEntity`
- Writes atomIntelligence sidecar to store
- Runs keyword patterns for registry mentions
- Updates co-occurrence map

### Task 3: Scoring Engine, Reports, and Main Entry Point

**`scripts/harness/score-graph.ts`** — `scoreEntityGraph()`:
- Entity precision/recall/F1: match detected entities against GT by canonical name or alias (case-insensitive, title-stripped)
- Relationship precision/recall/F1: match detected EntityRelations against GT relationships by entity ID + type
- Privacy score: (entities with inferred relationships) / (GT entities with relationships) — measures semantic sanitization readiness
- Full detail: foundEntities, missedEntities, foundRelations, missedRelations

**`scripts/harness/write-reports.ts`** — `writeReports()`:
- JSON report: full checkpoint data array with timestamps
- Markdown report: summary table + ASCII learning curve for entity recall, relationship recall, privacy score
- Output: `scripts/harness/reports/harness_{timestamp}.{json,md}`

**`scripts/harness/run-harness.ts`** — Main entry point:
- Loads synthetic-user.json + corpus.json
- Progressive feeding: `runHarnessAtom()` for each item
- Checkpoint scoring at [5, 10, 20, 30] atoms with console output
- Flushes co-occurrence before each checkpoint
- Final score after all atoms
- `--dry-run`: validates corpus structure, prints expected checkpoints, exits

## Verification Results

```
npx tsx scripts/harness/run-harness.ts --dry-run
  [run-harness] DRY-RUN MODE — corpus.json not found
  Persona: Alex Jordan
  Ground truth: 15 entities, 14 relationships
  Dry-run PASSED — synthetic-user.json structure valid

npx tsx scripts/harness/generate-corpus.ts --dry-run
  [generate-corpus] DRY-RUN MODE
  Persona: Alex Jordan
  Ground truth entities: 15
  Ground truth relationships: 14
  Would generate: 35 inbox items
  Dry-run PASSED

grep for browser-only APIs in scripts/harness/
  No Worker, window, document, DOM, SolidJS imports in production paths
```

Full harness run (requires `ANTHROPIC_API_KEY` + corpus generation):
```
ANTHROPIC_API_KEY=<key> npx tsx scripts/harness/generate-corpus.ts
npx tsx scripts/harness/run-harness.ts
```

## Deviations from Plan

### Auto-design: Harness Inference Wrappers Instead of Production DI

**Found during:** Task 2 planning
**Issue:** Plan suggested two approaches for DI: (a) add optional `deps` params to production inference modules, or (b) create harness-specific wrappers. Option (a) would modify production code for harness convenience.
**Decision:** Chose option (b) — `harness-inference.ts` reuses `splitIntoSentences` and `buildKeywordRegex` utilities from production (pure functions with no Dexie deps) and reimplements the Dexie write logic using HarnessEntityStore. Production inference modules unchanged.
**Benefit:** Clean separation — harness tests the inference *logic* (patterns, co-occurrence) while production code stays unmodified.

## Self-Check: PASSED

Files verified present:
- scripts/harness/synthetic-user.json: FOUND
- scripts/harness/generate-corpus.ts: FOUND
- scripts/harness/harness-entity-store.ts: FOUND
- scripts/harness/harness-inference.ts: FOUND
- scripts/harness/harness-pipeline.ts: FOUND
- scripts/harness/score-graph.ts: FOUND
- scripts/harness/write-reports.ts: FOUND
- scripts/harness/run-harness.ts: FOUND

Commits verified:
- 7dc8477: feat(28-02): synthetic user profile and corpus generation script
- 88bc653: feat(28-02): harness entity store mock and headless pipeline
- f612be9: feat(28-02): scoring engine, report generator, and main harness entry point
