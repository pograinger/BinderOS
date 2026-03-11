# Phase 28: Relationship Inference + Cognitive Harness - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Infer relationships between entities using keyword patterns and co-occurrence evidence, AND build a headless testing harness with a synthetic user profile that exercises the full local pipeline (triage -> enrichment -> entity detection -> relationship inference) and scores the resulting entity graph against ground truth. No entity correction UX (Phase 29), no entity-aware enrichment questions (Phase 29), no adversarial multi-cycle training loop (Phase 29).

</domain>

<decisions>
## Implementation Decisions

### Keyword pattern bank
- **JSON config file** in binder-type config directory — easy to add/edit patterns without code changes, extensible for future binder types
- **Same-sentence scoping** — keywords only associate with entities in the same sentence, preventing false positives from unrelated entities in the same atom (matches RELI-03)
- **Fuzzy matching** — case-insensitive, handles plurals and verb forms (e.g., 'married'/'marriage'/'marry'). Pattern JSON specifies root keywords, engine handles common variations
- **Custom string relationship types allowed** — patterns can introduce relationship types beyond the existing RELATIONSHIP_TYPES union (e.g., 'neighbor', 'mentor', 'client'). Schema already stores types as strings
- **Implicit self entity** — when a keyword fires with a single PER entity (e.g., "Pam's anniversary"), the relationship is inferred between that entity and the user. No explicit '[USER]' entity in the registry
- **Conflicting patterns coexist** — "Dr. Pam" triggers healthcare-provider AND "Pam's anniversary" triggers spouse. Both relationships stored with independent confidence. User correction (Phase 29) resolves. Multiple relationships between entity pairs are valid

### Claude's Discretion (Keyword patterns)
- Initial confidence per pattern based on keyword specificity — stronger keywords (e.g., 'wife') get higher initial confidence than weaker keywords (e.g., 'anniversary')
- Exact ~20 pattern definitions and their relationship type mappings
- Fuzzy matching implementation (stemming, regex, or keyword variant lists)

### Co-occurrence engine
- **Sentence-level granularity** — two entities in the same sentence = 1 co-occurrence. More precise signal than atom-level
- **Entity ID keys** — co-occurrence Map keyed by sorted entity UUID pairs. Stable across renames and alias changes
- **Device-adaptive flush strategy** — Claude designs a flush approach that balances performance and data protection based on device class. Must use `beforeunload`, `visibilitychange`, and other PWA lifecycle events to be maximally resilient against mid-interaction shutdowns. Architecture should be lightweight and simple while being as robust as possible against data loss
- **Co-occurrence alone creates relationships** — after sufficient co-occurrences (threshold determined by Claude), entity pairs with no keyword pattern get a generic 'associated' relationship type. User correction (Phase 29) can refine the type
- **Minimum co-occurrence threshold >= 2** (from RELI-03) — no relationship from a single co-occurrence

### Claude's Discretion (Co-occurrence)
- Exact flush cadence and device-adaptive thresholds
- Co-occurrence threshold for 'associated' relationship creation
- Whether to use requestIdleCallback, navigator.sendBeacon, or other APIs for resilient flushing
- Evidence snippet extraction (how much surrounding text to capture per co-occurrence)

### Harness architecture
- **Claude's discretion on runtime** — Node.js script, Vitest, or hybrid. Must exercise the full pipeline: triage -> enrichment -> entity detection -> relationship inference
- **Progressive feeding** — atoms fed one at a time, inference runs after each. Learning curve measured at checkpoints (5, 10, 20, 30 atoms)
- **Basic cloud-as-user simulation in Phase 28** — accept/reject triage, simple enrichment answers, entity detection verification. Full rich interaction loop with enthusiastic acceptance, entity corrections, multi-cycle adversarial training deferred to Phase 29
- **JSON + Markdown reports** — JSON for programmatic comparison, Markdown with precision/recall tables and ASCII learning curve chart. Output to scripts/harness/reports/ (consistent with scripts/train/reports/ pattern)

### Synthetic user profile
- **Single persona** — one realistic GTD user with family, work, health providers. Additional personas can be added later as JSON files
- **Ground truth includes entities + relationships + facts** — named entities (Pam, Dr. Chen, Acme Corp), their types (PER/ORG/LOC), relationships (Pam=spouse, Dr. Chen=dentist), and biographical facts ("lives in Portland", "works at Acme")
- **Lives in scripts/harness/** — profile JSON + pre-generated corpus alongside harness code
- **Isolated, not encrypted** — profile exists as plain JSON but pipeline code never reads it. Scoring logic reads it separately for comparison
- **Pre-generated corpus for Phase 28** — cloud generates 30-50 inbox items once via Anthropic API, stores as JSON. Harness runs are deterministic and offline. Phase 29 adds runtime adaptive/adversarial generation
- **80% natural + 20% edge cases** — mostly natural phrasing ("Lunch with Sarah tomorrow") plus deliberate edge cases ("Pam aka Pamela texted", "my boss mentioned Dr. Chen's wife")

### Cloud scoring
- **Privacy score included** — measure how well entity knowledge enables semantic sanitization: 'Pam' -> '[SPOUSE]' instead of '[PERSON]'. Proves entity knowledge improves privacy protection. Forward-looking metric for Phase 29 T2 sanitization
- **Learning curve visualization** — Markdown table with precision/recall at each checkpoint + ASCII line chart showing progression

### Claude's Discretion (Harness + scoring)
- Harness runtime environment
- Synthetic persona complexity (~15-20 entities recommended)
- Exact scoring methodology (separate entity/dedup/relationship P/R vs composite)
- Pre-generated corpus generation prompt design
- How to mock Dexie / pipeline components for headless execution
- Checkpoint intervals for learning curve

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/storage/entity-helpers.ts`: `createRelation()`, `findOrCreateEntity()` with dedup — extend for relationship inference writes
- `src/types/intelligence.ts`: `EntityRelation` schema with evidence[], sourceAttribution, confidence — ready for keyword and co-occurrence sources
- `src/types/intelligence.ts`: `RELATIONSHIP_TYPES` union — keep as suggestions but allow custom string types
- `src/ai/tier2/cognitive-signals.ts`: 10 ONNX cognitive models — signals can inform which relationships to prioritize
- `src/storage/atom-intelligence.ts`: Sidecar CRUD — `getIntelligence()`, `writeEntityMentions()` for reading entity mentions during inference
- `src/workers/sanitization-worker.ts`: DETECT_ENTITIES handler returns raw NER results — inference runs on main thread using these results
- `scripts/train/`: Existing Python training infrastructure with reports/ pattern — harness follows same conventions

### Established Patterns
- Worker message protocol: typed messages with UUID request IDs
- Pure module pattern: AI pipeline files import no store
- Dexie direct writes for sidecar (not WriteQueue)
- JSON config pattern: `src/config/binder-types/` for methodology-specific configs — relationship patterns can follow this

### Integration Points
- Entity detection lifecycle (Phase 27): after NER detects entities, relationship inference runs on the same atom
- `src/storage/entity-helpers.ts`: `createRelation()` for persisting inferred relationships
- `src/storage/db.ts`: `entityRelations` table with indexes on sourceEntityId, targetEntityId, [sourceEntityId+relationshipType]
- `src/ai/sanitization/entity-registry.ts`: Pseudonym registry — separate from knowledge graph, but Phase 29 will use entity knowledge to improve pseudonym quality

</code_context>

<specifics>
## Specific Ideas

- User wants the co-occurrence flush to be "really intelligent" — device-adaptive, performant, lightweight architecture, but maximally robust against data loss in PWA lifecycle events (tab close, app shutdown mid-interaction)
- Training should be progressive like real-world usage — start from zero, feed atoms one at a time, measure the learning curve as knowledge accumulates. This mirrors real user onboarding
- Cloud-as-user should be "smart about what it accepts" and "enthusiastic when the local stack is insightful" — this full interactive richness is Phase 29, but Phase 28 lays the infrastructure
- Pre-generated corpus for Phase 28, adaptive runtime generation for Phase 29's adversarial training loop — the cloud sees gaps and generates harder items targeting them
- Privacy scoring proves the v5.0 thesis: entity knowledge protects the user. 'Pam' -> '[SPOUSE]' is more meaningful than '[PERSON]' for cloud interactions

</specifics>

<deferred>
## Deferred Ideas

- **Adversarial multi-cycle training loop** — cloud generates harder items targeting gaps, local stack improves iteratively (Phase 29 TVAL-01, TVAL-02)
- **Full cloud-as-user interaction** — enthusiastic acceptance, entity corrections, enrichment Q&A, atom graduation simulation (Phase 29)
- **Entity-aware enrichment questions** — "You mentioned Sarah (your wife)" (Phase 29 ENTC-01)
- **Entity correction UX** — inline entity cards, editable relationships (Phase 29 ENTC-02)
- **T2 semantic sanitization using entity knowledge** — 'Pam' -> '[SPOUSE]' in cloud packets (Phase 29 TVAL-02)
- **Multiple synthetic personas** — different user archetypes for comprehensive testing (future)
- **Batch feeding mode** — process full inbox at once for throughput testing (future)

</deferred>

---

*Phase: 28-relationship-inference-cognitive-harness*
*Context gathered: 2026-03-11*
