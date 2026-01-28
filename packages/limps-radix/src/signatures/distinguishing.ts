/**
 * Distinguishing props for Radix primitives.
 * Knowledge base for identifying specific primitives by their unique props.
 */

/**
 * Props that distinguish this primitive from others.
 * These are props or sub-components that are characteristic of a specific primitive.
 */
const DISTINGUISHING_PROPS: Record<string, string[]> = {
  // Overlays/Modals
  Dialog: ['modal', 'Overlay'],
  AlertDialog: ['Action', 'Cancel'],
  Popover: ['side', 'align', 'sideOffset', 'alignOffset'],
  Tooltip: ['delayDuration', 'skipDelayDuration', 'disableHoverableContent'],
  HoverCard: ['openDelay', 'closeDelay'],

  // Menus
  DropdownMenu: ['Sub', 'SubTrigger', 'SubContent', 'RadioGroup', 'CheckboxItem'],
  ContextMenu: ['Sub', 'SubTrigger', 'SubContent', 'onOpenChange'],
  Menubar: ['Menu', 'Sub', 'SubTrigger', 'SubContent'],
  NavigationMenu: ['Viewport', 'Indicator', 'List', 'Link'],

  // Selection
  Select: ['Value', 'Viewport', 'ScrollUpButton', 'ScrollDownButton', 'ItemText'],
  Combobox: ['Input', 'Empty', 'Group', 'ItemIndicator'],

  // Structure
  Tabs: ['List', 'orientation'],
  Accordion: ['Item', 'Header', 'collapsible', 'type'],
  Collapsible: ['collapsible'],

  // Controls
  Slider: ['min', 'max', 'step', 'Range', 'Thumb', 'Track'],
  Switch: ['checked', 'Thumb'],
  Checkbox: ['checked', 'Indicator'],
  RadioGroup: ['Item', 'Indicator', 'orientation'],
  ToggleGroup: ['type', 'rovingFocus'],
  Toggle: ['pressed'],

  // Display
  Avatar: ['Image', 'Fallback'],
  Progress: ['value', 'max', 'Indicator'],
  AspectRatio: ['ratio'],
  Separator: ['orientation', 'decorative'],

  // Form
  Label: ['htmlFor'],
  Form: ['Field', 'Label', 'Control', 'Message', 'ValidityState'],

  // Other
  Toast: ['Provider', 'Viewport', 'Action', 'Close', 'Title', 'Description'],
  ScrollArea: ['Scrollbar', 'Thumb', 'Corner'],
  Toolbar: ['Button', 'Link', 'ToggleGroup', 'Separator'],
};

/**
 * Props that indicate this is NOT a specific primitive.
 * Useful for disambiguation when primitives have similar APIs.
 */
const ANTI_PATTERN_PROPS: Record<string, string[]> = {
  // Dialog doesn't have these (AlertDialog does)
  Dialog: ['Action', 'Cancel'],

  // AlertDialog doesn't have modal prop (Dialog does)
  AlertDialog: ['modal'],

  // Popover doesn't have delay props (Tooltip/HoverCard do)
  Popover: ['delayDuration', 'openDelay', 'closeDelay'],

  // Tooltip doesn't have openDelay/closeDelay (HoverCard does)
  Tooltip: ['openDelay', 'closeDelay'],

  // HoverCard doesn't have delayDuration (Tooltip does)
  HoverCard: ['delayDuration', 'skipDelayDuration'],

  // Select doesn't have Sub/SubTrigger (DropdownMenu does)
  Select: ['Sub', 'SubTrigger', 'SubContent', 'CheckboxItem'],

  // DropdownMenu doesn't have Value/Viewport (Select does)
  DropdownMenu: ['Value', 'Viewport', 'ScrollUpButton', 'ItemText'],

  // Checkbox doesn't have Thumb (Switch does)
  Checkbox: ['Thumb'],

  // Switch doesn't have Indicator with checkmark (Checkbox does)
  Switch: ['Indicator'],

  // RadioGroup doesn't have 'type' prop (ToggleGroup does)
  RadioGroup: ['type'],

  // ToggleGroup doesn't have 'Item' requiring 'value' selection
  ToggleGroup: [],
};

/**
 * Get the distinguishing props for a primitive.
 * @param primitiveName - Name of the Radix primitive
 * @returns Array of prop/sub-component names that distinguish this primitive
 */
export function getDistinguishingProps(primitiveName: string): string[] {
  return DISTINGUISHING_PROPS[primitiveName] || [];
}

/**
 * Get the anti-pattern props for a primitive.
 * These props indicate the component is NOT this primitive.
 * @param primitiveName - Name of the Radix primitive
 * @returns Array of prop names that indicate NOT this primitive
 */
export function getAntiPatternProps(primitiveName: string): string[] {
  return ANTI_PATTERN_PROPS[primitiveName] || [];
}

/**
 * Get all known primitive names.
 * @returns Array of all primitive names in the knowledge base
 */
export function getKnownPrimitives(): string[] {
  return Object.keys(DISTINGUISHING_PROPS);
}

/**
 * Check if a primitive name is known in the knowledge base.
 * @param primitiveName - Name to check
 * @returns True if the primitive is known
 */
export function isKnownPrimitive(primitiveName: string): boolean {
  return primitiveName in DISTINGUISHING_PROPS;
}
