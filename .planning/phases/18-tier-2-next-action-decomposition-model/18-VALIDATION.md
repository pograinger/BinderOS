---
phase: 18
slug: tier-2-next-action-decomposition-model
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-08
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js script (onnxruntime-node) + Python onnxruntime |
| **Config file** | scripts/train/32_validate_decomposition_model.mjs |
| **Quick run command** | `node scripts/train/32_validate_decomposition_model.mjs` |
| **Full suite command** | `node scripts/train/32_validate_decomposition_model.mjs` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node scripts/train/32_validate_decomposition_model.mjs` (after model training tasks)
- **After every plan wave:** Full validation + manual UI check
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 18-01-01 | 01 | 0 | N/A-01 | unit | `node scripts/train/32_validate_decomposition_model.mjs` | ❌ W0 | ⬜ pending |
| 18-01-02 | 01 | 0 | N/A-02 | unit | `node scripts/train/32_validate_decomposition_model.mjs` | ❌ W0 | ⬜ pending |
| 18-02-01 | 02 | 1 | N/A-03 | manual-only | Manual verification during step review | N/A | ⬜ pending |
| 18-03-01 | 03 | 2 | N/A-04 | manual-only | Manual UI verification | N/A | ⬜ pending |
| 18-03-02 | 03 | 2 | N/A-05 | manual-only | Manual UI verification | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/train/30_generate_decomposition_data.py` — Faker-based JSONL training data generation
- [ ] `scripts/train/31_train_decomposition_classifier.py` — MiniLM + MLP + Platt + ONNX export
- [ ] `scripts/train/32_validate_decomposition_model.mjs` — Python/Node parity validation
- [ ] `scripts/training-data/decomposition.jsonl` — generated training data
- [ ] `public/models/classifiers/decomposition.onnx` — trained ONNX model
- [ ] `public/models/classifiers/decomposition-classes.json` — class label mapping

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Template slot-filling produces valid step text | N/A-03 | Requires semantic judgment of output quality | Create test atoms, run decomposition, verify steps make sense |
| Break-this-down button triggers decomposition flow | N/A-04 | UI interaction test | Click button on task/decision atoms, verify flow launches |
| AIQuestionFlow presents steps one-at-a-time | N/A-05 | UI flow test | Verify steps appear sequentially with accept/edit/skip per step |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
