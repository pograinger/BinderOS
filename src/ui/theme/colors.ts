/**
 * BinderOS dark theme color palette.
 *
 * Inspired by Warp terminal's command-center aesthetic (#0d1117 base).
 * Distinct vibrant colors per atom type for instant visual identification.
 *
 * All colors are defined here and mapped to CSS custom properties
 * in layout.css via var(--color-name) references.
 */

export const theme = {
  // Background colors
  bgPrimary: '#0d1117',
  bgSecondary: '#161b22',
  bgTertiary: '#21262d',

  // Border / divider
  borderPrimary: '#30363d',
  borderSecondary: '#484f58',

  // Text
  textPrimary: '#e6edf3',
  textSecondary: '#8b949e',
  textMuted: '#484f58',

  // Atom type signature colors (vibrant against dark bg)
  atomTask: '#58a6ff',       // blue
  atomFact: '#3fb950',       // green
  atomEvent: '#d29922',      // amber
  atomDecision: '#bc8cff',   // purple
  atomInsight: '#f778ba',    // pink

  // Status colors
  statusSuccess: '#3fb950',
  statusWarning: '#d29922',
  statusError: '#f85149',

  // Accent
  accent: '#58a6ff',
} as const;

/**
 * Priority tier colors mapped per tier.
 * Chosen to complement the dark theme and not clash with atom type colors.
 */
export const tierColors = {
  Critical: '#f85149', // red — highest urgency
  High:     '#d29922', // amber — elevated
  Medium:   '#58a6ff', // blue — standard
  Low:      '#8b949e', // muted grey — background noise
  Someday:  '#484f58', // dim — far horizon
} as const;

/**
 * Entropy health level colors.
 */
export const entropyColors = {
  green:  '#3fb950',
  yellow: '#d29922',
  red:    '#f85149',
} as const;

/**
 * Get the signature color for an atom type.
 */
export function getAtomColor(type: string): string {
  switch (type) {
    case 'task': return theme.atomTask;
    case 'fact': return theme.atomFact;
    case 'event': return theme.atomEvent;
    case 'decision': return theme.atomDecision;
    case 'insight': return theme.atomInsight;
    default: return theme.textSecondary;
  }
}
