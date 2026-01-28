/**
 * Global color theme following Radix color principles.
 *
 * Radix-inspired palette:
 * - Neutral grays for text hierarchy
 * - Semantic colors for status/meaning
 * - Consistent contrast ratios
 */

/**
 * Text color roles following Radix principles.
 * Radix uses scales 1-12 where higher numbers are lighter.
 * For terminal, we map to available Ink/chalk colors.
 */
export const textColors = {
  /** Primary text - highest contrast (Radix gray 12) */
  primary: 'white',
  /** Secondary text - medium contrast, readable (Radix gray 9-10) */
  secondary: undefined as string | undefined, // Use dimColor prop instead
  /** Muted text - lower contrast for less important info (Radix gray 7-8) */
  muted: 'gray',
} as const;

/**
 * Semantic status colors following Radix palette.
 * Radix recommends:
 * - Success: green/teal
 * - Warning: yellow/amber
 * - Error: red/ruby
 * - Info: blue/indigo
 */
export const statusColors = {
  /** Success/Complete status */
  success: 'green',
  /** Warning/In Progress status */
  warning: 'yellow',
  /** Error/Blocked status */
  error: 'red',
  /** Info/Neutral status */
  info: 'blue',
  /** Default/Unknown status */
  default: 'white',
} as const;

/**
 * Work type colors following Radix semantic approach.
 */
export const workTypeColors = {
  feature: 'cyan', // Info variant
  bug: 'red', // Error variant
  refactor: 'yellow', // Warning variant
  docs: 'blue', // Info
  unknown: 'gray', // Muted
} as const;

/**
 * Get status color based on status value.
 */
export function getStatusColor(status: 'GAP' | 'WIP' | 'PASS' | 'BLOCKED'): string {
  switch (status) {
    case 'PASS':
      return statusColors.success;
    case 'WIP':
      return statusColors.warning;
    case 'BLOCKED':
      return statusColors.error;
    case 'GAP':
    default:
      return statusColors.default;
  }
}

/**
 * Get work type color.
 */
export function getWorkTypeColor(
  workType: 'feature' | 'bug' | 'refactor' | 'docs' | 'unknown'
): string {
  return workTypeColors[workType];
}

/**
 * Get score color based on percentage (for progress indicators).
 */
export function getScoreColor(score: number, max: number): string {
  const percentage = (score / max) * 100;
  if (percentage >= 80) return statusColors.success;
  if (percentage >= 50) return statusColors.warning;
  return statusColors.error;
}
