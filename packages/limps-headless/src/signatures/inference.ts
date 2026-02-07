/**
 * Pattern inference for Radix primitives.
 * Analyzes ExtractedPrimitive data to determine behavioral patterns.
 */

import type {
  PropDefinition,
  SubComponentDefinition,
  StatePattern,
  CompositionPattern,
  RenderingPattern,
} from '../types/index.js';

/**
 * Infer the state pattern from root props.
 *
 * State patterns:
 * - binary: Has open/defaultOpen + onOpenChange (Dialog, Popover, Tooltip)
 * - single-value: Has value + onValueChange without array type (Select, RadioGroup)
 * - multi-value: Has value[] + onValueChange (ToggleGroup type="multiple")
 * - range: Has min, max, step props (Slider)
 * - text: Has value as string type + onChange (TextField patterns)
 * - none: No state control props (Separator, AspectRatio)
 */
export function inferStatePattern(props: PropDefinition[]): StatePattern {
  const propNames = new Set(props.map((p) => p.name));
  const propMap = new Map(props.map((p) => [p.name, p]));

  // Check for range pattern (Slider) - most specific first
  if (
    propNames.has('min') ||
    propNames.has('max') ||
    propNames.has('step') ||
    propNames.has('minStepsBetweenThumbs')
  ) {
    return 'range';
  }

  // Check for binary pattern (Dialog, Popover, Tooltip, etc.)
  const hasBinaryState =
    (propNames.has('open') || propNames.has('defaultOpen')) && propNames.has('onOpenChange');
  const hasCheckedState =
    (propNames.has('checked') || propNames.has('defaultChecked')) &&
    propNames.has('onCheckedChange');
  const hasPressedState =
    (propNames.has('pressed') || propNames.has('defaultPressed')) &&
    propNames.has('onPressedChange');

  if (hasBinaryState || hasCheckedState || hasPressedState) {
    return 'binary';
  }

  // Check for value patterns (Select, RadioGroup, ToggleGroup)
  if (propNames.has('value') || propNames.has('defaultValue') || propNames.has('onValueChange')) {
    const valueProp = propMap.get('value') || propMap.get('defaultValue');
    const valueType = valueProp?.type || '';

    // Multi-value: array type
    if (valueType.includes('[]') || valueType.includes('Array')) {
      return 'multi-value';
    }

    // Text: string type with typical text input patterns
    if (valueType === 'string' && (propNames.has('onChange') || propNames.has('onInput'))) {
      return 'text';
    }

    // Single-value: everything else with value
    return 'single-value';
  }

  // No state control props found
  return 'none';
}

/**
 * Infer the composition pattern from sub-components.
 *
 * Composition patterns:
 * - monolithic: Single component, no sub-components (Checkbox, Switch)
 * - compound: Root + Trigger + Content pattern, 3+ sub-components
 * - provider: Only provides context, no UI (Direction Provider)
 */
export function inferCompositionPattern(
  subComponents: SubComponentDefinition[]
): CompositionPattern {
  const componentNames = new Set(subComponents.map((c) => c.name));

  // Provider pattern: only has Provider or Root with no visual components
  const providerOnlyNames = ['Provider', 'Root'];
  const hasOnlyProviderComponents =
    subComponents.length <= 1 && subComponents.every((c) => providerOnlyNames.includes(c.name));

  // Check if it looks like a context provider (no UI components)
  if (hasOnlyProviderComponents && subComponents.length === 1) {
    const firstComponent = subComponents[0];
    // If the only component has very few props and they're all context-related
    const hasMinimalProps = firstComponent.props.length <= 3;
    const hasNoVisualProps = !firstComponent.props.some(
      (p) => p.name === 'asChild' || p.name === 'className' || p.name === 'style'
    );
    if (hasMinimalProps && hasNoVisualProps) {
      return 'provider';
    }
  }

  // Compound pattern: 3+ sub-components or has Trigger/Content pattern
  const hasCompoundPattern =
    (componentNames.has('Trigger') || componentNames.has('Content')) && subComponents.length >= 2;
  const hasMultipleComponents = subComponents.length >= 3;

  if (hasCompoundPattern || hasMultipleComponents) {
    return 'compound';
  }

  // Monolithic: single component or very few sub-components
  return 'monolithic';
}

/**
 * Infer the rendering pattern from sub-components and props.
 *
 * Rendering patterns:
 * - portal: Has Portal sub-component that's always used
 * - portal-conditional: Has Portal that only renders when open
 * - conditional: Shows/hides content based on state (Accordion)
 * - inline: Always renders in place (Checkbox, Radio)
 */
export function inferRenderingPattern(
  subComponents: SubComponentDefinition[],
  props: PropDefinition[]
): RenderingPattern {
  const componentNames = new Set(subComponents.map((c) => c.name));
  const propNames = new Set(props.map((p) => p.name));

  // Check for Portal sub-component
  const hasPortal = componentNames.has('Portal');

  // Check for overlay components (suggest portaling)
  const hasOverlay = componentNames.has('Overlay') || componentNames.has('Backdrop');

  // Check for state-dependent rendering
  const hasOpenState =
    propNames.has('open') || propNames.has('defaultOpen') || propNames.has('onOpenChange');
  const hasForceMount = [...subComponents].some((c) =>
    c.props.some((p) => p.name === 'forceMount')
  );

  // Portal pattern
  if (hasPortal) {
    // Portal-conditional: has open state (renders portal when open)
    if (hasOpenState) {
      return 'portal-conditional';
    }
    // Portal: always portals (like Toast)
    return 'portal';
  }

  // Has overlay suggests portal behavior even without explicit Portal component
  if (hasOverlay && hasOpenState) {
    return 'portal-conditional';
  }

  // Conditional pattern: has forceMount prop or open state without portal
  if (hasForceMount || hasOpenState) {
    return 'conditional';
  }

  // Default to inline
  return 'inline';
}
