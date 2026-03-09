---
created: 2026-03-09T02:38:17.491Z
title: Wolfram computation engine integration
area: ai
files:
  - src/ai/router.ts
  - src/ai/tier2/tier2-handler.ts
---

## Problem

The lightweight local computation sidecar (math.js/date-fns) covers ~95% of validation cases but can't handle complex symbolic math, advanced unit systems, or knowledge-backed computation (e.g., "Is this date a holiday?", "Convert between obscure units").

## Solution

Two-mode Wolfram integration following the existing AI adapter pattern:

1. **Local Wolfram Engine** (desktop only — Windows/Mac/Linux): ~1GB native binary, runs offline, full computational power. Detected at startup via capability check.
2. **Wolfram Cloud API** (all devices including iPhone): Fallback when local engine unavailable. Uses the same sanitized structured query pattern as all other cloud interfaces — T2-T3 privacy boundary, pre-send approval modal, structured queries only (never raw atom content).

Implementation:
- `WolframAdapter` with `local` and `cloud` modes (similar to AI adapter's `browser`/`cloud` pattern)
- Device capability detection: if Wolfram Engine available locally, prefer it; otherwise route to cloud API with sanitization
- Queries are always structured (e.g., `{type: "unit_convert", from: "5km", to: "miles"}`) — never free-form user content
- Integrates as a validation sidecar callable by any tier, not as an AI adapter (it's computation, not inference)
