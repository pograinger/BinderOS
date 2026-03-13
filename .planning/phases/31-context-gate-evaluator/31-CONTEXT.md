# Phase 31: Context Gate Evaluator - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire the Phase 30 predicate scaffold into `dispatchTiered()` as a pre-dispatch `ActivationGate` filter. The gate evaluates route, time-of-day, binder type, and atom history predicates before any handler runs. All gate decisions (pass and block) are logged to `gateActivationLog` for harness measurement and Optuna threshold tuning. The history predicate's `staleDays` check (stubbed in Phase 30) is completed. This is pipeline integration and logging — no new AI behaviors, no new predicates.

</domain>

<decisions>
## Implementation Decisions

### Gate as first-class pipeline member
- **GateContext is required on every dispatch** — not optional, not backwards-compat. This is greenfield, not production. Every `dispatchTiered()` call must provide a `GateContext`. Callers that don't provide context are bugs.
- **Caller builds the GateContext** — the store/UI layer that calls `dispatchTiered()` already has access to route, time, atom intelligence. Pipeline stays pure — no store/router/Dexie imports in `pipeline.ts` or predicates
- **GateContext gets `lastEnrichedAt` field** — caller queries atomIntelligence sidecar for the atom's last enrichment timestamp and passes it. History predicate stays a pure function, no async Dexie reads
- **`context` field added to `TieredRequest`** — GateContext becomes part of the request type, not a separate parameter

### Blocked dispatch response
- **TieredResponse with `gateBlocked: true`** — blocked dispatches return a normal TieredResponse with a `gateBlocked` flag and the full `GateResult` attached. No exception, no separate type. Callers inspect gate decisions through the same response type
- **No handler execution when blocked** — if gate blocks, skip the entire handler loop. Return immediately with gate result

### Logging
- **Log everything** — every gate evaluation writes to `gateActivationLog`, all predicates, all outcomes (activated/blocked). Harness needs both pass and block counts to compute activation rates. ~1 row per predicate per dispatch call
- **Fire-and-forget writes** — gate evaluation is sync (pure functions), log write is async fire-and-forget. Dispatch latency unaffected. Consistent with Phase 30's async Dexie sync pattern
- **TTL cleanup** — Claude's discretion on timing (app boot, lazy on write, or periodic). The strategy matters less than the fact that it exists. Default retention 30 days, configurable in BinderTypeConfig

### Harness observability
- **Direct Dexie queries** — harness queries `gateActivationLog` table directly using existing compound indexes `[predicateName+timestamp]` and `[atomId+timestamp]`. No new API layer needed
- **Blocked dispatches in harness reports** — blocked dispatches appear alongside normal dispatch results with gate metadata (which predicates blocked, why). Essential for threshold tuning: "out of 500 dispatches, 120 were gate-blocked"

### Claude's Discretion
- TTL cleanup timing strategy (app boot vs lazy vs periodic)
- Whether to batch log writes (one bulk insert per dispatch vs one per predicate)
- Test helper design for providing permissive default GateContext in existing tests
- Exact structure of gate metadata on TieredResponse (inline vs nested)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/ai/context-gate/activation-gate.ts`: `canActivate(ctx, config)` — the Phase 31 integration point. Already implements AND semantics across all registered predicates. Ready to call from pipeline
- `src/ai/context-gate/predicate-registry.ts`: `evaluatePredicates()` returns per-predicate results with name, activated, reason, metadata. Full observability built in
- `src/ai/context-gate/predicates/`: All 4 predicates (route, time, history, binder-type) already read from `config.predicateConfig`. History predicate has `staleDays` stubbed as always-allow with explicit `// TODO (Phase 31)` marker
- `src/types/gate.ts`: `GateContext`, `GateResult`, `GateActivationLogEntry`, `GatePredicateResult` — all types defined
- `src/storage/db.ts`: `gateActivationLog` table declared with compound indexes
- `src/config/binder-types/index.ts`: `getBinderConfig()` returns full `ExpandedBinderTypeConfig` with `predicateConfig`

### Established Patterns
- Pure module pattern: `pipeline.ts` imports no store. Gate evaluation must follow same pattern — pure functions only
- Handler registration: `registerHandler()` / `unregisterHandler()` pattern in pipeline. Predicate registry follows identical pattern
- Fire-and-forget Dexie: Phase 26 established async sidecar writes. Gate logging follows same pattern
- CRDT-ready fields: `version`, `deviceId`, `updatedAt` on `GateActivationLogEntry` — consistent with all v5.0+ tables

### Integration Points
- `src/ai/tier2/pipeline.ts`: `dispatchTiered()` — gate evaluation happens before the handler loop at ~line 85
- `src/ai/tier2/types.ts`: `TieredRequest` type needs `context: GateContext` field, `TieredResponse` needs `gateBlocked` + `gateResult`
- `src/ui/signals/store.ts`: Caller that builds `GateContext` from current route, time, and atom intelligence
- `scripts/harness/harness-pipeline.ts`: Headless harness — must build GateContext for each corpus item
- `src/ai/context-gate/predicates/history-predicate.ts`: staleDays TODO at line 37 — complete with `ctx.lastEnrichedAt`

</code_context>

<specifics>
## Specific Ideas

- chat11.txt litmus tests frame the gate's purpose: "intelligent when opened, never runs in background" (wake cycle model). The gate is the mechanism that makes intelligence *selective* within the wake cycle — not all agents need to fire every time the binder wakes
- "Agency without overreach" — the gate prevents noise (enriching already-deep atoms, firing triage on Insights view) while allowing genuine insights through. Suppress, don't block everything
- The gate log is the first step toward Optuna-informed intelligent pruning — what the harness learns about predicate activation rates feeds back into BinderTypeConfig threshold tuning
- Platform guardrail: gate predicate configs are in BinderTypeConfig JSON, making them declarative and pluggable. A Travel binder type could have completely different gate thresholds than GTD

</specifics>

<deferred>
## Deferred Ideas

- **Intelligent gate log pruner** — Optuna-informed worker that balances database bloat vs signal value (from Phase 30 deferred list)
- **Custom predicates per binder type** — `registerPredicate()` API exists but no non-core predicates yet. Travel binder might add a `location-predicate`
- **Gate analytics dashboard** — UI surface showing predicate activation rates. Currently harness-only
- **Adaptive gate thresholds** — gate thresholds that self-tune based on accumulated log data. Currently static in BinderTypeConfig JSON

</deferred>

---

*Phase: 31-context-gate-evaluator*
*Context gathered: 2026-03-12*
