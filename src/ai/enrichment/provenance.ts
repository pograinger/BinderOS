/**
 * Provenance bitmask system for tracking AI model contributions.
 *
 * Each bit in a 32-bit integer maps to either a model (bits 0-7) or an
 * operation (bits 8-14). This allows a single number field on each atom
 * to record the full history of which AI tiers contributed to its enrichment.
 *
 * Pure module -- no store imports, no side effects.
 *
 * Phase 24: ENRICH-06
 */

// --- Model IDs (bits 0-7) ---

/** Bit flags identifying which AI models contributed to an atom's data. */
export const MODEL_IDS = {
  /** Tier 1: Type classification ONNX model */
  TYPE_ONNX:      1 << 0,  // 1
  /** Tier 1: GTD routing / section assignment */
  GTD_ROUTING:    1 << 1,  // 2
  /** Tier 2a: Decomposition ONNX model */
  DECOMPOSE_ONNX: 1 << 2, // 4
  /** Tier 2a: Sanitization NER model */
  SANITIZE_NER:   1 << 3,  // 8
  /** Tier 2a: Completeness gate classifier */
  COMPLETENESS:   1 << 4,  // 16
  /** Tier 2a: Missing info classifiers */
  MISSING_INFO:   1 << 5,  // 32
  /** Tier 2b: In-browser WASM LLM */
  WASM_LLM:       1 << 6,  // 64
  /** Tier 3: Cloud LLM (Anthropic, OpenAI, etc.) */
  CLOUD_LLM:      1 << 7,  // 128
} as const;

// --- Operation IDs (bits 8-14) ---

/** Bit flags identifying which operations were performed on an atom. */
export const OPERATION_IDS = {
  /** Type classification operation */
  CLASSIFY:      1 << 8,   // 256
  /** Decomposition operation */
  DECOMPOSE:     1 << 9,   // 512
  /** Clarification question generation */
  CLARIFY:       1 << 10,  // 1024
  /** Enrichment from answers */
  ENRICH:        1 << 11,  // 2048
  /** Prompt sanitization */
  SANITIZE:      1 << 12,  // 4096
  /** Entity detection */
  ENTITY_DETECT: 1 << 13,  // 8192
  /** Graduation from inbox to binder */
  GRADUATE:      1 << 14,  // 16384
} as const;

// --- Human-readable name maps ---

const MODEL_NAMES: Record<number, string> = {
  [MODEL_IDS.TYPE_ONNX]:      'Type ONNX',
  [MODEL_IDS.GTD_ROUTING]:    'GTD Routing',
  [MODEL_IDS.DECOMPOSE_ONNX]: 'Decompose ONNX',
  [MODEL_IDS.SANITIZE_NER]:   'Sanitize NER',
  [MODEL_IDS.COMPLETENESS]:   'Completeness',
  [MODEL_IDS.MISSING_INFO]:   'Missing Info',
  [MODEL_IDS.WASM_LLM]:       'WASM LLM',
  [MODEL_IDS.CLOUD_LLM]:      'Cloud LLM',
};

const OPERATION_NAMES: Record<number, string> = {
  [OPERATION_IDS.CLASSIFY]:      'Classify',
  [OPERATION_IDS.DECOMPOSE]:     'Decompose',
  [OPERATION_IDS.CLARIFY]:       'Clarify',
  [OPERATION_IDS.ENRICH]:        'Enrich',
  [OPERATION_IDS.SANITIZE]:      'Sanitize',
  [OPERATION_IDS.ENTITY_DETECT]: 'Entity Detect',
  [OPERATION_IDS.GRADUATE]:      'Graduate',
};

/**
 * Add provenance flags to an existing bitmask via bitwise OR.
 *
 * @param current - Current bitmask value
 * @param flags - One or more flags to set (combine with |)
 * @returns Updated bitmask
 */
export function addProvenance(current: number, flags: number): number {
  return current | flags;
}

/**
 * Determine which AI tiers contributed based on the provenance bitmask.
 *
 * - t1: Deterministic classifiers (TYPE_ONNX, GTD_ROUTING)
 * - t2a: Compact neural models (DECOMPOSE_ONNX, COMPLETENESS, MISSING_INFO)
 * - t2b: In-browser WASM LLM
 * - t3: Cloud LLM
 */
export function getTiersUsed(bitmask: number): {
  t1: boolean;
  t2a: boolean;
  t2b: boolean;
  t3: boolean;
} {
  return {
    t1:  !!(bitmask & (MODEL_IDS.TYPE_ONNX | MODEL_IDS.GTD_ROUTING)),
    t2a: !!(bitmask & (MODEL_IDS.DECOMPOSE_ONNX | MODEL_IDS.COMPLETENESS | MODEL_IDS.MISSING_INFO)),
    t2b: !!(bitmask & MODEL_IDS.WASM_LLM),
    t3:  !!(bitmask & MODEL_IDS.CLOUD_LLM),
  };
}

/**
 * Get human-readable names for all active model bits (bits 0-7).
 */
export function getModelNames(bitmask: number): string[] {
  const names: string[] = [];
  for (const [bit, name] of Object.entries(MODEL_NAMES)) {
    if (bitmask & Number(bit)) {
      names.push(name);
    }
  }
  return names;
}

/**
 * Get human-readable names for all active operation bits (bits 8-14).
 */
export function getOperationNames(bitmask: number): string[] {
  const names: string[] = [];
  for (const [bit, name] of Object.entries(OPERATION_NAMES)) {
    if (bitmask & Number(bit)) {
      names.push(name);
    }
  }
  return names;
}
