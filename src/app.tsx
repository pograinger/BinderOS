/**
 * BinderOS root component.
 *
 * On mount: initializes the Worker, requests persistence.
 * Renders the Shell layout component.
 * Sets up global keyboard shortcuts (Ctrl+Z for undo).
 */

import { onMount, onCleanup } from 'solid-js';
import { initWorker } from './worker/bridge';
import { sendCommand } from './ui/signals/store';
import { Shell } from './ui/layout/Shell';

function App() {
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
    }
  };

  onMount(() => {
    window.addEventListener('keydown', handleKeyDown);
  });

  onCleanup(() => {
    window.removeEventListener('keydown', handleKeyDown);
  });

  return <Shell />;
}

export default App;
