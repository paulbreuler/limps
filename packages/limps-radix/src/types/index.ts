/**
 * Type definitions for limps-radix extension.
 */

/**
 * Raw extraction from Radix .d.ts files
 */
export interface ExtractedPrimitive {
  name: string; // "Dialog", "Popover"
  package: string; // "@radix-ui/react-dialog"
  version: string; // "1.0.5"
  extractedAt: string; // ISO timestamp

  rootProps: PropDefinition[];
  subComponents: SubComponentDefinition[];
  exports: string[]; // What's actually exported

  usesContext: boolean;
  contextShape?: PropDefinition[];
}

export interface SubComponentDefinition {
  name: string; // "Root", "Trigger", "Content"
  props: PropDefinition[];
  isRequired: boolean; // Must have Root? Must have Content?
}

export interface PropDefinition {
  name: string;
  type: string; // TypeScript type as string
  required: boolean;
  defaultValue?: string; // From JSDoc @default
  description?: string; // From JSDoc comment

  // Semantic classification
  isStateControl: boolean; // open, value, checked, pressed
  isEventHandler: boolean; // onOpenChange, onValueChange
  isConfiguration: boolean; // modal, orientation, side, align
  isComposition: boolean; // asChild, children
}

/**
 * Raw prop before classification
 */
export interface RawProp {
  name: string;
  type: string;
  required: boolean;
  defaultValue?: string;
  description?: string;
}

/**
 * Semantic behavioral contract - what we compare components against
 */
export interface BehaviorSignature {
  primitive: string;
  package: string;
  version: string;

  // Behavioral patterns
  statePattern: StatePattern;
  compositionPattern: CompositionPattern;
  renderingPattern: RenderingPattern;

  // Distinguishing characteristics
  distinguishingProps: string[]; // Props that identify this primitive
  antiPatternProps: string[]; // Props that indicate NOT this primitive

  // Sub-component structure
  subComponents: {
    name: string;
    role: 'trigger' | 'content' | 'overlay' | 'item' | 'indicator' | 'other';
    required: boolean;
  }[];

  // For disambiguation
  similarTo: string[]; // ["Popover", "HoverCard"]
  disambiguationRule?: string; // Human-readable rule
}

export type StatePattern =
  | 'binary' // open/closed (Dialog, Popover, Tooltip)
  | 'single-value' // one selected (Select, RadioGroup)
  | 'multi-value' // multiple selected (Checkbox group, ToggleGroup)
  | 'range' // numeric range (Slider)
  | 'text' // string input (forms)
  | 'none'; // stateless (Separator, AspectRatio)

export type CompositionPattern =
  | 'monolithic' // Single component (Checkbox, Switch)
  | 'compound' // Root + Trigger + Content pattern
  | 'provider'; // Context provider only

export type RenderingPattern =
  | 'inline' // Renders in place
  | 'portal' // Always portals (Tooltip, Toast)
  | 'conditional' // Conditionally shows (Accordion items)
  | 'portal-conditional'; // Portals when open (Dialog, Popover)

/**
 * Package info from npm registry
 */
export interface PackageInfo {
  name: string;
  version: string;
  distTags: Record<string, string>;
}

/**
 * Primitive info for listing
 */
export interface PrimitiveInfo {
  name: string;
  package: string;
  description?: string;
}
