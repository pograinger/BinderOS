/**
 * Storage persistence management.
 *
 * Requests persistent storage on first launch (TRST-05).
 * Checks grant status for the status bar indicator (TRST-06).
 * Provides storage estimate for the status bar.
 *
 * Safari 17+ critical detail: Safari requires notification permission
 * before persist() returns true. The UI layer handles browser-specific
 * guidance (Plan 01-03).
 */

/**
 * Request persistent storage from the browser.
 *
 * Checks if already persisted first (may have been granted previously).
 * If not, requests persistence via navigator.storage.persist().
 *
 * @returns Object with support and grant status
 */
export async function initStoragePersistence(): Promise<{
  supported: boolean;
  granted: boolean;
}> {
  if (!navigator.storage?.persist) {
    return { supported: false, granted: false };
  }

  // Check if already persisted (avoid re-prompting)
  const alreadyPersisted = await navigator.storage.persisted();
  if (alreadyPersisted) {
    return { supported: true, granted: true };
  }

  // Request persistence
  const granted = await navigator.storage.persist();
  return { supported: true, granted };
}

/**
 * Check the current persistence status without requesting it.
 *
 * @returns true if storage is persisted, false otherwise
 */
export async function checkPersistenceStatus(): Promise<boolean> {
  if (!navigator.storage?.persisted) {
    return false;
  }
  return navigator.storage.persisted();
}

/**
 * Get storage usage estimate from the browser.
 *
 * Returns usage and quota in bytes, or null if the API is unsupported.
 * Used for the status bar storage indicator.
 */
export async function getStorageEstimate(): Promise<{
  usage: number;
  quota: number;
} | null> {
  if (!navigator.storage?.estimate) {
    return null;
  }

  const estimate = await navigator.storage.estimate();
  return {
    usage: estimate.usage ?? 0,
    quota: estimate.quota ?? 0,
  };
}
