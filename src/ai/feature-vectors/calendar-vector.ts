/**
 * computeCalendarVector — pure function producing a canonical calendar event vector.
 *
 * Derives a Float32Array of CALENDAR_VECTOR_DIM (34) dimensions from:
 *   - EventAtom metadata (eventDate, energy)
 *   - AtomIntelligence sidecar (entity mentions)
 *   - Entity registry data (priority signals, entity types)
 *
 * Phase 35: CFVEC-04
 */

import type { EventAtom } from '../../types/atoms';
import type { AtomIntelligence, Entity, EntityRelation } from '../../types/intelligence';
import { CALENDAR_DIMENSION_NAMES, CALENDAR_VECTOR_DIM, pickPrimaryEntity } from './types';

// ---------------------------------------------------------------------------
// Named offset constants — derived from dimension name array (no magic numbers)
// ---------------------------------------------------------------------------

const START_TOD_NORM = CALENDAR_DIMENSION_NAMES.indexOf('start_tod_norm');
const DOW_MON = CALENDAR_DIMENSION_NAMES.indexOf('dow_mon');
const DOW_TUE = CALENDAR_DIMENSION_NAMES.indexOf('dow_tue');
const DOW_WED = CALENDAR_DIMENSION_NAMES.indexOf('dow_wed');
const DOW_THU = CALENDAR_DIMENSION_NAMES.indexOf('dow_thu');
const DOW_FRI = CALENDAR_DIMENSION_NAMES.indexOf('dow_fri');
const DOW_SAT = CALENDAR_DIMENSION_NAMES.indexOf('dow_sat');
const DOW_SUN = CALENDAR_DIMENSION_NAMES.indexOf('dow_sun');
const DUR_LT30 = CALENDAR_DIMENSION_NAMES.indexOf('dur_lt30');
const DUR_30_60 = CALENDAR_DIMENSION_NAMES.indexOf('dur_30_60');
const DUR_60_120 = CALENDAR_DIMENSION_NAMES.indexOf('dur_60_120');
const DUR_GT120 = CALENDAR_DIMENSION_NAMES.indexOf('dur_gt120');
const ENERGY_LOW = CALENDAR_DIMENSION_NAMES.indexOf('energy_low');
const ENERGY_MEDIUM = CALENDAR_DIMENSION_NAMES.indexOf('energy_medium');
const ENERGY_HIGH = CALENDAR_DIMENSION_NAMES.indexOf('energy_high');
const HAS_DEADLINE = CALENDAR_DIMENSION_NAMES.indexOf('has_deadline');
const DAYS_TO_EVENT_NORM = CALENDAR_DIMENSION_NAMES.indexOf('days_to_event_norm');
const TIME_PRESSURE_SCORE = CALENDAR_DIMENSION_NAMES.indexOf('time_pressure_score');
const OVERRUN_RISK = CALENDAR_DIMENSION_NAMES.indexOf('overrun_risk');
const SLACK_BEFORE_NONE = CALENDAR_DIMENSION_NAMES.indexOf('slack_before_none');
const SLACK_BEFORE_SHORT = CALENDAR_DIMENSION_NAMES.indexOf('slack_before_short');
const SLACK_BEFORE_MEDIUM = CALENDAR_DIMENSION_NAMES.indexOf('slack_before_medium');
const SLACK_BEFORE_LONG = CALENDAR_DIMENSION_NAMES.indexOf('slack_before_long');
const ENTITY_IS_HIGH_PRIORITY = CALENDAR_DIMENSION_NAMES.indexOf('entity_is_high_priority');
const ENTITY_RELIABILITY = CALENDAR_DIMENSION_NAMES.indexOf('entity_reliability');
const MOBILITY_REQUIRED = CALENDAR_DIMENSION_NAMES.indexOf('mobility_required');
const IS_RECURRING = CALENDAR_DIMENSION_NAMES.indexOf('is_recurring');
const PREP_NONE = CALENDAR_DIMENSION_NAMES.indexOf('prep_none');
const PREP_SHORT = CALENDAR_DIMENSION_NAMES.indexOf('prep_short');
const PREP_MEDIUM = CALENDAR_DIMENSION_NAMES.indexOf('prep_medium');
const PREP_LONG = CALENDAR_DIMENSION_NAMES.indexOf('prep_long');
const HAS_PERSON_ENTITY = CALENDAR_DIMENSION_NAMES.indexOf('has_person_entity');
const HAS_ORG_ENTITY = CALENDAR_DIMENSION_NAMES.indexOf('has_org_entity');
const HAS_LOC_ENTITY = CALENDAR_DIMENSION_NAMES.indexOf('has_loc_entity');

// ---------------------------------------------------------------------------
// High-priority relationship types for entity_is_high_priority
// ---------------------------------------------------------------------------

const HIGH_PRIORITY_RELATION_TYPES = new Set(['spouse', 'reports-to', 'parent', 'child']);

// ---------------------------------------------------------------------------
// Sigmoid helper — time pressure score
// ---------------------------------------------------------------------------

function timePressureSigmoid(daysToEvent: number): number {
  return 1.0 / (1.0 + Math.exp(0.3 * (daysToEvent - 7)));
}

// ---------------------------------------------------------------------------
// Day-of-week slot index (0=Mon through 6=Sun, matching JS getDay() offset)
// ---------------------------------------------------------------------------

// JS getDay(): 0=Sun, 1=Mon, ..., 6=Sat
// We want: Mon→DOW_MON slot, etc.
const DOW_SLOTS = [DOW_SUN, DOW_MON, DOW_TUE, DOW_WED, DOW_THU, DOW_FRI, DOW_SAT];

// ---------------------------------------------------------------------------
// computeCalendarVector — the pure function
// ---------------------------------------------------------------------------

/**
 * Compute a canonical calendar event feature vector.
 *
 * @param atom - The EventAtom providing metadata fields
 * @param sidecar - AtomIntelligence sidecar (undefined during cold-start)
 * @param entities - Entity registry entries referenced by this atom
 * @param relations - EntityRelation rows for the referenced entities
 * @returns Float32Array of length CALENDAR_VECTOR_DIM (34)
 */
export function computeCalendarVector(
  atom: EventAtom,
  sidecar: AtomIntelligence | undefined,
  entities: Entity[],
  relations: EntityRelation[],
): Float32Array {
  const now = Date.now();
  const dims = new Float32Array(CALENDAR_VECTOR_DIM);

  if (atom.eventDate) {
    const eventMs = atom.eventDate;
    const eventDate = new Date(eventMs);

    // [0] start_tod_norm — (hour * 60 + minute) / 1440
    const hour = eventDate.getHours();
    const minute = eventDate.getMinutes();
    dims[START_TOD_NORM] = (hour * 60 + minute) / 1440;

    // [1-7] day-of-week one-hot
    const dayOfWeek = eventDate.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const dowSlot = DOW_SLOTS[dayOfWeek];
    if (dowSlot !== undefined) {
      dims[dowSlot] = 1.0;
    }

    // [15] has_deadline
    dims[HAS_DEADLINE] = 1.0;

    // [16] days_to_event_norm — capped at 1.0 at 30 days; 0 if past
    const daysToEvent = (eventMs - now) / 86_400_000;
    dims[DAYS_TO_EVENT_NORM] = Math.max(0, Math.min(daysToEvent / 30, 1.0));

    // [17] time_pressure_score
    dims[TIME_PRESSURE_SCORE] = timePressureSigmoid(Math.max(0, daysToEvent));
  }
  // else: all temporal dims remain 0.0

  // [8-11] duration buckets one-hot — EventAtom has no explicit duration field
  // Zero-fill all duration slots (no data available)
  // Note: DUR_LT30 etc. remain 0 — duration unknown

  // [12-14] energy one-hot: Quick→[12], Medium→[13], Deep→[14]
  if (atom.energy === 'Quick') {
    dims[ENERGY_LOW] = 1.0;
  } else if (atom.energy === 'Medium') {
    dims[ENERGY_MEDIUM] = 1.0;
  } else if (atom.energy === 'Deep') {
    dims[ENERGY_HIGH] = 1.0;
  }

  // [18] overrun_risk — 0.0 default (no historical data yet — placeholder for Phase 38)
  dims[OVERRUN_RISK] = 0.0;

  // [19-22] slack_before one-hot — default to none (no schedule data available)
  dims[SLACK_BEFORE_NONE] = 1.0;

  // [23] entity_is_high_priority — 1.0 if any entity has spouse/reports-to/parent/child relation
  if (sidecar && relations.length > 0) {
    const entityIds = (sidecar.entityMentions ?? [])
      .filter((m) => m.entityId)
      .map((m) => m.entityId!);
    const entityIdSet = new Set(entityIds);
    const hasHighPriorityRelation = relations.some(
      (r) =>
        (entityIdSet.has(r.sourceEntityId) || entityIdSet.has(r.targetEntityId)) &&
        HIGH_PRIORITY_RELATION_TYPES.has(r.relationshipType),
    );
    dims[ENTITY_IS_HIGH_PRIORITY] = hasHighPriorityRelation ? 1.0 : 0.0;
  }

  // [24] entity_reliability — primary entity relation confidence
  const entityIds = (sidecar?.entityMentions ?? [])
    .filter((m) => m.entityId)
    .map((m) => m.entityId!);
  const primaryRelation = pickPrimaryEntity(entityIds, relations);
  dims[ENTITY_RELIABILITY] = primaryRelation?.confidence ?? 0.0;

  // [25] mobility_required — 0.0 default (future: derive from LOC entity presence)
  dims[MOBILITY_REQUIRED] = 0.0;

  // [26] is_recurring — 0.0 default (no recurrence field on EventAtom)
  dims[IS_RECURRING] = 0.0;

  // [27-30] prep_time one-hot — default to none
  dims[PREP_NONE] = 1.0;

  // [31] has_person_entity — 1.0 if any PER entity mention in sidecar
  const mentions = sidecar?.entityMentions ?? [];
  dims[HAS_PERSON_ENTITY] = mentions.some((m) => m.entityType === 'PER') ? 1.0 : 0.0;

  // [32] has_org_entity
  dims[HAS_ORG_ENTITY] = mentions.some((m) => m.entityType === 'ORG') ? 1.0 : 0.0;

  // [33] has_loc_entity
  dims[HAS_LOC_ENTITY] = mentions.some((m) => m.entityType === 'LOC') ? 1.0 : 0.0;

  // Runtime assertion — catches schema drift
  if (dims.length !== CALENDAR_VECTOR_DIM) {
    console.error(
      `[calendar-vector] Dimension mismatch: got ${dims.length}, expected ${CALENDAR_VECTOR_DIM}`,
    );
  }

  return dims;
}
