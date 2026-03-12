---
phase: 30
slug: schema-bindertypeconfig-protocol
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 30 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm vitest run --reporter=verbose` |
| **Full suite command** | `pnpm vitest run --reporter=verbose` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm vitest run --reporter=verbose`
- **After every plan wave:** Run `pnpm vitest run --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 30-01-01 | 01 | 1 | SCHM-01 | unit | `pnpm vitest run src/storage/__tests__/v10-migration.test.ts` | ❌ W0 | ⬜ pending |
| 30-01-02 | 01 | 1 | SCHM-01 | unit | `pnpm vitest run src/storage/__tests__/v10-tables.test.ts` | ❌ W0 | ⬜ pending |
| 30-02-01 | 02 | 1 | BTYPE-01 | unit | `pnpm vitest run src/config/__tests__/binder-type-config.test.ts` | ❌ W0 | ⬜ pending |
| 30-02-02 | 02 | 1 | BTYPE-01 | unit | `pnpm vitest run src/config/__tests__/binder-type-registry.test.ts` | ❌ W0 | ⬜ pending |
| 30-03-01 | 03 | 2 | BTYPE-01 | unit | `pnpm vitest run src/ai/context-gate/__tests__/predicate-registry.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/storage/__tests__/v10-migration.test.ts` — stubs for SCHM-01 migration
- [ ] `src/config/__tests__/binder-type-config.test.ts` — stubs for BTYPE-01 config interface
- [ ] `src/config/__tests__/binder-type-registry.test.ts` — stubs for BTYPE-01 registry
- [ ] `src/ai/context-gate/__tests__/predicate-registry.test.ts` — stubs for predicate scaffold

*Existing vitest infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Vite plugin merges binder-type JSON at build | BTYPE-01 | Build-time plugin behavior | Run `pnpm build`, verify merged config in output |
| v10 migration on existing v9 database | SCHM-01 | Requires populated IndexedDB | Open app in browser, verify tables in DevTools |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
