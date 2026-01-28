/**
 * Disambiguation rules for similar Radix primitives.
 * Helps differentiate between primitives with similar APIs.
 */

/**
 * Groups of primitives that are similar and may be confused.
 * Each group maps a primitive to its similar alternatives.
 */
const SIMILARITY_GROUPS: Record<string, string[]> = {
  // Modal/Overlay patterns
  Dialog: ['AlertDialog', 'Popover', 'Tooltip', 'HoverCard'],
  AlertDialog: ['Dialog'],
  Popover: ['Tooltip', 'HoverCard', 'Dialog'],
  Tooltip: ['Popover', 'HoverCard'],
  HoverCard: ['Tooltip', 'Popover'],

  // Menu patterns
  DropdownMenu: ['ContextMenu', 'Select', 'Menubar'],
  ContextMenu: ['DropdownMenu'],
  Menubar: ['DropdownMenu', 'NavigationMenu'],
  NavigationMenu: ['Menubar'],

  // Selection patterns
  Select: ['DropdownMenu', 'Combobox'],
  Combobox: ['Select'],
  RadioGroup: ['ToggleGroup', 'Select'],
  ToggleGroup: ['RadioGroup'],

  // Toggle patterns
  Checkbox: ['Switch', 'Toggle'],
  Switch: ['Checkbox', 'Toggle'],
  Toggle: ['Checkbox', 'Switch'],

  // Structure patterns
  Tabs: ['Accordion'],
  Accordion: ['Tabs', 'Collapsible'],
  Collapsible: ['Accordion'],
};

/**
 * Human-readable disambiguation rules.
 * Explains how to distinguish this primitive from similar ones.
 */
const DISAMBIGUATION_RULES: Record<string, string> = {
  Dialog:
    'Dialog has a modal prop and Overlay sub-component. Unlike AlertDialog, it does not have Action/Cancel buttons.',
  AlertDialog:
    'AlertDialog has Action and Cancel button components. Unlike Dialog, it does not have a modal prop (always modal).',

  Popover:
    'Popover has side/align/sideOffset/alignOffset positioning props. Unlike Tooltip, it requires explicit triggering (no hover).',
  Tooltip:
    'Tooltip has delayDuration and skipDelayDuration for hover timing. Unlike Popover, it activates on hover.',
  HoverCard:
    'HoverCard has openDelay and closeDelay props. Similar to Tooltip but designed for richer hover content.',

  DropdownMenu:
    'DropdownMenu has Sub/SubTrigger/SubContent for nested menus and CheckboxItem/RadioGroup for selection. Unlike Select, no Value display.',
  ContextMenu:
    'ContextMenu is like DropdownMenu but triggered by right-click. Has onOpenChange but no explicit Trigger component.',
  Select:
    'Select has Value, Viewport, ScrollUpButton/ScrollDownButton components. Unlike DropdownMenu, displays selected value.',

  Checkbox:
    'Checkbox has an Indicator that shows checked state (checkmark). Unlike Switch, no sliding Thumb.',
  Switch:
    'Switch has a sliding Thumb component. Unlike Checkbox, no Indicator with checkmark.',
  Toggle:
    'Toggle has a pressed state. Unlike Checkbox/Switch, it is a button that toggles appearance.',

  RadioGroup:
    'RadioGroup has Item and Indicator components with single-value selection. Unlike ToggleGroup, no type prop.',
  ToggleGroup:
    'ToggleGroup has a type prop ("single" or "multiple") and rovingFocus. Unlike RadioGroup, can have multiple selection.',

  Tabs: 'Tabs has List, Trigger, and Content with orientation. Horizontal content switching without collapse.',
  Accordion:
    'Accordion has Item, Header, Trigger, Content with collapsible prop. Vertical stacked sections that expand/collapse.',
  Collapsible:
    'Collapsible is a single collapsible region. Unlike Accordion, only one section without Item components.',

  Menubar:
    'Menubar is a horizontal menu bar with multiple Menu components. Unlike DropdownMenu, designed for app-level menus.',
  NavigationMenu:
    'NavigationMenu has Viewport, Indicator, and Link components for navigation patterns. Unlike Menubar, focused on links.',

  Slider:
    'Slider has min/max/step with Track, Range, and Thumb. Numeric range selection, potentially multiple thumbs.',
  Progress: 'Progress has value/max with Indicator. Read-only display, no user interaction.',
};

/**
 * Get primitives that are similar to the given primitive.
 * @param primitiveName - Name of the Radix primitive
 * @returns Array of similar primitive names
 */
export function getSimilarPrimitives(primitiveName: string): string[] {
  return SIMILARITY_GROUPS[primitiveName] || [];
}

/**
 * Get the disambiguation rule for a primitive.
 * @param primitiveName - Name of the Radix primitive
 * @returns Human-readable disambiguation rule, or undefined if none
 */
export function getDisambiguationRule(primitiveName: string): string | undefined {
  return DISAMBIGUATION_RULES[primitiveName];
}

/**
 * Get all primitives in the same similarity group.
 * @param primitiveName - Name of the Radix primitive
 * @returns Array including the primitive and all similar ones
 */
export function getSimilarityGroup(primitiveName: string): string[] {
  const similar = getSimilarPrimitives(primitiveName);
  if (similar.length === 0) {
    return [primitiveName];
  }
  return [primitiveName, ...similar];
}

/**
 * Check if two primitives are in the same similarity group.
 * @param primitive1 - First primitive name
 * @param primitive2 - Second primitive name
 * @returns True if they are similar
 */
export function areSimilar(primitive1: string, primitive2: string): boolean {
  const group1 = getSimilarPrimitives(primitive1);
  return group1.includes(primitive2);
}
