---
phase: 24
slug: unified-enrichment-wizard
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 24 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (existing) |
| **Config file** | vitest implied from package.json |
| **Quick run command** | `pnpm test -- --run` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test -- --run`
- **After every plan wave:** Run `pnpm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 24-01-01 | 01 | 1 | N/A-01 | unit | `pnpm test -- --run src/ai/enrichment/provenance.test.ts` | ❌ W0 | ⬜ pending |
| 24-01-02 | 01 | 1 | N/A-02 | unit | `pnpm test -- --run src/ai/enrichment/maturity.test.ts` | ❌ W0 | ⬜ pending |
| 24-01-03 | 01 | 1 | N/A-03 | unit | `pnpm test -- --run src/ai/enrichment/quality-gate.test.ts` | ❌ W0 | ⬜ pending |
| 24-01-04 | 01 | 1 | N/A-04 | unit | `pnpm test -- --run src/ai/enrichment/enrichment-engine.test.ts` | ❌ W0 | ⬜ pending |
| 24-01-05 | 01 | 1 | N/A-05 | unit | `pnpm test -- --run src/ai/enrichment/graduation.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/ai/enrichment/provenance.test.ts` — bitmask encode/decode roundtrip
- [ ] `src/ai/enrichment/maturity.test.ts` — maturity score computation
- [ ] `src/ai/enrichment/quality-gate.test.ts` — quality composite scoring
- [ ] `src/ai/enrichment/enrichment-engine.test.ts` — state machine transitions
- [ ] `src/ai/enrichment/graduation.test.ts` — graduation proposal generation

*Existing vitest infrastructure covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| EnrichmentWizard renders inline (not modal) | N/A-06 | Visual layout verification | Open inbox, tap Enrich on a card, verify wizard appears inline within card |
| 3-Ring SVG renders correct ring states | N/A-07 | Visual rendering | Check ring fills match provenance bitmask on multiple atoms |
| Swipe gestures work with enrichment open | N/A-08 | Touch interaction | With enrichment open, verify swipe-to-classify still functions |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
