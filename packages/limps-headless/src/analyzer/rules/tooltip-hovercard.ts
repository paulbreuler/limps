/**
 * Disambiguation rule for Tooltip vs HoverCard.
 */

import type { ComponentAnalysis } from '../../types/index.js';

/**
 * Disambiguate between Tooltip and HoverCard.
 * Returns the preferred primitive or null if cannot disambiguate.
 */
export function disambiguateTooltipHoverCard(
  analysis: ComponentAnalysis
): 'Tooltip' | 'HoverCard' | null {
  const props = analysis.propsInterface;

  // Tooltip: has delayDuration prop (common naming)
  if (props.has('delayDuration')) {
    return 'Tooltip';
  }

  // HoverCard: has openDelay prop (common naming)
  if (props.has('openDelay')) {
    return 'HoverCard';
  }

  // Cannot disambiguate
  return null;
}
