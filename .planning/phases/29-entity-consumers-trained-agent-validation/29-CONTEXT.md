# Phase 29: Entity Consumers + Trained Agent Validation - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Prove the local T1/T2 cognitive stack achieves emergent user learning on a single device through an adversarial multi-cycle training loop with 10+ diverse synthetic personas. Entity consumers (enrichment context injection, GTD context suggestions, enrichment answer mining) are validated in the harness to prove they improve learning. Production scope is minimal: semantic sanitization wired into real cloud packets, minimal correction UX (badge popover), entity timeline (filtered list link), and recency decay. The harness IS the main deliverable — it proves whether the cognitive stack has promise and generates an actionable investment report for future ONNX agents.

**Priority:** Cognitive stack validation > production features. Prove the stack works before shipping consumers.

</domain>

<decisions>
## Implementation Decisions

### Training loop design
- **5 fixed adversarial cycles** per persona — not converge-to-plateau
- **Gap-targeted generation** — after each cycle, cloud sees full synthetic profile + current entity graph state + exact gaps. Generates items specifically targeting blind spots with aggressive adversarial examples
- **Full synthetic context visibility** — since data is 100% synthetic (cloud-generated), no privacy boundary in training. Cloud sees everything for maximum targeting effectiveness. Privacy boundary enforced only in production with real user data
- **Full lifecycle user emulation** — cloud-as-user performs: (1) triage accept/reject with realistic selectivity, (2) enrichment Q&A answers as the persona would answer (persona-consistent substance), (3) entity corrections when stack gets relationships wrong, (4) re-enrichment requests on atoms the persona cares about. Each interaction is a learning signal
- **Immediate correction + ripple** — when cloud-as-user corrects a relationship, entity graph updates immediately (confidence 1.0). All existing atoms mentioning the corrected entity are re-evaluated. Subsequent items in the same cycle benefit from the correction
- **30-50 items per cycle** — 5 cycles x 30-50 items = 150-250 items per persona
- **Component attribution + ablation** — track per-relationship: was it found by keyword patterns, co-occurrence, enrichment Q&A mining, or entity corrections. Run ablation: disable one component at a time, re-score across all personas. Shows which components are load-bearing vs redundant
- **Cloud coaching feedback** — cloud self-evaluates semantic tag quality AND coaches on missing context: "The [SPOUSE] tag helped, but I'm missing [SPOUSE]'s occupation which would help suggest calendar scheduling." Feeds into gap targeting and investment report
- **Enrichment quality measurement** — harness compares enrichment WITHOUT entity context vs WITH entity context. Cloud evaluator rates which extracted more useful GTD-relevant information

### Persona strategy
- **10+ diverse personas** generated via reusable CLI tool
- **Diversity dimensions:** relationship complexity (nuclear to blended family), cultural naming patterns (hyphenated, patronymic, mononyms, title variations), GTD usage style (terse to verbose), life stage/archetype (student, early career, parent, executive, retiree, freelancer)
- **Minimum coverage matrix** — each persona must cover: 2+ family relationships, 1+ work relationship, 1+ service provider, 1+ org membership. Cloud validates coverage before accepting
- **Binder-type parameterized** — persona generator accepts `--binder-type` flag. GTD personas get family/health/work relationships. Future PM binder gets client/vendor/team. All diversity dimensions coded into 3-ring architecture so they change completely for other binder types
- **Reusable CLI tool** — `node scripts/harness/generate-persona.ts --archetype retiree --complexity high --binder-type gtd-personal`. Generates persona JSON + ground truth + initial corpus. Reusable for future milestones

### Graph persistence + snapshots
- **Full graph + diff + intelligence sidecar** saved after each cycle
- Per-persona graph snapshots: entities, relationships, evidence, confidence at each checkpoint
- Diff showing what changed since last cycle (new entities, confidence changes, new edges)
- Complete atomIntelligence sidecar records (entity mentions, enrichment Q&A, cognitive signals)
- Stored at `scripts/harness/personas/{name}/graphs/cycle_{N}.json`
- Enables evaluating database scaling and shape over time

### Semantic sanitization (production-wired)
- **Relationship tags replace pseudonyms** when entity has known relationship: `"Pam" → "[SPOUSE]"`, `"Dr. Chen" → "[DENTIST]"`. When no relationship known: fall back to current `<Person 1>` pseudonym
- **Tag selection: user-corrected preferred + context-relevant** — user-corrected relationships (confidence 1.0) always win. Among inferred relationships, pick the one most contextually relevant to the atom being sanitized
- **Layered architecture** — semantic sanitization optimizes for meaning preservation. Future adversarial privacy agents (post-v5.0) optimize for privacy cost control. Separate concerns, composable, independently measurable
- **Leakage measurement deferred** to privacy budget layer (post-v5.0). Phase 29 proves semantic tags work and improve cloud reasoning

### Entity context injection (harness-validated, not production-wired)
- **Both: templates for T1/T2, summary for T3** — T1/T2 uses slot-filled entity templates for fast offline questions. T3 gets full entity summary block (detected entities + known relationships + confidence) for richer LLM-crafted questions
- **Interface-driven GTD context suggestions** — binder type defines how entity relationships map to context tags. GTD ships relationship→context mappings. Strategy is pluggable via existing binder-type config architecture
- **Recency-weighted context injection** — entities mentioned recently rank higher in enrichment context. Prevents stale entities from crowding out relevant ones

### Enrichment answer mining (harness-validated, not production-wired)
- **Full inference on each answer** — NER + keyword pattern matching + co-occurrence tracking on every enrichment answer submission. Same lifecycle as atom content detection
- **Live feedback loop** — entities from answer N available for question N+1 within the same enrichment session. Progressive revelation within a single session
- **Atom sidecar + enrichment record provenance** — atom's atomIntelligence gets full entity mentions (for graph). Enrichment Q&A records get lightweight entity ID references (for provenance tracking). Provenance enables smarter corrections — trace which signal caused a wrong inference
- **Live badge updates** — entity badges refresh after each enrichment answer in real-time
- **Full co-occurrence from answers** — enrichment answers treated like atom content for co-occurrence purposes

### Entity knowledge isolation
- **Entity knowledge exists ONLY in sidecar** — atomIntelligence, entities table, entityRelations table. Atom content is never modified by entity inference. Content stays pure user text. Intelligence accumulates separately (Phase 26 architecture)
- **No graph crawling of atom content** — the truth layer is the sidecar, not content. An atom's text may seem to disagree with high-confidence inferences (e.g., "coffee with Pam from accounting" when Pam is known spouse). The sidecar holds the corrected truth

### Recency decay (production-wired)
- **On-read computation** — compute decay on-the-fly when entity data is accessed. Formula: `relevance = mentionCount * e^(-λ * daysSinceLastSeen)`, `λ = ln(2)/30`. No background jobs, no stored values. Always fresh
- **Synthetic timestamps in harness** — corpus items include realistic timestamps spanning weeks/months. Decay computed against these timestamps even though harness runs in seconds
- **Decay validation in harness** — some entities appear early and never again. Harness validates they decay in relevance ranking while remaining findable

### Minimal correction UX (production-wired)
- **Badge tap → popover** — tap entity badge shows: entity name, type, inferred relationship(s) with confidence. Two actions: [✓ Correct] and [Fix ▼]. Fix opens context-filtered dropdown of top 5-6 most relevant relationship types based on entity type and atom context. 'Other...' for custom type. Correction saves as confidence 1.0 user-correction
- **Entity timeline** — popover includes 'See all N atoms →' link. Navigates to existing list/search view filtered by that entity. No new page — reuses existing search with entity filter

### Benchmark criteria
- **80% relationship accuracy after cycle 1** (natural corpus), **90%+ after 5 cycles** (with corrections and gap-targeting). If plateau below 85%, flag for investigation
- **Metrics tracked:** relationship accuracy (P/R/F1), entity dedup quality (merge precision/recall), semantic sanitization coverage (% entities with relationship tags vs pseudonym fallback), learning curve shape (logarithmic vs linear), cross-persona consistency (per-archetype performance variance)
- **All personas, all ablations** — ablation testing runs on every persona. Shows whether component importance varies by user archetype

### Harness execution model
- **Tiered API models** — Haiku for bulk user emulation (enrichment answers, triage, corrections). Sonnet for gap analysis, coaching feedback, corpus generation, scoring evaluation. Keeps cost under $20-30 per full training run
- **Checkpoint + resume** — after each persona-cycle, save checkpoint. CLI supports `--resume` to pick up from last checkpoint. Survives failures and enables batch runs across sessions
- **CI-ready with exit codes** — exit 0 if all personas pass thresholds, exit 1 if any fail. JSON output for programmatic parsing. Ready for GitHub Actions regression testing
- **Named experiments** — each run gets a name (auto or `--name`). Results saved to `scripts/harness/experiments/{name}/`. Compare across experiments to track stack evolution
- **Auto-tune patterns** — after all personas complete, patterns with >70% precision keep/increase confidence. Patterns with <40% precision get flagged and confidence halved. New patterns suggested based on common false negatives. Changes written to `tuned-patterns.json` alongside original

### Investment report
- **Actionable report** — after all personas complete, ranks recommended ONNX agents/local strategies by expected accuracy improvement
- **Impact + complexity matrix** — each recommendation includes: expected accuracy gain, implementation complexity (LOW/MED/HIGH), dependencies, estimated training data needs
- **Derived from ablation + gap analysis** — "Keyword patterns carry 60% of relationships. Gap: temporal reasoning. A temporal ONNX agent could close 15% of remaining gaps. Impact: HIGH, Complexity: MEDIUM, Requires: date-fns + custom training data"

### Claude's Discretion
- Exact persona archetypes and their ground truth details
- Parallelism strategy for persona execution (based on API rate limits)
- Decay application scope (badge ordering, search ranking — where it helps vs adds noise)
- Harness inference wrapper design for entity context injection testing
- Ablation component list (keyword patterns, co-occurrence, enrichment mining, corrections, recency decay)
- Auto-tune convergence criteria and pattern suggestion methodology

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/harness/harness-pipeline.ts`: Phase 28 headless pipeline (triage → entity detection → relationship inference). Extend with enrichment emulation and adversarial cycles
- `scripts/harness/score-graph.ts`: Scoring engine with entity F1, relationship F1, privacy score. Extend with ablation, enrichment quality, decay validation
- `scripts/harness/harness-inference.ts`: `runHarnessKeywordPatterns()`, `updateHarnessCooccurrence()`. Extend for enrichment answer mining
- `scripts/harness/write-reports.ts`: Per-persona JSON + Markdown reports. Extend with aggregate cross-persona reports, investment report, learning curve charts
- `src/ai/sanitization/sanitizer.ts`: Dual-path NER detection, `detectEntitiesForKnowledgeGraph()` (line 355). Wire semantic tags here
- `src/ai/sanitization/entity-registry.ts`: Pseudonym registry with `getOrCreatePseudonym()`. Extend to check entity relationships before falling back to pseudonyms
- `src/ai/enrichment/enrichment-engine.ts`: Cognitive signal prioritization via `SIGNAL_CATEGORY_MAP`. Extend with entity context
- `src/ai/enrichment/t3-enrichment.ts`: `T3EnrichmentContext` (line 52-65). Add entity summary block for harness validation
- `src/ai/clarification/question-templates.ts`: Slot-filling with `{topic}`, `{person}`, `{location}`. Add entity-aware templates
- `src/storage/entity-helpers.ts`: `findOrCreateEntity()`, `createRelation()`, `cleanupEntityMentionsForAtom()`. Add correction endpoint
- `src/ui/components/EntityBadges.tsx`: Color-coded chips with confidence sorting. Add tap → popover with correction UI
- `src/config/relationship-patterns.json`: 30+ keyword patterns. Auto-tune target

### Established Patterns
- Worker message protocol: typed messages with UUID request IDs
- Pure module pattern: AI pipeline files import no store
- Dexie direct writes for sidecar (not WriteQueue)
- JSON config pattern: `src/config/binder-types/` for methodology-specific configs
- HarnessEntityStore: synchronous Map ops for deterministic offline scoring
- Phase 28 reporting pattern: JSON + Markdown in reports/ directories

### Integration Points
- `src/ai/sanitization/sanitizer.ts`: Wire entity relationship lookup into sanitization flow for semantic tags
- `src/storage/entity-helpers.ts`: Add user correction persistence (confidence 1.0, source=user-correction)
- `scripts/harness/`: Extend pipeline for 5-cycle adversarial loop, enrichment emulation, ablation, experiment tracking
- `src/ui/components/EntityBadges.tsx`: Add tap handler → correction popover
- Entity `lastSeen` timestamps: power recency decay formula in on-read computation

</code_context>

<specifics>
## Specific Ideas

- "I want Phase 29 to focus on creating the most optimized local cognitive stack for a GTD binder we can possibly get. We can delay any other features until we prove this is yielding positive results"
- "I want even more than 3 personas if you think it will help improve real world performance of the local stack ultimately giving us true valuable insights into what ONNX agents or other local intelligence strategies we might need to employ"
- "My hope is the cloud can fully emulate users and see how the local stack learns and performs through progressive revelation"
- "I want the most aggressive adversarial examples we can come up with including those synthetic user's real-life PWA interaction signals"
- Graph snapshots at each cycle checkpoint — user wants to "evaluate how the database is scaling and the shape it is taking"
- Auto-tune patterns across personas — system should self-improve, not just measure
- Investment report with impact + complexity matrix — directly informs what to build next
- Entity provenance on enrichment records enables smarter corrections — trace which signal caused a wrong inference
- All diversity dimensions coded into 3-ring architecture so they change completely for other binder types
- Layered privacy architecture: semantic sanitization preserves meaning (Phase 29), adversarial privacy agents control leakage cost (post-v5.0)

</specifics>

<deferred>
## Deferred Ideas

- **Entity-aware enrichment in production** — harness-validated in Phase 29, production wire when proven beneficial
- **Enrichment answer mining in production** — harness-validated, wire after training confirms value
- **GTD context suggestions from entities in production** — harness-validated, wire after training confirms value
- **Adversarial privacy agents** — whole-person masking/obfuscation/noise-injection, privacy budget per binder lifetime (post-v5.0, see chat7.txt)
- **Information leakage measurement** — can cloud infer real identity from semantic tags? Deferred to privacy layer
- **Progressive difficulty tiers** — pre-defined difficulty levels instead of gap-targeting (decided gap-targeting is better)
- **Background backfill entity detection** — scan existing atoms for entities (deferred from Phase 27)
- **Entity merge suggestion UX** — inline badge indicator for potential merges (more advanced correction UX)

</deferred>

---

*Phase: 29-entity-consumers-trained-agent-validation*
*Context gathered: 2026-03-12*
