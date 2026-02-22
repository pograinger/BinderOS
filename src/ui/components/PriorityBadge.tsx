/**
 * PriorityBadge: small inline badge showing priority tier with icon + color.
 *
 * Tiers and their visual language:
 *   Critical — flame icon, red (#f85149)
 *   High     — arrow-up icon, amber (#d29922)
 *   Medium   — dash icon, blue (#58a6ff)
 *   Low      — arrow-down icon, muted grey (#8b949e)
 *   Someday  — clock icon, dim (#484f58)
 *
 * Badge is small (12px icon, 10px font) and sits alongside the AtomTypeIcon.
 * If the atom has a pinned_tier, a small pin indicator is shown next to the badge.
 *
 * CRITICAL: Never early-return from a SolidJS component. Use <Show>.
 * CRITICAL: TierIcon uses Switch/Match since only one tier is active at a time.
 */

import { Show } from 'solid-js';
import { Switch, Match } from 'solid-js';
import type { PriorityTier } from '../../types/config';
import { tierColors } from '../theme/colors';

interface PriorityBadgeProps {
  tier: PriorityTier;
  pinned?: boolean;
}

function TierIcon(props: { tier: PriorityTier }) {
  return (
    <Switch>
      <Match when={props.tier === 'Critical'}>
        {/* Flame icon */}
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M8 16c-3.5 0-6-2.5-6-6 0-2.2 1.2-4.2 3-5.4C5 5 5 5.5 5 6c0 1.7 1.3 3 3 3s3-1.3 3-3c0-.5 0-1-.1-1.4C12.8 5.8 14 7.8 14 10c0 3.5-2.5 6-6 6z" />
          <path d="M8.5 2.5c.5.3 1.5 1.5 1.5 3 0 .5-.5 1-1 1S8 6 8 5.5c0-.8.5-1.5.5-3z" />
        </svg>
      </Match>
      <Match when={props.tier === 'High'}>
        {/* Arrow up icon */}
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path
            fill-rule="evenodd"
            d="M8 2a.5.5 0 0 1 .354.146l4 4a.5.5 0 0 1-.708.708L8.5 3.707V13.5a.5.5 0 0 1-1 0V3.707L4.354 6.854a.5.5 0 1 1-.708-.708l4-4A.5.5 0 0 1 8 2z"
          />
        </svg>
      </Match>
      <Match when={props.tier === 'Medium'}>
        {/* Dash icon */}
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M2 8a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11A.5.5 0 0 1 2 8z" />
        </svg>
      </Match>
      <Match when={props.tier === 'Low'}>
        {/* Arrow down icon */}
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path
            fill-rule="evenodd"
            d="M8 14a.5.5 0 0 1-.354-.146l-4-4a.5.5 0 0 1 .708-.708L7.5 12.293V2.5a.5.5 0 0 1 1 0v9.793l3.146-3.147a.5.5 0 0 1 .708.708l-4 4A.5.5 0 0 1 8 14z"
          />
        </svg>
      </Match>
      <Match when={props.tier === 'Someday'}>
        {/* Clock icon */}
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z" />
          <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z" />
        </svg>
      </Match>
    </Switch>
  );
}

export function PriorityBadge(props: PriorityBadgeProps) {
  const color = () => tierColors[props.tier];

  return (
    <span
      class="priority-badge"
      style={{ color: color() }}
      title={`Priority: ${props.tier}`}
      aria-label={`Priority: ${props.tier}`}
    >
      <TierIcon tier={props.tier} />
      <Show when={props.pinned}>
        {/* Pin indicator for pinned_tier */}
        <svg
          class="priority-pin"
          width="8"
          height="8"
          viewBox="0 0 16 16"
          fill="currentColor"
          aria-label="Pinned"
        >
          <path d="M4.146.146A.5.5 0 0 1 4.5 0h7a.5.5 0 0 1 .5.5c0 .68-.342 1.174-.646 1.479-.126.125-.25.224-.354.298v4.431l.078.048c.203.127.476.314.751.555C12.36 7.775 13 8.527 13 9.5a.5.5 0 0 1-.5.5h-4v4.5c0 .276-.224 1-.5 1s-.5-.724-.5-1V10h-4a.5.5 0 0 1-.5-.5c0-.973.64-1.725 1.17-2.189A5.921 5.921 0 0 1 5 6.898V2.477a2.808 2.808 0 0 1-.354-.298C4.342 1.674 4 1.179 4 .5a.5.5 0 0 1 .146-.354z" />
        </svg>
      </Show>
    </span>
  );
}
