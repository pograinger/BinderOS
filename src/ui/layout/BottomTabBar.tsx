/**
 * BottomTabBar: Mobile section navigation.
 *
 * Four tab buttons for the four sections, visible only on mobile.
 * Active tab highlighted with accent color.
 * Positioned with safe area insets for iOS home indicator.
 *
 * CRITICAL: Never destructure props.
 */

import { For } from 'solid-js';
import { state, setActiveSection, setActivePage } from '../signals/store';
import { SECTION_IDS } from '../../storage/migrations/v1';

interface BottomTabBarProps {
  isDesktop: boolean;
}

const tabs = [
  { id: SECTION_IDS.projects,  label: 'Projects',  icon: '\u{1F4CB}' },
  { id: SECTION_IDS.areas,     label: 'Areas',     icon: '\u{1F3AF}' },
  { id: SECTION_IDS.resources, label: 'Resources', icon: '\u{1F4DA}' },
  { id: SECTION_IDS.archive,   label: 'Archive',   icon: '\u{1F4E6}' },
] as const;

export function BottomTabBar(_props: BottomTabBarProps) {
  const handleTabClick = (tabId: string) => {
    setActiveSection(tabId);
    setActivePage('section');
  };

  return (
    <div class="bottom-tab-bar">
      <For each={tabs}>
        {(tab) => (
          <button
            class={`bottom-tab${state.activeSection === tab.id ? ' active' : ''}`}
            onClick={() => handleTabClick(tab.id)}
          >
            <span class="bottom-tab-icon">{tab.icon}</span>
            <span class="bottom-tab-label">{tab.label}</span>
          </button>
        )}
      </For>
    </div>
  );
}
