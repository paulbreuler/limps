/**
 * Disambiguation rule for Dialog vs Popover.
 */

import type { ComponentAnalysis } from '../../types/index.js';

/**
 * Disambiguate between Dialog and Popover.
 * Returns the preferred primitive or null if cannot disambiguate.
 */
export function disambiguateDialogPopover(
  analysis: ComponentAnalysis
): 'Dialog' | 'Popover' | null {
  const props = analysis.propsInterface;

  // Dialog: has modal prop
  if (props.has('modal')) {
    return 'Dialog';
  }

  // Dialog: has Overlay sub-component
  if (analysis.subComponents.includes('Overlay')) {
    return 'Dialog';
  }

  // Popover: has side or align props (positioning props)
  if (props.has('side') || props.has('align')) {
    return 'Popover';
  }

  // Cannot disambiguate
  return null;
}
