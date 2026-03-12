/**
 * Core sanitization pipeline: detect, pseudonymize, de-pseudonymize.
 *
 * PURE MODULE — no store imports. All state passed by caller or via Dexie.
 *
 * Combines NER (via dedicated sanitization worker) and regex detection
 * for comprehensive PII coverage. Entity pseudonyms are persistent across
 * sessions via the entity registry in Dexie.
 *
 * Graceful degradation: if the NER worker fails to load, falls back to
 * regex-only detection — still produces a valid SanitizedPrompt.
 *
 * Phase 14: SNTZ-01 — core sanitization engine.
 */

import type { DetectedEntity, SanitizedResult } from './types';
import { createSanitizedPrompt } from './types';
import { detectWithRegex, detectDates } from './regex-patterns';
import { buildEntityMapWithRelationships } from './entity-registry';

// --- Raw entity mention type for knowledge graph detection ---

export interface RawEntityMention {
  text: string;
  type: string;
  start: number;
  end: number;
  confidence: number;
}

// --- Worker management ---

let worker: Worker | null = null;
let workerReady = false;
let workerFailed = false;

/** Pending NER requests awaiting worker response */
const pendingRequests = new Map<string, {
  resolve: (entities: DetectedEntity[]) => void;
  reject: (error: Error) => void;
}>();

/** Pending entity detection requests awaiting worker response */
const pendingEntityRequests = new Map<string, {
  resolve: (entities: RawEntityMention[]) => void;
  reject: (error: Error) => void;
}>();

/** Counter for unique request IDs */
let requestCounter = 0;

/**
 * Initialize the sanitization worker. Creates the Worker instance if not
 * already created and sends LOAD_NER to begin lazy model loading.
 */
export function initSanitizationWorker(): void {
  if (worker) return;

  try {
    worker = new Worker(
      new URL('../../workers/sanitization-worker.ts', import.meta.url),
      { type: 'module' },
    );

    worker.onmessage = (event: MessageEvent) => {
      const msg = event.data;

      if (msg.type === 'NER_READY') {
        workerReady = true;
        workerFailed = false;
        return;
      }

      if (msg.type === 'NER_LOADING') {
        return;
      }

      if (msg.type === 'NER_ERROR') {
        workerFailed = true;
        // Reject all pending requests so they fall back to regex
        for (const [id, pending] of pendingRequests) {
          pending.reject(new Error(msg.error));
          pendingRequests.delete(id);
        }
        // Also reject pending entity requests
        for (const [id, pending] of pendingEntityRequests) {
          pending.reject(new Error(msg.error));
          pendingEntityRequests.delete(id);
        }
        return;
      }

      if (msg.type === 'SANITIZE_RESULT') {
        const pending = pendingRequests.get(msg.id);
        if (pending) {
          const entities: DetectedEntity[] = msg.entities.map((e: {
            text: string;
            category: string;
            start: number;
            end: number;
            confidence: number;
          }) => ({
            text: e.text,
            category: e.category as DetectedEntity['category'],
            start: e.start,
            end: e.end,
            source: 'ner' as const,
            confidence: e.confidence,
          }));
          pending.resolve(entities);
          pendingRequests.delete(msg.id);
        }
        return;
      }

      if (msg.type === 'SANITIZE_ERROR') {
        const pending = pendingRequests.get(msg.id);
        if (pending) {
          pending.reject(new Error(msg.error));
          pendingRequests.delete(msg.id);
        }
        return;
      }

      if (msg.type === 'ENTITIES_RESULT') {
        const pending = pendingEntityRequests.get(msg.id);
        if (pending) {
          const entities: RawEntityMention[] = msg.entities.map((e: {
            text: string;
            type: string;
            start: number;
            end: number;
            confidence: number;
          }) => ({
            text: e.text,
            type: e.type,
            start: e.start,
            end: e.end,
            confidence: e.confidence,
          }));
          pending.resolve(entities);
          pendingEntityRequests.delete(msg.id);
        }
        return;
      }

      if (msg.type === 'ENTITIES_ERROR') {
        const pending = pendingEntityRequests.get(msg.id);
        if (pending) {
          pending.reject(new Error(msg.error));
          pendingEntityRequests.delete(msg.id);
        }
        return;
      }
    };

    worker.onerror = () => {
      workerFailed = true;
    };

    // Begin lazy loading
    worker.postMessage({ type: 'LOAD_NER' });
  } catch {
    workerFailed = true;
  }
}

/**
 * Send text to the NER worker for entity detection.
 * Returns a promise that resolves with detected entities.
 */
function nerDetect(text: string): Promise<DetectedEntity[]> {
  return new Promise((resolve, reject) => {
    if (!worker || workerFailed) {
      reject(new Error('NER worker not available'));
      return;
    }

    const id = `ner-${++requestCounter}`;
    pendingRequests.set(id, { resolve, reject });
    worker.postMessage({ type: 'SANITIZE', id, text });
  });
}

// --- Entity merging ---

/**
 * Merge NER and regex entity results with overlap resolution.
 *
 * Rules:
 * - When NER and regex spans overlap, prefer the longer/more-specific match
 * - Regex CONTACT takes precedence over NER PERSON for substrings within
 *   email/phone patterns (Pitfall 3 from RESEARCH.md)
 * - Deduplicate entities that cover the same span
 */
function mergeEntities(nerEntities: DetectedEntity[], regexEntities: DetectedEntity[]): DetectedEntity[] {
  const all = [...nerEntities, ...regexEntities];

  // Sort by start offset, then by length descending (prefer longer spans)
  all.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

  const result: DetectedEntity[] = [];

  for (const entity of all) {
    // Check if this entity overlaps with any already-accepted entity
    const overlapping = result.find(
      (existing) => entity.start < existing.end && entity.end > existing.start,
    );

    if (!overlapping) {
      result.push(entity);
      continue;
    }

    // Overlap resolution rules:

    // Rule 1: Regex CONTACT always beats NER PERSON (email/phone patterns)
    if (entity.source === 'regex' && entity.category === 'CONTACT' &&
        overlapping.source === 'ner' && overlapping.category === 'PERSON') {
      // Replace the NER entity with the regex CONTACT
      const idx = result.indexOf(overlapping);
      result[idx] = entity;
      continue;
    }

    // Rule 2: Prefer the longer span
    const entityLen = entity.end - entity.start;
    const overlapLen = overlapping.end - overlapping.start;
    if (entityLen > overlapLen) {
      const idx = result.indexOf(overlapping);
      result[idx] = entity;
      continue;
    }

    // Rule 3: If same span and both sources, mark as 'both'
    if (entity.start === overlapping.start && entity.end === overlapping.end) {
      if (entity.source !== overlapping.source) {
        overlapping.source = 'both';
        // Keep higher confidence
        overlapping.confidence = Math.max(overlapping.confidence, entity.confidence);
      }
    }

    // Otherwise, skip this entity (the existing one wins)
  }

  // Re-sort by start offset
  result.sort((a, b) => a.start - b.start);
  return result;
}

// --- Public API ---

/**
 * Detect all PII entities in the given text using NER and regex in parallel.
 *
 * NER detection runs via the dedicated sanitization worker. If the worker
 * is unavailable, falls back to regex-only detection.
 *
 * @param text - Input text to scan
 * @returns Deduplicated, sorted list of detected entities
 */
export async function detectEntities(text: string): Promise<DetectedEntity[]> {
  // Ensure worker is initialized
  if (!worker && !workerFailed) {
    initSanitizationWorker();
  }

  const regexEntities = detectWithRegex(text);

  // Try NER in parallel with regex (regex is sync, already done)
  let nerEntities: DetectedEntity[] = [];
  if (worker && !workerFailed) {
    try {
      nerEntities = await nerDetect(text);
    } catch {
      // NER failed — continue with regex-only
    }
  }

  return mergeEntities(nerEntities, regexEntities);
}

/**
 * Sanitize text by detecting PII and replacing with pseudonym tags.
 *
 * 1. Detects entities (NER + regex)
 * 2. Builds pseudonym maps via the entity registry
 * 3. Replaces entities with tags (from end to start to preserve offsets)
 * 4. Wraps result in SanitizedPrompt branded type
 *
 * @param text - Raw input text
 * @returns SanitizedResult with sanitized prompt and entity maps
 */
export async function sanitizeText(text: string): Promise<SanitizedResult> {
  const entities = await detectEntities(text);

  if (entities.length === 0) {
    return {
      prompt: createSanitizedPrompt(text),
      entities: [],
      entityMap: new Map(),
      reverseMap: new Map(),
    };
  }

  const { entityMap, reverseMap } = await buildEntityMapWithRelationships(entities);

  // Replace entities from end to start to preserve character offsets
  let sanitized = text;
  const sortedByEnd = [...entities].sort((a, b) => b.start - a.start);

  for (const entity of sortedByEnd) {
    const tag = reverseMap.get(entity.text);
    if (tag) {
      sanitized = sanitized.slice(0, entity.start) + tag + sanitized.slice(entity.end);
    }
  }

  return {
    prompt: createSanitizedPrompt(sanitized),
    entities,
    entityMap,
    reverseMap,
  };
}

/**
 * De-pseudonymize a response by replacing pseudonym tags with real values.
 *
 * Scans for patterns like <Person 1>, <Location 3>, <Financial 2>, etc.
 * and replaces them with the original text from the entityMap.
 *
 * @param response - Response text from cloud AI containing pseudonym tags
 * @param entityMap - Map from pseudonym tag to real text (from SanitizedResult.entityMap)
 * @returns Response with pseudonyms replaced by real values
 */
export function dePseudonymize(response: string, entityMap: Map<string, string>): string {
  if (entityMap.size === 0) return response;

  return response.replace(
    /<(Person|Location|Financial|Contact|Credential)\s+\d+>/g,
    (match) => entityMap.get(match) ?? match,
  );
}

/**
 * Detect entities for the knowledge graph via the NER worker.
 *
 * Returns raw NER entities (PER/LOC/ORG/MISC) merged with regex DATE detections.
 * Graceful degradation: resolves with empty array if worker unavailable.
 *
 * Phase 27: ENTD-01
 */
export async function detectEntitiesForKnowledgeGraph(text: string): Promise<RawEntityMention[]> {
  // Ensure worker is initialized
  if (!worker && !workerFailed) {
    initSanitizationWorker();
  }

  let nerEntities: RawEntityMention[] = [];

  if (worker && !workerFailed) {
    try {
      nerEntities = await new Promise<RawEntityMention[]>((resolve, reject) => {
        const id = `ent-${++requestCounter}`;
        pendingEntityRequests.set(id, { resolve, reject });
        worker!.postMessage({ type: 'DETECT_ENTITIES', id, text });
      });
    } catch {
      // NER failed — continue with empty NER results
    }
  }

  // Merge with regex DATE detections
  const dateEntities = detectDates(text);
  return [...nerEntities, ...dateEntities];
}

/**
 * Terminate the sanitization worker and clean up resources.
 */
export function disposeSanitizationWorker(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  workerReady = false;
  workerFailed = false;
  pendingRequests.clear();
  pendingEntityRequests.clear();
  requestCounter = 0;
}
