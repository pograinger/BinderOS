/**
 * AtomTypeIcon: Colored inline SVG icon for each atom type.
 *
 * Uses signature colors from theme/colors.ts:
 *   task: checkmark (blue #58a6ff)
 *   fact: book (green #3fb950)
 *   event: calendar (amber #d29922)
 *   decision: compass (purple #bc8cff)
 *   insight: lightbulb (pink #f778ba)
 *
 * CRITICAL: Never destructure props. Use props.type, props.size.
 */

import { getAtomColor } from '../theme/colors';

interface AtomTypeIconProps {
  type: string;
  size?: number;
}

export function AtomTypeIcon(props: AtomTypeIconProps) {
  const s = () => props.size ?? 18;
  const color = () => getAtomColor(props.type);

  const iconPath = (): string => {
    switch (props.type) {
      case 'task':
        // Checkmark
        return 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z';
      case 'fact':
        // Book
        return 'M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z';
      case 'event':
        // Calendar
        return 'M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-2 .9-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2zm0 16H5V8h14v11zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z';
      case 'decision':
        // Compass
        return 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5.5-2.5l7.51-3.49L17.5 6.5 9.99 9.99 6.5 17.5zm5.5-6.6c.61 0 1.1.49 1.1 1.1s-.49 1.1-1.1 1.1-1.1-.49-1.1-1.1.49-1.1 1.1-1.1z';
      case 'insight':
        // Lightbulb
        return 'M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z';
      default:
        // Circle fallback
        return 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z';
    }
  };

  return (
    <svg
      width={s()}
      height={s()}
      viewBox="0 0 24 24"
      fill={color()}
      style={{ "flex-shrink": "0", display: "inline-block", "vertical-align": "middle" }}
    >
      <path d={iconPath()} />
    </svg>
  );
}
