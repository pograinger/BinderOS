---
phase: 14
slug: sanitization-classifier
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-06
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.0.18 |
| **Config file** | vite.config.ts (inline vitest config) |
| **Quick run command** | `pnpm test` |
| **Full suite command** | `pnpm test && pnpm tsc --noEmit` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test`
- **After every plan wave:** Run `pnpm test && pnpm tsc --noEmit`
- **Before `/gsd:verify-work`:** Full suite must be green + Python pipeline recall >= 0.85
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 1 | SNTZ-01 | unit | `pnpm vitest run src/ai/sanitization/sanitizer.test.ts -t "detect"` | ❌ W0 | ⬜ pending |
| 14-01-02 | 01 | 1 | SNTZ-01 | unit (type) | `pnpm tsc --noEmit` | ❌ W0 | ⬜ pending |
| 14-02-01 | 02 | 1 | SNTZ-02 | integration | `python scripts/train/11_train_sanitizer.py` | ❌ W0 | ⬜ pending |
| 14-02-02 | 02 | 1 | SNTZ-02 | integration | `node scripts/train/12_validate_sanitizer.mjs` | ❌ W0 | ⬜ pending |
| 14-03-01 | 03 | 2 | SNTZ-03 | unit | `pnpm vitest run src/ui/components/CloudRequestPreview.test.tsx` | ❌ W0 | ⬜ pending |
| 14-01-03 | 01 | 1 | SNTZ-01 | unit | `pnpm vitest run src/ai/sanitization/regex-patterns.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/ai/sanitization/sanitizer.test.ts` — stubs for SNTZ-01 entity detection + pseudonymization
- [ ] `src/ai/sanitization/regex-patterns.test.ts` — stubs for regex pattern matching
- [ ] `src/ai/sanitization/types.test.ts` — stubs for SanitizedPrompt branded type compile check
- [ ] `src/ui/components/CloudRequestPreview.test.tsx` — stubs for SNTZ-03 modal display
- [ ] `scripts/train/11_train_sanitizer.py` — Python training pipeline (SNTZ-02)
- [ ] `scripts/train/12_validate_sanitizer.mjs` — Browser ONNX validation (SNTZ-02)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Pre-send modal shows pseudonymized diff | SNTZ-03 | Visual layout + user interaction | 1. Trigger cloud AI request with atom containing a name and financial ref. 2. Verify modal shows pseudonymized text. 3. Expand mapping table. 4. Toggle entity restore. |
| Sanitization latency < 50ms | SNTZ-01 | Requires real browser timing | 1. Open DevTools Performance tab. 2. Trigger sanitization on typical atom. 3. Measure time between AI action tap and modal appearance. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
