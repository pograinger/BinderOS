/**
 * Shell: Root layout component.
 *
 * Desktop (768px+): sidebar + main area (page tabs + main pane)
 * Mobile (<768px): full-width main + bottom tab bar
 * Status bar always at bottom.
 *
 * Uses CSS Grid for layout. Responsive via CSS media queries +
 * a SolidJS signal for components that need JS-level awareness.
 *
 * Phase 4 additions:
 * - Renders AISettingsPanel overlay (toggled by showAISettings signal)
 * - Renders AIGuidedSetup overlay (when state.aiFirstRunComplete === false)
 * - Renders CloudRequestPreview modal (when state.pendingCloudRequest is set)
 * - Wires CloudAdapter pre-send approval handler to store's pendingCloudRequest signal
 * - Exposes setShowAISettings via export for app.tsx CommandPalette onOpenAISettings
 */

import { createSignal, createEffect, onCleanup, onMount, Show } from 'solid-js';
import { Sidebar } from './Sidebar';
import { BottomTabBar } from './BottomTabBar';
import { PageTabStrip } from './PageTabStrip';
import { MainPane } from './MainPane';
import { StatusBar } from './StatusBar';
import { AISettingsPanel } from '../components/AISettingsPanel';
import { AIGuidedSetup } from '../components/AIGuidedSetup';
import { CloudRequestPreview } from '../components/CloudRequestPreview';
import { state, setPendingCloudRequest } from '../signals/store';
import { getActiveAdapter } from '../../ai/router';
import type { CloudAdapter } from '../../ai/adapters/cloud';

// Module-level signal for AI settings panel visibility.
// Exported so app.tsx can wire CommandPalette's onOpenAISettings callback.
const [showAISettings, setShowAISettings] = createSignal(false);
export { setShowAISettings };

export function Shell() {
  const [isDesktop, setIsDesktop] = createSignal(false);

  onMount(() => {
    const mql = window.matchMedia('(min-width: 768px)');
    setIsDesktop(mql.matches);

    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener('change', handler);
    onCleanup(() => mql.removeEventListener('change', handler));
  });

  // Wire the CloudAdapter pre-send approval handler when cloud API is enabled.
  // This is the critical link: CloudAdapter.execute() -> pre-send approval -> CloudRequestPreview modal.
  //
  // Flow:
  //   1. CloudAdapter.execute() calls onPreSendApproval(entry)
  //   2. This handler sets state.pendingCloudRequest (triggers CloudRequestPreview to render)
  //   3. User clicks Approve/Cancel in CloudRequestPreview
  //   4. resolve(true/false) unblocks CloudAdapter.execute()
  //   5. pendingCloudRequest is cleared (CloudRequestPreview unmounts)
  createEffect(() => {
    if (state.cloudAPIEnabled) {
      const adapter = getActiveAdapter();
      // Type-check: only CloudAdapter has setPreSendApprovalHandler
      if (adapter && adapter.id === 'cloud') {
        const cloudAdapter = adapter as CloudAdapter;
        cloudAdapter.setPreSendApprovalHandler((entry) => {
          return new Promise<boolean>((resolve) => {
            setPendingCloudRequest(entry, resolve);
          });
        });
      }
    }
  });

  return (
    <div class="shell">
      <Sidebar isDesktop={isDesktop()} />
      <div class="main-area">
        <PageTabStrip />
        <MainPane />
      </div>
      <BottomTabBar isDesktop={isDesktop()} />
      <StatusBar />

      {/* Phase 4: AI overlays */}

      {/* AI Settings panel — opened from Command Palette */}
      <Show when={showAISettings()}>
        <AISettingsPanel onClose={() => setShowAISettings(false)} />
      </Show>

      {/* Guided setup wizard — shown on first v2.0 launch */}
      <Show when={!state.aiFirstRunComplete}>
        <AIGuidedSetup onComplete={() => {}} />
      </Show>

      {/* Cloud request preview — shown before each cloud API request */}
      <Show when={state.pendingCloudRequest !== null}>
        <CloudRequestPreview
          entry={state.pendingCloudRequest!}
          onApprove={() => {
            state.pendingCloudRequestResolve?.(true);
            setPendingCloudRequest(null, null);
          }}
          onCancel={() => {
            state.pendingCloudRequestResolve?.(false);
            setPendingCloudRequest(null, null);
          }}
        />
      </Show>
    </div>
  );
}
