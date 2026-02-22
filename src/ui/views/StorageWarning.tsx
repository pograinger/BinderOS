/**
 * StorageWarning: Full-screen persistence warning overlay.
 *
 * LOCKED DECISION (CONTEXT.md):
 *   - Prominent first-run warning if browser denies persistent storage
 *   - Explains data risk: "Your data may be deleted by the browser after 7 days of inactivity"
 *   - Platform-specific instructions (Add to Home Screen for Safari/iOS, Allow storage for others)
 *   - Dismissable but re-shows if persistence status changes
 *
 * CRITICAL: Never destructure props. Use <Show> for conditionals.
 */

import { Show } from 'solid-js';

interface StorageWarningProps {
  onDismiss: () => void;
}

function isSafariBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return ua.includes('Safari') && !ua.includes('Chrome') && !ua.includes('Chromium');
}

function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function StorageWarning(props: StorageWarningProps) {
  const safari = isSafariBrowser();
  const ios = isIOSDevice();

  return (
    <div class="storage-warning-overlay">
      <div class="storage-warning-card">
        <div class="storage-warning-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="var(--status-warning)">
            <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
          </svg>
        </div>

        <h2 class="storage-warning-title">Your data is at risk</h2>

        <p class="storage-warning-text">
          Your browser has <strong>not granted persistent storage</strong>.
          This means your data may be deleted after 7 days of inactivity.
        </p>

        <div class="storage-warning-instructions">
          <Show when={ios || safari}>
            <div class="storage-warning-step">
              <strong>For Safari / iOS:</strong>
              <ol>
                <li>Tap the Share button (box with arrow)</li>
                <li>Select "Add to Home Screen"</li>
                <li>Open the app from your Home Screen</li>
              </ol>
              <p class="storage-warning-note">
                Home Screen apps get elevated storage quotas and persistent data.
              </p>
            </div>
          </Show>
          <Show when={!ios && !safari}>
            <div class="storage-warning-step">
              <strong>To protect your data:</strong>
              <ol>
                <li>Click the install icon in the address bar (or menu)</li>
                <li>Select "Install" or "Add to Home Screen"</li>
                <li>Installed apps receive persistent storage automatically</li>
              </ol>
            </div>
          </Show>
        </div>

        <p class="storage-warning-export">
          You can also protect your data by exporting regularly
          (available from the status bar).
        </p>

        <button class="storage-warning-dismiss" onClick={() => props.onDismiss()}>
          I understand, continue anyway
        </button>
      </div>
    </div>
  );
}
