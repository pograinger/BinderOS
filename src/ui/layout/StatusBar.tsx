/**
 * StatusBar: IDE-style bottom bar with system health indicators.
 *
 * Segments:
 * - Persistence status (green/red dot)
 * - Entropy health badge (green/yellow/red with label)
 * - Atom count
 * - Inbox count (color-coded: ok/warning/full based on cap status)
 * - Open task count (color-coded: ok/warning/full based on cap status)
 * - Storage used (from navigator.storage.estimate())
 *
 * No badges anywhere -- this IS the ambient health indicator (CONTEXT.md).
 * Soft warning at 80% cap = color shift only. No modal, no banner.
 *
 * CRITICAL: Never destructure props or store. Read state.atoms.length etc.
 * CRITICAL: Import createMemo signals directly — do not call as state.inboxCapStatus.
 */

import { createSignal, createMemo, onMount, Show } from 'solid-js';
import { state, inboxCapStatus, taskCapStatus } from '../signals/store';

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

    return () => clearInterval(interval);
  });

  // Entropy level derived from store state
  const entropyLevel = createMemo(() => state.entropyScore?.level ?? 'green');

  const entropyLabel = (): string => {
    switch (entropyLevel()) {
      case 'green':  return 'Healthy';
      case 'yellow': return 'Warning';
      case 'red':    return 'Critical';
      default:       return 'Healthy';
    }
  };

  // Count of open/in-progress tasks for the task cap segment
  const openTaskCount = createMemo(() =>
    state.atoms.filter(
      (a) => a.type === 'task' && (a.status === 'open' || a.status === 'in-progress'),
    ).length,
  );

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

      {/* Entropy health badge — only show after scoring has run */}
      <Show when={state.entropyScore !== null}>
        <div class={`status-bar-item entropy-badge entropy-${entropyLevel()}`}>
          <span class="entropy-dot" />
          <span>{entropyLabel()}</span>
        </div>
      </Show>

      {/* Atom count */}
      <div class="status-bar-item">
        <span>{state.atoms.length} atoms</span>
      </div>

      {/* Inbox count with cap color coding */}
      <div class={`status-bar-item status-segment inbox-${inboxCapStatus()}`}>
        <span>{state.inboxItems.length} inbox</span>
      </div>

      {/* Open task count with cap color coding */}
      <div class={`status-bar-item status-segment task-${taskCapStatus()}`}>
        <span>{openTaskCount()} tasks</span>
      </div>

      {/* Spacer to push storage to the right */}
      <div class="status-bar-spacer" />

      {/* Storage used */}
      <Show when={storageUsed()}>
        <div class="status-bar-item">
          <span>{storageUsed()} used</span>
        </div>
      </Show>
    </div>
  );
}
