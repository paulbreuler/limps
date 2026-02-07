/**
 * Migration hints for contract changes.
 */

import type { ChangeType } from './types.js';

/**
 * Template-based migration hints for different change types.
 */
const HINT_TEMPLATES: Record<ChangeType, string> = {
  prop_removed: 'Remove usage of the "{target}" prop. {extra}',
  prop_required: 'The "{target}" prop is now required. Add an explicit value for this prop.',
  subcomponent_removed: 'The "{target}" sub-component has been removed. {extra}',
  type_narrowed:
    'The type for "{target}" has been narrowed from "{before}" to "{after}". Update values to match the new type.',
  prop_deprecated: 'The "{target}" prop is deprecated. {extra}',
  type_changed:
    'The type for "{target}" has changed from "{before}" to "{after}". Review and update values accordingly.',
  default_changed:
    'The default value for "{target}" has changed from "{before}" to "{after}". Verify behavior is still as expected.',
  prop_added: 'New prop "{target}" is available with type "{after}".',
  subcomponent_added: 'New sub-component "{target}" is now available.',
  type_widened:
    'The type for "{target}" has been widened from "{before}" to "{after}". No changes required.',
};

/**
 * Special case hints for known prop changes.
 */
const KNOWN_PROP_HINTS: Record<string, Record<string, string>> = {
  // Dialog-specific hints
  allowPinchZoom: {
    prop_removed: 'Use CSS touch-action property instead.',
  },
  // Popover/Tooltip positioning
  side: {
    type_narrowed: 'If using a removed side value, choose from the available options.',
  },
  align: {
    type_narrowed: 'If using a removed align value, choose from the available options.',
  },
  // Common deprecations
  asChild: {
    prop_deprecated: 'Consider migrating to the new composition pattern if available.',
  },
};

/**
 * Hints for removed sub-components.
 */
const SUBCOMPONENT_HINTS: Record<string, string> = {
  Portal: 'Portaling behavior may have changed. Check the component documentation.',
  Overlay: 'Consider using the Content component with overlay styling.',
  Close: 'Use the onOpenChange callback to handle closing behavior.',
};

interface HintContext {
  target: string;
  before?: string | null;
  after?: string | null;
  primitive?: string;
  subComponent?: string;
}

/**
 * Generate a migration hint for a change.
 */
export function generateHint(changeType: ChangeType, context: HintContext): string {
  const template = HINT_TEMPLATES[changeType];

  // Check for known prop-specific hints
  const propHints = KNOWN_PROP_HINTS[context.target];
  const specificHint = propHints?.[changeType];

  // For sub-component changes, check subcomponent hints
  let extra = '';
  if (
    (changeType === 'subcomponent_removed' || changeType === 'prop_removed') &&
    SUBCOMPONENT_HINTS[context.target]
  ) {
    extra = SUBCOMPONENT_HINTS[context.target];
  } else if (specificHint) {
    extra = specificHint;
  }

  // Replace template variables
  return template
    .replace('{target}', context.target)
    .replace('{before}', context.before ?? '')
    .replace('{after}', context.after ?? '')
    .replace('{extra}', extra)
    .replace(/\s+$/, ''); // Trim trailing space if no extra
}

/**
 * Generate a description for a change.
 */
export function generateDescription(changeType: ChangeType, context: HintContext): string {
  const location = context.subComponent
    ? `${context.primitive}.${context.subComponent}`
    : context.primitive || '';

  const prefix = location ? `[${location}] ` : '';

  switch (changeType) {
    case 'prop_removed':
      return `${prefix}Prop '${context.target}' was removed`;
    case 'prop_required':
      return `${prefix}Prop '${context.target}' is now required (was optional)`;
    case 'subcomponent_removed':
      return `${prefix}Sub-component '${context.target}' was removed`;
    case 'type_narrowed':
      return `${prefix}Type for '${context.target}' was narrowed from '${context.before}' to '${context.after}'`;
    case 'prop_deprecated':
      return `${prefix}Prop '${context.target}' is deprecated`;
    case 'type_changed':
      return `${prefix}Type for '${context.target}' changed from '${context.before}' to '${context.after}'`;
    case 'default_changed':
      return `${prefix}Default value for '${context.target}' changed from '${context.before}' to '${context.after}'`;
    case 'prop_added':
      return `${prefix}New prop '${context.target}' was added`;
    case 'subcomponent_added':
      return `${prefix}New sub-component '${context.target}' was added`;
    case 'type_widened':
      return `${prefix}Type for '${context.target}' was widened from '${context.before}' to '${context.after}'`;
    default:
      return `${prefix}Unknown change to '${context.target}'`;
  }
}
