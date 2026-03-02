/**
 * CompressionCoachCard — displays a single compression candidate with AI explanation.
 *
 * Shows: atom title, action badge, AI-written explanation,
 * recommended action, and approve/reject buttons.
 *
 * Used inside ReviewStagingArea for deletion/mutation proposals from the compression coach.
 *
 * Phase 7: AIRV-04, AIGN-02
 */

import type { DeletionProposal, MutationProposal } from '../signals/store';

interface CompressionCoachCardProps {
  proposal: DeletionProposal | MutationProposal;
  onApprove: (proposalId: string) => void;
  onReject: (proposalId: string) => void;
}

function getBadgeLabel(proposal: DeletionProposal | MutationProposal): string {
  if (proposal.type === 'deletion') {
    return proposal.proposedAction === 'delete' ? 'Delete' : 'Archive';
  }
  // Mutation
  const keys = Object.keys(proposal.proposedChanges);
  if (keys.includes('tags')) return 'Tag: someday-maybe';
  if (keys.length === 0) return 'Link suggestion';
  return 'Update';
}

function getMutationSummary(changes: Record<string, unknown>): string {
  const parts: string[] = [];
  if ('tags' in changes && Array.isArray(changes.tags)) {
    parts.push(`Tags: ${(changes.tags as string[]).join(', ')}`);
  }
  if ('status' in changes) {
    parts.push(`Status: ${String(changes.status)}`);
  }
  if ('sectionId' in changes) {
    parts.push('Move to new section');
  }
  if (parts.length === 0 && Object.keys(changes).length === 0) {
    return 'Review suggested — see reasoning below';
  }
  return parts.join(' | ') || `Update: ${Object.keys(changes).join(', ')}`;
}

export function CompressionCoachCard(props: CompressionCoachCardProps) {
  const badge = () => getBadgeLabel(props.proposal);

  return (
    <div class="compression-coach-card">
      <div class="compression-card-header">
        <span class="compression-card-title">
          {props.proposal.type === 'deletion' ? props.proposal.atomTitle : props.proposal.currentAtomTitle}
        </span>
        <span class="compression-card-badge">{badge()}</span>
      </div>

      {props.proposal.type === 'mutation' && (
        <div class="staging-proposal-detail">
          {getMutationSummary(props.proposal.proposedChanges as Record<string, unknown>)}
        </div>
      )}

      <div class="compression-explanation">
        <span class="analysis-ai-badge">AI</span>
        {' '}
        {props.proposal.reasoning}
      </div>

      <div class="compression-card-actions">
        <button
          class="staging-reject-btn"
          type="button"
          onClick={() => props.onReject(props.proposal.id)}
        >
          Reject
        </button>
        <button
          class="staging-approve-btn"
          type="button"
          onClick={() => props.onApprove(props.proposal.id)}
        >
          Approve
        </button>
      </div>
    </div>
  );
}
