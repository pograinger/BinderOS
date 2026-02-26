/**
 * AI settings persistence using the Dexie config table.
 *
 * Phase 5: Fixes the deferred Phase 4 issue where AI settings
 * (aiEnabled, browserLLMEnabled, etc.) reset to defaults on every page
 * reload because they were stored only in reactive SolidJS state.
 *
 * Uses the writeQueue for batched writes (same pattern as classification-log.ts).
 * loadAISettings() is called in the worker INIT handler and the result is
 * included in the READY payload so the store can hydrate from persisted state.
 * saveAISettings() is called via the SAVE_AI_SETTINGS worker command whenever
 * the user toggles an AI setting.
 */

import { db } from './db';
import { writeQueue } from './write-queue';

const AI_SETTINGS_KEY = 'ai-settings';

export interface AISettings {
  aiEnabled: boolean;
  browserLLMEnabled: boolean;
  cloudAPIEnabled: boolean;
  aiFirstRunComplete: boolean;
  triageEnabled: boolean;
  reviewEnabled: boolean;
  compressionEnabled: boolean;
  selectedModelId?: string;  // WebLLM model ID (default: Llama-3.2-3B-Instruct-q4f16_1-MLC)
}

/**
 * Load AI settings from the Dexie config table.
 * Returns null if no settings have been saved yet (first run).
 * Caller (worker INIT) should fall back to defaults when null is returned.
 */
export async function loadAISettings(): Promise<AISettings | null> {
  const entry = await db.config.get(AI_SETTINGS_KEY);
  return entry ? (entry.value as AISettings) : null;
}

/**
 * Save (partial) AI settings to the Dexie config table.
 * Merges with any previously stored settings — only the provided
 * fields are updated, others are preserved.
 * Uses the write queue for batched persistence.
 */
export function saveAISettings(settings: Partial<AISettings>): void {
  writeQueue.enqueue(async () => {
    const existing = await db.config.get(AI_SETTINGS_KEY);
    const merged = { ...(existing?.value ?? {}), ...settings };
    await db.config.put({ key: AI_SETTINGS_KEY, value: merged });
  });
}
