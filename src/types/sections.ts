/**
 * Section and SectionItem type definitions with Zod schemas.
 *
 * Four stable sections: Projects, Areas, Resources, Archive (ORG-01).
 * SectionItems are mutable records within sections (e.g., specific projects).
 * Users can create, rename, and archive section items (ORG-02).
 */

import { z } from 'zod/v4';

// --- Section type enum (four stable sections) ---

export const SectionType = z.enum([
  'projects',
  'areas',
  'resources',
  'archive',
]);
export type SectionType = z.infer<typeof SectionType>;

// --- Section schema ---

export const SectionSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  type: SectionType,
  order: z.number(),
  created_at: z.number(), // Unix ms timestamp
});
export type Section = z.infer<typeof SectionSchema>;

// --- Section item schema ---

export const SectionItemSchema = z.object({
  id: z.string().uuid(),
  sectionId: z.string().uuid(),
  name: z.string(),
  description: z.string().optional(),
  archived: z.boolean().default(false),
  created_at: z.number(), // Unix ms timestamp
  updated_at: z.number(), // Unix ms timestamp
});
export type SectionItem = z.infer<typeof SectionItemSchema>;
