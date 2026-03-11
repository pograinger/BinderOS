/**
 * Dedicated web worker for NER-based PII detection via Transformers.js.
 *
 * LOCKED DECISION (zero network calls):
 * - env.allowRemoteModels = false — NEVER fetches from HuggingFace CDN at runtime
 * - env.allowLocalModels = true — loads only from bundled local files
 * - env.localModelPath = '/models/' — served by Vite from public/models/
 *
 * The NER model is loaded LAZILY — only on the first SANITIZE message or explicit LOAD_NER.
 * This keeps memory footprint zero until cloud dispatch is actually used.
 *
 * Message protocol:
 * Incoming:
 *   { type: 'SANITIZE'; id: string; text: string }
 *   { type: 'LOAD_NER' }
 * Outgoing:
 *   { type: 'SANITIZE_RESULT'; id: string; entities: Array<{ text: string; category: string; start: number; end: number; confidence: number }> }
 *   { type: 'SANITIZE_ERROR'; id: string; error: string }
 *   { type: 'NER_READY' }
 *   { type: 'NER_LOADING' }
 *   { type: 'NER_ERROR'; error: string }
 *
 * Phase 14: SNTZ-01 — dedicated sanitization worker for PII NER inference.
 */

import { pipeline, env } from '@huggingface/transformers';
import * as ort from 'onnxruntime-web';

// --- Configure for local-only model loading ---

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = '/models/';

// --- Configure ONNX Runtime Web ---

ort.env.wasm.proxy = false;
ort.env.wasm.numThreads = 1;

// --- NER pipeline singleton (lazy loaded) ---

type NERPipeline = (text: string, options?: Record<string, unknown>) => Promise<NEROutput[]>;

interface NEROutput {
  entity_group?: string;
  entity?: string;
  word: string;
  start: number;
  end: number;
  score: number;
}

let nerPipeline: NERPipeline | null = null;
let nerLoading = false;
let nerError: string | null = null;

const NER_MODEL_ID = 'onnx-community/distilbert-NER-ONNX';

/**
 * Map NER model entity labels to EntityCategory strings.
 * Handles both "B-PERSON" / "I-PERSON" IOB format and plain "PERSON" labels.
 */
function mapEntityCategory(label: string): string | null {
  // Strip IOB prefix if present
  const cleanLabel = label.replace(/^[BI]-/, '').toUpperCase();

  const CATEGORY_MAP: Record<string, string> = {
    'PERSON': 'PERSON',
    'PER': 'PERSON',
    'LOCATION': 'LOCATION',
    'LOC': 'LOCATION',
    'GPE': 'LOCATION',
    'ORGANIZATION': 'LOCATION', // Orgs often contain location info
    'ORG': 'LOCATION',
    'FINANCIAL': 'FINANCIAL',
    'MONEY': 'FINANCIAL',
    'CONTACT': 'CONTACT',
    'EMAIL': 'CONTACT',
    'PHONE': 'CONTACT',
    'CREDENTIAL': 'CREDENTIAL',
    'MISC': 'PERSON', // Conservative fallback
  };

  return CATEGORY_MAP[cleanLabel] ?? null;
}

async function loadNER(): Promise<NERPipeline> {
  if (nerPipeline) return nerPipeline;
  if (nerError) throw new Error(nerError);

  if (nerLoading) {
    // Wait for ongoing load
    while (nerLoading) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (nerPipeline) return nerPipeline;
    throw new Error(nerError ?? 'NER pipeline failed to load');
  }

  nerLoading = true;
  self.postMessage({ type: 'NER_LOADING' });

  try {
    const pipe = await pipeline('token-classification', NER_MODEL_ID, {
      dtype: 'q8' as Parameters<typeof pipeline>[2] extends infer T ? T extends { dtype?: infer D } ? D : never : never,
    });

    nerPipeline = async (text: string, options?: Record<string, unknown>) => {
      // aggregation_strategy is supported at runtime but not in the TypeScript types
      const result = await pipe(text, { aggregation_strategy: 'simple', ...options } as Record<string, unknown>);
      return result as unknown as NEROutput[];
    };

    nerLoading = false;
    self.postMessage({ type: 'NER_READY' });
    return nerPipeline;
  } catch (err) {
    nerLoading = false;
    const msg = err instanceof Error ? err.message : String(err);
    nerError = msg.includes('404') || msg.includes('not found') || msg.includes('fetch')
      ? 'NER model not found at /models/onnx-community/distilbert-NER-ONNX/. Ensure model files are downloaded.'
      : msg;
    self.postMessage({ type: 'NER_ERROR', error: nerError });
    throw new Error(nerError);
  }
}

// --- Message handler ---

type WorkerIncoming =
  | { type: 'SANITIZE'; id: string; text: string }
  | { type: 'DETECT_ENTITIES'; id: string; text: string }
  | { type: 'LOAD_NER' };

self.onmessage = async (event: MessageEvent) => {
  const msg = event.data as WorkerIncoming;

  if (msg.type === 'LOAD_NER') {
    try {
      await loadNER();
    } catch {
      // Error already reported via NER_ERROR message
    }
    return;
  }

  if (msg.type === 'SANITIZE') {
    try {
      const pipe = await loadNER();
      const rawEntities = await pipe(msg.text);

      const entities = rawEntities
        .map((e) => {
          const category = mapEntityCategory(e.entity_group ?? e.entity ?? '');
          if (!category) return null;
          return {
            text: e.word,
            category,
            start: e.start,
            end: e.end,
            confidence: e.score,
          };
        })
        .filter((e): e is NonNullable<typeof e> => e !== null);

      self.postMessage({ type: 'SANITIZE_RESULT', id: msg.id, entities });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      self.postMessage({ type: 'SANITIZE_ERROR', id: msg.id, error });
    }
    return;
  }

  if (msg.type === 'DETECT_ENTITIES') {
    try {
      const pipe = await loadNER();
      const rawEntities = await pipe(msg.text);

      // Return raw NER labels (PER/LOC/ORG/MISC) without mapEntityCategory
      const entities = rawEntities
        .filter((e) => (e.score ?? 0) >= 0.7)
        .map((e) => {
          const label = (e.entity_group ?? e.entity ?? '').replace(/^[BI]-/, '').toUpperCase();
          return {
            text: e.word,
            type: label,
            start: e.start,
            end: e.end,
            confidence: e.score,
          };
        })
        .filter((e) => ['PER', 'LOC', 'ORG', 'MISC'].includes(e.type));

      self.postMessage({ type: 'ENTITIES_RESULT', id: msg.id, entities });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      self.postMessage({ type: 'ENTITIES_ERROR', id: msg.id, error });
    }
    return;
  }
};
