# Phase 2: Compute Engine - Research

**Researched:** 2026-02-22
**Domain:** Rust/WASM priority scoring + staleness decay, entropy health indicator, cap enforcement UX, compression prompt review page
**Confidence:** HIGH (stack is verified from Phase 1; Rust patterns verified against official wasm-bindgen docs; SolidJS patterns verified against official docs)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Priority Score Display
- **Tier labels** (not numeric scores or color-only) — five tiers: Critical, High, Medium, Low, Someday
- **Atom type color + tier badge** — keep atom type as primary color identity, add a small tier icon+color badge alongside
- **Tier icons**: flame (Critical), arrow-up (High), dash (Medium), arrow-down (Low), clock (Someday) with tier-specific colors
- **Auto-sort by priority** within all views — highest priority always at top
- **Live updates** — priority tier changes immediately when underlying factors change (deadline, dependency completion, etc.)
- **Tasks and Events only** get priority tiers — Facts, Decisions, and Insights show staleness only (no priority scoring)
- **Importance**: hybrid approach — system infers default importance from link density and section type, user can override with a quick tap
- **Energy required**: included in v1 — three levels (Quick / Medium / Deep), inferred from content heuristics with user override
- **Priority pinning allowed** — user can pin an atom to a specific tier, overriding the computed score. Pinned items show a pin icon.

#### Staleness Visualization
- **Opacity fade** — stale atoms gradually become more transparent (100% fresh to ~60% at max staleness). Fresh items pop, stale ones recede.
- **14-day half-life** — moderate decay. Noticeable fade after two weeks without meaningful interaction.
- **Meaningful actions only** reset staleness — editing content, changing status, or adding/removing links. Viewing alone does NOT reset.
- **Link freshness boost** — atoms linked to active (non-stale) items decay slower. Rewards good linking behavior.
- **Pinning allowed** — user can pin atoms to prevent staleness decay entirely. No cap on pins.
- **Max staleness**: nothing automatic — fully faded atoms stay visible, appear in compression prompt candidates. Never auto-archived or auto-deleted.
- **Show staleness from day 1** — no hiding during onboarding. 30-day forgiveness means slower decay rate, not hidden decay.

#### Cap Enforcement UX
- **Soft warning at 80%**: status bar color shift only (inbox segment shifts green to yellow). Ambient, no modal, no banner, no badge.
- **Hard block at 100%**: modal dialog with triage. Shows inbox/task items as a list with quick-action buttons (classify, schedule, discard for inbox; complete, archive, merge for tasks). Modal is dismissable only after freeing at least one slot.
- **Same pattern for both caps** — inbox cap and open task cap use identical UX (status bar warning at 80%, modal resolution at 100%)
- **Configurable with guardrails** — users can adjust caps within bounds (inbox: 10-30, tasks: 15-50). Can tighten but not infinitely loosen.

#### Compression Prompts
- **Dedicated review page** — "Review" tab in the page tab strip. Shows all compression prompt candidates.
- **Card-by-card triage** — same Tinder-like pattern as inbox triage. One candidate at a time. Forces a decision per item.
- **Four actions**: Archive, Delete, Keep (resets staleness), Merge (combine with another atom)
- **Show specific reason** per card — "Stale: 45 days since last edit" or "Orphan: no links to active items". Helps user decide.
- **Candidates**: stale atoms (past max staleness threshold), zero-link atoms not recently created, semantically similar atoms (deferred to AI layer)

### Claude's Discretion
- Exact tier color palette (complementary to dark theme and atom type colors)
- Priority formula weight calibration (starting constants for deadline, importance, recency, dependencies, energy)
- Staleness decay curve shape (linear vs exponential within the 14-day half-life)
- Energy inference heuristic specifics (what content patterns map to Quick/Medium/Deep)
- Merge UX flow details (how to select target atom, what happens to links)
- Review page empty state when no candidates exist

### Deferred Ideas (OUT OF SCOPE)
- **AI-powered compression suggestions** — AI identifies semantically similar atoms for merge candidates. Requires AI orchestration layer. (Future phase — AI layer)
- **Energy inference via AI** — more sophisticated energy estimation from content analysis. Use simple heuristics for now. (Future phase — AI layer)
- **Scheduled decay pauses** — pause staleness decay during planned breaks. (Future phase — settings/preferences)
- **Per-section cap limits** — different task caps per section. (Future phase — advanced configuration)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ENTR-01 | Priority score computed dynamically: P = f(deadline, importance, recency, dependencies, energy) | Rust compute_scores() function with serde-wasm-bindgen batch return; formula weights in Standard Stack section |
| ENTR-02 | Priority scoring runs in Rust/WASM module in Web Worker (never on main thread) | Existing Worker bridge already owns WASM; compute_scores() added to BinderCore; called in worker.ts |
| ENTR-03 | Staleness decay reduces atom relevance scores over time unless touched, linked to active items, or pinned | Rust compute_staleness() with exponential decay formula; link-freshness boost; pinning bypass |
| ENTR-04 | Each atom displays visual staleness indicator | CSS opacity driven by staleness score in AtomCard; score flows from Worker STATE_UPDATE |
| ENTR-05 | Entropy health indicator (green/yellow/red) visible on every view | StatusBar already exists; add entropy segment with color-coded badge |
| ENTR-06 | Entropy score = f(open tasks count, stale item count, zero-link atom count, inbox length) | Rust compute_entropy() with weighted formula; returned with STATE_UPDATE |
| ENTR-07 | Link density tracked per atom — zero-link stale items are entropy candidates | Link density = atom.links.length; already available on Atom schema; no new storage needed |
| ENTR-08 | System surfaces compression prompt candidates: stale atoms, zero-link atoms | Rust filter_compression_candidates(); returned to UI via Worker response |
| ENTR-09 | Compression prompts offer archive, delete, keep options — user decides | ReviewView card-by-card triage; new Worker commands ARCHIVE_ATOM, DELETE_ATOM (UPDATE_ATOM already exists) |
| ENTR-10 | Entropy enforcement advisory-first: soft warnings before hard blocks, forgiving decay for new users (first 30 days) | 30-day onboarding multiplier on staleness formula; soft warning is CSS class only |
| CAPT-02 | Inbox has hard cap (configurable, default 20) — blocks new items when full | Cap stored in Dexie config table; checked in handleCreateInboxItem before insert |
| CAPT-03 | When inbox is full, system presents resolution UI | CapEnforcementModal component; dispatched when create rejected with CAP_EXCEEDED error |
| CAPT-04 | Inbox items must be classified before becoming atoms | Already enforced by Phase 1 CLASSIFY_INBOX_ITEM handler |
| CAPT-05 | Open tasks have hard cap (configurable, default 30) | Cap checked in handleCreateAtom when type=task and status=open |
| CAPT-06 | Soft warning at 80% of inbox and task caps; hard block at 100% | capStatus derived signal in store; StatusBar reads it for color; modal fires at 100% |
</phase_requirements>

---

## Summary

Phase 2 extends the existing Rust/WASM compute pipeline (already scaffolded in Phase 1) with real math: priority scoring, staleness decay, entropy scoring, and compression candidate filtering. The existing Worker bridge, message protocol, and SolidJS store are the integration points — this phase expands them rather than replacing them.

The key architectural decision is **batch computation**: when the Worker sends a STATE_UPDATE, it also runs all WASM scoring functions in one pass and attaches computed scores to the payload. This means the UI never calls WASM and never does math — it just renders what the Worker sends. The store grows a `scores` map and a `capStatus` derived signal; AtomCard reads opacity and tier badge from it.

The cap enforcement UX has two levels: a CSS class change on the StatusBar inbox segment at 80% (pure UI, no dialog), and a CapEnforcementModal at 100% that uses SolidJS `<Portal>` to render over everything else. The modal blocks dismissal until one slot is freed, enforcing the "system helping you" tone from the CONTEXT.md.

**Primary recommendation:** Extend BinderCore with `compute_scores(atoms_json: JsValue) -> JsValue` using serde-wasm-bindgen for type-safe batch in/out. Wire it into `flushAndSendState()` in worker.ts so scores are always fresh. Keep all math in Rust; keep all rendering in SolidJS.

---

## Standard Stack

### Core (Existing — carry forward from Phase 1)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| SolidJS | 1.9.11 | Reactive UI — `createMemo` for derived score display | Already installed; fine-grained reactivity avoids re-render waste |
| Rust/WASM | wasm-bindgen 0.2.111 | Priority scoring, staleness decay, entropy math | Off-main-thread compute; panic=abort already configured |
| serde + serde-wasm-bindgen | serde 1.x, s-w-b 0.6.x | Type-safe data exchange between JS and Rust | Already in Cargo.toml; smaller than JSON, faster than manual JsValue construction |
| Dexie.js | 4.3.0 | Cap values stored in config table; atoms queried for scoring | Already installed; config table exists |
| Zod 4.3 (via 'zod/v4') | 4.3.6 | Validate cap config on read/write | Already installed; import path already established |

### New for Phase 2
| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| (none) | — | No new npm packages required | All UI can be built with SolidJS primitives (`createMemo`, `<Portal>`, `<Show>`, `<For>`); no animation library needed for opacity; no dialog library needed |

**No new dependencies.** All Phase 2 functionality uses libraries already installed. The cap modal uses native SolidJS `<Portal>`. Staleness opacity uses inline `style` binding. Tier badges use SVG icons inline or CSS.

**Installation:** Nothing new to install. WASM rebuild required after adding Rust functions:
```bash
pnpm build:wasm
```

---

## Architecture Patterns

### Recommended Project Structure (additions to existing src/)
```
src/
├── types/
│   ├── atoms.ts              # EXTEND: add PriorityTier, EnergyLevel, ComputedScores types
│   ├── messages.ts           # EXTEND: add SCORES_UPDATE response, CAP_EXCEEDED error type, new commands
│   └── config.ts             # NEW: CapConfig type (inbox cap, task cap, user config)
├── worker/
│   ├── worker.ts             # EXTEND: call compute in flushAndSendState; handle cap checks
│   └── handlers/
│       ├── atoms.ts          # EXTEND: check task cap before create
│       ├── inbox.ts          # EXTEND: check inbox cap before create; return CAP_EXCEEDED
│       └── config.ts         # NEW: read/write cap config from Dexie
├── ui/
│   ├── signals/
│   │   └── store.ts          # EXTEND: add scores map, capStatus derived signal, entropyScore
│   ├── components/
│   │   ├── AtomCard.tsx      # EXTEND: read opacity from staleness score, show tier badge
│   │   ├── PriorityBadge.tsx # NEW: tier icon + color badge component
│   │   └── CapEnforcementModal.tsx  # NEW: hard-block modal with triage list
│   ├── layout/
│   │   └── StatusBar.tsx     # EXTEND: add entropy health badge, inbox cap color, task cap color
│   └── views/
│       └── ReviewView.tsx    # NEW: Review tab — compression prompt candidates, card-by-card triage
└── wasm/
    └── core/
        └── src/
            └── lib.rs        # EXTEND: add compute_scores(), compute_entropy(), filter_compression_candidates()
```

### Pattern 1: Batch WASM Scoring on Every State Update

**What:** Every time the Worker sends STATE_UPDATE to the UI, it first runs all WASM scoring functions and attaches results to the payload.

**When to use:** Always — scores must be fresh immediately after any mutation.

**How it works:**
1. Any mutation handler calls `flushAndSendState()` (existing pattern).
2. `flushAndSendState()` calls `core.compute_scores(atoms_json)` before building the response.
3. Worker sends `STATE_UPDATE` with both `atoms` AND `scores`.
4. SolidJS store reconciles both; `AtomCard` reads score from the map.

```typescript
// worker.ts — extended flushAndSendState()
async function flushAndSendState(): Promise<void> {
  await writeQueue.flushImmediate();
  const state = await getFullState();
  const capConfig = await getCapConfig(); // reads Dexie config table

  // Run WASM scoring — batch all atoms in one call
  const atomsJson = state.atoms; // already JS objects from Dexie
  const scoresJson = core!.compute_scores(atomsJson); // serde-wasm-bindgen in/out
  const entropyScore = core!.compute_entropy(
    state.atoms,
    state.inboxItems.length,
    capConfig.inboxCap,
    capConfig.taskCap,
  );
  const compressionCandidates = core!.filter_compression_candidates(state.atoms);

  const response: Response = {
    type: 'STATE_UPDATE',
    payload: {
      ...state,
      scores: scoresJson,
      entropyScore,
      compressionCandidates,
      capConfig,
    },
  };
  self.postMessage(response);
}
```

**Source:** Verified pattern — wasm-bindgen serde-wasm-bindgen docs (https://rustwasm.github.io/docs/wasm-bindgen/reference/arbitrary-data-with-serde.html); existing worker.ts structure.

### Pattern 2: Rust Scoring Functions via serde-wasm-bindgen

**What:** Each compute function takes a `JsValue` (deserialized from JS objects), does math, and returns a `JsValue` (serialized back).

**Key constraint:** The Cargo.toml already has `panic = "abort"` in release profile. This means `std::panic::catch_unwind` does NOT work on wasm32-unknown-unknown with panic=abort. Instead, validate inputs strictly in Rust and return `Result<JsValue, JsValue>` to propagate errors to JS as exceptions.

```rust
// wasm/core/src/lib.rs — additions

use serde::{Serialize, Deserialize};
use wasm_bindgen::prelude::*;

/// Priority tier (5 levels, matches CONTEXT.md)
#[derive(Serialize, Deserialize, Clone, PartialEq)]
pub enum PriorityTier {
    Critical,
    High,
    Medium,
    Low,
    Someday,
}

/// Energy level (3 levels)
#[derive(Serialize, Deserialize, Clone, PartialEq)]
pub enum EnergyLevel {
    Quick,
    Medium,
    Deep,
}

/// Input atom data for scoring (subset of full Atom)
#[derive(Deserialize)]
pub struct AtomInput {
    pub id: String,
    #[serde(rename = "type")]
    pub atom_type: String,
    pub updated_at: f64,       // Unix ms
    pub created_at: f64,       // Unix ms
    pub status: String,
    pub links: Vec<serde_json::Value>,
    pub due_date: Option<f64>, // Unix ms (Tasks/Events)
    pub pinned_tier: Option<String>,  // Override tier
    pub pinned_staleness: Option<bool>, // Prevent decay
    pub importance: Option<f64>,  // 0.0-1.0
    pub energy: Option<String>,   // "Quick"/"Medium"/"Deep"
}

/// Per-atom computed scores returned to JS
#[derive(Serialize)]
pub struct AtomScore {
    pub id: String,
    pub staleness: f64,        // 0.0 (fresh) to 1.0 (fully stale)
    pub priority_tier: Option<PriorityTier>,  // None for fact/decision/insight
    pub priority_score: f64,   // Raw numeric for sort ordering
    pub energy: EnergyLevel,
    pub opacity: f64,          // 0.6 to 1.0 (ready for CSS)
}

#[wasm_bindgen]
impl BinderCore {
    /// Batch-compute scores for all atoms.
    /// Input: JS array of atom objects.
    /// Output: JS object { atomId: AtomScore }
    pub fn compute_scores(&self, atoms_js: JsValue) -> Result<JsValue, JsValue> {
        let atoms: Vec<AtomInput> = serde_wasm_bindgen::from_value(atoms_js)
            .map_err(|e| JsValue::from_str(&e.to_string()))?;

        let now_ms = js_sys::Date::now(); // current time in WASM
        let mut scores: std::collections::HashMap<String, AtomScore> =
            std::collections::HashMap::new();

        for atom in &atoms {
            let score = compute_atom_score(atom, now_ms, &atoms);
            scores.insert(atom.id.clone(), score);
        }

        serde_wasm_bindgen::to_value(&scores)
            .map_err(|e| JsValue::from_str(&e.to_string()))
    }

    /// Compute system entropy score (0.0-1.0, higher = worse health)
    pub fn compute_entropy(
        &self,
        atoms_js: JsValue,
        inbox_count: u32,
        inbox_cap: u32,
        task_cap: u32,
    ) -> Result<JsValue, JsValue> {
        // ... entropy formula
    }

    /// Filter atoms into compression prompt candidates
    pub fn filter_compression_candidates(&self, atoms_js: JsValue) -> Result<JsValue, JsValue> {
        // ... candidate filter
    }
}
```

**Note on js_sys:** Use `js_sys::Date::now()` inside WASM to get current time. Add `js-sys` to Cargo.toml (already present).

**Source:** wasm-bindgen guide (https://rustwasm.github.io/docs/wasm-bindgen/print.html), serde-wasm-bindgen docs (https://docs.rs/serde-wasm-bindgen).

### Pattern 3: Priority Scoring Formula

**Recommended formula** (Claude's Discretion — calibrate after real usage):

```
P_score = w_deadline * deadline_urgency(now, due_date)
        + w_importance * importance
        + w_recency * recency_boost(now, updated_at)
        + w_dependencies * dependency_urgency(links, scores)
        + w_energy * energy_penalty(energy_level)
```

**Starting weights:**
```
w_deadline     = 0.40  // deadline is king
w_importance   = 0.25  // user-set or link-density-inferred
w_recency      = 0.15  // recently touched atoms are more relevant
w_dependencies = 0.15  // atoms blocking high-priority items rise
w_energy       = 0.05  // Quick tasks get small boost
```

**deadline_urgency formula (exponential approach):**
```rust
fn deadline_urgency(now_ms: f64, due_date_ms: f64) -> f64 {
    let days_remaining = (due_date_ms - now_ms) / 86_400_000.0;
    if days_remaining < 0.0 { return 1.0; }  // Overdue → max urgency
    if days_remaining > 30.0 { return 0.0; } // Far future → no urgency
    // Exponential curve: urgency rises sharply in final 7 days
    1.0 - (days_remaining / 30.0).powf(0.5)
}
```

**Tier thresholds (map P_score to tier):**
```rust
fn score_to_tier(score: f64) -> PriorityTier {
    match score {
        s if s >= 0.80 => PriorityTier::Critical,
        s if s >= 0.60 => PriorityTier::High,
        s if s >= 0.40 => PriorityTier::Medium,
        s if s >= 0.20 => PriorityTier::Low,
        _ => PriorityTier::Someday,
    }
}
```

**Confidence:** MEDIUM — formula structure is well-established (RICE, WSJF, Eisenhower). Starting weights are educated guesses; real calibration requires usage data. Source: Morgen Priority Factor article (https://www.morgen.so/blog-posts/rethinking-task-prioritization-introducing-the-morgen-priority-factor).

### Pattern 4: Staleness Decay Formula

**Exponential decay with 14-day half-life** (CONTEXT.md decision):

```rust
const HALF_LIFE_MS: f64 = 14.0 * 24.0 * 60.0 * 60.0 * 1000.0; // 14 days in ms
const ONBOARDING_DAYS: f64 = 30.0;

fn compute_staleness(atom: &AtomInput, now_ms: f64, linked_to_active: bool) -> f64 {
    if atom.pinned_staleness.unwrap_or(false) {
        return 0.0; // Pinned — never stale
    }

    let age_ms = now_ms - atom.updated_at;

    // 30-day onboarding forgiveness: slower decay for new users
    // (ENTR-10 requirement: forgiving decay for first 30 days of ATOM life)
    let account_age_days = (now_ms - atom.created_at) / 86_400_000.0;
    let half_life = if account_age_days < ONBOARDING_DAYS {
        HALF_LIFE_MS * 2.0 // Double half-life during onboarding
    } else {
        HALF_LIFE_MS
    };

    // Link freshness boost: atoms linked to active items decay 50% slower
    let effective_half_life = if linked_to_active {
        half_life * 1.5
    } else {
        half_life
    };

    // Exponential decay: S(t) = 1 - 2^(-t/half_life)
    // S = 0.0 when fresh, approaches 1.0 as age → ∞
    let staleness = 1.0 - 2.0_f64.powf(-age_ms / effective_half_life);
    staleness.min(1.0).max(0.0)
}

fn staleness_to_opacity(staleness: f64) -> f64 {
    // Maps 0.0 (fresh) → 1.0 opacity, 1.0 (stale) → 0.6 opacity
    1.0 - staleness * 0.4
}
```

**Source:** Standard exponential decay formula — Wikipedia Half-life (https://en.wikipedia.org/wiki/Half-life). Applied to staleness per CONTEXT.md half-life decision.

### Pattern 5: Entropy Score Formula

```rust
#[derive(Serialize)]
pub struct EntropyScore {
    pub score: f64,        // 0.0 (healthy) to 1.0 (critical)
    pub level: String,     // "green" | "yellow" | "red"
    pub open_tasks: u32,
    pub stale_count: u32,
    pub zero_link_count: u32,
    pub inbox_count: u32,
}

fn compute_entropy_score(
    open_tasks: u32,
    stale_count: u32,
    zero_link_count: u32,
    inbox_count: u32,
    task_cap: u32,
    inbox_cap: u32,
    total_atoms: u32,
) -> EntropyScore {
    // Normalized ratios (0.0 = healthy, 1.0 = at limit)
    let task_ratio = (open_tasks as f64) / (task_cap as f64).max(1.0);
    let inbox_ratio = (inbox_count as f64) / (inbox_cap as f64).max(1.0);
    let stale_ratio = (stale_count as f64) / (total_atoms as f64).max(1.0);
    let orphan_ratio = (zero_link_count as f64) / (total_atoms as f64).max(1.0);

    // Weighted entropy (task + inbox pressure matter most)
    let score = task_ratio * 0.35
              + inbox_ratio * 0.35
              + stale_ratio * 0.20
              + orphan_ratio * 0.10;

    let level = match score {
        s if s < 0.5 => "green",
        s if s < 0.75 => "yellow",
        _ => "red",
    };

    EntropyScore {
        score: score.min(1.0),
        level: level.to_string(),
        open_tasks,
        stale_count,
        zero_link_count,
        inbox_count,
    }
}
```

### Pattern 6: Cap Enforcement in Worker Handlers

**Cap check must happen BEFORE the write, inside the Worker handler:**

```typescript
// worker/handlers/inbox.ts — extended
export async function handleCreateInboxItem(
  payload: { content: string; title?: string },
  capConfig: CapConfig,
): Promise<void | 'CAP_EXCEEDED'> {
  const count = await db.inbox.count();
  if (count >= capConfig.inboxCap) {
    return 'CAP_EXCEEDED'; // Worker returns this, sends CAP_EXCEEDED response
  }
  // ... existing create logic
}
```

```typescript
// worker.ts — in CREATE_INBOX_ITEM case
case 'CREATE_INBOX_ITEM': {
  const capConfig = await getCapConfig();
  const result = await handleCreateInboxItem(msg.payload, capConfig);
  if (result === 'CAP_EXCEEDED') {
    const response: Response = {
      type: 'CAP_EXCEEDED',
      payload: { capType: 'inbox', cap: capConfig.inboxCap },
    };
    self.postMessage(response);
    break;
  }
  await flushAndSendState();
  break;
}
```

### Pattern 7: SolidJS Store Extension for Scores

```typescript
// store.ts — extended BinderState
export interface AtomScore {
  staleness: number;     // 0.0-1.0
  priorityTier: PriorityTier | null;  // null for fact/decision/insight
  priorityScore: number; // raw numeric for sort
  energy: EnergyLevel;
  opacity: number;       // 0.6-1.0
}

export interface CapConfig {
  inboxCap: number;    // default 20
  taskCap: number;     // default 30
}

export interface BinderState {
  // ... existing fields
  scores: Record<string, AtomScore>;  // atomId -> computed score
  entropyScore: EntropyScore | null;
  compressionCandidates: CompressionCandidate[];
  capConfig: CapConfig;
  capExceeded: 'inbox' | 'task' | null; // triggers modal
}

// Derived signal for cap status (drives StatusBar color)
export const inboxCapStatus = createMemo((): 'ok' | 'warning' | 'full' => {
  const count = state.inboxItems.length;
  const cap = state.capConfig.inboxCap;
  if (count >= cap) return 'full';
  if (count >= cap * 0.8) return 'warning';
  return 'ok';
});

export const taskCapStatus = createMemo((): 'ok' | 'warning' | 'full' => {
  const openTasks = state.atoms.filter(
    (a) => a.type === 'task' && (a.status === 'open' || a.status === 'in-progress')
  ).length;
  const cap = state.capConfig.taskCap;
  if (openTasks >= cap) return 'full';
  if (openTasks >= cap * 0.8) return 'warning';
  return 'ok';
});
```

**Source:** SolidJS createMemo docs (https://docs.solidjs.com/reference/basic-reactivity/create-memo). Verified — memos cache results until dependencies change; safe to call multiple times without re-computation.

### Pattern 8: CapEnforcementModal with Portal

```typescript
// ui/components/CapEnforcementModal.tsx
import { Show, For } from 'solid-js';
import { Portal } from 'solid-js/web';
import { state, sendCommand } from '../signals/store';

export function CapEnforcementModal() {
  // Only render when cap exceeded
  return (
    <Show when={state.capExceeded !== null}>
      <Portal>
        <div class="cap-modal-overlay">
          <div class="cap-modal">
            <h2 class="cap-modal-title">
              {state.capExceeded === 'inbox' ? 'Inbox Full' : 'Task List Full'}
            </h2>
            <p class="cap-modal-message">
              Free at least one slot to continue.
            </p>
            {/* List items with quick-action buttons */}
            <div class="cap-modal-list">
              <For each={getCapItems()}>
                {(item) => (
                  <div class="cap-modal-item">
                    <span>{item.title || item.content.slice(0, 50)}</span>
                    <div class="cap-modal-actions">
                      {/* Actions vary by cap type */}
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
```

**Key:** `<Portal>` renders into `document.body`, bypassing CSS stacking context. No z-index fights. Modal is NOT dismissable (no X button, no backdrop click) until at least one slot is freed — code enforces this by checking count before showing close option.

**Source:** SolidJS Portal docs (https://docs.solidjs.com/reference/components/portal). Verified API: `mount` prop defaults to `document.body`.

### Pattern 9: AtomCard Staleness and Priority Badge

```typescript
// ui/components/AtomCard.tsx — additions
// Read staleness opacity and tier from store scores map
const atomScore = () => state.scores[props.atom.id];
const opacity = () => atomScore()?.opacity ?? 1.0;
const tier = () => atomScore()?.priorityTier ?? null;
const showTier = () => props.atom.type === 'task' || props.atom.type === 'event';

// In JSX: apply opacity via inline style
<div
  class="atom-card"
  style={{
    // ... existing transform/background
    opacity: String(opacity()),
    // ...
  }}
>
  {/* Existing content */}
  <Show when={showTier() && tier()}>
    <PriorityBadge tier={tier()!} />
  </Show>
</div>
```

**Important:** Opacity is applied at the card level, not on individual text elements. This keeps stale cards readable at 60% while visually receding. CSS handles the transition with `transition: opacity 0.5s ease`.

### Pattern 10: ReviewView (Compression Prompts)

**Same Tinder-card-by-card pattern as InboxView** (already proven in Phase 1):

```typescript
// ui/views/ReviewView.tsx
// Mirrors InboxView structure: one candidate at a time
// state.compressionCandidates is the data source
// Actions: Archive (UPDATE_ATOM status=archived), Delete (DELETE_ATOM),
//          Keep (UPDATE_ATOM updated_at=now to reset staleness),
//          Merge (show target search, then MERGE_ATOMS command)
// Show reason string per card: "Stale: 45 days" / "Orphan: no links"
```

**Review tab integration:** Add 'review' to PageTabStrip static tabs. Add `<Match when={state.activePage === 'review'}>` in MainPane.

### Anti-Patterns to Avoid

- **Scoring in UI components:** Never compute staleness or priority in a SolidJS component. All math must happen in the Rust WASM module inside the Worker. UI is display-only.
- **Per-atom WASM calls:** Never call `core.compute_score(atom_id)` per atom on a loop. Always batch: `core.compute_scores(all_atoms)`. One WASM boundary crossing per state update.
- **Calling Date.now() in Rust without js-sys:** `std::time` is not available in wasm32-unknown-unknown. Use `js_sys::Date::now()` (already a dependency). Do NOT use `web_sys::Performance` — it adds unnecessary complexity.
- **catch_unwind in WASM with panic=abort:** The existing Cargo.toml has `panic = "abort"`. `std::panic::catch_unwind` has no effect with this profile (verified: https://users.rust-lang.org/t/catch-panic-in-wasm/57569). Use `Result<JsValue, JsValue>` for error propagation instead.
- **Destructuring store state:** Already documented as critical in Phase 1. `state.scores[id]` not `const { scores } = state`.
- **Storing computed scores in Dexie:** Scores are pure functions of existing data. Never persist them. Recompute on every state update. Dexie is source of truth; scores are derived.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Modal rendering above everything | Custom z-index stacking | SolidJS `<Portal>` | Avoids CSS stacking context wars; built into SolidJS |
| Math functions in JS | JS priority/staleness math | Rust in WASM | Consistent results, performance headroom for growth, already scaffolded |
| Reactive derived state | useEffect + setState pattern | `createMemo` in SolidJS | Memos cache results, track dependencies automatically, prevent re-render loops |
| Cap value persistence | Custom storage wrapper | Dexie config table (already exists) | Already used for classification log; consistent pattern |
| Date arithmetic | Custom date math | `js_sys::Date::now()` in WASM | No std::time in wasm32-unknown-unknown; js-sys already in Cargo.toml |
| Tinder-card UI | New interaction pattern | Mirror existing InboxView | Same swipe mechanics already proven; ReviewView reuses the pattern |

**Key insight:** Phase 2 is extension, not invention. Every new piece of code either adds to existing modules (worker.ts, store.ts, AtomCard.tsx) or mirrors an already-proven pattern (ReviewView mirrors InboxView, CapModal uses Portal).

---

## Common Pitfalls

### Pitfall 1: WASM Boundary Crossing Per-Atom
**What goes wrong:** Calling `core.compute_score(atomId)` inside a `<For>` loop over 100 atoms makes 100 WASM crossings per render cycle. Performance degrades noticeably above ~50 atoms.
**Why it happens:** Treating WASM like a normal function; not accounting for serialization overhead.
**How to avoid:** Batch ALL atoms in one call: `core.compute_scores(allAtoms)` → returns a `{id: score}` map. One crossing per state update, not per atom.
**Warning signs:** Frame drops when scrolling a long atom list.

### Pitfall 2: Stale Closure Over Scores in SolidJS
**What goes wrong:** `const { scores } = state` in a component captures a frozen snapshot. Later score updates don't propagate.
**Why it happens:** Destructuring breaks SolidJS's proxy-based reactivity tracking.
**How to avoid:** Always access `state.scores[atomId]` — reads through the reactive proxy. Never destructure store state.
**Warning signs:** Score badges don't update after an atom is edited.

### Pitfall 3: `panic = "abort"` Kills the Worker
**What goes wrong:** A Rust function panics (e.g., unwrap on bad input). With `panic = "abort"`, the WASM module terminates and the entire Worker process dies. No recovery.
**Why it happens:** `panic = "abort"` is already in Cargo.toml release profile (correct for code size); but panics become fatal.
**How to avoid:** NEVER use `.unwrap()` in Rust WASM entry points. Use `serde_wasm_bindgen::from_value(val).map_err(...)` and return `Result<JsValue, JsValue>`. All `?` propagates to the JS boundary as an exception, which the Worker's `try/catch` in `self.onmessage` catches and converts to an `ERROR` response.
**Warning signs:** Worker stops responding; console shows "RuntimeError: unreachable" from WASM.

### Pitfall 4: Cap Check Race Condition
**What goes wrong:** Two rapid `CREATE_INBOX_ITEM` commands both read count = 19 (one below cap of 20), both insert, result is 21 items.
**Why it happens:** The write queue debounces; the cap check happens before the debounced write completes.
**How to avoid:** Cap check must use `db.inbox.count()` AFTER `writeQueue.flushImmediate()`, or use Dexie transactions to make check + write atomic. Simplest fix: `await writeQueue.flushImmediate()` at the start of the cap check handler, then read the count.
**Warning signs:** Inbox exceeds configured cap without triggering the block modal.

### Pitfall 5: f64 Precision in Staleness Decay
**What goes wrong:** Using integer milliseconds without f64 causes precision loss in the decay exponent for very fresh atoms.
**Why it happens:** `(age_ms / half_life_ms)` with large integers loses significance.
**How to avoid:** Use `f64` throughout the Rust scoring functions. All timestamps come from JS as f64 (JavaScript numbers are IEEE 754 double). No integer truncation.
**Warning signs:** Fresh atoms (< 1 hour old) incorrectly show non-zero staleness.

### Pitfall 6: Dexie Config Table Key Collision
**What goes wrong:** Cap config stored as `{ key: 'capConfig', value: {...} }` in the config table, but classification log is already stored there. Key must be distinct.
**Why it happens:** Config table is a generic key-value store — easy to accidentally use the same key.
**How to avoid:** Use explicit key constants: `CAP_CONFIG_KEY = 'cap-config'`, `CLASSIFICATION_LOG_KEY = 'classification-log'`. Define as constants in `src/types/config.ts`.
**Warning signs:** Cap config reads return classification log data or vice versa.

### Pitfall 7: StatusBar Segment Color Without Re-render
**What goes wrong:** StatusBar reads `state.inboxItems.length` but the inbox segment color is derived from cap percentage. If cap changes (user reconfigures) without items changing, color won't update.
**Why it happens:** Derived computation not wrapped in `createMemo`.
**How to avoid:** Wrap cap status derivation in `createMemo(() => {...})` that reads BOTH `state.inboxItems.length` AND `state.capConfig.inboxCap`. Both dependencies trigger re-computation.
**Warning signs:** Status bar shows wrong color after user changes cap settings.

### Pitfall 8: Review Tab Missing from PageTabStrip
**What goes wrong:** ReviewView is implemented but never accessible because the tab wasn't added to PageTabStrip's static tabs array.
**Why it happens:** UI view and routing are separate from tab registration.
**How to avoid:** Add `{ id: 'review', label: 'Review' }` to `staticTabs` in PageTabStrip.tsx AND add a `<Match>` case in MainPane.tsx. Both changes required — test by clicking the tab.

---

## Code Examples

### Rust: Full compute_atom_score (reference implementation)
```rust
// Source: custom — based on wasm-bindgen serde pattern
// https://rustwasm.github.io/docs/wasm-bindgen/reference/arbitrary-data-with-serde.html

fn compute_atom_score(atom: &AtomInput, now_ms: f64, all_atoms: &[AtomInput]) -> AtomScore {
    let staleness = compute_staleness(atom, now_ms, all_atoms);
    let opacity = staleness_to_opacity(staleness);

    // Only Tasks and Events get priority tiers
    let (priority_score, priority_tier) = if atom.atom_type == "task" || atom.atom_type == "event" {
        if let Some(pinned) = &atom.pinned_tier {
            // Pinned tier: use fixed score based on tier
            let score = tier_name_to_score(pinned);
            (score, Some(score_to_tier(score)))
        } else {
            let score = compute_priority_score(atom, now_ms, all_atoms);
            (score, Some(score_to_tier(score)))
        }
    } else {
        (0.0, None)
    };

    let energy = infer_energy(atom);

    AtomScore {
        id: atom.id.clone(),
        staleness,
        priority_tier,
        priority_score,
        energy,
        opacity,
    }
}
```

### TypeScript: Reading score from store in AtomCard
```typescript
// Source: SolidJS reactivity docs — https://docs.solidjs.com/reference/basic-reactivity/create-memo

// CORRECT: read through reactive proxy
const atomScore = () => state.scores[props.atom.id];
const opacity = () => atomScore()?.opacity ?? 1.0;

// WRONG: destructure loses reactivity
// const { scores } = state;  // <-- never do this
```

### TypeScript: Entropy badge in StatusBar
```typescript
// Source: SolidJS createMemo pattern
const entropyLevel = createMemo(() => state.entropyScore?.level ?? 'green');

// In JSX:
<div class={`entropy-badge entropy-${entropyLevel()}`}>
  <span class="entropy-icon" />
  <span class="entropy-label">
    {entropyLevel() === 'green' ? 'Healthy' :
     entropyLevel() === 'yellow' ? 'Warning' : 'Critical'}
  </span>
</div>
```

### TypeScript: Cap check with flush-first pattern
```typescript
// Source: existing write-queue pattern in worker.ts
export async function handleCreateInboxItemWithCapCheck(
  payload: { content: string; title?: string },
): Promise<'ok' | 'cap_exceeded'> {
  // Flush any pending writes first so count is accurate
  await writeQueue.flushImmediate();
  const capConfig = await getCapConfig();
  const count = await db.inbox.count();
  if (count >= capConfig.inboxCap) {
    return 'cap_exceeded';
  }
  // ... proceed with existing create logic
  return 'ok';
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| wasm-pack (archived July 2025) | cargo → wasm-bindgen-cli → wasm-opt (three-step) | July 2025 | Already adopted in Phase 1; no change needed |
| JSON for WASM data exchange | serde-wasm-bindgen direct serialization | 2023+ | Already in Cargo.toml; use consistently in Phase 2 |
| catch_unwind for WASM error recovery | Result<JsValue, JsValue> returns | Ongoing limitation | panic=abort makes catch_unwind no-op; use Result pattern |
| Per-component data derivation (React pattern) | createMemo at store level, read in components | SolidJS core | Prevents cascading re-renders; correct pattern for scored data |

**Deprecated/outdated:**
- `std::panic::catch_unwind` in wasm32 with panic=abort: No-op. Use Result<> returns.
- wasm-pack: Archived. Three-step pipeline is the current approach.
- Numeric score display: User decided tier labels only. Don't show raw floats.

---

## Open Questions

1. **Merge UX flow (Claude's Discretion)**
   - What we know: Four actions on ReviewView — Archive, Delete, Keep, Merge. Merge needs a target atom selector.
   - What's unclear: How does Merge work mechanically? Does the source atom's links get transferred to target? Does source get deleted?
   - Recommendation: Implement Merge as: show a search-by-title UI to pick target atom, then: transfer links from source to target (de-duplicate), delete source atom. New Worker command `MERGE_ATOMS` with `{ sourceId, targetId }`. This can be a separate task in Plan 02-02.

2. **Priority formula calibration**
   - What we know: Starting weights are guesses. Confidence MEDIUM.
   - What's unclear: Whether deadline urgency curve feels right in practice. Whether importance inference from link density accurately reflects user intent.
   - Recommendation: Ship with documented constants, plan a config screen in a future phase. Log actual tier distributions so we have data for calibration.

3. **Energy inference heuristics (Claude's Discretion)**
   - What we know: Three levels (Quick/Medium/Deep). User can override. Need content-based default.
   - Recommendation:
     - Quick: content length < 50 chars, or contains "quick", "5 min", "brief", "fast"
     - Deep: content length > 200 chars, or contains "research", "write", "design", "plan", "review all"
     - Medium: everything else
   - Confidence: LOW — needs user validation.

4. **Periodic re-scoring without user interaction**
   - What we know: Staleness changes over time even with no user actions. Currently scores only refresh on mutation.
   - What's unclear: If user has the app open but doesn't interact, staleness won't visually update.
   - Recommendation: Add a `setInterval` in the Worker that fires `RECOMPUTE_SCORES` every 10 minutes (no DB reads, just rerun scoring on cached atoms). Low priority — staleness day-resolution means minute-precision doesn't matter in practice.

---

## Sources

### Primary (HIGH confidence)
- wasm-bindgen serde guide (https://rustwasm.github.io/docs/wasm-bindgen/reference/arbitrary-data-with-serde.html) — serde-wasm-bindgen usage patterns
- SolidJS createMemo docs (https://docs.solidjs.com/reference/basic-reactivity/create-memo) — memo caching behavior, equality options
- SolidJS Portal docs (https://docs.solidjs.com/reference/components/portal) — modal rendering API
- serde-wasm-bindgen crate docs (https://docs.rs/serde-wasm-bindgen) — serializer options
- Phase 1 codebase (C:/Users/patri/GSD/BinderOS/src/) — existing patterns, types, and integration points

### Secondary (MEDIUM confidence)
- Rust WASM panic discussion (https://users.rust-lang.org/t/catch-panic-in-wasm/57569) — catch_unwind behavior with panic=abort
- Morgen Priority Factor (https://www.morgen.so/blog-posts/rethinking-task-prioritization-introducing-the-morgen-priority-factor) — priority scoring structure and weights
- Wikipedia: Half-life (https://en.wikipedia.org/wiki/Half-life) — exponential decay formula

### Tertiary (LOW confidence)
- Priority formula starting weights (0.40/0.25/0.15/0.15/0.05) — educated guess, needs calibration
- Energy inference heuristics — keyword patterns chosen by reasoning, not validated

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified from Phase 1; no new dependencies needed
- Architecture: HIGH — patterns verified against official docs; Worker/store extension is straightforward
- Rust scoring formulas: MEDIUM — formula structure is correct; starting constants are estimates
- Common pitfalls: HIGH — identified from Phase 1 learnings + wasm-bindgen known limitations
- Energy heuristics: LOW — keyword lists are guesses, need user feedback

**Research date:** 2026-02-22
**Valid until:** 2026-03-22 (30 days — stack is stable; formula constants may need adjustment after first usage)
