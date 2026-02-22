import { createSignal, onMount } from 'solid-js';

/**
 * BinderOS root component — placeholder.
 * Plan 01-03 builds the real shell.
 * Calls initWorker() on mount to prove the full chain:
 * App -> Bridge -> Worker -> WASM -> Worker -> Bridge -> App
 */
function App() {
  const [wasmVersion, setWasmVersion] = createSignal<string>('initializing...');
  const [error, setError] = createSignal<string | null>(null);

  onMount(async () => {
    try {
      const { initWorker } = await import('./worker/bridge');
      const response = await initWorker();
      if (response.type === 'READY') {
        setWasmVersion(response.payload.version);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setWasmVersion('unavailable');
    }
  });

  return (
    <div
      style={{
        'background-color': '#0d1117',
        color: '#c9d1d9',
        'min-height': '100vh',
        display: 'flex',
        'flex-direction': 'column',
        'align-items': 'center',
        'justify-content': 'center',
        'font-family': 'system-ui, sans-serif',
      }}
    >
      <h1 style={{ 'font-size': '2rem', margin: '0 0 0.5rem' }}>BinderOS</h1>
      <p style={{ color: '#8b949e', margin: '0 0 1rem' }}>Local-first personal information management</p>
      <div
        style={{
          background: '#161b22',
          border: '1px solid #30363d',
          'border-radius': '6px',
          padding: '12px 20px',
          'font-size': '0.85rem',
          color: '#8b949e',
        }}
      >
        {error() ? (
          <span style={{ color: '#f85149' }}>Worker error: {error()}</span>
        ) : (
          <span>
            WASM core: <strong style={{ color: '#58a6ff' }}>{wasmVersion()}</strong>
          </span>
        )}
      </div>
    </div>
  );
}

export default App;
