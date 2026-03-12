# Phase 29: Entity Consumers + Trained Agent Validation — Research

**Researched:** 2026-03-12
**Domain:** Adversarial training loop, entity consumer integration, semantic sanitization, SolidJS popover UX
**Confidence:** HIGH (all based on direct codebase inspection + Phase 28 verified implementations)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Training loop design:**
- 5 fixed adversarial cycles per persona — not converge-to-plateau
- Gap-targeted generation — after each cycle, cloud sees full synthetic profile + current entity graph state + exact gaps. Generates items specifically targeting blind spots with aggressive adversarial examples
- Full synthetic context visibility — since data is 100% synthetic (cloud-generated), no privacy boundary in training. Cloud sees everything for maximum targeting effectiveness. Privacy boundary enforced only in production with real user data
- Full lifecycle user emulation — cloud-as-user performs: (1) triage accept/reject with realistic selectivity, (2) enrichment Q&A answers as the persona would answer (persona-consistent substance), (3) entity corrections when stack gets relationships wrong, (4) re-enrichment requests on atoms the persona cares about. Each interaction is a learning signal
- Immediate correction + ripple — when cloud-as-user corrects a relationship, entity graph updates immediately (confidence 1.0). All existing atoms mentioning the corrected entity are re-evaluated. Subsequent items in the same cycle benefit from the correction
- 30-50 items per cycle — 5 cycles x 30-50 items = 150-250 items per persona
- Component attribution + ablation — track per-relationship: was it found by keyword patterns, co-occurrence, enrichment Q&A mining, or entity corrections. Run ablation: disable one component at a time, re-score across all personas. Shows which components are load-bearing vs redundant
- Cloud coaching feedback — cloud self-evaluates semantic tag quality AND coaches on missing context. Feeds into gap targeting and investment report
- Enrichment quality measurement — harness compares enrichment WITHOUT entity context vs WITH entity context. Cloud evaluator rates which extracted more useful GTD-relevant information

**Persona strategy:**
- 10+ diverse personas generated via reusable CLI tool
- Diversity dimensions: relationship complexity (nuclear to blended family), cultural naming patterns (hyphenated, patronymic, mononyms, title variations), GTD usage style (terse to verbose), life stage/archetype (student, early career, parent, executive, retiree, freelancer)
- Minimum coverage matrix — each persona must cover: 2+ family relationships, 1+ work relationship, 1+ service provider, 1+ org membership
- Binder-type parameterized — persona generator accepts `--binder-type` flag
- Reusable CLI tool — `node scripts/harness/generate-persona.ts --archetype retiree --complexity high --binder-type gtd-personal`

**Graph persistence + snapshots:**
- Full graph + diff + intelligence sidecar saved after each cycle
- Per-persona graph snapshots at `scripts/harness/personas/{name}/graphs/cycle_{N}.json`
- Diff showing what changed since last cycle

**Semantic sanitization (production-wired):**
- Relationship tags replace pseudonyms when entity has known relationship: `"Pam" → "[SPOUSE]"`, `"Dr. Chen" → "[DENTIST]"`
- Tag selection: user-corrected relationships (confidence 1.0) always win. Among inferred, pick most contextually relevant
- Layered architecture — semantic sanitization preserves meaning. Future adversarial privacy agents control cost. Separate concerns

**Entity context injection (harness-validated, not production-wired):**
- Both: templates for T1/T2, summary for T3
- Interface-driven GTD context suggestions — binder type defines how entity relationships map to context tags
- Recency-weighted context injection

**Enrichment answer mining (harness-validated, not production-wired):**
- Full inference on each answer — NER + keyword pattern matching + co-occurrence tracking on every enrichment answer submission
- Live feedback loop — entities from answer N available for question N+1 within same enrichment session
- Atom sidecar + enrichment record provenance

**Entity knowledge isolation:**
- Entity knowledge exists ONLY in sidecar — atom content is never modified by entity inference
- No graph crawling of atom content

**Recency decay (production-wired):**
- On-read computation: `relevance = mentionCount * e^(-λ * daysSinceLastSeen)`, `λ = ln(2)/30`
- No background jobs, no stored values
- Synthetic timestamps in harness for decay validation

**Minimal correction UX (production-wired):**
- Badge tap → popover: entity name, type, inferred relationship(s) with confidence. [✓ Correct] and [Fix ▼] actions
- Fix opens context-filtered dropdown of top 5-6 most relevant relationship types based on entity type and atom context
- Entity timeline — 'See all N atoms →' link. Reuses existing search/list view with entity filter

**Benchmark criteria:**
- 80% relationship accuracy after cycle 1 (natural corpus), 90%+ after 5 cycles
- Metrics: relationship accuracy (P/R/F1), entity dedup quality, semantic sanitization coverage, learning curve shape, cross-persona consistency

**Harness execution model:**
- Tiered API models — Haiku for bulk user emulation. Sonnet for gap analysis, coaching, corpus generation, scoring evaluation
- Checkpoint + resume after each persona-cycle — CLI supports `--resume`
- CI-ready with exit codes — exit 0 if all personas pass thresholds, exit 1 if any fail
- Named experiments — `scripts/harness/experiments/{name}/`
- Auto-tune patterns — after all personas complete, patterns with >70% precision keep/increase confidence. Patterns with <40% precision get flagged. New patterns suggested based on common false negatives. Changes written to `tuned-patterns.json`

**Investment report:**
- Actionable report ranks recommended ONNX agents/local strategies by expected accuracy improvement
- Impact + complexity matrix
- Derived from ablation + gap analysis

### Claude's Discretion
- Exact persona archetypes and their ground truth details
- Parallelism strategy for persona execution (based on API rate limits)
- Decay application scope (badge ordering, search ranking)
- Harness inference wrapper design for entity context injection testing
- Ablation component list (keyword patterns, co-occurrence, enrichment mining, corrections, recency decay)
- Auto-tune convergence criteria and pattern suggestion methodology

### Deferred Ideas (OUT OF SCOPE)
- Entity-aware enrichment in production — harness-validated in Phase 29, production wire when proven beneficial
- Enrichment answer mining in production — harness-validated, wire after training confirms value
- GTD context suggestions from entities in production — harness-validated, wire after training confirms value
- Adversarial privacy agents — whole-person masking/obfuscation/noise-injection, privacy budget (post-v5.0)
- Information leakage measurement — deferred to privacy layer
- Progressive difficulty tiers — gap-targeting is better
- Background backfill entity detection — deferred from Phase 27
- Entity merge suggestion UX — more advanced correction UX
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ENTC-01 | Entity context injected into enrichment questions — "You mentioned Sarah (your wife) — is this related to your anniversary planning?" | T3EnrichmentContext already has extension points at line 52-65; add `entitySummary` field; T1/T2 uses slot-filled templates in question-bank.ts |
| ENTC-02 | User correction UX with inline entity cards, editable relationships; corrections stored as ground truth (confidence 1.0) overriding all inference | EntityBadges.tsx is a pure display component; needs tap→popover with SolidJS createSignal; entity-helpers.ts needs `correctRelationship()` function |
| ENTC-03 | Entity relationships inform GTD context tag suggestions — "Meeting with Dr. Chen" → @health context | enrichment-engine.ts SIGNAL_CATEGORY_MAP already does signal→category; add entity relationship→context_tag mapping in binder-types/ config |
| ENTC-04 | Recency-weighted entity relevance with exponential decay (MunninDB-style, ~30 day half-life) | Entity schema already has `lastSeen` + `mentionCount` timestamps; on-read formula is pure math; no schema changes needed |
| ENTC-05 | Entity timeline view showing all atoms mentioning a specific entity, ordered chronologically | Reuse existing search infrastructure with entity filter; no new page needed; atomIntelligence.entityMentions has entityId for cross-reference |
| TVAL-01 | Harness training loop proves >80% relationship accuracy after 5 adversarial cycles across 10+ diverse personas | Phase 28 harness foundation is complete; current 3-persona baseline shows 90%+ on single natural cycle; adversarial cycles, enrichment emulation, and ablation are the new work |
| TVAL-02 | Investment report with impact+complexity matrix derived from ablation analysis | write-reports.ts is the template; extend with cross-persona aggregate report, ablation results, pattern attribution, and investment recommendations |
</phase_requirements>

---

## Summary

Phase 29 is the final v5.0 phase. It has two distinct delivery areas: (1) production-wired entity consumers — semantic sanitization upgrade, recency decay, correction UX, entity timeline — and (2) the adversarial multi-cycle harness that proves the cognitive stack learns emergent user relationships. The harness is the primary deliverable; production features are minimal production wiring.

**Baseline position from Phase 28:** The single-cycle harness already runs cleanly across 3 personas (Alex Jordan, Dev Kumar, Maria Santos). Alex Jordan hits 100% relationship recall at 30 atoms. Dev Kumar hits 100% entity recall at 36 atoms, 100% relationship recall at 49 atoms. Maria Santos reaches 93.3% relationship recall at 40 atoms. Single-cycle performance is strong. The Phase 29 challenge is multi-cycle adversarial loops with enrichment emulation, corrections ripple, ablation, gap-targeted generation, and 10+ personas.

Phase 29 requires two code planes that should not be confused: the **harness plane** (everything in `scripts/harness/`) which runs headless in Node.js with no browser APIs, and the **production plane** (everything in `src/`) which runs in the SolidJS PWA with Dexie and workers. The production wiring is small (semantic sanitization, recency decay, correction popover). The harness is large (adversarial cycles, enrichment emulation, ablation, persona generator, experiment tracking).

**Primary recommendation:** Build the harness in two waves — Wave 1: multi-cycle adversarial loop + generate-persona CLI + 10 personas; Wave 2: ablation engine + auto-tune patterns + investment report. Wire production features in a third wave for independence.

---

## Standard Stack

### Core (no new dependencies needed)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| @anthropic-ai/sdk | existing | Harness Anthropic API calls (Haiku + Sonnet) | Already used in generate-corpus.ts |
| tsx | existing | TypeScript execution in Node.js for harness scripts | Already used across all harness scripts |
| SolidJS | existing | EntityBadges popover + correction UI | createSignal, Show, For |
| Dexie | existing | entity-helpers.ts corrections persistence | Already used throughout |
| zod/v4 | existing | Type validation for new harness schema | Already used in intelligence.ts |

### No New Dependencies
Phase 29 reuses the entire existing stack. The harness already has Anthropic SDK. Production code already has SolidJS + Dexie. No new npm packages are needed.

**Confirmed:** `package.json` already contains `@anthropic-ai/sdk`, `solid-js`, `dexie`, `zod`.

---

## Architecture Patterns

### Harness Directory Structure (after Phase 29)
```
scripts/harness/
├── personas/                          # Existing persona data
│   ├── alex-jordan/                   # Phase 28 persona
│   ├── dev-kumar/                     # Phase 28 persona
│   ├── maria-santos/                  # Phase 28 persona
│   └── {name}/                        # 7+ new personas
│       ├── synthetic-user.json        # Profile + ground truth
│       ├── corpus.json                # (generated, per cycle)
│       ├── graphs/                    # NEW: cycle snapshots
│       │   └── cycle_{N}.json
│       └── reports/                   # Existing per-run reports
├── experiments/                       # NEW: named experiment results
│   └── {experiment-name}/
│       ├── summary.json               # Cross-persona aggregate
│       ├── investment-report.md       # NEW
│       └── ablation-results.json      # NEW
├── generate-persona.ts                # NEW: reusable persona CLI
├── run-adversarial.ts                 # NEW: multi-cycle entry point
├── adversarial-cycle.ts               # NEW: one cycle (generate+emulate+score)
├── enrichment-emulator.ts             # NEW: cloud-as-user Q&A
├── ablation-engine.ts                 # NEW: disable components, rescore
├── auto-tune-patterns.ts              # NEW: pattern confidence adjustment
├── generate-investment-report.ts      # NEW: impact+complexity matrix
├── checkpoint-store.ts                # NEW: resume state persistence
│
├── harness-pipeline.ts                # Phase 28 — extend for enrichment
├── harness-inference.ts               # Phase 28 — extend for answer mining
├── harness-entity-store.ts            # Phase 28 — no changes needed
├── score-graph.ts                     # Phase 28 — extend with ablation scores
├── write-reports.ts                   # Phase 28 — extend with aggregate reports
├── run-harness.ts                     # Phase 28 — kept for single-cycle runs
├── generate-corpus.ts                 # Phase 28 — kept, reused by adversarial
├── validate-corpus.ts                 # Phase 28 — no changes needed
└── synthetic-user.json                # Legacy default persona
```

### Pattern 1: Multi-Cycle Adversarial Loop

**What:** 5 cycles per persona. Each cycle: (a) generate gap-targeted corpus via Sonnet, (b) run enrichment emulation via Haiku (cloud-as-user answering Q&A), (c) apply immediate corrections + ripple, (d) score graph, (e) extract gaps for next cycle.

**Key insight from Phase 28 baseline:** Single-cycle with natural corpus already achieves 90-100% on all 3 personas. The adversarial cycles are primarily about: (1) testing robustness with adversarial examples, (2) emulating enrichment Q&A as a signal source, (3) testing correction ripple, and (4) validating the stack degrades gracefully under adversarial input (not just validates on easy natural text).

**Cycle state object:**
```typescript
interface CycleState {
  personaName: string;
  cycleNumber: number;          // 1-5
  corpus: CorpusItem[];         // Items processed this cycle
  graphSnapshot: GraphSnapshot; // Entity/relation state at end of cycle
  graphDiff: GraphDiff;         // What changed vs previous cycle
  score: GraphScore;            // P/R/F1 at end of cycle
  gaps: RelationshipGap[];      // Missed relationships for next cycle targeting
  enrichmentEmulations: EnrichmentEmulation[]; // Q&A exchanges
  corrections: UserCorrection[];               // Corrections applied
  attribution: ComponentAttribution;           // Per-relationship source breakdown
}

interface GraphSnapshot {
  entities: Entity[];
  relations: EntityRelation[];
  atomIntelligenceRecords: AtomIntelligence[];
  takenAt: number; // synthetic timestamp
}

interface GraphDiff {
  newEntities: string[];          // canonicalNames
  removedEntities: string[];
  newRelations: Array<{ entity: string; type: string }>;
  confidenceChanges: Array<{ entity: string; type: string; delta: number }>;
}
```

### Pattern 2: Enrichment Emulation in Harness

**What:** After each atom is processed, cloud-as-user (Haiku) simulates enrichment session. Harness calls a lightweight enrichment context builder, sends to Haiku with persona profile, receives simulated Q&A answers, runs entity detection on answers, updates graph.

**Critical constraint:** Production enrichment engine is a pure module that takes state as params. The harness enrichment emulator mimics this contract without importing the browser-dependent production module.

**Harness enrichment flow:**
```typescript
// enrichment-emulator.ts
interface HarnessEnrichmentContext {
  atomContent: string;
  atomType: string;
  entitySummary: string;          // Known entities and relationships
  priorQA: EnrichmentRecord[];    // Existing enrichment answers from sidecar
}

interface HarnessEnrichmentResult {
  simulatedQA: Array<{ question: string; answer: string; category: string }>;
  newEntityMentions: EntityMention[];
  inferenceResults: EntityRelation[];
}

async function emulateEnrichmentSession(
  context: HarnessEnrichmentContext,
  personaBio: string,
  client: Anthropic,
): Promise<HarnessEnrichmentResult>
```

**Haiku prompt design:** Send persona bio + atom content + entity summary + current relationships. Ask Haiku to role-play as the persona answering enrichment questions naturally. Extract Q&A pairs. Run `runHarnessKeywordPatterns()` on answers to mine new relationship signals.

### Pattern 3: Immediate Correction + Ripple

**What:** After each cycle's enrichment emulation, cloud-as-user (Haiku) reviews the current entity graph against ground truth. Where the graph is wrong (wrong relationship type, wrong entity), it submits corrections. Correction = update EntityRelation with `sourceAttribution: 'user-correction'`, `confidence: 1.0`.

**Ripple effect:** When a correction is applied, all atoms that mention the corrected entity are re-evaluated: `runHarnessKeywordPatterns()` re-run, but corrected relationship takes precedence (suppresses conflicting inferred relations). The `cleanSuppressedRelations()` function in `harness-inference.ts` already handles suppression logic — this extends it.

```typescript
interface UserCorrection {
  entityName: string;
  wrongRelationshipType: string;  // What the system had
  correctRelationshipType: string; // Ground truth
  atomId: string;                  // Atom where the correction was triggered
  appliedAt: number;
}

function applyCorrection(
  store: HarnessEntityStore,
  correction: UserCorrection,
): void {
  // 1. Find all relations for this entity
  // 2. Remove wrong-typed relations
  // 3. Create user-correction relation with confidence 1.0
  // 4. Log to cycle corrections array
}
```

### Pattern 4: Component Attribution + Ablation

**What:** Track which signal source discovered each relationship. During normal cycle run, every `createRelation()` call records `sourceAttribution`. Attribution summary per-cycle: how many relationships came from keyword patterns vs co-occurrence vs enrichment mining vs corrections.

**Ablation design:** After all 5 cycles per persona complete, re-run the FULL 5-cycle sequence with one component disabled at a time. Compare final relationship F1 between full run vs ablated run. Delta = component contribution.

**Ablation flag set:**
```typescript
interface AblationConfig {
  disableKeywordPatterns: boolean;
  disableCooccurrence: boolean;
  disableEnrichmentMining: boolean;
  disableUserCorrections: boolean;
  disableRecencyDecay: boolean;  // In scoring/ranking, not inference
}

// ablation-engine.ts
async function runAblation(
  persona: PersonaPaths,
  config: AblationConfig,
  client: Anthropic,
): Promise<AblationResult>
```

**Cost control:** Ablation needs API calls (gap-targeted generation, enrichment emulation). With 5 components x 5 cycles x ~30 items = 750 generation calls per persona for full ablation. This is expensive. Strategy: run ablation only for 2 representative personas (one simple, one complex), use 3 cycles instead of 5 for ablation runs. Ablation is insight-gathering, not validation.

### Pattern 5: Gap-Targeted Corpus Generation

**What:** After each cycle, the harness computes `gaps = groundTruth.relationships.filter(r => !foundRelations.includes(r))`. This list is sent to Sonnet with the persona profile to generate items specifically targeting those gaps.

**Key difference from Phase 28:** Phase 28 generation prompt asks for "coverage across all relationships". Phase 29 gap-targeted prompt says "these relationships are MISSING from our graph — generate adversarial items that would provide evidence for these specific relationships using varied phrasing, indirect references, and edge-case language patterns."

**Adversarial corpus prompt additions:**
- Include items that reference the entity WITHOUT the obvious keywords (testing limits)
- Include items with cultural naming variations (testing alias resolution)
- Include items with implicit relationship evidence ("She picked up the kids from school" — no "wife" keyword but implies)
- Include items with conflicting relationship signals (entity appears in both work and personal context)

### Pattern 6: Persona Generator CLI

**What:** `generate-persona.ts` CLI creates a new persona synthetic-user.json given an archetype and complexity level. Uses Sonnet to generate coherent bio + ground truth + minimum coverage matrix validation.

```
node scripts/harness/generate-persona.ts \
  --archetype retiree \
  --complexity high \
  --binder-type gtd-personal \
  --name margaret-chen \
  --validate
```

**10+ Persona Archetypes (research-derived diversity matrix):**
1. **alex-jordan** — software engineer, suburban parent, moderate complexity (Phase 28, baseline)
2. **dev-kumar** — engineering manager, blended family (mother-in-law), Indian naming patterns (Phase 28)
3. **maria-santos** — freelance designer, single parent, non-married partner "Kai" (mononym) (Phase 28)
4. **margaret-chen** — retiree, adult children, volunteer org membership, medical complexity
5. **james-okafor** — early career, student loans, landlord relationship, minimal family network
6. **priya-nair** — executive, travel-heavy, assistant relationship, board memberships
7. **tyler-kowalski** — freelancer, hyphenated-name spouse, home ownership, contractor relationships
8. **sunita-patel** — parent of young children (daycare/school), in-law navigation, patronymic naming
9. **rafael-moreno** — small business owner, employee relationships, vendor/supplier network
10. **anna-liu** — graduate student, advisor relationship, lab colleagues, academic org membership
11. **sam-park** — semi-retired, mixed portfolio (part-time work + volunteer), grandchildren
12. **olivia-hassan** — military spouse, frequent relocation, distributed family network

**Coverage matrix validation** (per CONTEXT.md requirement): After generation, validate each persona has at minimum: 2+ family relationships, 1+ work relationship, 1+ service provider, 1+ org membership.

### Pattern 7: Auto-Tune Patterns

**What:** After all personas complete all 5 cycles, analyze pattern performance. For each keyword pattern in `relationship-patterns.json`, compute: how many times it fired across all atoms, how many times it produced a CORRECT relationship vs a FALSE POSITIVE. Patterns with precision > 70% get their `confidenceBase` raised by 0.05. Patterns with precision < 40% get halved and flagged. Common false negatives are analyzed to suggest new patterns.

**Output:** `scripts/harness/tuned-patterns.json` — a copy of relationship-patterns.json with adjusted confidenceBase values and a `flags` array on low-precision patterns.

**Pattern suggestion methodology (Claude's Discretion):** Collect all `missedRelations` across all personas and cycles. For each missed relationship, find atoms that SHOULD have evidenced it (from expectedRelationships in corpus). Extract common words/phrases from those atom contents. Surface as suggested keyword additions.

### Pattern 8: Production Semantic Sanitization Upgrade

**What:** Wire entity knowledge into the sanitization flow. In `sanitizer.ts`, when building the reverseMap for pseudonymization, look up each detected PER entity against the Dexie `entities` + `entityRelations` tables. If a high-confidence relationship exists, replace `<Person N>` with `[RELATIONSHIP_TYPE]`.

**Integration point:** `entity-registry.ts`'s `buildEntityMap()` is called during sanitization. It needs to accept an optional entity relationship lookup. Since `buildEntityMap()` already does async Dexie lookups, adding another Dexie query is natural.

```typescript
// Extended entity-registry.ts
export async function buildEntityMapWithRelationships(
  entities: DetectedEntity[],
): Promise<{ entityMap: Map<string, string>; reverseMap: Map<string, string> }> {
  // Same as buildEntityMap() but:
  // - For PER entities with known high-confidence relationship in Dexie entityRelations
  //   use "[RELATIONSHIP_TYPE]" as the tag instead of "<Person N>"
  // - User-corrected relationships (sourceAttribution='user-correction') always win
  // - Among inferred, pick highest confidence relation
}
```

**Tag format decision:** `[SPOUSE]`, `[DENTIST]`, `[BOSS]`, `[FRIEND]` etc. — uppercase relationship type without angle brackets to distinguish from pseudonym format.

### Pattern 9: Correction Popover (Production UI)

**What:** EntityBadges.tsx currently renders static chips. Add tap handler that opens an inline popover (not modal) showing entity details and correction actions.

**SolidJS popover pattern:** Use `createSignal<string | null>(null)` for activePopoverId. Popover renders relative to badge using absolute positioning. Click-outside detection with `onBlur` on a wrapper div.

```typescript
// EntityBadges.tsx extension
interface CorrectionPopoverProps {
  entityId: string;
  entityName: string;
  entityType: string;
  inferredRelations: EntityRelation[];
  onCorrect: (relationId: string) => void;
  onFix: (entityId: string, newType: string) => void;
  onViewTimeline: (entityId: string) => void;
}
```

**Relationship type dropdown (Fix ▼):** Context-filtered based on entity type. PER entities get family/work/healthcare options. ORG entities get works-at/org-member. LOC entities get lives-at. Top 5-6 most relevant given entity type and any existing relations.

**Gotcha:** SolidJS store proxy breaks function callbacks — per project memory, never store functions in createStore. Correction callbacks must be module-level or passed as props, not stored in reactive state.

### Pattern 10: Recency Decay (Production)

**What:** Pure on-read computation. No schema changes. Formula: `relevance = mentionCount * e^(-λ * daysSinceLastSeen)`, `λ = ln(2)/30`.

**Usage:** When sorting entity badges for display, apply decay to confidence. When injecting entity context into enrichment, filter/sort by decayed relevance.

```typescript
// Pure utility function — no imports needed
export function computeEntityRelevance(
  entity: Entity,
  nowMs?: number,
): number {
  const now = nowMs ?? Date.now();
  const daysSince = (now - entity.lastSeen) / (1000 * 60 * 60 * 24);
  const lambda = Math.LN2 / 30; // half-life 30 days
  return entity.mentionCount * Math.exp(-lambda * daysSince);
}
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Anthropic API calls in harness | Custom HTTP client | `@anthropic-ai/sdk` (already in package.json) | Already used in generate-corpus.ts, handles retries, types |
| Persona JSON persistence | Custom serializer | `fs.writeFileSync` + `JSON.stringify` | Already used in all harness scripts |
| Checkpoint file format | Custom binary format | JSON files in `personas/{name}/graphs/cycle_{N}.json` | Phase 28 pattern for reports, consistent |
| Relationship type dropdown in popover | New component | Extend existing EntityBadges.tsx | Avoids new component registration and style drift |
| Entity timeline view | New page/route | Reuse existing list/search view with entity filter | CONTEXT.md explicitly says no new page |
| Decay background job | Worker/interval | On-read pure function | CONTEXT.md explicitly locked this |
| Graph diff computation | Graph library | Simple array comparison of entity IDs and relation keys | Personal-scale graph (15-30 entities), no need for graph diff library |

---

## Common Pitfalls

### Pitfall 1: Adversarial Cycle Corpus Contamination
**What goes wrong:** Gap-targeted generation produces items that are "too perfect" — the LLM generates items with all the right keywords because it knows the patterns. This inflates cycle 2+ scores without proving real-world learning.
**Why it happens:** generate-corpus.ts already teaches the LLM the pattern keywords to use. Gap-targeted prompt makes this worse.
**How to avoid:** Adversarial corpus prompt should request VARIED evidence — not just the obvious keywords but indirect, contextual, idiomatic phrasing. Include explicit instruction: "Do NOT use the most obvious keywords — use natural language a real user would capture."
**Warning signs:** Relationship F1 jumps to 100% after cycle 1 — this may indicate corpus is too easy.

### Pitfall 2: HarnessEntityStore Reset Between Cycles
**What goes wrong:** Using the same HarnessEntityStore instance across all 5 cycles without deciding whether state accumulates or resets.
**Why it happens:** Phase 28 harness resets between persona runs (`resetHarnessCooccurrence()`), but cycles WITHIN a persona must ACCUMULATE state — that's the point.
**How to avoid:** Each adversarial cycle feeds items into a PERSISTENT store for that persona. Store resets ONLY between personas, not between cycles. Cooccurrence also accumulates.

### Pitfall 3: Cloud-As-User Enrichment Prompt Leaks Ground Truth
**What goes wrong:** Haiku receives the full persona profile (bio + ground truth) and generates "correct" Q&A answers that directly state the relationship, bypassing what real users would naturally say.
**Why it happens:** The persona bio contains explicit "Pam is my wife" statements.
**How to avoid:** The enrichment emulation prompt must tell Haiku to answer naturally and indirectly as the persona would — NOT to reference the relationship explicitly unless explicitly asked. "Answer as {name} would naturally answer, using their voice and perspective, without directly naming the relationship."

### Pitfall 4: Correction Ripple Infinite Loop
**What goes wrong:** Applying a correction triggers re-evaluation of all atoms, which triggers pattern matching, which may create new conflicting relations, which trigger more corrections.
**Why it happens:** `cleanSuppressedRelations()` in harness-inference.ts handles suppression, but if the correction introduces a new type that conflicts with existing high-confidence inferred relations, loop risk exists.
**How to avoid:** Corrections (sourceAttribution='user-correction') are FINAL and suppress all other relations for that entity+type pair. Apply correction first, then suppress, then re-run patterns — corrections cannot be overwritten by pattern inference in the same cycle.

### Pitfall 5: SolidJS Proxy Breaks Correction Callbacks
**What goes wrong:** Storing the correction handler function in a SolidJS reactive store causes the proxy to silently break function references.
**Why it happens:** Known project gotcha from Phase 8 (see MEMORY.md). SolidJS createStore wraps objects in proxies. Function properties are not proxied correctly.
**How to avoid:** Correction handlers in EntityBadges.tsx must be passed as props (functions in JSX props are safe) or stored as module-level variables. Never store in createStore.

### Pitfall 6: API Rate Limits on Multi-Persona Adversarial Runs
**What goes wrong:** Running 10 personas x 5 cycles x enrichment emulation sequentially takes very long. Running in parallel exceeds Anthropic rate limits.
**Why it happens:** Haiku tier has rate limits. 10 personas x 5 cycles x ~40 items x enrichment Q&A = hundreds of API calls.
**How to avoid:** Sequential persona execution (personas run one after another). Within a persona, items can be batched into larger generation requests. CONTEXT.md says Haiku for bulk emulation (cheap) and Sonnet for gap analysis (targeted). Add `--delay-ms` flag for throttling. Checkpoint + resume is critical for recovering from rate limit errors.

### Pitfall 7: Ablation Cost Explosion
**What goes wrong:** Full ablation (5 components x 10 personas x 5 cycles) is 250 full runs, consuming massive API costs.
**Why it happens:** Each ablated run requires gap-targeted corpus regeneration because the corpus must be appropriate for the disabled-component world.
**How to avoid:** Ablation uses pre-generated corpus (from the full run's cycles), not re-generated corpus. Disable the component in inference only, reprocess the existing items. This makes ablation cheap (no new API calls, just re-running the pipeline).

### Pitfall 8: Entity Timeline Needs Cross-Table Query
**What goes wrong:** "Show all atoms mentioning entity X" requires joining atomIntelligence (entityMentions) with atoms table — but the search/list view may filter on atom properties only.
**Why it happens:** atomIntelligence.entityMentions stores entityId references, but the existing search/sort is on atom fields.
**How to avoid:** Entity timeline filter first queries `db.atomIntelligence.where('atomId').anyOf(...)` after first collecting all atomIds from entityMentions that reference the entity ID. Or add a Dexie index on entityMentions — but simpler is to do the cross-reference in the filter function.

---

## Code Examples

### Cycle State Accumulation

```typescript
// run-adversarial.ts — correct pattern for multi-cycle state
async function runPersonaAdversarial(
  persona: PersonaPaths,
  cycles: number,
  client: Anthropic,
): Promise<PersonaAdversarialResult> {
  const store = new HarnessEntityStore();  // Persists across ALL cycles
  resetHarnessCooccurrence();               // Also persists — only reset between personas

  const cycleResults: CycleState[] = [];
  let previousGaps: RelationshipGap[] = [];

  for (let cycle = 1; cycle <= cycles; cycle++) {
    // Checkpoint resume check
    const checkpoint = loadCheckpoint(persona.name, cycle);
    if (checkpoint) {
      store.restore(checkpoint.storeSnapshot);
      cycleResults.push(checkpoint.cycleState);
      continue;
    }

    // Generate gap-targeted corpus (cycle 1: natural, cycle 2+: adversarial)
    const corpus = await generateCycleCorpus(persona, cycle, previousGaps, client);

    // Process atoms
    for (const item of corpus.items) {
      await runHarnessAtom(item, store);
      await emulateEnrichment(item, store, persona, client);
    }

    flushHarnessCooccurrence(store);
    cleanSuppressedRelations(store);

    // Apply corrections
    const corrections = await generateCorrections(store, groundTruth, client);
    for (const c of corrections) {
      applyCorrection(store, c);
    }

    // Score and extract gaps for next cycle
    const score = scoreEntityGraph(store, groundTruth, corpus.items.length);
    const graphSnapshot = takeGraphSnapshot(store);
    previousGaps = extractGaps(score);

    cycleResults.push({ cycleNumber: cycle, score, graphSnapshot, ... });
    saveCheckpoint(persona.name, cycle, store, cycleResults[cycleResults.length - 1]);
  }

  return { persona: persona.name, cycles: cycleResults };
}
```

### Recency Decay (Production)

```typescript
// Pure utility — src/entity/recency-decay.ts (new file)
export function computeEntityRelevance(
  mentionCount: number,
  lastSeenMs: number,
  nowMs: number = Date.now(),
): number {
  const daysSince = (nowMs - lastSeenMs) / (1000 * 60 * 60 * 24);
  const lambda = Math.LN2 / 30; // ln(2)/30 = half-life of 30 days
  return mentionCount * Math.exp(-lambda * daysSince);
}

// Usage in EntityBadges — sort entities by decayed relevance
const sorted = createMemo(() => {
  return [...props.mentions]
    .filter(m => m.entityType !== 'DATE')
    .map(m => ({
      mention: m,
      relevance: m.entityId && m.lastSeen
        ? computeEntityRelevance(m.mentionCount ?? 1, m.lastSeen)
        : m.confidence,
    }))
    .sort((a, b) => b.relevance - a.relevance)
    .map(r => r.mention);
});
```

### Semantic Sanitization Tag Upgrade

```typescript
// In entity-registry.ts — extended buildEntityMap
export async function buildEntityMapWithRelationships(
  entities: DetectedEntity[],
): Promise<{ entityMap: Map<string, string>; reverseMap: Map<string, string> }> {
  const entityMap = new Map<string, string>();
  const reverseMap = new Map<string, string>();

  for (const entity of entities) {
    if (entity.category !== 'person') {
      // Non-person: use existing pseudonym logic
      const shouldRestore = await getRestorePreference(entity.text, entity.category);
      if (shouldRestore) continue;
      const { tag } = await getOrCreatePseudonym(entity.text, entity.category);
      entityMap.set(tag, entity.text);
      reverseMap.set(entity.text, tag);
      continue;
    }

    // Person: check entity registry for known relationship
    const knownRelation = await findHighestConfidenceRelation(entity.text);
    if (knownRelation) {
      const tag = `[${knownRelation.relationshipType.toUpperCase()}]`;
      entityMap.set(tag, entity.text);
      reverseMap.set(entity.text, tag);
    } else {
      // Fall back to pseudonym
      const { tag } = await getOrCreatePseudonym(entity.text, entity.category);
      entityMap.set(tag, entity.text);
      reverseMap.set(entity.text, tag);
    }
  }

  return { entityMap, reverseMap };
}

async function findHighestConfidenceRelation(entityText: string): Promise<EntityRelation | null> {
  // 1. Find entity by normalized text match
  const entity = await db.entities.where('canonicalName').equals(entityText).first()
    ?? await db.entities.filter(e => e.aliases.includes(entityText)).first();
  if (!entity) return null;

  // 2. Find best relation (user-corrections first, then highest confidence)
  const relations = await db.entityRelations
    .where('targetEntityId').equals(entity.id)
    .or('sourceEntityId').equals(entity.id)
    .toArray();

  const userCorrections = relations.filter(r => r.sourceAttribution === 'user-correction');
  if (userCorrections.length > 0) return userCorrections[0]!;

  const high = relations.filter(r => r.confidence >= 0.6);
  return high.sort((a, b) => b.confidence - a.confidence)[0] ?? null;
}
```

### Investment Report Structure

```typescript
// generate-investment-report.ts
interface InvestmentItem {
  title: string;                    // e.g., "Temporal reasoning ONNX agent"
  description: string;
  expectedAccuracyGain: string;     // e.g., "+12-15% relationship recall"
  implementationComplexity: 'LOW' | 'MED' | 'HIGH';
  dependencies: string[];           // e.g., ["custom training data (500+ examples)"]
  derivedFrom: string;              // e.g., "Ablation: enrichment mining = 23% of found relationships"
  priority: number;                 // 1 = highest
}

// Auto-derived from ablation results:
// - If component X contributes Y% of relationships, flag as HIGH value
// - If component X contributes <5%, flag as REMOVE candidate
// - Top missed relationship categories across all personas → ONNX agent candidates
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single-cycle natural corpus harness | 5-cycle adversarial + gap-targeted generation | Phase 29 | Tests robustness, not just recall |
| Static pseudonym tags `<Person 1>` | Semantic relationship tags `[SPOUSE]` | Phase 29 | Cloud gets semantic meaning, not identity |
| Entity badges display-only | Entity badges with correction popover | Phase 29 | Enables ground truth collection from real users |
| Keyword patterns fixed confidence | Auto-tuned confidence from multi-persona evidence | Phase 29 | Self-improving pattern bank |
| 3 personas (Phase 28) | 10+ diverse personas (Phase 29) | Phase 29 | Cross-archetype validation removes persona-specific bias |

---

## Open Questions

1. **Enrichment emulation API cost**
   - What we know: Haiku is cheap (~$0.25/MTok). 10 personas x 5 cycles x ~40 items x ~3 Q&A rounds = ~6,000 Haiku calls.
   - What's unclear: Exact token count per Q&A call. At ~500 tokens each = 3M tokens = ~$0.75 total for Haiku emulation. That's fine.
   - Recommendation: Pre-compute cost estimate with a test Haiku call and print it in `--dry-run` mode. Proceed; cost is acceptable.

2. **Synthetic timestamps format for decay validation**
   - What we know: Entity's `lastSeen` is a Unix millisecond timestamp. CONTEXT.md says harness should use realistic timestamps spanning weeks/months.
   - What's unclear: How to inject synthetic timestamps into HarnessEntityStore when items are processed in seconds (not real time).
   - Recommendation: CorpusItem gets an optional `syntheticTimestamp` field. Each cycle's corpus items span a realistic date range (e.g., cycle 1 = 4 weeks ago, cycle 5 = now). `runHarnessAtom()` uses the synthetic timestamp when updating `entity.lastSeen`. HarnessEntityStore needs a `now` override parameter.

3. **Harness enrichment emulator: full question-generation or simplified Q&A simulation?**
   - What we know: Production enrichment engine is complex (ENRICH-01 through ENRICH-10). Replicating full question templates in harness is significant work.
   - What's unclear: Does the harness need to generate realistic questions, or just simulate realistic answers?
   - Recommendation: The HARNESS does NOT need to replicate question templates. It just needs to simulate the answers. Prompt Haiku: "Here is a GTD inbox item and the persona profile. Generate 3 realistic enrichment Q&A pairs — the kind this person would answer if asked to clarify their action, timeframe, and context." The answers are what matter for entity mining, not the questions.

4. **Experiment naming and experiment isolation**
   - What we know: CONTEXT.md specifies `scripts/harness/experiments/{name}/`. Results are named experiments.
   - What's unclear: Does each experiment start fresh or can it build on a prior experiment's personas?
   - Recommendation: Each experiment is self-contained (fresh personas, fresh corpora). But the persona JSON files (`synthetic-user.json`) can be reused across experiments — they don't change. The adversarial corpus and graph snapshots are experiment-specific.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (existing — `vitest.config.ts` present) |
| Config file | `vitest.config.ts` at root |
| Quick run command | `pnpm test` |
| Full suite command | `pnpm test --run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ENTC-01 | Entity context injected into enrichment T3 | unit | `pnpm test src/ai/enrichment/t3-enrichment.test.ts -t "entity"` | ❌ Wave 0 |
| ENTC-02 | Correction saved as confidence 1.0 to Dexie | unit | `pnpm test src/storage/entity-helpers.test.ts -t "correction"` | ❌ Wave 0 |
| ENTC-03 | Entity relationship → GTD context tag mapping | unit | `pnpm test src/ai/enrichment/enrichment-engine.test.ts -t "entity context"` | Partial (existing test file) |
| ENTC-04 | Recency decay formula correctness | unit | `pnpm test src/entity/recency-decay.test.ts` | ❌ Wave 0 |
| ENTC-05 | Entity timeline query returns correct atom IDs | unit | `pnpm test src/storage/entity-helpers.test.ts -t "timeline"` | ❌ Wave 0 |
| TVAL-01 | Harness 80%+ after cycle 5 across all personas | integration | `npx tsx scripts/harness/run-adversarial.ts --dry-run` | ❌ Wave 0 |
| TVAL-02 | Investment report generates with correct schema | smoke | `npx tsx scripts/harness/generate-investment-report.ts --dry-run` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test --run src/` — unit tests only
- **Per wave merge:** `pnpm test --run` — full suite
- **Phase gate:** Full suite green + harness dry-run passes before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/entity/recency-decay.test.ts` — covers ENTC-04 formula
- [ ] `src/storage/entity-helpers.test.ts` additions — covers ENTC-02 correction, ENTC-05 timeline query
- [ ] `scripts/harness/run-adversarial.ts` — TVAL-01 entry point (created in Wave 1)
- [ ] `scripts/harness/generate-investment-report.ts` — TVAL-02 (created in Wave 2)

---

## Sources

### Primary (HIGH confidence — direct codebase inspection)
- `scripts/harness/harness-pipeline.ts` — Phase 28 pipeline, extension points for enrichment emulation
- `scripts/harness/run-harness.ts` — Multi-persona run pattern, adapt for adversarial cycles
- `scripts/harness/score-graph.ts` — GraphScore type, P/R/F1 calculation, extend for ablation
- `scripts/harness/harness-inference.ts` — Pattern engine, co-occurrence, extend for answer mining
- `scripts/harness/write-reports.ts` — Report structure, extend for investment report
- `scripts/harness/generate-corpus.ts` — Corpus generation prompt, adapt for gap-targeted generation
- `scripts/harness/personas/*/reports/*.md` — Baseline performance: Alex 100% at 30 atoms, Dev 100% at 49 atoms, Maria 93.3% at 40 atoms
- `src/ui/components/EntityBadges.tsx` — Current display-only component, extend for correction popover
- `src/ai/sanitization/entity-registry.ts` — `buildEntityMap()`, extend for semantic tags
- `src/ai/enrichment/t3-enrichment.ts` — `T3EnrichmentContext` (line 52-65), add `entitySummary` field
- `src/types/intelligence.ts` — Entity, EntityRelation, AtomIntelligence schemas — no changes needed
- `src/storage/entity-helpers.ts` — `findOrCreateEntity()`, `createRelation()`, add `correctRelationship()`
- `src/config/relationship-patterns.json` — 30+ patterns, auto-tune target
- `.planning/phases/29-entity-consumers-trained-agent-validation/29-CONTEXT.md` — All locked decisions

### Secondary (MEDIUM confidence — project memory cross-reference)
- MEMORY.md: SolidJS store proxy breaks function callbacks — critical for correction UX
- MEMORY.md: Python training uses `-u` flag for unbuffered output — harness uses tsx, not relevant
- MEMORY.md: v5.0 architecture decisions — entity knowledge in sidecar only, never atom.content

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all existing dependencies, no new packages
- Architecture patterns: HIGH — all patterns derived from Phase 28 code that runs
- Pitfalls: HIGH — derived from actual code inspection and known project gotchas
- Harness design: HIGH — extends well-understood Phase 28 foundation
- Production UI: MEDIUM — SolidJS popover requires careful positioning; needs testing

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable stack; no moving parts)
