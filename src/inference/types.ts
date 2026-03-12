/**
 * Shared type definitions for the relationship inference engine.
 *
 * Phase 28: RELI-01, RELI-02, RELI-03
 */

// ---------------------------------------------------------------------------
// Keyword pattern config types (matches relationship-patterns.json shape)
// ---------------------------------------------------------------------------

export interface RelationshipPattern {
  /** Unique identifier for the pattern */
  id: string;
  /** Root keyword forms — fuzzy matching handles inflections at runtime */
  keywords: string[];
  /** Relationship type to infer when this pattern fires */
  relationshipType: string;
  /** Entity type the target entity must be */
  targetEntityType: 'PER' | 'LOC' | 'ORG';
  /** Initial confidence value for newly inferred relationships */
  confidenceBase: number;
  /** Matching scope — always 'sentence' in Phase 28 */
  scope?: 'sentence';
  /** Optional regex pattern the entity text must match for this pattern to fire.
   *  Used to restrict healthcare-context to entities with "Dr." prefix. */
  entityTextFilter?: string;
  /** Relationship types that suppress this pattern for the same entity.
   *  E.g., if "veterinarian" already exists for Dr. Patel, don't also create "healthcare-provider". */
  suppressedByTypes?: string[];
}

export interface RelationshipPatternsConfig {
  version: number;
  patterns: RelationshipPattern[];
}

// ---------------------------------------------------------------------------
// Pattern match result — one match per (pattern, entity) in a sentence
// ---------------------------------------------------------------------------

export interface PatternMatch {
  /** Pattern that fired */
  patternId: string;
  /** Inferred relationship type */
  relationshipType: string;
  /** Confidence value from pattern config */
  confidence: number;
  /** Registry UUID of the matched entity */
  entityId: string;
  /** Display text of the matched entity */
  entityText: string;
  /** Sentence text used as evidence snippet */
  snippet: string;
}

// ---------------------------------------------------------------------------
// Inference result — summary of what the orchestrator did for one atom
// ---------------------------------------------------------------------------

export interface InferenceResult {
  atomId: string;
  keywordRelationsCreated: number;
  cooccurrencePairsRecorded: number;
  cooccurrenceFlushed: boolean;
}
