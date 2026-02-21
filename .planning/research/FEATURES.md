# Feature Research

**Domain:** Local-first personal information management / life OS (information theory principles)
**Researched:** 2026-02-21
**Confidence:** MEDIUM-HIGH (table stakes HIGH from market observation; BinderOS-specific differentiators MEDIUM from first-principles reasoning)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Fast capture (keyboard shortcut / quick entry) | Every major PKM has it — Things 3, Todoist, Obsidian, Capacities. Users need frictionless entry or they don't use the system. | LOW | Must work without navigating to a specific view. Global hotkey or command palette trigger. |
| Full-text search across all atoms | Fundamental to any information system. If you can't find it, it doesn't exist. | MEDIUM | Must cover all atom types: Task, Fact, Event, Decision, Insight. Boolean/filter support expected. |
| Offline operation (no network required) | Local-first is the value proposition. Any cloud dependency breaks user trust. | MEDIUM | IndexedDB/OPFS already in scope. Confirm zero network calls for core read/write. |
| Data export / portability | Users cite proprietary lock-in as primary abandonment reason. Markdown and JSON are the expected formats. | LOW | Export must be human-readable. Atoms → JSON + Markdown at minimum. |
| Keyboard-driven navigation | Power users (the likely early adopters here) abandon tools that require too many mouse clicks. | MEDIUM | Command palette, arrow key navigation in lists, hotkeys for common actions. |
| Undo / change history | Users make mistakes. Local change log is already in scope — this surfaces it as a UI feature. | MEDIUM | Already planned as "change logging." Make it accessible (Ctrl+Z at minimum, browse log optionally). |
| Filtering and sorting of atom lists | Without filter/sort, lists become unusable past ~20 items. Every serious PKM tool has this. | MEDIUM | Filter by type, status, date range, priority tier. Sort by date, priority score, last updated. |
| Tagging / lightweight categorization | Users expect some form of labeling beyond the 5 atom types. | LOW | Tags as a lightweight cross-cutting dimension. Not a replacement for types or sections. |
| Date assignment (due dates, scheduled dates) | Task management is impossible without temporal anchoring. Even Things 3's minimal approach has start + due dates. | LOW | Tasks need due date. Events are dated by nature. "Scheduled" date separate from due date for Tasks. |
| Atomic linking (cross-references between atoms) | Bidirectional links are now mainstream — Obsidian normalized this. Users expect to be able to connect items. | MEDIUM | Already in scope via atom "links" field. UI must surface backlinks explicitly. |
| Command palette | Obsidian, Tana, Capacities all have it. Power users route around menu hierarchies entirely. | LOW | Keyboard-accessible list of all actions. Replaces most dedicated toolbar buttons. |
| Status tracking on Tasks | Without done/pending/blocked states, task management is broken. | LOW | Task status: open, in-progress, waiting, done, cancelled. Minimum viable set. |
| Entropy / health visibility | This is table stakes FOR BINDEROS specifically given its core value prop. A health indicator with no indicator is no system at all. | MEDIUM | Green/yellow/red already planned. Must be prominent, not buried in settings. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Typed atom model (Task, Fact, Event, Decision, Insight) | No other mainstream tool enforces a typed information alphabet. Forces classification that prevents entropy accumulation — addresses the #1 PKM failure mode (unstructured dumping). | HIGH | Five types only. Type is mandatory, not optional. System never accepts an "untyped" atom after inbox triage. |
| Computed priority scoring | `P = f(deadline, importance, recency, dependencies, energy)` — replaces static !1/!2/!3 priority flags that decay into noise. Priority reflects real-time life state. | HIGH | Requires WASM module. Expose the formula but not the knobs; too many configuration options undermine trust. |
| Staleness decay engine | Items lose relevance over time unless touched, linked to active work, or pinned. No other mainstream tool actively degrades stale items. | HIGH | Visual staleness indicator per atom. Decay rate configurable (weekly vs monthly) but with opinionated defaults. |
| Hard caps (inbox cap, open task cap) | Enforces system discipline by preventing infinite accumulation. Forces decision-making rather than deferral. No competitor does this. | MEDIUM | Inbox cap (e.g., 20 items) and open task cap (e.g., 30 tasks). System surfaces cap clearly and blocks new entry when reached. |
| Compression rituals (AI-assisted) | Surface candidates for summarization, archiving, or deletion. Active entropy management vs passive accumulation. | HIGH | Requires AI layer. Surfaces atoms: (a) stale, (b) zero-link, (c) semantically similar to existing fact. User decides; AI suggests. |
| Entropy budget as system metaphor | The core identity of BinderOS. No PKM tool frames system health as an information-theoretic budget. Gives users a mental model for why they should manage the system, not just use it. | MEDIUM | Entropy score = function of (open tasks, stale items, zero-link atoms, inbox length). Score surfaces on every view, not just a dedicated dashboard. |
| Link density signal | High-link atoms = core knowledge. Zero-link stale atoms = entropy candidates. This graph-density heuristic is novel and actionable in a way that Obsidian's graph view is not (graph view is beautiful but doesn't tell you what to do). | MEDIUM | Per-atom link count visible. List views can sort by "link density" to surface what's connected vs orphaned. |
| AI as orchestrator, not author | Other tools use AI to generate content. BinderOS uses AI to prioritize, suggest compression, surface stale items — keeping the user as the author. Philosophically distinct from Notion AI / Tana AI. | HIGH | Pluggable AI interface. Must work with local LLMs (Ollama) or disabled entirely, not require cloud. |
| Binder metaphor (Sections → Pages → Atoms) | Three-layer information architecture matches how people actually think about their life system. Sections are stable (PARA-like); pages are dynamic queries. More coherent than flat graph approaches. | MEDIUM | Sections = stable structure (Projects, Areas, Resources, Archive). Pages = named queries. Must enforce that Pages do not become data silos. |
| Pages as queries, not storage | Prevents the duplication problem that plagues Notion (same info in multiple databases). One source of truth at the atom level. | HIGH | Query engine over atoms must be fast enough to feel instant. Pages define filter + sort + grouping rules, not additional data. |
| WASM-powered embedded content | IronCalc spreadsheets embedded inside atoms. No other PKM tool lets you compute inside a fact or decision. High value for people tracking numbers (budgets, scores, metrics). | HIGH | IronCalc is the planned implementation. Treat as a stretch differentiator — defer if it blocks MVP. |
| Structured input enforcement | Every item must be typed before leaving the inbox. No free-form dumping without classification. Distinct from all tools that allow untyped notes. | LOW | Classification prompt appears immediately on inbox item creation. Cannot save without selecting a type. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Unlimited infinite inbox | Feels convenient — "I'll sort it later" | Destroys the entropy budget. The inbox cap is the mechanism that makes triage happen. Without a cap, the inbox becomes a second task list. | Hard cap with clear count display. When full, the system forces triage before accepting new items. |
| Free-form untyped notes | "Sometimes I just want to jot something down" | Untyped content is the primary source of PKM system decay. If any item can be untyped, users will default to untyped for everything, and the atom model loses value. | Inbox accepts raw text but immediately prompts for classification. Inbox items without type are never atoms — they're pre-atoms awaiting processing. |
| Nested folders / hierarchical organization | Notion/Obsidian users expect it. Feels natural. | Folder hierarchy is a static structure that requires constant maintenance and diverges from actual relationships. BinderOS's three-layer architecture (Sections → Pages → Atoms) is intentionally flat at the atom layer to prevent hierarchy bloat. | Tags for cross-cutting labels. Links for explicit relationships. Sections for stable life domains. Pages for contextual views. |
| Real-time collaboration | "Can my partner use this too?" | This is explicitly a personal, single-user, local-first tool. Adding collaboration requires an auth system, conflict resolution, a server, and fundamentally changes the privacy model. | Point to self-hosting as the boundary. A second person gets their own instance. |
| Cloud sync (managed, automatic) | Users want their data on multiple devices | Cloud sync requires a server, which violates local-first constraints and adds operational complexity. The v1 is single-device. | Design the data model for future CRDT-based P2P sync (like Anytype does), but ship v1 as single-device. Export/import as interim data transfer method. |
| Rich text / WYSIWYG editor per atom | Notion made rich text editing expected | Rich text editors are complex, heavy, and encourage long-form note-dumping that defeats the atom model. Atoms should be concise by design. | Markdown support within atom content fields. Enough formatting for clarity, not enough to write a novel. Enforce content length guidelines via UX. |
| Habit tracking | Life OS tools universally include habit trackers | Habits are a separate domain (behavioral repetition tracking) that doesn't fit the atom model cleanly. It would require a sixth atom type or a separate subsystem, both of which add scope without advancing the core thesis. | Tasks with recurrence rules handle habitual actions. A habit that matters should be a Task. Dedicated habit tracking is explicitly out of scope. |
| Dashboards with custom widgets | "Tony Stark" UI vision is appealing | Fully custom dashboards create ongoing maintenance burden for both developers and users. Users spend time building dashboards instead of using the system. | Opinionated pages with fixed, well-designed layouts. Allow limited customization (show/hide sections) but not full custom widget composition. Defer rich dashboards to post-MVP. |
| Calendar view (full calendar UI) | Task managers with due dates should have calendars | Calendar views are complex to build correctly (drag/drop rescheduling, recurring events, time-blocking) and distract from the priority-scored list that is BinderOS's core interaction model. | Show due dates on Tasks in list views. An "Events this week" page view handles event display. Full calendar is post-MVP. |
| AI-generated content (notes, summaries as content) | Seems like a time-saver | AI-generated atoms undermine the user's authorship and the system's trustworthiness. If the system auto-inserts facts you didn't validate, you can't trust the system model of your life. | AI surfaces suggestions only. User explicitly accepts/rejects. AI never writes atoms; only proposes. |
| Plugin ecosystem | Obsidian's plugin ecosystem is a major draw | Plugins allow users to break the atom model, bypass caps, or add incompatible data structures. BinderOS's information-theoretic constraints only work if the system enforces them. A plugin that removes the task cap defeats the purpose. | Ship well-designed built-in features. Accept that BinderOS is opinionated and that some users will prefer Obsidian. The pluggable AI interface is the extension point. |
| Daily notes / journal | Logseq and Capacities make daily notes central | Daily notes encourage the exact behavior BinderOS is designed to prevent: dumping unprocessed content into a date-based container. Journal-style capture is incompatible with the structured atom model. | Inbox is the capture mechanism. Items captured today are visible and timestamped. A "captured today" filter provides the "daily notes" view without a separate journal system. |

---

## Feature Dependencies

```
[Inbox with cap]
    └──requires──> [Structured input / type selection]
                       └──requires──> [Five atom types defined]

[Staleness decay]
    └──requires──> [Priority scoring engine]
                       └──requires──> [Atom timestamps (created_at, updated_at)]

[Compression rituals (AI)]
    └──requires──> [Staleness decay]
    └──requires──> [Link density tracking]
    └──requires──> [Pluggable AI layer]

[Pages as queries]
    └──requires──> [Atom store with filter/sort API]
                       └──requires──> [Typed atom model]

[Entropy health indicator]
    └──requires──> [Staleness decay]
    └──requires──> [Open task cap enforcement]
    └──requires──> [Inbox cap enforcement]
    └──requires──> [Link density tracking]

[Computed priority scoring]
    └──requires──> [Atom timestamps]
    └──requires──> [Task due dates]
    └──requires──> [Atom link graph]

[AI orchestration]
    └──requires──> [Pluggable AI interface]
    └──requires──> [Compression rituals]
    └──requires──> [Computed priority scoring]
    └──enhances──> [Entropy health indicator]

[Export / portability]
    └──requires──> [Typed atom store with stable schema]

[Backlinks UI]
    └──requires──> [Atom link graph]
    └──enhances──> [Link density tracking]

[Command palette]
    └──enhances──> [All navigation and action features]

[WASM embedded content (IronCalc)]
    └──requires──> [Atom content model with rich content support]
    └──conflicts──> [Minimal atom philosophy] (tension — manage carefully)
```

### Dependency Notes

- **Typed atom model is the foundation:** Every differentiating feature depends on atoms having enforced types. Type system must be built first and must be non-bypassable.
- **Priority scoring unlocks staleness decay:** The P-score is the basis for determining what's "stale." Build scoring before decay.
- **AI layer requires everything else:** Compression rituals and AI orchestration are last in the dependency chain. AI features should be Phase 3+, not Phase 1.
- **Pages as queries conflicts with data silos:** If pages ever store data (not just queries), the system degrades toward Notion's duplication problem. Enforce query-only pages at the data model layer, not just convention.
- **IronCalc embedded content vs atom minimalism:** A spreadsheet inside an atom is rich content. This creates tension with the "short, high-fidelity" atom philosophy. Defer to post-MVP and validate that users actually want computation inside atoms before building it.

---

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the core thesis: that a typed, capped, entropy-managed information system is more useful than a freeform accumulation tool.

- [ ] **Five atom types with mandatory classification** — validates the typed model. If users hate being forced to classify, the thesis is wrong.
- [ ] **Inbox with hard cap** — validates the cap mechanic. If users find caps infuriating rather than liberating, reconsider.
- [ ] **Sections (Projects, Areas, Resources, Archive)** — stable scaffolding. Must exist before any atoms can be organized.
- [ ] **Pages as queries (Today, This Week, Active Projects, Waiting, Insights)** — validates the query-not-storage model.
- [ ] **Fast capture (global hotkey → inbox)** — frictionless entry is non-negotiable. Table stakes.
- [ ] **Staleness decay with visual indicator per atom** — validates the entropy management thesis.
- [ ] **Entropy health indicator (green/yellow/red)** — this IS the product's core concept made visible. Must ship in v1.
- [ ] **Computed priority scoring** — validates that a computed P-score is more useful than manual !1/!2/!3 priorities.
- [ ] **Full-text search** — table stakes. Users cannot validate any thesis if they cannot find their items.
- [ ] **Data export (JSON + Markdown)** — trust requires that users know they can leave. Ship on day one.
- [ ] **Offline operation** — local-first is the architectural identity. Must be provably offline.
- [ ] **Change log / undo** — data safety is table stakes for trust.

### Add After Validation (v1.x)

Features to add once the core typed/capped model is working and users are engaged.

- [ ] **Link density tracking + backlinks UI** — add once atom linking behavior is established and users are creating links organically.
- [ ] **Compression ritual suggestions (non-AI)** — surface stale + zero-link atoms as a list. No AI required yet. Validates the ritual concept before adding AI complexity.
- [ ] **Keyboard-driven navigation (full)** — polish once structure is stable. Early adopters will tolerate some mouse use.
- [ ] **Advanced filtering / saved filters on pages** — add when users express frustration with default page views being too broad.
- [ ] **Tags** — add after validating that section + type is insufficient for cross-cutting labels.

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **AI orchestration (compression, prioritization suggestions)** — requires pluggable AI interface to be stable and users to have enough data for AI to act on. Defer until v1 data model is trusted.
- [ ] **IronCalc embedded spreadsheets** — high implementation cost, unclear if users need computation inside atoms. Validate via user interviews before building.
- [ ] **CRDT-based P2P sync (multi-device)** — post-v1. Design data model to allow it, but don't ship it.
- [ ] **Mobile web experience** — web-first is correct, but mobile optimization requires dedicated UX work. Post-MVP.
- [ ] **Richer page customization** — after validating that default page queries are insufficient.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Typed atom model (mandatory classification) | HIGH | MEDIUM | P1 |
| Inbox with hard cap | HIGH | LOW | P1 |
| Sections (stable structure) | HIGH | LOW | P1 |
| Pages as queries | HIGH | HIGH | P1 |
| Fast capture | HIGH | LOW | P1 |
| Staleness decay | HIGH | MEDIUM | P1 |
| Entropy health indicator | HIGH | MEDIUM | P1 |
| Computed priority scoring | HIGH | HIGH | P1 |
| Full-text search | HIGH | MEDIUM | P1 |
| Data export | HIGH | LOW | P1 |
| Offline operation | HIGH | LOW | P1 |
| Change log / undo | MEDIUM | MEDIUM | P1 |
| Backlinks UI | MEDIUM | MEDIUM | P2 |
| Link density tracking | MEDIUM | MEDIUM | P2 |
| Compression ritual suggestions | HIGH | LOW | P2 |
| Keyboard navigation (full) | MEDIUM | MEDIUM | P2 |
| Advanced filtering / saved filters | MEDIUM | MEDIUM | P2 |
| Tags | MEDIUM | LOW | P2 |
| AI orchestration | HIGH | HIGH | P3 |
| IronCalc embedded content | MEDIUM | HIGH | P3 |
| P2P sync | MEDIUM | HIGH | P3 |
| Mobile optimization | MEDIUM | HIGH | P3 |
| Rich page customization | LOW | HIGH | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

| Feature | Notion | Obsidian | Tana | Capacities | Todoist/Things 3 | BinderOS Approach |
|---------|--------|----------|------|------------|------------------|-------------------|
| Data typing / schemas | Via database properties (optional) | Frontmatter (optional) | Supertags (structured, optional) | Object types (structured, optional) | Projects/Labels | Mandatory typed atoms — type is required, not optional |
| Hard caps on accumulation | None | None | None | None | None | First tool in class to enforce caps |
| Staleness / relevance decay | None | None | None | None | None | Computed decay as first-class feature |
| Priority scoring | Manual !1-!4 (Todoist), none (Obsidian) | None native | None | None | Manual (Todoist) | Computed function — no manual flags |
| Entropy health indicator | None | None | None | None | None | Green/yellow/red system health, always visible |
| Compression rituals | None | None | None | None | None | AI-surfaced candidates for pruning |
| Pages as queries (not storage) | Pages ARE storage (duplication risk) | Notes ARE storage | Tana searches nodes | Databases are storage | Projects are storage | Pages are pure queries over atom store |
| Local-first | No (cloud-native) | Yes (Markdown files) | No (cloud-hosted) | No (cloud) | No (cloud) | Yes (IndexedDB/OPFS) |
| Offline | Limited | Yes | No | No | Partial | Full offline required |
| AI role | Author + summarizer | External plugin | Auto-tagger, content generator | AI assistant | AI task suggester | Orchestrator only — never author |
| Export portability | Notion format + Markdown | Markdown native | Markdown (added 2025) | Proprietary + export | None (cloud) | JSON + Markdown, always available |
| Plugin ecosystem | Yes (Notion integrations) | Yes (1000+ plugins) | Limited | Limited | Integrations | Intentionally no plugins — opinionated by design |
| Inbox with triage | None enforced | None | None | Informal | Inbox (GTD) | Hard-capped inbox with mandatory classification |

---

## Key Insight for Roadmap

The PKM market has converged on two failure modes:

1. **Accumulation tools** (Notion, Obsidian default usage): Users add indefinitely, never remove. System becomes a graveyard of forgotten notes. Search becomes the only navigation. Users feel guilty rather than productive.

2. **Over-engineered systems** (Roam Research, complex Tana setups): Too much friction to maintain. First-30-days abandonment is the primary failure. Users spend time on the system rather than on their work.

BinderOS's information-theory framing directly attacks failure mode #1. The binder metaphor, caps, and decay mechanics are designed to make the system self-maintaining. The challenge is to avoid failure mode #2: if the classification requirement plus the cap enforcement feel punitive rather than liberating, users will abandon it.

**MVP validation goal:** Prove that a system that forces you to throw things away is more useful than one that lets you keep everything.

---

## Sources

- Forte Labs test-driving Obsidian, Tana, Mem: [https://fortelabs.com/blog/test-driving-a-new-generation-of-second-brain-apps-obsidian-tana-and-mem/](https://fortelabs.com/blog/test-driving-a-new-generation-of-second-brain-apps-obsidian-tana-and-mem/)
- Android Police: Notion vs Obsidian vs Capacities vs Anytype review: [https://www.androidpolice.com/tried-notion-obsidian-capacities-anytype-for-month/](https://www.androidpolice.com/tried-notion-obsidian-capacities-anytype-for-month/)
- PKM Paradox — why tools fail: [https://medium.com/@helloantonova/the-pkm-paradox-why-most-knowledge-management-tools-fail-to-meet-our-needs-d5042f08f99e](https://medium.com/@helloantonova/the-pkm-paradox-why-most-knowledge-management-tools-fail-to-meet-our-needs-d5042f08f99e)
- Tana supertags documentation: [https://tana.inc/docs/supertags](https://tana.inc/docs/supertags) and [https://tana.inc/articles/supertags](https://tana.inc/articles/supertags)
- Anytype vs Capacities comparison: [https://toolsbattle.com/anytype-vs-capacities/](https://toolsbattle.com/anytype-vs-capacities/)
- Capacities PKM guide: [https://capacities.io/blog/guide-to-pkm](https://capacities.io/blog/guide-to-pkm)
- Obsidian overview 2025: [https://www.eesel.ai/blog/obsidian-overview](https://www.eesel.ai/blog/obsidian-overview)
- Local-first software essay (Ink & Switch): [https://www.inkandswitch.com/essay/local-first/](https://www.inkandswitch.com/essay/local-first/)
- Notion database views documentation: [https://www.notion.com/help/views-filters-and-sorts](https://www.notion.com/help/views-filters-and-sorts)
- TaskFoundry Notion vs Obsidian vs Tana 2025: [https://www.taskfoundry.com/2025/07/which-knowledge-hub-wins-notion-obsidian-tana.html](https://www.taskfoundry.com/2025/07/which-knowledge-hub-wins-notion-obsidian-tana.html)
- XDA Developers: stopped trusting software that does everything: [https://www.xda-developers.com/stopped-trusting-software-tries-everything/](https://www.xda-developers.com/stopped-trusting-software-tries-everything/)
- PKM failure reasons 2025: [https://medium.com/@theo-james/pkms-is-dying-6b04e9bb0514](https://medium.com/@theo-james/pkms-is-dying-6b04e9bb0514)

---

*Feature research for: Local-first personal information management / life OS (BinderOS)*
*Researched: 2026-02-21*
