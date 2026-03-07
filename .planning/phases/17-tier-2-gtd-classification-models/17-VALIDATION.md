---
phase: 17
slug: tier-2-gtd-classification-models
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Python sklearn metrics + Node.js ONNX validation (onnxruntime-node) |
| **Config file** | scripts/train/22_validate_gtd_models.mjs (Wave 0) |
| **Quick run command** | `node scripts/train/22_validate_gtd_models.mjs --classifier gtd-routing` |
| **Full suite command** | `node scripts/train/22_validate_gtd_models.mjs --all` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `python scripts/train/21_train_gtd_classifier.py --classifier <name>` (prints eval report)
- **After every plan wave:** Run `node scripts/train/22_validate_gtd_models.mjs --all`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 1 | GTD-01 | validation | `python scripts/train/20_generate_gtd_data.py --classifier gtd-routing --count 1000` | No — W0 | ⬜ pending |
| 17-01-02 | 01 | 1 | GTD-02 | validation | `python scripts/train/20_generate_gtd_data.py --classifier actionability --count 1000` | No — W0 | ⬜ pending |
| 17-01-03 | 01 | 1 | GTD-03 | validation | `python scripts/train/20_generate_gtd_data.py --classifier project-detection --count 1000` | No — W0 | ⬜ pending |
| 17-01-04 | 01 | 1 | GTD-04 | validation | `python scripts/train/20_generate_gtd_data.py --classifier context-tagging --count 1000` | No — W0 | ⬜ pending |
| 17-02-01 | 02 | 2 | GTD-01 | validation | `python scripts/train/21_train_gtd_classifier.py --classifier gtd-routing` | No — W0 | ⬜ pending |
| 17-02-02 | 02 | 2 | GTD-02 | validation | `python scripts/train/21_train_gtd_classifier.py --classifier actionability` | No — W0 | ⬜ pending |
| 17-02-03 | 02 | 2 | GTD-03 | validation | `python scripts/train/21_train_gtd_classifier.py --classifier project-detection` | No — W0 | ⬜ pending |
| 17-02-04 | 02 | 2 | GTD-04 | validation | `python scripts/train/21_train_gtd_classifier.py --classifier context-tagging` | No — W0 | ⬜ pending |
| 17-02-05 | 02 | 2 | GTD-05 | validation | `node scripts/train/22_validate_gtd_models.mjs --all` | No — W0 | ⬜ pending |
| 17-03-01 | 03 | 3 | GTD-06 | manual | Visual inspection of triage cards with "?" indicator | N/A | ⬜ pending |
| 17-03-02 | 03 | 3 | GTD-07 | manual | Visual inspection of triage card UI | N/A | ⬜ pending |
| 17-03-03 | 03 | 3 | GTD-08 | manual | Verify JSONL export includes GTD fields | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/train/20_generate_gtd_data.py` — Faker-based data generation for all 4 classifiers
- [ ] `scripts/train/21_train_gtd_classifier.py` — MLP training + ONNX export for all 4 classifiers
- [ ] `scripts/train/22_validate_gtd_models.mjs` — Node.js ONNX validation for all 4 models
- [ ] `scripts/training-data/gtd-routing.jsonl` — training data output
- [ ] `scripts/training-data/actionability.jsonl` — training data output
- [ ] `scripts/training-data/project-detection.jsonl` — training data output
- [ ] `scripts/training-data/context-tagging.jsonl` — training data output

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Confidence "?" indicator on triage cards | GTD-06 | Visual UI element | Trigger low-confidence classification, verify "?" suffix on GTD label |
| Triage card shows GTD classifications | GTD-07 | UI layout verification | Process a task atom through triage, check card shows Type + GTD List + Context |
| GTD corrections in JSONL export | GTD-08 | End-to-end data flow | Correct a GTD classification, export JSONL, verify GTD fields present |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
