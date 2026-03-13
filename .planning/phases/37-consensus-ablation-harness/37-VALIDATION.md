---
phase: 37
slug: consensus-ablation-harness
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 37 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None (project validates via harness adversarial run) |
| **Config file** | none — harness scripts are the validation layer |
| **Quick run command** | `npx tsx scripts/harness/run-harness.ts --persona alex-jordan --dry-run` |
| **Full suite command** | `npx tsx scripts/harness/run-adversarial.ts --personas alex-jordan --cycles 1` |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task commit:** `npx tsx -e "import('./src/ai/eii/index.ts').then(m => console.log(m.computeEII([])))"` — verify EII module loads
- **After every plan wave:** `npx tsx scripts/harness/run-harness.ts --persona alex-jordan --dry-run` — verify harness wiring
- **Before `/gsd:verify-work`:** Full adversarial run with EII+ablation sections in report
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 37-01-01 | 01 | 1 | EII-01 | unit | `npx tsx -e "import { computeEII } from './src/ai/eii/index.ts'; console.log(computeEII([]))"` | ❌ W0 | ⬜ pending |
| 37-02-01 | 02 | 1 | EII-02 | integration | `npx tsx scripts/harness/run-adversarial.ts --personas alex-jordan --cycles 2` | ❌ W0 | ⬜ pending |
| 37-03-01 | 03 | 2 | EII-03 | integration | `npx tsx scripts/harness/run-adversarial.ts --personas alex-jordan --cycles 1` | ❌ W0 | ⬜ pending |
| 37-04-01 | 04 | 2 | EII-04 | harness validation | `npx tsx scripts/harness/run-adversarial.ts --personas alex-jordan --cycles 5` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/ai/eii/index.ts` — computeEII() pure function — covers EII-01
- [ ] `src/ai/eii/types.ts` — EIIResult, BinderEIISnapshot types
- [ ] `src/storage/migrations/v11.ts` — binderIntelligence table
- [ ] `scripts/harness/harness-onnx.ts` — specialist session loader
- [ ] `scripts/harness/harness-consensus.ts` — production consensus wrapper with CycleState storage
- [ ] `scripts/harness/eii-report.ts` — ASCII curve builder + ablation section

*(No new framework install needed — onnxruntime-node already in project)*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| EII curve shows positive slope visually | EII-04 | Chart interpretation requires human review | Inspect ASCII chart in harness report for monotonic growth |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
