---
phase: 03-pages-navigation-and-search
plan: 03
subsystem: search-and-navigation
tags: [search, keyboard-navigation, command-palette, minisearch, transformers-js, onnx, overlay]
dependency_graph:
  requires:
    - 03-01 (Dexie v2 migration, query engine, state.atoms, state.scores)
    - 02-01 (AtomScore.priorityScore for blended ranking)
  provides:
    - Full-text + semantic search via Ctrl+K (SearchOverlay)
    - Command palette via Ctrl+P (CommandPalette)
    - Keyboard shortcut reference via ? (ShortcutReference)
    - Unified overlay state management in app.tsx
    - useRovingTabindex hook (replaces stub, used by all pages)
    - Blended relevance ranking engine (text + semantic + graph + priority)
  affects:
    - app.tsx (unified overlay state replaces showCapture boolean)
    - All page components (useRovingTabindex hook stub replaced with full implementation)
    - layout.css (search overlay, command palette, shortcut reference CSS)
tech_stack:
  added:
    - minisearch@7.2.0 (full-text BM25 search with fuzzy/prefix)
    - "@huggingface/transformers@3.8.1" (ONNX inference for semantic embeddings)
  patterns:
    - Roving tabindex pattern for keyboard nav in lists
    - Singleton worker pattern for ONNX inference
    - Blended relevance ranking (text + semantic + graph proximity + priority)
    - Graceful degradation (text-only search when embeddings not ready)
    - Unified overlay state machine (single signal for all overlays)
key_files:
  created:
    - src/search/search-index.ts
    - src/search/ranking.ts
    - src/search/embedding-worker.ts
    - src/ui/views/SearchOverlay.tsx
    - src/ui/components/CommandPalette.tsx
    - src/ui/components/ShortcutReference.tsx
    - scripts/download-model.cjs
  modified:
    - src/ui/hooks/useRovingTabindex.ts (replaced stub with full implementation)
    - src/app.tsx (unified OverlayState, Ctrl+K/P/?, number keys)
    - src/ui/layout/layout.css (+600 lines of overlay CSS)
    - package.json (added minisearch, @huggingface/transformers, postinstall:models script)
    - .gitignore (added public/models/ for binary model files)
decisions:
  - "@huggingface/transformers v3 uses dtype:'q8' not quantized:true — v2 API changed"
  - "env.allowRemoteModels/allowLocalModels/localModelPath accessed directly on env object (not cast)"
  - "useRovingTabindex returns onKeyDown handler not containerProps spread — avoids SolidJS role type conflict"
  - "Download script resolves relative redirect URLs via new URL(location, baseUrl).href — HuggingFace CDN uses relative redirects"
  - "Embedding worker caches pipelineError to prevent repeated failed load attempts"
  - "tokenizer.json empty-file guard added to download script (size > 0 check)"
metrics:
  duration: 21 min
  completed_date: "2026-02-22"
  tasks_completed: 2
  files_created: 7
  files_modified: 5
---

# Phase 3 Plan 3: Search, Navigation, and Command Palette Summary

**One-liner:** MiniSearch full-text + ONNX semantic search via Ctrl+K overlay, Ctrl+P command palette, ? shortcut reference, unified overlay state, and fully-implemented roving tabindex keyboard navigation.

## What Was Built

### Task 1: Search Infrastructure + Overlay

**`src/search/search-index.ts`** — MiniSearch singleton that indexes all atoms on state change. Exports `rebuildIndex(atoms)`, `searchAtoms(query, filter)`, and `autoSuggest(query)`. Title matches weighted 2x, 20% fuzzy tolerance, prefix matching for type-ahead. Filter by type, status, and date range via MiniSearch's `filter` callback.

**`src/search/ranking.ts`** — Blended relevance scoring engine. `blendedScore()` combines text (40%), semantic (25%), graph proximity (20%), and priority (15%) — adapts weights when embeddings not ready (55% text / 25% graph / 20% priority). `computeGraphProximity()` returns 1.0 if atom is linked to any atom updated within 7 days. `cosineSimilarity()` for embedding comparison. `normalizeTextScore()` normalizes BM25 scores to 0-1.

**`src/search/embedding-worker.ts`** — Dedicated Web Worker for ONNX inference. Configured with `env.allowRemoteModels = false` and `env.localModelPath = '/models/'` — zero network calls from the browser. Lazy-loads `Xenova/all-MiniLM-L6-v2` (int8 quantized, ~22MB) on first EMBED message. Sends `MODEL_LOADING`/`MODEL_READY` lifecycle events. All errors return as `EMBED_ERROR` (graceful degradation).

**`src/ui/views/SearchOverlay.tsx`** — Spotlight-style search overlay. Opens via Ctrl+K. 150ms debounced text search → immediate results → semantic re-ranking when worker responds. Filter chips for type (task/fact/event/decision/insight), status (open/in-progress/waiting/done), and date range (today/this-week/this-month/all). Logs search/click/filter interactions via `LOG_INTERACTION` for future learning.

**`scripts/download-model.cjs`** — Node.js postinstall script that downloads ONNX model files to `public/models/Xenova/all-MiniLM-L6-v2/` at install time. Handles HuggingFace CDN relative URL redirects. Skips already-downloaded non-empty files. Add `public/models/` to `.gitignore`.

### Task 2: Command Palette + Keyboard Navigation + App Integration

**`src/ui/hooks/useRovingTabindex.ts`** — Full implementation replacing the stub. `createEffect` resets focus on item count change. Handles ArrowDown/Up (wrap-around), Home, End, Enter (onSelect), Escape (onEscape). Returns `onKeyDown` handler (not `containerProps` spread — avoids SolidJS role type constraint). All page components (TodayPage, etc.) were already wired to `onKeyDown` from previous plans.

**`src/ui/components/CommandPalette.tsx`** — Ctrl+P command palette. 8 navigation commands (pages 1-5, inbox, all, review), 4 action commands (search, undo, export, persistence), and last 5 atoms by updated_at as "Recent" commands. Fuzzy filter via substring matching per word. Grouped display with category headers. Keyboard navigation via useRovingTabindex.

**`src/ui/components/ShortcutReference.tsx`** — ? key shortcut reference sheet. Grid layout with Global / Navigation / Lists / Search / Detail Panel categories. `<kbd>` elements for key indicators. Click backdrop or Escape to close.

**`src/app.tsx`** — Unified overlay state machine: `type OverlayState = 'none' | 'capture' | 'search' | 'command-palette' | 'shortcuts'`. Ctrl+K → search, Ctrl+P → command-palette, ? (no input focused) → shortcuts, number keys 1-5 → page switch (setActivePage), Escape → close overlay then close detail panel. `isInputFocused()` helper guards hotkeys from firing in text inputs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] @huggingface/transformers v3 removed `quantized` option**
- **Found during:** Task 1, embedding-worker.ts
- **Issue:** Plan specified `{ quantized: true }` in pipeline() options. v3.x removed this — use `dtype: 'q8'` for int8 quantized model.
- **Fix:** Changed `{ quantized: true }` to `{ dtype: 'q8' }`.
- **Files modified:** `src/search/embedding-worker.ts`
- **Commit:** 9228104

**2. [Rule 1 - Bug] useRovingTabindex `containerProps` spread causes SolidJS role type error**
- **Found during:** Task 2, TypeScript check
- **Issue:** Old stub returned `containerProps: { role: string; ... }`. Spreading this on a `<div>` conflicts with SolidJS's strict `role` union type (requires literal ARIA role, not `string`).
- **Fix:** Changed hook return to expose `onKeyDown` handler directly instead of `containerProps` spread. Consumer components manually set `role="listbox"`. This also matches what Plan 02 page components already expected (they destructured `onKeyDown` from the stub).
- **Files modified:** `src/ui/hooks/useRovingTabindex.ts`
- **Commit:** af760c4

**3. [Rule 1 - Bug] HuggingFace CDN redirects to relative URLs**
- **Found during:** Task 1, download-model.cjs testing
- **Issue:** HuggingFace CDN sends 302 redirects with relative `Location` headers (e.g., `/api/resolve-cache/...`). Node's `https.get` follows redirects by passing the Location directly as the URL, which fails if it's a relative path.
- **Fix:** Used `new URL(location, requestUrl).href` to resolve relative redirect URLs against the base URL before following.
- **Files modified:** `scripts/download-model.cjs`
- **Commit:** 9228104

**4. [Rule 2 - Missing validation] Download script empty-file guard**
- **Found during:** Task 1, download-model.cjs testing
- **Issue:** First failed download run (before URL fix) wrote 0-byte `tokenizer.json`. Script's exists check (`fs.existsSync`) returned true, so it skipped re-downloading the empty file.
- **Fix:** Changed both the "all downloaded" check and the per-file skip to verify `stat.size > 0` in addition to file existence.
- **Files modified:** `scripts/download-model.cjs`
- **Commit:** 9228104

**5. [Rule 1 - Bug] Transformers.js pipeline type union too complex for TypeScript**
- **Found during:** Task 1, TypeScript check
- **Issue:** `Awaited<ReturnType<typeof pipeline<'feature-extraction'>>>` triggers TS2590 "expression produces a union type that is too complex". Transformers.js has deeply overloaded pipeline signatures.
- **Fix:** Typed the pipeline as `EmbedPipeline = (texts: string[], options: Record<string, unknown>) => Promise<unknown>` and cast with `as unknown as EmbedPipeline`.
- **Files modified:** `src/search/embedding-worker.ts`
- **Commit:** 9228104

**Pre-existing issues (out of scope, logged):**
- `VoiceCapture.tsx` has 6 pre-existing TypeScript errors (SpeechRecognition API types not in lib). Not caused by this plan's changes — confirmed via `git stash` test. Left as-is per scope boundary rule.

## Self-Check: PASSED

All created files verified present. All commits (9228104, af760c4) verified in git log.

| Check | Result |
|-------|--------|
| src/search/search-index.ts | FOUND |
| src/search/ranking.ts | FOUND |
| src/search/embedding-worker.ts | FOUND |
| src/ui/views/SearchOverlay.tsx | FOUND |
| src/ui/components/CommandPalette.tsx | FOUND |
| src/ui/components/ShortcutReference.tsx | FOUND |
| src/ui/hooks/useRovingTabindex.ts | FOUND |
| scripts/download-model.cjs | FOUND |
| public/models/Xenova/all-MiniLM-L6-v2/ model files | FOUND |
| Commit 9228104 | FOUND |
| Commit af760c4 | FOUND |
| TypeScript errors in new files | 0 (only pre-existing VoiceCapture.tsx) |
