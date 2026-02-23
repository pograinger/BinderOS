/**
 * CloudRequestPreview — Pre-send review modal for cloud AI requests.
 *
 * Shows the user exactly what data is about to leave the device before each cloud request.
 * User can approve (send) or cancel (abort the request).
 *
 * This component is rendered by Shell.tsx when state.pendingCloudRequest is set.
 * The CloudAdapter.execute() method awaits the user's decision via a Promise<boolean>
 * resolved by onApprove/onCancel callbacks.
 *
 * CONTEXT.md locked decision:
 *   "every cloud request shows a preview of what the local LLM is sending.
 *    User can see exactly what data leaves the device and can cancel before sending."
 *
 * CRITICAL: Never destructure props — breaks SolidJS reactivity.
 */

import type { CloudRequestLogEntry } from '../../ai/key-vault';

interface CloudRequestPreviewProps {
  entry: CloudRequestLogEntry;
  onApprove: () => void;
  onCancel: () => void;
}

export function CloudRequestPreview(props: CloudRequestPreviewProps) {
  function formatTimestamp(ts: number): string {
    return new Date(ts).toLocaleString();
  }

  return (
    <>
      {/* Backdrop — clicking it cancels */}
      <div
        class="cloud-preview-backdrop"
        onClick={() => props.onCancel()}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        class="cloud-preview-container"
        role="dialog"
        aria-label="Cloud Request Preview"
        aria-modal="true"
      >
        {/* Header */}
        <div class="cloud-preview-header">
          <h2 class="cloud-preview-title">Cloud Request Preview</h2>
        </div>

        {/* Info */}
        <p class="cloud-preview-info">
          The following data will be sent to{' '}
          <strong>{props.entry.provider}</strong>. Review before sending.
        </p>

        {/* Metadata */}
        <div class="cloud-preview-meta">
          <div class="cloud-preview-meta-row">
            <span class="cloud-preview-meta-label">Provider:</span>
            <span class="cloud-preview-meta-value">{props.entry.provider}</span>
          </div>
          <div class="cloud-preview-meta-row">
            <span class="cloud-preview-meta-label">Model:</span>
            <span class="cloud-preview-meta-value">{props.entry.model}</span>
          </div>
          <div class="cloud-preview-meta-row">
            <span class="cloud-preview-meta-label">Time:</span>
            <span class="cloud-preview-meta-value">
              {formatTimestamp(props.entry.timestamp)}
            </span>
          </div>
        </div>

        {/* Data preview */}
        <div class="cloud-preview-data-label">Data being sent:</div>
        <div class="cloud-preview-data">
          <pre class="cloud-preview-prompt">{props.entry.sanitizedPrompt}</pre>
        </div>

        {/* Footer */}
        <div class="cloud-preview-footer">
          <button
            class="cloud-preview-btn cloud-preview-btn-cancel"
            onClick={() => props.onCancel()}
          >
            Cancel
          </button>
          <button
            class="cloud-preview-btn cloud-preview-btn-approve"
            onClick={() => props.onApprove()}
          >
            Send to Cloud
          </button>
        </div>

        {/* Note */}
        <p class="cloud-preview-note">
          You can disable this preview in AI Settings &gt; Privacy.
        </p>
      </div>
    </>
  );
}
