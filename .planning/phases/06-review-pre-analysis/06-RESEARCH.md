# Phase 6: Review Pre-Analysis - Research

**Researched:** 2026-02-24
**Domain:** Background AI analysis pipeline, session persistence, new atom type, SolidJS state extension
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Review entry & briefing flow**
- Entry point is the orb's existing "Review" radial menu button — no new UI surface needed
- Tapping Review navigates to a full-screen review view (like Today or Inbox) — not a modal or panel
- While the AI generates the briefing, show a progress indicator with summary stats appearing incrementally (e.g. "14 stale items found..." "3 projects missing next actions...")
- After the briefing is displayed, sections are tappable — items link to inline expanded views with quick actions. No guided flow yet (Phase 7), but the briefing is actionable
- A "Start Review" button is NOT needed in Phase 6; the briefing itself is the experience

**Briefing content & presentation**
- AI-written summary sentence at the top — one natural language sentence describing overall system health based on analysis
- Below the summary: sectioned cards, one per category (stale tasks, projects without next actions, compression candidates)
- Each card has a header with count badge
- Items within cards show: atom title + metadata chips (staleness days, link count, entropy score, etc.) — no AI prose per item, just data
- Items are tappable — inline expand with quick action buttons (defer, archive, add next action) without leaving the briefing view

**Session resume experience**
- Orb changes state (pulsing differently or badge dot) when an incomplete review session exists — tapping offers "Resume review" as the primary radial action
- Full restore on resume: exact briefing content, which items were expanded, scroll position, and which items were acted on
- Items the user acted on during the briefing are marked as "addressed" in the session — on resume they show a checkmark or muted style
- When session is older than 24 hours: still offer resume with a warning ("data may be outdated") plus option to start fresh — no silent discard, no hard cutoff

**Analysis artifact design**
- New atom type: `analysis` — alongside task/note/resource/etc.
- Analysis atoms are read-only, AI-generated badge, non-editable (no edit button, no swipe actions on them)
- Visual treatment: frosted/glass card appearance — semi-transparent, distinct from solid user-authored cards. AI badge in corner
- Analysis atoms only appear within the review flow view — not shown in Inbox, Today, This Week, or other standard views. They exist as atoms (searchable, linkable) but are filtered out of page queries
- Retention: keep the 4 most recent review briefings. Older ones auto-delete when a 5th is created

### Claude's Discretion
- Exact frosted glass CSS treatment and opacity values
- Progress indicator animation design
- How metadata chips are styled within briefing cards
- Orb badge dot design for incomplete review indicator
- Briefing card sort order within categories
- Inline expand animation and quick action button set

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AIRV-01 | Background pre-analysis workers that read-only analyze entropy state and prepare briefings | Analysis pipeline runs on main thread (not BinderCore worker) — same pattern as triage.ts; reads state.atoms, state.scores, state.entropyScore directly; no mutations |
| AIRV-02 | Review pre-analysis briefing — AI summary of stale tasks, projects without next actions, compression candidates | AI analysis module (`src/ai/analysis.ts`) builds prompt from entropy data, dispatches to cloud adapter, parses structured JSON response into BriefingResult; ReviewBriefingView renders it |
| AIRV-05 | Review session persistence — resume incomplete reviews within 24 hours | ReviewSession type stored in Dexie config table (key: `review-session`); session includes briefing content, expanded items, scroll position, addressed item IDs, and `startedAt` timestamp |
| AIGN-01 | AI generates analysis artifacts (briefings, trend insights, relationship maps) as distinct artifact type | New `analysis` member added to AtomType discriminated union; AnalysisAtomSchema extends BaseAtomFields with `analysisKind`, `isReadOnly: true`, `briefingData` field; v4 Dexie migration |
</phase_requirements>

## Summary

Phase 6 introduces a read-only AI analysis pipeline that produces a "weekly review briefing" — a structured dashboard-style view summarizing the user's entropy state, stale tasks, projects without next actions, and compression candidates. The architecture follows the established Phase 5 triage pattern closely: a pure analysis module on the main thread that reads store state, builds a prompt, dispatches to the cloud adapter, and pushes results reactively into signals.

The two novel technical challenges are (1) the new `analysis` atom type, which requires a Dexie schema migration (v4) and extensions to the TypeScript discriminated union, and (2) review session persistence, which stores session state in the existing Dexie `config` table under a well-known key rather than requiring a new table. The orb's review indicator state must be wired through a module-level signal (same pattern as `setOrbState` in Phase 5) so the orb can show a pending-review badge dot.

**Primary recommendation:** Model this phase on the Phase 5 triage pipeline (triage.ts + store.ts startTriageInbox). Create `src/ai/analysis.ts` for the briefing pipeline, `src/ui/views/ReviewBriefingView.tsx` for the new full-screen view (replacing or sitting above the existing `ReviewView.tsx`), and a `src/storage/migrations/v4.ts` for the `analysis` atom type index and `reviewSessions` config key.

---

## Standard Stack

### Core (all already installed — no new packages needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| solid-js | ^1.9.11 | Reactive UI — createSignal, createStore, Show, For | Established project framework |
| dexie | ^4.3.0 | IndexedDB persistence — session storage, analysis atoms | Project's only persistence layer |
| @anthropic-ai/sdk | ^0.78.0 | Cloud AI briefing generation | Established cloud adapter |
| zod/v4 | (bundled with zod ^4.3.6) | Schema validation for new AnalysisAtom type | Project schema pattern |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod/v4 discriminatedUnion | already used | Extend AtomSchema to include 'analysis' type | When adding AnalysisAtomSchema to atoms.ts |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Dexie config table for session | New `reviewSessions` Dexie table | Config table is simpler (one key, JSON blob); only one session active at a time; new table only justified if multiple sessions needed (Phase 7+) |
| Main-thread analysis pipeline | BinderCore worker message | Worker is WASM-only for mutations/scoring; AI analysis is main-thread per established architecture; no new worker needed |
| Frosted glass via backdrop-filter | Solid background with border | backdrop-filter is supported in all modern browsers; gives the intended visual distinction without hardcoded color values |

**Installation:** No new packages required.

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── ai/
│   ├── analysis.ts          # NEW: briefing analysis pipeline (mirrors triage.ts)
│   ├── triage.ts            # EXISTING: keep untouched
│   └── ...
├── types/
│   └── atoms.ts             # MODIFY: add 'analysis' to AtomType enum + AnalysisAtomSchema
├── storage/
│   ├── db.ts                # MODIFY: add reviewSessions concept (config table key)
│   └── migrations/
│       └── v4.ts            # NEW: analysis atom index + reviewSessions schema
├── ui/
│   ├── views/
│   │   ├── ReviewBriefingView.tsx   # NEW: full-screen briefing view
│   │   └── ReviewView.tsx           # EXISTING: will be replaced as the 'review' page route
│   └── components/
│       └── AIOrb.tsx         # MODIFY: wire review action, add review-pending indicator
├── signals/
│   └── store.ts              # MODIFY: add reviewSession state + startReviewBriefing()
└── types/
    └── messages.ts           # MODIFY: add SAVE_REVIEW_SESSION command if persisting via worker (or persist directly from main thread)
```

### Pattern 1: Analysis Pipeline (mirrors triage.ts)
**What:** Pure module, no imports from store.ts. All state passed in by caller. AbortController for cancellation. Emits incremental progress via callback before final result.
**When to use:** For all AI analysis that reads atom state and produces structured output.

```typescript
// src/ai/analysis.ts — mirrors triage.ts pattern exactly
export interface BriefingResult {
  summaryText: string;       // AI-written 1-sentence system health summary
  staleItems: BriefingItem[];
  projectsMissingNextAction: BriefingItem[];
  compressionCandidates: BriefingItem[];
  generatedAt: number;       // Unix ms timestamp
}

export interface BriefingItem {
  atomId: string;
  title: string;
  staleDays?: number;
  linkCount?: number;
  entropyScore?: number;
}

// onProgress: called incrementally — e.g. "14 stale items found...", "3 projects missing next actions..."
// Returns fully structured BriefingResult after AI call completes
export async function generateBriefing(
  atoms: Atom[],
  scores: Record<string, AtomScore>,
  entropyScore: EntropyScore | null,
  sectionItems: SectionItem[],
  sections: Section[],
  onProgress: (message: string) => void,
  signal?: AbortSignal,
): Promise<BriefingResult>
```

**Key design:** The briefing generation has two phases:
1. **Pre-analysis (synchronous, no AI):** Compute the three category lists (stale items, projects without next actions, compression candidates) from store data. Emit progress messages as each is computed.
2. **AI summary call:** Pass the pre-computed statistics to the cloud adapter to generate only the top-level summary sentence. This keeps the AI call small (token-efficient) and means the sections appear immediately with real data while the summary streams in.

### Pattern 2: Analysis Atom Type
**What:** New `analysis` member of the AtomType discriminated union. Stored in the atoms table. Read-only in all UI; filtered from standard page queries.
**When to use:** When persisting AI-generated briefing artifacts.

```typescript
// types/atoms.ts additions

export const AtomType = z.enum([
  'task',
  'fact',
  'event',
  'decision',
  'insight',
  'analysis',   // NEW Phase 6
]);

export const AnalysisAtomSchema = z.object({
  ...BaseAtomFields,
  type: z.literal('analysis'),
  analysisKind: z.enum(['review-briefing', 'trend-insight', 'relationship-map']),
  isReadOnly: z.literal(true),
  briefingData: z.object({
    summaryText: z.string(),
    staleItems: z.array(z.object({ atomId: z.string(), title: z.string(), staleDays: z.number().optional() })),
    projectsMissingNextAction: z.array(z.object({ atomId: z.string(), title: z.string() })),
    compressionCandidates: z.array(z.object({ atomId: z.string(), title: z.string(), staleDays: z.number().optional() })),
    generatedAt: z.number(),
  }).optional(),
});
export type AnalysisAtom = z.infer<typeof AnalysisAtomSchema>;

// AtomSchema discriminated union: add AnalysisAtomSchema
export const AtomSchema = z.discriminatedUnion('type', [
  TaskAtomSchema,
  FactAtomSchema,
  EventAtomSchema,
  DecisionAtomSchema,
  InsightAtomSchema,
  AnalysisAtomSchema,   // NEW
]);
```

### Pattern 3: Review Session Persistence (Dexie config table)
**What:** Session state stored as a JSON blob in the existing `config` table under a stable key (`review-session`). No new Dexie table needed.
**When to use:** When there is only one active session at a time and the data is a single serializable blob.

```typescript
// Stored under config key: 'review-session'
export interface ReviewSession {
  briefingAtomId: string;       // ID of the persisted analysis atom
  briefingResult: BriefingResult;
  expandedItemIds: string[];    // which items are currently expanded
  addressedItemIds: string[];   // items the user acted on (show checkmark)
  scrollPosition: number;       // px offset for scroll restoration
  startedAt: number;            // Unix ms — used for 24h expiry warning
  lastActiveAt: number;         // Unix ms — updated on each interaction
}

export const REVIEW_SESSION_KEY = 'review-session';
```

Session is loaded on app startup (during INIT/READY response) and hydrated into store state. Session write happens directly from main thread to Dexie (same pattern as AI settings persistence) — no worker message needed since review session is UI state, not a mutation of atom data.

### Pattern 4: Store Extension (mirrors Phase 5 triage signals)
**What:** Add review session state and the `startReviewBriefing()` orchestrator function to `store.ts`, following the exact same pattern as `startTriageInbox()`.
**When to use:** For all AI feature orchestration that needs to bridge pure analysis modules to reactive UI.

```typescript
// store.ts additions — BinderState extension
export interface BinderState {
  // ... existing fields ...
  // Phase 6: Review state
  reviewSession: ReviewSession | null;      // persisted session (null if none)
  reviewBriefing: BriefingResult | null;    // in-memory briefing (may be fresher than session)
  reviewStatus: 'idle' | 'analyzing' | 'ready' | 'error';
  reviewProgress: string | null;            // e.g. "14 stale items found..."
  reviewError: string | null;
}

// Module-level signals (ephemeral, not in BinderState)
const [reviewAnalysisAbort, setReviewAnalysisAbort] = createSignal<AbortController | null>(null);

export async function startReviewBriefing(): Promise<void> {
  // Pattern: mirrors startTriageInbox() exactly
  // 1. Guard: AI must be available
  // 2. setOrbState('thinking')
  // 3. Run pre-analysis (synchronous stats computation)
  // 4. Emit progress messages via setState('reviewProgress', ...)
  // 5. Dispatch cloud AI for summary sentence
  // 6. Parse response, build BriefingResult
  // 7. Create analysis atom in Dexie via CREATE_ATOM command (aiSourced: true)
  // 8. Persist ReviewSession to config table
  // 9. setState reviewBriefing, reviewStatus: 'ready'
  // 10. Navigate to 'review' page
}
```

### Pattern 5: Orb Review-Pending Indicator
**What:** The orb needs to show a subtle badge dot when a review session is pending (incomplete, <24h). This is driven from store state and read in AIOrb.tsx.
**When to use:** When orb state needs to reflect background conditions outside of the active AI operation.

```typescript
// AIOrb.tsx modification
// Read: state.reviewSession !== null && reviewSessionIsRecent(state.reviewSession)
// Render: small badge dot in orb's top-right corner (CSS, not a second icon)
// Radial menu: when reviewSession exists, 'review' action label becomes 'Resume review'
// Primary action priority: if reviewSession exists and page is not inbox, primary = 'review'
```

### Pattern 6: View Routing — ReviewBriefingView replaces ReviewView for 'review' page
The existing `ReviewView.tsx` (card-by-card compression triage) currently occupies the `activePage === 'review'` route in `MainPane.tsx`. Phase 6 introduces a new full-screen briefing experience that also uses this route.

**Resolution:** Create `ReviewBriefingView.tsx` as the new entry point for `activePage === 'review'`. `ReviewView.tsx` (compression triage) becomes accessible via a separate route or is embedded within the briefing flow. The context decision says "no guided flow yet (Phase 7)" — in Phase 6 the briefing IS the review, so `ReviewBriefingView.tsx` takes over the `review` route entirely. The old `ReviewView.tsx` compression triage still exists for Phase 7 integration.

### Anti-Patterns to Avoid
- **Storing briefing data in worker state / STATE_UPDATE:** Analysis atoms are regular Dexie atoms (CREATE_ATOM via worker command). Briefing result state is ephemeral main-thread signal state. Worker STATE_UPDATE does not need new fields.
- **Running analysis in the BinderCore worker:** BinderCore worker handles WASM + Dexie mutations only. AI analysis is always main-thread (same as triage). No new worker messages for analysis dispatch.
- **Blocking UI during analysis:** Analysis module must use `onProgress` callbacks so the briefing view can show incremental stats immediately (stale count first, then projects count, then AI summary). Never await the entire analysis before showing anything.
- **Hardcoding 24-hour cutoff with silent discard:** Per context decision, sessions older than 24h still offer resume with a warning. The 24h value should be a constant, not inline magic number: `const REVIEW_SESSION_STALE_MS = 24 * 60 * 60 * 1000`.
- **Showing analysis atoms in standard page queries:** Queries in `SectionView`, `TodayPage`, `ThisWeekPage`, etc. must filter `a.type !== 'analysis'`. This is a defensive filter — the project already filters by type in some contexts. The v4 Dexie migration adds an `analysisKind` index so queries can efficiently target or exclude analysis atoms.
- **Re-using the existing AtomSchema without extending discriminated union:** Adding `analysis` to `AtomType` enum alone is insufficient. The discriminated union must include `AnalysisAtomSchema` or TypeScript will error on type narrowing. Update both `AtomType` enum, `AtomSchema` union, and the WASM scoring preparation (`flattenAtomLinksForWasm` in worker.ts passes atom.type — ensure 'analysis' atoms are excluded or handled there).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Incremental analysis progress UI | Custom streaming parser | Synchronous pre-analysis + onProgress callbacks | Stats (stale count, projects count) come from local data synchronously — only the AI summary sentence requires the adapter call; emit progress before the async call |
| Session expiry/restore logic | Custom timer/cron | Timestamp comparison on READY hydration | On app launch, read session from config table, check `startedAt`, set `reviewSession` in store; no background timer needed |
| Frosted glass effect | Custom CSS gradient trick | `backdrop-filter: blur(12px)` + `background: rgba(var, 0.15)` | Native CSS, supported in all target browsers, gives real glass look |
| Analysis atom retention (keep 4 most recent) | Background cleanup job | Cleanup on CREATE_ATOM for analysis type | In the briefing pipeline, before creating the new analysis atom, query `db.atoms.where('type').equals('analysis').reverse().offset(3).toArray()` and delete the overflow; synchronous, no background worker needed |

**Key insight:** Most of the "hard" problems in this phase (incremental progress, session restore, retention cleanup) are solvable with synchronous data operations + simple timestamp math. Only the top-level AI summary sentence requires an async AI call. This means the briefing view can be highly responsive even on slow connections.

---

## Common Pitfalls

### Pitfall 1: Worker type narrowing breaks on 'analysis' atom type
**What goes wrong:** `flattenAtomLinksForWasm()` in `worker.ts` maps all atoms for WASM scoring. WASM scoring functions expect task/fact/event/decision/insight types. Passing an `analysis` atom to WASM scoring will either error or produce garbage scores.
**Why it happens:** The existing code does `db.atoms.toArray()` and passes all atoms to `core.compute_scores()`. Adding 'analysis' to the union doesn't automatically exclude them.
**How to avoid:** In `flattenAtomLinksForWasm()` and anywhere atoms are passed to WASM, filter out `type === 'analysis'` before scoring. Analysis atoms should never be scored by the compute engine.
**Warning signs:** TypeScript type errors in worker.ts; WASM returning NaN scores; analysis atoms appearing in `compressionCandidates`.

### Pitfall 2: Analysis atoms leaking into Inbox, Today, This Week views
**What goes wrong:** Standard page views show analysis atoms mixed with user content, breaking the "analysis atoms only appear in review flow" contract.
**Why it happens:** Page query functions in `src/ui/signals/queries.ts` (if it exists) or inline `state.atoms.filter()` calls don't exclude `type === 'analysis'`.
**How to avoid:** Add `a.type !== 'analysis'` to ALL atom list queries outside of ReviewBriefingView. Best done in the central query utility if one exists; otherwise systematically add to each page view.
**Warning signs:** Analysis cards appearing in inbox or all-atoms list.

### Pitfall 3: ReviewSession state not hydrating on app restart
**What goes wrong:** User closes app mid-review, reopens, expects "Resume review?" but the prompt doesn't appear.
**Why it happens:** Session was persisted to Dexie config table but the READY handler in store.ts doesn't hydrate `reviewSession` from the config payload.
**How to avoid:** In the BinderCore worker's INIT handler, load `config` entry for key `review-session` alongside AI settings. Include it in the READY payload. Wire the READY case in `store.ts` to hydrate `reviewSession`.
**Warning signs:** Resume prompt never appears on first page load after mid-review close.

### Pitfall 4: Pre-send approval modal fires for every analysis category
**What goes wrong:** The CloudAdapter triggers `onPreSendApproval` for each AI dispatch. If analysis dispatches multiple cloud calls (one per category), user sees 3 approval modals per review.
**Why it happens:** The current CloudAdapter fires the pre-send approval handler on every `execute()` call.
**How to avoid:** Design the analysis.ts prompt to send a SINGLE cloud call with all pre-computed statistics. One prompt → one approval → one summary sentence. Never loop cloud calls inside the analysis pipeline.
**Warning signs:** Multiple CloudRequestPreview modals appearing during a single review start.

### Pitfall 5: Zod discriminated union not updated when 'analysis' added
**What goes wrong:** `AtomSchema.parse()` throws on analysis atoms read from Dexie because the discriminated union doesn't include `AnalysisAtomSchema`.
**Why it happens:** `AtomType` enum updated but `AtomSchema = z.discriminatedUnion(...)` not updated.
**How to avoid:** Update both in the same commit. TypeScript will catch this if `CreateAtomInput` is derived from the union — attempting to create an analysis atom will type-error until the union is updated.
**Warning signs:** Runtime Zod parse errors when loading the briefing view; TypeScript errors on `Atom` type narrowing.

### Pitfall 6: Dexie v4 migration skips version numbers
**What goes wrong:** Current DB is at version 3. If a v4 migration is added but incorrectly chains (e.g., re-declares v3 schemas), Dexie throws an upgrade error.
**Why it happens:** Dexie requires every version to be declared sequentially and each new `.version()` block must include ALL tables (not just changed ones).
**How to avoid:** Follow the exact pattern of v3.ts: `db.version(4).stores({ ...full schema with all tables including analysis atom index... }).upgrade(...)`. Never skip version numbers; never omit unchanged tables in the same version call.
**Warning signs:** Console error "Database version change not allowed" or "IDBDatabase: upgrade aborted".

---

## Code Examples

Verified patterns from the existing codebase:

### Analysis atom creation (CREATE_ATOM command with 'analysis' type)
```typescript
// In startReviewBriefing() after analysis completes:
sendCommand({
  type: 'CREATE_ATOM',
  payload: {
    type: 'analysis',
    analysisKind: 'review-briefing',
    isReadOnly: true,
    title: `Review Briefing — ${new Date().toLocaleDateString()}`,
    content: briefingResult.summaryText,
    status: 'open',
    links: [],
    tags: [],
    aiSourced: true,
    briefingData: briefingResult,
  },
});
```

### Session persistence pattern (mirrors AI settings)
```typescript
// Store session directly to Dexie from main thread (same as ai-settings.ts pattern)
import { db } from '../storage/db';
export const REVIEW_SESSION_KEY = 'review-session';

export async function saveReviewSession(session: ReviewSession): Promise<void> {
  await db.config.put({ key: REVIEW_SESSION_KEY, value: session });
}

export async function loadReviewSession(): Promise<ReviewSession | null> {
  const entry = await db.config.get(REVIEW_SESSION_KEY);
  return (entry?.value as ReviewSession) ?? null;
}

export async function clearReviewSession(): Promise<void> {
  await db.config.delete(REVIEW_SESSION_KEY);
}
```

### Analysis atom retention cleanup (keep 4 most recent)
```typescript
// Before creating new analysis atom in briefing pipeline:
async function pruneOldBriefings(): Promise<void> {
  const allAnalysis = await db.atoms
    .where('type').equals('analysis')
    .sortBy('created_at');
  // Keep only the 4 most recent (sortBy returns ascending, so slice from end minus 4)
  const toDelete = allAnalysis.slice(0, Math.max(0, allAnalysis.length - 4));
  await Promise.all(toDelete.map((a) => db.atoms.delete(a.id)));
}
```

### Frosted glass CSS for analysis atom cards
```css
/* layout.css additions — Phase 6: Analysis artifact card */
.analysis-card {
  background: rgba(22, 27, 34, 0.65);        /* --bg-secondary at 65% opacity */
  border: 1px solid rgba(88, 166, 255, 0.2); /* --accent at 20% opacity */
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);        /* Safari compat */
  border-radius: 12px;
  position: relative;
}

.analysis-ai-badge {
  position: absolute;
  top: 8px;
  right: 10px;
  font-size: 10px;
  color: var(--accent);
  opacity: 0.7;
  letter-spacing: 0.05em;
}
```

### Progress indicator callback pattern (mirrors triage pending placeholder)
```typescript
// In generateBriefing() — emit progress before each phase, results arrive incrementally
onProgress('Analyzing system entropy...');
const staleItems = computeStaleItems(atoms, scores);
onProgress(`${staleItems.length} stale item${staleItems.length === 1 ? '' : 's'} found`);

const projectsMissing = computeProjectsMissingNextAction(atoms, sectionItems, sections);
onProgress(`${projectsMissing.length} project${projectsMissing.length === 1 ? '' : 's'} missing next actions`);

const candidates = compressionCandidates; // already in store state
onProgress(`${candidates.length} compression candidate${candidates.length === 1 ? '' : 's'} identified`);

onProgress('Generating AI summary...');
const response = await dispatchAI({ requestId: crypto.randomUUID(), prompt, maxTokens: 150, signal });
```

### Orb review-pending detection (AIOrb.tsx)
```typescript
// In AIOrb.tsx — new derived signal
const hasPendingReview = () => {
  const session = state.reviewSession;
  if (!session) return false;
  // Show badge for both recent AND stale sessions (stale shows warning text in review view)
  return true;
};

// Render badge dot in orb JSX:
<Show when={hasPendingReview() && orbState() !== 'expanded'}>
  <span class="ai-orb-review-badge" />
</Show>
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ReviewView was card-by-card compression triage | Phase 6 replaces 'review' route with ReviewBriefingView; compression triage moves to Phase 7 | Phase 6 | ReviewView.tsx stays in codebase but is no longer the primary 'review' route handler |
| No analysis atom type | `analysis` added to discriminated union | Phase 6 | Requires Dexie v4 migration, WASM scoring exclusion, page query filtering |
| Orb only reflects active AI operations | Orb can show persistent badge dot for pending review session | Phase 6 | Requires orb to read `state.reviewSession` independently of `orbState` machine |

**Deprecated/outdated:**
- `ReviewView.tsx` as the `activePage === 'review'` entry point: Phase 6 supersedes this with `ReviewBriefingView.tsx`. The old file stays for Phase 7 integration but is not the primary view.

---

## Open Questions

1. **WASM scoring and 'analysis' atoms — exclusion in worker**
   - What we know: `flattenAtomLinksForWasm()` currently maps all `db.atoms.toArray()` output. Analysis atoms must be excluded from WASM scoring.
   - What's unclear: Does the Rust WASM binding validate atom type? Or will it silently compute garbage scores for unknown types?
   - Recommendation: Add `atoms.filter(a => a.type !== 'analysis')` in `getFullState()` or in the scoring call path before passing to WASM. Defensive filter is safer than relying on WASM validation.

2. **Session hydration via worker READY vs. direct Dexie read**
   - What we know: AI settings are loaded via `loadAISettings()` in the INIT handler and sent in the READY payload. Session could follow the same pattern.
   - What's unclear: Whether adding `reviewSession` to the READY payload is worth the coordination cost vs. having the main thread call `loadReviewSession()` directly on app mount.
   - Recommendation: Follow the AI settings pattern — load in worker INIT, send in READY, hydrate in store.ts READY case. This keeps all initial data loading consistent and avoids a second async read on the main thread.

3. **Projects-without-next-action computation**
   - What we know: `sectionItems` represents projects. A project "missing a next action" means it has no associated open `task` atom with `status === 'open' | 'in-progress'`.
   - What's unclear: The exact join logic — sectionItems ↔ atoms via `sectionItemId`. Is the link atom.sectionItemId = sectionItem.id?
   - Recommendation: Query `atoms.where('sectionItemId').equals(si.id)` for each project item, filter for tasks with open status. This is a Dexie indexed query (sectionItemId is already indexed in v1 schema), so it's efficient. Run this synchronously for all sectionItems before the AI call.

---

## Sources

### Primary (HIGH confidence)
- Codebase direct inspection: `src/ai/triage.ts` — established pipeline pattern for analysis modules
- Codebase direct inspection: `src/types/atoms.ts` — current discriminated union, base fields, extension pattern
- Codebase direct inspection: `src/storage/db.ts` + `migrations/v2.ts`, `v3.ts` — Dexie migration pattern
- Codebase direct inspection: `src/ui/signals/store.ts` — BinderState interface, Phase 5 triage orchestration pattern
- Codebase direct inspection: `src/ui/components/AIOrb.tsx` + `AIRadialMenu.tsx` — orb state machine, 'review' action stub
- Codebase direct inspection: `src/ai/adapters/cloud.ts` — pre-send approval, single-call architecture
- Codebase direct inspection: `src/ui/layout/Shell.tsx` + `MainPane.tsx` — view routing, 'review' route, overlay patterns
- Codebase direct inspection: `src/ui/layout/layout.css` — existing CSS variables (--bg-secondary, --accent, --border-primary), review-view CSS patterns

### Secondary (MEDIUM confidence)
- `backdrop-filter: blur()` CSS — supported in all modern browsers (Chrome 76+, Firefox 103+, Safari 9+); verified via MDN-consistent knowledge
- Dexie `where().equals()` index queries for type filtering — consistent with v2/v3 migration patterns already in codebase

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all patterns directly observed in codebase
- Architecture: HIGH — analysis pipeline, session persistence, and atom type extension all follow established project patterns
- Pitfalls: HIGH — derived directly from reading the code paths that will be affected (worker.ts WASM scoring, page query filters, Dexie migration chain)

**Research date:** 2026-02-24
**Valid until:** 2026-03-26 (stable — no fast-moving dependencies)
