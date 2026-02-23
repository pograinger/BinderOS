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
 */

const STORAGE_KEY = 'binderos-ai-key';

// --- Memory-only key storage ---

let memoryKey: string | null = null;

export function setMemoryKey(apiKey: string): void {
  memoryKey = apiKey;
}

export function getMemoryKey(): string | null {
  return memoryKey;
}

export function clearMemoryKey(): void {
  memoryKey = null;
}

// --- Encrypted persistence (opt-in) ---

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

/**
 * Encrypt the API key with a user-provided passphrase and store in localStorage.
 * Also sets memoryKey for immediate use.
 *
 * Uses AES-GCM-256 with PBKDF2 key derivation (100,000 iterations, SHA-256).
 */
export async function encryptAndStore(apiKey: string, passphrase: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16)) as Uint8Array<ArrayBuffer>;
  const iv = crypto.getRandomValues(new Uint8Array(12)) as Uint8Array<ArrayBuffer>;
  const key = await deriveKey(passphrase, salt);
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(apiKey),
  );
  const stored = JSON.stringify({
    salt: toBase64(salt),
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(ciphertext)),
  });
  localStorage.setItem(STORAGE_KEY, stored);
  // Also set in memory for immediate use
  memoryKey = apiKey;
}

/**
 * Decrypt the stored API key using the provided passphrase.
 * Returns the key on success, null if no stored key exists.
 * Throws if the passphrase is wrong or the data is corrupted.
 */
export async function decryptFromStore(passphrase: string): Promise<string | null> {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;

  const { salt, iv, data } = JSON.parse(stored) as {
    salt: string;
    iv: string;
    data: string;
  };

  const key = await deriveKey(passphrase, fromBase64(salt));
  const dec = new TextDecoder();
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(iv) },
    key,
    fromBase64(data),
  );
  const apiKey = dec.decode(plaintext);
  memoryKey = apiKey;
  return apiKey;
}

/**
 * Clear the stored encrypted key from localStorage and wipe the memory key.
 */
export function clearStoredKey(): void {
  localStorage.removeItem(STORAGE_KEY);
  memoryKey = null;
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
  sanitizedPrompt: string;  // The exact data sent to cloud (post-sanitization)
  provider: string;
  model: string;
  status: 'pending' | 'approved' | 'cancelled' | 'completed' | 'error';
  responseSummary?: string;  // Brief summary of response (not full text)
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
