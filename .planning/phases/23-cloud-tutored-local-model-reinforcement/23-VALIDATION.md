---
phase: 23
slug: cloud-tutored-local-model-reinforcement
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-08
---

# Phase 23 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | sklearn + custom benchmark (Python) + Node.js ONNX validation (existing) |
| **Config file** | scripts/train/requirements.txt |
| **Quick run command** | `python -u scripts/train/50_benchmark_models.py --classifier type` |
| **Full suite command** | `python -u scripts/train/50_benchmark_models.py --classifier all` |
| **Estimated runtime** | ~120 seconds (full benchmark all classifiers) |

---

## Sampling Rate

- **After every task commit:** Run `python -u scripts/train/50_benchmark_models.py --classifier type` (quick single-classifier check)
- **After every plan wave:** Full benchmark + retrain cycle on one representative classifier
- **Before `/gsd:verify-work`:** Full suite must be green — all 14 classifiers benchmarked, augmented, retrained, validated with no accuracy regression
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 23-01-01 | 01 | 1 | (TBD) | smoke | `python -u scripts/train/50_benchmark_models.py --classifier all` | ❌ W0 | ⬜ pending |
| 23-02-01 | 02 | 1 | (TBD) | smoke | `python -u scripts/train/51_generate_adversarial.py --classifier type --count 50 --dry-run` | ❌ W0 | ⬜ pending |
| 23-03-01 | 03 | 1 | (TBD) | smoke | `python -u scripts/train/52_gap_analysis.py --classifier type` | ❌ W0 | ⬜ pending |
| 23-04-01 | 04 | 2 | (TBD) | smoke | `python -u scripts/train/53_distill_labels.py --classifier type --count 20` | ❌ W0 | ⬜ pending |
| 23-05-01 | 05 | 3 | (TBD) | integration | Run existing validate scripts (04, 22, 32, 42) | ✅ | ⬜ pending |
| 23-05-02 | 05 | 3 | (TBD) | smoke | Check `scripts/train/reports/` for output | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/train/50_benchmark_models.py` — benchmark framework stub
- [ ] `scripts/train/51_generate_adversarial.py` — adversarial generation stub
- [ ] `scripts/train/52_gap_analysis.py` — gap identification stub
- [ ] `scripts/train/53_distill_labels.py` — teacher-student relabeling stub
- [ ] `scripts/train/reports/` directory — output location for benchmark reports

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cloud-generated examples are GTD-expert quality | (TBD) | Requires human judgment on GTD methodology nuance | Review 10-20 random samples from each adversarial batch for GTD accuracy |
| Gap analysis report is actionable | (TBD) | Requires human judgment on insights quality | Review report for specific, actionable recommendations |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
