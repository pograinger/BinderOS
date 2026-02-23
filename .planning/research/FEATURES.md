# Feature Research

**Domain:** AI orchestration layer for local-first PKM / GTD tool (BinderOS v2.0)
**Researched:** 2026-02-22
**Confidence:** MEDIUM — pattern-level findings are HIGH (market well-documented); specific BinderOS interaction designs are MEDIUM (novel combination of existing patterns)

---

## Context

This research targets BinderOS v2.0 specifically. v1.0 ships with: typed atoms (Task/Fact/Event/Decision/Insight), entropy engine (staleness decay, priority scoring, compression candidates), advisory-first inbox/task caps, query-based pages, full-text + semantic search, command palette, keyboard navigation, tags, backlinks, saved filters, and card-by-card triage UX. The v2.0 AI layer builds on these foundations — it does not replace them.

**What "AI orchestration" means in BinderOS:** AI reads the entropy state and helps the user maintain low-entropy through guided reviews and intelligent triage, while the user stays the author of all content.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist in an "AI-powered" productivity tool. Missing these = the AI layer feels broken or untrustworthy.

| Feature | Why Expected | Complexity | Dependency on Existing System |
|---------|--------------|------------|-------------------------------|
| AI-suggested atom type during triage | Todoist AI (2025), n8n workflows, email triage tools all classify incoming items. Users who know BinderOS has typed atoms expect AI to suggest the type. | LOW | Requires: inbox card-by-card triage UX (shipped v1.0), five atom types (shipped v1.0) |
| AI-suggested section/project during triage | Todoist AI learns from patterns and suggests project/section. Users expect the same in atom triage. | LOW | Requires: section structure (shipped v1.0), existing atoms as pattern corpus |
| AI-suggested priority or urgency signal | Todoist AI analyzes deadlines, project history, dependencies to suggest P1-P4. Users expect at least a "this looks urgent" signal. | MEDIUM | Requires: computed priority scoring (shipped v1.0), entropy engine signals |
| Explanation/reasoning for AI suggestions | 2025 UX research: users distrust AI suggestions with no reasoning. Confidence indicators + brief rationale are expected. | LOW | No upstream dependency |
| Accept / dismiss individual suggestions | Every serious 2025 AI tool has per-suggestion accept/reject. Copilot, Notion AI, GitHub Copilot all follow this. Missing it = users feel railroaded. | LOW | Requires: additive AI mutation model (v2.0 design) |
| AI that doesn't touch data without approval | Core trust requirement — users know AI can write atoms; they expect an approval gate. HBR (2025) documents AI productivity backlash from over-automation. | LOW | Requires: additive mutation model + changelog tagging |
| Opt-in / opt-out of AI features | Privacy-conscious users (BinderOS's target audience) need explicit control. Any cloud API use requires explicit consent. | LOW | No upstream dependency |
| Visual distinction of AI-generated content | GitHub Copilot, Notion AI: suggestions are visually distinct from user content. If AI touches something, it must be labeled. | LOW | Requires: changelog source field (v2.0) |

### Differentiators (Competitive Advantage)

Features that set BinderOS's AI layer apart from Notion AI, Todoist AI, and generic chat assistants. Not required for trust, but define the product identity.

| Feature | Value Proposition | Complexity | Dependency on Existing System |
|---------|-------------------|------------|-------------------------------|
| Entropy-informed triage suggestions | No competitor AI reads a staleness/entropy model before suggesting classification. BinderOS's AI can say "this looks like a Fact — and you have 3 similar stale Facts in the Resources section." Generic classifiers can't. | MEDIUM | Requires: entropy engine (shipped v1.0), semantic embeddings (shipped v1.0), link density tracking (shipped v1.0) |
| GTD-structured guided weekly review (conversational) | FacileThings has a guided review with steps, but no AI. GTD Connect's 2025 podcast acknowledges AI in GTD is nascent. A conversational review that walks through Get Clear → Get Current → Get Creative with AI pre-analysis is genuinely novel. | HIGH | Requires: all atom types + entropy signals (shipped v1.0); requires conversational question-flow UX (v2.0) |
| Compression coach: AI explains *why* an atom is stale | v1.0 surfaces compression candidates mechanically (zero-link, decayed score). AI can explain: "This Fact hasn't been linked since October, has 3 semantically similar Facts, and predates your decision to switch to X — consider archiving or merging." | MEDIUM | Requires: semantic embeddings (shipped v1.0), staleness decay (shipped v1.0), link graph (shipped v1.0) |
| Context-aware floating orb with GTD menu | Raycast AI (2025) is the closest model: single hotkey, floating window, context-aware. No PKM tool has a floating entry point that reads the current view's entropy state and surfaces a relevant AI action at top. | HIGH | Requires: page context awareness, entropy signals (shipped v1.0) |
| Conversational question-flow AI UX (GSD pattern) | Most productivity AI is a chat sidebar (Notion AI) or inline ghost text (GitHub Copilot). A structured 3-4 option + freeform question flow for reviews is different — less open-ended, more guided, matches how GTD reviews actually work. | MEDIUM | Requires: conversational UX component (v2.0) |
| Tiered LLM: browser WASM for fast tasks, cloud for reasoning | WebLLM (MLC, 2024) achieves 80% native GPU performance in-browser. Small models (Phi-3-mini, SmolLM) handle classification. Cloud APIs handle review conversations. No PKM tool does this tiering explicitly. | HIGH | Requires: pluggable AI interface (v2.0), WASM worker infrastructure (shipped v1.0 for scoring) |
| AI mutations tagged + reversible via existing changelog | BinderOS's changelog already tracks all mutations. AI suggestions use the same infrastructure with a source field. Users can "undo the AI's last 3 suggestions" the same way they undo their own edits. | MEDIUM | Requires: changelog (shipped v1.0), source field extension (v2.0) |
| AI-surfaced related atoms during triage | When classifying an inbox item, AI shows 2-3 semantically similar existing atoms: "This looks related to your Decision: Switch to Postgres from March." Reduces duplication without forcing merge. | MEDIUM | Requires: semantic embeddings (shipped v1.0) |
| Review pre-analysis: AI summarizes entropy state before review begins | Before weekly review, AI generates a briefing: "You have 7 stale Tasks, 2 Projects with no next action, and 4 compression candidates. Here's where to focus." Notion AI requires manual prompt; this is proactive and review-specific. | MEDIUM | Requires: entropy engine + all scoring signals (shipped v1.0) |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem like obvious AI additions but create serious problems in BinderOS's context.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| AI auto-creates atoms from capture | "Just let AI classify and save my capture automatically" | Defeats the entire BinderOS thesis — the act of classification is where value is encoded. Auto-created atoms bypass type enforcement, can add noise instead of signal, and undermine user trust in the system model of their life. HBR 2025 documents AI content ("workslop") eroding trust. | AI *suggests* type/section/priority, user confirms with one click. Fast, but never automatic. |
| AI-generated atom content (summaries, notes) | Notion AI writes summaries; users want the same | AI-authored atoms mean the system contains facts the user didn't validate. BinderOS's core value is that every atom encodes the user's verified understanding. AI can suggest a label, not write a Fact. | AI suggests *metadata* (type, section, links, priority signal) — never content. User remains the sole author. |
| AI that runs on a schedule / autonomous agent | "Run the weekly review automatically overnight" | Autonomous AI agents that modify the system without the user present violate the human-in-loop principle BinderOS is built on. Also breaks the review ritual itself — the value of GTD review is the *thinking*, not the processing. | Proactive briefing on demand: user triggers review, AI pre-analyzes and presents findings. Never runs autonomously. |
| Chat sidebar as primary AI interface | Notion AI, ChatGPT-style sidebar is familiar | Open-ended chat invites prompt engineering, off-topic queries, and turns the AI into a general assistant rather than a focused orchestrator. Also adds cognitive load during review. | Structured question flows (3-4 options + freeform) for all AI interactions. Constrains AI to productive, review-relevant actions. |
| AI priority override (AI sets priority, not entropy engine) | "Let AI decide what I should do today" | BinderOS's computed priority is a deterministic formula users can understand and trust. AI priority labels are probabilistic and opaque. Two systems disagreeing on priority creates confusion. | AI surfaces entropy signals and patterns *as context* during review. Priority remains the computed function. AI explains *why* the engine scores something high; doesn't override it. |
| AI-suggested new tasks / projects (creative suggestions) | "AI should suggest what I should be working on" | Scope creep into personal coaching / second brain territory. Adds atoms the user didn't intend to add. Violates the anti-accumulation philosophy. | AI flags *existing* atoms that need attention; never proposes new ones. |
| Persistent AI learning / personalization model | "AI should learn my patterns over time" | Requires storing behavioral data and model weights, adds significant complexity, and creates a privacy surface. Small WASM models can't do this; cloud models introduce data-leaving-device risk. | Stateless AI per-session: AI reads the current entropy state and atom graph at review time. No persistent behavioral model. Session context is sufficient for classification quality. |
| AI confidence scores as primary display | "Show me how confident AI is about each suggestion" | Displaying confidence percentages invites users to game the threshold, creates anxiety about borderline suggestions, and adds visual noise. Research shows confidence indicators improve trust only when paired with reasoning, not when shown in isolation. | Show reasoning ("This looks like a Fact because it's a statement of truth, not an action") rather than a number. Dismiss option is always available. |

---

## Feature Dependencies

```
[Floating Orb UI]
    └──requires──> [Context reader: current page + entropy state]
                       └──requires──> [Entropy engine signals (shipped v1.0)]
    └──requires──> [Conversational question-flow UX]
    └──provides──> [Entry point to all AI features]

[Smart Inbox Triage]
    └──requires──> [Card-by-card triage UX (shipped v1.0)]
    └──requires──> [Pluggable AI interface]
    └──requires──> [Browser WASM LLM or cloud API]
    └──enhances──> [Entropy engine] (better-classified atoms = better scores)
    └──reads──> [Semantic embeddings (shipped v1.0)]

[Conversational Question-Flow UX]
    └──requires──> [Pluggable AI interface]
    └──provides──> [Interaction pattern for all AI features]
    └──note──> [Must work with: triage, reviews, compression coach]

[Guided Weekly Review]
    └──requires──> [Conversational question-flow UX]
    └──requires──> [Review pre-analysis briefing]
    └──requires──> [Cloud API or capable local model]
    └──reads──> [All entropy signals (shipped v1.0)]
    └──reads──> [All atom types and their scores]

[Review Pre-Analysis Briefing]
    └──requires──> [Pluggable AI interface]
    └──requires──> [Entropy engine aggregate state (shipped v1.0)]
    └──can use──> [Browser WASM LLM] (summarization, low complexity)

[Compression Coach]
    └──requires──> [Staleness decay (shipped v1.0)]
    └──requires──> [Semantic embeddings (shipped v1.0)]
    └──requires──> [Link density tracking (shipped v1.0)]
    └──requires──> [Pluggable AI interface]
    └──enhances──> [Existing compression candidate list (shipped v1.0)]

[AI Mutation Tracking]
    └──requires──> [Changelog with source field (extends shipped v1.0)]
    └──provides──> [Reversibility for all AI suggestions]
    └──required by──> [All AI features that propose changes]

[Pluggable AI Interface]
    └──requires──> [Abstract LLM provider interface]
    └──provides──> [Swappable backends: WASM / cloud / disabled]
    └──required by──> [All AI features]

[Tiered LLM Infrastructure]
    └──requires──> [Pluggable AI interface]
    └──requires──> [WASM worker infrastructure (extends shipped v1.0)]
    └──provides──> [Fast classification (browser) + reasoning (cloud)]
```

### Dependency Notes

- **Pluggable AI interface is the foundation:** All AI features depend on an abstract interface that can route to browser WASM model, cloud API, or null provider. Must be built before any AI feature.
- **Conversational question-flow UX is the shared interaction layer:** Triage suggestions, review flows, and compression coaching all use the same question-flow component. Build once, use everywhere.
- **Smart triage is the lowest-risk entry point:** It enhances an existing interaction (card-by-card triage) with suggestions. Lower stakes than review automation. Build first to establish AI suggestion patterns.
- **Weekly review requires the most capable model:** Get Clear/Get Current/Get Creative with conversational AI requires multi-turn context. Must escalate to cloud API. Don't ship this with WASM-only.
- **Changelog source field is low-effort, high-trust:** The existing changelog needs only a `source: "ai" | "user"` field. This small addition enables full reversibility of all AI changes without a new system.
- **Floating orb is the delivery mechanism, not the feature:** Build AI features first, then wire them to the orb. Don't build the orb and ship it empty.

---

## MVP Definition

### Launch With (v2.0)

Minimum viable AI layer — validates that AI orchestration improves the review ritual without breaking the human-in-loop trust model.

- [ ] **Pluggable AI interface** — abstract provider that routes to WASM / cloud API / null. Without this, no other AI feature can be built or tested.
- [ ] **Tiered LLM infrastructure** — browser WASM model for fast classification, cloud API for conversational review. Enables appropriate model for each use case.
- [ ] **AI-suggested type + section during inbox triage** — lowest-risk, highest-frequency interaction. User sees suggestion on every triage card. Validates accept/dismiss pattern.
- [ ] **Conversational question-flow UX component** — shared component for all AI interactions (3-4 options + freeform). Used by triage, review, compression. Build once.
- [ ] **AI mutation changelog tagging** — source field on all AI-originated changes. Enables reversibility. Required for trust, low implementation cost.
- [ ] **Floating orb** — always-present entry point. Context-aware (reads current page + entropy state). GTD action menu. Without delivery mechanism, AI features are hard to discover.
- [ ] **Review pre-analysis briefing** — AI-generated entropy state summary before weekly review begins. Low model requirement (can use WASM). High value: sets review agenda.

### Add After Validation (v2.x)

- [ ] **Guided GTD weekly review flow** — full Get Clear / Get Current / Get Creative with conversational AI. Requires cloud API. Add once basic triage suggestions are validated.
- [ ] **Compression coach with AI explanations** — today v1.0 surfaces candidates mechanically. Upgrade to AI-explained reasoning ("stale because X, similar to Y"). Add when users engage with compression candidates.
- [ ] **Related atoms during triage** — show 2-3 semantically related existing atoms when classifying inbox item. Already have embeddings; upgrade triage UI to show them.
- [ ] **AI-suggested priority signal** — overlay on existing computed priority. Show only during review, not persistently. Validate that users find it useful vs. noise.

### Future Consideration (v3+)

- [ ] **On-device model selection UX** — let users choose which WASM model to load. Requires model download + management UI. High complexity, low priority until WASM model ecosystem matures.
- [ ] **Review history and trends** — track weekly review completion rates, entropy scores over time. AI can spot patterns ("your inbox spikes every Thursday"). Requires historical data accumulation.
- [ ] **AI-assisted natural language capture** — capture in free text, AI parses to structured atom. High complexity, high risk of bypassing classification ritual. Defer and validate desire first.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority | Notes |
|---------|------------|---------------------|----------|-------|
| Pluggable AI interface | HIGH | MEDIUM | P1 | Foundation — nothing else works without it |
| AI mutation changelog tagging | HIGH | LOW | P1 | Trust-critical, low effort (extends existing changelog) |
| Conversational question-flow UX | HIGH | MEDIUM | P1 | Shared component used by all AI features |
| Floating orb | HIGH | HIGH | P1 | Discovery mechanism — without it, AI features are buried |
| AI-suggested type during triage | HIGH | LOW | P1 | Highest-frequency AI interaction, lowest stakes |
| AI-suggested section during triage | HIGH | LOW | P1 | Same interaction, same cost |
| Review pre-analysis briefing | HIGH | MEDIUM | P1 | High value, feasible with WASM |
| Tiered LLM infrastructure | HIGH | HIGH | P1 | Enables appropriate model per task |
| Related atoms during triage | MEDIUM | MEDIUM | P2 | Already have embeddings; upgrade triage UI |
| AI-suggested priority signal | MEDIUM | MEDIUM | P2 | Validate after basic triage suggestions work |
| Guided weekly review flow | HIGH | HIGH | P2 | Cloud API required; add after triage is stable |
| Compression coach with AI explanations | MEDIUM | MEDIUM | P2 | Upgrade existing compression candidate UX |
| On-device model selection | LOW | HIGH | P3 | WASM ecosystem still maturing |
| Review history + trend analysis | MEDIUM | HIGH | P3 | Requires data accumulation over time |

**Priority key:**
- P1: Ship in v2.0 — required to validate the AI orchestration thesis
- P2: Ship in v2.x — adds meaningful value once core is working
- P3: Future consideration — high complexity or unclear demand

---

## Competitor Feature Analysis

| Feature | Notion AI | Todoist AI | FacileThings | Obsidian + plugins | BinderOS v2.0 Approach |
|---------|-----------|------------|--------------|--------------------|-----------------------|
| Inbox triage / classification | Auto-label in Notion Mail (natural language rules, not per-item AI suggestion) | Suggests project, section, labels per task; learns from history | No AI — guided steps only | Plugin ecosystem (Copilot plugin, Ollama integration) — varies | Per-card AI suggestion during triage: type + section + related atoms |
| Priority suggestion | No explicit priority AI | P1-P4 suggestion based on deadline + history | No AI | No native | Entropy-signal-informed priority overlay during review only |
| Weekly review automation | No guided review | No guided review | Structured step-by-step (no AI) | No native | AI-guided conversational review: pre-analysis briefing + Get Clear/Get Current/Get Creative flows |
| AI interaction pattern | Chat sidebar + inline block commands | Sidebar AI assistant panel | N/A | Sidebar chat or inline | Floating orb → structured question flow (3-4 options + freeform) |
| AI-proposes / human-disposes | Inline accept/dismiss on suggestions | Suggestions in sidebar, user applies manually | N/A | Accept/reject on Copilot suggestions | Per-suggestion accept/dismiss; all AI changes tagged in changelog; one-click revert |
| Ambient / contextual AI trigger | AI button in toolbar; inline / block level | AI button in sidebar | N/A | Plugin hotkey | Floating orb: always visible, reads current page context, surfaces most relevant action at top |
| Local / offline AI | No | No | N/A | Yes (Ollama plugin) | Yes — WASM browser model for fast tasks; cloud API optional for reasoning |
| AI content authorship | Yes — AI writes content | Task description rewriting | N/A | Yes via plugins | No — AI never authors content; suggests metadata only |
| Compression / pruning AI | No | No | No | No | AI explains why atoms are stale; suggests archive/merge; never executes without approval |
| Model choice | Anthropic Claude (Notion's internal model + Claude API) | Proprietary | N/A | OpenAI / Ollama / any | Pluggable: WASM model (Phi-3-mini, SmolLM) + pluggable cloud API; user controls data residency |

---

## What the GTD Weekly Review Actually Needs (From Research)

The GTD weekly review has three phases (David Allen / FacileThings):

**Get Clear** — process all open loops
- Collect all loose ends from capture buckets
- Process inbox to zero: classify, assign, or trash
- Empty head via mind sweep

**Get Current** — ensure lists reflect reality
- Review next actions list (what's stale? what's done?)
- Review waiting-for list (any follow-ups needed?)
- Review calendar (past + future)
- Review projects list (every project has a next action?)
- Review someday/maybe list

**Get Creative** — look at the bigger picture
- Review Areas of Responsibility (anything neglected?)
- Review goals and vision
- Capture any new ideas or projects

**AI's role in each phase:**

| GTD Phase | AI Opportunity | Model Tier |
|-----------|---------------|------------|
| Get Clear | Pre-analysis: "You have 11 inbox items, here are type + section suggestions for each" | WASM (classification) |
| Get Clear | Compression candidates surfaced with reasoning | WASM + embeddings |
| Get Current | Staleness summary: "7 tasks haven't moved in 14+ days, 2 projects have no next action" | WASM (summarization) |
| Get Current | Per-list AI commentary: "3 of your Waiting items are overdue for follow-up" | WASM |
| Get Creative | Conversational reflection: "What did you accomplish this week? What's unfinished?" | Cloud API (nuanced) |
| Get Creative | Pattern observation: "Your Insights section has grown but links to no active projects" | Cloud API |

---

## Key Insight for Roadmap

**The AI entry sequence matters more than the features themselves.**

Three patterns observed across the market:

1. **Chat sidebar** (Notion AI, most tools): Open-ended, high friction, general-purpose. Users must know what to ask. Review use case requires the user to already know what a good GTD review looks like.

2. **Inline suggestions** (GitHub Copilot, Todoist AI): Low friction, passive, per-item. Works for triage. Breaks down for multi-step workflows like weekly reviews.

3. **Guided question flows** (FacileThings manual, GSD pattern): High value for structured workflows. Users don't need to know what to ask — the system asks for them. Rare in AI tools, but matches how GTD reviews actually work.

BinderOS's floating orb + structured question flows is option 3 with AI analysis behind it. This is the correct interaction model for a GTD review tool. The research validates it as novel (no direct competitor does this specifically) and appropriate (FacileThings proves users want guided review steps; AI adds pre-analysis value on top).

**The single biggest anti-pattern risk for v2.0:** AI suggestions that interrupt the user's existing workflow rather than enhancing it. The card-by-card triage UX already works. AI must slot into it, not replace it. Suggestion UX must be dismissible in one keystroke, never blocking.

---

## Sources

- Notion AI 2026 Review (max-productive.ai): [https://max-productive.ai/ai-tools/notion-ai/](https://max-productive.ai/ai-tools/notion-ai/)
- Notion AI Features 2025 (cybernews.com): [https://cybernews.com/ai-tools/notion-ai-review/](https://cybernews.com/ai-tools/notion-ai-review/)
- Notion AI capabilities (kipwise.com): [https://kipwise.com/blog/notion-ai-features-capabilities](https://kipwise.com/blog/notion-ai-features-capabilities)
- Todoist AI review (aitoolscouts.com): [https://aitoolscouts.com/reviews/todoist-ai.html](https://aitoolscouts.com/reviews/todoist-ai.html)
- Use AI to organize Todoist Inbox (aivaceo.com): [https://aivaceo.com/2025/01/01/use-ai-to-organize-your-todoist-inbox/](https://aivaceo.com/2025/01/01/use-ai-to-organize-your-todoist-inbox/)
- Todoist AI assistant extension (todoist.com): [https://www.todoist.com/help/articles/use-the-task-assist-extension-with-todoist-ZgldtcPeT](https://www.todoist.com/help/articles/use-the-task-assist-extension-with-todoist-ZgldtcPeT)
- Raycast AI context-aware (raycast.com): [https://www.raycast.com/core-features/ai](https://www.raycast.com/core-features/ai)
- FacileThings updated weekly review: [https://facilethings.com/blog/en/the-weekly-review-updated](https://facilethings.com/blog/en/the-weekly-review-updated)
- AI in your GTD practice (gettingthingsdone.com): [https://gettingthingsdone.com/2025/07/ai-in-your-gtd-practice/](https://gettingthingsdone.com/2025/07/ai-in-your-gtd-practice/)
- Top GTD tools 2025 (sparkco.ai): [https://sparkco.ai/blog/top-gtd-tools-a-comprehensive-2025-guide](https://sparkco.ai/blog/top-gtd-tools-a-comprehensive-2025-guide)
- Agentic AI design patterns — enterprise guide (aufaitux.com): [https://www.aufaitux.com/blog/agentic-ai-design-patterns-enterprise-guide/](https://www.aufaitux.com/blog/agentic-ai-design-patterns-enterprise-guide/)
- What UX for AI must solve 2025 (think.design): [https://think.design/blog/what-ux-for-ai-products-must-solve-in-2025/](https://think.design/blog/what-ux-for-ai-products-must-solve-in-2025/)
- WebLLM in-browser inference (webllm.mlc.ai): [https://webllm.mlc.ai/](https://webllm.mlc.ai/)
- 3W for in-browser AI: WebLLM + WASM + WebWorkers (blog.mozilla.ai): [https://blog.mozilla.ai/3w-for-in-browser-ai-webllm-wasm-webworkers/](https://blog.mozilla.ai/3w-for-in-browser-ai-webllm-wasm-webworkers/)
- AI doesn't reduce work — it intensifies it (hbr.org): [https://hbr.org/2026/02/ai-doesnt-reduce-work-it-intensifies-it](https://hbr.org/2026/02/ai-doesnt-reduce-work-it-intensifies-it)
- AI-generated workslop is destroying productivity (hbr.org): [https://hbr.org/2025/09/ai-generated-workslop-is-destroying-productivity](https://hbr.org/2025/09/ai-generated-workslop-is-destroying-productivity)
- AI fatigue is widespread (medium.com): [https://medium.com/@asarav/ai-fatigue-is-widespread-now-211ad4dd9656](https://medium.com/@asarav/ai-fatigue-is-widespread-now-211ad4dd9656)
- GTD weekly review guide (super-productivity.com): [https://super-productivity.com/blog/gtd-weekly-review-guide/](https://super-productivity.com/blog/gtd-weekly-review-guide/)
- Todoist weekly review methodology: [https://www.todoist.com/productivity-methods/weekly-review](https://www.todoist.com/productivity-methods/weekly-review)
- Obsidian local LLM plugins (xda-developers.com): [https://www.xda-developers.com/using-my-local-llm-with-obsidian/](https://www.xda-developers.com/using-my-local-llm-with-obsidian/)
- Cross-browser local LLM via WebAssembly (picovoice.ai): [https://picovoice.ai/blog/cross-browser-local-llm-inference-using-webassembly/](https://picovoice.ai/blog/cross-browser-local-llm-inference-using-webassembly/)

---

*Feature research for: AI orchestration layer — BinderOS v2.0*
*Researched: 2026-02-22*
