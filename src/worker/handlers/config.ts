/**
 * Worker command handlers for cap configuration.
 *
 * Reads and writes CapConfig to/from the Dexie config table.
 * Validation and guardrails (inbox: 10-30, tasks: 15-50) are enforced here.
 */

import { db } from '../../storage/db';
import { CapConfigSchema, DEFAULT_CAP_CONFIG, CAP_CONFIG_KEY } from '../../types/config';
import type { CapConfig } from '../../types/config';

/**
 * Read the current cap configuration from Dexie.
 *
 * Falls back to defaults if not found or if stored value fails validation.
 */
export async function getCapConfig(): Promise<CapConfig> {
  const entry = await db.config.get(CAP_CONFIG_KEY);
  if (!entry) {
    return { ...DEFAULT_CAP_CONFIG };
  }

  const result = CapConfigSchema.safeParse(entry.value);
  if (!result.success) {
    console.warn('[getCapConfig] Stored cap config failed validation, using defaults', result.error);
    return { ...DEFAULT_CAP_CONFIG };
  }

  return result.data;
}

/**
 * Persist new cap configuration to Dexie with guardrail validation.
 *
 * Guardrails (per CONTEXT.md):
 * - inboxCap: min 10, max 30
 * - taskCap: min 15, max 50
 */
export async function setCapConfig(config: CapConfig): Promise<CapConfig> {
  const result = CapConfigSchema.safeParse(config);
  if (!result.success) {
    throw new Error(
      `setCapConfig: invalid config — ${result.error.issues.map((i) => i.message).join(', ')}`,
    );
  }

  const validated = result.data;
  await db.config.put({ key: CAP_CONFIG_KEY, value: validated });
  return validated;
}
