# Phase 11: Tech Debt, Settings + Correction Utility - Research

**Researched:** 2026-03-04
**Domain:** SolidJS component polish, browser-download APIs, Dexie read, signal extensions
**Confidence:** HIGH — all findings verified directly from existing project source code

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Model info in settings (POLISH-01)**
- Small info card inside the existing "Local AI" section — groups all local model info together
- Card shows: model name, version, download status, correction count, last-trained date
- Download status has three states: Downloading (with progress), Ready (cached), Failed (with reason)
- Correction count includes an **Export button** — clicking triggers JSONL download directly from the browser, no CLI needed
- Export contains all classification events where `chosenType !== suggestedType`

**Settings panel cleanup (POLISH-02)**
- Communication Log stays in the settings panel — it's a privacy/audit feature
- Claude evaluates current panel and applies polish as needed to make it feel finished
- User couldn't identify specific rough spots without seeing it — Claude has discretion on spacing, typography, hierarchy, section order, and whether sections are collapsible

**Status bar AI indicator (POLISH-03)**
- **Dot only, no text** — remove the "AI" text label
- Two states only: green dot when AI is enabled and ready, no dot when disabled
- No busy/processing state — just active or inactive
- Model download progress during first-time download: Claude's discretion on format

**Resume UX (POLISH-07)**
- **Toast notification** on app load when a review session is pending
- Show **once per session** — after dismissal or timeout, fall back to badge dot on orb
- Toast includes: message text ("You have a review in progress") + **Resume** button + **Discard** button
- Discard clears the pending review without opening it
- Auto-dismiss behavior: Claude's discretion

**Dead code removal (POLISH-04)**
- Scout found llm-worker.ts is actually clean — no dead code to remove
- The abort handler limitation (Transformers.js doesn't support native abort) is documented, not dead code
- Claude should verify this finding and remove anything genuinely unused

**isReadOnly enforcement (POLISH-05)**
- Guard all edit handlers in AtomDetailView: startEditTitle, handleStatusChange, handleContentChange, date inputs
- Disable input fields visually when atom has `isReadOnly: true`
- Currently only analysis atoms have isReadOnly — enforcement must work for any atom with the flag

**Stale AIOrb comments (POLISH-06)**
- Update references to "Phase 5 stubs" and "Phases 6-7" — these are now complete
- Remove debug console.log stubs that reference future phases
- Straightforward cleanup — no user decisions needed

**Correction export (CORR-01, CORR-02)**
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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CORR-01 | Developer can export classification corrections (chosenType != suggestedType) from Dexie as JSONL for retraining | `getClassificationHistory()` already reads all events; `triggerDownload()` pattern exists in `export.ts`; filter + JSON.stringify per line is all that's needed |
| CORR-02 | Correction export preserves the original synthetic training corpus as a floor — corrections augment, never replace | Export is a separate file that supplements `scripts/training-data/type-classification.jsonl` — no replacement occurs; JSONL append semantics clarified in findings |
| POLISH-01 | User can see model version, download status, and correction count in the settings panel | `classifierReady` and `classifierLoadProgress` signals already exported from store.ts; new signals needed: `classifierVersion` (string), `correctionCount` (number); `getClassificationHistory()` is async — count must be loaded on panel open |
| POLISH-02 | Settings panel UX is cleaned up (v2.0 tech debt) | AISettingsPanel.tsx is 637 lines with 7 sections; specific rough spots: Provider Status table duplicates Local AI status info; Features section desc says "Phases 5-7" (stale); no visual hierarchy between major and minor sections |
| POLISH-03 | Status bar AI indicator is less verbose (v2.0 tech debt) | StatusBar.tsx lines 116-134 show the `<Show when={state.aiEnabled}>` block — remove the "AI" text string, keep the dot; the classifier-loading segment at lines 104-114 is separate and stays |
| POLISH-04 | Dead code in `src/worker/llm-worker.ts` is removed | Verified: llm-worker.ts is clean. `abortControllers` map and `LLM_ABORT` handler are real functionality (not dead code). Abort limitation is documented in comment. No removal needed — verify and close. |
| POLISH-05 | `isReadOnly` is enforced at UI level — read-only atoms cannot be edited | `isReadOnly: z.literal(true)` exists only on `AnalysisAtomSchema`. AtomDetailView has no guard at any handler. Need guard in: `startEditTitle`, `handleStatusChange`, `handleDateField`, `handleContentChange`, and project `<select onChange>`. Also disable the input elements visually. |
| POLISH-06 | Stale comments in AIOrb component are cleaned up | AIOrb.tsx line 147-149 comment "Phase 5 stubs — actual AI conversation wired in Phases 6-7" and console.log stubs at lines 181, 185 reference completed phases. Lines 196-197 "Phase 6/7" comment also stale. |
| POLISH-07 | Resume UX uses explicit prompt instead of badge dot | `state.reviewSession` is populated in store.ts at app load from Dexie (line 202-209). Toast component must be new, placed in Shell.tsx or app.tsx, triggered once per session via a `sessionStorage` flag. Needs Resume (setActivePage) and Discard (finishReviewSession) actions. |
</phase_requirements>

---

## Summary

Phase 11 is entirely within the existing codebase — no new libraries, no new architectural patterns. Every sub-task is a targeted modification to one or two existing files. The work splits into four categories: (1) signal additions + settings card (POLISH-01, CORR-01, CORR-02), (2) UI cleanup and comment removal (POLISH-02, POLISH-03, POLISH-04, POLISH-06), (3) a new toast component wired at app load (POLISH-07), and (4) isReadOnly enforcement in AtomDetailView (POLISH-05).

The correction export is simpler than it might sound: `getClassificationHistory()` already reads all events from Dexie, the `triggerDownload()` helper already exists in `src/storage/export.ts`, and JSONL is just `events.map(JSON.stringify).join('\n')`. The "floor" requirement (CORR-02) is satisfied by exporting corrections into a _separate_ file that a developer manually merges with the committed `scripts/training-data/type-classification.jsonl` corpus — no tooling needed.

The one new signal pair needed (`classifierVersion` / `correctionCount`) requires a store addition and an async load when the settings panel opens. The toast (POLISH-07) needs session-scoped "shown" tracking — `sessionStorage` is the correct primitive since it resets on every new tab/session.

**Primary recommendation:** Plan as 4 tasks in wave order — (1) signals + correction export + settings card, (2) status bar + settings polish + dead code + comment cleanup, (3) isReadOnly guards in AtomDetailView, (4) resume toast. Each task is self-contained and has no blocking dependency on the others.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SolidJS | existing | Reactive UI, `createSignal`, `createEffect`, `Show` | Project framework — no change |
| Dexie | existing | IndexedDB reads via `getClassificationHistory()` | Project DB layer — already wired |
| Browser APIs | N/A | `URL.createObjectURL`, `sessionStorage` | Native — no install needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `src/storage/export.ts` | — | `triggerDownload(blob, filename)` helper | Reuse directly for JSONL export |
| `src/storage/classification-log.ts` | — | `getClassificationHistory()` | Read all events for count + export |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `sessionStorage` for toast-shown flag | In-memory module variable | sessionStorage survives F5 reload within a session; module variable resets on reload — wrong behavior for POLISH-07 |
| Async count load in settings panel | Reactive Dexie LiveQuery | LiveQuery is overkill — count only needs to load once when panel opens; async `onMount` is simpler |

**Installation:** None — no new packages required.

---

## Architecture Patterns

### Recommended File Structure (changes only)

```
src/
├── ui/
│   ├── signals/store.ts          # Add classifierVersion + correctionCount signals
│   ├── layout/
│   │   ├── StatusBar.tsx         # Remove "AI" text (POLISH-03)
│   │   └── Shell.tsx             # Add <ReviewResumeToast /> (POLISH-07)
│   ├── components/
│   │   ├── AISettingsPanel.tsx   # Add model info card, export button (POLISH-01/02, CORR-01)
│   │   └── ReviewResumeToast.tsx # New component (POLISH-07)
│   └── views/
│       └── AtomDetailView.tsx    # Add isReadOnly guards (POLISH-05)
├── storage/
│   └── export.ts                 # Add exportCorrections() function (CORR-01/02)
├── ai/
│   └── llm-worker.ts             # Verify clean, no changes (POLISH-04)
│   └── components/
│       └── AIOrb.tsx             # Clean stale comments (POLISH-06)
```

### Pattern 1: Extending Store Signals

Existing signals in `store.ts` follow this pattern (lines 936-943):

```typescript
// Source: src/ui/signals/store.ts (verified)
const [classifierLoadProgress, setClassifierLoadProgress] = createSignal<number | null>(null);
const [classifierReady, setClassifierReady] = createSignal(false);
export { classifierLoadProgress, classifierReady };
```

Add new signals the same way, adjacent to the existing classifier signals:

```typescript
// New signals for POLISH-01
const [classifierVersion, setClassifierVersion] = createSignal<string | null>(null);
const [correctionCount, setCorrectionCount] = createSignal<number>(0);
export { classifierVersion, setCorrectionCount, setClassifierVersion };
```

`classifierVersion` would be set when the ONNX model is ready. The embedding-worker already sends `CLASSIFIER_READY` — the store's listener at line 977 is the right place to also extract a version. However, since the current placeholder ONNX has no version metadata, version can default to the `triage-type-classes.json` contents (e.g., "v1.0") or a hardcoded string until a versioned model is trained.

`correctionCount` is populated by reading Dexie when the settings panel opens (async, not reactive) — no need for a live signal.

### Pattern 2: Browser File Download (CORR-01/02)

`src/storage/export.ts` already contains the canonical pattern. Reuse `triggerDownload` by adding an exported function:

```typescript
// Source: src/storage/export.ts (verified)
export async function exportCorrectionLog(): Promise<void> {
  const { getClassificationHistory } = await import('./classification-log');
  const history = await getClassificationHistory();
  const corrections = history.filter(
    (e) => e.suggestedType !== e.chosenType,
  );

  const lines = corrections.map((e) =>
    JSON.stringify({
      content: e.content,
      suggestedType: e.suggestedType,
      chosenType: e.chosenType,
      tier: e.tier ?? null,
      confidence: e.confidence ?? null,
      timestamp: e.timestamp,
    })
  );

  const dateStr = new Date().toISOString().split('T')[0];
  const blob = new Blob([lines.join('\n')], { type: 'application/x-ndjson' });
  triggerDownload(blob, `binderos-corrections-${dateStr}.jsonl`);
}
```

CORR-02 is satisfied by design: the export file is separate from `scripts/training-data/type-classification.jsonl`. The developer merges them manually as training input — the export never overwrites the synthetic corpus.

### Pattern 3: Session-Once Toast (POLISH-07)

`sessionStorage` resets on new tab/session but survives page reload within a session. This is exactly the desired behavior ("once per session"):

```typescript
// Source: browser Web Storage API (HIGH confidence)
// ReviewResumeToast.tsx
const TOAST_SHOWN_KEY = 'binderos-review-toast-shown';

export function ReviewResumeToast() {
  const [visible, setVisible] = createSignal(false);

  onMount(() => {
    if (state.reviewSession && !sessionStorage.getItem(TOAST_SHOWN_KEY)) {
      setVisible(true);
      sessionStorage.setItem(TOAST_SHOWN_KEY, '1');
    }
  });

  function handleResume() {
    setVisible(false);
    setActivePage('review');
  }

  async function handleDiscard() {
    setVisible(false);
    await finishReviewSession(); // clears state.reviewSession + Dexie
  }

  return (
    <Show when={visible()}>
      <div class="review-resume-toast">
        <span class="review-resume-toast-msg">You have a review in progress</span>
        <button class="review-resume-toast-resume" onClick={handleResume}>Resume</button>
        <button class="review-resume-toast-discard" onClick={() => void handleDiscard()}>Discard</button>
      </div>
    </Show>
  );
}
```

Place in `Shell.tsx` alongside other overlays. The badge dot in AIOrb remains as fallback (it already exists at lines 251-254) — toast is additive, badge is the fallback after dismissal.

### Pattern 4: isReadOnly Guard (POLISH-05)

`isReadOnly` is typed as `z.literal(true)` on `AnalysisAtomSchema` only. On all other atom types, the field does not exist. Safe access pattern:

```typescript
// Source: src/types/atoms.ts (verified)
const isReadOnly = () => {
  const a = atom();
  return a != null && (a as Record<string, unknown>)['isReadOnly'] === true;
};
```

Then guard each handler:

```typescript
const startEditTitle = () => {
  if (isReadOnly()) return;  // Guard added
  const a = atom();
  if (!a) return;
  // ...existing logic
};
```

Visual disable: pass `disabled={isReadOnly()}` to all `<input>`, `<textarea>`, and `<select>` elements. Add a CSS class for the read-only state:

```tsx
<input
  type="text"
  class={`atom-detail-title-input${isReadOnly() ? ' atom-detail-readonly' : ''}`}
  disabled={isReadOnly()}
  ...
/>
```

### Pattern 5: Status Bar Simplification (POLISH-03)

Current code (lines 116-134 of `StatusBar.tsx`):
```tsx
<Show when={state.aiEnabled}>
  <div class="status-bar-item ai-status">
    <Show
      when={state.aiActivity}
      fallback={
        <span class="ai-status-idle">
          <span class={`status-bar-dot ${...}`} />
          AI              {/* ← REMOVE THIS TEXT */}
        </span>
      }
    >
      <span class="ai-status-active">
        <span class="status-bar-dot dev" />
        AI              {/* ← REMOVE THIS TEXT */}
      </span>
    </Show>
  </div>
</Show>
```

After change: two states only — dot visible when ready, nothing when disabled. Remove the `state.aiActivity` branch entirely (no busy state per decisions):

```tsx
<Show when={state.aiEnabled && (state.llmStatus === 'available' || state.cloudStatus === 'available')}>
  <div class="status-bar-item ai-status">
    <span class="status-bar-dot granted" />
  </div>
</Show>
```

### Anti-Patterns to Avoid

- **Destructuring SolidJS store props or state**: The project has `CRITICAL: Never destructure props or store` comments in multiple files. Every store read must go through `state.field` or an exported signal.
- **Inline async in event handlers without void**: Use `onClick={() => void handleAsync()}` pattern, which is already established throughout the codebase.
- **Calling `getClassificationHistory()` on every render**: This is async and hits Dexie. Call it once on panel mount, not in a reactive expression.
- **Replacing the synthetic training corpus**: The CORR-02 requirement explicitly says corrections augment. The export file has a date-stamped filename — it is always additive.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File download | Custom fetch + save | `triggerDownload()` in `src/storage/export.ts` | Already exists, handles blob URL lifecycle correctly |
| Classification history read | Direct Dexie query | `getClassificationHistory()` in `classification-log.ts` | Typed, handles missing config key, tested by existing features |
| Session-scoped flag | Custom cookie or localStorage | `sessionStorage.getItem/setItem` | Exactly the right scope — resets on new session, survives reload |
| Signal for async data | Reactive LiveQuery | `createSignal` + `onMount` async load | Panel opens infrequently; reactive Dexie subscription is overkill |

---

## Common Pitfalls

### Pitfall 1: Missing `suggestedType` in Older Events
**What goes wrong:** `suggestedType` was added as part of the Phase 8+ schema. Older `ClassificationEvent` records in Dexie may have `suggestedType === undefined` or equal to `chosenType` by default.
**Why it happens:** The field is optional (`suggestedType: AtomType`) and older events were logged before the Tier 2 pipeline existed.
**How to avoid:** In the correction filter, treat `suggestedType === undefined` as "no suggestion recorded" — exclude those events from the correction export (they can't be corrections if there was no suggestion).
**Warning signs:** Export file has more records than expected; events with identical `suggestedType` and `chosenType` appear.

### Pitfall 2: `isReadOnly` on Atom is Not in TypeScript Union
**What goes wrong:** Trying to read `atom.isReadOnly` on the `Atom` union type causes a TypeScript error — the field only exists on `AnalysisAtom`.
**Why it happens:** `isReadOnly: z.literal(true)` is in `AnalysisAtomSchema` only, not in `BaseAtomFields`.
**How to avoid:** Use the safe cast pattern: `(a as Record<string, unknown>)['isReadOnly'] === true`. This is the same pattern already used in `AtomDetailView` for `getAtomDate()`.
**Warning signs:** TypeScript error "Property 'isReadOnly' does not exist on type 'Atom'".

### Pitfall 3: Toast Fires Before `reviewSession` Is Hydrated
**What goes wrong:** `reviewSession` is loaded asynchronously from Dexie in the store's READY handler (store.ts line 202-209). If the toast's `onMount` runs before `loadReviewSession()` resolves, `state.reviewSession` is still null and the toast never shows.
**Why it happens:** The worker READY message arrives and `loadReviewSession()` runs async, but the component may mount before the Promise resolves.
**How to avoid:** Use a `createEffect` instead of `onMount` for the toast visibility check. `createEffect` re-runs when `state.reviewSession` changes reactively, so it correctly fires when the session is eventually hydrated.

```typescript
// Instead of onMount:
createEffect(() => {
  if (state.reviewSession && !sessionStorage.getItem(TOAST_SHOWN_KEY)) {
    setVisible(true);
    sessionStorage.setItem(TOAST_SHOWN_KEY, '1');
  }
});
```

### Pitfall 4: JSONL Export Missing Newline at EOF
**What goes wrong:** Some Python JSONL parsers require a trailing newline; missing it causes a parse error on the last record.
**Why it happens:** `lines.join('\n')` does not add a trailing `\n`.
**How to avoid:** Use `lines.join('\n') + '\n'` in the blob content.

### Pitfall 5: Settings Panel Correction Count Stale After Export
**What goes wrong:** User exports corrections, then re-opens settings. Count still shows the old value.
**Why it happens:** Count is loaded once on panel open via `onMount` into a local signal — it doesn't update when the panel stays open.
**How to avoid:** Reload the count after each export completes (call `getClassificationHistory()` again and update the signal). Since export is triggered by button click, this is straightforward.

---

## Code Examples

### Correction Export Function
```typescript
// Source: pattern from src/storage/export.ts (verified), adapted for JSONL
export async function exportCorrectionLog(): Promise<void> {
  const { getClassificationHistory } = await import('./classification-log');
  const history = await getClassificationHistory();

  // Only events where a suggestion was made AND user chose differently
  const corrections = history.filter(
    (e) => e.suggestedType !== undefined && e.suggestedType !== e.chosenType,
  );

  if (corrections.length === 0) {
    // Optionally show user feedback — no corrections to export
    return;
  }

  const lines = corrections.map((e) =>
    JSON.stringify({
      content: e.content,
      suggestedType: e.suggestedType,
      chosenType: e.chosenType,
      tier: e.tier ?? null,
      confidence: e.confidence ?? null,
      timestamp: e.timestamp,
    })
  );

  const dateStr = new Date().toISOString().split('T')[0];
  const blob = new Blob([lines.join('\n') + '\n'], { type: 'application/x-ndjson' });
  triggerDownload(blob, `binderos-corrections-${dateStr}.jsonl`);
}
```

### Model Info Card (Settings Panel insertion point)
```tsx
// Source: AISettingsPanel.tsx structure (verified) — insert after Browser LLM section
{/* Model Info Card — classifier status for Tier 2 ONNX */}
<div class="ai-settings-model-card">
  <div class="ai-settings-model-card-row">
    <span class="ai-settings-detail-label">Classifier:</span>
    <span>{classifierVersion() ?? '—'}</span>
  </div>
  <div class="ai-settings-model-card-row">
    <span class="ai-settings-detail-label">Status:</span>
    <span>{classifierReady() ? 'Ready' : classifierLoadProgress() !== null ? `Downloading ${classifierLoadProgress()}%` : 'Not loaded'}</span>
  </div>
  <div class="ai-settings-model-card-row">
    <span class="ai-settings-detail-label">Corrections:</span>
    <span>{correctionCountLocal()}</span>
    <button
      class="ai-settings-btn ai-settings-btn-secondary"
      onClick={() => void handleExportCorrections()}
      disabled={correctionCountLocal() === 0}
    >
      Export
    </button>
  </div>
</div>
```

(`correctionCountLocal` is a local signal loaded on panel mount via `getClassificationHistory()`)

### AIOrb Stale Comment Lines to Clean
```typescript
// Source: src/ui/components/AIOrb.tsx (verified)

// Line 147-149 — STALE (remove or update):
// 'discuss' wired to AIQuestionFlow in Plan 04
// 'review', 'compress' are stubs for Phases 6-7
// → Update to: // Action callbacks wired in Phases 5-7

// Line 181 — STALE (remove):
console.log('[AIOrb] Discuss option selected:', optionId);

// Line 185 — STALE (remove):
console.log('[AIOrb] Discuss freeform input:', text);

// Line 196-197 — STALE comment (update):
// Phase 6/7: resume existing session or start fresh (AIRV-01, AIRV-02, AIRV-05)
// → Update to: // Resume existing session or start fresh (AIRV-01, AIRV-02, AIRV-05)
```

### isReadOnly Guard Helper
```typescript
// Source: pattern from AtomDetailView.tsx getAtomDate() (verified)
// Add near top of AtomDetailView component body:
const isReadOnly = createMemo(() => {
  const a = atom();
  return a != null && (a as Record<string, unknown>)['isReadOnly'] === true;
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Badge dot only for pending review | Toast + badge fallback | Phase 11 | User gets explicit prompt on load |
| "AI" text label in status bar | Dot only | Phase 11 | Less verbose, cleaner status bar |
| Correction extraction via CLI script | Browser export button | Phase 11 | Developer-friendly, no tooling needed |

**Deprecated/outdated:**
- Status bar "AI" text string: removed in POLISH-03 — dot alone is sufficient signal
- "Phase 5 stubs" comments in AIOrb: outdated, Phases 5-7 are complete

---

## Open Questions

1. **Model version source**
   - What we know: The embedding worker sends `CLASSIFIER_READY` with no version payload (store.ts line 977-980). The ONNX model file is `triage-type.onnx` with no embedded metadata.
   - What's unclear: Where does a version string come from? The `triage-type-classes.json` contains only label indices, not a version.
   - Recommendation: Hardcode version as `"v1"` for Phase 11. Add a `"version"` field to `triage-type-classes.json` in the next training cycle. The settings card can read it via fetch on demand, or it can be included in the CLASSIFIER_READY message.

2. **Last-trained date source**
   - What we know: CONTEXT.md says the card shows "last-trained date" but no such data is stored anywhere currently.
   - What's unclear: Where would this come from? The model file has no metadata.
   - Recommendation: Omit "last-trained date" from the card for Phase 11 unless a date can be embedded in `triage-type-classes.json`. Show `—` as placeholder.

3. **Correction count loading timing**
   - What we know: `getClassificationHistory()` is async. The settings panel is opened on demand.
   - What's unclear: Should the count be a reactive store signal (always up-to-date) or a local panel signal (loaded on open)?
   - Recommendation: Local panel signal loaded on `onMount`. Corrections accumulate slowly; real-time reactivity is unnecessary overhead.

---

## Sources

### Primary (HIGH confidence)
- `src/ui/components/AISettingsPanel.tsx` — full 637-line panel read; section structure, signal usage, CSS class patterns verified
- `src/ui/layout/StatusBar.tsx` — full 176-line file read; AI indicator block at lines 116-134 verified
- `src/storage/classification-log.ts` — full 149-line file read; `ClassificationEvent` schema, `getClassificationHistory()` verified
- `src/storage/export.ts` — full 128-line file read; `triggerDownload()` pattern verified
- `src/ui/components/AIOrb.tsx` — full 273-line file read; stale comment locations at lines 147-149, 181, 185, 196 verified
- `src/worker/llm-worker.ts` — full 211-line file read; abort handler documented, no dead code confirmed
- `src/ui/views/AtomDetailView.tsx` — full 527-line file read; edit handler locations verified (startEditTitle line 113, handleStatusChange line 145, handleDateField line 155, handleContentChange line 186, project select onChange line 401)
- `src/types/atoms.ts` — full 172-line file read; `isReadOnly: z.literal(true)` on AnalysisAtomSchema only (line 116) verified
- `src/ui/signals/store.ts` — lines 920-210 read; `classifierReady`, `classifierLoadProgress` signals at lines 936-943; reviewSession hydration at lines 202-209 verified
- `src/app.tsx` — full 227-line file read; overlay component placement pattern verified for toast insertion

### Secondary (MEDIUM confidence)
- `scripts/train/README.md` — training JSONL format: `{"text": "...", "label": "..."}` per line; confirmed correction export format is different (no re-use of training format needed)
- `public/models/classifiers/triage-type-classes.json` — verified no version field present

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries/files already exist in project; no external research needed
- Architecture: HIGH — patterns copied from verified project source; no speculation
- Pitfalls: HIGH — isReadOnly TS type issue, async hydration timing, and JSONL filter edge cases all verified directly from source
- Open questions: MEDIUM — version/date sourcing is a genuine gap; recommendation is conservative

**Research date:** 2026-03-04
**Valid until:** 2026-04-03 (stable codebase, no fast-moving dependencies)
