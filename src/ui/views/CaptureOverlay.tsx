/**
 * CaptureOverlay: Fast capture modal for quick thought entry.
 *
 * LOCKED DECISION (CONTEXT.md): Instant capture mechanism that
 * prioritizes speed above all. Open -> type -> save under 3 seconds.
 *
 * Features:
 *   - Slides up from bottom on mobile, centers on desktop
 *   - Auto-focuses textarea on open
 *   - Ctrl+Enter or button to save
 *   - Escape to close without saving
 *   - Mic button for voice capture (VoiceCapture component)
 *   - Micro-animation confirmation on save
 *   - Optional title field (collapsed by default)
 *
 * CRITICAL: Never destructure props. Use <Show> for conditionals.
 */

import { createSignal, onMount, Show } from 'solid-js';
import { sendCommand } from '../signals/store';
import { VoiceCapture } from '../components/VoiceCapture';

interface CaptureOverlayProps {
  onClose: () => void;
}

export function CaptureOverlay(props: CaptureOverlayProps) {
  const [content, setContent] = createSignal('');
  const [title, setTitle] = createSignal('');
  const [showTitle, setShowTitle] = createSignal(false);
  const [saved, setSaved] = createSignal(false);

  let textareaRef: HTMLTextAreaElement | undefined;

  onMount(() => {
    // Auto-focus for instant typing
    if (textareaRef) {
      textareaRef.focus();
    }
  });

  const handleSave = () => {
    const text = content().trim();
    if (!text) return;

    sendCommand({
      type: 'CREATE_INBOX_ITEM',
      payload: {
        content: text,
        title: title().trim() || undefined,
      },
    });

    // Show saved animation
    setSaved(true);
    setTimeout(() => {
      props.onClose();
    }, 400);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    // Ctrl+Enter or Cmd+Enter: save
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
    // Escape: close without saving
    if (e.key === 'Escape') {
      e.preventDefault();
      props.onClose();
    }
  };

  const handleOverlayClick = (e: MouseEvent) => {
    // Close if clicking the overlay backdrop (not the card)
    if ((e.target as HTMLElement).classList.contains('capture-overlay')) {
      props.onClose();
    }
  };

  const handleVoiceTranscript = (text: string) => {
    setContent((prev) => (prev ? prev + ' ' + text : text));
  };

  return (
    <div class="capture-overlay" onClick={handleOverlayClick} onKeyDown={handleKeyDown}>
      <div class="capture-card">
        <Show when={!saved()}>
          {/* Optional title */}
          <Show when={showTitle()}>
            <input
              class="capture-title-input"
              type="text"
              placeholder="Title (optional)"
              value={title()}
              onInput={(e) => setTitle(e.currentTarget.value)}
            />
          </Show>
          <Show when={!showTitle()}>
            <button
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                "font-size": "12px",
                cursor: "pointer",
                "align-self": "flex-start",
                padding: "0",
              }}
              onClick={() => setShowTitle(true)}
            >
              + Add title
            </button>
          </Show>

          {/* Main textarea */}
          <textarea
            ref={textareaRef}
            class="capture-textarea"
            placeholder="Capture a thought..."
            value={content()}
            onInput={(e) => setContent(e.currentTarget.value)}
          />

          {/* Actions row */}
          <div class="capture-actions">
            <VoiceCapture onTranscript={handleVoiceTranscript} />
            <button
              class="capture-save-btn"
              onClick={handleSave}
              disabled={!content().trim()}
            >
              Save to Inbox
            </button>
          </div>

          <div class="capture-shortcut-hint">
            Ctrl+Enter to save / Escape to close
          </div>
        </Show>

        {/* Saved confirmation animation */}
        <Show when={saved()}>
          <div class="capture-saved-check">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z" />
            </svg>
          </div>
        </Show>
      </div>
    </div>
  );
}
