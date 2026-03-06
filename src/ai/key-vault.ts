/**
 * Key vault — API key storage and session consent tracking.
 *
 * Two storage modes (AIST-02):
 *   - Memory-only (default): key cleared when page unloads
 *   - Encrypted persistence (opt-in): AES-GCM-256 in localStorage with user passphrase
 *
 * Web Crypto API (crypto.subtle) is used for all cryptographic operations.
 * No plaintext key is ever written to localStorage.
 *
 * Per-session consent: cloud API use requires explicit session consent (AIST-01).
 * Consent is cleared on page unload — user re-consents each session.
 *
 * Cloud request log: session-scoped log of all cloud requests (not persisted).
 * Accessible in AI Settings for user review (CONTEXT.md: "Communication log").
 *
 * Phase 13: Multi-provider key storage.
 *   - Per-provider memory keys (memoryKeys map)
 *   - Multi-provider encrypted persistence with v1-to-v2 migration
 *   - Backward-compat shims: setMemoryKey/getMemoryKey/clearMemoryKey still work
 *     (they delegate to the 'anthropic' provider slot)
 */

import type { ProviderId } from './provider-registry';
import type { SanitizedPrompt } from './sanitization/types';

const STORAGE_KEY = 'binderos-ai-key';

// --- Multi-provider memory key storage ---

const memoryKeys: Partial<Record<ProviderId, string>> = {};

export function setMemoryKeyForProvider(providerId: ProviderId, apiKey: string): void {
  memoryKeys[providerId] = apiKey;
}

export function getMemoryKeyForProvider(providerId: ProviderId): string | null {
  return memoryKeys[providerId] ?? null;
}

export function hasMemoryKeyForProvider(providerId: ProviderId): boolean {
  return memoryKeys[providerId] !== undefined && memoryKeys[providerId] !== '';
}

export function clearMemoryKeyForProvider(providerId: ProviderId): void {
  delete memoryKeys[providerId];
}

export function clearAllMemoryKeys(): void {
  (Object.keys(memoryKeys) as ProviderId[]).forEach((k) => delete memoryKeys[k]);
}

// --- Backward-compat shims (delegate to 'anthropic' slot) ---

export function setMemoryKey(apiKey: string): void {
  setMemoryKeyForProvider('anthropic', apiKey);
}

export function getMemoryKey(): string | null {
  return getMemoryKeyForProvider('anthropic');
}

export function clearMemoryKey(): void {
  clearMemoryKeyForProvider('anthropic');
}

// --- Cryptographic helpers ---

/**
 * Derive an AES-GCM key from a passphrase using PBKDF2.
 */
async function deriveKey(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encode a Uint8Array to base64 string.
 */
function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

/**
 * Decode a base64 string to Uint8Array with fixed ArrayBuffer.
 */
function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const bytes = atob(b64)
    .split('')
    .map((c) => c.charCodeAt(0));
  return new Uint8Array(bytes) as Uint8Array<ArrayBuffer>;
}

// --- Encrypted single-entry structures (v1 format, one provider) ---

interface EncryptedEntry {
  salt: string;
  iv: string;
  data: string;
}

/** v1 storage format: flat { salt, iv, data } (single Anthropic key) */
interface StoredV1 {
  salt: string;
  iv: string;
  data: string;
}

/** v2 storage format: { version: 2, keys: { [providerId]: EncryptedEntry } } */
interface StoredV2 {
  version: 2;
  keys: Partial<Record<ProviderId, EncryptedEntry>>;
}

/**
 * Encrypt a single API key with a passphrase.
 */
async function encryptEntry(
  apiKey: string,
  passphrase: string,
): Promise<EncryptedEntry> {
  const salt = crypto.getRandomValues(new Uint8Array(16)) as Uint8Array<ArrayBuffer>;
  const iv = crypto.getRandomValues(new Uint8Array(12)) as Uint8Array<ArrayBuffer>;
  const key = await deriveKey(passphrase, salt);
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(apiKey),
  );
  return {
    salt: toBase64(salt),
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(ciphertext)),
  };
}

/**
 * Decrypt a single EncryptedEntry with a passphrase.
 */
async function decryptEntry(
  entry: EncryptedEntry,
  passphrase: string,
): Promise<string> {
  const key = await deriveKey(passphrase, fromBase64(entry.salt));
  const dec = new TextDecoder();
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(entry.iv) },
    key,
    fromBase64(entry.data),
  );
  return dec.decode(plaintext);
}

// --- Multi-provider encrypted persistence ---

/**
 * Encrypt and store an API key for the specified provider.
 *
 * Reads the existing stored blob, adds/updates the provider entry,
 * and writes it back in v2 format.
 * Also sets the memory key for immediate use.
 *
 * Storage format v2: { version: 2, keys: { [providerId]: { salt, iv, data } } }
 */
export async function encryptAndStoreForProvider(
  providerId: ProviderId,
  apiKey: string,
  passphrase: string,
): Promise<void> {
  // Load existing v2 blob, or start fresh
  let stored: StoredV2 = { version: 2, keys: {} };
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as StoredV1 | StoredV2;
      if ((parsed as StoredV2).version === 2) {
        stored = parsed as StoredV2;
      }
      // v1 blob: leave stored as empty v2 — old key will need to be re-entered
      // (migration happens on decryptAllFromStore, not here)
    } catch {
      // Corrupted — start fresh
    }
  }

  const entry = await encryptEntry(apiKey, passphrase);
  stored.keys[providerId] = entry;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

  // Also set in memory for immediate use
  setMemoryKeyForProvider(providerId, apiKey);
}

/**
 * Decrypt all stored provider keys using the provided passphrase.
 *
 * Loads all decrypted keys into the memoryKeys map.
 * Returns a partial map of provider -> decrypted key.
 *
 * Migration: if the stored JSON is in v1 format (no `version`/`keys` fields),
 * treats it as a single 'anthropic' entry and decrypts accordingly.
 */
export async function decryptAllFromStore(
  passphrase: string,
): Promise<Partial<Record<ProviderId, string>>> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};

  const parsed = JSON.parse(raw) as StoredV1 | StoredV2;
  const result: Partial<Record<ProviderId, string>> = {};

  if ((parsed as StoredV2).version === 2) {
    // v2 format: iterate all providers
    const v2 = parsed as StoredV2;
    const providers = Object.keys(v2.keys) as ProviderId[];
    await Promise.all(
      providers.map(async (pid) => {
        const entry = v2.keys[pid];
        if (entry) {
          try {
            const apiKey = await decryptEntry(entry, passphrase);
            result[pid] = apiKey;
            setMemoryKeyForProvider(pid, apiKey);
          } catch {
            // Wrong passphrase for this entry — skip
          }
        }
      }),
    );
  } else {
    // v1 format: single anthropic key { salt, iv, data }
    const v1 = parsed as StoredV1;
    try {
      const apiKey = await decryptEntry(v1, passphrase);
      result['anthropic'] = apiKey;
      setMemoryKeyForProvider('anthropic', apiKey);
    } catch {
      // Wrong passphrase — propagate so caller knows
      throw new Error('Invalid passphrase');
    }
  }

  return result;
}

// --- Backward-compat single-provider encrypted persistence ---

/**
 * Encrypt the API key with a user-provided passphrase and store in localStorage.
 * Also sets memoryKey for immediate use.
 *
 * Backward-compat shim — delegates to encryptAndStoreForProvider('anthropic', ...).
 */
export async function encryptAndStore(apiKey: string, passphrase: string): Promise<void> {
  return encryptAndStoreForProvider('anthropic', apiKey, passphrase);
}

/**
 * Decrypt the stored API key using the provided passphrase.
 * Returns the Anthropic key on success, null if no stored key exists.
 * Throws if the passphrase is wrong or the data is corrupted.
 *
 * Backward-compat shim — delegates to decryptAllFromStore and returns 'anthropic' key.
 */
export async function decryptFromStore(passphrase: string): Promise<string | null> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  const results = await decryptAllFromStore(passphrase);
  return results['anthropic'] ?? null;
}

/**
 * Clear the stored encrypted key from localStorage and wipe all memory keys.
 */
export function clearStoredKey(): void {
  localStorage.removeItem(STORAGE_KEY);
  clearAllMemoryKeys();
}

/**
 * Check whether an encrypted key is stored in localStorage.
 */
export function hasStoredKey(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

// --- Per-session consent tracking ---

let sessionConsentGranted = false;

/**
 * Grant consent for cloud API use for the current session.
 * Consent is NOT persisted — user re-consents each session.
 */
export function grantSessionConsent(): void {
  sessionConsentGranted = true;
}

/**
 * Check whether the user has granted cloud API consent for the current session.
 */
export function hasSessionConsent(): boolean {
  return sessionConsentGranted;
}

/**
 * Revoke session consent (e.g., when user disables cloud API in settings).
 */
export function revokeSessionConsent(): void {
  sessionConsentGranted = false;
}

// --- Cloud request log ---

/**
 * A log entry for a cloud API request.
 * Stored in session memory only — cleared on page unload.
 */
export interface CloudRequestLogEntry {
  id: string;
  timestamp: number;
  sanitizedPrompt: SanitizedPrompt;  // The exact data sent to cloud (post-sanitization, branded type)
  provider: string;
  model: string;
  status: 'pending' | 'approved' | 'cancelled' | 'completed' | 'error';
  responseSummary?: string;  // Brief summary of response (not full text)
  /** For custom endpoints — the base URL used, shown in the pre-send approval modal. */
  baseURL?: string;
}

// Session-scoped log (cleared on page unload — not persisted)
const cloudRequestLog: CloudRequestLogEntry[] = [];

/**
 * Add a new entry to the cloud request log.
 */
export function addCloudRequestLog(entry: CloudRequestLogEntry): void {
  cloudRequestLog.push(entry);
}

/**
 * Get the current cloud request log (read-only).
 */
export function getCloudRequestLog(): readonly CloudRequestLogEntry[] {
  return cloudRequestLog;
}

/**
 * Clear the cloud request log.
 */
export function clearCloudRequestLog(): void {
  cloudRequestLog.length = 0;
}
