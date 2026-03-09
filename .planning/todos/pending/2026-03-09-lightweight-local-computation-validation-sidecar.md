---
created: 2026-03-09T02:38:17.491Z
title: Lightweight local computation validation sidecar
area: ai
files:
  - src/ai/tier2/tier2-handler.ts
  - src/ai/triage.ts
---

## Problem

Any AI tier can make claims involving dates ("next Thursday"), quantities ("5km"), units, or simple formulas, but there's no ground-truth validation layer. These get passed through as-is, potentially with incorrect resolutions.

## Solution

Add a lightweight local computation layer (~200KB) that any tier can invoke for validation:
- **math.js** (~170KB) — expression parsing, unit conversion, matrix ops, symbolic algebra subset
- **date-fns or Temporal API** — date arithmetic, timezone resolution ("next Thursday" → concrete date)
- Custom WASM modules if needed (pattern already exists from scoring engine)

Runs on all devices including iPhone. Zero network dependency. Called opportunistically when atom content contains dates, quantities, formulas, or units. Acts as a "Tier 1W" — deterministic computation sitting between Tier 1 rules and Tier 2 ML classifiers.
