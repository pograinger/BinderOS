/**
 * AISettingsPanel — AI configuration panel opened from Command Palette.
 *
 * Accessible via Ctrl+P -> "AI Settings".
 *
 * Sections:
 *   - Master toggle: Enable AI Features
 *   - Local AI: Browser LLM toggle, status, model details, download progress
 *   - Cloud AI: Provider dropdown, per-provider key entry with validation,
 *     custom endpoint form, security disclosure, stored-key unlock, per-session consent
 *   - Feature Toggles: Triage, Review, Compression toggles
 *   - Privacy: Sanitization level selector with description
 *   - Communication Log: History of cloud requests this session
 *   - Provider Status: Table showing all configured providers with status and model
 *
 * CRITICAL: Never destructure props or state — breaks SolidJS reactivity.
 */

import { createSignal, onMount, Show, For } from 'solid-js';
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
  classifierReady,
  classifierLoadProgress,
  classifierVersion,
  setActiveCloudProvider,
  setProviderModel,
  setCustomEndpointConfig,
} from '../signals/store';
import { WEBLLM_MODELS, DEFAULT_MODEL_ID } from '../../ai/adapters/browser';
import { getClassificationHistory } from '../../storage/classification-log';
import {
  PROVIDER_REGISTRY,
  validateProviderKey,
  normalizeBaseURL,
  type ProviderId,
} from '../../ai/provider-registry';
import {
  setMemoryKeyForProvider,
  hasMemoryKeyForProvider,
  encryptAndStoreForProvider,
  decryptAllFromStore,
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
  // Classifier correction count — loaded once on panel open, reloaded after export
  const [correctionCountLocal, setCorrectionCountLocal] = createSignal(0);

  // Phase 13: Provider UI signals
  const [validatingKey, setValidatingKey] = createSignal(false);
  const [keyValid, setKeyValid] = createSignal<boolean | null>(null); // null=not checked
  const [customLabel, setCustomLabel] = createSignal(state.customEndpointConfig?.label ?? '');
  const [customBaseURL, setCustomBaseURL] = createSignal(state.customEndpointConfig?.baseURL ?? '');
  const [customModel, setCustomModel] = createSignal(state.customEndpointConfig?.model ?? '');
  const [modelOverride, setModelOverride] = createSignal(
    state.providerModels[state.activeCloudProvider] ??
    PROVIDER_REGISTRY[state.activeCloudProvider as ProviderId]?.defaultModel ?? '',
  );

  async function loadCorrectionCount() {
    const history = await getClassificationHistory();
    const count = history.filter(
      (e) => e.suggestedType !== undefined && e.suggestedType !== e.chosenType,
    ).length;
    setCorrectionCountLocal(count);
  }

  onMount(() => {
    void loadCorrectionCount();
  });

  async function handleExportCorrections() {
    const { exportCorrectionLog } = await import('../../storage/export');
    await exportCorrectionLog();
    await loadCorrectionCount();
  }

  function formatTimestamp(ts: number): string {
    return new Date(ts).toLocaleTimeString();
  }

  function truncatePrompt(prompt: string, max = 80): string {
    return prompt.length > max ? prompt.slice(0, max) + '...' : prompt;
  }

  // Phase 13: Validate key after save
  async function validateAndActivate(providerId: ProviderId, key: string) {
    setValidatingKey(true);
    setKeyValid(null);
    setKeyFeedback('Validating key...');
    const baseURL = providerId === 'custom'
      ? normalizeBaseURL(customBaseURL())
      : PROVIDER_REGISTRY[providerId]?.baseURL ?? undefined;
    const valid = await validateProviderKey(providerId, key, baseURL ?? undefined);
    setValidatingKey(false);
    setKeyValid(valid);
    if (valid) {
      setKeyFeedback('Key valid. Cloud adapter activated.');
      if (state.cloudAPIEnabled) {
        await activateCloudAdapter();
      }
    } else {
      setKeyFeedback('Invalid key — check the key and try again.');
    }
  }

  async function handleSaveMemoryOnly() {
    const key = apiKeyInput().trim();
    if (!key) {
      setKeyFeedback('Please enter an API key.');
      return;
    }
    const providerId = state.activeCloudProvider as ProviderId;
    setMemoryKeyForProvider(providerId, key);
    setApiKeyInput('');
    await validateAndActivate(providerId, key);
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
    const providerId = state.activeCloudProvider as ProviderId;
    try {
      await encryptAndStoreForProvider(providerId, apiKeyInput().trim(), passphrase);
      const key = apiKeyInput().trim();
      setApiKeyInput('');
      setPassphraseInput('');
      setShowPassphraseDialog(false);
      await validateAndActivate(providerId, key);
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
      const keys = await decryptAllFromStore(passphrase);
      const hasAny = Object.values(keys).some(Boolean);
      if (hasAny) {
        setUnlockPassphraseInput('');
        if (state.cloudAPIEnabled) {
          await activateCloudAdapter();
        }
        setKeyFeedback('Keys unlocked and loaded into memory.');
      } else {
        setKeyFeedback('No stored keys found.');
      }
    } catch {
      setKeyFeedback('Wrong passphrase or corrupted key.');
    }
  }

  function handleSaveCustomEndpoint() {
    const label = customLabel().trim();
    const url = customBaseURL().trim();
    const model = customModel().trim();
    if (!url || !model) {
      setKeyFeedback('Base URL and model name are required for custom endpoints.');
      return;
    }
    setCustomEndpointConfig({ label: label || 'Custom', baseURL: normalizeBaseURL(url), model });
    setKeyFeedback('Custom endpoint saved.');
    if (state.cloudAPIEnabled) {
      void activateCloudAdapter();
    }
  }

  function handleClearLog() {
    clearCloudRequestLog();
    setLogEntries([]);
  }

  function refreshLog() {
    setLogEntries([...getCloudRequestLog()]);
  }

  function handleProviderChange(providerId: string) {
    setActiveCloudProvider(providerId);
    setKeyValid(null);
    setKeyFeedback(null);
    // Update model override for the new provider
    const newModel =
      state.providerModels[providerId] ??
      PROVIDER_REGISTRY[providerId as ProviderId]?.defaultModel ?? '';
    setModelOverride(newModel);
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

              {/* Triage Type Classifier — ONNX model info and correction export */}
              <div class="ai-settings-classifier-card">
                <h4 class="ai-settings-classifier-title">Triage Type Classifier</h4>
                <div class="ai-settings-detail-row">
                  <span class="ai-settings-detail-label">Version:</span>
                  <span class="ai-settings-detail-value">{classifierVersion() ?? '—'}</span>
                </div>
                <div class="ai-settings-detail-row">
                  <span class="ai-settings-detail-label">Status:</span>
                  <span class="ai-settings-detail-value">
                    {classifierReady()
                      ? 'Ready'
                      : classifierLoadProgress() !== null
                      ? `Downloading ${classifierLoadProgress() === -1 ? '...' : `${classifierLoadProgress() ?? 0}%`}`
                      : 'Not loaded'}
                  </span>
                </div>
                <div class="ai-settings-detail-row ai-settings-detail-row--with-action">
                  <span class="ai-settings-detail-label">Corrections:</span>
                  <span class="ai-settings-detail-value">{correctionCountLocal()}</span>
                  <button
                    class="ai-settings-btn ai-settings-btn-secondary ai-settings-btn--small"
                    onClick={() => void handleExportCorrections()}
                    disabled={correctionCountLocal() === 0}
                    title={correctionCountLocal() === 0 ? 'No corrections to export' : 'Download corrections as JSONL'}
                  >
                    Export
                  </button>
                </div>
                <p class="ai-settings-classifier-hint">
                  Corrections are classification events where you chose a different type than suggested.
                  Export for model retraining — the original training corpus is never overwritten.
                </p>
              </div>
            </div>

            {/* Section: Cloud AI */}
            <div class="ai-settings-section">
              <h3 class="ai-settings-section-title">Cloud AI</h3>

              <div class="ai-settings-toggle-row">
                <label class="ai-settings-toggle-label" for="cloud-api-toggle">
                  <span class="ai-settings-toggle-name">Cloud API</span>
                  <span class="ai-settings-toggle-desc">
                    Cloud API for deeper analysis. Select your provider below. Data is filtered locally first.
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

              {/* Provider dropdown */}
              <div class="ai-settings-field">
                <label class="ai-settings-field-label" for="provider-select">
                  Provider
                </label>
                <select
                  id="provider-select"
                  class="ai-settings-select ai-settings-provider-select"
                  value={state.activeCloudProvider}
                  onChange={(e) => handleProviderChange((e.target as HTMLSelectElement).value)}
                >
                  <For each={Object.values(PROVIDER_REGISTRY)}>
                    {(provider) => (
                      <option value={provider.id}>{provider.displayName}</option>
                    )}
                  </For>
                </select>
              </div>

              {/* Model override field (not shown for custom — model is set in endpoint form) */}
              <Show when={state.activeCloudProvider !== 'custom'}>
                <div class="ai-settings-field">
                  <label class="ai-settings-field-label" for="model-override">
                    Model
                  </label>
                  <input
                    id="model-override"
                    class="ai-settings-input"
                    type="text"
                    value={modelOverride()}
                    onInput={(e) => {
                      const val = (e.target as HTMLInputElement).value;
                      setModelOverride(val);
                      setProviderModel(state.activeCloudProvider, val);
                    }}
                    placeholder={PROVIDER_REGISTRY[state.activeCloudProvider as ProviderId]?.defaultModel ?? ''}
                  />
                  <span class="ai-settings-model-hint">
                    Default: {PROVIDER_REGISTRY[state.activeCloudProvider as ProviderId]?.defaultModel ?? ''}. Change to any model the provider supports.
                  </span>
                </div>
              </Show>

              {/* Custom endpoint form — shown only when Custom provider is selected */}
              <Show when={state.activeCloudProvider === 'custom'}>
                <div class="ai-settings-endpoint-form">
                  <label class="ai-settings-field-label">Custom Endpoint</label>
                  <input
                    class="ai-settings-input"
                    type="text"
                    placeholder="Label (e.g. My Ollama)"
                    value={customLabel()}
                    onInput={(e) => setCustomLabel((e.target as HTMLInputElement).value)}
                  />
                  <input
                    class="ai-settings-input"
                    type="text"
                    placeholder="Base URL (e.g. http://localhost:11434/v1)"
                    value={customBaseURL()}
                    onInput={(e) => setCustomBaseURL((e.target as HTMLInputElement).value)}
                  />
                  <input
                    class="ai-settings-input"
                    type="text"
                    placeholder="Model name (required)"
                    value={customModel()}
                    onInput={(e) => setCustomModel((e.target as HTMLInputElement).value)}
                  />
                  <button
                    class="ai-settings-btn ai-settings-btn-secondary"
                    onClick={handleSaveCustomEndpoint}
                  >
                    Save endpoint
                  </button>
                </div>
              </Show>

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
              <Show when={state.activeCloudProvider !== 'custom'}>
                <div class="ai-settings-key-section">
                  <label class="ai-settings-field-label" for="api-key-input">
                    API Key
                  </label>
                  <div class="ai-settings-key-input-row">
                    <input
                      id="api-key-input"
                      class="ai-settings-input"
                      type={showApiKey() ? 'text' : 'password'}
                      placeholder={PROVIDER_REGISTRY[state.activeCloudProvider as ProviderId]?.apiKeyPrefix ?? 'API key...'}
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
                      disabled={validatingKey()}
                    >
                      Save to memory only
                    </button>
                    <button
                      class="ai-settings-btn ai-settings-btn-secondary"
                      onClick={() => void handleEncryptAndPersist()}
                      disabled={validatingKey()}
                    >
                      Encrypt &amp; persist
                    </button>
                  </div>

                  {/* Key validation feedback */}
                  <Show when={validatingKey()}>
                    <p class="ai-settings-key-validating">Validating key...</p>
                  </Show>
                  <Show when={!validatingKey() && keyValid() === true}>
                    <p class="ai-settings-key-valid">Key valid</p>
                  </Show>
                  <Show when={!validatingKey() && keyValid() === false}>
                    <p class="ai-settings-key-invalid">Invalid key</p>
                  </Show>

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
                        Encrypted key found. Enter passphrase to unlock all stored provider keys.
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
              </Show>

              {/* Custom endpoint — feedback only (key input not needed) */}
              <Show when={state.activeCloudProvider === 'custom'}>
                <Show when={keyFeedback() !== null}>
                  <p class="ai-settings-feedback">{keyFeedback()}</p>
                </Show>
              </Show>

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
                Control which AI features are active.
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
                {/* Browser LLM row */}
                <tr>
                  <td>Browser LLM</td>
                  <td class={`status-${state.llmStatus}`}>{state.llmStatus}</td>
                  <td>{state.llmModelId ?? '—'}</td>
                </tr>
                {/* Cloud provider rows — show rows for all providers with a key set */}
                <For each={Object.values(PROVIDER_REGISTRY)}>
                  {(provider) => (
                    <Show when={
                      provider.id !== 'custom'
                        ? hasMemoryKeyForProvider(provider.id)
                        : state.customEndpointConfig !== null
                    }>
                      <tr class={state.activeCloudProvider === provider.id ? 'active-provider' : ''}>
                        <td>{provider.id === 'custom' ? (state.customEndpointConfig?.label ?? 'Custom') : provider.displayName}</td>
                        <td class={state.activeCloudProvider === provider.id ? `status-${state.cloudStatus}` : ''}>
                          {state.activeCloudProvider === provider.id
                            ? state.cloudStatus
                            : 'Key set'}
                        </td>
                        <td>
                          {state.activeCloudProvider === provider.id
                            ? (provider.id === 'custom'
                                ? state.customEndpointConfig?.model ?? '—'
                                : state.providerModels[provider.id] ?? provider.defaultModel)
                            : (provider.id === 'custom'
                                ? state.customEndpointConfig?.model ?? '—'
                                : state.providerModels[provider.id] ?? provider.defaultModel)}
                        </td>
                      </tr>
                    </Show>
                  )}
                </For>
                {/* Fallback row if no cloud keys set */}
                <Show when={
                  Object.values(PROVIDER_REGISTRY).every(p =>
                    p.id !== 'custom'
                      ? !hasMemoryKeyForProvider(p.id)
                      : state.customEndpointConfig === null
                  )
                }>
                  <tr>
                    <td>Cloud API</td>
                    <td class={`status-${state.cloudStatus}`}>{state.cloudStatus}</td>
                    <td>{PROVIDER_REGISTRY[state.activeCloudProvider as ProviderId]?.defaultModel ?? '—'}</td>
                  </tr>
                </Show>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
