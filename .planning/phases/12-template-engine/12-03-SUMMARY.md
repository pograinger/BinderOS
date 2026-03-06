---
phase: 12-template-engine
plan: "03"
subsystem: template-engine
tags: [bug-fix, tdd, dead-code, pattern-detection]
dependency_graph:
  requires: ["12-02"]
  provides: ["TMPL-03"]
  affects: ["src/ai/templates.ts"]
tech_stack:
  added: []
  patterns: ["sectionId filtering (a.sectionId === section.id)"]
key_files:
  modified:
    - src/ai/templates.ts
    - src/ai/templates.test.ts
decisions:
  - "Use a.sectionId === section.id — same pattern as review-flow.ts:buildSectionContext() line 185"
  - "sectionOpenAtoms (per-section) replaces dead sectionAtoms filter that hardcoded return false"
metrics:
  duration: "~5 minutes"
  completed: "2026-03-06"
  tasks_completed: 1
  files_modified: 2
requirements: [TMPL-03]
---

# Phase 12 Plan 03: Fix derivePatternSteps Per-Section Empty Detection Summary

Fixed the dead code in `derivePatternSteps` Pattern 2: replaced a hardcoded `return false` filter and global `openAtoms.length === 0` condition with per-section `a.sectionId === section.id` filtering, making empty-section detection actually work per-section rather than only when the entire system is blank.

## What Was Built

The `derivePatternSteps` function in `src/ai/templates.ts` had a bug in its Pattern 2 (empty-section detection). The `sectionAtoms` filter always returned `false`, making it dead code. The condition checked `openAtoms.length === 0` (all atoms system-wide are absent) instead of per-section emptiness. This meant users in Get Creative never saw the empty-section prompt unless their entire binder was blank — a significant false negative for GTD workflow prompting.

The fix:
- Removed the dead `sectionAtoms` filter with `return false`
- Added `const sectionOpenAtoms = openAtoms.filter((a) => a.sectionId === section.id)`
- Changed condition from `openAtoms.length === 0` to `sectionOpenAtoms.length === 0`
- Used the same `sectionId` pattern already established in `review-flow.ts:buildSectionContext()` line 185

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Add failing tests for per-section empty detection | 0106a36 | src/ai/templates.test.ts |
| 1 (GREEN) | Fix derivePatternSteps per-section empty detection | 84b723d | src/ai/templates.ts, src/ai/templates.test.ts |

## Verification

- All 40 tests pass (35 existing + 5 new)
- `grep "return false" src/ai/templates.ts` returns no matches
- `grep "sectionId === section.id" src/ai/templates.ts` returns match
- No new TypeScript errors in templates files

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TS strict mode error on array access**
- **Found during:** Green phase TypeScript verification
- **Issue:** `steps[0].question` caused TS2532 "Object is possibly undefined" (noUncheckedIndexedAccess)
- **Fix:** Changed to `steps[0]?.question` in the test
- **Files modified:** src/ai/templates.test.ts
- **Commit:** 84b723d (included in same commit)

## Self-Check: PASSED
