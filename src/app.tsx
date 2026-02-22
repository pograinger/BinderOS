/**
 * BinderOS root component.
 *
 * On mount: initializes the Worker, requests persistence.
 * Renders the Shell layout component.
 *
 * Global integrations:
 *   - CaptureOverlay: Ctrl+N / Cmd+N opens, FAB button on mobile
 *   - StorageWarning: shown if persistence denied and not dismissed
 *   - Keyboard shortcuts: Ctrl+Z (undo), Ctrl+N (capture), Escape (close overlays)
 */

import { createSignal, onMount, onCleanup, Show } from 'solid-js';
import { initWorker } from './worker/bridge';
import { sendCommand, state } from './ui/signals/store';
import { Shell } from './ui/layout/Shell';
import { CaptureOverlay } from './ui/views/CaptureOverlay';
import { StorageWarning } from './ui/views/StorageWarning';

function App() {
  const [showCapture, setShowCapture] = createSignal(false);
  const [storageWarningDismissed, setStorageWarningDismissed] = createSignal(false);

  onMount(async () => {
    try {
      await initWorker();
      // Request persistence after Worker is ready
      sendCommand({ type: 'REQUEST_PERSISTENCE' });
    } catch (err) {
      console.error('[BinderOS] Worker initialization failed:', err);
    }
  });

  // Global keyboard shortcuts
  const handleKeyDown = (e: KeyboardEvent) => {
    // Ctrl+Z / Cmd+Z: Undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      sendCommand({ type: 'UNDO' });
      return;
    }

    // Ctrl+N / Cmd+N: Open capture overlay
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      setShowCapture((prev) => !prev);
      return;
    }

    // Escape: close overlays
    if (e.key === 'Escape') {
      if (showCapture()) {
        setShowCapture(false);
        return;
      }
      if (!storageWarningDismissed() && !state.persistenceGranted) {
        setStorageWarningDismissed(true);
        return;
      }
    }
  };

  onMount(() => {
    window.addEventListener('keydown', handleKeyDown);
  });

  onCleanup(() => {
    window.removeEventListener('keydown', handleKeyDown);
  });

  const showStorageWarning = (): boolean => {
    return state.ready && !state.persistenceGranted && !storageWarningDismissed();
  };

  return (
    <>
      <Shell />

      {/* Capture overlay */}
      <Show when={showCapture()}>
        <CaptureOverlay onClose={() => setShowCapture(false)} />
      </Show>

      {/* Storage persistence warning */}
      <Show when={showStorageWarning()}>
        <StorageWarning onDismiss={() => setStorageWarningDismissed(true)} />
      </Show>

      {/* Floating Action Button for mobile capture */}
      <Show when={!showCapture()}>
        <button
          class="fab-capture"
          onClick={() => setShowCapture(true)}
          title="Quick capture (Ctrl+N)"
          aria-label="Quick capture"
        >
          +
        </button>
      </Show>
    </>
  );
}

export default App;
