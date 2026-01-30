/**
 * Props diffing logic for detecting changes between contract versions.
 */

import type {
  ExtractedPrimitive,
  PropDefinition,
  SubComponentDefinition,
} from '../types/index.js';
import type { RadixChange, ChangeType } from './types.js';
import { getSeverity } from './severity.js';
import { generateHint, generateDescription } from './hints.js';

/**
 * Parse a union type string into its member types.
 * @example 'string | number' -> ['string', 'number']
 * @example '"left" | "right" | "center"' -> ['"left"', '"right"', '"center"']
 */
export function parseUnionMembers(typeString: string): string[] {
  // Handle simple cases first
  if (!typeString.includes('|')) {
    return [typeString.trim()];
  }

  // Split by | but respect nested types (generics, parentheses)
  const members: string[] = [];
  let current = '';
  let depth = 0;
  let prevChar = '';

  for (const char of typeString) {
    if (char === '<' || char === '(' || char === '{' || char === '[') {
      depth++;
      current += char;
    } else if (char === ')' || char === '}' || char === ']') {
      depth--;
      current += char;
    } else if (char === '>') {
      // Only treat '>' as a closing bracket if it's not part of '=>' (arrow function)
      if (prevChar !== '=') {
        depth--;
      }
      current += char;
    } else if (char === '|' && depth === 0) {
      if (current.trim()) {
        members.push(current.trim());
      }
      current = '';
    } else {
      current += char;
    }
    prevChar = char;
  }

  if (current.trim()) {
    members.push(current.trim());
  }

  return members;
}

/**
 * Check if a type change represents narrowing (breaking).
 * Narrowing occurs when the new type accepts fewer values than before.
 * @example 'string | number' -> 'string' is narrowing
 */
export function isNarrowing(before: string, after: string): boolean {
  const beforeMembers = parseUnionMembers(before);
  const afterMembers = parseUnionMembers(after);

  // If same members, not narrowing
  if (beforeMembers.length === afterMembers.length) {
    const beforeSet = new Set(beforeMembers);
    const afterSet = new Set(afterMembers);
    if ([...afterSet].every((m) => beforeSet.has(m))) {
      return false;
    }
  }

  // Narrowing: all after members exist in before, and fewer members
  const beforeSet = new Set(beforeMembers);
  return (
    afterMembers.every((m) => beforeSet.has(m)) &&
    afterMembers.length < beforeMembers.length
  );
}

/**
 * Check if a type change represents widening (safe/info).
 * Widening occurs when the new type accepts more values than before.
 * @example 'string' -> 'string | number' is widening
 */
export function isWidening(before: string, after: string): boolean {
  const beforeMembers = parseUnionMembers(before);
  const afterMembers = parseUnionMembers(after);

  // If same members, not widening
  if (beforeMembers.length === afterMembers.length) {
    return false;
  }

  // Widening: all before members exist in after, and more members
  const afterSet = new Set(afterMembers);
  return (
    beforeMembers.every((m) => afterSet.has(m)) &&
    afterMembers.length > beforeMembers.length
  );
}

/**
 * Normalize a type string for comparison.
 */
function normalizeType(type: string): string {
  return type
    .replace(/\s+/g, ' ')
    .replace(/\s*\|\s*/g, ' | ')
    .trim();
}

/**
 * Create a RadixChange object.
 */
function createChange(
  type: ChangeType,
  target: string,
  primitive: string,
  before: string | null,
  after: string | null,
  subComponent?: string
): RadixChange {
  const context = { target, before, after, primitive, subComponent };
  return {
    type,
    severity: getSeverity(type),
    primitive,
    subComponent,
    target,
    before,
    after,
    description: generateDescription(type, context),
    migration: generateHint(type, context),
  };
}

/**
 * Diff props between two arrays of PropDefinitions.
 */
export function diffProps(
  before: PropDefinition[],
  after: PropDefinition[],
  primitive: string,
  subComponent?: string
): RadixChange[] {
  const changes: RadixChange[] = [];

  const beforeMap = new Map(before.map((p) => [p.name, p]));
  const afterMap = new Map(after.map((p) => [p.name, p]));

  // Check for removed props
  for (const [name, beforeProp] of beforeMap) {
    if (!afterMap.has(name)) {
      changes.push(
        createChange(
          'prop_removed',
          name,
          primitive,
          beforeProp.type,
          null,
          subComponent
        )
      );
    }
  }

  // Check for added props
  for (const [name, afterProp] of afterMap) {
    if (!beforeMap.has(name)) {
      changes.push(
        createChange(
          'prop_added',
          name,
          primitive,
          null,
          afterProp.type,
          subComponent
        )
      );
    }
  }

  // Check for changed props
  for (const [name, beforeProp] of beforeMap) {
    const afterProp = afterMap.get(name);
    if (!afterProp) continue;

    // Check for required change (optional -> required is breaking)
    if (!beforeProp.required && afterProp.required) {
      changes.push(
        createChange(
          'prop_required',
          name,
          primitive,
          'optional',
          'required',
          subComponent
        )
      );
    }

    // Check for type changes
    const beforeType = normalizeType(beforeProp.type);
    const afterType = normalizeType(afterProp.type);

    if (beforeType !== afterType) {
      if (isNarrowing(beforeType, afterType)) {
        changes.push(
          createChange(
            'type_narrowed',
            name,
            primitive,
            beforeType,
            afterType,
            subComponent
          )
        );
      } else if (isWidening(beforeType, afterType)) {
        changes.push(
          createChange(
            'type_widened',
            name,
            primitive,
            beforeType,
            afterType,
            subComponent
          )
        );
      } else {
        changes.push(
          createChange(
            'type_changed',
            name,
            primitive,
            beforeType,
            afterType,
            subComponent
          )
        );
      }
    }

    // Check for default value changes
    if (
      beforeProp.defaultValue !== afterProp.defaultValue &&
      (beforeProp.defaultValue || afterProp.defaultValue)
    ) {
      changes.push(
        createChange(
          'default_changed',
          name,
          primitive,
          beforeProp.defaultValue ?? 'undefined',
          afterProp.defaultValue ?? 'undefined',
          subComponent
        )
      );
    }
  }

  return changes;
}

/**
 * Diff sub-components between two ExtractedPrimitives.
 */
export function diffSubComponents(
  before: SubComponentDefinition[],
  after: SubComponentDefinition[],
  primitive: string
): RadixChange[] {
  const changes: RadixChange[] = [];

  const beforeMap = new Map(before.map((sc) => [sc.name, sc]));
  const afterMap = new Map(after.map((sc) => [sc.name, sc]));

  // Check for removed sub-components
  for (const [name] of beforeMap) {
    if (!afterMap.has(name)) {
      changes.push(
        createChange('subcomponent_removed', name, primitive, name, null)
      );
    }
  }

  // Check for added sub-components
  for (const [name] of afterMap) {
    if (!beforeMap.has(name)) {
      changes.push(
        createChange('subcomponent_added', name, primitive, null, name)
      );
    }
  }

  // Check props within each sub-component
  for (const [name, beforeSc] of beforeMap) {
    const afterSc = afterMap.get(name);
    if (!afterSc) continue;

    const propChanges = diffProps(beforeSc.props, afterSc.props, primitive, name);
    changes.push(...propChanges);
  }

  return changes;
}

/**
 * Diff two ExtractedPrimitive objects to find all changes.
 */
export function diffContracts(
  before: ExtractedPrimitive,
  after: ExtractedPrimitive
): RadixChange[] {
  const changes: RadixChange[] = [];
  const primitive = before.name;

  // Diff root props
  const rootChanges = diffProps(before.rootProps, after.rootProps, primitive, 'Root');
  changes.push(...rootChanges);

  // Diff sub-components
  const subComponentChanges = diffSubComponents(
    before.subComponents,
    after.subComponents,
    primitive
  );
  changes.push(...subComponentChanges);

  return changes;
}
