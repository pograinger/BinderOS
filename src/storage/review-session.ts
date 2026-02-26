/**
 * Review session persistence — stores/loads review state via Dexie config table.
 *
 * Session is a single JSON blob under the 'review-session' config key.
 * Only one active session at a time.
 *
 * Phase 6: AIRV-05
 */
import { db } from './db';
import type { BriefingResult } from '../ai/analysis';

export const REVIEW_SESSION_KEY = 'review-session';
export const REVIEW_SESSION_STALE_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface ReviewSession {
  briefingResult: BriefingResult;
  expandedItemIds: string[];
  addressedItemIds: string[];
  scrollPosition: number;
  startedAt: number;       // Unix ms
  lastActiveAt: number;    // Unix ms — updated on each interaction
}

export async function saveReviewSession(session: ReviewSession): Promise<void> {
  await db.config.put({ key: REVIEW_SESSION_KEY, value: session });
}

export async function loadReviewSession(): Promise<ReviewSession | null> {
  const entry = await db.config.get(REVIEW_SESSION_KEY);
  return (entry?.value as ReviewSession) ?? null;
}

export async function clearReviewSession(): Promise<void> {
  await db.config.delete(REVIEW_SESSION_KEY);
}
