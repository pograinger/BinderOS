/**
 * Shell: Root layout component.
 *
 * Desktop (768px+): sidebar + main area (page tabs + main pane)
 * Mobile (<768px): full-width main + bottom tab bar
 * Status bar always at bottom.
 *
 * Uses CSS Grid for layout. Responsive via CSS media queries +
 * a SolidJS signal for components that need JS-level awareness.
 */

import { createSignal, onCleanup, onMount } from 'solid-js';
import { Sidebar } from './Sidebar';
import { BottomTabBar } from './BottomTabBar';
import { PageTabStrip } from './PageTabStrip';
import { MainPane } from './MainPane';
import { StatusBar } from './StatusBar';

export function Shell() {
  const [isDesktop, setIsDesktop] = createSignal(false);

  onMount(() => {
    const mql = window.matchMedia('(min-width: 768px)');
    setIsDesktop(mql.matches);

    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener('change', handler);
    onCleanup(() => mql.removeEventListener('change', handler));
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
    </div>
  );
}
