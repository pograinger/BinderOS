---
phase: 28
slug: relationship-inference-cognitive-harness
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
---

# Phase 28 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.0.18 |
| **Config file** | none (default Vitest config) |
| **Quick run command** | `pnpm test src/inference/ --run` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test src/inference/ --run`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 28-01-01 | 01 | 1 | RELI-01 | unit | `pnpm test src/inference/keyword-patterns.test.ts -t "spouse"` | ❌ W0 | ⬜ pending |
| 28-01-02 | 01 | 1 | RELI-01 | unit | `pnpm test src/inference/keyword-patterns.test.ts -t "sentence scope"` | ❌ W0 | ⬜ pending |
| 28-01-03 | 01 | 1 | RELI-01 | unit | `pnpm test src/inference/keyword-patterns.test.ts -t "fuzzy"` | ❌ W0 | ⬜ pending |
| 28-02-01 | 02 | 1 | RELI-02 | unit | `pnpm test src/inference/cooccurrence-tracker.test.ts` | ❌ W0 | ⬜ pending |
| 28-02-02 | 02 | 1 | RELI-02 | unit | `pnpm test src/inference/cooccurrence-tracker.test.ts -t "flush"` | ❌ W0 | ⬜ pending |
| 28-03-01 | 03 | 1 | RELI-03 | unit | `pnpm test src/inference/keyword-patterns.test.ts -t "confidence"` | ❌ W0 | ⬜ pending |
| 28-03-02 | 03 | 1 | RELI-03 | unit | `pnpm test src/inference/cooccurrence-tracker.test.ts -t "threshold"` | ❌ W0 | ⬜ pending |
| 28-04-01 | 04 | 2 | HARN-01 | smoke | `npx tsx scripts/harness/run-harness.ts --dry-run` | ❌ W0 | ⬜ pending |
| 28-05-01 | 05 | 2 | HARN-02 | integration | `npx tsx scripts/harness/run-harness.ts` | ❌ W0 | ⬜ pending |
| 28-06-01 | 06 | 2 | HARN-03 | unit | `pnpm test scripts/harness/cloud-simulator.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/inference/keyword-patterns.test.ts` — stubs for RELI-01, RELI-03
- [ ] `src/inference/cooccurrence-tracker.test.ts` — stubs for RELI-02, RELI-03
- [ ] `src/inference/relationship-inference.test.ts` — integration: full orchestrator
- [ ] `scripts/harness/run-harness.ts` — harness entry point (HARN-01, HARN-02, HARN-03)
- [ ] `scripts/harness/corpus.json` — pre-generated corpus
- [ ] `scripts/harness/synthetic-user.json` — ground truth persona

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| visibilitychange flush fires on tab hide | RELI-02 | Browser event lifecycle | Open app, create atoms with co-occurring entities, switch tabs, verify Dexie writes |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
