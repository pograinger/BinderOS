---
phase: 14-sanitization-classifier
plan: "02"
subsystem: ai
tags: [ner, pii, sanitization, pseudonymization, branded-types, web-worker, dexie, transformers-js]

# Dependency graph
requires:
  - phase: 13-multi-provider-cloud
    provides: "Cloud adapters (Anthropic, OpenAI-compatible) with privacy-proxy and key-vault"
provides:
  - SanitizedPrompt branded type enforcing sanitization-before-cloud at compile time
  - Hybrid NER + regex PII detection across 5 entity categories
  - Persistent entity-to-pseudonym registry in IndexedDB (Dexie v5)
  - Dedicated sanitization web worker for NER inference
  - De-pseudonymization of cloud responses
affects: [14-03-pre-send-modal, 15-device-adaptive-llm]

# Tech tracking
tech-stack:
  added: ["@huggingface/transformers (token-classification pipeline in dedicated worker)"]
  patterns: [branded-type-enforcement, worker-message-protocol, entity-pseudonymization, graceful-degradation]

key-files:
  created:
    - src/ai/sanitization/types.ts
    - src/ai/sanitization/regex-patterns.ts
    - src/ai/sanitization/entity-registry.ts
    - src/ai/sanitization/sanitizer.ts
    - src/workers/sanitization-worker.ts
    - src/storage/migrations/v5.ts
  modified:
    - src/storage/db.ts
    - src/ai/privacy-proxy.ts
    - src/ai/key-vault.ts
    - src/ai/adapters/cloud.ts
    - src/ai/adapters/cloud-openai.ts

key-decisions:
  - "Dedicated sanitization worker (not reusing embedding worker) for NER inference — keeps memory footprint isolated"
  - "SanitizedPrompt branded type with unique symbol prevents raw string assignment to CloudRequestLogEntry.sanitizedPrompt"
  - "Entity registry uses compound Dexie index [normalizedText+category] for efficient dedup lookups"
  - "NER model loaded lazily on first SANITIZE message — zero memory until cloud dispatch is used"
  - "Regex CONTACT precedence over NER PERSON in overlap resolution (email/phone patterns)"

patterns-established:
  - "Branded type enforcement: SanitizedPrompt can only be created via createSanitizedPrompt()"
  - "Worker request-response correlation via pending Map<id, {resolve, reject}>"
  - "Entity overlap resolution: regex CONTACT > NER PERSON; longer span > shorter span; same span merges as 'both'"

requirements-completed: [SNTZ-01]

# Metrics
duration: 9min
completed: 2026-03-06
---

# Phase 14 Plan 02: Sanitization Pipeline Summary

**Branded SanitizedPrompt type + hybrid NER/regex PII detection with persistent pseudonym registry, dedicated web worker, and cloud adapter wiring**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-06T18:42:18Z
- **Completed:** 2026-03-06T18:51:00Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- SanitizedPrompt branded type enforces compile-time sanitization guarantee on CloudRequestLogEntry
- Hybrid NER + regex detection covers all 5 PII categories (PERSON, LOCATION, FINANCIAL, CONTACT, CREDENTIAL)
- Persistent entity registry in Dexie (v5 migration) ensures consistent pseudonyms across sessions
- Dedicated sanitization worker isolates NER model memory from main thread and embedding worker
- Both cloud adapters (Anthropic, OpenAI-compatible) wired to sanitize prompts and de-pseudonymize responses

## Task Commits

Each task was committed atomically:

1. **Task 1: Types, regex, entity registry, and Dexie migration** - `6fb893f` (feat)
2. **Task 2: Sanitization worker, core sanitizer, privacy-proxy wiring, and cloud adapter refactor** - `c7db67e` (feat)

## Files Created/Modified
- `src/ai/sanitization/types.ts` - SanitizedPrompt branded type, DetectedEntity, EntityCategory, SanitizedResult, EntityRegistryEntry
- `src/ai/sanitization/regex-patterns.ts` - PII regex pattern library (11 patterns) with detectWithRegex()
- `src/ai/sanitization/entity-registry.ts` - Dexie-backed persistent pseudonym registry (getOrCreatePseudonym, buildEntityMap)
- `src/ai/sanitization/sanitizer.ts` - Core pipeline: detectEntities (NER+regex), sanitizeText, dePseudonymize
- `src/workers/sanitization-worker.ts` - Dedicated NER worker with lazy model loading and SANITIZE/SANITIZE_RESULT protocol
- `src/storage/migrations/v5.ts` - Dexie v5 migration adding entityRegistry table
- `src/storage/db.ts` - Wired v5 migration and entityRegistry table declaration
- `src/ai/privacy-proxy.ts` - Default level changed to 'full', returns Promise<SanitizedResult>
- `src/ai/key-vault.ts` - CloudRequestLogEntry.sanitizedPrompt changed to SanitizedPrompt type
- `src/ai/adapters/cloud.ts` - Uses SanitizedResult, de-pseudonymizes responses
- `src/ai/adapters/cloud-openai.ts` - Uses SanitizedResult, de-pseudonymizes responses

## Decisions Made
- Dedicated worker for NER (not reusing embedding worker) to isolate memory footprint
- Lazy NER model loading on first SANITIZE message to avoid startup cost when cloud is not used
- Compound Dexie index [normalizedText+category] for efficient entity dedup
- Regex CONTACT takes precedence over NER PERSON in overlap resolution (Pitfall 3 from RESEARCH.md)
- aggregation_strategy: 'simple' cast through Record<string, unknown> to bypass incomplete TypeScript types

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript type mismatch for aggregation_strategy option**
- **Found during:** Task 2 (sanitization worker)
- **Issue:** Transformers.js TypeScript types for TokenClassificationPipelineOptions do not include aggregation_strategy, but the runtime supports it
- **Fix:** Cast options object through Record<string, unknown> to bypass strict type checking
- **Files modified:** src/workers/sanitization-worker.ts
- **Verification:** pnpm tsc --noEmit passes (excluding pre-existing node_modules errors)
- **Committed in:** c7db67e (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor type workaround. No scope creep.

## Issues Encountered
None beyond the TypeScript type gap noted above.

## User Setup Required
None - no external service configuration required. NER model files must be pre-downloaded to public/models/sanitization/sanitize-check/ (handled by model download scripts, not user action).

## Next Phase Readiness
- Sanitization pipeline complete and wired into cloud adapters
- Ready for Plan 03: Pre-send approval modal UI that consumes SanitizedResult
- Entity registry ready for user-facing restore preference controls

---
*Phase: 14-sanitization-classifier*
*Completed: 2026-03-06*
