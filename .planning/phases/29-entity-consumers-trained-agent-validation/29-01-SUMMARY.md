---
phase: 29-entity-consumers-trained-agent-validation
plan: 01
subsystem: harness
tags: [adversarial-training, persona-generation, enrichment-emulation, correction-ripple, multi-cycle]
dependency_graph:
  requires: [28-02]
  provides: [adversarial-training-loop, persona-generator-cli, enrichment-emulator, correction-emulator, checkpoint-resume]
  affects: [harness-entity-store, harness-inference, harness-pipeline, score-graph, write-reports]
tech_stack:
  added: []
  patterns: [adversarial-corpus-generation, gap-targeted-generation, cloud-as-user-emulation, correction-ripple, component-attribution, synthetic-timestamps]
key_files:
  created:
    - scripts/harness/harness-types.ts
    - scripts/harness/generate-persona.ts
    - scripts/harness/checkpoint-store.ts
    - scripts/harness/enrichment-emulator.ts
    - scripts/harness/correction-emulator.ts
    - scripts/harness/adversarial-cycle.ts
    - scripts/harness/run-adversarial.ts
    - scripts/harness/personas/margaret-chen/synthetic-user.json
    - scripts/harness/personas/james-okafor/synthetic-user.json
    - scripts/harness/personas/priya-nair/synthetic-user.json
    - scripts/harness/personas/tyler-kowalski/synthetic-user.json
    - scripts/harness/personas/sunita-patel/synthetic-user.json
    - scripts/harness/personas/rafael-moreno/synthetic-user.json
    - scripts/harness/personas/anna-liu/synthetic-user.json
    - scripts/harness/personas/sam-park/synthetic-user.json
    - scripts/harness/personas/olivia-hassan/synthetic-user.json
  modified:
    - scripts/harness/harness-entity-store.ts (snapshot/restore, syntheticTimestamp in findOrCreateEntity)
    - scripts/harness/harness-inference.ts (user-correction guard, reRunPatternsForEntity)
    - scripts/harness/harness-pipeline.ts (syntheticTimestamp param, getProcessedAtomIds, content cache)
    - scripts/harness/score-graph.ts (computeAggregateScore, computeLearningCurve)
    - scripts/harness/write-reports.ts (writeExperimentReport, cross-persona comparison, learning curves)
decisions:
  - "harness-types.ts: ComponentAttribution uses Map<string, RelationshipSource> serialized to array for JSON checkpoint persistence"
  - "enrichment-emulator.ts: regex-based name extraction (not BERT) for offline answer mining — pragmatic for harness-only context"
  - "correction-emulator.ts: generateCorrections falls back to direct mismatch corrections if Haiku API fails — non-fatal"
  - "adversarial-cycle.ts: content cached in atomIntelligence._content for correction ripple reprocessing"
  - "generate-persona.ts: coverage matrix validation with auto-retry (max 3) before accepting persona"
  - "harness-entity-store.ts: findOrCreateEntity accepts optional syntheticTimestamp for realistic decay simulation"
metrics:
  duration: "~16 minutes"
  completed_date: "2026-03-12"
  tasks_completed: 3
  files_changed: 20
---

# Phase 29 Plan 01: Multi-Cycle Adversarial Training Loop Summary

5-cycle adversarial training loop with 12 diverse synthetic personas, cloud-as-user enrichment emulation, correction ripple, and gap-targeted corpus generation for emergent entity learning validation.

## What Was Built

### Task 1: Shared types, persona generator CLI, checkpoint store

**harness-types.ts** — All shared interfaces for the adversarial training loop:
- `CycleState`, `GraphSnapshot`, `GraphDiff`, `RelationshipGap`, `EnrichmentEmulation`, `UserCorrection`, `ComponentAttribution`, `AblationConfig`, `PersonaAdversarialResult`, `ExperimentResult`
- Serialization helpers for Map-based `ComponentAttribution` (JSON-safe checkpoint format)

**generate-persona.ts** — Reusable CLI persona generator:
- `--archetype`, `--complexity`, `--binder-type`, `--name`, `--dry-run`, `--validate`, `--force` flags
- 12 archetype seeds with life stage, cultural background, occupation, naming patterns
- Coverage matrix validation: 2+ family, 1+ work, 1+ service provider, 1+ org. Auto-retry up to 3x
- Sonnet-backed generation with JSON coverage validation before accepting

**checkpoint-store.ts** — Per-persona-cycle checkpoint persistence:
- `saveCheckpoint(personaName, cycleNumber, storeSnapshot, cycleState)` → `personas/{name}/graphs/cycle_{N}.json`
- `loadCheckpoint()` returns LoadedCheckpoint with full store snapshot + cycle state
- `saveExperimentState()` / `loadExperimentState()` for experiment-level resume
- `findLastCompletedCycle()` for resume entry point detection

**harness-entity-store.ts additions:**
- `snapshot()` → serializable `{ entities, relations, atomIntelligence }` arrays
- `restore(snap)` → repopulates Maps from arrays
- `findOrCreateEntity()` accepts optional `syntheticTimestamp` for realistic decay simulation

### Task 2: Adversarial cycle engine, enrichment emulation, correction ripple

**enrichment-emulator.ts** — Cloud-as-user Q&A simulation:
- `emulateEnrichmentSession()`: Haiku-powered persona-consistent Q&A generation (3 questions per atom)
- Question selection prefers unanswered categories, prioritizes `context` and `people` for entity mining
- `buildEntitySummary()`: human-readable entity+relationship context block for prompts
- Answer mining: regex-based proper name extraction + keyword patterns + co-occurrence on answers

**correction-emulator.ts** — User correction simulation:
- `generateCorrections()`: Haiku reviews graph vs ground truth, generates realistic corrections; falls back to direct mismatch correction on API failure
- `applyCorrection()`: creates `user-correction` relation at confidence 1.0, removes wrong-type relations, ripples through atomIntelligence content cache via keyword pattern re-run, calls `cleanSuppressedRelations()`

**adversarial-cycle.ts** — Single cycle orchestrator:
- Cycle 1: natural corpus via Sonnet (35 items)
- Cycles 2-5: gap-targeted corpus specifically targeting missed relationships with adversarial phrasing
- Per-atom pipeline: `runHarnessAtom()` → `emulateEnrichmentSession()` → enrichment answer mining
- Post-corpus: `flushHarnessCooccurrence()` → `cleanSuppressedRelations()` → corrections → scoring
- Graph snapshot + diff computation, gap extraction, component attribution tracking
- Synthetic timestamps: cycle 1 items ~4 weeks ago, cycle 5 ~now (linear interpolation for decay simulation)
- Saves checkpoint after each cycle

**harness-inference.ts additions:**
- `upsertKeywordRelation()` guard: if existing relation has `sourceAttribution === 'user-correction'`, skip (corrections are never overwritten)
- `reRunPatternsForEntity()`: re-runs keyword patterns on all atoms mentioning a specific entity

**harness-pipeline.ts additions:**
- `syntheticTimestamp` optional parameter passed through to `findOrCreateEntity` and sidecar `lastUpdated`
- `getProcessedAtomIds()` export for correction ripple iteration
- `_content` cache stored on sidecar for re-run patterns without content re-fetch

### Task 3: Multi-persona run orchestrator, aggregate reporting, 9 new personas

**run-adversarial.ts** — Main entry point:
- `--personas all|name1,name2`, `--cycles`, `--experiment`, `--resume`, `--delay-ms`, `--dry-run`, `--generate-personas`
- Sequential persona execution (API rate limit safety)
- Resume: loads experiment state, skips completed personas, restores store from cycle checkpoints
- CI-ready: exit 0 if all personas ≥ 80% relationship F1, exit 1 otherwise
- Dry-run: validates all persona files, prints estimated API call counts

**score-graph.ts additions:**
- `computeAggregateScore()`: mean/median/min/max/stdDev across all personas for entity F1, relationship F1, privacy score
- `computeLearningCurve()`: per-cycle progression data points

**write-reports.ts additions:**
- `writeExperimentReport()`: experiment-level JSON + Markdown report
- Cross-persona comparison table, per-persona learning curves (ASCII bar charts), aggregate metrics
- Component attribution summary showing % by keyword/co-occurrence/enrichment-mining/correction
- Worst-performing personas section with remaining gaps listed

**9 new persona profiles generated and validated:**

| Persona | Complexity | Entities | Relationships |
|---------|-----------|----------|---------------|
| margaret-chen (retiree, Chinese-American) | high | 22 | 18 |
| james-okafor (early career, Nigerian-American) | low | 11 | 9 |
| priya-nair (executive, South Indian) | high | 25 | 20 |
| tyler-kowalski (freelancer, Polish-American) | medium | 17 | 13 |
| sunita-patel (parent, Gujarati Indian) | high | 24 | 19 |
| rafael-moreno (business owner, Mexican-American) | medium | 18 | 15 |
| anna-liu (grad student, Taiwanese) | medium | 16 | 13 |
| sam-park (semi-retired, Korean-American) | medium | 17 | 15 |
| olivia-hassan (military spouse, African/Lebanese-American) | high | 22 | 18 |

All 12 personas (3 existing + 9 new) pass coverage matrix: ≥2 family, ≥1 work, ≥1 service provider, ≥1 org.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Content caching in atomIntelligence sidecar**
- **Found during:** Task 2 (correction ripple implementation)
- **Issue:** `reRunPatternsForEntity()` needed atom content to re-run keyword patterns after corrections, but the harness pipeline doesn't store content anywhere — sidecar only stores entity mentions
- **Fix:** Cache content as `_content` property on AtomIntelligence record (via TypeScript type cast) in `runHarnessAtom()`. This enables correction ripple without architectural change
- **Files modified:** `harness-pipeline.ts`, `harness-inference.ts`, `correction-emulator.ts`

**2. [Rule 1 - Bug] enrichment-emulator.ts store parameter missing**
- **Found during:** Task 2 (initial write had closure over non-existent `store` variable)
- **Fix:** Rewrote `emulateEnrichmentSession()` to accept `store` as explicit parameter (correct design)
- **Files modified:** `enrichment-emulator.ts`, `adversarial-cycle.ts`

**3. [Rule 2 - Missing Critical Functionality] syntheticTimestamp propagation to findOrCreateEntity**
- **Found during:** Task 2 (entities were using `Date.now()` even when synthetic timestamps were passed)
- **Fix:** Updated `HarnessEntityStore.findOrCreateEntity()` to accept optional `syntheticTimestamp` parameter, propagated through `harness-pipeline.ts`
- **Files modified:** `harness-entity-store.ts`, `harness-pipeline.ts`

## Self-Check: PASSED

- All 7 new harness files created and found on disk
- 12 persona synthetic-user.json files present (3 existing + 9 new)
- 3 task commits present: ecee0ff, f7e0b38, 670ecbd
- Dry-run validation: all 12 personas found, run plan prints correctly
- user-correction guard: 3 occurrences in harness-inference.ts (guard + attribution label)
