/**
 * AIGuidedSetup — First-run setup wizard for AI features.
 *
 * Shown when state.aiFirstRunComplete === false.
 * Shell.tsx renders this overlay, which disappears after onComplete() is called.
 *
 * Steps:
 *   0: Welcome — Enable AI or skip
 *   1: Local AI Model — Choose Fast or Quality model (with WebGPU detection)
 *   2: Cloud API — Enter API key (optional)
 *   3: Done — Summary + Start using BinderOS
 *
 * CRITICAL: Never destructure props or state — breaks SolidJS reactivity.
 */

import { createSignal, Show, Index } from 'solid-js';
import {
  setAIEnabled,
  setBrowserLLMEnabled,
  setCloudAPIEnabled,
  setAIFirstRunComplete,
} from '../signals/store';
import { setMemoryKey } from '../../ai/key-vault';

interface AIGuidedSetupProps {
  onComplete: () => void;
}

export function AIGuidedSetup(props: AIGuidedSetupProps) {
  const [step, setStep] = createSignal(0);
  const [selectedModel, setSelectedModel] = createSignal<'fast' | 'quality' | null>(null);
  const [apiKeyInput, setApiKeyInput] = createSignal('');
  const [keySaved, setKeySaved] = createSignal(false);
  const [aiEnabled, setAIEnabledLocal] = createSignal(false);

  // Detect WebGPU availability to recommend the right model
  const hasWebGPU = 'gpu' in navigator;

  function handleEnableAI() {
    setAIEnabled(true);
    setAIEnabledLocal(true);
    setStep(1);
  }

  function handleSkipSetup() {
    setAIFirstRunComplete(true);
    props.onComplete();
  }

  function handleModelSelect(model: 'fast' | 'quality') {
    setSelectedModel(model);
  }

  function handleDownloadAndContinue() {
    if (selectedModel()) {
      setBrowserLLMEnabled(true);
      // Phase 4: actual model download triggers when BrowserAdapter.initialize() is called
      // Store signals trigger BrowserAdapter init in Shell.tsx createEffect (Phase 5+)
    }
    setStep(2);
  }

  function handleSkipLocalAI() {
    setStep(2);
  }

  function handleSaveApiKey() {
    const key = apiKeyInput().trim();
    if (key) {
      setMemoryKey(key);
      setCloudAPIEnabled(true);
      setKeySaved(true);
    }
  }

  function handleContinueFromCloud() {
    setStep(3);
  }

  function handleSkipCloud() {
    setStep(3);
  }

  function handleComplete() {
    setAIFirstRunComplete(true);
    props.onComplete();
  }

  return (
    <div class="ai-guided-setup-backdrop">
      <div class="ai-guided-setup-container" role="dialog" aria-modal="true">
        {/* Step 0: Welcome */}
        <Show when={step() === 0}>
          <div class="ai-guided-setup-step">
            <div class="ai-guided-setup-icon">AI</div>
            <h2 class="ai-guided-setup-title">BinderOS AI</h2>
            <p class="ai-guided-setup-desc">
              BinderOS AI is ready to help with triage, reviews, and organization.
            </p>
            <p class="ai-guided-setup-desc ai-guided-setup-note">
              AI features are optional and off by default. You can configure everything
              in AI Settings at any time.
            </p>
            <div class="ai-guided-setup-actions">
              <button
                class="ai-guided-setup-btn ai-guided-setup-btn-primary"
                onClick={handleEnableAI}
              >
                Enable AI
              </button>
              <button
                class="ai-guided-setup-btn ai-guided-setup-btn-secondary"
                onClick={handleSkipSetup}
              >
                Skip for now
              </button>
            </div>
          </div>
        </Show>

        {/* Step 1: Local AI Model */}
        <Show when={step() === 1}>
          <div class="ai-guided-setup-step">
            <h2 class="ai-guided-setup-title">Choose your local AI model</h2>
            <p class="ai-guided-setup-desc">
              This runs entirely on your device — no data leaves your machine.
            </p>

            <div class="ai-guided-setup-model-cards">
              {/* Fast model */}
              <button
                class={`ai-guided-setup-model-card${selectedModel() === 'fast' ? ' selected' : ''}${!hasWebGPU ? ' recommended' : ''}`}
                onClick={() => handleModelSelect('fast')}
              >
                <div class="ai-model-card-title">
                  Fast
                  {!hasWebGPU && (
                    <span class="ai-model-card-badge">Recommended</span>
                  )}
                </div>
                <div class="ai-model-card-size">~150 MB</div>
                <div class="ai-model-card-desc">
                  Smaller model, works on any device. Great for triage and quick suggestions.
                </div>
              </button>

              {/* Quality model */}
              <button
                class={`ai-guided-setup-model-card${selectedModel() === 'quality' ? ' selected' : ''}${hasWebGPU ? ' recommended' : ''}`}
                onClick={() => handleModelSelect('quality')}
              >
                <div class="ai-model-card-title">
                  Quality
                  {hasWebGPU && (
                    <span class="ai-model-card-badge">Recommended</span>
                  )}
                </div>
                <div class="ai-model-card-size">~300 MB</div>
                <div class="ai-model-card-desc">
                  Larger model, requires GPU. Better for complex review analysis.
                </div>
              </button>
            </div>

            <div class="ai-guided-setup-actions">
              <button
                class="ai-guided-setup-btn ai-guided-setup-btn-primary"
                onClick={handleDownloadAndContinue}
                disabled={selectedModel() === null}
              >
                Download &amp; Continue
              </button>
              <button
                class="ai-guided-setup-btn ai-guided-setup-btn-secondary"
                onClick={handleSkipLocalAI}
              >
                Skip local AI
              </button>
            </div>
          </div>
        </Show>

        {/* Step 2: Cloud API */}
        <Show when={step() === 2}>
          <div class="ai-guided-setup-step">
            <h2 class="ai-guided-setup-title">Connect cloud AI (optional)</h2>
            <p class="ai-guided-setup-desc">
              Connect an Anthropic API key for deeper analysis during reviews.
            </p>
            <p class="ai-guided-setup-desc ai-guided-setup-note">
              Your data is always filtered through the local AI first — cloud models
              never see raw data. You will be shown exactly what is sent before each request.
            </p>

            <div class="ai-guided-setup-key-section">
              <label class="ai-guided-setup-field-label" for="setup-api-key">
                Anthropic API Key
              </label>
              <input
                id="setup-api-key"
                class="ai-guided-setup-input"
                type="password"
                placeholder="sk-ant-..."
                value={apiKeyInput()}
                onInput={(e) => setApiKeyInput((e.target as HTMLInputElement).value)}
                autocomplete="off"
              />
              <button
                class="ai-guided-setup-btn ai-guided-setup-btn-secondary"
                onClick={handleSaveApiKey}
                disabled={!apiKeyInput().trim()}
              >
                Save key
              </button>
              <Show when={keySaved()}>
                <p class="ai-guided-setup-saved">Key saved to memory.</p>
              </Show>
            </div>

            <p class="ai-guided-setup-disclosure">
              Memory-only: key is cleared when you close the app. You can set up
              encrypted persistence in AI Settings.
            </p>

            <div class="ai-guided-setup-actions">
              <button
                class="ai-guided-setup-btn ai-guided-setup-btn-primary"
                onClick={handleContinueFromCloud}
              >
                Continue
              </button>
              <button
                class="ai-guided-setup-btn ai-guided-setup-btn-secondary"
                onClick={handleSkipCloud}
              >
                Skip
              </button>
            </div>
          </div>
        </Show>

        {/* Step 3: Done */}
        <Show when={step() === 3}>
          <div class="ai-guided-setup-step">
            <div class="ai-guided-setup-icon">Ready</div>
            <h2 class="ai-guided-setup-title">You are all set</h2>

            <div class="ai-guided-setup-summary">
              <Show when={aiEnabled()}>
                <div class="ai-summary-item ai-summary-enabled">AI features: Enabled</div>
              </Show>
              <Show when={selectedModel() !== null}>
                <div class="ai-summary-item">
                  Local AI model: {selectedModel() === 'fast' ? 'Fast (~150 MB)' : 'Quality (~300 MB)'}
                </div>
              </Show>
              <Show when={keySaved()}>
                <div class="ai-summary-item">Cloud API: Configured (memory-only)</div>
              </Show>
              <Show when={!aiEnabled()}>
                <div class="ai-summary-item ai-summary-disabled">
                  AI features are off. Enable them anytime in Ctrl+P &gt; AI Settings.
                </div>
              </Show>
            </div>

            <div class="ai-guided-setup-actions">
              <button
                class="ai-guided-setup-btn ai-guided-setup-btn-primary"
                onClick={handleComplete}
              >
                Start using BinderOS
              </button>
            </div>
          </div>
        </Show>

        {/* Step indicator */}
        <div class="ai-guided-setup-steps-indicator">
          <Index each={[0, 1, 2, 3]}>
            {(i) => (
              <div
                class={`ai-guided-setup-step-dot${step() === i() ? ' active' : step() > i() ? ' done' : ''}`}
              />
            )}
          </Index>
        </div>
      </div>
    </div>
  );
}
