---
phase: 29
slug: entity-consumers-trained-agent-validation
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-12
---

# Phase 29 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (existing — `vitest.config.ts` present) |
| **Config file** | `vitest.config.ts` at root |
| **Quick run command** | `pnpm test` |
| **Full suite command** | `pnpm test --run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test --run src/`
- **After every plan wave:** Run `pnpm test --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 29-01-01 | 01 | 1 | ENTC-04 | unit | `pnpm test src/entity/recency-decay.test.ts` | W0 (Plan 02 Task 1) | pending |
| 29-01-02 | 01 | 1 | ENTC-02 | unit | `pnpm test src/storage/entity-helpers.test.ts -t "correction"` | W0 (Plan 02 Task 1) | pending |
| 29-01-03 | 01 | 1 | ENTC-05 | unit | `pnpm test src/storage/entity-helpers.test.ts -t "timeline"` | W0 (Plan 02 Task 1) | pending |
| 29-02-01 | 02 | 1 | ENTC-01 | unit | `pnpm test src/ai/enrichment/t3-enrichment.test.ts -t "entity"` | W0 (Plan 02 Task 1) | pending |
| 29-02-02 | 02 | 1 | ENTC-03 | unit | `pnpm test src/ai/enrichment/enrichment-engine.test.ts -t "entity context"` | Partial | pending |
| 29-03-01 | 03 | 2 | TVAL-01 | integration | `npx tsx scripts/harness/run-adversarial.ts --dry-run` | Created during execution | pending |
| 29-03-02 | 03 | 2 | TVAL-02 | smoke | `npx tsx scripts/harness/generate-investment-report.ts --dry-run` | Created during execution | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

All Wave 0 test stubs are created in Plan 02 Task 1:

- [x] `src/entity/recency-decay.test.ts` — TDD tests for ENTC-04 decay formula (created as part of TDD task)
- [x] `src/storage/entity-helpers.test.ts` — stubs for ENTC-02 correctRelationship and ENTC-05 getEntityTimeline
- [x] `src/ai/enrichment/t3-enrichment.test.ts` — stub for ENTC-01 entity context injection

*Harness test entry points (TVAL-01, TVAL-02) are created during Plan 01/03 execution — they are integration/smoke tests that run the harness scripts directly, not unit test stubs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Entity correction popover UX | ENTC-02 | SolidJS DOM interaction, popover positioning | 1. Open atom with entity badge 2. Tap badge 3. Verify correction popover appears 4. Select "wrong" -> pick new type 5. Verify stored as confidence 1.0 |
| Entity timeline view | ENTC-05 | Visual chronological rendering | 1. Tap entity badge 2. Verify timeline shows all mentioning atoms 3. Verify chronological order |
| Semantic sanitization in cloud packet | TVAL-02 | Requires inspecting actual cloud-bound payload | 1. Trigger cloud enrichment for atom with known entity 2. Inspect sanitized prompt 3. Verify "Pam" -> "[SPOUSE]" replacement |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved
