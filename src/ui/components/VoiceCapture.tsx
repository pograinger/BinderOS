/**
 * VoiceCapture: Web Speech API voice-to-text with feature detection.
 *
 * LOCKED DECISION (CONTEXT.md): Voice capture via Web Speech API.
 * Mic button inside capture overlay. Graceful degradation -- hidden
 * if browser doesn't support SpeechRecognition.
 *
 * Note: Web Speech API is NOT offline -- routes audio to Google/Apple servers.
 * A small disclaimer is shown near the mic button per RESEARCH.md.
 *
 * CRITICAL: Never destructure props.
 */

import { createSignal, Show, onCleanup } from 'solid-js';

interface VoiceCaptureProps {
  onTranscript: (text: string) => void;
}

// Feature detection
function getSpeechRecognition(): (typeof SpeechRecognition) | null {
  if (typeof window === 'undefined') return null;
  const w = window as Record<string, unknown>;
  const SR = (w['SpeechRecognition'] || w['webkitSpeechRecognition']) as (typeof SpeechRecognition) | undefined;
  return SR ?? null;
}

function hasSpeechRecognition(): boolean {
  return getSpeechRecognition() !== null;
}

export function VoiceCapture(props: VoiceCaptureProps) {
  const [available] = createSignal(hasSpeechRecognition());
  const [recording, setRecording] = createSignal(false);
  const [interim, setInterim] = createSignal('');
  const [error, setError] = createSignal<string | null>(null);

  let recognition: SpeechRecognition | null = null;

  const startRecording = () => {
    const SRClass = getSpeechRecognition();
    if (!SRClass) return;
    setError(null);

    recognition = new SRClass();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimText = '';
      let finalText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result) {
          const transcript = result[0]?.transcript ?? '';
          if (result.isFinal) {
            finalText += transcript;
          } else {
            interimText += transcript;
          }
        }
      }

      setInterim(interimText);

      if (finalText) {
        props.onTranscript(finalText);
        setInterim('');
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'not-allowed') {
        setError('Microphone access required. Please allow microphone permission.');
      } else if (event.error === 'no-speech') {
        setError('No speech detected. Try again.');
      } else {
        setError(`Voice error: ${event.error}`);
      }
      setRecording(false);
    };

    recognition.onend = () => {
      setRecording(false);
      setInterim('');
    };

    recognition.start();
    setRecording(true);
  };

  const stopRecording = () => {
    if (recognition) {
      recognition.stop();
      recognition = null;
    }
    setRecording(false);
  };

  const toggleRecording = () => {
    if (recording()) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  onCleanup(() => {
    if (recognition) {
      recognition.abort();
      recognition = null;
    }
  });

  // If Web Speech API is not available, render nothing (graceful degradation)
  return (
    <Show when={available()}>
    <div class="voice-capture">
      <button
        class={`voice-btn${recording() ? ' recording' : ''}`}
        onClick={toggleRecording}
        title={recording() ? 'Stop recording' : 'Start voice capture'}
        type="button"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
        </svg>
      </button>

      <Show when={interim()}>
        <div class="voice-interim">{interim()}</div>
      </Show>

      <Show when={error()}>
        <div class="voice-error">{error()}</div>
      </Show>

      <Show when={recording()}>
        <div class="voice-disclaimer">Voice sent to browser speech service</div>
      </Show>
    </div>
    </Show>
  );
}
