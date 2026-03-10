/**
 * ThreeRingIndicator: 4 concentric SVG ring visualization of AI provenance.
 *
 * Each ring represents a tier in the 3-Ring Binder AI pipeline:
 *   Inner  -> T1 Deterministic (blue #58a6ff)
 *   Mid-in -> T2A ONNX (green #3fb950)
 *   Mid-out-> T2B WASM LLM (light green #7ee787)
 *   Outer  -> T3 Cloud (purple #bc8cff)
 *
 * Provenance is a bitmask; each bit indicates a tier was used.
 * When provenance === 0, all rings show at 0.25 opacity (unprocessed).
 *
 * CRITICAL: Never destructure props. Use props.provenance, props.size, etc.
 */

// Stub for getTiersUsed / getModelNames until Plan 01 creates provenance.ts.
// Once src/ai/enrichment/provenance.ts exists, replace stubs with real import:
//   import { getTiersUsed, getModelNames } from '../../ai/enrichment/provenance';

function getTiersUsed(bitmask: number): { t1: boolean; t2a: boolean; t2b: boolean; t3: boolean } {
  return {
    t1: (bitmask & 1) !== 0,
    t2a: (bitmask & 2) !== 0,
    t2b: (bitmask & 4) !== 0,
    t3: (bitmask & 8) !== 0,
  };
}

function getModelNames(bitmask: number): string[] {
  const names: string[] = [];
  if (bitmask & 1) names.push('T1 Deterministic');
  if (bitmask & 2) names.push('T2A ONNX');
  if (bitmask & 4) names.push('T2B WASM LLM');
  if (bitmask & 8) names.push('T3 Cloud');
  return names;
}

interface ThreeRingProps {
  provenance: number;
  size?: number;
  onTap?: () => void;
  showLabels?: boolean;
}

interface RingConfig {
  label: string;
  radiusFraction: number;
  color: string;
  active: boolean;
}

export function ThreeRingIndicator(props: ThreeRingProps) {
  const s = () => props.size ?? 24;
  const half = () => s() / 2;
  const strokeW = () => s() * 0.06;

  const tiers = () => getTiersUsed(props.provenance);

  const rings = (): RingConfig[] => {
    const t = tiers();
    return [
      { label: 'T1 Deterministic', radiusFraction: 0.18, color: '#58a6ff', active: t.t1 },
      { label: 'T2A ONNX',        radiusFraction: 0.30, color: '#3fb950', active: t.t2a },
      { label: 'T2B WASM LLM',    radiusFraction: 0.34, color: '#7ee787', active: t.t2b },
      { label: 'T3 Cloud',        radiusFraction: 0.44, color: '#bc8cff', active: t.t3 },
    ];
  };

  const ariaLabel = () => {
    const names = getModelNames(props.provenance);
    if (names.length === 0) return 'AI provenance: no tiers active';
    return `AI provenance: ${names.join(', ')}`;
  };

  const handlePointerDown = (e: PointerEvent) => {
    e.stopPropagation();
    props.onTap?.();
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <svg
        width={s()}
        height={s()}
        viewBox={`0 0 ${s()} ${s()}`}
        role="img"
        aria-label={ariaLabel()}
        onPointerDown={handlePointerDown}
        style={{ cursor: props.onTap ? 'pointer' : 'default', display: 'block' }}
      >
        {rings().map((ring) => (
          <circle
            cx={half()}
            cy={half()}
            r={s() * ring.radiusFraction}
            fill="none"
            stroke={ring.active ? ring.color : 'var(--surface-3, #333)'}
            stroke-width={strokeW()}
            opacity={ring.active ? 1 : 0.25}
            style={{ transition: 'stroke 0.3s ease, opacity 0.3s ease' }}
          />
        ))}
      </svg>

      {props.showLabels && (
        <div
          style={{
            position: 'absolute',
            top: `${s() + 4}px`,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--surface-2, #1e1e1e)',
            border: '1px solid var(--surface-3, #333)',
            'border-radius': '6px',
            padding: '4px 8px',
            'font-size': '11px',
            'white-space': 'nowrap',
            'z-index': '10',
            color: 'var(--text-1, #e0e0e0)',
          }}
        >
          {getModelNames(props.provenance).length === 0
            ? 'No tiers active'
            : getModelNames(props.provenance).map((name) => <div>{name}</div>)}
        </div>
      )}
    </div>
  );
}
