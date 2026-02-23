/**
 * BinderOS root component.
 *
 * On mount: initializes the Worker, requests persistence.
 * Renders the Shell layout component.
 *
 * Global integrations:
 *   - CaptureOverlay: Ctrl+N / Cmd+N opens, FAB button on mobile
 *   - SearchOverlay: Ctrl+K / Cmd+K opens (Spotlight-style search)
 *   - CommandPalette: Ctrl+P / Cmd+P opens (action-oriented palette)
 *   - ShortcutReference: ? key opens shortcut reference sheet
 *   - StorageWarning: shown if persistence denied and not dismissed
 *   - Keyboard shortcuts: Ctrl+Z (undo), number keys 1-5 (page switch), Escape (close)
 *
 * Unified overlay state (only one overlay open at a time):
 *   'none' | 'capture' | 'search' | 'command-palette' | 'shortcuts'
 *
 * Page switching:
 *   Number keys 1-5 switch between pages when not focused on an input.
 *   Pages: 1=today, 2=this-week, 3=active-projects, 4=waiting, 5=insights
 */

import { createSignal, onMount, onCleanup, Show } from 'solid-js';
import { initWorker } from './worker/bridge';
import { sendCommand, state, setActivePage, setSelectedAtomId, setPersistenceGranted } from './ui/signals/store';
import { initStoragePersistence } from './storage/persistence';
import { Shell, setShowAISettings } from './ui/layout/Shell';
import { CaptureOverlay } from './ui/views/CaptureOverlay';
import { SearchOverlay } from './ui/views/SearchOverlay';
import { StorageWarning } from './ui/views/StorageWarning';
import { CapEnforcementModal } from './ui/components/CapEnforcementModal';
import { CommandPalette } from './ui/components/CommandPalette';
import { ShortcutReference } from './ui/components/ShortcutReference';

// --- Overlay state type ---

type OverlayState = 'none' | 'capture' | 'search' | 'command-palette' | 'shortcuts';

// --- Page key mapping (number keys 1-5) ---

const PAGE_KEYS: Record<string, string> = {
  '0': 'inbox',
  '1': 'today',
  '2': 'this-week',
  '3': 'active-projects',
  '4': 'waiting',
  '5': 'insights',
  '6': 'all',
};

function App() {
  const [overlay, setOverlay] = createSignal<OverlayState>('none');
  const [storageWarningDismissed, setStorageWarningDismissed] = createSignal(
    // Persist dismissal across reloads; also suppress in dev mode (localhost won't get persistence)
    import.meta.env.DEV || localStorage.getItem('binderos-storage-warning-dismissed') === '1',
  );

  onMount(async () => {
    try {
      await initWorker();
      // Request persistence on main thread — browser has full PWA context here
      // (Worker thread may not see installed-PWA status, causing false denials)
      const persistence = await initStoragePersistence();
      setPersistenceGranted(persistence.granted);
    } catch (err) {
      console.error('[BinderOS] Worker initialization failed:', err);
    }
  });

  /**
   * Returns true if an interactive input element (input/textarea/select) has focus.
   * Used to gate shortcuts that should not fire when user is typing.
   */
  function isInputFocused(): boolean {
    const tag = document.activeElement?.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  // Global keyboard shortcuts
  const handleKeyDown = (e: KeyboardEvent) => {
    // Ctrl+Z / Cmd+Z: Undo (always fires, even in inputs)
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      sendCommand({ type: 'UNDO' });
      return;
    }

    // Ctrl+N / Cmd+N: Toggle capture overlay
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      setOverlay((prev) => (prev === 'capture' ? 'none' : 'capture'));
      return;
    }

    // Ctrl+K / Cmd+K: Open search overlay (always opens, replaces whatever is open)
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      setOverlay('search');
      return;
    }

    // Ctrl+P / Cmd+P: Open command palette
    if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
      e.preventDefault();
      setOverlay('command-palette');
      return;
    }

    // Escape: close overlay, or close detail panel if no overlay
    if (e.key === 'Escape') {
      if (overlay() !== 'none') {
        setOverlay('none');
        return;
      }
      // Close detail panel if no overlay is open
      if (state.selectedAtomId !== null) {
        setSelectedAtomId(null);
        return;
      }
      // Dismiss storage warning as last resort
      if (!storageWarningDismissed() && !state.persistenceGranted) {
        { localStorage.setItem('binderos-storage-warning-dismissed', '1'); setStorageWarningDismissed(true); };
        return;
      }
    }

    // ? key: open shortcut reference (only when not in input)
    if (e.key === '?' && !isInputFocused()) {
      e.preventDefault();
      setOverlay('shortcuts');
      return;
    }

    // Number keys 1-5: switch pages (only when not in input, no overlay open)
    const pageDest = PAGE_KEYS[e.key];
    if (!isInputFocused() && overlay() === 'none' && pageDest) {
      e.preventDefault();
      setActivePage(pageDest);
      return;
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
      <Show when={overlay() === 'capture'}>
        <CaptureOverlay onClose={() => setOverlay('none')} />
      </Show>

      {/* Search overlay (Ctrl+K) */}
      <Show when={overlay() === 'search'}>
        <SearchOverlay onClose={() => setOverlay('none')} />
      </Show>

      {/* Command palette (Ctrl+P) */}
      <Show when={overlay() === 'command-palette'}>
        <CommandPalette
          onClose={() => setOverlay('none')}
          onOpenSearch={() => setOverlay('search')}
          onOpenAISettings={() => setShowAISettings(true)}
        />
      </Show>

      {/* Shortcut reference (?) */}
      <Show when={overlay() === 'shortcuts'}>
        <ShortcutReference onClose={() => setOverlay('none')} />
      </Show>

      {/* Storage persistence warning */}
      <Show when={showStorageWarning()}>
        <StorageWarning onDismiss={() => { localStorage.setItem('binderos-storage-warning-dismissed', '1'); setStorageWarningDismissed(true); }} />
      </Show>

      {/* Cap enforcement modal — self-managing via state.capExceeded */}
      <CapEnforcementModal />

      {/* Floating Action Button for mobile capture */}
      <Show when={overlay() !== 'capture'}>
        <button
          class="fab-capture"
          onClick={() => setOverlay('capture')}
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
