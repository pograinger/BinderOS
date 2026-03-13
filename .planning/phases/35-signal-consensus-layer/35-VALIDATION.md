---
phase: 35
slug: signal-consensus-layer
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 35 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 |
| **Config file** | vite.config.ts (test section) |
| **Quick run command** | `pnpm test -- --reporter=verbose src/ai/feature-vectors` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test -- --reporter=verbose src/ai/feature-vectors`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 35-01-01 | 01 | 1 | CFVEC-01 | unit | `pnpm test -- src/ai/feature-vectors/task-vector.test.ts` | ❌ W0 | ⬜ pending |
| 35-01-02 | 01 | 1 | CFVEC-01 | unit | `pnpm test -- src/ai/feature-vectors/task-vector.test.ts` | ❌ W0 | ⬜ pending |
| 35-02-01 | 02 | 1 | CFVEC-02 | unit | `pnpm test -- src/ai/feature-vectors/person-vector.test.ts` | ❌ W0 | ⬜ pending |
| 35-02-02 | 02 | 1 | CFVEC-02 | unit | `pnpm test -- src/ai/feature-vectors/person-vector.test.ts` | ❌ W0 | ⬜ pending |
| 35-03-01 | 03 | 1 | CFVEC-03 | unit | `pnpm test -- src/ai/feature-vectors/calendar-vector.test.ts` | ❌ W0 | ⬜ pending |
| 35-04-01 | 04 | 1 | CFVEC-04 | unit | `pnpm test -- src/config/binder-types/schema.test.ts` | ✅ extend | ⬜ pending |
| 35-04-02 | 04 | 1 | CFVEC-04 | unit | `pnpm test -- src/ai/feature-vectors/vector-cache.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/ai/feature-vectors/task-vector.test.ts` — stubs for CFVEC-01
- [ ] `src/ai/feature-vectors/person-vector.test.ts` — stubs for CFVEC-02
- [ ] `src/ai/feature-vectors/calendar-vector.test.ts` — stubs for CFVEC-03
- [ ] `src/ai/feature-vectors/vector-cache.test.ts` — stubs for CFVEC-04 persistence path

*Existing `src/config/binder-types/schema.test.ts` will be extended to cover vectorSchema validation.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
