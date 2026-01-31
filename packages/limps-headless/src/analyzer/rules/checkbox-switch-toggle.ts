/**
 * Disambiguation rule for Checkbox vs Switch vs Toggle.
 */

import type { ComponentAnalysis } from '../../types/index.js';

/**
 * Disambiguate between Checkbox, Switch, and Toggle.
 * Returns the preferred primitive or null if cannot disambiguate.
 */
export function disambiguateCheckboxSwitchToggle(
  analysis: ComponentAnalysis
): 'Checkbox' | 'Switch' | 'Toggle' | null {
  const props = analysis.propsInterface;
  const subComponents = analysis.subComponents;

  // Switch: has Thumb sub-component (distinctive)
  if (subComponents.includes('Thumb')) {
    return 'Switch';
  }

  // Toggle: has pressed state (distinctive)
  if (props.has('pressed') || props.has('defaultPressed')) {
    return 'Toggle';
  }

  // Checkbox: has checked state (but not pressed)
  if (props.has('checked') || props.has('defaultChecked')) {
    return 'Checkbox';
  }

  // Cannot disambiguate
  return null;
}
