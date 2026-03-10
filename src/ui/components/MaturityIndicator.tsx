/**
 * MaturityIndicator: Circular SVG progress ring for inbox item maturity.
 *
 * Shows enrichment completeness as a 0-1 score using stroke-dasharray technique.
 * Color transitions: amber (low) -> yellow (mid) -> green (high).
 *
 * CRITICAL: Never destructure props. Use props.score, props.size, etc.
 */

interface MaturityIndicatorProps {
  score: number;
  size?: number;
  filled?: string[];
}

export function MaturityIndicator(props: MaturityIndicatorProps) {
  const s = () => props.size ?? 20;
  const strokeW = () => Math.max(2, s() * 0.12);
  const radius = () => (s() - strokeW()) / 2;
  const circumference = () => 2 * Math.PI * radius();
  const half = () => s() / 2;

  const dashOffset = () => circumference() * (1 - Math.min(1, Math.max(0, props.score)));

  const color = () => {
    const sc = props.score;
    if (sc >= 0.7) return '#22c55e';
    if (sc >= 0.3) return '#eab308';
    return '#f59e0b';
  };

  const pct = () => Math.round(props.score * 100);
  const showText = () => s() >= 28;

  return (
    <svg
      width={s()}
      height={s()}
      viewBox={`0 0 ${s()} ${s()}`}
      role="progressbar"
      aria-valuenow={pct()}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={
        props.filled && props.filled.length > 0
          ? `Maturity ${pct()}%: ${props.filled.join(', ')}`
          : `Maturity ${pct()}%`
      }
      style={{ display: 'inline-block', 'vertical-align': 'middle' }}
    >
      {/* Background ring */}
      <circle
        cx={half()}
        cy={half()}
        r={radius()}
        fill="none"
        stroke="var(--surface-3, #333)"
        stroke-width={strokeW()}
      />

      {/* Progress ring */}
      <circle
        cx={half()}
        cy={half()}
        r={radius()}
        fill="none"
        stroke={color()}
        stroke-width={strokeW()}
        stroke-dasharray={String(circumference())}
        stroke-dashoffset={String(dashOffset())}
        stroke-linecap="round"
        transform={`rotate(-90 ${half()} ${half()})`}
        style={{ transition: 'stroke-dashoffset 0.4s ease, stroke 0.3s ease' }}
      />

      {/* Center percentage text */}
      {showText() && (
        <text
          x={half()}
          y={half()}
          text-anchor="middle"
          dominant-baseline="central"
          fill="var(--text-1, #e0e0e0)"
          font-size={String(s() * 0.32)}
          font-weight="600"
        >
          {pct()}%
        </text>
      )}
    </svg>
  );
}
