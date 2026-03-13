/**
 * computePersonVector — pure function producing a canonical person entity vector.
 *
 * Derives a Float32Array of PERSON_VECTOR_DIM (23) dimensions from:
 *   - Entity registry data (mention count, recency, aliases)
 *   - EntityRelation rows (relationship type, confidence, attribution)
 *
 * Phase 35: CFVEC-03
 */

import type { Entity, EntityRelation } from '../../types/intelligence';
import { PERSON_DIMENSION_NAMES, PERSON_VECTOR_DIM } from './types';

// ---------------------------------------------------------------------------
// Named offset constants — derived from dimension name array (no magic numbers)
// ---------------------------------------------------------------------------

const REL_SPOUSE = PERSON_DIMENSION_NAMES.indexOf('rel_spouse');
const REL_PARENT = PERSON_DIMENSION_NAMES.indexOf('rel_parent');
const REL_CHILD = PERSON_DIMENSION_NAMES.indexOf('rel_child');
const REL_COLLEAGUE = PERSON_DIMENSION_NAMES.indexOf('rel_colleague');
const REL_REPORTS_TO = PERSON_DIMENSION_NAMES.indexOf('rel_reports_to');
const REL_HEALTHCARE = PERSON_DIMENSION_NAMES.indexOf('rel_healthcare');
const REL_FRIEND = PERSON_DIMENSION_NAMES.indexOf('rel_friend');
const REL_ORG_MEMBER = PERSON_DIMENSION_NAMES.indexOf('rel_org_member');
const REL_UNKNOWN = PERSON_DIMENSION_NAMES.indexOf('rel_unknown');
const MENTION_COUNT_NORM = PERSON_DIMENSION_NAMES.indexOf('mention_count_norm');
const RECENCY_NORM = PERSON_DIMENSION_NAMES.indexOf('recency_norm');
const DAYS_SINCE_SEEN_NORM = PERSON_DIMENSION_NAMES.indexOf('days_since_seen_norm');
const HAS_USER_CORRECTION = PERSON_DIMENSION_NAMES.indexOf('has_user_correction');
const CONFIDENCE_NORM = PERSON_DIMENSION_NAMES.indexOf('confidence_norm');
const COLLAB_LOW = PERSON_DIMENSION_NAMES.indexOf('collab_low');
const COLLAB_MEDIUM = PERSON_DIMENSION_NAMES.indexOf('collab_medium');
const COLLAB_HIGH = PERSON_DIMENSION_NAMES.indexOf('collab_high');
const RELIABILITY_SCORE = PERSON_DIMENSION_NAMES.indexOf('reliability_score');
const ALIAS_COUNT_NORM = PERSON_DIMENSION_NAMES.indexOf('alias_count_norm');
const RESP_FAST = PERSON_DIMENSION_NAMES.indexOf('resp_fast');
const RESP_NORMAL = PERSON_DIMENSION_NAMES.indexOf('resp_normal');
const RESP_SLOW = PERSON_DIMENSION_NAMES.indexOf('resp_slow');
const RESP_UNKNOWN = PERSON_DIMENSION_NAMES.indexOf('resp_unknown');

// ---------------------------------------------------------------------------
// Relationship type → slot mapping (mirrors RELATIONSHIP_TYPES order)
// ---------------------------------------------------------------------------

const RELATIONSHIP_SLOT: Record<string, number> = {
  spouse: REL_SPOUSE,
  parent: REL_PARENT,
  child: REL_CHILD,
  colleague: REL_COLLEAGUE,
  'reports-to': REL_REPORTS_TO,
  'healthcare-provider': REL_HEALTHCARE,
  friend: REL_FRIEND,
  'org-member': REL_ORG_MEMBER,
};

// ---------------------------------------------------------------------------
// computePersonVector — the pure function
// ---------------------------------------------------------------------------

/**
 * Compute a canonical person entity feature vector.
 *
 * @param entity - The Entity from the entity registry
 * @param relations - EntityRelation rows for this entity
 * @returns Float32Array of length PERSON_VECTOR_DIM (23)
 */
export function computePersonVector(entity: Entity, relations: EntityRelation[]): Float32Array {
  const now = Date.now();
  const dims = new Float32Array(PERSON_VECTOR_DIM);

  // [0-8] relationship type one-hot — pick highest-confidence relation
  if (relations.length === 0) {
    // No relations → rel_unknown = 1.0
    dims[REL_UNKNOWN] = 1.0;
  } else {
    const bestRelation = relations.reduce((best, r) =>
      r.confidence > best.confidence ? r : best,
    );
    const slot = RELATIONSHIP_SLOT[bestRelation.relationshipType];
    if (slot !== undefined) {
      dims[slot] = 1.0;
    } else {
      dims[REL_UNKNOWN] = 1.0;
    }
  }

  // [9] mention_count_norm — capped at 50 mentions
  dims[MENTION_COUNT_NORM] = Math.min(entity.mentionCount / 50, 1.0);

  // [10] recency_norm — 30-day linear decay; 1.0 if seen today, 0.0 if ≥30 days
  dims[RECENCY_NORM] = Math.max(0, 1.0 - (now - entity.lastSeen) / (30 * 86_400_000));

  // [11] days_since_seen_norm — capped at 90 days
  dims[DAYS_SINCE_SEEN_NORM] = Math.min((now - entity.lastSeen) / (90 * 86_400_000), 1.0);

  // [12] has_user_correction — any relation attributed to user-correction
  dims[HAS_USER_CORRECTION] = relations.some((r) => r.sourceAttribution === 'user-correction')
    ? 1.0
    : 0.0;

  // [13] confidence_norm — max confidence across all relations
  dims[CONFIDENCE_NORM] =
    relations.length > 0 ? Math.max(...relations.map((r) => r.confidence)) : 0.0;

  // [14-16] collaboration frequency one-hot: low (<5), medium (5-20), high (>20)
  if (entity.mentionCount < 5) {
    dims[COLLAB_LOW] = 1.0;
  } else if (entity.mentionCount <= 20) {
    dims[COLLAB_MEDIUM] = 1.0;
  } else {
    dims[COLLAB_HIGH] = 1.0;
  }

  // [17] reliability_score — average confidence across all relations
  if (relations.length > 0) {
    dims[RELIABILITY_SCORE] =
      relations.reduce((sum, r) => sum + r.confidence, 0) / relations.length;
  }

  // [18] alias_count_norm — capped at 5 aliases
  dims[ALIAS_COUNT_NORM] = Math.min(entity.aliases.length / 5, 1.0);

  // [19-22] responsiveness one-hot — default unknown (future Phase 38 will derive from data)
  dims[RESP_FAST] = 0.0;
  dims[RESP_NORMAL] = 0.0;
  dims[RESP_SLOW] = 0.0;
  dims[RESP_UNKNOWN] = 1.0;

  // Runtime assertion — catches schema drift
  if (dims.length !== PERSON_VECTOR_DIM) {
    console.error(
      `[person-vector] Dimension mismatch: got ${dims.length}, expected ${PERSON_VECTOR_DIM}`,
    );
  }

  return dims;
}
