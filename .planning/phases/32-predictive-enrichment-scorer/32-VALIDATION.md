---
phase: 32
slug: predictive-enrichment-scorer
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 32 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vite.config.ts` (vitest config inline) |
| **Quick run command** | `pnpm test --run src/ai/enrichment/predictive-scorer.test.ts` |
| **Full suite command** | `pnpm test --run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test --run src/ai/enrichment/predictive-scorer.test.ts`
- **After every plan wave:** Run `pnpm test --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 32-01-01 | 01 | 1 | PRED-01 | unit | `pnpm test --run src/ai/enrichment/predictive-scorer.test.ts` | ❌ W0 | ⬜ pending |
| 32-01-02 | 01 | 1 | PRED-02 | unit | `pnpm test --run src/ai/enrichment/predictive-scorer.test.ts` | ❌ W0 | ⬜ pending |
| 32-01-03 | 01 | 1 | PRED-03 | unit | `pnpm test --run src/ai/enrichment/predictive-scorer.test.ts` | ❌ W0 | ⬜ pending |
| 32-02-01 | 02 | 1 | PRED-01 | unit | `pnpm test --run src/ai/enrichment/momentum-builder.test.ts` | ❌ W0 | ⬜ pending |
| 32-02-02 | 02 | 1 | PRED-03 | unit | `pnpm test --run src/ai/enrichment/momentum-builder.test.ts` | ❌ W0 | ⬜ pending |
| 32-03-01 | 03 | 2 | PRED-01, PRED-02 | integration | `pnpm test --run src/ai/enrichment/enrichment-engine.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/ai/enrichment/predictive-scorer.test.ts` — stubs for PRED-01, PRED-02, PRED-03 (pure function tests: dynamic ordering, cold-start guard, entity boost, zero-signal base)
- [ ] `src/ai/enrichment/momentum-builder.test.ts` — stubs for cache TTL, cache invalidation, windowed query logic (mocked Dexie)

*Existing infrastructure covers framework setup.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Budget atoms → deadline questions lead | PRED-01+02 | Requires harness with seeded persona data | Run harness with alex-jordan persona, enrich budget-related atom after triage |
| Entity-active atom → entity category promoted | PRED-01 | Requires entity registry with trajectory data | Run harness, verify entity enrichment category ordering |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
