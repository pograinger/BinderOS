/**
 * Zod schema for the expanded BinderTypeConfig — the authoritative OS-like
 * driver descriptor for all binder-type concerns.
 *
 * The ExpandedBinderTypeConfig extends the legacy BinderTypeConfig shape with:
 * - slug, schemaVersion, metadata fields (description, icon, category, author)
 * - columnSet: which ONNX cognitive models are active for this binder type
 * - compositorRules: JSON-serializable signal combination rules
 * - relationshipPatterns: keyword-based entity relationship patterns
 * - entityTypePriority: NER detection priority order
 * - predicateConfig: context gate predicate configuration
 * - maturityThresholds: enrichment graduation criteria
 *
 * Import direction: schema.ts imports FROM cognitive-signals.ts.
 * cognitive-signals.ts NEVER imports from binder-types — no circular deps.
 *
 * Phase 30: SCHM-01, BTYPE-01
 */

import { z } from 'zod/v4';
import { COGNITIVE_MODEL_IDS } from '../../ai/tier2/cognitive-signals';

// ---------------------------------------------------------------------------
// Compositor rule DSL schema (JSON-serializable, replaces evaluate() functions)
// ---------------------------------------------------------------------------

/**
 * A single clause in a compositor rule condition.
 * Matches a cognitive model's output label against a value or set of values.
 */
const CompositorClauseSchema = z.object({
  /** Which cognitive model's output to test */
  modelId: z.enum(COGNITIVE_MODEL_IDS),
  /** The label or value to compare against */
  label: z.union([z.string(), z.array(z.string())]),
  /** Comparison operator */
  op: z.enum(['==', 'in', '!=']),
});

/**
 * The condition for a compositor rule — evaluates all clauses with AND or OR logic.
 */
const CompositorConditionSchema = z.object({
  operator: z.enum(['AND', 'OR']),
  clauses: z.array(CompositorClauseSchema).min(1),
});

/**
 * JSON-serializable compositor rule config.
 * Replaces the CompositorRule.evaluate() function with a declarative condition DSL.
 * Source of truth for both Python training scripts and TypeScript runtime.
 */
export const CompositorRuleConfigSchema = z.object({
  /** Human-readable rule name (matches COMPOSITOR_RULES[n].name) */
  name: z.string().min(1),
  /** Which cognitive models this rule reads from */
  inputs: z.array(z.enum(COGNITIVE_MODEL_IDS)).min(1),
  /** The composite signal this rule outputs */
  outputSignal: z.string().min(1),
  /** Declarative condition DSL — evaluated at runtime */
  condition: CompositorConditionSchema,
  /** Optional string value for the composite signal (default: true) */
  outputValue: z.string().optional(),
});

export type CompositorRuleConfig = z.infer<typeof CompositorRuleConfigSchema>;

// ---------------------------------------------------------------------------
// Gate predicate config schema
// ---------------------------------------------------------------------------

/**
 * Configuration for all three built-in gate predicate dimensions.
 * Stored in BinderTypeConfig so binder types declare their own gate behavior.
 */
const GatePredicateConfigSchema = z.object({
  /** Route-based gating — block enrichment on these app routes */
  routeGating: z.object({
    blockedRoutes: z.array(z.string()),
  }),
  /** Time-based gating — block enrichment during low-energy hours */
  timeGating: z.object({
    /** Hours of day (0–23) when enrichment is suppressed */
    lowEnergyHours: z.array(z.number().int().min(0).max(23)),
  }),
  /** History-based gating — prevent re-enrichment too soon */
  historyGating: z.object({
    /** Maximum enrichment depth before graduation check */
    maxDepth: z.number().int().positive(),
    /** Days after which an enriched atom is considered stale */
    staleDays: z.number().int().positive(),
  }),
});

// ---------------------------------------------------------------------------
// Relationship pattern schema (matches RelationshipPattern from inference/types.ts)
// ---------------------------------------------------------------------------

const RelationshipPatternSchema = z.object({
  id: z.string().min(1),
  keywords: z.array(z.string()).min(1),
  relationshipType: z.string().min(1),
  targetEntityType: z.string().min(1),
  confidenceBase: z.number().min(0).max(1),
  scope: z.string().min(1),
  proximityMaxWords: z.number().int().positive().optional(),
  entityTextFilter: z.string().optional(),
  suppressedByTypes: z.array(z.string()).optional(),
  skipOnPossessiveGap: z.boolean().optional(),
  caseSensitiveKeywords: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Prediction config schema (Phase 32 — predictive enrichment scorer)
// ---------------------------------------------------------------------------

/**
 * Tuning parameters for the momentum-based predictive enrichment scorer.
 * All fields have defaults so this config is fully optional in binder type manifests.
 */
export const PredictionConfigSchema = z.object({
  /** Number of recent atoms to include in the momentum window */
  windowSize: z.number().int().positive().default(20),
  /** Maximum age of atoms (hours) eligible for the momentum window */
  maxWindowHours: z.number().positive().default(48),
  /** Half-life (in atoms) for exponential decay weighting in momentum */
  momentumHalfLife: z.number().positive().default(5),
  /** Minimum atoms with cognitive signals before momentum is considered warm */
  coldStartThreshold: z.number().int().positive().default(15),
  /** Minimum atoms with entity mentions before entity trajectory is enabled */
  entityColdStartThreshold: z.number().int().positive().default(10),
  /** Cache TTL in milliseconds for computed momentum vectors */
  cacheTtlMs: z.number().int().positive().default(300000),
});

export type PredictionConfig = z.infer<typeof PredictionConfigSchema>;

// ---------------------------------------------------------------------------
// Full expanded BinderTypeConfig schema
// ---------------------------------------------------------------------------

/**
 * Full schema for the expanded BinderTypeConfig.
 * Includes all legacy fields plus v5.5 additions.
 * Validated on load; bad configs fall back to gtd-personal with a console warning.
 */
export const BinderTypeConfigSchema = z.object({
  // --- Metadata (OS-like plugin manifest fields) ---
  /** Unique identifier for this binder type (directory slug) */
  slug: z.string().min(1),
  /** Human-readable display name */
  name: z.string().min(1),
  /** Config schema version — harness checks this for auto-retrain triggers */
  schemaVersion: z.number().int().positive(),
  /** Optional human-readable description */
  description: z.string().optional(),
  /** Optional icon identifier (emoji or SVG path reference) */
  icon: z.string().optional(),
  /** Binder type category for the future picker/marketplace UI */
  category: z.enum(['productivity', 'research', 'creative']).optional(),
  /** Author or organization that created this binder type */
  author: z.string().optional(),
  /** Minimum app version required for this binder type */
  minAppVersion: z.string().optional(),

  // --- Legacy enrichment fields (preserved for backwards compat) ---
  /** Short description of the binder type's purpose */
  purpose: z.string().min(1),
  /** Ordered list of enrichment category keys */
  categoryOrdering: z.array(z.string()).min(1),
  /** Atom types this binder type supports */
  supportedAtomTypes: z.array(z.string()).min(1),
  /** Per-category enrichment question templates */
  questionTemplates: z.record(
    z.string(),
    z.object({
      question: z.string(),
      options: z.record(z.string(), z.array(z.string())),
    })
  ),
  /** Whether to enable background cloud enrichment for this binder type */
  backgroundCloudEnrichment: z.boolean(),
  /** Optional follow-up question templates for iterative deepening (Phase 25) */
  followUpTemplates: z
    .record(
      z.string(),
      z.object({
        tiers: z.array(
          z.object({
            question: z.string(),
            options: z.record(z.string(), z.array(z.string())),
          })
        ),
      })
    )
    .optional(),
  /** Optional entity relationship type → GTD @context tag mappings */
  entityContextMappings: z.record(z.string(), z.string()).optional(),

  // --- v5.5 ONNX column set ---
  /** Which cognitive models are active for this binder type (saves compute on mobile) */
  columnSet: z.array(z.enum(COGNITIVE_MODEL_IDS)).min(1),

  // --- v5.5 Compositor rules (JSON-serializable, replaces evaluate() functions) ---
  /** Signal combination rules for this binder type */
  compositorRules: z.array(CompositorRuleConfigSchema),

  // --- v5.5 Relationship patterns (moved from relationship-patterns.json) ---
  /** Keyword-based entity relationship detection patterns for this binder type */
  relationshipPatterns: z.array(RelationshipPatternSchema),

  // --- v5.5 Entity type priority ---
  /** NER entity types in detection/enrichment priority order */
  entityTypePriority: z.array(z.enum(['PER', 'LOC', 'ORG'])).min(1),

  // --- v5.5 Gate predicate config ---
  /** Context gate predicate configuration for this binder type */
  predicateConfig: GatePredicateConfigSchema,

  // --- v5.5 Maturity thresholds ---
  /** Enrichment graduation and depth limits for this binder type */
  maturityThresholds: z.object({
    /** Enrichment depth at which an atom is considered mature */
    graduationDepth: z.number().int().positive(),
    /** Maximum enrichment depth before stopping further questions */
    maxEnrichmentDepth: z.number().int().positive(),
  }),

  // --- Phase 32: Predictive enrichment scorer config ---
  /** Prediction algorithm tuning parameters */
  predictionConfig: PredictionConfigSchema.optional(),
  /** Maps cognitive model IDs to enrichment category arrays */
  signalCategoryMap: z.record(z.string(), z.array(z.string())).optional(),
  /** Maps NER entity types (PER, LOC, ORG) to enrichment category arrays */
  entityCategoryMap: z.record(z.string(), z.array(z.string())).optional(),
  /** Type-level weight multipliers for entity momentum scoring */
  entityTypePriorityWeights: z.record(z.string(), z.number()).optional(),

  // --- Phase 35: Canonical feature vector schema (dimension name declarations) ---
  /**
   * Named dimension arrays for each canonical vector type.
   * GTD vectors.json is the authoritative source — consumed by compute functions.
   */
  vectorSchema: z
    .object({
      task: z.array(z.string()).optional(),
      person: z.array(z.string()).optional(),
      calendar: z.array(z.string()).optional(),
    })
    .optional(),
});

/**
 * Inferred TypeScript type for the full expanded BinderTypeConfig.
 * Use this instead of the legacy BinderTypeConfig interface for v5.5+ code.
 */
export type ExpandedBinderTypeConfig = z.infer<typeof BinderTypeConfigSchema>;
