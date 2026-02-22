/**
 * StatusBar: IDE-style bottom bar with system health indicators.
 *
 * Segments:
 * - Persistence status (green/red dot)
 * - Atom count
 * - Inbox count
 * - Storage used (from navigator.storage.estimate())
 *
 * No badges anywhere -- this IS the ambient health indicator (CONTEXT.md).
 *
 * CRITICAL: Never destructure props or store. Read state.atoms.length etc.
 */

import { createSignal, onMount } from 'solid-js';
import { state } from '../signals/store';

export function StatusBar() {
  const [storageUsed, setStorageUsed] = createSignal<string>('');

  onMount(() => {
    // Poll storage estimate periodically
    const updateStorage = async () => {
      try {
        if (navigator.storage?.estimate) {
          const estimate = await navigator.storage.estimate();
          const usageMB = ((estimate.usage ?? 0) / (1024 * 1024)).toFixed(1);
          setStorageUsed(`${usageMB} MB`);
        }
      } catch {
        // Silently ignore — storage API may not be available
      }
    };

    void updateStorage();
    const interval = setInterval(() => void updateStorage(), 30000);

    // Cleanup not needed in onMount for setInterval in non-component context,
    // but good practice
    return () => clearInterval(interval);
  });

  return (
    <div class="status-bar">
      {/* Persistence status */}
      <div class="status-bar-item">
        <span
          class={`status-bar-dot ${state.persistenceGranted ? 'granted' : 'denied'}`}
        />
        <span>
          {state.persistenceGranted ? 'Persistent' : 'Not persistent'}
        </span>
      </div>

      {/* Atom count */}
      <div class="status-bar-item">
        <span>{state.atoms.length} atoms</span>
      </div>

      {/* Inbox count */}
      <div class="status-bar-item">
        <span>{state.inboxItems.length} inbox</span>
      </div>

      {/* Spacer to push storage to the right */}
      <div class="status-bar-spacer" />

      {/* Storage used */}
      {storageUsed() && (
        <div class="status-bar-item">
          <span>{storageUsed()} used</span>
        </div>
      )}
    </div>
  );
}
