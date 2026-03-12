/**
 * Entity-to-GTD-context suggestion logic.
 *
 * Converts entity relationship knowledge into GTD @context tag suggestions.
 * Pure module: accepts all state as parameters, no store imports.
 *
 * Phase 29: ENTC-03
 */
import type { EntityRelation } from '../types/intelligence';
import type { BinderTypeConfig } from '../config/binder-types/index';

export interface EntityContextCandidate {
  entityText: string;
  relation: EntityRelation;
}

/**
 * Given a list of entity candidates (entity text + best relation for each),
 * and the binder type config, return the best GTD @context tag suggestion.
 *
 * Selection: finds the candidate whose relation maps to a context tag in
 * entityContextMappings, preferring higher confidence. Returns null if no
 * mapping exists for any candidate's relationship type.
 */
export function suggestContextFromEntities(
  candidates: EntityContextCandidate[],
  config: BinderTypeConfig,
): string | null {
  if (!config.entityContextMappings || candidates.length === 0) return null;

  // Sort by confidence descending — prefer high-confidence relations
  const sorted = [...candidates].sort((a, b) => b.relation.confidence - a.relation.confidence);

  for (const candidate of sorted) {
    const contextTag = config.entityContextMappings[candidate.relation.relationshipType];
    if (contextTag) return contextTag;
  }

  return null;
}
