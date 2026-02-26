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
import { AIOrb } from '../components/AIOrb';
import { AIQuestionFlow } from '../components/AIQuestionFlow';
import { GTDAnalysisFlow } from '../components/GTDAnalysisFlow';
import { state, setPendingCloudRequest, showAISettings, setShowAISettings, showCapture } from '../signals/store';
import { getActiveAdapter } from '../../ai/router';
import type { CloudAdapter } from '../../ai/adapters/cloud';

// showAISettings / setShowAISettings now live in store.ts to avoid circular deps.

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

  // Derive overlay-open state for AIOrb suppression.
  // The orb shrinks to a dot when any overlay (settings, setup, cloud preview) is active.
  const isAnyOverlayOpen = () =>
    showAISettings() ||
    showCapture() ||
    !state.aiFirstRunComplete ||
    state.pendingCloudRequest !== null;

  return (
    <div class="shell">
      <Sidebar isDesktop={isDesktop()} />
      <div class="main-area">
        <PageTabStrip />
        <MainPane />
      </div>
      <BottomTabBar isDesktop={isDesktop()} />
      <StatusBar />

      {/* Phase 5: AI Orb — always-visible AI entry point (renders when any AI adapter available) */}
      <AIOrb isOverlayOpen={isAnyOverlayOpen()} />

      {/* Phase 5: AI Question Flow — reusable conversational panel (opened by Discuss orb action) */}
      <AIQuestionFlow />

      {/* Phase 7: GTD Analysis Flow — multi-step GTD decision tree (opened by Analyze orb action) */}
      <GTDAnalysisFlow />

      {/* Phase 4: AI overlays */}

      {/* AI Settings panel — opened from Command Palette or AIOrb radial menu */}
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
