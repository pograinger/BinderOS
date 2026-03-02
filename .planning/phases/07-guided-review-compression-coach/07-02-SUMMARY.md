---
phase: 07-guided-review-compression-coach
plan: 02
subsystem: ai
tags: [compression, ai, changelog, crdt, mutation-pipeline, typescript]

# Dependency graph
requires:
  - phase: 05-ai-provider-settings
    provides: MutationLogEntry source/aiRequestId fields in Zod schema, appendMutation function
  - phase: 04-ai-triage-dispatch
    provides: dispatchAI router, AIRequest/AIResponse types, findRelatedAtoms similarity utility
provides:
  - "src/ai/compression.ts: generateCompressionExplanations — batched AI explanations for compression candidates"
  - "Mutation pipeline source tracking: CREATE_ATOM, UPDATE_ATOM, DELETE_ATOM commands accept source/aiRequestId"
  - "appendMutation extended with optional source and aiRequestId parameters"
  - "All atom handlers (handleCreateAtom, handleUpdateAtom, handleDeleteAtom) forward source/aiRequestId to changelog"
affects:
  - 07-03-staging-area
  - future-sync

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure AI module pattern: no store imports, all state passed by caller"
    - "Batched API call pattern: single dispatchAI call for all candidates avoids approval modal fatigue"
    - "Payload destructuring pattern: strip non-schema fields before Zod validation in handlers"
    - "Fallback-first AI pattern: graceful degradation to template explanations on AI failure"

key-files:
  created:
    - src/ai/compression.ts
  modified:
    - src/types/messages.ts
    - src/storage/changelog.ts
    - src/worker/handlers/atoms.ts

key-decisions:
  - "CompressionCandidate in config.ts has id/reason/staleness (not score) — generateCompressionExplanations accepts CompressionCandidate[] which matches actual type"
  - "source/aiRequestId stripped from payload in handleCreateAtom before CreateAtomInputSchema.parse() — they are not Atom fields"
  - "UNDO handler unchanged — reads before-snapshot from changelog regardless of source field, AI mutations already reversible"
  - "Single batched prompt for all compression candidates — one cloud API call = one approval modal"

patterns-established:
  - "Pattern: AI engine modules are pure — accept atoms/candidates/scores as parameters, never import from store.ts"
  - "Pattern: source: 'ai' flows through Command -> handler -> appendMutation -> MutationLogEntry for full traceability"

requirements-completed: [AIRV-04, AIGN-03, AIGN-04]

# Metrics
duration: 13min
completed: 2026-03-02
---

# Phase 7 Plan 02: Compression Coach Engine and AI Mutation Pipeline Summary

**Compression coach engine with batched AI explanations, plus source:'ai' threading through Command types, worker handlers, and appendMutation for full AI mutation traceability**

## Performance

- **Duration:** 13 min
- **Started:** 2026-03-02T18:59:54Z
- **Completed:** 2026-03-02T19:12:43Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Extended CREATE_ATOM, UPDATE_ATOM, DELETE_ATOM command types with optional `source` and `aiRequestId` fields — AI-approved mutations can now be tagged at dispatch
- Extended `appendMutation()` with source/aiRequestId parameters that flow to MutationLogEntry (Zod schema already had these fields from Phase 5)
- Updated all three atom handlers to strip non-schema fields before Zod validation and forward source/aiRequestId to changelog
- Created `src/ai/compression.ts` — pure compression coach engine with signal enrichment, batched AI prompting, JSON response parsing, and graceful fallback

## Task Commits

Each task was committed atomically:

1. **Task 1: Thread source: 'ai' through Command types, worker handlers, and appendMutation** - `4d6bf8c` (feat)
2. **Task 2: Compression coach engine module — batched AI explanations with signal aggregation** - `e7c84a4` (feat)

## Files Created/Modified
- `src/types/messages.ts` - Extended CREATE_ATOM, UPDATE_ATOM, DELETE_ATOM with optional source and aiRequestId
- `src/storage/changelog.ts` - Extended appendMutation signature with optional source and aiRequestId parameters
- `src/worker/handlers/atoms.ts` - Updated all three handlers to accept and forward source/aiRequestId; handleCreateAtom strips them before Zod validation
- `src/ai/compression.ts` - New compression coach engine: enrichCandidates, buildCompressionBatchPrompt, parseCompressionBatchResponse, buildFallbackExplanations, generateCompressionExplanations

## Decisions Made
- `CompressionCandidate` type in `src/types/config.ts` has `id`, `reason`, `staleness` fields (not `score` as referenced in plan). The function signature was adapted to use the actual type — `generateCompressionExplanations` accepts `CompressionCandidate[]` which matches the actual schema from the WASM engine output.
- In `parseCompressionBatchResponse`, switched from `.map().filter()` with type guard to imperative loop to avoid TypeScript type guard complexity with nullable mapped types. Functionally identical.
- The `_scores` parameter is accepted but not used in enrichment (staleness and link count come from atom data directly, not from the pre-computed scores). Kept in signature for caller convenience since Plan 03 will have scores available.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript type errors in parseCompressionBatchResponse**
- **Found during:** Task 2 (compression.ts creation), verification step
- **Issue:** `.map().filter((x): x is CompressionExplanation => x !== null)` produced TS2677 (type predicate type not assignable to parameter type) because the mapped type includes null which TypeScript couldn't narrow through the predicate
- **Fix:** Replaced `.map().filter()` with imperative for-of loop using `continue` for null cases, building a typed `CompressionExplanation[]` array directly
- **Files modified:** src/ai/compression.ts
- **Verification:** `npx tsc --noEmit` passes with no src/ errors
- **Committed in:** e7c84a4 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — type predicate fix)
**Impact on plan:** Fix was necessary for TypeScript correctness. Behavior identical. No scope creep.

## Issues Encountered
- Pre-existing TypeScript errors in `node_modules/` (web-llm, workbox, vite-plugin-pwa type issues) and `src/ui/components/VoiceCapture.tsx` — confirmed pre-existing by checking that no src/ errors outside these files exist. All TypeScript errors from plan modifications: zero.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Plan 03 (staging area) can use `generateCompressionExplanations()` with the full atom store, scores, and candidates from the worker STATE_UPDATE
- The mutation pipeline is ready: Plan 03's staging area can dispatch CREATE_ATOM/UPDATE_ATOM/DELETE_ATOM with `source: 'ai'` and `aiRequestId` to tag AI-approved changes in the changelog
- UNDO already works for AI mutations — no changes needed to UNDO handler

---
*Phase: 07-guided-review-compression-coach*
*Completed: 2026-03-02*
