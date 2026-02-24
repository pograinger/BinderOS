# Phase 5: Triage AI - Research

**Researched:** 2026-02-23
**Domain:** SolidJS floating UI, CSS radial menus, swipe gestures, AI triage prompt engineering, streaming abort, changelog AI-source tagging, Dexie settings persistence
**Confidence:** HIGH (stack verified through project source code + official Anthropic docs; CSS patterns verified through MDN + established techniques)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Orb appearance & behavior**
- Orb is a glowing circle styled to look like it opens like a 3-ring binder ring (on-brand for BinderOS)
- Animation-based state indicators: idle = gentle pulse, thinking = ring rotates/spins, streaming = ring opens with particles flowing, expanded = ring fully open revealing radial menu
- Context-aware positioning: orb smoothly animates to different screen positions based on current page layout (e.g., near inbox list on Inbox page, near detail panel on atom view)
- Always visible — never auto-hides. May shrink to a subtle dot during focus activities but remains on screen and one tap away
- When tapped, orb takes full focus and opens a radial/circular menu (pie menu style) — user can spin around to different groups of options
- 4-5 segments in the radial menu (e.g., Triage, Review, Compress, Discuss, Settings)
- Context-aware primary action is highlighted: the segment relevant to the current page is larger/brighter than the others
- One of the radial actions is a "Discuss" option that asks the user a series of preferences about the current atom or page being viewed

**Suggestion presentation**
- Suggestions appear inline on each inbox card — directly on the card where the atom is, not in a separate tray
- One-liner reasoning visible by default (e.g., "This looks like a Project — has multiple next actions and a deadline."). Expandable for more detail
- 2-3 semantically related atoms shown as compact clickable chips below the suggestion line. Tapping a chip opens the linked atom
- Batch processing: when user taps "Triage Inbox" on the orb, AI processes all inbox items and suggestions appear on every card simultaneously
- Subtle confidence signal: high-confidence suggestions have a solid suggestion line; lower-confidence ones have a dotted/lighter treatment. No numbers or labels
- Cards remain in their current list layout (InboxView shows a swipe-card-by-card UI) — Phase 5 adds AI suggestion overlay to existing cards; the underlying InboxView card-by-card UX is NOT replaced, it is augmented

**Accept/dismiss interaction**
- Swipe gestures: swipe right to accept, swipe left to dismiss. Buttons as fallback for accessibility
- On accept: card animates off-screen (satisfying "done" feeling), and the accepted type/section is applied via existing mutation pipeline
- On dismiss: suggestion disappears from the card without affecting the atom
- Persistent AI badge on accepted atoms: subtle indicator (small icon or colored dot), visible if you look but doesn't dominate. Tooltip shows "AI-suggested"
- "Accept all" batch button available after reviewing a few suggestions — applies all remaining pending suggestions at once. Speeds up large inboxes

**Streaming & error states**
- Orb indicates processing (spinning ring animation), cards populate one by one as each suggestion completes. No per-token typing animation on individual cards
- On cancel mid-stream: keep suggestions that are already complete, remaining cards show nothing. User can re-trigger for the rest
- On error (model failure, network, timeout): orb ring turns red/amber briefly with a small message near it: "Triage failed — tap to retry". Cards remain untouched
- Retry is always available from the orb's error state

### Claude's Discretion
- Exact CSS animations and transitions for the orb states
- Radial menu implementation approach (CSS transforms vs canvas vs SVG)
- Exact positioning algorithm for context-aware orb placement per page
- Swipe gesture sensitivity and thresholds
- Card exit animation timing and easing
- How the "Discuss" radial action gathers preferences (question flow design)

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AIUX-01 | Floating orb — always-visible, context-aware AI trigger reading current page/atom/entropy state | Orb as fixed-position SolidJS component rendered in app.tsx alongside existing FAB; `state.activePage` drives context awareness; CSS @keyframes drives idle/thinking/streaming/error states |
| AIUX-02 | Orb GTD menu with relevant actions below context-aware primary suggestion | Radial menu via CSS transforms + clip-path pie segments; `state.activePage` determines which segment is "primary" (larger/brighter); no third-party library needed |
| AIUX-03 | Conversational question-flow component (3-4 options + freeform input) for all AI interactions | New `AIQuestionFlow.tsx` component; maps to the "Discuss" orb action; reusable shell for Phases 6-7 question flows |
| AIUX-04 | AI suggestion tray with per-suggestion accept/dismiss and reasoning shown | Inline suggestion overlay on each InboxView card; per-item SolidJS signal `aiSuggestions` Map keyed by inbox item id; accept/dismiss handled via swipe (reuses existing InboxView touch pattern) |
| AIUX-05 | Visual AI badge on all AI-sourced or AI-modified content, distinct from user content | `aiSourced` field added to Atom (optional boolean); badge rendered in AtomCard and AtomDetailView; MutationLogEntry extended with `source: 'ai' \| 'user'` field |
| AIUX-06 | Streaming response display with cancel/abort support | `AbortController` per triage batch; stream.abort() wired to orb cancel button; partial results preserved on abort (per CONTEXT.md decision) |
| AITG-01 | AI suggests atom type during inbox triage based on content analysis | Triage prompt includes inbox item content + atom type definitions; response parsed for type field; browser LLM (SmolLM2) or cloud (claude-haiku-4-5) via existing adapter router |
| AITG-02 | AI suggests section/project during inbox triage based on existing atom patterns | Triage prompt includes available section items names and IDs; response parsed for sectionItemId; privacy proxy enforces sanitization level |
| AITG-03 | Entropy-informed suggestions — AI reads staleness, link density, and scoring before recommending | Triage prompt builder reads `state.scores[item.id]` (staleness, priorityTier, opacity) and `state.entropyScore`; includes these signals in structured context |
| AITG-04 | Related atoms surfaced during triage (2-3 semantically similar existing atoms) | Similarity computed client-side using Jaccard keyword overlap (reuses `keywordSimilarity` from classification-log.ts); top-2-3 matches surfaced as clickable chips |
| AITG-05 | Reasoning shown per triage suggestion explaining why AI chose that type/section | AI response schema includes `reasoning` string field; parsed from structured JSON response; displayed inline on card |
</phase_requirements>

---

## Summary

Phase 5 builds the user-facing AI interaction layer on top of Phase 4's adapter infrastructure. The phase has four distinct sub-systems that must integrate cleanly: (1) the floating orb with its radial menu and animation state machine, (2) the batch triage pipeline that calls the AI adapter for all inbox items and maps results back to cards, (3) the inline suggestion overlay on InboxView cards with swipe-to-accept/dismiss, and (4) the AI-source tagging system in the changelog and atom schema.

The most critical architectural decision is that Phase 5 does NOT replace the existing InboxView — it augments it. InboxView currently shows one card at a time with swipe-to-skip/classify. Phase 5 adds an AI suggestion strip to each card and adjusts the swipe semantics: when suggestions are present, swipe-right accepts the AI suggestion (applying it via `CLASSIFY_INBOX_ITEM`), swipe-left dismisses the suggestion only (not the card). This reuses the extensive swipe gesture code already in InboxView without rewriting it.

The orb is a new fixed-position SolidJS component added alongside the existing `.fab-capture` button in `app.tsx`. It uses CSS `@keyframes` for its four states (idle pulse, thinking spin, streaming particles, error flash) and CSS transforms + `conic-gradient` or `clip-path` for the radial menu segments. No third-party animation library or radial menu library is needed — the project already has `@keyframes` patterns for FAB, card swipe, and pulse animations in `layout.css`, and this same CSS-first approach is consistent with the codebase.

The AI triage pipeline is a new `triageInbox()` function that iterates inbox items, builds a structured prompt per item (content + atom types + section items + entropy signals), calls `dispatchAI()` for each, parses the response JSON, and stores results in a SolidJS store signal keyed by inbox item ID. The existing `dispatchAICommand` in `store.ts` handles single prompts; Phase 5 needs a batch variant that streams results per-item into a local signal Map.

**Primary recommendation:** Build in three sequential plans — (1) orb component + radial menu + CSS state animations, (2) triage batch pipeline + inline card suggestions + accept/dismiss, (3) AI-source tagging in changelog + atom schema + AI badge + settings persistence deferred from Phase 4.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SolidJS `createSignal` / `createStore` | ^1.9.11 (already installed) | Local orb state, triage suggestion Map, per-card suggestion state | All reactive state management in this project uses SolidJS primitives |
| `@anthropic-ai/sdk` | ^0.78.0 (already installed) | Cloud triage requests via existing CloudAdapter | Already wired; no new installation needed |
| `@huggingface/transformers` | ^3.8.1 (already installed) | Browser LLM triage via existing BrowserAdapter | Already wired; no new installation needed |
| CSS `@keyframes` + `conic-gradient` | Browser built-in | Orb ring animations (idle pulse, thinking spin, streaming open) | Matches existing project CSS pattern; no animation library needed |
| CSS `clip-path: polygon()` or `conic-gradient` + `rotate` | Browser built-in | Radial menu pie segments | Pure CSS approach consistent with project; fully animatable via transitions |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `AbortController` | Browser built-in | Cancels mid-stream triage batch | Pass `signal` to each `AIRequest`; call `abort()` from orb cancel button |
| `crypto.randomUUID()` | Browser built-in | Request IDs for each triage AI call | Already used throughout project |
| Jaccard keyword similarity (existing) | Local (classification-log.ts) | Surfaces semantically related atoms (AITG-04) | `keywordSimilarity()` already exists; Phase 5 reuses it from the main thread |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| CSS transforms for radial menu | SVG pie chart segments | SVG is more precise for pie segments but requires trigonometry and DOM complexity; CSS transforms + clip-path is simpler and already used for card animations in the project |
| CSS @keyframes for orb | `solid-motionone` / Motion One | Motion One provides springs and hardware acceleration but adds a dependency; CSS @keyframes is sufficient for the 4 orb states and consistent with the project's CSS-first approach |
| Pure CSS radial menu | `radial-menu-js` library | External library adds dependency and opinionated DOM structure; CSS transforms handle 4-5 segments cleanly without a library |
| JSON-structured AI response | Free-form text parsing | Structured JSON is more reliable for automated parsing; instruct the model to respond with a JSON object `{ type, sectionItemId, reasoning, confidence }` |

**Installation:**
```bash
# No new packages required — all dependencies already installed in Phase 4
```

---

## Architecture Patterns

### Recommended Project Structure

Phase 5 adds components and extends existing files:

```
src/
├── ai/
│   ├── triage.ts               # NEW: batch triage pipeline, prompt builder, response parser
│   └── adapters/               # UNCHANGED — existing adapter infrastructure
├── types/
│   ├── atoms.ts                # EXTEND: add optional aiSourced field to BaseAtomFields
│   └── changelog.ts            # EXTEND: add optional source: 'ai' | 'user' field to MutationLogEntry
├── ui/
│   ├── components/
│   │   ├── AIOrb.tsx           # NEW: floating orb + radial menu
│   │   ├── AIQuestionFlow.tsx  # NEW: conversational question-flow (AIUX-03, used by Discuss action)
│   │   ├── InboxAISuggestion.tsx  # NEW: per-card AI suggestion strip (inline, not a tray)
│   │   └── AtomCard.tsx        # EXTEND: render AI badge when atom.aiSourced === true
│   ├── signals/
│   │   └── store.ts            # EXTEND: aiSuggestions Map, triageStatus, orbState signals; AI settings persistence
│   ├── views/
│   │   └── InboxView.tsx       # EXTEND: render InboxAISuggestion per card; adjust swipe semantics when suggestions present
│   └── layout/
│       ├── Shell.tsx           # EXTEND: render AIOrb (always visible)
│       └── layout.css          # EXTEND: add orb, radial menu, suggestion strip, AI badge CSS
└── storage/
    └── migrations/
        └── v3.ts               # NEW: Dexie v3 migration (aiSourced index on atoms; AI settings in config table)
```

### Pattern 1: Floating Orb as Fixed-Position SolidJS Component

The orb is a new permanent fixture in the layout, rendered in Shell.tsx alongside the existing AI overlays. It reads `state.activePage` and `anyAIAvailable()` to determine context and enabled state.

```typescript
// src/ui/components/AIOrb.tsx
// Source: existing FAB pattern from app.tsx + layout.css .fab-capture

import { createSignal, Show } from 'solid-js';
import { state, anyAIAvailable } from '../signals/store';

type OrbState = 'idle' | 'thinking' | 'streaming' | 'error' | 'expanded';

export function AIOrb() {
  const [orbState, setOrbState] = createSignal<OrbState>('idle');
  const [menuOpen, setMenuOpen] = createSignal(false);

  // Context-aware primary action based on current page
  const primaryAction = () => {
    switch (state.activePage) {
      case 'inbox': return 'triage';
      case 'today': case 'this-week': return 'review';
      case 'all': return 'compress';
      default: return 'discuss';
    }
  };

  return (
    <Show when={anyAIAvailable()}>
      <div
        class={`ai-orb ai-orb--${orbState()}`}
        onClick={() => setMenuOpen((m) => !m)}
        aria-label="AI assistant"
        role="button"
      >
        <div class="ai-orb-ring" />
        <Show when={menuOpen()}>
          <AIRadialMenu primaryAction={primaryAction()} onClose={() => setMenuOpen(false)} />
        </Show>
      </div>
    </Show>
  );
}
```

**Where it lives:** Shell.tsx renders `<AIOrb />` as the last child of the `.shell` div — below all content overlays, above the status bar in z-order (z-index: 100).

### Pattern 2: CSS Orb State Animations

The orb states use `@keyframes` consistent with existing project animations:

```css
/* layout.css — add to Phase 5 section */

.ai-orb {
  position: fixed;
  bottom: calc(var(--status-bar-height) + 72px); /* above FAB */
  right: 16px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  cursor: pointer;
  z-index: 100;
  transition: transform 0.2s, bottom 0.3s ease-out; /* context-aware position transition */
}

.ai-orb-ring {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 2px solid var(--accent);
  box-shadow: 0 0 8px rgba(88, 166, 255, 0.4);
}

/* Idle: gentle pulse (existing celebratePulse pattern adapted) */
.ai-orb--idle .ai-orb-ring {
  animation: orbIdlePulse 3s ease-in-out infinite;
}
@keyframes orbIdlePulse {
  0%, 100% { box-shadow: 0 0 8px rgba(88, 166, 255, 0.4); }
  50%       { box-shadow: 0 0 16px rgba(88, 166, 255, 0.8); }
}

/* Thinking: ring rotates/spins */
.ai-orb--thinking .ai-orb-ring {
  animation: orbThinkingSpin 1s linear infinite;
  border-style: dashed;
}
@keyframes orbThinkingSpin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

/* Streaming: conic-gradient "opening" ring animation */
.ai-orb--streaming .ai-orb-ring {
  animation: orbStreamingOpen 0.5s ease-out forwards, orbThinkingSpin 2s linear infinite;
  background: conic-gradient(var(--accent) 0%, transparent 60%);
  border: none;
}

/* Error: brief red flash */
.ai-orb--error .ai-orb-ring {
  animation: orbErrorFlash 1.5s ease-out forwards;
}
@keyframes orbErrorFlash {
  0%   { border-color: var(--status-error); box-shadow: 0 0 16px rgba(248, 81, 73, 0.8); }
  100% { border-color: var(--accent); box-shadow: 0 0 8px rgba(88, 166, 255, 0.4); }
}
```

### Pattern 3: Radial Menu via CSS Transforms (No Library)

The radial menu uses absolute-positioned buttons arranged in a circle via CSS `transform: rotate() translate() rotate()`. This is the standard CSS-only pie menu technique — no trigonometry required.

```css
/* layout.css */
.ai-radial-menu {
  position: absolute;
  bottom: calc(100% + 8px);
  right: 0;
  width: 180px;
  height: 180px;
  pointer-events: none;
}

.ai-radial-item {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 48px;
  height: 48px;
  margin: -24px;
  pointer-events: all;
  border-radius: 50%;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-primary);
  transform-origin: center center;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: var(--text-secondary);
  transition: transform 0.2s, background 0.15s, color 0.15s;
}

/* Position items around the center using nth-child offsets */
/* For 4 items at 90° intervals: N=0→top, N=1→right, N=2→bottom, N=3→left */
.ai-radial-item:nth-child(1) { transform: translateY(-70px); }
.ai-radial-item:nth-child(2) { transform: translateX(70px); }
.ai-radial-item:nth-child(3) { transform: translateY(70px); }
.ai-radial-item:nth-child(4) { transform: translateX(-70px); }

/* Primary action highlighted */
.ai-radial-item--primary {
  background: var(--accent);
  color: var(--bg-primary);
  width: 56px;
  height: 56px;
  margin: -28px;
  font-size: 12px;
  font-weight: 600;
}
```

**Implementation note:** For the full "binder ring that opens" brand identity, the orb ring itself can be styled with `conic-gradient` and `clip-path` to visually appear as an open ring. This is left to Claude's discretion per CONTEXT.md.

### Pattern 4: Batch Triage Pipeline

The core triage engine is a new `triageInbox()` function in `src/ai/triage.ts`. It runs on the main thread (where the AI adapters are), processes items sequentially or in controlled parallel batches, and writes results to a SolidJS signal in the store.

```typescript
// src/ai/triage.ts

import { dispatchAI } from './router';
import type { InboxItem, AtomType } from '../types/atoms';
import type { AtomScore, EntropyScore } from '../types/config';

export interface TriageSuggestion {
  inboxItemId: string;
  suggestedType: AtomType;
  suggestedSectionItemId: string | null;
  reasoning: string;
  confidence: 'high' | 'low'; // drives solid vs dotted line treatment
  relatedAtomIds: string[];    // 2-3 semantically related atoms (AITG-04)
  status: 'pending' | 'complete' | 'error';
}

/**
 * Build a structured prompt for a single inbox item triage.
 * Includes entropy signals (AITG-03) and available sections (AITG-02).
 * Output: instructs the model to respond with JSON.
 */
export function buildTriagePrompt(
  item: InboxItem,
  score: AtomScore | undefined,
  entropyScore: EntropyScore | null,
  sectionItems: Array<{ id: string; name: string; sectionName: string }>,
): string {
  const sectionList = sectionItems.map(si => `- "${si.name}" (id: ${si.id}, in: ${si.sectionName})`).join('\n');
  const entropyCtx = entropyScore
    ? `System entropy: ${entropyScore.level} (${entropyScore.score.toFixed(0)}%). ${entropyScore.staleCount} stale atoms, ${entropyScore.openTasks} open tasks.`
    : 'System entropy: unknown.';
  const scoreCtx = score
    ? `This item: staleness=${score.staleness.toFixed(2)}, priorityTier=${score.priorityTier ?? 'none'}`
    : '';

  return `You are a GTD (Getting Things Done) triage assistant. Classify the following inbox item.

INBOX ITEM:
Title: ${item.title || '(none)'}
Content: ${item.content}

CONTEXT:
${entropyCtx}
${scoreCtx}

ATOM TYPES:
- task: actionable item with a next physical action
- fact: reference information you want to remember
- event: time-bound occurrence (meeting, appointment, deadline)
- decision: choice that was made or needs to be made
- insight: realization, idea, or pattern noticed

AVAILABLE SECTIONS (pick one or null):
${sectionList || '(none available)'}

Respond with ONLY valid JSON, no markdown:
{"type":"<atom_type>","sectionItemId":"<id_or_null>","reasoning":"<one sentence why>","confidence":"<high_or_low>"}`;
}

/**
 * Parse the AI response JSON for a triage suggestion.
 * Returns null if the response is malformed.
 */
export function parseTriageResponse(
  inboxItemId: string,
  responseText: string,
  relatedAtomIds: string[],
): TriageSuggestion | null {
  try {
    // Extract JSON from response (model may include extra text)
    const match = responseText.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);

    const VALID_TYPES: AtomType[] = ['task', 'fact', 'event', 'decision', 'insight'];
    if (!VALID_TYPES.includes(parsed.type)) return null;

    return {
      inboxItemId,
      suggestedType: parsed.type as AtomType,
      suggestedSectionItemId: typeof parsed.sectionItemId === 'string' ? parsed.sectionItemId : null,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
      confidence: parsed.confidence === 'high' ? 'high' : 'low',
      relatedAtomIds,
      status: 'complete',
    };
  } catch {
    return null;
  }
}
```

### Pattern 5: Inline Card Suggestion — Augmenting InboxView (not replacing)

Phase 5 does NOT rewrite InboxView. The existing card-by-card swipe UX stays intact. Instead, a new `InboxAISuggestion` component is conditionally rendered within the existing triage card when a suggestion exists for the current item.

```typescript
// InboxView.tsx — add at bottom of card JSX, inside <Show when={currentItem()}>
// After the existing swipe hints:

import { InboxAISuggestion } from '../components/InboxAISuggestion';
import { triageSuggestions } from '../signals/store'; // new store signal

// Inside InboxView JSX, in the triage card:
<Show when={triageSuggestions.get(currentItem()!.id)}>
  <InboxAISuggestion
    suggestion={triageSuggestions.get(currentItem()!.id)!}
    onAccept={() => acceptAISuggestion(currentItem()!.id)}
    onDismiss={() => dismissAISuggestion(currentItem()!.id)}
  />
</Show>
```

**Swipe semantics with suggestions present:** When `triageSuggestions` has an entry for the current card:
- Swipe right = accept the AI suggestion (calls `CLASSIFY_INBOX_ITEM` with suggested type/section)
- Swipe left = dismiss the AI suggestion only (removes it from the Map; card remains in inbox)
- The existing swipe handlers check for suggestion presence before routing to old behavior.

### Pattern 6: AI-Source Tagging in Changelog

Phase 5 extends `MutationLogEntry` with an optional `source` field and atoms with an optional `aiSourced` field. This is an additive schema change — no existing data breaks.

```typescript
// src/types/changelog.ts — extend MutationLogEntrySchema
export const MutationLogEntrySchema = z.object({
  // ... all existing fields unchanged ...
  source: z.enum(['user', 'ai']).optional(), // Phase 5: AI-sourced mutations tagged
  aiRequestId: z.string().optional(),         // Phase 5: links back to the AI request that triggered this
});

// src/types/atoms.ts — extend BaseAtomFields
const BaseAtomFields = {
  // ... all existing fields unchanged ...
  aiSourced: z.boolean().optional(), // Phase 5: true if this atom was classified by AI
};
```

In `handleClassifyInboxItem`, the AI triage path passes `source: 'ai'` to `appendMutation()`. The Dexie migration adds `aiSourced` as an indexed field on atoms. The `MutationLogEntry` schema change does not require a Dexie migration because `changelog` table only stores JSON blobs indexed by `id, atomId, timestamp, lamportClock`.

### Pattern 7: AI Settings Persistence (Deferred from Phase 4)

Phase 4 deferred two persistence items: `aiFirstRunComplete` and AI toggle settings. Phase 5 resolves these using the existing `config` table pattern (same as `classification-events`):

```typescript
// src/storage/ai-settings.ts (new)
// Mirrors the classification-log.ts pattern: config table + write queue

const AI_SETTINGS_KEY = 'ai-settings';

export interface AISettings {
  aiEnabled: boolean;
  browserLLMEnabled: boolean;
  cloudAPIEnabled: boolean;
  aiFirstRunComplete: boolean;
  triageEnabled: boolean;
  reviewEnabled: boolean;
  compressionEnabled: boolean;
}

export async function loadAISettings(): Promise<AISettings | null> {
  const entry = await db.config.get(AI_SETTINGS_KEY);
  return entry ? (entry.value as AISettings) : null;
}

export function saveAISettings(settings: AISettings): void {
  writeQueue.enqueue(async () => {
    await db.config.put({ key: AI_SETTINGS_KEY, value: settings });
  });
}
```

**Critical:** `loadAISettings()` runs in the BinderCore worker during INIT (where `db` is available). The worker sends loaded AI settings back to the main thread via the READY response payload extension. The main thread initializes store state from these persisted values instead of defaults.

### Pattern 8: Semantic Relatedness for AITG-04

The `keywordSimilarity` function already exists in `src/storage/classification-log.ts`. Phase 5 extracts it to a shared utility (`src/ai/similarity.ts`) so it can be called from `triage.ts` on the main thread:

```typescript
// src/ai/similarity.ts — extracted from classification-log.ts
// This runs synchronously on the main thread using state.atoms

import { state } from '../ui/signals/store';
import type { Atom } from '../types/atoms';

export function findRelatedAtoms(content: string, limit = 3): string[] {
  const atoms = state.atoms;
  const scored = atoms.map(atom => ({
    id: atom.id,
    score: keywordSimilarity(content, atom.content + ' ' + atom.title),
  }));
  return scored
    .filter(s => s.score > 0.15)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.id);
}
```

### Anti-Patterns to Avoid

- **Replacing InboxView's swipe UX:** The existing card-by-card UI stays. Phase 5 augments the current card with an AI strip; it does not switch to a list view or a separate tray. Rewriting InboxView would be a major regression risk.
- **Streaming tokens to individual cards:** CONTEXT.md specifies no per-token animation on cards. Each card populates once its full suggestion is complete (when `parseTriageResponse` returns a valid result). Do NOT use `onChunk` for card rendering.
- **Calling `dispatchAI` from inside the BinderCore worker:** AI dispatch is always on the main thread (established in Phase 4). The triage pipeline runs in `store.ts` or a new `triage.ts` module that imports from the main thread's adapter router.
- **Blocking the inbox card while AI is processing:** Cards show their existing UI immediately. The AI suggestion strip appears below existing content only when ready. A "Loading..." placeholder is fine but should not block interaction.
- **Storing TriageSuggestion objects in Dexie:** Suggestions are ephemeral session state. Store them in a SolidJS signal Map only (`Map<inboxItemId, TriageSuggestion>`), not in IndexedDB.
- **Sending full atom content to cloud without sanitization:** Privacy proxy enforces the sanitization level. Triage prompts must go through `sanitizeForCloud()` before reaching the CloudAdapter.
- **Adding `aiSourced` index to the Dexie `atoms` table without a migration:** Any new indexed field on `atoms` requires a Dexie `version(N).stores()` definition. Follow the v2 migration pattern exactly.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Swipe gestures for accept/dismiss | New touch handler | Extend existing InboxView touch handler | InboxView already has a complete, battle-tested swipe disambiguation system (horizontal vs vertical, velocity threshold, direction detection). Phase 5 adds a branch to route swipes based on suggestion presence. |
| Semantic similarity for related atoms | TF-IDF or embedding model | `keywordSimilarity()` (classification-log.ts) | Jaccard keyword overlap is sufficient for surfacing 2-3 related atoms; no model inference needed; already implemented and tested in the project. |
| Stream cancellation | Custom SSE parser with abort | `AbortController` + `stream.abort()` | The Anthropic SDK's `stream.abort()` method handles SSE stream cancellation. Pass an `AbortSignal` to `AIRequest`; the CloudAdapter already wires it (`request.signal.addEventListener('abort', () => stream.abort())`). |
| JSON response parsing with fallback | Strict JSON.parse | Regex extract + try/catch | AI models occasionally include markdown wrappers around JSON. The `parseTriageResponse` pattern (extract JSON block with regex, then parse) is the standard resilient approach. |
| Radial menu positioning math | Trigonometry per segment | CSS nth-child transforms | 4-5 items at equal angular intervals around a center point can be positioned with CSS `translateY/X` values computed once. No per-frame JavaScript needed. |
| AI badge rendering | Custom badge component | Extend existing `PriorityBadge` pattern | The project already has `PriorityBadge` as a small inline indicator component. `AIBadge` follows the same pattern: a tiny chip with a tooltip. |

**Key insight:** The InboxView swipe gesture system is the most complex piece of existing code to integrate with. Understanding exactly how the existing `isSwipeDirection`, `touchStartX/Y`, and velocity threshold logic works is the prerequisite to adding suggestion-aware routing. Read `InboxView.tsx` carefully before modifying it.

---

## Common Pitfalls

### Pitfall 1: Suggestion State Lives in the Wrong Place

**What goes wrong:** Developer puts `TriageSuggestion` objects into the SolidJS store's main `BinderState`, causing the entire app to re-render when any suggestion updates.
**Why it happens:** Easy to add fields to `BinderState` since Phase 4 already established the pattern. But `BinderState` is reconciled from worker messages — AI suggestions are pure main-thread ephemeral state.
**How to avoid:** Store suggestions in a module-level `createStore` or `createSignal` in `store.ts` that is NOT part of `BinderState`. Export a separate `triageSuggestions` signal. This way the store reconcile from workers does not touch suggestion state.
**Warning signs:** Every worker `STATE_UPDATE` clears or resets suggestion state; suggestions disappear when atoms are mutated.

### Pitfall 2: Swipe Direction Ambiguity After Adding Suggestion Layer

**What goes wrong:** When an AI suggestion is visible, the user tries to swipe to accept/dismiss but the gesture is misinterpreted as the existing skip/classify swipe.
**Why it happens:** InboxView's existing swipe handlers route ALL right-swipes to "open classify panel" and left-swipes to "skip." Adding suggestion-aware routing requires a flag check BEFORE the existing branch.
**How to avoid:** At the top of `handleTouchEnd` in InboxView, check `if (triageSuggestions.get(currentItem()?.id))` first. If a suggestion is present, route swipes to accept/dismiss. Only fall through to the existing skip/classify logic when no suggestion exists.
**Warning signs:** Accepting a suggestion opens the manual classify panel instead of applying the AI suggestion.

### Pitfall 3: Batch Triage Exhausts the AI Adapter

**What goes wrong:** Triggering triage on 15-20 inbox items simultaneously sends 20 concurrent requests to the cloud adapter, hitting rate limits or causing OOM in the browser LLM.
**Why it happens:** A naive `Promise.all(items.map(item => dispatchAI(...)))` fires all requests at once.
**How to avoid:** Process triage items sequentially (one at a time) or in small controlled batches (2-3 concurrent). Each completed suggestion updates the card immediately so the user sees progress. Sequential is simpler and avoids rate limits; use it first.
**Warning signs:** HTTP 429 (rate limit) errors from cloud adapter; browser LLM worker timing out or crashing.

### Pitfall 4: JSON Parse Failure Silently Drops Suggestions

**What goes wrong:** AI returns a response that isn't valid JSON (e.g., adds explanation text around the JSON block). `parseTriageResponse` returns null. The card never shows a suggestion. No error is surfaced.
**Why it happens:** Language models do not always respect "respond with ONLY JSON" instructions, especially SmolLM2 which has limited instruction following.
**How to avoid:** The `parseTriageResponse` regex approach (`responseText.match(/\{[\s\S]*\}/)`) handles most wrapping. Log parse failures to console in dev mode. If null is returned, set the suggestion status to 'error' so the card can show a retry option.
**Warning signs:** Suggestions never appear on cards despite AI completing successfully; no console errors.

### Pitfall 5: `aiFirstRunComplete` Defaults to `false` After Reload (from Phase 4)

**What goes wrong:** The guided setup wizard appears on every reload because `aiFirstRunComplete` defaults to `false` and the deferred Dexie persistence was not implemented.
**Why it happens:** Documented in Phase 4 STATE.md as a known issue: "AIGuidedSetup first-run trigger did not fire on reload — aiFirstRunComplete flag not persisted, defaults to complete; fix when Phase 5 adds Dexie settings persistence."
**How to avoid:** Phase 5 must implement `loadAISettings()` / `saveAISettings()` using the Dexie `config` table. The INIT worker handler loads persisted settings and sends them in the READY payload. The main thread initializes store state from the loaded values.
**Warning signs:** Guided setup wizard appears on every page load; AI toggle settings reset to defaults on reload.

### Pitfall 6: Orb Z-Index Conflicts with Existing Overlays

**What goes wrong:** The orb renders on top of CaptureOverlay, SearchOverlay, or CloudRequestPreview when those are open.
**Why it happens:** The orb has `position: fixed; z-index: 100` but overlays also use high z-indexes.
**How to avoid:** Inspect existing overlay z-indexes in `layout.css` before assigning the orb's z-index. The orb should hide (or scale down to a dot) when any overlay is open. Wire this to the `overlay` signal in `app.tsx`: pass `isOverlayOpen` prop to AIOrb and conditionally suppress the radial menu (the orb itself remains visible as a dot per CONTEXT.md).
**Warning signs:** Orb menu items are clickable through modal backdrops; orb covers overlay controls.

### Pitfall 7: Dexie Migration Required for `aiSourced` Atom Field Index

**What goes wrong:** Adding `aiSourced` to `BaseAtomFields` in TypeScript does not automatically add the index to IndexedDB. Dexie queries on `aiSourced` fail silently or throw.
**Why it happens:** Dexie's schema is defined in the `version(N).stores()` call, not from TypeScript types. TypeScript changes have no effect on the actual IndexedDB schema.
**How to avoid:** Add `migrations/v3.ts` with `version(3).stores({ atoms: '&id, type, status, sectionId, sectionItemId, updated_at, *links, *tags, context, aiSourced', ... }).upgrade(tx => { tx.table('atoms').toCollection().modify(a => { if (!a.aiSourced) a.aiSourced = false; }); })`. Follow the v2 migration pattern exactly.
**Warning signs:** `Dexie.InvalidArgumentError` on atoms table operations after adding the field; existing atoms missing the field entirely.

---

## Code Examples

Verified patterns from project source and official sources:

### Abort Mid-Stream Triage

```typescript
// src/ai/triage.ts
// Source: existing CloudAdapter (cloud.ts) already wires AbortController via request.signal

let triageAbortController: AbortController | null = null;

export async function triageInbox(
  inboxItems: InboxItem[],
  scores: Record<string, AtomScore>,
  entropyScore: EntropyScore | null,
  sectionItems: SectionItem[],
  onSuggestion: (suggestion: TriageSuggestion) => void,
  onError: (itemId: string, error: string) => void,
): Promise<void> {
  // Cancel any previous in-flight triage
  triageAbortController?.abort();
  triageAbortController = new AbortController();
  const signal = triageAbortController.signal;

  // Build section items list for prompt
  const sections = ... // resolve sectionId -> Section for each sectionItem
  const sectionList = sectionItems.map(si => ({
    id: si.id,
    name: si.name,
    sectionName: sections.find(s => s.id === si.sectionId)?.name ?? '',
  }));

  // Sequential processing — one item at a time to avoid rate limits
  for (const item of inboxItems) {
    if (signal.aborted) break; // user cancelled

    const prompt = buildTriagePrompt(item, scores[item.id], entropyScore, sectionList);
    const relatedIds = findRelatedAtoms(item.content + ' ' + item.title);

    try {
      const response = await dispatchAI({
        requestId: crypto.randomUUID(),
        prompt,
        maxTokens: 200, // short structured response
        signal,         // wired into CloudAdapter's stream.abort()
      });

      const suggestion = parseTriageResponse(item.id, response.text, relatedIds);
      onSuggestion(suggestion ?? { inboxItemId: item.id, status: 'error', ... });
    } catch (err) {
      if (!signal.aborted) {
        onError(item.id, err instanceof Error ? err.message : 'Unknown error');
      }
    }
  }
}

export function cancelTriage(): void {
  triageAbortController?.abort();
  triageAbortController = null;
}
```

### Persisting AI Settings via Dexie Config Table

```typescript
// src/storage/ai-settings.ts
// Source: existing classification-log.ts pattern (config table + writeQueue)

import { db } from './db';
import { writeQueue } from './write-queue';

const AI_SETTINGS_KEY = 'ai-settings';

export async function loadAISettings(): Promise<Partial<AISettings> | null> {
  const entry = await db.config.get(AI_SETTINGS_KEY);
  return entry ? (entry.value as AISettings) : null;
}

export function saveAISettings(settings: Partial<AISettings>): void {
  writeQueue.enqueue(async () => {
    const existing = await db.config.get(AI_SETTINGS_KEY);
    const merged = { ...(existing?.value ?? {}), ...settings };
    await db.config.put({ key: AI_SETTINGS_KEY, value: merged });
  });
}
```

### Extending the READY Response to Include AI Settings

```typescript
// src/worker/worker.ts — INIT handler extension
// Source: existing INIT handler which already loads savedFilters

case 'INIT': {
  // ... existing init ...
  const aiSettings = await loadAISettings(); // new

  self.postMessage({
    type: 'READY',
    payload: {
      version: '...',
      atoms, inboxItems, sections, sectionItems, savedFilters,
      aiSettings: aiSettings ?? null, // new field
    },
  });
  break;
}

// src/ui/signals/store.ts — READY handler extension
case 'READY':
  // ... existing reconcile calls ...
  if (response.payload.aiSettings) {
    const s = response.payload.aiSettings;
    if (s.aiEnabled !== undefined) setState('aiEnabled', s.aiEnabled);
    if (s.aiFirstRunComplete !== undefined) setState('aiFirstRunComplete', s.aiFirstRunComplete);
    // ... other fields ...
  }
  break;
```

### Dexie v3 Migration for aiSourced

```typescript
// src/storage/migrations/v3.ts
// Source: existing v2.ts migration pattern

export function applyV3Migration(db: BinderDB): void {
  db.version(3)
    .stores({
      atoms: '&id, type, status, sectionId, sectionItemId, updated_at, *links, *tags, context, aiSourced',
      inbox:        '&id, created_at',
      changelog:    '&id, atomId, timestamp, lamportClock',
      sections:     '&id, type',
      sectionItems: '&id, sectionId, name, archived',
      config:       '&key',
      savedFilters: '&id, name',
      interactions: '&id, type, ts',
    })
    .upgrade((tx) => {
      // Set aiSourced: false on all existing atoms (was undefined)
      return tx.table('atoms').toCollection().modify((atom) => {
        if (atom.aiSourced === undefined) atom.aiSourced = false;
      });
    });
}
```

### Accept AI Suggestion (applies via existing mutation pipeline)

```typescript
// Called when user swipes right on a card with an active suggestion
// Source: existing classifyItem() in InboxView.tsx

function acceptAISuggestion(itemId: string): void {
  const suggestion = triageSuggestions.get(itemId);
  if (!suggestion || suggestion.status !== 'complete') return;

  // Apply via existing mutation pipeline — same as manual classification
  sendCommand({
    type: 'CLASSIFY_INBOX_ITEM',
    payload: {
      id: itemId,
      type: suggestion.suggestedType,
      sectionItemId: suggestion.suggestedSectionItemId ?? undefined,
      aiSourced: true, // Phase 5: tag as AI-sourced in handler
    },
  });

  // Remove from suggestion Map (card will animate out via existing classify animation)
  setTriageSuggestions((prev) => { prev.delete(itemId); return new Map(prev); });
}
```

**Note:** The `CLASSIFY_INBOX_ITEM` command payload needs a new optional `aiSourced` field added to `messages.ts`, and `handleClassifyInboxItem` needs to pass `source: 'ai'` to `appendMutation()`.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Radial menus required complex SVG trigonometry | CSS nth-child transforms + fixed offsets handle 4-5 items cleanly | CSS3 transforms matured (~2018), now universally supported | No library needed; 20 lines of CSS |
| `conic-gradient` not animatable via CSS transitions | CSS custom property interpolation via `@property` allows animation | Chrome 85+ (2020) | Orb ring "opening" animation possible in pure CSS on modern browsers |
| Per-token streaming to UI (like ChatGPT) | Batch-complete per card (CONTEXT.md decision) | Phase 5 decision | Simpler state management; no partial-parse of streaming tokens per card |
| Transformers.js for classification | Anthropic Claude Haiku for quality cloud path | Phase 4 established two-tier | SmolLM2 for offline/fast; claude-haiku-4-5 for quality; both work through same adapter interface |

**Deprecated/outdated:**
- Parsing free-form AI text for type suggestions: The project already has `suggestTypeFromContent()` (keyword regex) and `suggestTypeFromPatterns()` (Jaccard + history). Phase 5 adds a third path: structured JSON from AI. The JSON approach is more reliable than parsing unstructured text.

---

## Open Questions

1. **InboxView card-by-card vs "all cards at once" for batch triage**
   - What we know: CONTEXT.md says "batch processing: when user taps 'Triage Inbox' on the orb, AI processes all inbox items and suggestions appear on every card simultaneously." InboxView currently shows ONE card at a time.
   - What's unclear: Does "appear on every card simultaneously" mean InboxView must switch to a list view during AI triage mode? Or does it mean each card gets its suggestion as the user swipes through them?
   - Recommendation: Preserve card-by-card UX. When the orb triggers batch triage, process all items in the background and cache all suggestions. As the user swipes through cards, each card already has its suggestion ready. "Simultaneously" refers to the background processing, not a UI layout change. This avoids a major InboxView restructuring.

2. **Handling SmolLM2 JSON output reliability**
   - What we know: SmolLM2-135M/360M are small models with limited instruction following. They may not reliably produce valid JSON.
   - What's unclear: Whether the `parseTriageResponse` regex+try/catch approach is sufficient for SmolLM2, or whether a more robust parsing strategy (e.g., few-shot examples in the prompt, or post-processing) is needed.
   - Recommendation: Start with the regex approach. Add dev-mode logging of raw responses to evaluate quality. If SmolLM2 reliability is poor, fall back to simple free-text parsing (extract the first atom type keyword found in the response). Cloud path (claude-haiku-4-5) should reliably produce JSON.

3. **Context-aware orb positioning per page**
   - What we know: CONTEXT.md says the orb "smoothly animates to different screen positions based on current page layout." The orb position is left to Claude's discretion.
   - What's unclear: Exact target positions for each page. The orb currently sits at bottom-right (like the FAB). On the inbox view, it might move to bottom-center. On the atom detail view, near the detail panel header.
   - Recommendation: Implement position as a CSS custom property `--orb-bottom` and `--orb-right` set by a SolidJS `createEffect` watching `state.activePage`. CSS `transition: bottom 0.3s, right 0.3s` handles the smooth animation. Start with bottom-right for all pages; refine per-page positions in UI polish iteration.

4. **`source: 'ai'` field in MutationLogEntry requires schema version bump**
   - What we know: `MutationLogEntrySchema` is a Zod schema; the `changelog` Dexie table is indexed by `id, atomId, timestamp, lamportClock` — not by `source`.
   - What's unclear: Whether adding an optional `source` field to the Zod schema requires a Dexie migration. It does NOT require a migration since the changelog table stores JSON blobs and the new field is optional (existing entries simply lack it). But if we want to query by `source: 'ai'`, an index is needed.
   - Recommendation: Add `source` as an optional field only (no Dexie index in Phase 5 since AIRV/AIGN phases may need it more). The badge lookup checks the atom's `aiSourced` boolean field (which IS indexed), not the changelog. Defer changelog `source` indexing to Phase 6 or 7 when it's actively queried.

---

## Sources

### Primary (HIGH confidence)
- Project source code: `src/ai/adapters/adapter.ts`, `src/ai/adapters/cloud.ts`, `src/ai/router.ts`, `src/ui/signals/store.ts`, `src/ui/views/InboxView.tsx`, `src/ui/components/AtomCard.tsx`, `src/storage/classification-log.ts`, `src/storage/changelog.ts`, `src/worker/handlers/inbox.ts`, `src/types/atoms.ts`, `src/types/changelog.ts`, `src/types/messages.ts`
- `https://platform.claude.com/docs/en/build-with-claude/streaming` — Anthropic streaming protocol, stream.abort() for cancellation, error recovery approaches
- `https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/clip-path` — clip-path polygon for radial menu segments
- `https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/gradient/conic-gradient` — conic-gradient for orb ring animation
- Project layout.css: existing @keyframes patterns (classifyFlyOut, celebratePulse, captureSlideUp, voicePulse, fab-capture) as CSS style reference

### Secondary (MEDIUM confidence)
- `https://github.com/mardisen/solid-swipe-card` — solid-swipe-card library exists but NOT used in this phase (project uses raw touch handlers consistently; adding a library would be inconsistent)
- `https://css-tricks.com/building-a-circular-navigation-with-css-clip-paths/` — CSS clip-path approach for circular navigation (verified technique)
- `https://solidjs-use.github.io/solidjs-use/core/useSwipe` — solidjs-use useSwipe exists but NOT used (same reason as solid-swipe-card)
- Phase 4 RESEARCH.md (project file) — Anthropic SDK streaming pattern already verified and implemented in CloudAdapter

### Tertiary (LOW confidence — flag for validation)
- SmolLM2 instruction-following reliability for JSON output: based on general knowledge of small model limitations; requires testing at implementation time
- Exact orb position coordinates per page: design decision requiring visual iteration; no research source

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all libraries already installed and wired in Phase 4
- Architecture: HIGH — directly follows existing project patterns (store extension, worker handler, CSS animations, Dexie migration); no novel patterns introduced
- Pitfalls: HIGH — derived from reading actual project code and known Phase 4 deferred issues documented in STATE.md
- AI response parsing: MEDIUM — JSON parsing strategy is standard; SmolLM2 reliability for structured output requires runtime testing
- Orb CSS animations: MEDIUM — CSS approach is standard; exact visual design (binder ring aesthetic) requires iteration

**Research date:** 2026-02-23
**Valid until:** 2026-04-23 (Anthropic SDK stable; SolidJS 1.x stable; CSS techniques are browser standards)
