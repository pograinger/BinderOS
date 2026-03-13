---
phase: 31
slug: context-gate-evaluator
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 31 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run src/ai/context-gate/` |
| **Full suite command** | `npx vitest run src/ai/` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/ai/context-gate/`
- **After every plan wave:** Run `npx vitest run src/ai/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 31-01-01 | 01 | 1 | GATE-01 | unit | `npx vitest run src/ai/context-gate/__tests__/pipeline-gate.test.ts` | ❌ W0 | ⬜ pending |
| 31-01-02 | 01 | 1 | GATE-01 | unit | `npx vitest run src/ai/tier2/__tests__/pipeline.test.ts` | ❌ W0 | ⬜ pending |
| 31-02-01 | 02 | 1 | GATE-02,03,04 | unit | `npx vitest run src/ai/context-gate/__tests__/predicates.test.ts` | ✅ | ⬜ pending |
| 31-03-01 | 03 | 2 | GATE-05 | unit | `npx vitest run src/ai/context-gate/__tests__/gate-logger.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/ai/context-gate/__tests__/pipeline-gate.test.ts` — gate integration with dispatchTiered, blocked/pass scenarios (GATE-01, GATE-05)
- [ ] `src/ai/context-gate/__tests__/gate-logger.test.ts` — fire-and-forget log writes, entry shape, TTL cleanup (GATE-05)
- [ ] `makePermissiveContext()` test helper — default GateContext that passes all predicates, for updating existing pipeline tests

*Existing infrastructure covers predicate unit tests (predicates.test.ts already has 12 tests).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Route predicate blocks on Insights view | GATE-02 | Requires SolidJS router context | Navigate to /insights, trigger triage, check gate log |
| Harness report includes gate metadata | GATE-05 | Requires full harness run | Run harness pipeline, verify blocked dispatches appear in report |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
