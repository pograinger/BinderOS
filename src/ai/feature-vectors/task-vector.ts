/**
 * computeTaskVector — pure function producing a canonical task feature vector.
 *
 * Derives a Float32Array of TASK_VECTOR_DIM (27) dimensions from:
 *   - TaskAtom metadata (age, status, energy, deadline, context)
 *   - AtomIntelligence sidecar (enrichment depth, cognitive signals)
 *   - Entity registry data (person dependencies, entity reliability)
 *
 * Phase 35: CFVEC-02
 */

import type { TaskAtom } from '../../types/atoms';
import type { AtomIntelligence, Entity, EntityRelation } from '../../types/intelligence';
import { TASK_DIMENSION_NAMES, TASK_VECTOR_DIM, pickPrimaryEntity } from './types';

// ---------------------------------------------------------------------------
// Named offset constants — derived from dimension name array (no magic numbers)
// ---------------------------------------------------------------------------

const AGE_NORM = TASK_DIMENSION_NAMES.indexOf('age_norm');
const STALENESS_NORM = TASK_DIMENSION_NAMES.indexOf('staleness_norm');
const HAS_DEADLINE = TASK_DIMENSION_NAMES.indexOf('has_deadline');
const DAYS_TO_DEADLINE_NORM = TASK_DIMENSION_NAMES.indexOf('days_to_deadline_norm');
const STATUS_OPEN = TASK_DIMENSION_NAMES.indexOf('status_open');
const STATUS_DONE = TASK_DIMENSION_NAMES.indexOf('status_done');
const STATUS_DROPPED = TASK_DIMENSION_NAMES.indexOf('status_dropped');
const HAS_PROJECT = TASK_DIMENSION_NAMES.indexOf('has_project');
const IS_WAITING_FOR = TASK_DIMENSION_NAMES.indexOf('is_waiting_for');
const CTX_HOME = TASK_DIMENSION_NAMES.indexOf('ctx_home');
const CTX_OFFICE = TASK_DIMENSION_NAMES.indexOf('ctx_office');
const CTX_PHONE = TASK_DIMENSION_NAMES.indexOf('ctx_phone');
const CTX_COMPUTER = TASK_DIMENSION_NAMES.indexOf('ctx_computer');
const CTX_ERRANDS = TASK_DIMENSION_NAMES.indexOf('ctx_errands');
const CTX_ANYWHERE = TASK_DIMENSION_NAMES.indexOf('ctx_anywhere');
const ENERGY_LOW = TASK_DIMENSION_NAMES.indexOf('energy_low');
const ENERGY_MEDIUM = TASK_DIMENSION_NAMES.indexOf('energy_medium');
const ENERGY_HIGH = TASK_DIMENSION_NAMES.indexOf('energy_high');
const ENRICHMENT_DEPTH_NORM = TASK_DIMENSION_NAMES.indexOf('enrichment_depth_norm');
const HAS_PERSON_DEP = TASK_DIMENSION_NAMES.indexOf('has_person_dep');
const TIME_PRESSURE_SCORE = TASK_DIMENSION_NAMES.indexOf('time_pressure_score');
const PREV_STALENESS_SCORE = TASK_DIMENSION_NAMES.indexOf('prev_staleness_score');
const PREV_ENERGY_FIT = TASK_DIMENSION_NAMES.indexOf('prev_energy_fit');
const ENTITY_RELIABILITY = TASK_DIMENSION_NAMES.indexOf('entity_reliability');
const ENTITY_RESP_FAST = TASK_DIMENSION_NAMES.indexOf('entity_resp_fast');
const ENTITY_RESP_SLOW = TASK_DIMENSION_NAMES.indexOf('entity_resp_slow');
const ENTITY_RESP_UNKNOWN = TASK_DIMENSION_NAMES.indexOf('entity_resp_unknown');

// ---------------------------------------------------------------------------
// Sigmoid helper — smooth time-pressure curve
// ---------------------------------------------------------------------------

/**
 * Returns a time-pressure score in [0, 1].
 * Approaches 1.0 near deadline, 0.5 at ~7 days, 0.0 at 30+ days.
 * Returns 0.0 if no deadline.
 */
function timePressureSigmoid(daysToDeadline: number): number {
  // Sigmoid centered at 7 days, steep enough to reach ~0 at 30 days
  // f(d) = 1 / (1 + exp(0.3 * (d - 7)))
  return 1.0 / (1.0 + Math.exp(0.3 * (daysToDeadline - 7)));
}

// ---------------------------------------------------------------------------
// computeTaskVector — the pure function
// ---------------------------------------------------------------------------

/**
 * Compute a canonical task feature vector.
 *
 * @param atom - The TaskAtom providing metadata fields
 * @param sidecar - AtomIntelligence sidecar (undefined during cold-start)
 * @param entities - Entity registry entries referenced by this atom
 * @param relations - EntityRelation rows for the referenced entities
 * @returns Float32Array of length TASK_VECTOR_DIM (27)
 */
export function computeTaskVector(
  atom: TaskAtom,
  sidecar: AtomIntelligence | undefined,
  entities: Entity[],
  relations: EntityRelation[],
): Float32Array {
  const now = Date.now();
  const dims = new Float32Array(TASK_VECTOR_DIM);

  // [0] age_norm — capped at 1.0 at 365 days
  dims[AGE_NORM] = Math.min((now - atom.created_at) / (365 * 86_400_000), 1.0);

  // [1] staleness_norm — capped at 1.0 at 90 days
  dims[STALENESS_NORM] = Math.min((now - atom.updated_at) / (90 * 86_400_000), 1.0);

  // [2] has_deadline
  dims[HAS_DEADLINE] = atom.dueDate ? 1.0 : 0.0;

  // [3] days_to_deadline_norm — capped at 1.0 at 30 days; 0 if past or no deadline
  if (atom.dueDate) {
    const daysToDeadline = (atom.dueDate - now) / 86_400_000;
    dims[DAYS_TO_DEADLINE_NORM] = Math.max(0, Math.min(daysToDeadline / 30, 1.0));
  }

  // [4-6] status one-hot: open→[4], done→[5], dropped(cancelled/archived)→[6]
  // 'waiting' and 'in-progress' are active states → map to status_open slot
  if (atom.status === 'open' || atom.status === 'in-progress' || atom.status === 'waiting') {
    dims[STATUS_OPEN] = 1.0;
  } else if (atom.status === 'done') {
    dims[STATUS_DONE] = 1.0;
  } else if (atom.status === 'cancelled' || atom.status === 'archived') {
    dims[STATUS_DROPPED] = 1.0;
  }

  // [7] has_project — any link with belongs-to relationship
  dims[HAS_PROJECT] = atom.links.some((l) => l.relationshipType === 'belongs-to') ? 1.0 : 0.0;

  // [8] is_waiting_for
  dims[IS_WAITING_FOR] = atom.status === 'waiting' ? 1.0 : 0.0;

  // [9-14] context one-hot (6 slots): @home, @office, @phone, @computer, @errands, null(anywhere)
  const ctx = atom.context?.toLowerCase() ?? null;
  if (ctx === '@home' || ctx === 'home') {
    dims[CTX_HOME] = 1.0;
  } else if (ctx === '@office' || ctx === 'office' || ctx === '@work' || ctx === 'work') {
    dims[CTX_OFFICE] = 1.0;
  } else if (ctx === '@phone' || ctx === 'phone') {
    dims[CTX_PHONE] = 1.0;
  } else if (ctx === '@computer' || ctx === 'computer') {
    dims[CTX_COMPUTER] = 1.0;
  } else if (ctx === '@errands' || ctx === 'errands') {
    dims[CTX_ERRANDS] = 1.0;
  } else {
    // null or any other context → anywhere
    dims[CTX_ANYWHERE] = 1.0;
  }

  // [15-17] energy one-hot: Quick→[15], Medium→[16], Deep→[17]
  if (atom.energy === 'Quick') {
    dims[ENERGY_LOW] = 1.0;
  } else if (atom.energy === 'Medium') {
    dims[ENERGY_MEDIUM] = 1.0;
  } else if (atom.energy === 'Deep') {
    dims[ENERGY_HIGH] = 1.0;
  }
  // undefined → all zero (default)

  // [18] enrichment_depth_norm — capped at 1.0 at 5 Q&A pairs
  dims[ENRICHMENT_DEPTH_NORM] = Math.min((sidecar?.enrichment?.length ?? 0) / 5, 1.0);

  // [19] has_person_dep — any PER entity in the entity list
  dims[HAS_PERSON_DEP] = entities.some((e) => e.type === 'PER') ? 1.0 : 0.0;

  // [20] time_pressure_score — sigmoid of days-to-deadline
  if (atom.dueDate) {
    const daysToDeadline = (atom.dueDate - now) / 86_400_000;
    dims[TIME_PRESSURE_SCORE] = timePressureSigmoid(Math.max(0, daysToDeadline));
  }

  // [21] prev_staleness_score — same as staleness_norm (semantic: "how stale before this touch")
  dims[PREV_STALENESS_SCORE] = dims[STALENESS_NORM]!;

  // [22] prev_energy_fit — cognitive signal confidence if available, else 0.5 (neutral)
  const energySignal = sidecar?.cognitiveSignals?.find((s) => s.modelId === 'energy-level');
  dims[PREV_ENERGY_FIT] = energySignal ? energySignal.confidence : 0.5;

  // [23] entity_reliability — primary entity's highest-confidence relation
  const entityIds = (sidecar?.entityMentions ?? [])
    .filter((m) => m.entityId)
    .map((m) => m.entityId!);
  const primaryRelation = pickPrimaryEntity(entityIds, relations);
  dims[ENTITY_RELIABILITY] = primaryRelation?.confidence ?? 0.0;

  // [24-26] entity responsiveness one-hot (fast/slow/unknown)
  // Default: unknown (no data yet — future Phase 38 will derive from interaction patterns)
  dims[ENTITY_RESP_UNKNOWN] = 1.0;

  // Runtime assertion — catches schema drift
  if (dims.length !== TASK_VECTOR_DIM) {
    console.error(
      `[task-vector] Dimension mismatch: got ${dims.length}, expected ${TASK_VECTOR_DIM}`,
    );
  }

  return dims;
}
