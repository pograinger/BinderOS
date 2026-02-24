---
phase: 05-triage-ai
plan: 02
subsystem: database
tags: [dexie, indexeddb, ai, schema, zod, solidjs, atoms, changelog]

# Dependency graph
requires:
  - phase: 04-ai-infrastructure
    provides: AI adapter infrastructure, store AI state fields (aiEnabled, browserLLMEnabled, etc.)
  - phase: 03-pages-nav-search
    provides: Dexie v2 migration pattern, classification log pattern
provides:
  - aiSourced optional boolean field on all atom types (Zod schema + Dexie v3 index)
  - source and aiRequestId optional fields on MutationLogEntrySchema
  - Dexie v3 migration with aiSourced index on atoms table
  - AI settings persistence (loadAISettings/saveAISettings) via Dexie config table
  - SAVE_AI_SETTINGS worker command for settings persistence
  - READY payload includes aiSettings loaded from Dexie on startup
  - CLASSIFY_INBOX_ITEM supports optional aiSourced flag
  - AtomCard shows AI badge (sparkle icon) for aiSourced atoms
  - AI setter functions dispatch SAVE_AI_SETTINGS to worker for persistence
affects: [05-triage-ai/03-triage-pipeline, 05-triage-ai/04+, phase-6, phase-7]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "AI settings persistence via Dexie config table with write queue (same as classification-log pattern)"
    - "Dexie version increment pattern: applyV3Migration() in db.ts constructor after v2"
    - "READY payload hydration: worker loads persisted state, store applies on READY message"
    - "SAVE_AI_SETTINGS: fire-and-forget worker command, no flushAndSendState needed"

key-files:
  created:
    - src/storage/migrations/v3.ts
    - src/storage/ai-settings.ts
  modified:
    - src/types/atoms.ts
    - src/types/changelog.ts
    - src/types/messages.ts
    - src/storage/db.ts
    - src/worker/worker.ts
    - src/worker/handlers/inbox.ts
    - src/ui/signals/store.ts
    - src/ui/components/AtomCard.tsx
    - src/ui/layout/layout.css

key-decisions:
  - "aiSourced defaults to false on existing atoms via Dexie v3 upgrade() — clean querying without undefined in index"
  - "SAVE_AI_SETTINGS is fire-and-forget (no flushAndSendState) — settings changes don't require full state update"
  - "AI badge uses bracket access (props.atom as Record<string, unknown>).aiSourced to follow SolidJS reactivity rules (no in operator)"
  - "source: 'user' | 'ai' spread onto appendMutation result in inbox handler — avoids changing appendMutation signature"

patterns-established:
  - "Phase 5 worker pattern: loadX() called in INIT, included in READY payload, store hydrates in READY handler"
  - "AI badge: sparkle SVG 12x12px with title=AI-suggested, .ai-badge CSS class, var(--accent) color, inline-flex"

requirements-completed: [AIUX-05]

# Metrics
duration: 8min
completed: 2026-02-24
---

# Phase 5 Plan 02: Schema Extensions and AI Settings Persistence Summary

**Atom schema extended with aiSourced field indexed in Dexie v3, AI settings persist across reloads via Dexie config table, and AtomCard shows subtle AI badge for AI-classified atoms**

## Performance

- **Duration:** 8 min
- **Started:** 2026-02-24T10:27:34Z
- **Completed:** 2026-02-24T10:35:34Z
- **Tasks:** 2
- **Files modified:** 10 (2 created, 8 modified)

## Accomplishments
- Extended Zod atom schema with `aiSourced: boolean` (optional) and registered it in Dexie v3 with proper index
- Created AI settings persistence module (`loadAISettings`/`saveAISettings`) following classification-log.ts pattern
- Fixed Phase 4 deferred bug: `aiFirstRunComplete` and all AI toggles now persist across page reloads
- Wired CLASSIFY_INBOX_ITEM to tag resulting atom and changelog entry with AI source when `aiSourced: true`
- Added subtle sparkle-icon AI badge to AtomCard rendered conditionally when `atom.aiSourced === true`

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend atom/changelog schemas, Dexie v3 migration, AI settings persistence** - `9888a4d` (feat)
2. **Task 2: Wire AI settings into worker INIT/READY, AI badge on AtomCard, AI mutation tagging** - `6c88c28` (feat)

**Plan metadata:** (pending final commit)

## Files Created/Modified
- `src/storage/migrations/v3.ts` - Dexie v3 migration adding aiSourced index on atoms table
- `src/storage/ai-settings.ts` - loadAISettings/saveAISettings using Dexie config table
- `src/types/atoms.ts` - Added optional aiSourced: boolean to BaseAtomFields
- `src/types/changelog.ts` - Added optional source: 'user'|'ai' and aiRequestId fields
- `src/types/messages.ts` - Added SAVE_AI_SETTINGS command, aiSettings to READY payload, aiSourced to CLASSIFY_INBOX_ITEM
- `src/storage/db.ts` - Register applyV3Migration after v2 migration
- `src/worker/worker.ts` - Load AI settings in INIT, include in READY, handle SAVE_AI_SETTINGS command
- `src/worker/handlers/inbox.ts` - Tag atom and changelog with aiSourced/source: 'ai' when requested
- `src/ui/signals/store.ts` - Hydrate AI state from READY payload, dispatch SAVE_AI_SETTINGS on each setter
- `src/ui/components/AtomCard.tsx` - Conditional AI badge (sparkle SVG) when atom.aiSourced === true
- `src/ui/layout/layout.css` - Added .ai-badge CSS class in Phase 5 section

## Decisions Made
- **aiSourced defaults to false on existing atoms**: The Dexie v3 upgrade() sets `aiSourced = false` on all existing atoms rather than leaving `undefined`, enabling clean index queries without sparse index issues.
- **SAVE_AI_SETTINGS is fire-and-forget**: No `flushAndSendState()` after saving AI settings — settings changes don't affect atom/inbox state so a full state update would be wasteful.
- **AI badge uses bracket access**: `(props.atom as Record<string, unknown>).aiSourced` follows the SolidJS reactivity rule (use bracket access get trap, not `in` operator has trap) established in the existing AtomCard code.
- **source spread onto appendMutation result**: The inbox handler spreads `{ source: 'ai' | 'user' }` onto the `appendMutation()` return value rather than modifying the `appendMutation` function signature — this preserves the existing changelog abstraction and avoids touching the CRDT layer.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing build failure (workbox PWA plugin complaining about 21.6MB ONNX WASM file exceeding precache limit) — confirmed pre-existing by testing with stash; not introduced by this plan.
- Pre-existing TypeScript errors in VoiceCapture.tsx (SpeechRecognition API types) and AIOrb.tsx (missing module) — out of scope, not introduced by this plan.

## User Setup Required

None - no external service configuration required. The Dexie v3 migration runs automatically on next app load.

## Next Phase Readiness
- Schema extensions are complete: Plan 03 (triage pipeline) can use `aiSourced` on CLASSIFY_INBOX_ITEM payload and expect the atom to be tagged
- AI settings persistence is working: the aiFirstRunComplete guided setup flow will now correctly persist across reloads
- AI badge CSS and component are in place: any atom with `aiSourced: true` will automatically display the badge

---
*Phase: 05-triage-ai*
*Completed: 2026-02-24*
