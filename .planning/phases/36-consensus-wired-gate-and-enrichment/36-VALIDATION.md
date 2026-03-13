---
phase: 36
slug: consensus-wired-gate-and-enrichment
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 36 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.18 |
| **Config file** | vite.config.ts (test section) |
| **Quick run command** | `pnpm test -- --reporter=verbose src/ai/consensus` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test -- --reporter=verbose src/ai/consensus`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 36-01-01 | 01 | 1 | CONS-01 | smoke | `node -e "['time-pressure','dependency','staleness','energy-context'].forEach(n => { const s = require('fs').statSync('public/models/specialists/'+n+'-risk.onnx').size; console.assert(s < 20480, n+' too large') })"` | ❌ W0 | ⬜ pending |
| 36-02-01 | 02 | 1 | CONS-02 | unit | `pnpm test -- src/ai/consensus/consensus-voter.test.ts` | ❌ W0 | ⬜ pending |
| 36-02-02 | 02 | 1 | CONS-03 | unit | `pnpm test -- src/ai/consensus/consensus-voter.test.ts` | ❌ W0 | ⬜ pending |
| 36-03-01 | 03 | 2 | CONS-04 | unit | `pnpm test -- src/ai/consensus/consensus-voter.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/ai/consensus/consensus-voter.test.ts` — stubs for CONS-02, CONS-03, CONS-04
- [ ] `public/models/specialists/` — 4 ONNX models trained via `python -u scripts/train/70_train_specialist_models.py`
- [ ] `scripts/train/70_train_specialist_models.py` — production training pipeline

*Existing infrastructure (vitest, ort, Dexie) covers framework requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Consensus worker loads in browser without OOM | CONS-01 | Requires real browser with memory constraints | Open app, create 15+ atoms, verify no console errors from consensus-worker |
| Fire-and-forget consensus does not block triage UI | CONS-04 | Timing behavior in real UI | Triage an atom, verify no perceptible delay |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
