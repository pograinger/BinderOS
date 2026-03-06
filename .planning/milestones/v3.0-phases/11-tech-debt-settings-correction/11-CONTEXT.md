# Phase 11: Tech Debt, Settings + Correction Utility - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Resolve v2.0 tech debt, make the settings panel clean and informative with ONNX model status, and provide a correction export path for future retraining. Covers: settings panel cleanup (POLISH-01 through POLISH-03), dead code removal (POLISH-04), isReadOnly enforcement (POLISH-05), stale comment cleanup (POLISH-06), resume UX improvement (POLISH-07), and correction export utility (CORR-01, CORR-02).

</domain>

<decisions>
## Implementation Decisions

### Model info in settings (POLISH-01)
- Small info card inside the existing "Local AI" section — groups all local model info together
- Card shows: model name, version, download status, correction count, last-trained date
- Download status has three states: Downloading (with progress), Ready (cached), Failed (with reason)
- Correction count includes an **Export button** — clicking triggers JSONL download directly from the browser, no CLI needed
- Export contains all classification events where `chosenType !== suggestedType`

### Settings panel cleanup (POLISH-02)
- Communication Log stays in the settings panel — it's a privacy/audit feature
- Claude evaluates current panel and applies polish as needed to make it feel finished
- User couldn't identify specific rough spots without seeing it — Claude has discretion on spacing, typography, hierarchy, section order, and whether sections are collapsible

### Status bar AI indicator (POLISH-03)
- **Dot only, no text** — remove the "AI" text label
- Two states only: green dot when AI is enabled and ready, no dot when disabled
- No busy/processing state — just active or inactive
- Model download progress during first-time download: Claude's discretion on format

### Resume UX (POLISH-07)
- **Toast notification** on app load when a review session is pending
- Show **once per session** — after dismissal or timeout, fall back to badge dot on orb
- Toast includes: message text ("You have a review in progress") + **Resume** button + **Discard** button
- Discard clears the pending review without opening it
- Auto-dismiss behavior: Claude's discretion

### Dead code removal (POLISH-04)
- Scout found llm-worker.ts is actually clean — no dead code to remove
- The abort handler limitation (Transformers.js doesn't support native abort) is documented, not dead code
- Claude should verify this finding and remove anything genuinely unused

### isReadOnly enforcement (POLISH-05)
- Guard all edit handlers in AtomDetailView: startEditTitle, handleStatusChange, handleContentChange, date inputs
- Disable input fields visually when atom has `isReadOnly: true`
- Currently only analysis atoms have isReadOnly — enforcement must work for any atom with the flag

### Stale AIOrb comments (POLISH-06)
- Update references to "Phase 5 stubs" and "Phases 6-7" — these are now complete
- Remove debug console.log stubs that reference future phases
- Straightforward cleanup — no user decisions needed

### Correction export (CORR-01, CORR-02)
- Export triggered from the settings panel Export button (see POLISH-01)
- Format: JSONL with one JSON object per line
- Each record includes: content, suggestedType, chosenType, tier, confidence, timestamp
- Original synthetic training corpus preserved as floor — corrections augment, never replace
- Export downloads as a file from the browser — developer doesn't need a CLI script

### Claude's Discretion
- Settings panel visual polish: spacing, typography, alignment, section order, collapsible vs flat sections
- Status bar tooltip on hover (whether to include adapter type, model status detail)
- Model download progress format in status bar (text, bar, or spinner)
- Toast auto-dismiss timeout vs persistent until acted on
- Exact info card layout within Local AI section

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AISettingsPanel.tsx` (637 lines): Well-structured with 6 sections — Master Toggle, Local AI, Cloud AI, Feature Toggles, Privacy, Communication Log. Model info card goes inside Local AI section.
- `StatusBar.tsx` (176 lines): Already has `classifierLoadProgress` signal wired (lines 105-114) for download progress. AI indicator at lines 116-134 with dot + "AI" label.
- `classification-log.ts` (149 lines): `getClassificationHistory()` reads all events from Dexie config table. `ClassificationEvent` has `suggestedType`, `chosenType`, `modelSuggestion`, `tier`, `confidence` fields. No export function exists yet.
- `store.ts`: `classifierReady` and `classifierLoadProgress` signals exist (lines 936-943). Missing: model version signal, correction count signal.

### Established Patterns
- Worker bridge: Singleton workers with `postMessage()` / `addEventListener('message')`, UUID-based correlation
- Store signals pattern: `createSignal` with export for reactive UI consumption
- Settings panel sections: Each section is a `<div>` with heading and form controls, consistent CSS class pattern

### Integration Points
- `AtomDetailView.tsx`: All edit handlers (title, status, content, dates) need isReadOnly guards — lines 113, 145, 186, 284, 363, 373, 389, 429
- `AIOrb.tsx`: Badge dot at lines 251-254 (`ai-orb-review-badge` class), `hasPendingReview()` at line 82. Toast replaces silent dot.
- `AIOrb.tsx`: Stale comments at lines 20, 147-149, 182, 185-186 referencing completed phases
- `llm-worker.ts`: Scout found no dead code — abort handler limitation is documented

</code_context>

<specifics>
## Specific Ideas

- Correction export should be a browser download (JSONL file), not a CLI script — developer clicks Export in settings, gets a file
- Toast for pending review should have both Resume and Discard — user shouldn't have to open the review just to clear it
- Status bar should be minimal — just a dot, no text, no busy state

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 11-tech-debt-settings-correction*
*Context gathered: 2026-03-04*
