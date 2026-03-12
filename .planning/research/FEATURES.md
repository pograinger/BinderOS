# Feature Research

**Domain:** Cortical intelligence layer for local-first ONNX agent stack (BinderOS v5.5)
**Researched:** 2026-03-12
**Confidence:** HIGH (grounded in existing codebase + HTM literature; patterns are well-established)

---

## Context: What Already Exists

This is a subsequent milestone, not a greenfield project. The following infrastructure is already
operational and must be treated as fixed constraints:

| Existing System | Relevant Capability |
|-----------------|---------------------|
| `dispatchTiered()` + handler registry | Pipeline with `canHandle(task)` gate per handler |
| `CognitiveSignal` / `SignalVector` | 10 ONNX models emitting typed signals per atom |
| `COMPOSITOR_RULES` | Multi-signal composite derivation rules (10 composites) |
| `atomIntelligence` sidecar (Dexie) | Per-atom enrichment Q&A, entity mentions, cached cognitive signals |
| Entity + EntityRelation tables | NER-extracted registry with typed relationships + evidence |
| Sanitization worker (NER pipeline) | DETECT_ENTITIES runs in the sanitization worker to avoid OOM |
| Headless harness (adversarial loop) | Synthetic personas, Optuna tuning, ablation, EVS scoring |
| `computeSignalRelevance()` | Already maps cognitive signals to enrichment categories by uncertainty |

All four new features extend this stack. None start from scratch.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features the v5.5 milestone cannot ship without. These represent the minimum viable expression
of each HTM principle — without them, the milestone vision is not realized at all.

| Feature | Why Expected | Complexity | Existing Dependency |
|---------|--------------|------------|---------------------|
| Context gating predicate system | Without gating, every agent runs on every atom regardless of relevance — defeats the "efficient cortex" premise entirely | MEDIUM | `canHandle(task)` in `TierHandler` is task-scoped; gating adds a context dimension before dispatch |
| Binder-type config interface (`BinderTypeConfig`) | GTD is currently hardcoded; v5.5 spec says "GTD is first pluggable type" — the interface must exist even if only one type implements it initially | MEDIUM | `COMPOSITOR_RULES`, GTD classifiers, enrichment categories are GTD-specific constants today |
| Sequence context signal reaching T2 classifiers | The stated goal of sequence learning is improving T2 classification quality with recent-atom context — if no sequence signal reaches T2, the feature doesn't exist functionally | HIGH | Embedding worker (`src/search/embedding-worker.ts`) already produces MiniLM embeddings; must cache last-N and expose to pipeline |
| Predictive enrichment scoring function | Current enrichment asks "what's missing?" — the milestone calls for "what will the user need next?"; the scoring function replacing `computeSignalRelevance()` must exist | HIGH | `computeSignalRelevance()` in `enrichment-engine.ts` is the direct predecessor |

### Differentiators (Competitive Advantage)

Features that go beyond the minimum and deliver the "cortical intelligence" quality jump. These
are where BinderOS separates from generic GTD apps and note-taking tools with bolt-on AI.

| Feature | Value Proposition | Complexity | Implementation Notes |
|---------|-------------------|------------|----------------------|
| Time-of-day aware gating | "Deep work block" agent activates only in morning high-energy window, not during evening capture — naturally aligned with existing `energy-level` cognitive signal | LOW | Read `Date.now()` hour + stored user energy-pattern heuristic; no new model needed |
| Route-aware gating | Triage agents don't fire when user is on Insights view; decomposition agent skips inbox-empty state — prevents wasted inference on irrelevant contexts | LOW | SolidJS router signals are already reactive; predicate checks `currentRoute` |
| Recent atom history gating | Skip enrichment on an atom that was enriched `depth >= 2` in the last 7 days unless content changed | MEDIUM | Read `atomIntelligence.enrichment[]` from sidecar; `lastEnrichedAt` timestamp comparison |
| Entity graph trajectory as prediction feature | If `[COLLEAGUE]` + `meeting` co-occurred 3x in 7 days, proactively surface meeting-prep context before user types it | HIGH | `Entity.lastSeen` + `mentionCount` + `EntityRelation.confidence` + time-window Dexie query |
| Harness as SDK (config-driven binder types) | Corporate/third-party developers train their own binder-type column set using the existing harness framework — BinderOS becomes a platform, not just an app | MEDIUM | Harness pipeline already parameterized; needs `BinderTypeConfig` + persona-config separation |
| Lightweight ONNX sequence model | Recent 5-10 atom embeddings fed as context prefix to T2 classifiers — catches semantic momentum ("health cluster" incoming after 3 health atoms) | HIGH | Tiny ONNX model (< 2MB target); trainable via existing `scripts/train/` Python pipeline |
| Cognitive signal delta trends for prediction | Track `SignalVector` deltas over last-N atoms (e.g., rising `stress-risk` composite) — use trend as input to enrichment priority scoring | MEDIUM | `CachedCognitiveSignal` in sidecar stores per-atom; need windowed query over recent atoms |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| NuPIC / SDR algorithms | "You said HTM, shouldn't we use actual HTM math?" | NuPIC never found production traction; ONNX quantized transformers beat SDR on every practical benchmark for text classification; SDR encoding layers add pure overhead | Use HTM as organizing principle only — context gating, prediction, specialization — implemented with ONNX |
| Centralized context orchestrator agent | "One conductor knows the current context and tells all agents what to do" | Violates emergent/etiquette-based cooperation vision; creates single point of failure; requires expensive cross-agent state serialization | Each agent reads context gate predicates independently; `COMPOSITOR_RULES` already handles multi-signal synthesis without a conductor |
| Per-user personalized sequence model | "Train the LSTM on this specific user's sequence history" | Privacy surface too large without backend; in-browser ONNX is inference-only (no retraining); would require a backend to reproduce | Shared sequence model trained on synthetic personas via harness; entity-graph user-correction ripple already personalizes the stack |
| Real-time sequence embedding on every keystroke | "Update sequence context as user types for instant feedback" | Embedding inference is 50-100ms per call; mobile battery impact is severe; no added value until atom is committed | Update sequence context only on atom save/triage completion — event-driven, not keystroke-driven |
| Bio-inspired lateral inhibition protocol | "Agents should inhibit each other like cortical columns" | Adds cross-agent coordination complexity; current `confidence >= threshold` gating already achieves the same functional outcome with zero overhead | Keep `canHandle()` + threshold escalation + context predicates on top — that IS lateral inhibition in functional terms |
| Separate prediction object database | "Store predicted future atoms as separate objects" | Schema drift; IndexedDB has no query planner — an orphaned prediction table creates maintenance burden | Predictions are scores on existing candidates (entity graph + signal composites), not new stored objects |

---

## Feature Dependencies

```
[BinderTypeConfig interface]
    └──enables──> [Route-aware gating]        (gate predicate reads binderType)
    └──enables──> [Harness as SDK]             (harness parameterized on BinderTypeConfig)
    └──enables──> [Time-of-day aware gating]   (gating reads binder config for relevance rules)
    └──enables──> [BinderTypeConfig: GTD impl] (GTD becomes first implementation)

[Context gating predicate system]
    └──requires──> [BinderTypeConfig]          (binder type is a gating input)
    └──wraps──>    [dispatchTiered()]          (gating runs pre-dispatch, not inside canHandle)
    └──reads──>    [currentRoute]              (SolidJS reactive)
    └──reads──>    [Date.now() hour]           (time-of-day signal)
    └──reads──>    [atomIntelligence sidecar]  (recent atom history)

[Sequence context model (LSTM/attention)]
    └──requires──> [Embedding worker last-N cache]   (embeddings stored in ring buffer)
    └──feeds──>    [T2 classifiers via TieredFeatures] (new `sequenceContext` field)
    └──requires──> [Python training pipeline]         (scripts/train/ — offline only)
    └──output-size-matches──> [MiniLM embedding dim]  (384-dim)

[Predictive enrichment scoring function]
    └──requires──> [Entity graph trajectory query]     (Entity lastSeen + mentionCount window)
    └──requires──> [Cognitive signal history window]   (CachedCognitiveSignal across recent N atoms)
    └──replaces──> [computeSignalRelevance()]          (same interface, richer scoring)
    └──enhances──> [enrichment-engine.ts]              (drop-in replacement function)

[Cognitive signal history window]
    └──requires──> [CachedCognitiveSignal in atomIntelligence] (already in schema — no migration)
    └──feeds──>    [Predictive enrichment scoring function]
```

### Dependency Notes

- **BinderTypeConfig is the unlock.** Context gating, harness SDK, and pluggable enrichment categories all require this interface first. Must be Phase 1.
- **Sequence learning is the most independent.** The ONNX model can be trained offline and dropped in as an embedding worker feature. It does not block gating or prediction work.
- **Predictive enrichment depends on signal history windowing.** This is a new Dexie query over `CachedCognitiveSignal` records — not a schema change, just a query.
- **Context gating requires NO new models.** Predicate logic evaluated before dispatching; the 10 existing ONNX models are unchanged, they just run less often.
- **Harness as SDK depends on BinderTypeConfig.** Once the interface exists, parameterizing the harness pipeline on it is primarily a refactor of `run-harness.ts`.

---

## MVP Definition

### Launch With (v5.5 Phase 1)

Minimum that makes the cortical intelligence milestone real and measurable by the harness.

- [ ] **BinderTypeConfig interface** — GTD as first implementation; JSON config with column set, relationship patterns, entity types, composite rules reference
- [ ] **Context gating predicate system** — `AgentGate` interface with `shouldActivate(context: GateContext): boolean`; gates: `binderType`, `currentRoute`, `timeOfDay`, `atomHistory`; wired into `dispatchTiered()` pre-flight
- [ ] **Route-aware gate** — Cheapest useful gate: skip triage and enrichment agents when on Insights/Archive/Settings views
- [ ] **Time-of-day gate** — Read `Date.now()` hour; suppress deep-cognitive agents in low-energy windows

### Add After Validation (v5.5 Phase 2)

Add once gating is working and harness can measure agent activation rates.

- [ ] **Recent atom history gate** — Skip re-enrichment when `atomIntelligence.enrichment.depth >= 2` and `lastUpdated < 7 days ago`; respects atom edits
- [ ] **Predictive enrichment scoring function** — Replace `SIGNAL_CATEGORY_MAP` in `enrichment-engine.ts` with dynamic prediction score over entity graph trajectory + cognitive signal history window
- [ ] **Cognitive signal history window** — Dexie query for last-N `CachedCognitiveSignal` records; compute delta vectors for trend detection
- [ ] **Harness as SDK** — Parameterize `run-harness.ts` on `BinderTypeConfig`; persona YAML references binder type; ablation reports tagged by binder type

### Future Consideration (v5.5 Phase 3)

Defer until Phase 1+2 are validated by harness scoring metrics.

- [ ] **Sequence learning ONNX model** — Requires: embedding ring-buffer cache, Python training run on persona corpus, ONNX export, embedding worker integration; highest complexity, highest reward; defer until gating and prediction prove value
- [ ] **Entity graph trajectory as prediction feature** — Depends on multi-cycle harness validation that entity graph quality is stable (currently in active tuning in Phase 29)

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| BinderTypeConfig interface | HIGH (unlocks all other features) | LOW (interface + GTD impl, no new models) | P1 |
| Context gating — route-aware | HIGH (stops wasted inference immediately) | LOW (SolidJS route signal already reactive) | P1 |
| Context gating — time-of-day | MEDIUM (aligned with energy signals) | LOW (no model, read Date.now()) | P1 |
| Context gating — recent atom history | HIGH (prevents repeat enrichment) | MEDIUM (sidecar query) | P1 |
| Predictive enrichment scoring | HIGH (core milestone differentiator) | MEDIUM (replaces static map with dynamic score) | P2 |
| Cognitive signal history window | MEDIUM (enables prediction scoring) | MEDIUM (Dexie window query + delta) | P2 |
| Harness as SDK (binder type params) | HIGH (long-term platform value) | MEDIUM (harness refactor) | P2 |
| Sequence learning ONNX model | HIGH (quality jump for classifiers) | HIGH (Python training + ONNX + worker) | P3 |
| Entity graph trajectory prediction | HIGH (proactive context surfaces) | HIGH (entity quality must stabilize first) | P3 |

**Priority key:**
- P1: Must have for v5.5 launch — gating and pluggability foundation
- P2: Should have — delivers predictive enrichment differentiator
- P3: Defer — highest complexity, defer until P1+P2 validated by harness

---

## Domain Pattern Analysis

### Context Gating — Expected Behavior

In ML serving systems, context gating is a pre-dispatch filter evaluating cheap predicates before
running expensive models. Applied to BinderOS:

- **Gate input signals:** `binderType` (from BinderTypeConfig), `currentRoute` (SolidJS reactive), `hourOfDay` (0-23), `recentAtomCount` (Dexie count), `lastEnrichedAt` (from sidecar), `activeComposites` (current SignalVector composites)
- **Gate decision:** boolean `shouldActivate()` per agent/task combination
- **Gate placement:** Pre-`dispatchTiered()`, not inside individual `canHandle()` — gating is cross-cutting concern, not per-handler logic
- **No new models needed:** Gates are predicate functions over existing signals

Expected behavior: A fresh atom at 9am on the Inbox view triggers all triage agents. The same atom
arriving while the user views Insights at 11pm triggers nothing. A task atom with `enrichment.depth >= 2`
and no content change skips enrichment agents. An atom with `quick-win` composite active routes
directly to GTD next-action suggestion without asking clarification questions.

### Predictive Enrichment — Expected Behavior

Standard recommendation-system pattern: score candidates against a context vector rather than a
relevance-to-current-item vector. Applied to enrichment:

- **Current approach:** `computeSignalRelevance(category, signals)` — scores category by how uncertain the current atom's signals are
- **Predictive approach:** Score = `uncertainty_weight * trajectory_trend * entity_graph_momentum`
  - `trajectory_trend`: rising `stress-risk` composite over last 5 atoms → surface `missing-outcome` first
  - `entity_graph_momentum`: `[COLLEAGUE]` entity appeared 3x this week → surface `missing-context` questions about collaboration
- **Output:** Same `MissingInfoCategory[]` prioritized list, better ordering driving better enrichment
- **No UI change needed:** Enrichment wizard shows questions in computed priority order — smarter ordering is invisible to the user

Expected behavior: User captures "Need to finish the proposal before the board meeting" on a Tuesday
with rising deadline-related atoms in their recent history. Predictive scoring identifies `missing-timeframe`
as highest priority based on entity graph showing recurring `[MEETING]` entity + `urgent-important`
composite trending up over the prior 5 atoms. First enrichment question is "When does this need to be
done?" — without the user having to explain context the system already has.

### Sequence Learning — Expected Behavior

Standard sequence-to-classification using lightweight mobile-safe ONNX models:

- **Input:** Last N (5-10) MiniLM embeddings from recent atoms, flattened or attended
- **Model options:**
  - Tiny LSTM (1-2 layers, hidden dim 64-128): ~500KB ONNX, proven architecture, trainable in Python
  - Single attention head over N embeddings: ~200KB, faster, less sequential bias
  - Recommendation: attention head first (simpler, smaller, less prone to vanishing gradients on short sequences)
- **Output:** Context embedding (384-dim, same as MiniLM) concatenated to current atom embedding before T2 ONNX inference via new `sequenceContext` field on `TieredFeatures`
- **Training:** Synthetic persona corpus already generates realistic atom sequences; extend Python training pipeline with sequence-aware batching in `scripts/train/`
- **Mobile feasibility (confirmed):** iPhone 2024+ runs 5-10 small ONNX agents at <50ms; a 200KB attention head adds negligible overhead per `project_htm_cortical_vision.md`

Expected behavior: User captures health-related atoms across 3 days (doctor appointment, prescription,
insurance form). The sequence model outputs a "health cluster" context embedding. The next atom "Call
Dr. Chen's office" is classified as `task` (not `fact`) with higher confidence than isolated classification
would give, and `knowledge-domain` routes correctly to `health` instead of defaulting to `work`.

### Binder-Type Specialization Protocol — Expected Behavior

Plugin/configuration pattern where `BinderTypeConfig` contains everything currently GTD-specific:

```typescript
interface BinderTypeConfig {
  binderTypeId: string;                         // 'gtd', 'project', 'legal', etc.
  displayName: string;
  onnxModelIds: CognitiveModelId[];             // Which T2 models activate for this type
  compositorRules: CompositorRule[];            // Which composite rules apply
  enrichmentCategories: MissingInfoCategory[];  // Question bank subset
  relationshipPatterns: RelationshipPatternConfig[];  // Entity inference rules
  entityTypes: EntityTypeConfig[];              // Which NER entity types are tracked
  contextGatePredicates: GatePredicateConfig[]; // Binder-specific activation rules
  harnessPersonaTemplate: string;               // Default persona YAML for harness SDK
}
```

GTD becomes the first implementation. The harness becomes the SDK by accepting `BinderTypeConfig`
as a parameter to `run-harness.ts`.

Expected behavior: A "ProjectBinder" type loaded via config JSON activates project-management
ONNX models, disables GTD-horizon and context-tagging models, uses a different enrichment question
bank, and trains via the same harness framework with project-specific synthetic personas. No BinderOS
core code changes required for the third-party developer.

---

## Competitor Feature Analysis

No direct competitors implement all four features together in a local-first browser context.
Analogues exist in adjacent domains:

| Feature | Analogues | BinderOS Approach |
|---------|-----------|-------------------|
| Context gating | ML serving feature flags (LaunchDarkly for models), iOS CoreML activation gates | Predicate functions registered with handler registry; zero external dependencies |
| Predictive enrichment | Notion AI "suggest next steps", Linear "smart suggestions" | Local-only; uses entity graph + signal composites; no cloud inference required |
| Sequence learning | GitHub Copilot file context, Mem.ai thread awareness | Tiny ONNX model trained on synthetic personas; mobile-safe (<200KB) |
| Binder-type protocol | Notion databases, Obsidian plugins | Config-driven JSON; harness as SDK; pluggable column sets |

None of the analogues are local-first or privacy-preserving. BinderOS's differentiator is
delivering all four in a fully offline, browser-native stack.

---

## Sources

- Codebase: `src/ai/tier2/cognitive-signals.ts` — confirmed 10-model army, `COMPOSITOR_RULES`, `CompositeSignal` types
- Codebase: `src/ai/tier2/pipeline.ts` — confirmed `canHandle()` gate placement, handler registry pattern
- Codebase: `src/ai/tier2/types.ts` — confirmed `TieredFeatures` interface (extensible for `sequenceContext`)
- Codebase: `src/ai/enrichment/enrichment-engine.ts` — confirmed `computeSignalRelevance()` predecessor
- Codebase: `src/types/intelligence.ts` — confirmed `CachedCognitiveSignal`, `Entity`, `EntityRelation` schema fields available for prediction queries
- Memory: `project_htm_cortical_vision.md` — HTM principles mapping, mobile feasibility, LSTM/attention recommendation, what NOT to adopt
- Memory: `project_os_architecture_vision.md` — BinderTypeConfig OS metaphor, harness-as-SDK vision, pluggability constraint
- Memory: `MEMORY.md` — v5.5 milestone scope, cognitive harness, user preferences
- PROJECT.md: Active requirements section confirming exact feature scope and v5.5 vision

---
*Feature research for: BinderOS v5.5 Cortical Intelligence (context gating, predictive enrichment, sequence learning, binder-type specialization)*
*Researched: 2026-03-12*
