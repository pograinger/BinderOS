/**
 * Binder type configuration registry — expanded API.
 *
 * Loads all per-concern JSON files for each registered binder type at module
 * init, merges them into a single ExpandedBinderTypeConfig, and validates with
 * Zod. Exposes a full registry API including harness override injection.
 *
 * Import direction:
 *   index.ts → schema.ts → cognitive-signals.ts
 *   cognitive-signals.ts NEVER imports from binder-types (no circular deps)
 *
 * Phase 19: CLAR-09 — binder type extensibility architecture
 * Phase 30: BTYPE-01 — expanded registry with full API
 */

import { BinderTypeConfigSchema, type ExpandedBinderTypeConfig } from './schema';

// Re-export ExpandedBinderTypeConfig as BinderTypeConfig for backward compat.
// Existing consumers that import { BinderTypeConfig } from this file get the
// expanded type without any code changes needed.
export type { ExpandedBinderTypeConfig };
export type BinderTypeConfig = ExpandedBinderTypeConfig;

// ---------------------------------------------------------------------------
// BinderTypeMeta — lightweight registry entry for listBinderTypes()
// ---------------------------------------------------------------------------

export interface BinderTypeMeta {
  slug: string;
  name: string;
  description?: string;
  icon?: string;
  category?: string;
  schemaVersion: number;
}

// ---------------------------------------------------------------------------
// Per-concern JSON imports — gtd-personal
// Static imports: Vite watches these files and hot-reloads on change.
// No virtual module or plugin needed — Vite JSON import support is sufficient.
// ---------------------------------------------------------------------------

import manifest from './gtd-personal/manifest.json';
import columns from './gtd-personal/columns.json';
import compositor from './gtd-personal/compositor.json';
import enrichment from './gtd-personal/enrichment.json';
import relationships from './gtd-personal/relationships.json';
import gating from './gtd-personal/gating.json';
import entities from './gtd-personal/entities.json';
import prediction from './gtd-personal/prediction.json';
import vectors from './gtd-personal/vectors.json';

// ---------------------------------------------------------------------------
// Merge and validate at module init
// ---------------------------------------------------------------------------

function mergeGtdPersonalConfig(): ExpandedBinderTypeConfig {
  const merged = {
    // Metadata from manifest
    slug: manifest.slug,
    name: manifest.name,
    schemaVersion: manifest.schemaVersion,
    description: manifest.description,
    icon: manifest.icon,
    category: manifest.category,
    author: manifest.author,
    minAppVersion: manifest.minAppVersion,

    // Enrichment fields (legacy BinderTypeConfig fields)
    purpose: enrichment.purpose,
    categoryOrdering: enrichment.categoryOrdering,
    supportedAtomTypes: enrichment.supportedAtomTypes,
    questionTemplates: enrichment.questionTemplates,
    backgroundCloudEnrichment: enrichment.backgroundCloudEnrichment,
    followUpTemplates: enrichment.followUpTemplates,

    // Entity context mappings (formerly in gtd-personal.json)
    entityContextMappings: entities.entityContextMappings,

    // v5.5 ONNX column set
    columnSet: columns.columnSet,

    // v5.5 Compositor rules (JSON-serializable DSL)
    compositorRules: compositor.compositorRules,

    // v5.5 Relationship patterns (moved from relationship-patterns.json)
    relationshipPatterns: relationships.patterns,

    // v5.5 Entity type priority
    entityTypePriority: entities.entityTypePriority,

    // v5.5 Gate predicate config
    predicateConfig: gating.predicateConfig,

    // v5.5 Maturity thresholds
    maturityThresholds: entities.maturityThresholds,

    // Phase 32: prediction config (momentum scorer)
    predictionConfig: prediction.predictionConfig,
    signalCategoryMap: prediction.signalCategoryMap,
    entityCategoryMap: prediction.entityCategoryMap,
    entityTypePriorityWeights: prediction.entityTypePriorityWeights,

    // Phase 35: canonical feature vector schema (dimension name declarations)
    vectorSchema: vectors.vectorSchema,
  };

  const result = BinderTypeConfigSchema.safeParse(merged);
  if (!result.success) {
    console.error(
      '[binder-types] gtd-personal config failed Zod validation — using raw merged object:',
      result.error.issues,
    );
    // Fall back gracefully: return the raw merged object as-is.
    // Callers continue to work; validation errors are logged for developer attention.
    return merged as unknown as ExpandedBinderTypeConfig;
  }
  return result.data;
}

const GTD_PERSONAL_CONFIG: ExpandedBinderTypeConfig = mergeGtdPersonalConfig();

// ---------------------------------------------------------------------------
// Registry — keyed by slug
// ---------------------------------------------------------------------------

const REGISTRY: Record<string, ExpandedBinderTypeConfig> = {
  'gtd-personal': GTD_PERSONAL_CONFIG,
};

// ---------------------------------------------------------------------------
// Module-level override state (plain variables, NOT SolidJS store).
// SolidJS proxies break function references — keep callbacks outside reactive state.
// See project memory: "SolidJS Store Gotcha"
// ---------------------------------------------------------------------------

let _activeOverride: ExpandedBinderTypeConfig | null = null;
let _activeSlug: string = 'gtd-personal';

// ---------------------------------------------------------------------------
// Registry API
// ---------------------------------------------------------------------------

/**
 * Get a binder type configuration by slug.
 *
 * If a harness override is active (set via setActiveBinderConfig), it takes
 * precedence over the registry lookup. Falls back to 'gtd-personal' if the
 * requested slug is not found.
 */
export function getBinderConfig(slug: string = 'gtd-personal'): ExpandedBinderTypeConfig {
  if (_activeOverride !== null) return _activeOverride;
  return REGISTRY[slug] ?? REGISTRY['gtd-personal']!;
}

/**
 * Return lightweight metadata for all registered binder types.
 * Used by the binder-type picker UI and harness type discovery.
 */
export function listBinderTypes(): BinderTypeMeta[] {
  return Object.values(REGISTRY).map((config) => ({
    slug: config.slug,
    name: config.name,
    description: config.description,
    icon: config.icon,
    category: config.category,
    schemaVersion: config.schemaVersion,
  }));
}

/**
 * Return the currently active binder type slug.
 * Defaults to 'gtd-personal'.
 */
export function getActiveBinderType(): string {
  return _activeSlug;
}

/**
 * Set the active binder type slug.
 * Validates that the slug exists in the registry (logs a warning if not).
 */
export function setActiveBinderType(slug: string): void {
  if (!REGISTRY[slug]) {
    console.warn(
      `[binder-types] setActiveBinderType: slug '${slug}' not found in registry. Falling back to 'gtd-personal'.`,
    );
  }
  _activeSlug = slug;
}

/**
 * Inject a full config override — used by the harness to swap binder configs
 * without touching Dexie or rebuilding the module bundle.
 *
 * Pass null to clear the override and revert to the registry lookup.
 */
export function setActiveBinderConfig(config: ExpandedBinderTypeConfig | null): void {
  _activeOverride = config;
}
