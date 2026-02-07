/**
 * Main signature generator for Radix primitives.
 * Combines inference, distinguishing, and disambiguation to create BehaviorSignature.
 */

import type {
  ExtractedPrimitive,
  BehaviorSignature,
  SubComponentDefinition,
} from '../types/index.js';
import { inferStatePattern, inferCompositionPattern, inferRenderingPattern } from './inference.js';
import { getDistinguishingProps, getAntiPatternProps } from './distinguishing.js';
import { getSimilarPrimitives, getDisambiguationRule } from './disambiguation.js';

/**
 * Sub-component role type mapping for common patterns.
 */
type SubComponentRole = 'trigger' | 'content' | 'overlay' | 'item' | 'indicator' | 'other';

/**
 * Patterns for inferring sub-component roles from names.
 */
const ROLE_PATTERNS: Record<SubComponentRole, RegExp[]> = {
  trigger: [/^Trigger$/i, /Trigger$/i],
  content: [/^Content$/i, /Content$/i, /^Portal$/i],
  overlay: [/^Overlay$/i, /^Backdrop$/i],
  item: [/^Item$/i, /Item$/i, /^Option$/i],
  indicator: [/^Indicator$/i, /^Thumb$/i, /^Range$/i],
  other: [], // Default fallback
};

/**
 * Infer the role of a sub-component based on its name.
 * @param componentName - Name of the sub-component
 * @returns The inferred role
 */
function inferSubComponentRole(componentName: string): SubComponentRole {
  // Check each role's patterns in priority order
  const roleOrder: SubComponentRole[] = ['trigger', 'content', 'overlay', 'item', 'indicator'];

  for (const role of roleOrder) {
    const patterns = ROLE_PATTERNS[role];
    if (patterns.some((pattern) => pattern.test(componentName))) {
      return role;
    }
  }

  return 'other';
}

/**
 * Determine if a sub-component is required based on its name and props.
 * @param subComponent - The sub-component definition
 * @param primitiveName - The primitive name for context
 * @returns True if the component is required
 */
function isSubComponentRequired(
  subComponent: SubComponentDefinition,
  primitiveName: string
): boolean {
  const name = subComponent.name;

  // Root is always required
  if (name === 'Root') {
    return true;
  }

  // Trigger is usually required for interactive primitives
  const interactivePrimitives = [
    'Dialog',
    'AlertDialog',
    'Popover',
    'Tooltip',
    'HoverCard',
    'DropdownMenu',
    'ContextMenu',
    'Select',
    'Collapsible',
  ];
  if (name === 'Trigger' && interactivePrimitives.includes(primitiveName)) {
    return true;
  }

  // Content is usually required for compound primitives
  const contentRequiredPrimitives = [
    'Dialog',
    'AlertDialog',
    'Popover',
    'Tooltip',
    'HoverCard',
    'DropdownMenu',
    'ContextMenu',
    'Select',
    'Tabs',
    'Accordion',
    'Collapsible',
  ];
  if (name === 'Content' && contentRequiredPrimitives.includes(primitiveName)) {
    return true;
  }

  // Item is required for list-based primitives
  if (name === 'Item') {
    const itemRequiredPrimitives = ['RadioGroup', 'ToggleGroup', 'Tabs', 'Accordion'];
    return itemRequiredPrimitives.includes(primitiveName);
  }

  return false;
}

/**
 * Generate a BehaviorSignature from an ExtractedPrimitive.
 * This is the main entry point for signature generation.
 *
 * @param extracted - The extracted primitive data
 * @returns The generated behavior signature
 */
export function generateSignature(extracted: ExtractedPrimitive): BehaviorSignature {
  // Get all props from root and sub-components for pattern inference
  const allRootProps = extracted.rootProps;

  // Find the main props (from Root or primary component)
  const rootSubComponent = extracted.subComponents.find((c) => c.name === 'Root');
  const primaryProps = rootSubComponent
    ? [...allRootProps, ...rootSubComponent.props]
    : allRootProps;

  // Remove duplicates by prop name
  const uniqueProps = Array.from(new Map(primaryProps.map((p) => [p.name, p])).values());

  // Infer patterns
  const statePattern = inferStatePattern(uniqueProps);
  const compositionPattern = inferCompositionPattern(extracted.subComponents);
  const renderingPattern = inferRenderingPattern(extracted.subComponents, uniqueProps);

  // Get distinguishing characteristics
  const distinguishingProps = getDistinguishingProps(extracted.name);
  const antiPatternProps = getAntiPatternProps(extracted.name);

  // Map sub-components with roles
  const subComponents = extracted.subComponents.map((sc) => ({
    name: sc.name,
    role: inferSubComponentRole(sc.name),
    required: isSubComponentRequired(sc, extracted.name),
  }));

  // Get disambiguation info
  const similarTo = getSimilarPrimitives(extracted.name);
  const disambiguationRule = getDisambiguationRule(extracted.name);

  return {
    primitive: extracted.name,
    package: extracted.package,
    version: extracted.version,

    statePattern,
    compositionPattern,
    renderingPattern,

    distinguishingProps,
    antiPatternProps,

    subComponents,

    similarTo,
    disambiguationRule,
  };
}

/**
 * Generate signatures for multiple primitives.
 * @param extractedList - Array of extracted primitives
 * @returns Array of behavior signatures
 */
export function generateSignatures(extractedList: ExtractedPrimitive[]): BehaviorSignature[] {
  return extractedList.map(generateSignature);
}
