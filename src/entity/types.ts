/**
 * Entity detection types and constants.
 *
 * Phase 27: ENTD-01, ENTR-04
 */

import type { EntityMention } from '../types/intelligence';

/** Result of entity detection for a single atom */
export interface EntityDetectionResult {
  mentions: EntityMention[];
  newEntities: string[];
  updatedEntities: string[];
}

/** Result of matching a candidate name against an existing entity */
export interface MatchResult {
  entityId: string;
  score: number;
}

/** Raw NER entity from the sanitization worker */
export interface RawNEREntity {
  text: string;
  type: string;
  start: number;
  end: number;
  confidence: number;
}

/** Minimum NER confidence to accept an entity mention */
export const ENTITY_CONFIDENCE_THRESHOLD = 0.7;

/** Score threshold for automatic entity merge (high confidence) */
export const AUTO_MERGE_THRESHOLD = 0.9;

/** Score threshold for merge candidate (medium confidence -- still auto-merged in Phase 27, Phase 29 adds UX) */
export const MERGE_CANDIDATE_THRESHOLD = 0.7;
