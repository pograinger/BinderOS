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
