/**
 * Binder type configuration loader.
 *
 * Loads binder type configs at build time via Vite JSON import.
 * Extensible by adding new JSON files and registering them here.
 *
 * Phase 19: CLAR-09 — binder type extensibility architecture.
 */

import gtdPersonal from './gtd-personal.json';

export interface BinderTypeConfig {
  name: string;
  purpose: string;
  categoryOrdering: string[];
  supportedAtomTypes: string[];
  questionTemplates: Record<string, { question: string; options: Record<string, string[]> }>;
  backgroundCloudEnrichment: boolean;
  /** Follow-up question templates for iterative enrichment deepening (Phase 25). Depth-tiered. */
  followUpTemplates?: Record<string, {
    tiers: Array<{ question: string; options: Record<string, string[]> }>;
  }>;
  /**
   * Maps entity relationship types to GTD @context tags.
   * When an atom's entities have known relationships, the context tag is suggested.
   * Keys are relationshipType values from entityRelations table.
   * Values are GTD @context strings (e.g. "@health", "@work", "@home").
   * Phase 29: ENTC-03
   */
  entityContextMappings?: Record<string, string>;
}

/** Registry of all binder type configs, keyed by slug. */
const BINDER_CONFIGS: Record<string, BinderTypeConfig> = {
  'gtd-personal': gtdPersonal as BinderTypeConfig,
};

/**
 * Get a binder type configuration by slug.
 * Falls back to 'gtd-personal' if the requested type is not found.
 */
export function getBinderConfig(type: string = 'gtd-personal'): BinderTypeConfig {
  const config = BINDER_CONFIGS[type];
  if (config) return config;
  // Default GTD Personal is always present — non-null assertion safe here
  return BINDER_CONFIGS['gtd-personal']!;
}
