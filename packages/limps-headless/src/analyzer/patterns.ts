/**
 * Pattern detection and inference for local components.
 * Detects sub-components, features (forwardRef, asChild, aria, data attributes),
 * and infers state/composition/rendering patterns.
 */

import { SyntaxKind, type SourceFile } from 'ts-morph';
import type {
  StatePattern,
  CompositionPattern,
  RenderingPattern,
  PropDefinition,
} from '../types/index.js';
import {
  inferStatePattern,
  inferCompositionPattern,
  inferRenderingPattern,
} from '../signatures/inference.js';

/**
 * Detect sub-components from a component file.
 * Handles patterns like: Modal.Root, Modal.Content, Modal.Trigger
 */
export function detectSubComponents(sourceFile: SourceFile, componentName: string): string[] {
  const subComponents: string[] = [];
  const text = sourceFile.getFullText();
  const escapedComponentName = escapeRegExp(componentName);

  // Look for property assignments: ComponentName.SubName = ...
  // Pattern: Modal.Root = function Root() { ... }
  // or: Modal.Root = () => { ... }
  const propertyAssignmentRegex = new RegExp(`${escapedComponentName}\\.(\\w+)\\s*=`, 'g');
  let match;
  while ((match = propertyAssignmentRegex.exec(text)) !== null) {
    const subName = match[1];
    if (subName && !subComponents.includes(subName)) {
      subComponents.push(subName);
    }
  }

  // Look for compound export pattern
  // export { Root, Content, Trigger } from './components'
  // or: export function Root() { ... }
  const subComponentNames = [
    'Root',
    'Trigger',
    'Content',
    'Title',
    'Description',
    'Close',
    'Overlay',
    'Portal',
    'Arrow',
    'Item',
    'Indicator',
    'Thumb',
    'Track',
    'Range',
    'Viewport',
    'Scrollbar',
    'Corner',
    'Action',
    'Cancel',
    'Group',
    'Label',
    'Separator',
    'Sub',
    'List',
    'Value',
    'Icon',
    'Image',
    'Fallback',
  ];

  // Check exported functions/variables with sub-component names
  for (const func of sourceFile.getFunctions()) {
    const funcName = func.getName();
    if (funcName && func.isExported() && subComponentNames.includes(funcName)) {
      if (!subComponents.includes(funcName)) {
        subComponents.push(funcName);
      }
    }
  }

  // Check export declarations
  for (const exportDecl of sourceFile.getExportDeclarations()) {
    for (const named of exportDecl.getNamedExports()) {
      const exportName = named.getName();
      if (subComponentNames.includes(exportName)) {
        if (!subComponents.includes(exportName)) {
          subComponents.push(exportName);
        }
      }
    }
  }

  return subComponents;
}

/**
 * Detect if component uses forwardRef.
 */
export function detectForwardRef(sourceFile: SourceFile): boolean {
  const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

  for (const call of callExpressions) {
    const expression = call.getExpression();
    if (expression.getKind() === SyntaxKind.Identifier && expression.getText() === 'forwardRef') {
      return true;
    }

    if (expression.getKind() === SyntaxKind.PropertyAccessExpression) {
      const property = expression.asKindOrThrow(SyntaxKind.PropertyAccessExpression);
      if (property.getName() === 'forwardRef' && property.getExpression().getText() === 'React') {
        return true;
      }
    }
  }

  const typeReferences = sourceFile.getDescendantsOfKind(SyntaxKind.TypeReference);
  for (const typeRef of typeReferences) {
    const typeName = typeRef.getTypeName().getText();
    if (
      typeName === 'ForwardRefExoticComponent' ||
      typeName.endsWith('.ForwardRefExoticComponent')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Detect if component has asChild prop.
 */
export function detectAsChild(sourceFile: SourceFile, props: Map<string, PropDefinition>): boolean {
  if (props.has('asChild')) {
    return true;
  }

  const jsxAttributes = sourceFile.getDescendantsOfKind(SyntaxKind.JsxAttribute);
  for (const attr of jsxAttributes) {
    const name = attr.getNameNode().getText();
    if (name === 'asChild' || name === 'as-child') {
      return true;
    }
  }

  return false;
}

/**
 * Detect aria roles from JSX.
 */
export function detectAriaRoles(sourceFile: SourceFile): string[] {
  const roles: string[] = [];
  const text = sourceFile.getFullText();

  // Match role="..." patterns
  const roleMatches = text.matchAll(/role=["']([^"']+)["']/g);
  for (const match of roleMatches) {
    const role = match[1];
    if (role && !roles.includes(role)) {
      roles.push(role);
    }
  }

  // Also check for aria-* attributes that imply roles
  const ariaMatches = text.matchAll(/aria-(\w+)=["'][^"']*["']/g);
  for (const match of ariaMatches) {
    const ariaAttr = match[1];
    // Some aria attributes imply roles
    if (ariaAttr === 'label' || ariaAttr === 'labelledby') {
      if (!roles.includes('label')) {
        roles.push('label');
      }
    }
  }

  return roles;
}

/**
 * Detect data attributes from JSX.
 */
export function detectDataAttributes(sourceFile: SourceFile): string[] {
  const attributes: string[] = [];
  const text = sourceFile.getFullText();

  // Match data-* attributes
  const dataMatches = text.matchAll(/data-(\w+(?:-\w+)*)=["'][^"']*["']/g);
  for (const match of dataMatches) {
    const attr = `data-${match[1]}`;
    if (!attributes.includes(attr)) {
      attributes.push(attr);
    }
  }

  return attributes;
}

/**
 * Infer state pattern from props.
 */
export function inferStatePatternFromProps(props: Map<string, PropDefinition>): StatePattern {
  const propsArray = Array.from(props.values());
  return inferStatePattern(propsArray);
}

/**
 * Infer composition pattern from sub-components.
 * For local components, we need to convert sub-component names to SubComponentDefinition format.
 */
export function inferCompositionPatternFromSubComponents(
  subComponents: string[]
): CompositionPattern {
  // Convert string array to SubComponentDefinition format
  const subComponentDefs = subComponents.map((name) => ({
    name,
    props: [],
    isRequired: false,
  }));

  return inferCompositionPattern(subComponentDefs);
}

/**
 * Infer rendering pattern from sub-components and props.
 */
export function inferRenderingPatternFromAnalysis(
  subComponents: string[],
  props: Map<string, PropDefinition>
): RenderingPattern {
  // Convert to SubComponentDefinition format
  const subComponentDefs = subComponents.map((name) => ({
    name,
    props: [],
    isRequired: false,
  }));

  const propsArray = Array.from(props.values());
  return inferRenderingPattern(subComponentDefs, propsArray);
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
