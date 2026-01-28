/**
 * Property extraction from TypeScript interfaces.
 */

import type { InterfaceDeclaration, PropertySignature, Type } from 'ts-morph';
import type { RawProp } from '../types/index.js';
import { extractJsDoc } from './jsdoc.js';

/**
 * Extract props from an interface declaration.
 */
export function extractPropsFromInterface(
  iface: InterfaceDeclaration
): RawProp[] {
  const props: RawProp[] = [];

  // Get own properties
  for (const prop of iface.getProperties()) {
    props.push(extractProp(prop));
  }

  // Handle extended interfaces
  for (const base of iface.getBaseDeclarations()) {
    if (base.getKindName() === 'InterfaceDeclaration') {
      const baseInterface = base as InterfaceDeclaration;
      const baseProps = extractPropsFromInterface(baseInterface);

      // Add props that aren't already defined (don't override)
      for (const baseProp of baseProps) {
        if (!props.some((p) => p.name === baseProp.name)) {
          props.push(baseProp);
        }
      }
    }
  }

  return props;
}

/**
 * Extract a single prop from a property signature.
 */
export function extractProp(prop: PropertySignature): RawProp {
  const name = prop.getName();
  const type = getTypeText(prop.getType());
  const required = !prop.hasQuestionToken();
  const jsDoc = extractJsDoc(prop);

  return {
    name,
    type,
    required,
    defaultValue: jsDoc.defaultValue,
    description: jsDoc.description,
  };
}

/**
 * Get a clean type text representation.
 */
function getTypeText(type: Type): string {
  let text = type.getText();

  // Simplify React types
  text = text
    .replace(/React\.ReactNode/g, 'ReactNode')
    .replace(/React\.ReactElement/g, 'ReactElement')
    .replace(/React\.CSSProperties/g, 'CSSProperties')
    .replace(/React\.HTMLAttributes<.*?>/g, 'HTMLAttributes')
    .replace(/React\.ComponentPropsWithoutRef<.*?>/g, 'ComponentProps')
    .replace(/import\(".*?"\)\./g, '');

  // Truncate very long types
  if (text.length > 200) {
    text = text.slice(0, 200) + '...';
  }

  return text;
}

/**
 * Check if an interface name matches the props pattern.
 * @example "DialogProps" -> true, "DialogState" -> false
 */
export function isPropsInterface(name: string): boolean {
  return name.endsWith('Props');
}

/**
 * Extract the component name from a props interface name.
 * @example "DialogContentProps" -> "DialogContent"
 */
export function componentNameFromProps(propsName: string): string {
  return propsName.replace(/Props$/, '');
}
