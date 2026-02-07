/**
 * Semantic prop classifier.
 * Classifies props into categories: state, event, config, composition.
 */

import type { PropDefinition, RawProp } from '../types/index.js';

/**
 * State control props - control component state
 */
const STATE_PROPS = new Set([
  'open',
  'defaultOpen',
  'value',
  'defaultValue',
  'checked',
  'defaultChecked',
  'pressed',
  'defaultPressed',
  'selected',
  'defaultSelected',
  'active',
  'expanded',
  'disabled',
]);

/**
 * State prop patterns
 */
const STATE_PATTERNS = [/^default[A-Z]/, /^is[A-Z]/];

/**
 * Event handler pattern - onXxx
 */
const EVENT_PATTERN = /^on[A-Z]/;

/**
 * Composition props - affect component composition
 */
const COMPOSITION_PROPS = new Set(['asChild', 'children', 'as', 'render', 'slot']);

/**
 * Configuration props - affect behavior/appearance
 */
const CONFIG_PROPS = new Set([
  // Layout/positioning
  'modal',
  'side',
  'sideOffset',
  'align',
  'alignOffset',
  'orientation',
  'dir',
  'loop',
  'sticky',
  'hideWhenDetached',
  'avoidCollisions',
  'collisionBoundary',
  'collisionPadding',

  // Behavior
  'closeOnEscape',
  'closeOnOutsideClick',
  'closeOnInteractOutside',
  'trapFocus',
  'restoreFocus',
  'preventScroll',
  'disableOutsidePointerEvents',
  'forceMount',
  'delayDuration',
  'skipDelayDuration',
  'disableHoverableContent',

  // Accessibility
  'ariaLabel',
  'aria-label',
  'ariaLabelledby',
  'aria-labelledby',
  'ariaDescribedby',
  'aria-describedby',

  // Styling
  'className',
  'style',

  // Other common configs
  'id',
  'name',
  'required',
  'placeholder',
  'min',
  'max',
  'step',
  'type',
  'form',
]);

/**
 * Classify a raw prop into a full PropDefinition.
 */
export function classifyProp(raw: RawProp): PropDefinition {
  return {
    ...raw,
    isStateControl: isStateControl(raw.name),
    isEventHandler: isEventHandler(raw.name),
    isConfiguration: isConfiguration(raw.name),
    isComposition: isComposition(raw.name),
  };
}

/**
 * Check if a prop name indicates state control.
 */
export function isStateControl(name: string): boolean {
  if (STATE_PROPS.has(name)) {
    return true;
  }

  for (const pattern of STATE_PATTERNS) {
    if (pattern.test(name)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a prop name indicates an event handler.
 */
export function isEventHandler(name: string): boolean {
  return EVENT_PATTERN.test(name);
}

/**
 * Check if a prop name indicates composition.
 */
export function isComposition(name: string): boolean {
  return COMPOSITION_PROPS.has(name);
}

/**
 * Check if a prop name indicates configuration.
 */
export function isConfiguration(name: string): boolean {
  return CONFIG_PROPS.has(name);
}

/**
 * Get the category of a prop.
 */
export function getPropCategory(
  name: string
): 'state' | 'event' | 'composition' | 'config' | 'other' {
  if (isStateControl(name)) return 'state';
  if (isEventHandler(name)) return 'event';
  if (isComposition(name)) return 'composition';
  if (isConfiguration(name)) return 'config';
  return 'other';
}
