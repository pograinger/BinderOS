---
phase: 33
slug: sequence-context-onnx-model
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 33 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.0.18 |
| **Config file** | vite.config.ts |
| **Quick run command** | `pnpm test` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test`
- **After every plan wave:** Run `pnpm test` + `node scripts/train/sequence/62_validate_sequence_model.mjs` + `node scripts/train/sequence/64_validate_classifiers_512.mjs`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 33-01-01 | 01 | 1 | SEQ-01 | unit | `pnpm test` (ring-buffer.test.ts) | ❌ W0 | ⬜ pending |
| 33-02-01 | 02 | 1 | SEQ-02 | integration | `node scripts/train/sequence/62_validate_sequence_model.mjs` | ❌ W0 | ⬜ pending |
| 33-03-01 | 03 | 2 | SEQ-03 | unit | `pnpm test` (sequence-concat.test.ts) | ❌ W0 | ⬜ pending |
| 33-04-01 | 04 | 2 | SEQ-04 | integration | `python -u scripts/train/sequence/65_ablation_sequence.py` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/search/__tests__/ring-buffer.test.ts` — stubs for SEQ-01: ring buffer update, cap, cold-start, Dexie persistence via message bridge
- [ ] `src/ai/tier2/__tests__/sequence-concat.test.ts` — stubs for SEQ-03: 512-dim concatenation, zero-pad fallback, tensor shape check
- [ ] `scripts/train/sequence/` directory — scaffold for all Python/Node training scripts
- [ ] Python env: `pip install torch onnxruntime sentence-transformers` — needed before any training script runs

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Mobile memory stays within budget | SEQ-01 | Requires real mobile device | Load app on mobile, create 10+ atoms, verify no OOM via DevTools memory tab |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
