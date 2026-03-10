/**
 * GraduationPreview: Inline graduation flow for enriched inbox items.
 *
 * Shows the parent atom + child atoms proposed by the enrichment wizard,
 * each with quality spectrum bars and toggle controls. Users can remove
 * individual children before confirming. Soft quality gate warns but
 * allows force-create for insufficient-quality atoms.
 *
 * CRITICAL: Never destructure props. Use props.proposal, props.onToggleChild, etc.
 *
 * Phase 24: ENRICH-05, ENRICH-06
 */

import { createMemo, For, Show } from 'solid-js';
import { AtomTypeIcon } from './AtomTypeIcon';
import { MIN_QUALITY_THRESHOLD } from '../../ai/enrichment/quality-gate';
import type { GraduationProposal, AcceptedStep } from '../../ai/enrichment/types';
import type { AtomType } from '../../types/atoms';

// --- Types ---

interface GraduationPreviewProps {
  proposal: GraduationProposal;
  onToggleChild: (index: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

// --- Quality level helpers ---

type QualityLevel = 'high' | 'moderate' | 'low' | 'insufficient';

function getQualityLevel(score: number): QualityLevel {
  if (score >= 0.7) return 'high';
  if (score >= 0.5) return 'moderate';
  if (score >= 0.3) return 'low';
  return 'insufficient';
}

function getQualityColor(level: QualityLevel): string {
  switch (level) {
    case 'high': return '#22c55e';
    case 'moderate': return '#eab308';
    case 'low': return '#f97316';
    case 'insufficient': return '#ef4444';
  }
}

function getQualityLabel(level: QualityLevel): string {
  switch (level) {
    case 'high': return 'High';
    case 'moderate': return 'Moderate';
    case 'low': return 'Low';
    case 'insufficient': return 'Insufficient';
  }
}

/** Truncate text to maxLen characters with ellipsis. */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '...';
}

// --- Component ---

export function GraduationPreview(props: GraduationPreviewProps) {
  // Count included atoms by type (parent + included children)
  const typeCounts = createMemo(() => {
    const counts: Record<string, number> = {};
    // Parent always included
    const parentType = props.proposal.parentAtom.type;
    counts[parentType] = (counts[parentType] ?? 0) + 1;
    // Included children
    for (const child of props.proposal.childAtoms) {
      if (child.included) {
        counts[child.type] = (counts[child.type] ?? 0) + 1;
      }
    }
    return counts;
  });

  const countSummary = createMemo(() => {
    const c = typeCounts();
    const parts: string[] = [];
    const typeLabels: Record<string, string> = {
      task: 'Task',
      fact: 'Fact',
      event: 'Event',
      decision: 'Decision',
      insight: 'Insight',
    };
    for (const [type, count] of Object.entries(c)) {
      const label = typeLabels[type] ?? type;
      parts.push(`${count} ${label}${count > 1 ? 's' : ''}`);
    }
    return parts.join(', ');
  });

  const includedCount = createMemo(() => {
    let count = 1; // parent always included
    for (const child of props.proposal.childAtoms) {
      if (child.included) count++;
    }
    return count;
  });

  // Check if any atom has insufficient quality
  const hasInsufficientQuality = createMemo(() => {
    if (getQualityLevel(props.proposal.parentAtom.quality) === 'insufficient') return true;
    return props.proposal.childAtoms.some(
      (child) => child.included && getQualityLevel(child.quality) === 'insufficient',
    );
  });

  // Check if any atom is below minimum threshold
  const hasLowQuality = createMemo(() => {
    if (props.proposal.parentAtom.quality < MIN_QUALITY_THRESHOLD) return true;
    return props.proposal.childAtoms.some(
      (child) => child.included && child.quality < MIN_QUALITY_THRESHOLD,
    );
  });

  return (
    <div class="graduation-preview">
      {/* Header */}
      <div class="graduation-header">
        <div class="graduation-header-title">Ready to create:</div>
        <div class="graduation-header-summary">{countSummary()}</div>
      </div>

      {/* Scrollable list of atoms */}
      <div class="graduation-atom-list">
        {/* Parent atom card */}
        <div class="graduation-atom-card graduation-parent">
          <div class="graduation-atom-row">
            <AtomTypeIcon type={props.proposal.parentAtom.type} size={16} />
            <span class="graduation-atom-type-badge">
              {props.proposal.parentAtom.type}
            </span>
            <span class="graduation-atom-content">
              {truncate(props.proposal.parentAtom.content, 80)}
            </span>
          </div>
          <QualityBar score={props.proposal.parentAtom.quality} />
          <div class="graduation-parent-label">Parent (always included)</div>
        </div>

        {/* Child atom list */}
        <For each={props.proposal.childAtoms}>
          {(child, index) => (
            <div
              class={`graduation-atom-card graduation-child${child.included ? '' : ' excluded'}`}
            >
              <div class="graduation-atom-row">
                <label
                  class="graduation-checkbox-label"
                  onPointerDown={(e: PointerEvent) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={child.included}
                    onChange={() => props.onToggleChild(index())}
                    onPointerDown={(e: PointerEvent) => e.stopPropagation()}
                  />
                </label>
                <AtomTypeIcon type={child.type} size={16} />
                <span class="graduation-atom-type-badge">
                  {child.type}
                </span>
                <span
                  class={`graduation-atom-content${child.included ? '' : ' strikethrough'}`}
                >
                  {truncate(child.text, 80)}
                </span>
              </div>
              <QualityBar score={child.quality} />
              <Show when={child.suggestedSection}>
                <div class="graduation-section-hint">
                  Section: {child.suggestedSection}
                </div>
              </Show>
              {/* Quality warning for individual atoms below threshold */}
              <Show when={child.included && child.quality < MIN_QUALITY_THRESHOLD}>
                <div class="graduation-quality-warning">
                  <WarningIcon />
                  Low quality -- consider enriching further
                </div>
              </Show>
            </div>
          )}
        </For>

        {/* Parent quality warning */}
        <Show when={props.proposal.parentAtom.quality < MIN_QUALITY_THRESHOLD}>
          <div class="graduation-quality-warning graduation-parent-warning">
            <WarningIcon />
            Parent atom quality is low -- consider enriching further
          </div>
        </Show>
      </div>

      {/* Soft gate banner for insufficient quality */}
      <Show when={hasInsufficientQuality()}>
        <div class="graduation-soft-gate">
          <WarningIcon />
          <span>Some items may be too vague. Create anyway?</span>
          <div class="graduation-soft-gate-actions">
            <button
              class="graduation-btn graduation-btn-primary"
              onPointerDown={(e: PointerEvent) => e.stopPropagation()}
              onClick={() => props.onConfirm()}
            >
              Create All
            </button>
            <button
              class="graduation-btn graduation-btn-secondary"
              onPointerDown={(e: PointerEvent) => e.stopPropagation()}
              onClick={() => props.onCancel()}
            >
              Go Back
            </button>
          </div>
        </div>
      </Show>

      {/* Action buttons (shown when no soft gate) */}
      <Show when={!hasInsufficientQuality()}>
        <div class="graduation-actions">
          <button
            class="graduation-btn graduation-btn-primary"
            onPointerDown={(e: PointerEvent) => e.stopPropagation()}
            onClick={() => props.onConfirm()}
          >
            Create {includedCount()} Atom{includedCount() > 1 ? 's' : ''}
          </button>
          <button
            class="graduation-btn graduation-btn-secondary"
            onPointerDown={(e: PointerEvent) => e.stopPropagation()}
            onClick={() => props.onCancel()}
          >
            Go Back
          </button>
        </div>
      </Show>
    </div>
  );
}

// --- Quality spectrum bar sub-component ---

function QualityBar(props: { score: number }) {
  const level = () => getQualityLevel(props.score);
  const color = () => getQualityColor(level());
  const label = () => getQualityLabel(level());
  const pct = () => Math.round(Math.min(1, Math.max(0, props.score)) * 100);

  return (
    <div class="graduation-quality-bar" title={`Quality: ${label()} (${pct()}%)`}>
      <div class="graduation-quality-track">
        <div
          class="graduation-quality-fill"
          style={{
            width: `${pct()}%`,
            'background-color': color(),
            transition: 'width 0.3s ease, background-color 0.3s ease',
          }}
        />
      </div>
      <span class="graduation-quality-label" style={{ color: color() }}>
        {label()}
      </span>
    </div>
  );
}

// --- Warning icon sub-component ---

function WarningIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="#f59e0b"
      style={{ 'flex-shrink': '0', display: 'inline-block', 'vertical-align': 'middle' }}
    >
      <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
    </svg>
  );
}
