/**
 * Intelligence sidecar type definitions and Zod schemas.
 *
 * The atomIntelligence sidecar stores ALL AI-generated knowledge
 * (enrichment Q&A, entity mentions, cognitive signals, extensible records)
 * SEPARATE from atom.content -- content stays pure user text.
 *
 * Entity and EntityRelation types support the entity registry (Phase 27)
 * and relationship inference (Phase 28).
 *
 * SmartLink provides typed external links on atoms (URLs, deep links, etc.).
 *
 * All types include CRDT metadata fields for future v7.0 sync support.
 *
 * Phase 26: SIDE-01, SIDE-02, SIDE-04, ENTR-01, ENTR-02
 */

import { z } from 'zod/v4';

// ---------------------------------------------------------------------------
// Relationship type constants
// ---------------------------------------------------------------------------

export const RELATIONSHIP_TYPES = [
  'spouse',
  'parent',
  'child',
  'colleague',
  'reports-to',
  'healthcare-provider',
  'friend',
  'org-member',
  'lives-at',
  'works-at',
] as const;

export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

// ---------------------------------------------------------------------------
// Enrichment record — Q&A pair from enrichment wizard
// ---------------------------------------------------------------------------

export const EnrichmentRecordSchema = z.object({
  category: z.string(),
  question: z.string(),
  answer: z.string(),
  depth: z.number(),
  timestamp: z.number(),
  tier: z.string(),
});
export type EnrichmentRecord = z.infer<typeof EnrichmentRecordSchema>;

// ---------------------------------------------------------------------------
// Entity mention — placeholder for Phase 27 NER detection
// ---------------------------------------------------------------------------

export const EntityMentionSchema = z.object({
  entityText: z.string(),
  entityType: z.enum(['PER', 'LOC', 'ORG', 'MISC', 'DATE']),
  spanStart: z.number(),
  spanEnd: z.number(),
  confidence: z.number(),
  entityId: z.string().optional(),
});
export type EntityMention = z.infer<typeof EntityMentionSchema>;

// ---------------------------------------------------------------------------
// Cached cognitive signal — ONNX model outputs cached per atom
// ---------------------------------------------------------------------------

export const CachedCognitiveSignalSchema = z.object({
  modelId: z.string(),
  label: z.string(),
  confidence: z.number(),
  timestamp: z.number(),
});
export type CachedCognitiveSignal = z.infer<typeof CachedCognitiveSignalSchema>;

// ---------------------------------------------------------------------------
// Generic intelligence record — extensible bag for future signal types
// ---------------------------------------------------------------------------

export const GenericIntelligenceRecordSchema = z.object({
  type: z.string(),
  data: z.unknown(),
  timestamp: z.number(),
});
export type GenericIntelligenceRecord = z.infer<typeof GenericIntelligenceRecordSchema>;

// ---------------------------------------------------------------------------
// AtomIntelligence — one sidecar row per atom
// ---------------------------------------------------------------------------

export const AtomIntelligenceSchema = z.object({
  atomId: z.string(),
  enrichment: z.array(EnrichmentRecordSchema),
  entityMentions: z.array(EntityMentionSchema),
  cognitiveSignals: z.array(CachedCognitiveSignalSchema),
  records: z.array(GenericIntelligenceRecordSchema),
  // CRDT metadata (v7.0 sync preparation)
  version: z.number(),
  deviceId: z.string(),
  lastUpdated: z.number(),
  schemaVersion: z.number(),
  // Phase 32: prediction momentum snapshot — stored for harness analysis
  predictionMomentum: z
    .object({
      signalFrequency: z.record(z.string(), z.number()),
      signalStrength: z.record(z.string(), z.number()),
      categoryOrdering: z.array(
        z.object({
          category: z.string(),
          score: z.number(),
          explanation: z.string(),
        })
      ),
      coldStart: z.boolean(),
      computedAt: z.number(),
    })
    .optional(),
  // Phase 32: entity momentum snapshot — stored for harness analysis
  entityMomentum: z
    .object({
      scores: z.record(z.string(), z.number()),
      computedAt: z.number(),
    })
    .optional(),
  // Phase 35: cached canonical feature vector snapshot — non-indexed, no migration needed
  canonicalVector: z
    .object({
      vectorType: z.enum(['task', 'person', 'calendar']),
      data: z.array(z.number()),
      lastComputed: z.number(),
      schemaVersion: z.number(),
    })
    .optional(),
  // Phase 36: specialist consensus risk snapshot — non-indexed, no migration needed
  consensusRisk: z
    .object({
      weightedProbability: z.number(),
      majorityVote: z.boolean(),
      agreementScore: z.number(),
      specialistContributions: z.array(
        z.object({
          name: z.string(),
          probability: z.number(),
          weight: z.number(),
        }),
      ),
      computedAt: z.number(),
    })
    .optional(),
});
export type AtomIntelligence = z.infer<typeof AtomIntelligenceSchema>;

// ---------------------------------------------------------------------------
// Entity — canonical entity in the registry
// ---------------------------------------------------------------------------

export const EntitySchema = z.object({
  id: z.string(),
  canonicalName: z.string(),
  type: z.enum(['PER', 'LOC', 'ORG']),
  aliases: z.array(z.string()),
  mentionCount: z.number(),
  firstSeen: z.number(),
  lastSeen: z.number(),
  // CRDT metadata
  version: z.number(),
  deviceId: z.string(),
  updatedAt: z.number(),
});
export type Entity = z.infer<typeof EntitySchema>;

// ---------------------------------------------------------------------------
// Entity relation — typed edge between two entities
// ---------------------------------------------------------------------------

export const EntityRelationEvidenceSchema = z.object({
  atomId: z.string(),
  snippet: z.string(),
  timestamp: z.number(),
});

export const EntityRelationSchema = z.object({
  id: z.string(),
  sourceEntityId: z.string(),
  targetEntityId: z.string(),
  relationshipType: z.string(),
  confidence: z.number().min(0).max(1),
  sourceAttribution: z.enum(['keyword', 'co-occurrence', 'user-correction']),
  evidence: z.array(EntityRelationEvidenceSchema),
  // CRDT metadata
  version: z.number(),
  deviceId: z.string(),
  updatedAt: z.number(),
});
export type EntityRelation = z.infer<typeof EntityRelationSchema>;

// ---------------------------------------------------------------------------
// Smart link — typed external link on an atom
// ---------------------------------------------------------------------------

export const SmartLinkSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['url', 'ms-graph', 'photo-share', 'app-deep-link']),
  uri: z.string(),
  label: z.string().optional(),
  note: z.string().optional(),
  addedAt: z.number(),
});
export type SmartLink = z.infer<typeof SmartLinkSchema>;
