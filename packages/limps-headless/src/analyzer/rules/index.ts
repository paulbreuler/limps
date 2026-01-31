/**
 * Disambiguation rules registry.
 */

import type { ComponentAnalysis } from '../../types/index.js';
import { disambiguateDialogPopover } from './dialog-popover.js';
import { disambiguateTooltipHoverCard } from './tooltip-hovercard.js';
import { disambiguateCheckboxSwitchToggle } from './checkbox-switch-toggle.js';

/**
 * Disambiguation rule function type.
 */
export type DisambiguationRule = (
  analysis: ComponentAnalysis
) => string | null;

/**
 * Disambiguation rules map.
 * Key: pair of primitives (sorted alphabetically, joined with '-')
 * Value: disambiguation function
 */
export const DISAMBIGUATION_RULES = new Map<string, DisambiguationRule>([
  ['Dialog-Popover', disambiguateDialogPopover],
  ['HoverCard-Tooltip', disambiguateTooltipHoverCard],
  ['Checkbox-Switch-Toggle', disambiguateCheckboxSwitchToggle],
]);

/**
 * Get disambiguation rule for a pair of primitives.
 */
export function getDisambiguationRule(
  primitive1: string,
  primitive2: string
): DisambiguationRule | null {
  // Sort primitives alphabetically for consistent key lookup
  const sorted = [primitive1, primitive2].sort();
  const key = sorted.join('-');

  return DISAMBIGUATION_RULES.get(key) || null;
}

/**
 * Get disambiguation rule for multiple primitives.
 * Also checks if the provided primitives are a subset of any registered rule.
 */
export function getDisambiguationRuleForGroup(
  primitives: string[]
): DisambiguationRule | null {
  // Sort primitives alphabetically for consistent key lookup
  const sorted = [...primitives].sort();
  const key = sorted.join('-');

  // Try exact match first
  const exactMatch = DISAMBIGUATION_RULES.get(key);
  if (exactMatch) {
    return exactMatch;
  }

  // Try to find a rule where the provided primitives are a subset
  // e.g., ['Checkbox', 'Switch'] should match 'Checkbox-Switch-Toggle'
  for (const [ruleKey, rule] of DISAMBIGUATION_RULES.entries()) {
    const rulePrimitives = ruleKey.split('-');
    // Check if all provided primitives are in the rule
    const allMatch = sorted.every((p) => rulePrimitives.includes(p));
    if (allMatch && sorted.length >= 2) {
      return rule;
    }
  }

  return null;
}
