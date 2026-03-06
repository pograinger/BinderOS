---
phase: 12-template-engine
plan: "01"
subsystem: ai-pipeline
tags: [templates, briefing, offline, tdd]
dependency_graph:
  requires: []
  provides: [template-engine, offline-briefing]
  affects: [analysis-pipeline, review-flow, store]
tech_stack:
  added: []
  patterns: [pure-module, template-literals, tdd]
key_files:
  created:
    - src/ai/templates.ts
    - src/ai/templates.test.ts
  modified:
    - src/ai/analysis.ts
    - src/ui/signals/store.ts
decisions:
  - "Template engine uses TypeScript template literals (not Eta.js) — matches codebase pattern, zero dependencies"
  - "Briefing is now fully offline — anyAIAvailable() guard removed from startReviewBriefing and startGuidedReview"
  - "generateBriefing stays async to preserve call-site contract even though body is now sync"
  - "Green+zero state locked to: 'Your system is clean -- nothing needs attention right now.'"
  - "Red state locked to: uses 'getting noisy' phrasing"
metrics:
  duration_minutes: 15
  completed_date: "2026-03-06"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 2
  tests_written: 35
  tests_passing: 35
---

# Phase 12 Plan 01: Template Engine — Summary

**One-liner:** Pure TypeScript template engine for deterministic briefing text, replacing the AI summary call with entropy-driven template literals that work fully offline.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Create template engine module with unit tests (TDD) | 9b7fa2f | src/ai/templates.ts, src/ai/templates.test.ts |
| 2 | Wire briefing to templates and remove AI guards | 2e73a54 | src/ai/analysis.ts, src/ui/signals/store.ts |

## What Was Built

### `src/ai/templates.ts` — Template Engine Module

Pure module (zero store imports) with 6 exported functions:

1. **`generateBriefingSummary`** — Entropy-driven briefing text with 3 levels (green/yellow/red). Null entropy defaults to yellow without percentage. Green+zero state locked to canonical message.

2. **`generateCompressionExplanation`** — Staleness, link count, similar items, and related decisions formatted into a human-readable explanation. Uses `toLocaleDateString` for consistent date formatting.

3. **`recommendCompressionAction`** — Returns `archive | tag-someday | add-link` based on staleness, link count, and similarity signals.

4. **`assessCompressionConfidence`** — Returns `high | medium | low` confidence for compression recommendations.

5. **`enrichTriggerQuestion`** — Contextualizes GTD trigger prompts with section activity data. Adds stale message when section inactive >14 days.

6. **`derivePatternSteps`** — Detects high inbox (>10) and empty section patterns; returns max 3 `ReviewFlowStep[]` with `get-creative` phase.

Also exports `SectionContext` interface.

### `src/ai/analysis.ts` — Briefing Pipeline Updated

- Removed `dispatchAI` import and the entire AI call block (fallback summary, prompt construction, try/catch)
- Added `generateBriefingSummary` import and single template call
- Kept `async` function signature to preserve call-site contract
- Honored abort contract with `signal?.aborted` check before template call

### `src/ui/signals/store.ts` — AI Guards Removed

- `startReviewBriefing()`: removed `anyAIAvailable()` guard, removed orb `thinking`/`idle`/`error` calls
- `startGuidedReview()`: removed `anyAIAvailable()` guard
- `anyAIAvailable` function and memo definition preserved (still used for triage guard at line 523)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed missing `inboxCount` field in test helper**
- **Found during:** Task 2 TypeScript compilation check
- **Issue:** `makeEntropy` helper in `templates.test.ts` was missing `inboxCount` field required by `EntropyScore` interface
- **Fix:** Added `inboxCount: 0` to the `makeEntropy` helper return value
- **Files modified:** `src/ai/templates.test.ts`
- **Commit:** 2e73a54

## Self-Check

Checking files exist and commits present:

- FOUND: src/ai/templates.ts
- FOUND: src/ai/templates.test.ts
- FOUND: .planning/phases/12-template-engine/12-01-SUMMARY.md
- FOUND: commit 9b7fa2f (task 1)
- FOUND: commit 2e73a54 (task 2)

## Self-Check: PASSED
