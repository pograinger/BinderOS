---
phase: 27
slug: entity-detection-registry
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
---

# Phase 27 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (existing) |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx tsc --noEmit && pnpm build` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx tsc --noEmit`
- **After every plan wave:** Run `npx tsc --noEmit && pnpm build`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 27-01-01 | 01 | 1 | ENTD-01 | build | `npx tsc --noEmit` | ✅ | ⬜ pending |
| 27-01-02 | 01 | 1 | ENTD-01, ENTD-02 | build | `npx tsc --noEmit` | ✅ | ⬜ pending |
| 27-02-01 | 02 | 2 | ENTD-03, ENTR-03, ENTR-04 | build | `npx tsc --noEmit` | ✅ | ⬜ pending |
| 27-02-02 | 02 | 2 | ENTR-05 | build | `npx tsc --noEmit && pnpm build` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. TypeScript compilation and Vite build serve as the primary automated verification.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Entity badges visible on atom detail | ENTR-05 | Visual UI rendering | Open atom with detected entities, verify colored chips below content |
| NER model loads on startup | ENTD-01 | Runtime behavior | Check console for NER_READY message on app start |
| PII redaction still works after model swap | ENTD-01 | Cloud dispatch pathway | Dispatch a cloud request with a name, verify pseudonymization |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
