/**
 * Database migration v1: Seed data for initial schema.
 *
 * Seeds the four stable sections (Projects, Areas, Resources, Archive)
 * on first database creation. Uses deterministic UUIDs derived from
 * section names for consistency across fresh installs.
 */

import type { Section } from '../../types/sections';

/**
 * Deterministic UUIDs for the four stable sections.
 * These are consistent across all fresh installs so seed data
 * is identical regardless of when/where the database is created.
 *
 * Generated from: UUID v5 namespace with section type names.
 * Hardcoded here for simplicity and zero runtime dependencies.
 */
export const SECTION_IDS = {
  projects:  '10000000-0000-4000-8000-000000000001',
  areas:     '10000000-0000-4000-8000-000000000002',
  resources: '10000000-0000-4000-8000-000000000003',
  archive:   '10000000-0000-4000-8000-000000000004',
} as const;

/**
 * Returns the four default sections to seed on first DB creation.
 */
export function getDefaultSections(): Section[] {
  const now = Date.now();
  return [
    {
      id: SECTION_IDS.projects,
      name: 'Projects',
      type: 'projects',
      order: 1,
      created_at: now,
    },
    {
      id: SECTION_IDS.areas,
      name: 'Areas',
      type: 'areas',
      order: 2,
      created_at: now,
    },
    {
      id: SECTION_IDS.resources,
      name: 'Resources',
      type: 'resources',
      order: 3,
      created_at: now,
    },
    {
      id: SECTION_IDS.archive,
      name: 'Archive',
      type: 'archive',
      order: 4,
      created_at: now,
    },
  ];
}
