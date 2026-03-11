---
phase: 26
slug: intelligence-sidecar-schema
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
---

# Phase 26 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — project relies on TypeScript type checking + manual verification (consistent with 25 prior phases) |
| **Config file** | none |
| **Quick run command** | `npx tsc --noEmit` |
| **Full suite command** | `npx tsc --noEmit && pnpm build` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx tsc --noEmit`
- **After every plan wave:** Run `npx tsc --noEmit && pnpm build`
- **Before `/gsd:verify-work`:** Full suite must be green + manual IndexedDB inspection + enrichment flow walkthrough
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 26-01-01 | 01 | 1 | SIDE-01 | smoke | `npx tsc --noEmit` | N/A | ⬜ pending |
| 26-01-02 | 01 | 1 | SIDE-04 | smoke | `npx tsc --noEmit` | N/A | ⬜ pending |
| 26-01-03 | 01 | 1 | ENTR-01 | smoke | `npx tsc --noEmit` | N/A | ⬜ pending |
| 26-01-04 | 01 | 1 | ENTR-02 | smoke | `npx tsc --noEmit` | N/A | ⬜ pending |
| 26-02-01 | 02 | 1 | SIDE-02 | manual | DevTools IndexedDB inspection after migration | No | ⬜ pending |
| 26-03-01 | 03 | 2 | SIDE-03 | manual | Enrich inbox item, verify atomIntelligence row | No | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. Project uses TypeScript type checking and manual verification — consistent with all 25 prior phases.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| atomIntelligence table created with correct schema | SIDE-01 | IndexedDB schema inspection requires browser DevTools | Open DevTools > Application > IndexedDB > BinderOS > verify atomIntelligence table exists with expected fields |
| Enrichment text stripped from atoms on upgrade | SIDE-02 | Migration runs once on DB open, needs pre-existing data | 1. Create enriched inbox item in v8, 2. Upgrade to v9, 3. Verify content has no `---` enrichment section |
| Enrichment writes to sidecar, UI reads from sidecar | SIDE-03 | End-to-end flow through UI + worker + Dexie | 1. Open inbox item, 2. Tap Enrich, 3. Answer a question, 4. Verify atomIntelligence row in DevTools |
| smartLinks[] field on atoms | SIDE-04 | Zod schema validation is compile-time via tsc | `npx tsc --noEmit` passes with smartLinks in atom schema |
| entities table schema | ENTR-01 | IndexedDB schema inspection | DevTools > IndexedDB > BinderOS > entities table exists with indexes |
| entityRelations table schema | ENTR-02 | IndexedDB schema inspection | DevTools > IndexedDB > BinderOS > entityRelations table exists with indexes |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
