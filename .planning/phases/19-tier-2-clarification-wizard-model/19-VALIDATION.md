---
phase: 19
slug: tier-2-clarification-wizard-model
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-08
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Python unittest (training) + Node.js validation scripts |
| **Config file** | None — scripts are self-contained |
| **Quick run command** | `node scripts/train/42_validate_clarification.mjs` |
| **Full suite command** | `python -u scripts/train/41_train_clarification_classifier.py --classifier all && node scripts/train/42_validate_clarification.mjs` |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node scripts/train/42_validate_clarification.mjs`
- **After every plan wave:** Run `python -u scripts/train/41_train_clarification_classifier.py --classifier all && node scripts/train/42_validate_clarification.mjs`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 19-01-01 | 01 | 1 | CLAR-01 | unit (training) | `python -u scripts/train/41_train_clarification_classifier.py --classifier completeness-gate` | ❌ W0 | ⬜ pending |
| 19-01-02 | 01 | 1 | CLAR-02 | unit (training) | `python -u scripts/train/41_train_clarification_classifier.py --classifier all` | ❌ W0 | ⬜ pending |
| 19-01-03 | 01 | 1 | CLAR-02 | integration | `node scripts/train/42_validate_clarification.mjs` | ❌ W0 | ⬜ pending |
| 19-02-01 | 02 | 2 | CLAR-03 | manual-only | Triage inbox item, verify "Clarify this" appears for vague items | N/A | ⬜ pending |
| 19-02-02 | 02 | 2 | CLAR-05 | manual-only | Test with cloud disabled (templates) and enabled (cloud + timeout) | N/A | ⬜ pending |
| 19-03-01 | 03 | 2 | CLAR-04 | manual-only | Tap "Clarify this", walk through questions, verify partial answers | N/A | ⬜ pending |
| 19-03-02 | 03 | 2 | CLAR-07 | manual-only | Complete clarification, verify enriched text and re-triage result | N/A | ⬜ pending |
| 19-04-01 | 04 | 3 | CLAR-08 | smoke | Verify Dexie migration succeeds, records created on clarification | N/A | ⬜ pending |
| 19-04-02 | 04 | 3 | CLAR-06 | manual-only | Run clarification multiple times, verify option ranking changes | N/A | ⬜ pending |
| 19-05-01 | 05 | 3 | CLAR-09 | unit | Verify gtd-personal.json loads at build time, categories resolve | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `scripts/train/40_generate_clarification_data.py` — synthetic data generator
- [ ] `scripts/train/41_train_clarification_classifier.py` — training script with --classifier flag
- [ ] `scripts/train/42_validate_clarification.mjs` — Node.js parity validation
- [ ] `scripts/training-data/clarification-*.jsonl` — 6 training data files

*Existing infrastructure covers TypeScript integration tests (Vite build).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Completeness gate in triage cascade | CLAR-03 | UI interaction required | Triage inbox item and verify "Clarify this" appears for vague items |
| ClarificationFlow modal UX | CLAR-04 | Modal flow interaction | Tap "Clarify this", walk through questions, verify partial answers applied |
| Tier-adaptive option generation | CLAR-05 | Requires cloud toggle | Test with cloud disabled (template options) and enabled (cloud + 2s timeout fallback) |
| Self-learning corrections | CLAR-06 | Requires repeated interactions | Run clarification multiple times, verify option ranking changes |
| Atom enrichment + re-triage | CLAR-07 | End-to-end flow | Complete clarification, verify enriched text and re-triage result |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
