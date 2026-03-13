/**
 * Gate types for context-gated enrichment pipeline (Phase 30).
 *
 * Three categories of types:
 * 1. Dexie table entry types: GateActivationLogEntry, SequenceContextEntry, BinderTypeConfigEntry
 * 2. Gate evaluation types: GateContext, GatePredicateResult, GateResult
 *
 * All Dexie table entries include CRDT-ready fields (version, deviceId, updatedAt)
 * consistent with Phase 26 intelligence sidecar pattern.
 *
 * Phase 30: SCHM-01
 */

// ---------------------------------------------------------------------------
// Dexie table entry types
// ---------------------------------------------------------------------------

/**
 * A single gate activation log entry — captures why a predicate fired or blocked.
 * Stored in gateActivationLog table. Indexes: [predicateName+timestamp], [atomId+timestamp].
 */
export interface GateActivationLogEntry {
  /** Unique ID for this log entry (UUID) */
  id: string;
  /** Name of the predicate that was evaluated */
  predicateName: string;
  /** Whether the predicate allowed or blocked activation */
  outcome: 'activated' | 'blocked';
  /** Unix epoch ms when the predicate was evaluated */
  timestamp: number;
  /** Binder type config version at evaluation time — for harness replay */
  configVersion: string;

  // Optional context snapshot — for richer harness analysis and threshold tuning
  /** Atom that triggered evaluation, if applicable */
  atomId?: string;
  /** App route at evaluation time */
  route?: string;
  /** Hour of day (0–23) at evaluation time */
  timeOfDay?: number;
  /** Binder type slug at evaluation time */
  binderType?: string;
  /** Enrichment depth of the atom at evaluation time */
  enrichmentDepth?: number;

  // CRDT-ready fields (consistent with Phase 26 pattern)
  /** Lamport-style version counter for CRDT sync */
  version: number;
  /** Device ID for CRDT conflict resolution */
  deviceId: string;
  /** Wall-clock update time for TTL queries */
  updatedAt: number;
}

/**
 * Sequence context for a binder — stores the embedding window for HTM-inspired
 * sequence learning. Phase 33 fills this; schema defined here to avoid another migration.
 * Stored in sequenceContext table. Primary key: binderId.
 */
export interface SequenceContextEntry {
  /** Binder ID (primary key) */
  binderId: string;
  /** Number of atoms in the embedding window */
  windowSize: number;
  /** Concatenated embeddings for atoms in window (Float32Array blob in IndexedDB) */
  embeddings: Float32Array;
  /** Unix epoch ms of last update */
  lastUpdated: number;
  /** Sequence model version that produced these embeddings */
  modelVersion: string;

  // CRDT-ready fields
  version: number;
  deviceId: string;
  updatedAt: number;
}

/**
 * A binder type config stored in Dexie — enables harness config injection
 * and runtime override without a rebuild. Full config serialized as JSON string.
 * Stored in binderTypeConfig table. Primary key: slug.
 */
export interface BinderTypeConfigEntry {
  /** Binder type slug (primary key, e.g. 'gtd-personal') */
  slug: string;
  /** Full ExpandedBinderTypeConfig serialized as JSON string */
  configJson: string;
  /** Unix epoch ms of last update */
  updatedAt: number;

  // CRDT-ready fields
  version: number;
  deviceId: string;
}

// ---------------------------------------------------------------------------
// Gate evaluation types
// ---------------------------------------------------------------------------

/**
 * Context object passed to gate predicates during evaluation.
 * All fields are optional — predicates only inspect fields they care about.
 */
export interface GateContext {
  /** Current app route (e.g. '/binder', '/settings') */
  route?: string;
  /** Current hour of day (0–23) — for energy-based time gating */
  timeOfDay?: number;
  /** Atom being considered for enrichment */
  atomId?: string;
  /** Current enrichment depth of the atom */
  enrichmentDepth?: number;
  /** Active binder type slug */
  binderType?: string;
  /** Arbitrary extension fields for custom predicate dimensions */
  customFields?: Record<string, unknown>;
}

/**
 * Result from a single gate predicate evaluation.
 * Rich result enables logging WHY a gate fired/blocked for harness analysis.
 */
export interface GatePredicateResult {
  /** Whether this predicate allows activation */
  activated: boolean;
  /** Human-readable reason for the decision */
  reason: string;
  /** Optional diagnostic data (e.g. matched config values, thresholds) */
  metadata?: Record<string, unknown>;
}

/**
 * Aggregated result from evaluating all registered predicates.
 * canActivate is true only if ALL predicates returned activated=true (AND semantics).
 */
export interface GateResult {
  /** Whether all predicates allow activation */
  canActivate: boolean;
  /** Per-predicate results with predicate name attached */
  predicateResults: Array<{ name: string } & GatePredicateResult>;
}
