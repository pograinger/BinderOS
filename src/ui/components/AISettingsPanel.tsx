/**
 * AISettingsPanel — AI configuration panel opened from Command Palette.
 *
 * Accessible via Ctrl+P -> "AI Settings".
 *
 * Sections:
 *   - Master toggle: Enable AI Features
 *   - Local AI: Browser LLM toggle, status, model details, download progress
 *   - Cloud AI: Cloud API toggle, API key input (memory-only default + encrypted persistence),
 *     security disclosure, stored-key unlock, per-session consent
 *   - Feature Toggles: Triage, Review, Compression (UI-only in Phase 4 — used by Phases 5-7)
 *   - Privacy: Sanitization level selector with description
 *   - Communication Log: History of cloud requests this session
 *   - Provider Status: Table showing provider name, status, model
 *
 * CRITICAL: Never destructure props or state — breaks SolidJS reactivity.
 */

import { createSignal, Show, For } from 'solid-js';
import {
  state,
  setAIEnabled,
  setBrowserLLMEnabled,
  setCloudAPIEnabled,
  setAIFirstRunComplete,
  setTriageEnabled,
  setReviewEnabled,
  setCompressionEnabled,
  activateCloudAdapter,
  setSelectedLLMModel,
} from '../signals/store';
import { WEBLLM_MODELS, DEFAULT_MODEL_ID } from '../../ai/adapters/browser';
import {
  setMemoryKey,
  encryptAndStore,
  decryptFromStore,
  hasStoredKey,
  grantSessionConsent,
  hasSessionConsent,
  revokeSessionConsent,
  getCloudRequestLog,
  clearCloudRequestLog,
} from '../../ai/key-vault';
import {
  type SanitizationLevel,
  DEFAULT_SANITIZATION_LEVEL,
  SANITIZATION_LEVEL_DESCRIPTIONS,
} from '../../ai/privacy-proxy';

interface AISettingsPanelProps {
  onClose: () => void;
}

export function AISettingsPanel(props: AISettingsPanelProps) {
  // Local UI state
  const [apiKeyInput, setApiKeyInput] = createSignal('');
  const [showApiKey, setShowApiKey] = createSignal(false);
  const [passphraseInput, setPassphraseInput] = createSignal('');
  const [showPassphraseDialog, setShowPassphraseDialog] = createSignal(false);
  const [unlockPassphraseInput, setUnlockPassphraseInput] = createSignal('');
  const [keyFeedback, setKeyFeedback] = createSignal<string | null>(null);
  const [sanitizationLevel, setSanitizationLevel] = createSignal<SanitizationLevel>(
    DEFAULT_SANITIZATION_LEVEL,
  );
  const [showModelDetails, setShowModelDetails] = createSignal(false);
  const [logEntries, setLogEntries] = createSignal(getCloudRequestLog());
  // Reactive wrapper for session consent (key-vault uses plain booleans, not signals)
  const [consentGranted, setConsentGranted] = createSignal(hasSessionConsent());

  function formatTimestamp(ts: number): string {
    return new Date(ts).toLocaleTimeString();
  }

  function truncatePrompt(prompt: string, max = 80): string {
    return prompt.length > max ? prompt.slice(0, max) + '...' : prompt;
  }

  async function handleSaveMemoryOnly() {
    const key = apiKeyInput().trim();
    if (!key) {
      setKeyFeedback('Please enter an API key.');
      return;
    }
    setMemoryKey(key);
    setApiKeyInput('');
    // If cloud is already enabled, activate the adapter with the new key
    if (state.cloudAPIEnabled) {
      await activateCloudAdapter();
    }
    setKeyFeedback('Key saved to memory. It will be cleared when you close the app.');
  }

  async function handleEncryptAndPersist() {
    const key = apiKeyInput().trim();
    if (!key) {
      setKeyFeedback('Please enter an API key.');
      return;
    }
    setShowPassphraseDialog(true);
  }

  async function handleConfirmEncrypt() {
    const passphrase = passphraseInput().trim();
    if (!passphrase) {
      setKeyFeedback('Please enter a passphrase.');
      return;
    }
    try {
      await encryptAndStore(apiKeyInput().trim(), passphrase);
      setApiKeyInput('');
      setPassphraseInput('');
      setShowPassphraseDialog(false);
      setKeyFeedback('Key encrypted and stored. Enter passphrase to unlock on next session.');
    } catch {
      setKeyFeedback('Encryption failed. Please try again.');
    }
  }

  async function handleUnlockStoredKey() {
    const passphrase = unlockPassphraseInput().trim();
    if (!passphrase) {
      setKeyFeedback('Please enter your passphrase.');
      return;
    }
    try {
      const key = await decryptFromStore(passphrase);
      if (key) {
        setUnlockPassphraseInput('');
        if (state.cloudAPIEnabled) {
          await activateCloudAdapter();
        }
        setKeyFeedback('Key unlocked and loaded into memory.');
      } else {
        setKeyFeedback('No stored key found.');
      }
    } catch {
      setKeyFeedback('Wrong passphrase or corrupted key.');
    }
  }

  function handleClearLog() {
    clearCloudRequestLog();
    setLogEntries([]);
  }

  function refreshLog() {
    setLogEntries([...getCloudRequestLog()]);
  }

  return (
    <>
      {/* Backdrop */}
      <div
        class="ai-settings-backdrop"
        onClick={() => props.onClose()}
        aria-hidden="true"
      />

      {/* Panel container */}
      <div
        class="ai-settings-container"
        role="dialog"
        aria-label="AI Settings"
        aria-modal="true"
      >
        {/* Header */}
        <div class="ai-settings-header">
          <h2 class="ai-settings-title">AI Settings</h2>
          <button
            class="ai-settings-close"
            onClick={() => props.onClose()}
            aria-label="Close AI Settings"
          >
            ×
          </button>
        </div>

        <div class="ai-settings-body">
          {/* Section: Master Toggle */}
          <div class="ai-settings-section">
            <div class="ai-settings-toggle-row">
              <label class="ai-settings-toggle-label" for="ai-master-toggle">
                <span class="ai-settings-toggle-name">Enable AI Features</span>
                <span class="ai-settings-toggle-desc">
                  All AI features are off by default. Toggle to enable.
                </span>
              </label>
              <input
                id="ai-master-toggle"
                type="checkbox"
                class="ai-settings-toggle"
                checked={state.aiEnabled}
                onChange={(e) => {
                  setAIEnabled((e.target as HTMLInputElement).checked);
                  if (!(e.target as HTMLInputElement).checked) {
                    setAIFirstRunComplete(true);
                  }
                }}
              />
            </div>
          </div>

          {/* Section: Local AI */}
          <Show when={state.aiEnabled}>
            <div class="ai-settings-section">
              <h3 class="ai-settings-section-title">Local AI</h3>

              <div class="ai-settings-toggle-row">
                <label class="ai-settings-toggle-label" for="browser-llm-toggle">
                  <span class="ai-settings-toggle-name">Browser LLM</span>
                  <span class="ai-settings-toggle-desc">
                    Local AI running entirely on-device via WebGPU. No data leaves your machine.
                  </span>
                </label>
                <input
                  id="browser-llm-toggle"
                  type="checkbox"
                  class="ai-settings-toggle"
                  checked={state.browserLLMEnabled}
                  onChange={(e) => setBrowserLLMEnabled((e.target as HTMLInputElement).checked)}
                />
              </div>

              {/* Model selector — shown when browser LLM is enabled */}
              <Show when={state.browserLLMEnabled}>
                <div class="ai-settings-field">
                  <label class="ai-settings-field-label" for="model-selector">
                    Local Model
                  </label>
                  <select
                    id="model-selector"
                    class="ai-settings-select"
                    value={state.llmModelId ?? DEFAULT_MODEL_ID}
                    onChange={(e) => {
                      const modelId = (e.target as HTMLSelectElement).value;
                      setSelectedLLMModel(modelId);
                    }}
                  >
                    <For each={[...WEBLLM_MODELS]}>
                      {(model) => (
                        <option value={model.id}>
                          {model.label}
                        </option>
                      )}
                    </For>
                  </select>
                  <span class="ai-settings-hint">
                    Larger models are more accurate but require more VRAM. WebGPU required.
                  </span>
                </div>
              </Show>

              <div class="ai-settings-status-row">
                <span class="ai-settings-status-label">Status:</span>
                <span
                  class={`ai-settings-status-value status-${state.llmStatus}`}
                >
                  {state.llmStatus === 'available'
                    ? 'Ready'
                    : state.llmStatus === 'loading'
                    ? 'Loading...'
                    : state.llmStatus === 'error'
                    ? 'Error'
                    : state.llmStatus === 'unavailable'
                    ? 'Unavailable (WebGPU required)'
                    : 'Disabled'}
                </span>
              </div>

              <Show when={state.llmDownloadProgress !== null}>
                <div class="ai-settings-progress">
                  <div
                    class="ai-settings-progress-bar"
                    style={{ width: `${Math.min(state.llmDownloadProgress ?? 0, 100)}%` }}
                  />
                  <span class="ai-settings-progress-label">
                    Downloading model: {Math.min(Math.round(state.llmDownloadProgress ?? 0), 100)}%
                  </span>
                </div>
              </Show>

              <button
                class="ai-settings-link-btn"
                onClick={() => setShowModelDetails((v) => !v)}
              >
                {showModelDetails() ? 'Hide' : 'Show'} model details
              </button>

              <Show when={showModelDetails()}>
                <div class="ai-settings-model-details">
                  <div>
                    <span class="ai-settings-detail-label">Model:</span>{' '}
                    {state.llmModelId ?? '—'}
                  </div>
                  <div>
                    <span class="ai-settings-detail-label">Device:</span>{' '}
                    {state.llmDevice ?? '—'}
                  </div>
                </div>
              </Show>
            </div>

            {/* Section: Cloud AI */}
            <div class="ai-settings-section">
              <h3 class="ai-settings-section-title">Cloud AI</h3>

              <div class="ai-settings-toggle-row">
                <label class="ai-settings-toggle-label" for="cloud-api-toggle">
                  <span class="ai-settings-toggle-name">Cloud API</span>
                  <span class="ai-settings-toggle-desc">
                    Anthropic API for deeper analysis. Data is filtered locally first.
                  </span>
                </label>
                <input
                  id="cloud-api-toggle"
                  type="checkbox"
                  class="ai-settings-toggle"
                  checked={state.cloudAPIEnabled}
                  onChange={(e) => {
                    setCloudAPIEnabled((e.target as HTMLInputElement).checked);
                    if (!(e.target as HTMLInputElement).checked) {
                      revokeSessionConsent();
                    }
                  }}
                />
              </div>

              <div class="ai-settings-status-row">
                <span class="ai-settings-status-label">Status:</span>
                <span class={`ai-settings-status-value status-${state.cloudStatus}`}>
                  {state.cloudStatus === 'available'
                    ? 'Ready'
                    : state.cloudStatus === 'loading'
                    ? 'Loading...'
                    : state.cloudStatus === 'error'
                    ? 'Error'
                    : state.cloudStatus === 'unavailable'
                    ? 'No API key'
                    : 'Disabled'}
                </span>
              </div>

              {/* API Key Input */}
              <div class="ai-settings-key-section">
                <label class="ai-settings-field-label" for="api-key-input">
                  API Key
                </label>
                <div class="ai-settings-key-input-row">
                  <input
                    id="api-key-input"
                    class="ai-settings-input"
                    type={showApiKey() ? 'text' : 'password'}
                    placeholder="sk-ant-..."
                    value={apiKeyInput()}
                    onInput={(e) => setApiKeyInput((e.target as HTMLInputElement).value)}
                    autocomplete="off"
                  />
                  <button
                    class="ai-settings-toggle-visibility"
                    onClick={() => setShowApiKey((v) => !v)}
                    aria-label={showApiKey() ? 'Hide API key' : 'Show API key'}
                  >
                    {showApiKey() ? 'Hide' : 'Show'}
                  </button>
                </div>

                <div class="ai-settings-key-actions">
                  <button
                    class="ai-settings-btn ai-settings-btn-secondary"
                    onClick={() => void handleSaveMemoryOnly()}
                  >
                    Save to memory only
                  </button>
                  <button
                    class="ai-settings-btn ai-settings-btn-secondary"
                    onClick={() => void handleEncryptAndPersist()}
                  >
                    Encrypt &amp; persist
                  </button>
                </div>

                <p class="ai-settings-disclosure">
                  <strong>Memory-only:</strong> key is cleared when you close the app.{' '}
                  <strong>Encrypted:</strong> key persists across sessions protected by your passphrase.
                </p>

                {/* Passphrase dialog */}
                <Show when={showPassphraseDialog()}>
                  <div class="ai-settings-passphrase-dialog">
                    <label class="ai-settings-field-label" for="encrypt-passphrase">
                      Encryption passphrase
                    </label>
                    <input
                      id="encrypt-passphrase"
                      class="ai-settings-input"
                      type="password"
                      placeholder="Choose a strong passphrase..."
                      value={passphraseInput()}
                      onInput={(e) => setPassphraseInput((e.target as HTMLInputElement).value)}
                    />
                    <div class="ai-settings-key-actions">
                      <button
                        class="ai-settings-btn ai-settings-btn-primary"
                        onClick={() => void handleConfirmEncrypt()}
                      >
                        Encrypt &amp; save
                      </button>
                      <button
                        class="ai-settings-btn ai-settings-btn-secondary"
                        onClick={() => {
                          setShowPassphraseDialog(false);
                          setPassphraseInput('');
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </Show>

                {/* Stored key unlock */}
                <Show when={hasStoredKey()}>
                  <div class="ai-settings-stored-key">
                    <p class="ai-settings-stored-key-notice">
                      Encrypted key found. Enter passphrase to unlock.
                    </p>
                    <div class="ai-settings-key-input-row">
                      <input
                        class="ai-settings-input"
                        type="password"
                        placeholder="Unlock passphrase..."
                        value={unlockPassphraseInput()}
                        onInput={(e) =>
                          setUnlockPassphraseInput((e.target as HTMLInputElement).value)
                        }
                      />
                      <button
                        class="ai-settings-btn ai-settings-btn-primary"
                        onClick={() => void handleUnlockStoredKey()}
                      >
                        Unlock
                      </button>
                    </div>
                  </div>
                </Show>

                {/* Feedback message */}
                <Show when={keyFeedback() !== null}>
                  <p class="ai-settings-feedback">{keyFeedback()}</p>
                </Show>
              </div>

              {/* Per-session consent */}
              <div class="ai-settings-consent">
                <span class="ai-settings-consent-label">Session consent:</span>
                <Show
                  when={consentGranted()}
                  fallback={
                    <button
                      class="ai-settings-btn ai-settings-btn-primary"
                      onClick={() => { grantSessionConsent(); setConsentGranted(true); }}
                    >
                      Grant consent for this session
                    </button>
                  }
                >
                  <span class="ai-settings-consent-granted">Granted for this session</span>
                  <button
                    class="ai-settings-btn ai-settings-btn-secondary"
                    onClick={() => { revokeSessionConsent(); setConsentGranted(false); }}
                  >
                    Revoke
                  </button>
                </Show>
              </div>
            </div>

            {/* Section: Feature Toggles */}
            <div class="ai-settings-section">
              <h3 class="ai-settings-section-title">Features</h3>
              <p class="ai-settings-section-desc">
                Control which AI features are active. Features built in Phases 5-7.
              </p>

              <div class="ai-settings-toggle-row">
                <label class="ai-settings-toggle-label" for="triage-toggle">
                  <span class="ai-settings-toggle-name">Triage suggestions</span>
                  <span class="ai-settings-toggle-desc">
                    AI-assisted inbox triage with action suggestions.
                  </span>
                </label>
                <input
                  id="triage-toggle"
                  type="checkbox"
                  class="ai-settings-toggle"
                  checked={state.triageEnabled}
                  onChange={(e) => setTriageEnabled((e.target as HTMLInputElement).checked)}
                />
              </div>

              <div class="ai-settings-toggle-row">
                <label class="ai-settings-toggle-label" for="review-toggle">
                  <span class="ai-settings-toggle-name">Review analysis</span>
                  <span class="ai-settings-toggle-desc">
                    Deep analysis during weekly/project reviews via cloud AI.
                  </span>
                </label>
                <input
                  id="review-toggle"
                  type="checkbox"
                  class="ai-settings-toggle"
                  checked={state.reviewEnabled}
                  onChange={(e) => setReviewEnabled((e.target as HTMLInputElement).checked)}
                />
              </div>

              <div class="ai-settings-toggle-row">
                <label class="ai-settings-toggle-label" for="compression-toggle">
                  <span class="ai-settings-toggle-name">Compression coach</span>
                  <span class="ai-settings-toggle-desc">
                    Guided atom compression and staleness cleanup.
                  </span>
                </label>
                <input
                  id="compression-toggle"
                  type="checkbox"
                  class="ai-settings-toggle"
                  checked={state.compressionEnabled}
                  onChange={(e) => setCompressionEnabled((e.target as HTMLInputElement).checked)}
                />
              </div>
            </div>
          </Show>

          {/* Section: Privacy */}
          <div class="ai-settings-section">
            <h3 class="ai-settings-section-title">Privacy</h3>
            <label class="ai-settings-field-label" for="sanitization-level">
              Sanitization level
            </label>
            <select
              id="sanitization-level"
              class="ai-settings-select"
              value={sanitizationLevel()}
              onChange={(e) =>
                setSanitizationLevel((e.target as HTMLSelectElement).value as SanitizationLevel)
              }
            >
              <option value="abstract">Abstract patterns only</option>
              <option value="structured">Structured summaries</option>
              <option value="full">Full context</option>
            </select>
            <p class="ai-settings-disclosure">
              {SANITIZATION_LEVEL_DESCRIPTIONS[sanitizationLevel()]}
            </p>
          </div>

          {/* Section: Communication Log */}
          <div class="ai-settings-section">
            <div class="ai-settings-log-header">
              <h3 class="ai-settings-section-title">Cloud Communication Log</h3>
              <button
                class="ai-settings-btn ai-settings-btn-secondary"
                onClick={handleClearLog}
              >
                Clear
              </button>
              <button
                class="ai-settings-btn ai-settings-btn-secondary"
                onClick={refreshLog}
              >
                Refresh
              </button>
            </div>

            <Show
              when={logEntries().length > 0}
              fallback={
                <p class="ai-settings-log-empty">No cloud requests this session.</p>
              }
            >
              <div class="ai-settings-log-entries">
                <For each={[...logEntries()]}>
                  {(entry) => (
                    <div class="ai-settings-log-entry">
                      <div class="ai-settings-log-meta">
                        <span class="ai-settings-log-time">
                          {formatTimestamp(entry.timestamp)}
                        </span>
                        <span class="ai-settings-log-provider">{entry.provider}</span>
                        <span
                          class={`ai-settings-log-status log-status-${entry.status}`}
                        >
                          {entry.status}
                        </span>
                      </div>
                      <div class="ai-settings-log-prompt">
                        {truncatePrompt(entry.sanitizedPrompt)}
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>

          {/* Section: Provider Status */}
          <div class="ai-settings-section">
            <h3 class="ai-settings-section-title">Provider Status</h3>
            <table class="ai-settings-provider-table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Status</th>
                  <th>Model</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Browser LLM</td>
                  <td class={`status-${state.llmStatus}`}>{state.llmStatus}</td>
                  <td>{state.llmModelId ?? '—'}</td>
                </tr>
                <tr>
                  <td>Cloud API</td>
                  <td class={`status-${state.cloudStatus}`}>{state.cloudStatus}</td>
                  <td>claude-haiku-4-5-20251001</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
