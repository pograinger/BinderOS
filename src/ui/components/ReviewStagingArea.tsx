/**
 * ReviewStagingArea — batch proposal review UI.
 *
 * Renders all accumulated staging proposals with individual approve/reject
 * buttons and an "Approve All" convenience action. Never makes "Approve All"
 * the default — always requires explicit action.
 *
 * Phase 7: AIGN-02
 */

import { For, Show, createMemo } from 'solid-js';
import {
  stagingProposals,
  approveProposal,
  removeStagingProposal,
  approveAllProposals,
} from '../signals/store';
import type { NewAtomProposal, MutationProposal, DeletionProposal } from '../signals/store';
import { CompressionCoachCard } from './CompressionCoachCard';

interface ReviewStagingAreaProps {
  onComplete: () => void;
}

function getSourcePhaseLabel(source: NewAtomProposal['source']): string {
  switch (source) {
    case 'get-clear': return 'Get Clear';
    case 'get-current': return 'Get Current';
    case 'get-creative': return 'Get Creative';
    default: return source;
  }
}

export function ReviewStagingArea(props: ReviewStagingAreaProps) {
  const allProposals = stagingProposals;

  const compressionProposals = createMemo(() =>
    allProposals().filter(
      (p): p is DeletionProposal | MutationProposal =>
        (p.type === 'deletion' || p.type === 'mutation') && p.source === 'compression-coach',
    ),
  );

  const newAtomProposals = createMemo(() =>
    allProposals().filter((p): p is NewAtomProposal => p.type === 'new-atom'),
  );

  const otherProposals = createMemo(() =>
    allProposals().filter(
      (p): p is DeletionProposal | MutationProposal =>
        (p.type === 'deletion' || p.type === 'mutation') && p.source !== 'compression-coach',
    ),
  );

  const totalCount = () => allProposals().length;

  // Empty state
  if (totalCount() === 0) {
    return (
      <div class="review-staging-area">
        <div class="review-staging-empty">
          <p class="review-staging-empty-title">No pending proposals.</p>
          <p class="review-staging-empty-msg">Your review is complete.</p>
          <button
            class="staging-finish-btn"
            type="button"
            onClick={props.onComplete}
          >
            Finish Review
          </button>
        </div>
      </div>
    );
  }

  function handleApproveAll() {
    approveAllProposals();
    props.onComplete();
  }

  return (
    <div class="review-staging-area">
      {/* Header */}
      <div class="review-staging-header">
        <span class="review-staging-title">Review Proposals</span>
        <span class="review-staging-count">({totalCount()})</span>
      </div>

      {/* Compression Coach Suggestions */}
      <Show when={compressionProposals().length > 0}>
        <div class="review-staging-section">
          <div class="review-staging-section-title">Compression Coach Suggestions</div>
          <For each={compressionProposals()}>
            {(proposal) => (
              <CompressionCoachCard
                proposal={proposal}
                onApprove={approveProposal}
                onReject={removeStagingProposal}
              />
            )}
          </For>
        </div>
      </Show>

      {/* New Atom Proposals */}
      <Show when={newAtomProposals().length > 0}>
        <div class="review-staging-section">
          <div class="review-staging-section-title">New Atom Proposals</div>
          <For each={newAtomProposals()}>
            {(proposal) => (
              <div class="staging-proposal-card">
                <div class="staging-proposal-title">
                  {proposal.proposedTitle}
                  {' '}
                  <span class="compression-card-badge">{proposal.proposedType}</span>
                  {' '}
                  <span class="compression-card-badge">{getSourcePhaseLabel(proposal.source)}</span>
                </div>
                <div class="staging-proposal-detail">{proposal.proposedContent}</div>
                <div class="staging-proposal-reasoning">{proposal.reasoning}</div>
                <div class="staging-proposal-actions">
                  <button
                    class="staging-reject-btn"
                    type="button"
                    onClick={() => removeStagingProposal(proposal.id)}
                  >
                    Reject
                  </button>
                  <button
                    class="staging-approve-btn"
                    type="button"
                    onClick={() => approveProposal(proposal.id)}
                  >
                    Approve
                  </button>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>

      {/* Other Changes (non-compression mutations and deletions) */}
      <Show when={otherProposals().length > 0}>
        <div class="review-staging-section">
          <div class="review-staging-section-title">Other Changes</div>
          <For each={otherProposals()}>
            {(proposal) => (
              <div class="staging-proposal-card">
                <div class="staging-proposal-title">
                  {proposal.type === 'deletion' ? proposal.atomTitle : proposal.currentAtomTitle}
                  {' '}
                  <span class="compression-card-badge">
                    {proposal.type === 'deletion'
                      ? (proposal.proposedAction === 'delete' ? 'Delete' : 'Archive')
                      : 'Update'}
                  </span>
                </div>
                <div class="staging-proposal-reasoning">{proposal.reasoning}</div>
                <div class="staging-proposal-actions">
                  <button
                    class="staging-reject-btn"
                    type="button"
                    onClick={() => removeStagingProposal(proposal.id)}
                  >
                    Reject
                  </button>
                  <button
                    class="staging-approve-btn"
                    type="button"
                    onClick={() => approveProposal(proposal.id)}
                  >
                    Approve
                  </button>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>

      {/* Bottom action bar */}
      <div class="review-staging-actions">
        <button
          class="staging-approve-all-btn"
          type="button"
          onClick={handleApproveAll}
        >
          Approve All ({totalCount()})
        </button>
        <button
          class="staging-finish-btn"
          type="button"
          onClick={props.onComplete}
        >
          Discard Remaining &amp; Finish
        </button>
      </div>
    </div>
  );
}
